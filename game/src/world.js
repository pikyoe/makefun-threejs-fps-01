// The Foundry Yard: an original 64 x 44 m industrial yard at dusk. Three lanes
// (Furnace lane west, Mid through the press hall, Dock lane east), two bomb
// sites (A Furnace, B Dock), crates and walls for cover. Colliders are plain
// AABBs {minX,maxX,minZ,maxZ,h}; raycasts against them are done in main.js
// with a shared slab test so walls block bullets and sight.
import * as THREE from 'three';

export const PALETTE = {
  canvas: 0x14161d, ground: 0x2a2d33, wall: 0x3d4450, wallDark: 0x2c313b,
  accent: 0xff7a1a, ember: 0xff4d1a, ally: 0x3fa7ff, enemy: 0xff4d3d,
  crate: 0x6b5433, crate2: 0x4a5a3a, metal: 0x565e6b, floorLine: 0x8a6a2f,
};

export const SITES = {
  A: { name: 'FURNACE', cx: -24, cz: -15, r: 5 },
  B: { name: 'DOCK', cx: 24, cz: 15, r: 5 },
};
export const SPAWN_ALLY = { x: 0, z: 19 };
export const SPAWN_ENEMY = { x: 0, z: -19 };

// Waypoint graph bots walk: id -> {x,z, links:[ids]}. Lanes run north-south.
export const WAYPOINTS = [
  { x: 0, z: 17 },   // 0 ally spawn
  { x: -8, z: 10 },  // 1
  { x: 8, z: 10 },   // 2
  { x: 0, z: 6 },    // 3 mid doors
  { x: -14, z: 2 },  // 4 west lane
  { x: 14, z: 2 },   // 5 east lane
  { x: -24, z: -8 }, // 6 approach A
  { x: 24, z: 8 },   // 7 approach B
  { x: -24, z: -15 },// 8 site A
  { x: 24, z: 15 },  // 9 site B
  { x: 0, z: -6 },   // 10 mid north
  { x: -10, z: -12 },// 11
  { x: 10, z: -12 }, // 12
  { x: 0, z: -17 },  // 13 enemy spawn
  { x: -18, z: 12 }, // 14 west cover
  { x: 18, z: -12 }, // 15 east cover
];
export const LINKS = [
  [0, 1], [0, 2], [1, 3], [2, 3], [1, 4], [2, 5], [3, 4], [3, 5],
  [4, 6], [5, 7], [6, 8], [7, 9], [3, 10], [10, 11], [10, 12],
  [11, 13], [12, 13], [6, 11], [7, 12], [1, 14], [14, 4], [5, 15], [15, 12],
  [8, 11], [9, 7],
];
export const LINKS_BY_NODE = WAYPOINTS.map(() => []);
for (const [a, b] of LINKS) { LINKS_BY_NODE[a].push(b); LINKS_BY_NODE[b].push(a); }

// Crates/walls: [cx, cz, w, d, h, colorKey]
const BOXES = [
  // perimeter walls (h 4)
  [0, -22, 64, 1, 4, 'wall'], [0, 22, 64, 1, 4, 'wall'],
  [-32, 0, 1, 44, 4, 'wall'], [32, 0, 1, 44, 4, 'wall'],
  // press hall mid walls with a gap at x 0
  [-18, 0, 22, 1.2, 3.4, 'wallDark'], [18, 0, 22, 1.2, 3.4, 'wallDark'],
  // furnace building (site A) partial walls
  [-28, -15, 1.2, 10, 3.2, 'wallDark'], [-20, -20, 9, 1.2, 3.2, 'wallDark'],
  // dock building (site B) partial walls
  [28, 15, 1.2, 10, 3.2, 'wallDark'], [20, 20, 9, 1.2, 3.2, 'wallDark'],
  // crates
  [-12, 8, 3, 3, 1.4, 'crate'], [-12, 8, 2, 2, 2.6, 'crate2'],
  [12, -8, 3, 3, 1.4, 'crate'], [12, -8, 2, 2, 2.6, 'crate2'],
  [-6, -4, 2.4, 2.4, 1.2, 'crate2'], [6, 4, 2.4, 2.4, 1.2, 'crate2'],
  [-20, 4, 3, 2, 1.6, 'crate'], [20, -4, 3, 2, 1.6, 'crate'],
  [-24, -10, 2, 2, 1.3, 'crate2'], [24, 10, 2, 2, 1.3, 'crate2'],
  [0, 12, 4, 1.4, 1.1, 'metal'], [0, -12, 4, 1.4, 1.1, 'metal'],
  [-16, -16, 2.6, 2.6, 1.5, 'crate'], [16, 16, 2.6, 2.6, 1.5, 'crate'],
];

