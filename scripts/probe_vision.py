#!/usr/bin/env python3
"""Probe xAI vision on one image under this repo (or an optional argv path)."""
import os, sys, base64, json, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
env_path = ROOT / ".env.local"
if env_path.exists():
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

key = os.environ.get("XAI_API_KEY")
print("key_present", bool(key))
model = os.environ.get("NON_OS_MODEL", "grok-4.3")
print("model", model)

if len(sys.argv) > 1:
    img = Path(sys.argv[1]).expanduser().resolve()
else:
    img = ROOT / "archive" / "images" / "pfp.jpg"

if not img.is_file():
    print("missing image:", img)
    print("Pass an image path as argv, or place a default at archive/images/pfp.jpg")
    raise SystemExit(1)

raw = img.read_bytes()
print("img", img.name, "bytes", len(raw))
b64 = base64.b64encode(raw).decode()
mime = "image/jpeg"
prompt = 'Return ONLY compact JSON: {"caption": string, "tags": string[5-12]}. Tags lowercase content-based. No markdown.'
body = {
  "model": model,
  "input": [{
    "role": "user",
    "content": [
      {"type": "input_image", "image_url": f"data:{mime};base64,{b64}", "detail": "low"},
      {"type": "input_text", "text": prompt}
    ]
  }]
}
req = urllib.request.Request(
  "https://api.x.ai/v1/responses",
  data=json.dumps(body).encode(),
  headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
  method="POST"
)
try:
    with urllib.request.urlopen(req, timeout=180) as r:
        data = json.loads(r.read().decode())
    print(json.dumps(data, indent=2)[:4000])
except Exception as e:
    err = e.read().decode() if hasattr(e, "read") else str(e)
    print("ERR", type(e).__name__, err[:2000])
