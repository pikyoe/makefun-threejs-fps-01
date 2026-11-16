# Emberline Protocol

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/pikyoe/makefun-threejs-fps-01/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/pikyoe/makefun-threejs-fps-01/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A round-based tactical first-person shooter in three.js, built for the
make.fun threejs-fps-02 competition. 5v5 in the Foundry Yard: Vanguard
attacks, Ember defends. Win a round by eliminating the other team, by
planting the charge at Furnace or Dock and letting it detonate, or by
defusing it. First to 5 rounds takes the match.

## How to run

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. Click to play
(pointer lock). No network request is made; three.js 0.187.0 is vendored
under `game/vendor/three/`.

## Controls

- **W A S D** move · **Mouse** look · **Click** fire
- **R** reload · **Ctrl** crouch · **Shift** walk · **Space** jump
- **1–4** switch weapon · **G** throw grenade · **E** plant / defuse · **B** buy menu

## The game

- **Weapons:** VK-7 rifle, Hornet SMG, Longshot sniper, P9 pistol, frag
  grenade. Each has its own fire rate, magazine, damage, recoil and
  spread; headshots deal 2–2.5× damage.
- **Gunplay:** spread grows while moving and firing, shrinks when
  crouched or still; movement uses acceleration and friction; collision
  with the map is AABB-based.
- **Tactics:** money earned per kill and per round, spent in the buy menu
  between rounds; bots follow waypoint routes through three lanes, hold
  the bomb sites, react to what they see and hear, plant and defuse.
- **Rounds:** 100-second rounds with a 15-second buy phase; the HUD shows
  health, ammunition, round timer, score, money, alive counts and the
  bomb status.

## Layout

- `game/index.html` — page, HUD, import map
- `game/src/main.js` — boot, fixed 60 Hz loop, shooting, rounds, bomb
- `game/src/state.js` — the one shared state object + weapon table
- `game/src/world.js` — the Foundry Yard map, colliders, waypoints
- `game/src/player.js` — movement, health, view-model gun
- `game/src/bots.js` — bot AI: patrol, engage, hold, plant, defuse
- `game/src/weapon.js` — fire rate, reload, recoil, spread
- `game/src/hud.js` — HUD updates
- `game/src/input.js` — keyboard + mouse / pointer lock
- `game/src/audio.js` — synthesised sound effects (Web Audio, no assets)
- `main.ts` — hands the game in (copies `game/` + `screenshots/`, writes
  `dossier.json`); `serve.ts` — local static server

## Screenshots

`?shot=start|play|end&seed=N` renders a deterministic frame for capture:
buy phase, a mid-round firefight, and a won round.

## License

MIT — see `LICENSE`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=090ndaza&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
