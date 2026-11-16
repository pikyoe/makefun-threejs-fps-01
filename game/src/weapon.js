// Weapons: fire-rate, magazine, reload, recoil and spread. Spread grows with
// movement and with sustained fire, and shrinks when crouched or still —
// stopping to aim pays. Hits are resolved by the caller (main.js) against
// bodies; this module owns only the gun's own numbers.
import { WEAPONS } from './state.js';

export function createWeapon() {
  const state = { lastShot: -10, reloading: false, reloadEnd: 0 };

  function def(key) { return WEAPONS[key]; }

  // Spread (radians) for one shot: base + movement + bloom, crouch halves it.
  function spreadFor(key, speed, crouch, bloom) {
    const w = WEAPONS[key];
    const move = Math.min(1, speed / 5.6);
    let s = w.spread + move * w.moveSpread + bloom;
    if (crouch) s *= 0.55;
    return s;
  }

  function canFire(key, now, auto, triggerHeld, triggerPressed) {
    const w = WEAPONS[key];
    if (state.reloading) return false;
    if (now - state.lastShot < 60 / w.rpm) return false;
    return auto ? triggerHeld : triggerPressed;
  }

  function fire(key, now) {
    state.lastShot = now;
    return WEAPONS[key];
  }

  function startReload(key, now) {
    if (state.reloading) return false;
    state.reloading = true;
    state.reloadEnd = now + WEAPONS[key].reloadMs / 1000;
    return true;
  }

  // Returns true on the step the reload finishes.
  function updateReload(key, now, mag, reserve) {
    if (!state.reloading) return null;
    if (now < state.reloadEnd) return null;
    state.reloading = false;
    const w = WEAPONS[key];
    const need = w.mag - mag;
    const take = Math.min(need, reserve);
    return { mag: mag + take, reserve: reserve - take };
  }

  function buy(key, money) {
    const w = WEAPONS[key];
    if (money < w.price) return null;
    return { key, cost: w.price };
  }

  return { state, def, spreadFor, canFire, fire, startReload, updateReload, buy };
}
