#!/usr/bin/env python3
"""Vision-tag Helix Library images via xAI Grok image understanding."""
from __future__ import annotations

import base64
import json
import os
import re
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from io import BytesIO
from pathlib import Path

ROOT = Path("/home/brandon/Projects/non-os")
DB = ROOT / "data" / "library.db"
ENV = ROOT / ".env.local"
STATE = ROOT / "data" / "vision-tag-state.json"
MARKER = "vision-tagged"
MAX_EDGE = 1280
MAX_BYTES = 3_500_000
SLEEP_S = 0.35

def load_env() -> None:
    if not ENV.exists():
        return
    for line in ENV.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

def ensure_tag(conn: sqlite3.Connection, name: str) -> int:
    n = name.strip().lower()
    if not n:
        raise ValueError("empty tag")
    n = re.sub(r"\s+", " ", n)
    if len(n) > 48:
        n = n[:48].rstrip()
    row = conn.execute("SELECT id FROM tags WHERE name = ?", (n,)).fetchone()
    if row:
        return int(row["id"])
    cur = conn.execute(
        "INSERT INTO tags(name, created_at) VALUES (?, ?)",
        (n, int(time.time() * 1000)),
    )
    return int(cur.lastrowid)

def attach_tag(conn: sqlite3.Connection, item_id: int, tag_name: str) -> None:
    tag_id = ensure_tag(conn, tag_name)
    # Provenance: vision (do not demote a better source if row exists)
    conn.execute(
        """
        INSERT INTO item_tags(tag_id, item_id, source) VALUES (?, ?, 'vision')
        ON CONFLICT(tag_id, item_id) DO NOTHING
        """,
        (tag_id, item_id),
    )

def set_caption(conn: sqlite3.Connection, item_id: int, caption: str) -> None:
    body = caption.strip()
    if not body:
        return
    now = int(time.time() * 1000)
    existing = conn.execute(
        "SELECT body FROM item_text WHERE item_id = ?", (item_id,)
    ).fetchone()
    if existing:
        old = existing["body"] or ""
        without = re.sub(r"(?ms)^\[vision-caption\]\n.*?(?=\n\[|\Z)", "", old).strip()
        body = (without + "\n\n[vision-caption]\n" + body).strip() if without else "[vision-caption]\n" + body
        conn.execute(
            "UPDATE item_text SET body = ?, extracted_at = ? WHERE item_id = ?",
            (body, now, item_id),
        )
    else:
        body = "[vision-caption]\n" + body
        conn.execute(
            "INSERT INTO item_text(item_id, body, extracted_at) VALUES (?, ?, ?)",
            (item_id, body, now),
        )
    # best-effort FTS refresh
    try:
        conn.execute("INSERT INTO item_body_fts(item_body_fts, rowid, body) VALUES('delete', ?, ?)", (item_id, ""))
    except sqlite3.Error:
        pass
    try:
        conn.execute("INSERT INTO item_body_fts(rowid, body) VALUES (?, ?)", (item_id, body))
    except sqlite3.Error:
        pass

def prepare_image(path: Path) -> tuple[bytes, str]:
    data = path.read_bytes()
    suffix = path.suffix.lower()
    try:
        from PIL import Image
        im = Image.open(BytesIO(data))
        im = im.convert("RGB")
        w, h = im.size
        scale = min(1.0, MAX_EDGE / max(w, h))
        if scale < 1.0:
            im = im.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.Resampling.LANCZOS)
        quality = 85
        while True:
            buf = BytesIO()
            im.save(buf, format="JPEG", quality=quality, optimize=True)
            out = buf.getvalue()
            if len(out) <= MAX_BYTES or quality <= 45:
                return out, "image/jpeg"
            quality -= 10
    except Exception:
        pass
    if suffix in {".jpg", ".jpeg"} and len(data) <= MAX_BYTES:
        return data, "image/jpeg"
    if suffix == ".png" and len(data) <= MAX_BYTES:
        return data, "image/png"
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
        out_path = Path(tmp.name)
    try:
        subprocess.run([
            "ffmpeg", "-y", "-i", str(path),
            "-vf", f"scale='min({MAX_EDGE},iw)':'min({MAX_EDGE},ih)':force_original_aspect_ratio=decrease",
            "-q:v", "4", str(out_path),
        ], check=True, capture_output=True, timeout=60)
        return out_path.read_bytes(), "image/jpeg"
    finally:
        try:
            out_path.unlink(missing_ok=True)
        except Exception:
            pass

def extract_output_text(data: dict) -> str:
    chunks = []
    for item in data.get("output") or []:
        if item.get("type") != "message":
            continue
        for c in item.get("content") or []:
            if c.get("type") in {"output_text", "text"} and c.get("text"):
                chunks.append(c["text"])
    if not chunks and isinstance(data.get("output_text"), str):
        chunks.append(data["output_text"])
    return "\n".join(chunks).strip()