export function createWorld(scene) {
  const colliders = [];
  const group = new THREE.Group();
  scene.add(group);

  const hemi = new THREE.HemisphereLight(0x8a97b8, 0x1c1410, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb36b, 2.1);
  sun.position.set(-18, 26, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
  sun.shadow.camera.far = 80;
  scene.add(sun);
  const emberGlow = new THREE.PointLight(0xff5a1a, 30, 22, 1.8);
  emberGlow.position.set(-24, 3.2, -15);
  scene.add(emberGlow);
  const dockGlow = new THREE.PointLight(0x3fa7ff, 18, 18, 1.8);
  dockGlow.position.set(24, 3.2, 15);
  scene.add(dockGlow);

  const groundMat = new THREE.MeshStandardMaterial({ color: PALETTE.ground, roughness: 0.95 });
  const ground = new THREE.Mesh(new THREE.BoxGeometry(64, 0.5, 44), groundMat);
  ground.position.set(0, -0.25, 0);
  ground.receiveShadow = true;
  group.add(ground);

  // painted lane lines + site rings on the floor (thin boxes, no collision)
  const lineMat = new THREE.MeshStandardMaterial({ color: PALETTE.floorLine, roughness: 0.9 });
  for (const [x, z, w, d] of [[-14, 0, 0.5, 36], [14, 0, 0.5, 36], [0, 0, 0.5, 36]]) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), lineMat);
    line.position.set(x, 0.03, z);
    group.add(line);
  }
  const ringMatA = new THREE.MeshStandardMaterial({ color: PALETTE.ember, roughness: 0.6, emissive: 0xff3d00, emissiveIntensity: 0.5 });
  const ringMatB = new THREE.MeshStandardMaterial({ color: PALETTE.ally, roughness: 0.6, emissive: 0x1a6cff, emissiveIntensity: 0.5 });
  for (const [site, mat] of [[SITES.A, ringMatA], [SITES.B, ringMatB]]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(site.r - 0.35, site.r, 40), mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.cx, 0.05, site.cz);
    group.add(ring);
  }

  const mats = {};
  function matFor(key) {
    if (!mats[key]) mats[key] = new THREE.MeshStandardMaterial({ color: PALETTE[key], roughness: 0.85, metalness: key === 'metal' ? 0.5 : 0.05 });
    return mats[key];
  }
  for (const [cx, cz, w, d, h, key] of BOXES) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), matFor(key));
    mesh.position.set(cx, h / 2, cz);
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, h });
  }
  // furnace + dock props (visual only, inside their collider boxes above)
  const furnace = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.0, 3.4, 12),
    new THREE.MeshStandardMaterial({ color: 0x1f2228, roughness: 0.6, metalness: 0.6, emissive: 0xff4400, emissiveIntensity: 0.7 }));
  furnace.position.set(-24, 1.7, -15); furnace.castShadow = true;
  group.add(furnace);
  const dockCrane = new THREE.Mesh(new THREE.BoxGeometry(0.6, 5, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x8a93a3, roughness: 0.5, metalness: 0.7 }));
  dockCrane.position.set(24, 2.5, 15); dockCrane.castShadow = true;
  group.add(dockCrane);

  return { colliders, group };
}

// Circle (radius r, at x,z) vs AABB colliders: push out. Returns corrected x,z.
export function collideCircle(colliders, x, z, r) {
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - nx, dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r;
        z = nz + (dz / d) * r;
      } else {
        // centre inside the box: push out along the smallest penetration axis
        const pl = x - c.minX, pr = c.maxX - x, pt = z - c.minZ, pb = c.maxZ - z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = c.minX - r; else if (m === pr) x = c.maxX + r;
        else if (m === pt) z = c.minZ - r; else z = c.maxZ + r;
      }
    }
  }
  return [Math.max(-31, Math.min(31, x)), Math.max(-21, Math.min(21, z))];
}

// Slab ray vs AABB list. Returns nearest t (0..maxT) or Infinity.
export function rayHitColliders(colliders, ox, oy, oz, dx, dy, dz, maxT) {
  let best = Infinity;
  for (const c of colliders) {
    let t0 = 0, t1 = maxT;
    const o = [ox, oy, oz], d = [dx, dy, dz];
    const mn = [c.minX, 0, c.minZ], mx = [c.maxX, c.h, c.maxZ];
    let ok = true;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) { if (o[i] < mn[i] || o[i] > mx[i]) { ok = false; break; } }
      else {
        let a = (mn[i] - o[i]) / d[i], b = (mx[i] - o[i]) / d[i];
        if (a > b) { const t = a; a = b; b = t; }
        if (a > t0) t0 = a;
        if (b < t1) t1 = b;
        if (t0 > t1) { ok = false; break; }
      }
    }
    if (ok && t0 < best && t0 >= 0) best = t0;
  }
  return best;
}
