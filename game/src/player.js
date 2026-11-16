// The human player: acceleration-based movement, crouch, jump, collision,
// health/armour, and the view-model gun. One object, no per-frame allocation.
import * as THREE from 'three';
import { collideCircle } from './world.js';
import { WEAPONS } from './state.js';

const EYE_STAND = 1.62;
const EYE_CROUCH = 1.05;
const RADIUS = 0.42;

export function createPlayer(scene, camera, colliders, spawn) {
  const group = new THREE.Group();
  scene.add(group);
  // view-model: a simple rifle built from boxes, parented to the camera.
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.45, metalness: 0.6 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.5, metalness: 0.3 });
  const gun = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), gunMat);
  barrel.position.set(0, -0.16, -0.42);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.3), gunMat);
  stock.position.set(0, -0.15, 0.02);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.06), accentMat);
  grip.position.set(0, -0.24, -0.08);
  gun.add(barrel, stock, grip);
  gun.scale.setScalar(0.62);
  gun.position.set(0.24, -0.2, -0.05);
  camera.add(gun);
  scene.add(camera);

  const state = {
    x: spawn.x, z: spawn.z, y: 0, vy: 0, yaw: 0, pitch: 0,
    vx: 0, vz: 0, hp: 100, armour: 0, alive: true,
    crouch: false, grounded: true, speed: 0,
    weaponKey: 'rifle', mag: 30, reserve: 90, grenades: 0,
    owned: { rifle: true, pistol: true },
    recoil: 0, bloom: 0, lastShotAt: -10, reloadUntil: -1, reloading: false,
    plantT: 0, defuseT: 0, respawnAt: 0,
  };

  function eyeHeight() { return state.crouch ? EYE_CROUCH : EYE_STAND; }

  function reset(sp) {
    state.x = sp.x; state.z = sp.z; state.y = 0; state.vy = 0;
    state.vx = 0; state.vz = 0; state.yaw = 0; state.pitch = 0;
    state.hp = 100; state.alive = true; state.crouch = false;
    state.recoil = 0; state.bloom = 0; state.reloading = false;
    state.plantT = 0; state.defuseT = 0;
    state.mag = WEAPONS[state.weaponKey].mag;
    state.reserve = WEAPONS[state.weaponKey].reserve;
  }

  // Fixed-step movement. input: {forward, strafe, crouch, walk, jump, yawDelta, pitchDelta}
  function step(input, dt) {
    if (!state.alive) return;
    state.yaw += input.yawDelta;
    state.pitch = Math.max(-1.5, Math.min(1.5, state.pitch + input.pitchDelta));
    state.crouch = input.crouch;
    const maxSpeed = state.crouch ? 2.2 : input.walk ? 3.0 : 5.6;
    const accel = state.grounded ? 34 : 10;
    const sin = Math.sin(state.yaw), cos = Math.cos(state.yaw);
    // forward is -Z in camera space; yaw rotates it.
    let wx = (-sin) * input.forward + cos * input.strafe;
    let wz = (-cos) * input.forward - sin * input.strafe;
    const len = Math.hypot(wx, wz);
    if (len > 0) { wx /= len; wz /= len; }
    state.vx += wx * accel * dt;
    state.vz += wz * accel * dt;
    // friction / damping
    const damp = state.grounded ? Math.exp(-9 * dt) : Math.exp(-0.6 * dt);
    state.vx *= damp; state.vz *= damp;
    const sp = Math.hypot(state.vx, state.vz);
    if (sp > maxSpeed) { state.vx *= maxSpeed / sp; state.vz *= maxSpeed / sp; }
    state.speed = Math.hypot(state.vx, state.vz);
    state.x += state.vx * dt;
    state.z += state.vz * dt;
    [state.x, state.z] = collideCircle(colliders, state.x, state.z, RADIUS);
    if (input.jump && state.grounded) { state.vy = 5.2; state.grounded = false; }
    state.vy -= 14 * dt;
    state.y += state.vy * dt;
    if (state.y <= 0) { state.y = 0; state.vy = 0; state.grounded = true; }
    // recoil + bloom decay
    state.recoil = Math.max(0, state.recoil - dt * 0.09);
    state.bloom = Math.max(0, state.bloom - dt * 0.05);
    // camera follows
    camera.position.set(state.x, state.y + eyeHeight(), state.z);
    camera.rotation.set(state.pitch + state.recoil, state.yaw, 0, 'YXZ');
    // view-model kick
    gun.position.z = state.recoil * 1.6;
    gun.rotation.x = state.recoil * 2.2;
  }

  function damage(amount, fromPos) {
    if (!state.alive) return false;
    let rest = amount;
    if (state.armour > 0) {
      const absorbed = Math.min(state.armour, rest * 0.5);
      state.armour -= absorbed; rest -= absorbed;
    }
    state.hp -= rest;
    if (state.hp <= 0) { state.hp = 0; state.alive = false; }
    return !state.alive;
  }

  function switchWeapon(key) {
    if (!state.owned[key] || key === state.weaponKey) return false;
    state.weaponKey = key;
    state.mag = WEAPONS[key].mag;
    state.reserve = WEAPONS[key].reserve;
    state.reloading = false;
    return true;
  }

  return { state, step, reset, damage, switchWeapon, eyeHeight, gun };
}
