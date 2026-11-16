// Boot + the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. ?shot=start|play|end with &seed=N sets up a deterministic
// frame for a capture, renders it twice, then freezes and sets window.__shotReady.
import * as THREE from 'three';
import { createState, PHASE, WEAPONS, mulberry32 } from './state.js';
import { createWorld, rayHitColliders, SITES, SPAWN_ALLY, SPAWN_ENEMY } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon } from './weapon.js';
import { createBots } from './bots.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const rng = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14161d);
scene.fog = new THREE.Fog(0x14161d, 30, 90);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const state = createState();
const world = createWorld(scene);
const weapon = createWeapon();
const hud = createHud();
const audio = createAudio();
const player = createPlayer(scene, camera, world.colliders, SPAWN_ALLY);
const bots = createBots(scene, world.colliders, rng);
const input = createInput(renderer.domElement, (locked) => {
  if (!locked && state.phase === PHASE.LIVE && !shot) hud.setOverlay(true, 'Paused — click to play.');
});
state.player = player.state;

const raycaster = new THREE.Raycaster();
raycaster.far = 120;
const tmpDir = new THREE.Vector3();
const tmpOrigin = new THREE.Vector3();
const tracerGeo = new THREE.BufferGeometry();
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffd23d, transparent: true, opacity: 0.8 });
const tracers = new THREE.Group();
scene.add(tracers);

let time = 0;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let triggerWasHeld = false;
let grenadeCooldown = 0;

hud.setMoney(state.money);
hud.setRound(1);
hud.setScore(0, 0);
hud.onPlay(() => {
  if (shot) return;
  hud.setOverlay(false);
  if (state.phase === PHASE.OVER) startRound();
  else if (state.phase === PHASE.BUY) { /* buy phase continues */ }
  input.requestLock();
});

function addKillfeed(killer, killerTeam, victim, victimTeam, head) {
  state.killfeed.unshift({ killer, killerTeam, victim, victimTeam, head });
  state.killfeed.length = Math.min(5, state.killfeed.length);
  hud.setKillfeed(state.killfeed);
}

function startRound() {
  state.phase = PHASE.BUY;
  state.timer = 15;
  state.bomb = { state: 'idle', site: null, plantT: 0, fuse: 35, defuseT: 0, plantedBy: null };
  state.grenades.length = 0;
  player.reset(SPAWN_ALLY);
  bots.spawnAll();
  // allies respawn with fresh weapons each round
  for (const b of bots.bots) { b.mag = WEAPONS[b.weaponKey].mag; b.reserve = WEAPONS[b.weaponKey].reserve; }
  hud.setBuy(false);
  hud.setBomb('');
  hud.setHealth(100);
  hud.setAmmo(player.state.mag, player.state.reserve, WEAPONS[player.state.weaponKey].name);
  hud.showBanner(`ROUND ${state.round}`, 'Buy phase — press B to shop, then fight.', 2600);
  state.buyOpen = false;
}

function endRound(winner, reason) {
  if (state.phase === PHASE.OVER) return;
  state.phase = PHASE.OVER;
  state.timer = 6;
  state.score[winner] += 1;
  const won = winner === 'ally';
  state.money += won ? 325 : 150;
  if (won) audio.roundWin(); else audio.roundLose();
  hud.showBanner(won ? 'ROUND WON' : 'ROUND LOST', reason, 5000);
  hud.setScore(state.score.ally, state.score.enemy);
  hud.setMoney(state.money);
  input.releaseLock();
  if (state.score.ally >= 5 || state.score.enemy >= 5) {
    hud.showBanner(won ? 'MATCH WON 5–' + state.score.enemy : 'MATCH LOST ' + state.score.ally + '–5',
      'Vanguard takes the Foundry Yard.' , 5000);
  }
}

