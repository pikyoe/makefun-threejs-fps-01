// Bots: 4 Vanguard teammates + 5 Ember enemies. Each bot has a body (capsule
// + head sphere, team-coloured), a waypoint route, and a small state machine:
// patrol -> engage (sees a target) -> hold (at a site) -> plant/defuse.
// They hear gunfire within 26 m, see within 34 m with a line-of-sight test
// against the world's colliders, and miss more when their target moves.
import * as THREE from 'three';
import { WAYPOINTS, LINKS_BY_NODE, rayHitColliders, collideCircle, SITES } from './world.js';
import { WEAPONS } from './state.js';

const BOT_NAMES_ALLY = ['Mira', 'Kestrel', 'Bram', 'Sable'];
const BOT_NAMES_ENEMY = ['Ash', 'Vex', 'Rook', 'Nyx', 'Cinder'];
const EYE = 1.55;

function makeBody(scene, team) {
  const color = team === 'ally' ? 0x3fa7ff : 0xff4d3d;
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.6 });
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.95, 10), mat);
  torso.position.y = 1.0; torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), dark);
  head.position.y = 1.68; head.castShadow = true;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.1),
    new THREE.MeshStandardMaterial({ color: 0xffd23d, emissive: 0xffd23d, emissiveIntensity: 0.6 }));
  visor.position.set(0, 1.7, 0.2);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.7), dark);
  gun.position.set(0.25, 1.15, 0.3);
  g.add(torso, head, visor, gun);
  scene.add(g);
  return { group: g, torso, head };
}

