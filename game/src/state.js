// One place for all mutable game state. The simulation (main.js) reads and writes
// this object; rendering only reads it. Nothing here allocates per frame.
export const PHASE = { BUY: 'buy', LIVE: 'live', OVER: 'over' };

export const WEAPONS = {
  rifle:  { name: 'VK-7 RIFLE',      price: 2700, auto: true,  rpm: 600, mag: 30, reserve: 90,  damage: 34, headMul: 2.5, spread: 0.011, moveSpread: 0.030, recoil: 0.011, range: 90, reloadMs: 2200 },
  smg:    { name: 'HORNET SMG',      price: 1500, auto: true,  rpm: 900, mag: 32, reserve: 96,  damage: 22, headMul: 2.5, spread: 0.020, moveSpread: 0.034, recoil: 0.007, range: 45, reloadMs: 1900 },
  sniper: { name: 'LONGSHOT SNIPER', price: 4750, auto: false, rpm: 55,  mag: 5,  reserve: 15,  damage: 95, headMul: 2.0, spread: 0.001, moveSpread: 0.060, recoil: 0.060, range: 120, reloadMs: 3200 },
  pistol: { name: 'P9 PISTOL',       price: 0,    auto: false, rpm: 320, mag: 12, reserve: 36,  damage: 26, headMul: 2.5, spread: 0.014, moveSpread: 0.032, recoil: 0.010, range: 50, reloadMs: 1500 },
};

export function createState() {
  return {
    phase: PHASE.BUY,
    round: 1,
    score: { ally: 0, enemy: 0 },
    money: 800,
    timer: 15,            // buy phase countdown, then 100 s round
    roundTime: 100,
    bomb: { state: 'idle', site: null, plantT: 0, fuse: 35, defuseT: 0, plantedBy: null },
    player: null,         // filled by player.js
    bots: [],             // filled by bots.js
    grenades: [],
    tracers: [],
    killfeed: [],
    banner: null,
    buyOpen: false,
    kills: 0,
    deaths: 0,
    time: 0,
  };
}

// Seeded RNG (mulberry32) so ?shot frames are deterministic.
export function mulberry32(initial) {
  let a = initial | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