function nextRound() {
  state.round += 1;
  if (state.score.ally >= 5 || state.score.enemy >= 5) {
    state.round = 1; state.score = { ally: 0, enemy: 0 }; state.money = 800;
    player.state.owned = { rifle: true, pistol: true };
    player.state.weaponKey = 'rifle';
  }
  startRound();
}

// --- shooting: raycast from the camera; head sphere first, then torso ---
function shootPlayer() {
  const p = player.state;
  const w = WEAPONS[p.weaponKey];
  weapon.fire(p.weaponKey, time);
  const spread = weapon.spreadFor(p.weaponKey, p.speed, p.crouch, p.bloom);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  dir.x += (rng() * 2 - 1) * spread;
  dir.y += (rng() * 2 - 1) * spread;
  dir.z += (rng() * 2 - 1) * spread;
  dir.normalize();
  const origin = camera.position.clone();
  // nearest wall
  const wallT = rayHitColliders(world.colliders, origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, w.range);
  // nearest bot: head sphere (r 0.26 at y 1.68) then torso capsule as sphere (r 0.42 at y 1.0)
  let bestT = wallT, bestBot = null, bestHead = false;
  for (const b of bots.bots) {
    if (!b.alive || b.team === 'ally') continue;
    for (const [cy, r, head] of [[1.68, 0.26, true], [1.0, 0.45, false]]) {
      const t = raySphere(origin, dir, b.x, cy, b.z, r);
      if (t !== null && t < bestT) { bestT = t; bestBot = b; bestHead = head; }
    }
  }
  addTracer(origin, dir, Math.min(bestT, w.range));
  audio.shot(p.weaponKey);
  bots.hear(p.x, p.z);
  p.bloom = Math.min(0.05, p.bloom + w.recoil * 0.9);
  p.recoil = Math.min(0.09, p.recoil + w.recoil);
  if (p.mag > 0) p.mag -= 1;
  if (bestBot) {
    const dmg = w.damage * (bestHead ? w.headMul : 1);
    const died = bots.damage(bestBot, dmg, bestHead);
    hud.hitmarker(bestHead);
    audio.hit(bestHead);
    if (died) {
      state.money += 300; state.kills += 1;
      addKillfeed('YOU', 'ally', bestBot.name, 'enemy', bestHead);
      audio.kill();
      hud.setMoney(state.money);
      checkRoundEnd();
    }
  }
  if (p.mag === 0) audio.dryClick();
}

function raySphere(o, d, cx, cy, cz, r) {
  const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const c = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : null;
}

function addTracer(origin, dir, len) {
  const geo = new THREE.BufferGeometry().setFromPoints([
    origin.clone(), origin.clone().addScaledVector(dir, len),
  ]);
  const line = new THREE.Line(geo, tracerMat);
  tracers.add(line);
  state.tracers.push({ line, until: time + 0.07 });
}

function throwGrenade() {
  const p = player.state;
  if (p.grenades <= 0 || grenadeCooldown > time) return;
  p.grenades -= 1;
  grenadeCooldown = time + 1;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  state.grenades.push({
    x: p.x, y: 1.5, z: p.z,
    vx: dir.x * 14, vy: dir.y * 14 + 4, vz: dir.z * 14,
    fuse: 1.6, team: 'ally',
  });
  audio.shot('pistol');
}

function explodeGrenade(g) {
  audio.boom();
  const flash = new THREE.PointLight(0xffa040, 60, 18, 1.5);
  flash.position.set(g.x, g.y, g.z);
  scene.add(flash);
  setTimeout(() => scene.remove(flash), 180);
  for (const b of bots.bots) {
    if (!b.alive) continue;
    const d = Math.hypot(b.x - g.x, b.z - g.z);
    if (d < 7) {
      const died = bots.damage(b, Math.round(110 * (1 - d / 7)), false);
      if (died) {
        state.money += 300; state.kills += 1;
        addKillfeed('YOU', 'ally', b.name, b.team, false);
        hud.setMoney(state.money);
      }
    }
  }
  const pd = Math.hypot(player.state.x - g.x, player.state.z - g.z);
  if (pd < 6 && player.state.alive) {
    const died = player.damage(Math.round(90 * (1 - pd / 6)));
    hud.damageFlash(); audio.hurt();
    if (died) { state.deaths += 1; addKillfeed('GRENADE', 'enemy', 'YOU', 'ally', false); checkRoundEnd(); }
  }
  checkRoundEnd();
}

