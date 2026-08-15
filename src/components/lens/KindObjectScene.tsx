"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { kindObjectSpec } from "@/lib/lens/kind-object";

/**
 * Procedural three.js kind-object with slow Y-axis spin.
 * Dispose fully on unmount; caller should fall back to KindPoster on error.
 */
export function KindObjectScene({
  kind,
  title,
  thumbUrl,
  onFailure,
}: {
  kind: string;
  title: string;
  thumbUrl?: string | null;
  onFailure?: () => void;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let raf = 0;
    const spec = kindObjectSpec(kind);

    const w = Math.max(120, mount.clientWidth || 320);
    const h = Math.max(120, mount.clientHeight || 320);

    try {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0a0f1a);

      const camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 100);
      camera.position.set(0, 0.35, 3.2);

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "low-power",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(w, h, false);
      mount.appendChild(renderer.domElement);

      const key = new THREE.DirectionalLight(0xb8d4ff, 1.1);
      key.position.set(2, 3, 4);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0x6ee7ff, 0.45);
      rim.position.set(-2, 1, -2);
      scene.add(rim);
      scene.add(new THREE.AmbientLight(0x445566, 0.55));

      const group = new THREE.Group();
      scene.add(group);

      const mats: THREE.Material[] = [];
      const geos: THREE.BufferGeometry[] = [];
      const textures: THREE.Texture[] = [];

      function trackMat(m: THREE.Material) {
        mats.push(m);
        return m;
      }
      function trackGeo(g: THREE.BufferGeometry) {
        geos.push(g);
        return g;
      }

      const shell = trackMat(
        new THREE.MeshStandardMaterial({
          color: shellColor(spec.metaphor),
          metalness: 0.25,
          roughness: 0.55,
        }),
      );

      // Body by metaphor (simple primitives)
      let body: THREE.Mesh;
      switch (spec.metaphor) {
        case "vhs":
          body = new THREE.Mesh(
            trackGeo(new THREE.BoxGeometry(1.6, 0.95, 0.28)),
            shell,
          );
          break;
        case "cassette":
          body = new THREE.Mesh(
            trackGeo(new THREE.BoxGeometry(1.4, 0.9, 0.22)),
            shell,
          );
          break;
        case "paper":
          body = new THREE.Mesh(
            trackGeo(new THREE.BoxGeometry(1.1, 1.4, 0.04)),
            trackMat(
              new THREE.MeshStandardMaterial({
                color: 0xf5f0e6,
                roughness: 0.9,
              }),
            ),
          );
          break;
        case "paper_stack": {
          body = new THREE.Mesh(
            trackGeo(new THREE.BoxGeometry(1.15, 1.35, 0.18)),
            trackMat(
              new THREE.MeshStandardMaterial({
                color: 0xe8e2d6,
                roughness: 0.85,
              }),
            ),
          );
          break;
        }
        case "photo_print":
          body = new THREE.Mesh(
            trackGeo(new THREE.BoxGeometry(1.2, 1.5, 0.06)),
            trackMat(
              new THREE.MeshStandardMaterial({
                color: 0x222222,
                roughness: 0.7,
              }),
            ),
          );
          break;
        case "floppy":
          body = new THREE.Mesh(
            trackGeo(new THREE.BoxGeometry(1.15, 1.15, 0.12)),
            shell,
          );
          break;
        default:
          body = new THREE.Mesh(
            trackGeo(new THREE.BoxGeometry(1.3, 0.9, 1.0)),
            shell,
          );
      }
      group.add(body);

      // Label plane
      const labelCanvas = document.createElement("canvas");
      labelCanvas.width = 512;
      labelCanvas.height = 256;
      const lctx = labelCanvas.getContext("2d");
      if (lctx) {
        lctx.fillStyle = "#1a2438";
        lctx.fillRect(0, 0, 512, 256);
        lctx.fillStyle = "#e8eef8";
        lctx.font = "600 28px system-ui, sans-serif";
        const t =
          title.length > 36 ? `${title.slice(0, 35)}…` : title;
        lctx.fillText(t, 24, 80);
        lctx.fillStyle = "#7aa2c8";
        lctx.font = "18px system-ui, sans-serif";
        lctx.fillText(spec.label, 24, 120);
      }
      const labelTex = new THREE.CanvasTexture(labelCanvas);
      textures.push(labelTex);
      const labelMat = trackMat(
        new THREE.MeshStandardMaterial({
          map: labelTex,
          roughness: 0.8,
        }),
      );
      const label = new THREE.Mesh(
        trackGeo(new THREE.PlaneGeometry(1.2, 0.6)),
        labelMat,
      );
      label.position.set(0, 0.05, 0.16);
      group.add(label);

      // Optional thumb on face
      if (thumbUrl && (spec.preferThumb || spec.metaphor === "photo_print")) {
        const loader = new THREE.TextureLoader();
        loader.load(
          thumbUrl,
          (tex) => {
            if (disposed) {
              tex.dispose();
              return;
            }
            textures.push(tex);
            const face = new THREE.Mesh(
              trackGeo(new THREE.PlaneGeometry(1.05, 0.7)),
              trackMat(
                new THREE.MeshStandardMaterial({
                  map: tex,
                  roughness: 0.75,
                }),
              ),
            );
            face.position.set(0, 0.12, 0.17);
            group.add(face);
          },
          undefined,
          () => {
            // ignore load fail
          },
        );
      }

      const onLost = () => {
        onFailure?.();
      };
      renderer.domElement.addEventListener("webglcontextlost", onLost, false);

      const ro = new ResizeObserver(() => {
        if (disposed || !mount) return;
        const nw = Math.max(120, mount.clientWidth);
        const nh = Math.max(120, mount.clientHeight);
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh, false);
      });
      ro.observe(mount);

      const spin = 0.22;
      const tick = () => {
        if (disposed) return;
        if (document.visibilityState !== "hidden") {
          group.rotation.y += spin * 0.016;
          renderer.render(scene, camera);
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      return () => {
        disposed = true;
        cancelAnimationFrame(raf);
        ro.disconnect();
        renderer.domElement.removeEventListener("webglcontextlost", onLost);
        for (const t of textures) t.dispose();
        for (const g of geos) g.dispose();
        for (const m of mats) m.dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode === mount) {
          mount.removeChild(renderer.domElement);
        }
      };
    } catch {
      onFailure?.();
      return undefined;
    }
  }, [kind, title, thumbUrl, onFailure]);

  return (
    <div
      ref={mountRef}
      className="aspect-square w-full max-h-[min(22rem,50vh)] overflow-hidden rounded-xl border border-[var(--line)] bg-[#0a0f1a]"
      aria-hidden
    />
  );
}

function shellColor(metaphor: string): number {
  switch (metaphor) {
    case "vhs":
      return 0x1a2438;
    case "cassette":
      return 0x2a3548;
    case "floppy":
      return 0x1e3a5f;
    case "crate":
      return 0x4a3828;
    case "crate_muted":
      return 0x3a3a40;
    default:
      return 0x2a3040;
  }
}
