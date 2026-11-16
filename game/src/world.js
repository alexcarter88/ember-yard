// Ember Yard: a 40 x 40 m industrial yard with two ember sites, three lanes and cover.
// Attackers spawn south (z = +16); Site A sits north-west, Site B north-east, mid runs
// down the centre. Every box is a collider for movement and a surface a bullet stops on.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const SITES = {
  A: { name: 'A', position: new THREE.Vector3(-13, 0, -14) },
  B: { name: 'B', position: new THREE.Vector3(13, 0, -14) },
};
export const ATTACK_SPAWN = new THREE.Vector3(0, 0, 16);
export const DEFEND_SPAWNS = [
  new THREE.Vector3(-13, 0, -10),
  new THREE.Vector3(13, 0, -10),
  new THREE.Vector3(0, 0, -12),
];
export const ALLY_SPAWNS = [
  new THREE.Vector3(-2.5, 0, 16),
  new THREE.Vector3(2.5, 0, 16),
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Floor and perimeter: 40 x 40 m, 5 m walls, open sky so one key light reaches everywhere.
  box(40.4, 0.4, 40.4, 0, -0.2, 0, 'canvas');
  box(0.4, 5, 40.4, -20.2, 2.5, 0, 'surface');
  box(0.4, 5, 40.4, 20.2, 2.5, 0, 'surface');
  box(40.4, 5, 0.4, 0, 2.5, -20.2, 'surface');
  box(40.4, 5, 0.4, 0, 2.5, 20.2, 'surface');

  // Mid wall with two gaps: the centre lane is fast, the gaps are the duels.
  box(4, 4.4, 1, -8, 2.2, 0, 'surface');
  box(4, 4.4, 1, 8, 2.2, 0, 'surface');
  box(1.4, 2.2, 1, 0, 1.1, 0, 'hairline');

  // A-long: west lane, a long sightline from spawn to Site A.
  box(1, 3.4, 6, -14, 1.7, 6, 'surface');
  box(1, 3.4, 6, -14, 1.7, -6, 'surface');
  box(3.2, 1.1, 1.2, -10, 0.55, 8, 'hairline');
  box(1.2, 1.1, 3.2, -17, 0.55, -2, 'hairline');

  // B-short: east lane, broken by a crate wall.
  box(1, 3.4, 6, 14, 1.7, 6, 'surface');
  box(1, 3.4, 6, 14, 1.7, -6, 'surface');
  box(3.2, 1.1, 1.2, 10, 0.55, 8, 'hairline');
  box(1.6, 0.7, 1.6, 17, 0.35, -2, 'hairline');

  // Site A cover: two crates and a low wall to plant behind.
  box(1.6, 1.1, 1.6, -15.5, 0.55, -11.5, 'hairline');
  box(1.6, 1.1, 1.6, -10.5, 0.55, -16.5, 'hairline');
  box(3.4, 1.0, 0.8, -13, 0.5, -17.5, 'hairline');

  // Site B cover: a crate stack and a corner wall.
  box(1.6, 1.1, 1.6, 15.5, 0.55, -11.5, 'hairline');
  box(1.6, 2.2, 1.6, 10.5, 1.1, -16.5, 'hairline');
  box(0.8, 1.0, 3.4, 17.5, 0.5, -13, 'hairline');

  // Mid platform: a raised slab with a ramp of crates, the map's high ground.
  box(6, 0.5, 4, 0, 0.25, -6, 'surface');
  box(2, 0.5, 2, -4, 0.25, -6, 'hairline');
  box(2, 0.5, 2, 4, 0.25, -6, 'hairline');

  // Spawn cover: two low walls so the buy phase is not a firing line.
  box(2.4, 0.9, 1.2, -4, 0.45, 13, 'hairline');
  box(2.4, 0.9, 1.2, 4, 0.45, 13, 'hairline');

  // Site markers: glowing pads the ember is planted on. They are not colliders.
  const siteMeshes = {};
  for (const key of Object.keys(SITES)) {
    const site = SITES[key];
    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(1.6, 32),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(site.position.x, 0.02, site.position.z);
    group.add(pad);
    siteMeshes[key] = pad;
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 2.6, 0.3),
      materials.accent,
    );
    post.position.set(site.position.x + 2.2, 1.3, site.position.z);
    group.add(post);
  }

  // Light: a warm key from the south-east, a cool fill from the north-west, sky gradient.
  const sky = new THREE.HemisphereLight(new THREE.Color(PALETTE.surface), new THREE.Color(PALETTE.canvas), 1.6);
  scene.add(sky);

  const key = new THREE.DirectionalLight(new THREE.Color(PALETTE.ink), 2.6);
  key.position.set(14, 18, 12);
  key.target.position.set(0, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -24;
  key.shadow.camera.right = 24;
  key.shadow.camera.top = 24;
  key.shadow.camera.bottom = -24;
  key.shadow.camera.far = 64;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.55);
  fill.position.set(-12, 12, -14);
  scene.add(fill);

  return { colliders, shootables, group, siteMeshes };
}