function checkRoundEnd() {
  if (state.phase !== PHASE.LIVE) return;
  const alliesAlive = (player.state.alive ? 1 : 0) + bots.aliveCount('ally');
  const enemiesAlive = bots.aliveCount('enemy');
  if (enemiesAlive === 0) endRound('ally', 'Ember eliminated.');
  else if (alliesAlive === 0 && state.bomb.state !== 'planted') endRound('enemy', 'Vanguard eliminated.');
  else if (alliesAlive === 0 && state.bomb.state === 'planted') {
    // bomb still ticks; round ends when it explodes or is defused
  }
}

function tryPlantOrDefuse(dt) {
  const p = player.state;
  if (!p.alive || state.phase !== PHASE.LIVE) { p.plantT = 0; p.defuseT = 0; return; }
  if (state.bomb.state === 'idle') {
    for (const key of ['A', 'B']) {
      const s = SITES[key];
      if (Math.hypot(p.x - s.cx, p.z - s.cz) < s.r) {
        hud.setPrompt('Hold E to plant the charge — ' + s.name);
        if (input.state.interact) {
          p.plantT += dt;
          if (p.plantT >= 3) {
            state.bomb = { state: 'planted', site: key, plantT: 0, fuse: 35, defuseT: 0, plantedBy: 'YOU' };
            state.money += 300; hud.setMoney(state.money);
            hud.showBanner('CHARGE PLANTED — ' + s.name, 'Defend it for 35 seconds.', 2600);
            audio.plant();
            p.plantT = 0;
          }
        } else p.plantT = 0;
        return;
      }
    }
    hud.setPrompt('');
  } else if (state.bomb.state === 'planted') {
    const s = SITES[state.bomb.site];
    if (Math.hypot(p.x - s.cx, p.z - s.cz) < 2.5) {
      hud.setPrompt('Hold E to defuse the charge');
      if (input.state.interact) {
        p.defuseT += dt;
        if (p.defuseT >= 5) {
          state.bomb.state = 'defused';
          endRound('ally', 'Charge defused at ' + s.name + '.');
          p.defuseT = 0;
        }
      } else p.defuseT = 0;
    } else hud.setPrompt('');
  }
}