export function createBots(scene, colliders, rng) {
  const bots = [];
  function addBot(team, name, x, z, isAttacker) {
    const body = makeBody(scene, team);
    const bot = {
      team, name, x, z, yaw: 0, hp: 100, alive: true,
      weaponKey: team === 'ally' ? 'rifle' : (rng() < 0.3 ? 'smg' : 'rifle'),
      mag: 30, reserve: 90, lastShot: -10, reloading: false, reloadEnd: 0,
      state: 'patrol', target: null, wp: 0, holdUntil: 0, heardAt: null,
      speed: 3.4, plantT: 0, defuseT: 0, strafeDir: 1, strafeT: 0,
      body, isAttacker, kills: 0,
    };
    bot.mag = WEAPONS[bot.weaponKey].mag;
    bot.reserve = WEAPONS[bot.weaponKey].reserve;
    bots.push(bot);
    return bot;
  }
  function spawnAll() {
    for (const b of bots) { scene.remove(b.body.group); }
    bots.length = 0;
    for (let i = 0; i < 4; i++) {
      const b = addBot('ally', BOT_NAMES_ALLY[i], -6 + i * 4, 19, true);
      b.wp = 1 + (i % 2);
    }
    for (let i = 0; i < 5; i++) {
      const b = addBot('enemy', BOT_NAMES_ENEMY[i], -8 + i * 4, -19, false);
      b.wp = 11 + (i % 3);
      b.state = 'hold';
      b.holdUntil = 8 + rng() * 10;
    }
  }
  spawnAll();

  function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }

  // Line of sight between two eye positions, blocked by any collider.
  function canSee(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const d = Math.hypot(dx, dz);
    if (d > 34) return false;
    if (d < 0.01) return true;
    const t = rayHitColliders(colliders, ax, EYE, az, dx / d, 0, dz / d, d);
    return t >= d - 0.05;
  }

  function nearestWp(x, z) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < WAYPOINTS.length; i++) {
      const d = dist2(x, z, WAYPOINTS[i].x, WAYPOINTS[i].z);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  function nextWp(bot, goalWp) {
    // Greedy step toward the goal along the graph (BFS one hop).
    if (bot.wp === goalWp) return goalWp;
    const prev = new Map([[bot.wp, -1]]);
    const queue = [bot.wp];
    while (queue.length) {
      const cur = queue.shift();
      for (const n of LINKS_BY_NODE[cur]) {
        if (prev.has(n)) continue;
        prev.set(n, cur);
        if (n === goalWp) {
          let step = n;
          while (prev.get(step) !== bot.wp && prev.get(step) !== -1) step = prev.get(step);
          return step;
        }
        queue.push(n);
      }
    }
    return bot.wp;
  }

  // Bots react to a loud event (a shot) at (x,z): turn and investigate.
  function hear(x, z) {
    for (const b of bots) {
      if (!b.alive) continue;
      if (dist2(b.x, b.z, x, z) < 26 * 26 && b.state !== 'engage') {
        b.heardAt = { x, z };
        if (b.state === 'hold') b.state = 'patrol';
      }
    }
  }

  // One fixed step for every bot. ctx: {player, time, dt, onShoot(bot, targetPos, hitChance), onKill, bomb, rng}
  function step(ctx) {
    const { player, time, dt, bomb } = ctx;
    for (const bot of bots) {
      if (!bot.alive) { bot.body.group.visible = false; continue; }
      bot.body.group.visible = true;
      // --- perception: nearest living enemy in sight
      let target = null; let bestD = Infinity;
      const foes = [];
      if (bot.team === 'enemy' && player.alive) foes.push({ x: player.x, z: player.z, y: 1.5, kind: 'player', ref: player });
      for (const o of bots) if (o.alive && o.team !== bot.team) foes.push({ x: o.x, z: o.z, y: 1.5, kind: 'bot', ref: o });
      for (const f of foes) {
        const d = Math.hypot(f.x - bot.x, f.z - bot.z);
        if (d < bestD && canSee(bot.x, bot.z, f.x, f.z)) { bestD = d; target = f; }
      }
      bot.target = target;
      bot.state = target ? 'engage' : (bot.state === 'engage' ? 'patrol' : bot.state);

      let moveX = 0, moveZ = 0;
      if (bot.state === 'engage' && target) {
        // strafe while shooting; close in if far, back off if point-blank
        bot.strafeT -= dt;
        if (bot.strafeT <= 0) { bot.strafeDir *= -1; bot.strafeT = 0.7 + rng() * 0.9; }
        const dx = target.x - bot.x, dz = target.z - bot.z;
        const d = Math.hypot(dx, dz) || 1;
        const ux = dx / d, uz = dz / d;
        const approach = d > 16 ? 1 : d < 5 ? -0.6 : 0;
        moveX = ux * approach + (-uz) * bot.strafeDir * 0.7;
        moveZ = uz * approach + ux * bot.strafeDir * 0.7;
        bot.yaw = Math.atan2(dx, dz);
        // --- shooting: burst discipline, worse vs moving targets
        const w = WEAPONS[bot.weaponKey];
        if (time - bot.lastShot >= 60 / w.rpm && bot.mag > 0 && !bot.reloading) {
          bot.lastShot = time;
          bot.mag -= 1;
          const targetSpeed = target.kind === 'player' ? (player.speed || 0) : 2.5;
          const hitP = Math.max(0.08, 0.42 - d * 0.008 - targetSpeed * 0.03);
          ctx.onShoot(bot, target, hitP, w);
        } else if (bot.mag === 0 && !bot.reloading) {
          bot.reloading = true; bot.reloadEnd = time + w.reloadMs / 1000;
        }
        if (bot.reloading && time >= bot.reloadEnd) {
          bot.reloading = false;
          bot.reserve -= Math.min(w.mag - bot.mag, bot.reserve);
          bot.mag = w.mag;
        }
      } else {
        // --- movement: patrol toward a goal waypoint
        let goal = bot.wp;
        if (bot.heardAt) {
          goal = nearestWp(bot.heardAt.x, bot.heardAt.z);
          if (dist2(bot.x, bot.z, bot.heardAt.x, bot.heardAt.z) < 4) bot.heardAt = null;
        } else if (bot.isAttacker && bomb.state === 'idle') {
          goal = rng() < 0.5 ? 8 : 9; // push a site
        } else if (!bot.isAttacker && bot.state === 'hold' && time > bot.holdUntil) {
          goal = bot.team === 'enemy' ? (rng() < 0.5 ? 8 : 9) : bot.wp;
          bot.state = 'patrol';
        }
        if (dist2(bot.x, bot.z, WAYPOINTS[bot.wp].x, WAYPOINTS[bot.wp].z) < 1.2) {
          bot.wp = nextWp(bot, goal);
        }
        const tx = WAYPOINTS[bot.wp].x, tz = WAYPOINTS[bot.wp].z;
        const dx = tx - bot.x, dz = tz - bot.z;
        const d = Math.hypot(dx, dz) || 1;
        moveX = dx / d; moveZ = dz / d;
        bot.yaw = Math.atan2(dx, dz);
        // attackers plant when standing on a site with no enemies near
        if (bot.isAttacker && bomb.state === 'idle') {
          for (const key of ['A', 'B']) {
            const s = SITES[key];
            if (dist2(bot.x, bot.z, s.cx, s.cz) < s.r * s.r) {
              let enemyNear = false;
              for (const o of bots) if (o.alive && o.team !== bot.team && dist2(o.x, o.z, s.cx, s.cz) < 14 * 14) enemyNear = true;
              if (player.alive && dist2(player.x, player.z, s.cx, s.cz) < 14 * 14) enemyNear = true;
              if (!enemyNear) {
                bot.plantT += dt;
                if (bot.plantT >= 3) { ctx.onPlant(bot, key); bot.plantT = 0; }
              } else bot.plantT = 0;
            }
          }
        }
        // defenders defuse a planted bomb
        if (!bot.isAttacker && bomb.state === 'planted') {
          const s = SITES[bomb.site];
          if (dist2(bot.x, bot.z, s.cx, s.cz) < 2.5 * 2.5) {
            bot.defuseT += dt;
            if (bot.defuseT >= 5) { ctx.onDefuse(bot); bot.defuseT = 0; }
          } else {
            bot.wp = nextWp(bot, bomb.site === 'A' ? 8 : 9);
          }
        }
      }
      // integrate + collide
      const ml = Math.hypot(moveX, moveZ) || 1;
      bot.x += (moveX / ml) * bot.speed * dt;
      bot.z += (moveZ / ml) * bot.speed * dt;
      [bot.x, bot.z] = collideCircle(colliders, bot.x, bot.z, 0.42);
      bot.body.group.position.set(bot.x, 0, bot.z);
      bot.body.group.rotation.y = bot.yaw;
      // crouch the model slightly while engaging
      bot.body.group.scale.y = bot.state === 'engage' ? 0.97 : 1;
    }
  }

  function damage(bot, amount, head) {
    if (!bot.alive) return false;
    bot.hp -= amount;
    if (bot.hp <= 0) { bot.hp = 0; bot.alive = false; bot.body.group.visible = false; return true; }
    return false;
  }

  function aliveCount(team) { return bots.filter((b) => b.alive && b.team === team).length; }

  return { bots, step, hear, damage, aliveCount, spawnAll, canSee };
}