def parse_json_payload(text: str) -> dict:
    t = text.strip()
    if t.startswith("```"):
        t = re.sub(r"^```(?:json)?\n?", "", t)
        t = re.sub(r"\n?```$", "", t)
    m = re.search(r"\{[\s\S]*\}", t)
    if not m:
        raise ValueError(f"no json in model output: {text[:200]!r}")
    obj = json.loads(m.group(0))
    caption = str(obj.get("caption") or "").strip()
    tags = obj.get("tags") or []
    if not isinstance(tags, list):
        tags = []
    clean_tags = []
    for tag in tags:
        if not isinstance(tag, str):
            continue
        n = tag.strip().lower()
        n = re.sub(r"[_/]+", " ", n)
        n = re.sub(r"\s+", " ", n).strip(" #,.")
        if not n or n == MARKER:
            continue
        if len(n) > 48:
            n = n[:48].rstrip()
        clean_tags.append(n)
    seen = set()
    out_tags = []
    for tname in clean_tags:
        if tname in seen:
            continue
        seen.add(tname)
        out_tags.append(tname)
    if not caption and not out_tags:
        raise ValueError(f"empty vision result: {text[:200]!r}")
    return {"caption": caption, "tags": out_tags[:12]}

def call_vision(model: str, key: str, image_bytes: bytes, mime: str) -> dict:
    prompt = (
        "Analyze the image content. Return ONLY compact JSON with keys: "
        "caption (one sentence), tags (array of 5-12 lowercase content tags). "
        "Tags should describe subjects, objects, animals, people, scene, setting, style, mood. "
        "Use multi-word tags with spaces when needed. No filenames, no markdown, no extra keys."
    )
    b64 = base64.b64encode(image_bytes).decode()
    body = {
        "model": model,
        "input": [{
            "role": "user",
            "content": [
                {"type": "input_image", "image_url": f"data:{mime};base64,{b64}", "detail": "low"},
                {"type": "input_text", "text": prompt},
            ],
        }],
    }
    req = urllib.request.Request(
        "https://api.x.ai/v1/responses",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        data = json.loads(resp.read().decode())
    return parse_json_payload(extract_output_text(data))

def list_targets(conn: sqlite3.Connection, limit: int | None):
    sql = """
    SELECT i.id, i.name, i.path, i.ext
    FROM items i
    WHERE i.kind = 'image' AND i.is_missing = 0
      AND NOT EXISTS (
        SELECT 1 FROM item_tags it
        JOIN tags t ON t.id = it.tag_id
        WHERE it.item_id = i.id AND t.name = ?
      )
    ORDER BY i.id ASC
    """
    if limit:
        sql += f" LIMIT {int(limit)}"
    return list(conn.execute(sql, (MARKER,)))

def main() -> int:
    load_env()
    key = os.environ.get("XAI_API_KEY")
    if not key:
        print("XAI_API_KEY missing", file=sys.stderr)
        return 2
    model = os.environ.get("NON_OS_MODEL", "grok-4.3")
    limit = None
    dry = False
    args = sys.argv[1:]
    i = 0
    while i < len(args):
        if args[i] == "--limit" and i + 1 < len(args):
            limit = int(args[i + 1]); i += 2
        elif args[i] == "--dry-run":
            dry = True; i += 1
        else:
            print("unknown arg", args[i]); return 2
    conn = get_conn()
    targets = list_targets(conn, limit)
    print(json.dumps({"model": model, "targets": len(targets), "dry": dry}, indent=2), flush=True)
    ok = fail = 0
    results = []
    for row in targets:
        item_id = int(row["id"])
        path = Path(row["path"])
        name = row["name"]
        print(f"[{item_id}] {name} ...", flush=True)
        try:
            if not path.is_file():
                raise FileNotFoundError(str(path))
            img_bytes, mime = prepare_image(path)
            # skip absurdly tiny images (API requires >= 8x8)
            tiny = False
            try:
                from PIL import Image
                from io import BytesIO as _B
                _im = Image.open(_B(img_bytes))
                if min(_im.size) < 8:
                    tiny = True
            except Exception:
                pass
            if tiny:
                caption = "Image too small for vision analysis."
                tags = ["too small", "unreadable"]
                result = {"caption": caption, "tags": tags}
            else:
                result = call_vision(model, key, img_bytes, mime)
                caption = result["caption"]
                tags = result["tags"]
            if dry:
                print("  DRY", caption, tags, flush=True)
            else:
                for t in tags:
                    attach_tag(conn, item_id, t)
                attach_tag(conn, item_id, MARKER)
                if caption:
                    set_caption(conn, item_id, caption)
                conn.commit()
                print("  OK", caption[:120], tags, flush=True)
            ok += 1
            results.append({"id": item_id, "name": name, "caption": caption, "tags": tags})
        except Exception as e:
            fail += 1
            msg = str(e)
            if isinstance(e, urllib.error.HTTPError):
                try:
                    msg = e.read().decode()[:500]
                except Exception:
                    pass
            print("  FAIL", type(e).__name__, msg[:300], flush=True)
            results.append({"id": item_id, "name": name, "error": msg[:300]})
            conn.rollback()
        time.sleep(SLEEP_S)
    STATE.write_text(json.dumps({"ok": ok, "fail": fail, "results": results}, indent=2))
    print(json.dumps({"ok": ok, "fail": fail, "state": str(STATE)}, indent=2), flush=True)
    return 0 if fail == 0 else 1

if __name__ == "__main__":
    raise SystemExit(main())