// --- fixed-step simulation ---
function step(dt) {
  time += dt;
  const p = player.state;
  input.poll();
  const inp = input.state;

  if (inp.buyToggle && (state.phase === PHASE.BUY || state.phase === PHASE.LIVE)) {
    state.buyOpen = !state.buyOpen;
    hud.setBuy(state.buyOpen);
    if (state.buyOpen) input.releaseLock(); else if (state.phase === PHASE.LIVE) input.requestLock();
  }
  // buy keys 1-6 while the menu is open (buy phase or live)
  if (state.buyOpen) {
    const buyKeys = ['rifle', 'smg', 'sniper', 'pistol', null, null];
    if (inp.weaponSlot >= 1 && inp.weaponSlot <= 4) {
      const key = buyKeys[inp.weaponSlot - 1];
      if (key && !p.owned[key] && state.money >= WEAPONS[key].price) {
        state.money -= WEAPONS[key].price;
        p.owned[key] = true;
        player.switchWeapon(key);
        hud.setMoney(state.money);
        audio.beep();
      } else if (key && p.owned[key]) player.switchWeapon(key);
    }
    if (inp.weaponSlot === 0 && inp.grenade) { /* G handled below */ }
  }
  // weapon switching outside the buy menu (owned weapons only)
  if (!state.buyOpen && inp.weaponSlot >= 1 && inp.weaponSlot <= 4) {
    const keys = ['rifle', 'smg', 'sniper', 'pistol'];
    player.switchWeapon(keys[inp.weaponSlot - 1]);
  }
  if (inp.grenade && state.buyOpen) {
    if (state.money >= 300) { state.money -= 300; p.grenades += 1; hud.setMoney(state.money); audio.beep(); }
  } else if (inp.grenade) throwGrenade();
  if (inp.reload) {
    if (p.mag < WEAPONS[p.weaponKey].mag && p.reserve > 0) {
      weapon.startReload(p.weaponKey, time);
      audio.reload();
    }
  }
  const reloaded = weapon.updateReload(p.weaponKey, time, p.mag, p.reserve);
  if (reloaded) { p.mag = reloaded.mag; p.reserve = reloaded.reserve; }

  // phase timers
  if (state.phase === PHASE.BUY) {
    state.timer -= dt;
    if (state.timer <= 0) {
      state.phase = PHASE.LIVE;
      state.timer = state.roundTime;
      hud.setBuy(false); state.buyOpen = false;
      hud.showBanner('GO — ROUND ' + state.round, 'Plant at Furnace or Dock, or eliminate Ember.', 2200);
      input.requestLock();
    }
  } else if (state.phase === PHASE.LIVE) {
    state.timer -= dt;
    if (state.bomb.state === 'planted') {
      state.bomb.fuse -= dt;
      if (Math.floor(state.bomb.fuse * 2) !== Math.floor((state.bomb.fuse + dt) * 2)) audio.beep();
      if (state.bomb.fuse <= 0) {
        explodeBomb();
      }
    }
    if (state.timer <= 0 && state.bomb.state !== 'planted') {
      endRound('enemy', 'Time expired — Ember holds the sites.');
    }
  } else if (state.phase === PHASE.OVER) {
    state.timer -= dt;
    if (state.timer <= 0) nextRound();
  }

  // player movement + firing (live only, unless shot mode)
  if (state.phase === PHASE.LIVE && !state.buyOpen) {
    player.step({ ...inp, yawDelta: inp.yawDelta, pitchDelta: inp.pitchDelta }, dt);
    inp.yawDelta = 0; inp.pitchDelta = 0;
    const w = WEAPONS[p.weaponKey];
    const triggerPressed = inp.firing && !triggerWasHeld;
    if (p.alive && weapon.canFire(p.weaponKey, time, w.auto, inp.firing, triggerPressed)) {
      if (p.mag > 0) shootPlayer();
      else { weapon.fire(p.weaponKey, time); audio.dryClick(); }
    }
    triggerWasHeld = inp.firing;
    tryPlantOrDefuse(dt);
  } else {
    inp.yawDelta = 0; inp.pitchDelta = 0;
    triggerWasHeld = inp.firing;
  }

  // bots
  if (state.phase === PHASE.LIVE) {
    bots.step({
      player: p, time, dt, bomb: state.bomb, rng,
      onShoot(bot, target, hitP, w) {
        addTracer(new THREE.Vector3(bot.x, 1.5, bot.z),
          new THREE.Vector3(target.x - bot.x, 0, target.z - bot.z).normalize(), Math.hypot(target.x - bot.x, target.z - bot.z));
        if (rng() < hitP) {
          const head = rng() < 0.15;
          const dmg = w.damage * (head ? w.headMul : 1);
          if (target.kind === 'player') {
            const died = player.damage(dmg);
            hud.damageFlash(); audio.hurt();
            if (died) { state.deaths += 1; addKillfeed(bot.name, 'enemy', 'YOU', 'ally', head); }
          } else {
            const victim = target.ref;
            const died = bots.damage(victim, dmg, head);
            if (died) {
              addKillfeed(bot.name, bot.team, victim.name, victim.team, head);
              if (bot.team === 'ally') { state.money += 150; hud.setMoney(state.money); }
            }
          }
        }
        if (rng() < 0.4) bots.hear(bot.x, bot.z);
      },
      onPlant(bot, site) {
        state.bomb = { state: 'planted', site, plantT: 0, fuse: 35, defuseT: 0, plantedBy: bot.name };
        hud.showBanner('CHARGE PLANTED — ' + SITES[site].name, bot.name + ' planted it. Defuse or fall back.', 2600);
        audio.plant();
      },
      onDefuse() {
        state.bomb.state = 'defused';
        endRound('enemy', 'Charge defused — Ember holds the yard.');
      },
    });
    checkRoundEnd();
  }

  // grenades
  for (let i = state.grenades.length - 1; i >= 0; i--) {
    const g = state.grenades[i];
    g.vy -= 12 * dt;
    g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt;
    if (g.y < 0.1) { g.y = 0.1; g.vy *= -0.4; g.vx *= 0.7; g.vz *= 0.7; }
    g.fuse -= dt;
    if (g.fuse <= 0) { explodeGrenade(g); state.grenades.splice(i, 1); }
  }
  // tracer expiry
  for (let i = state.tracers.length - 1; i >= 0; i--) {
    if (time >= state.tracers[i].until) {
      tracers.remove(state.tracers[i].line);
      state.tracers[i].line.geometry.dispose();
      state.tracers.splice(i, 1);
    }
  }

  // HUD
  hud.setTimer(state.timer);
  hud.setRound(state.round);
  hud.setAlive((p.alive ? 1 : 0) + bots.aliveCount('ally'), bots.aliveCount('enemy'));
  hud.setHealth(p.hp);
  hud.setAmmo(p.mag, p.reserve, WEAPONS[p.weaponKey].name);
  hud.setCrosshairSpread(24 + weapon.spreadFor(p.weaponKey, p.speed, p.crouch, p.bloom) * 900);
  if (state.bomb.state === 'planted') {
    hud.setBomb(`CHARGE @ ${SITES[state.bomb.site].name} — ${Math.ceil(state.bomb.fuse)}s`);
  } else if (state.bomb.state === 'defused') hud.setBomb('CHARGE DEFUSED');
  else hud.setBomb('');
  if (!p.alive && state.phase === PHASE.LIVE) {
    hud.setPrompt('You are down — spectating. Next round starts soon.');
  }
}

