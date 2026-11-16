// HUD: all DOM reads cached once; updates write textContent/style only when
// the value changed, so the HUD costs nothing when idle.
export function createHud() {
  const el = {};
  for (const id of ['timer', 'round-num', 'score-ally', 'score-enemy', 'alive-ally',
    'alive-enemy', 'bombline', 'healthfill', 'healthnum', 'ammo-mag', 'ammo-reserve',
    'ammo', 'weapon-name', 'money', 'killfeed', 'prompt', 'banner', 'banner-title',
    'banner-sub', 'buy', 'overlay', 'overlay-copy', 'hitmarker', 'damage', 'crosshair']) {
    el[id] = document.getElementById(id);
  }
  const cache = new Map();
  let hitTimer = 0;
  let showBannerT = 0;
  function set(id, value) {
    if (cache.get(id) !== value) { cache.set(id, value); el[id].textContent = value; }
  }
  function fmtTime(t) {
    const s = Math.max(0, Math.ceil(t));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  return {
    setTimer(t) { set('timer', fmtTime(t)); el.timer.classList.toggle('low', t <= 10); },
    setRound(n) { set('round-num', String(n)); },
    setScore(a, e) { set('score-ally', String(a)); set('score-enemy', String(e)); },
    setAlive(a, e) { set('alive-ally', String(a)); set('alive-enemy', String(e)); },
    setBomb(text) { set('bombline', text); },
    setHealth(hp) {
      set('healthnum', String(Math.ceil(hp)));
      const pct = `${Math.max(0, hp)}%`;
      if (cache.get('hpfill') !== pct) { cache.set('hpfill', pct); el.healthfill.style.width = pct; }
      el.healthfill.style.background = hp > 50 ? '#57d977' : hp > 25 ? '#ff7a1a' : '#ff4d3d';
    },
    setAmmo(mag, reserve, name) {
      set('ammo-mag', String(mag)); set('ammo-reserve', `/ ${reserve}`);
      set('weapon-name', name);
      el.ammo.classList.toggle('empty', mag === 0);
    },
    setMoney(m) { set('money', `$${m}`); },
    setKillfeed(lines) {
      const html = lines.map((l) => `<div><span class="${l.killerTeam}">${l.killer}</span> ▸ <span class="${l.victimTeam}">${l.victim}</span>${l.head ? ' <b style="color:#ffd23d">HEADSHOT</b>' : ''}</div>`).join('');
      if (cache.get('feed') !== html) { cache.set('feed', html); el.killfeed.innerHTML = html; }
    },
    setPrompt(text) {
      if (text) { el.prompt.hidden = false; set('prompt', text); }
      else el.prompt.hidden = true;
    },
    showBanner(title, sub, ms) {
      set('banner-title', title); set('banner-sub', sub);
      el.banner.hidden = false;
      clearTimeout(showBannerT); showBannerT = setTimeout(() => { el.banner.hidden = true; }, ms || 2600);
    },
    hitmarker(head) {
      el.hitmarker.classList.add('on');
      el.hitmarker.classList.toggle('head', !!head);
      clearTimeout(hitTimer); hitTimer = setTimeout(() => el.hitmarker.classList.remove('on'), 110);
    },
    damageFlash() {
      el.damage.style.opacity = '1';
      setTimeout(() => { el.damage.style.opacity = '0'; }, 130);
    },
    setBuy(open) { el.buy.hidden = !open; },
    setOverlay(open, copy) {
      el.overlay.hidden = !open;
      if (copy) set('overlay-copy', copy);
    },
    onPlay(fn) { document.getElementById('play').addEventListener('click', fn); },
    setCrosshairSpread(px) {
      const v = `${px}px`;
      if (cache.get('spread') !== v) { cache.set('spread', v); el.crosshair.style.width = v; el.crosshair.style.height = v; }
    },
  };
}
