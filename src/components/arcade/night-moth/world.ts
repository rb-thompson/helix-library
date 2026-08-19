/**
 * Cave interior + ridge dressing. Garden owns the height field;
 * this fills the hollow so the mountain is a place, not a hole.
 */

import * as THREE from "three";
import { CAVES, heightAt } from "@/lib/arcade/night-moth";
import { geo, mat, type Track } from "./voxels";

export function buildWorldExtras(track: Track): THREE.Group {
  const group = new THREE.Group();
  const stone = mat(
    track,
    new THREE.MeshStandardMaterial({ color: 0x2a221c, roughness: 0.92, metalness: 0.06 }),
  );
  const dark = mat(
    track,
    new THREE.MeshStandardMaterial({ color: 0x161210, roughness: 0.95 }),
  );
  const ember = mat(
    track,
    new THREE.MeshStandardMaterial({
      color: 0x4a2010,
      emissive: 0xff3a1a,
      emissiveIntensity: 0.35,
      roughness: 0.6,
    }),
  );

  for (const cave of CAVES) {
    const [ax, az] = cave.mouth;
    const [bx, bz] = cave.end;
    const yaw = Math.atan2(bx - ax, bz - az);
    const len = Math.hypot(bx - ax, bz - az);

    const floor = new THREE.Mesh(geo(track, new THREE.BoxGeometry(cave.half * 2.1, 0.28, len + 2)), stone);
    floor.position.set((ax + bx) / 2, cave.floor, (az + bz) / 2);
    floor.rotation.y = yaw;
    group.add(floor);

    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(
        geo(track, new THREE.BoxGeometry(0.55, cave.ceiling - cave.floor, len + 1.4)),
        dark,
      );
      const ox = Math.cos(yaw) * cave.half * side;
      const oz = -Math.sin(yaw) * cave.half * side;
      wall.position.set((ax + bx) / 2 + ox, (cave.floor + cave.ceiling) * 0.5, (az + bz) / 2 + oz);
      wall.rotation.y = yaw;
      group.add(wall);
    }

    const roof = new THREE.Mesh(
      geo(track, new THREE.BoxGeometry(cave.half * 2.2, 0.4, len + 2)),
      dark,
    );
    roof.position.set((ax + bx) / 2, cave.ceiling, (az + bz) / 2);
    roof.rotation.y = yaw;
    group.add(roof);

    const chamber = new THREE.Mesh(
      geo(track, new THREE.CylinderGeometry(cave.chamberR, cave.chamberR + 0.6, 0.3, 14)),
      stone,
    );
    chamber.position.set(bx, cave.floor, bz);
    group.add(chamber);

    const cap = new THREE.Mesh(
      geo(track, new THREE.SphereGeometry(cave.chamberR + 0.4, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5)),
      dark,
    );
    cap.position.set(bx, cave.floor + 0.2, bz);
    group.add(cap);

    const glow = new THREE.Mesh(geo(track, new THREE.BoxGeometry(1.6, 0.8, 1.2)), ember);
    glow.position.set(bx + 1.4, cave.floor + 0.6, bz - 1.1);
    group.add(glow);

    const lintel = new THREE.Mesh(geo(track, new THREE.BoxGeometry(cave.half * 2.4, 0.5, 0.7)), stone);
    lintel.position.set(ax, heightAt(ax, az) + 2.6, az);
    lintel.rotation.y = yaw;
    group.add(lintel);
  }

  return group;
}