function explodeBomb() {
  audio.boom();
  const s = SITES[state.bomb.site];
  const flash = new THREE.PointLight(0xff6a00, 120, 40, 1.4);
  flash.position.set(s.cx, 2, s.cz);
  scene.add(flash);
  setTimeout(() => scene.remove(flash), 400);
  state.bomb.state = 'exploded';
  endRound('ally', 'Charge detonated at ' + s.name + '.');
}

// --- deterministic screenshot frames ---
function runShot(kind) {
  frozen = true;
  hud.setOverlay(false);
  hud.setBuy(false);
  if (kind === 'start') {
    startRound();
    state.phase = PHASE.BUY;
    state.timer = 12;
    // camera: spawn overlook toward mid + Furnace lane
    player.state.x = 0; player.state.z = 19; player.state.yaw = 0.35; player.state.pitch = -0.06;
    camera.position.set(0, 1.62, 19);
    camera.rotation.set(-0.06, 0.35, 0, 'YXZ');
    hud.setBuy(true);
    hud.showBanner('ROUND 1', 'Buy phase — press B to shop, then fight.', 60000);
  } else if (kind === 'play') {
    startRound();
    state.phase = PHASE.LIVE;
    state.timer = 87;
    state.money = 2450;
    player.state.x = -6; player.state.z = 8; player.state.yaw = -0.5; player.state.pitch = -0.02;
    player.state.mag = 24; player.state.reserve = 90;
    player.state.hp = 82;
    // stage a mid-round firefight: two enemies in view, one ally beside the player
    const foes = bots.bots.filter((b) => b.team === 'enemy');
    foes[0].x = -4; foes[0].z = 0; foes[0].yaw = Math.PI;
    foes[3].x = 2; foes[3].z = 2; foes[3].yaw = Math.PI;
    const ally = bots.bots.find((b) => b.team === 'ally');
    ally.x = -2; ally.z = 10; ally.yaw = 0;
    for (let i = 0; i < 40; i++) step(FIXED_STEP); // let bots settle into view
    // staging steps may have hurt the player or killed bots: restore a
    // consistent mid-fight state — only the two killfeed victims are down.
    player.state.alive = true;
    player.state.hp = 82;
    player.state.mag = 24; player.state.reserve = 90;
    for (const b of bots.bots) {
      if (b.name === 'Vex' || b.name === 'Rook') {
        b.alive = false; b.hp = 0; b.body.group.visible = false;
      } else {
        b.alive = true; b.hp = 100; b.body.group.visible = true;
        b.body.group.position.set(b.x, 0, b.z);
        b.body.group.rotation.y = b.yaw;
      }
    }
    // re-place the staged bots after the restore (the restore kept their x/z)
    foes[0].x = -4; foes[0].z = 0; foes[0].yaw = Math.PI;
    foes[0].body.group.position.set(-4, 0, 0);
    foes[0].body.group.rotation.y = Math.PI;
    foes[3].x = 2; foes[3].z = 2; foes[3].yaw = Math.PI;
    foes[3].body.group.position.set(2, 0, 2);
    foes[3].body.group.rotation.y = Math.PI;
    ally.x = -2; ally.z = 10; ally.yaw = 0;
    ally.body.group.position.set(-2, 0, 10);
    ally.body.group.rotation.y = 0;
    state.killfeed.length = 0;
    camera.position.set(player.state.x, 1.62, player.state.z);
    camera.rotation.set(player.state.pitch, player.state.yaw, 0, 'YXZ');
    addTracer(new THREE.Vector3(-4, 1.5, 0), new THREE.Vector3(-0.24, 0, 0.97).normalize(), 8);
    state.kills = 1;
    addKillfeed('YOU', 'ally', 'Vex', 'enemy', true);
    addKillfeed('Kestrel', 'ally', 'Rook', 'enemy', false);
    hud.setPrompt('');
    hud.setHealth(82);
    hud.setAmmo(24, 90, 'VK-7 RIFLE');
    hud.setMoney(2450);
    hud.setTimer(87);
  } else { // end
    startRound();
    state.phase = PHASE.OVER;
    state.timer = 4;
    state.score = { ally: 1, enemy: 0 };
    state.money = 1125;
    player.state.x = -20; player.state.z = -12; player.state.yaw = -0.9; player.state.pitch = -0.04;
    const foes = bots.bots.filter((b) => b.team === 'enemy');
    foes.forEach((b) => { b.alive = false; b.body.group.visible = false; });
    camera.position.set(player.state.x, 1.62, player.state.z);
    camera.rotation.set(-0.04, -0.9, 0, 'YXZ');
    hud.showBanner('ROUND WON', 'Ember eliminated.', 60000);
    hud.setScore(1, 0);
    hud.setMoney(1125);
  }
  hud.setTimer(state.timer);
  hud.setAlive((player.state.alive ? 1 : 0) + bots.aliveCount('ally'), bots.aliveCount('enemy'));
  renderer.render(scene, camera);
  renderer.render(scene, camera);
  window.__shotReady = true;
}

function frame(now) {
  requestAnimationFrame(frame);
  if (frozen) return;
  const dtMs = Math.min(100, now - lastTime);
  lastTime = now;
  accumulator += dtMs / 1000;
  let n = 0;
  while (accumulator >= FIXED_STEP && n < 5) {
    step(FIXED_STEP);
    accumulator -= FIXED_STEP;
    n += 1;
  }
  renderer.render(scene, camera);
}

startRound();
if (shot) runShot(shot);
else {
  hud.setOverlay(true);
  requestAnimationFrame(frame);
}
