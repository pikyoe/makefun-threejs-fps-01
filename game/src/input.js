// Keyboard + mouse input. Pointer lock on the canvas; mouse deltas accumulate
// into look deltas the simulation consumes once per fixed step.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const state = {
    forward: 0, strafe: 0, crouch: false, walk: false, jump: false,
    firing: false, reload: false, yawDelta: 0, pitchDelta: 0,
    weaponSlot: 0, grenade: false, interact: false, buyToggle: false,
    locked: false,
  };
  let queuedSlot = 0;
  let queuedGrenade = false;
  let queuedInteract = false;
  let queuedBuy = false;
  let queuedReload = false;
  let queuedJump = false;

  function code(e) { return e.code; }
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys.add(code(e));
    if (code(e) === 'KeyR') queuedReload = true;
    if (code(e) === 'KeyG') queuedGrenade = true;
    if (code(e) === 'KeyE') queuedInteract = true;
    if (code(e) === 'KeyB') queuedBuy = true;
    if (code(e) === 'Space') { queuedJump = true; e.preventDefault(); }
    if (code(e).startsWith('Digit')) {
      const n = Number(code(e).slice(5));
      if (n >= 1 && n <= 4) queuedSlot = n;
    }
    if (['KeyW','KeyA','KeyS','KeyD','ControlLeft','ShiftLeft'].includes(code(e))) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(code(e)));
  window.addEventListener('blur', () => { keys.clear(); state.firing = false; });
  canvas.addEventListener('mousedown', (e) => { if (e.button === 0) state.firing = true; });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) state.firing = false; });
  document.addEventListener('mousemove', (e) => {
    if (!state.locked) return;
    state.yawDelta -= e.movementX * 0.0022;
    state.pitchDelta -= e.movementY * 0.0022;
  });
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (onLockChange) onLockChange(state.locked);
  });

  function requestLock() { canvas.requestPointerLock(); }
  function releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  // Called once per fixed step: fold held keys + one-shot queues into state.
  function poll() {
    state.forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    state.strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    state.crouch = keys.has('ControlLeft') || keys.has('KeyC');
    state.walk = keys.has('ShiftLeft');
    state.jump = queuedJump; queuedJump = false;
    state.reload = queuedReload; queuedReload = false;
    state.grenade = queuedGrenade; queuedGrenade = false;
    state.interact = queuedInteract; queuedInteract = false;
    state.buyToggle = queuedBuy; queuedBuy = false;
    state.weaponSlot = queuedSlot; queuedSlot = 0;
    return state;
  }
  return { state, poll, requestLock, releaseLock };
}
