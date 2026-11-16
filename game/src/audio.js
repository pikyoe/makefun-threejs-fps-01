// Synthesised sound effects with the Web Audio API — no audio assets, no
// network. Created lazily on first user gesture so autoplay rules never block.
export function createAudio() {
  let ctx = null;
  let master = null;
  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);
      return true;
    } catch { return false; }
  }
  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g); g.connect(master);
    osc.start(t); osc.stop(t + dur + 0.02);
  }
  function noise(dur, vol, low) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = low || 1200;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(filter); filter.connect(g); g.connect(master);
    src.start(t);
  }
  return {
    shot(kind) {
      if (kind === 'sniper') { noise(0.28, 0.9, 900); tone(140, 0.22, 'sawtooth', 0.25, 40); }
      else if (kind === 'smg') { noise(0.08, 0.5, 2200); tone(220, 0.06, 'square', 0.12, 90); }
      else if (kind === 'pistol') { noise(0.12, 0.6, 1600); tone(180, 0.09, 'square', 0.15, 70); }
      else { noise(0.14, 0.7, 1500); tone(160, 0.1, 'sawtooth', 0.2, 60); }
    },
    dryClick() { tone(1200, 0.03, 'square', 0.15); },
    reload() { tone(500, 0.07, 'square', 0.12); setTimeout(() => tone(700, 0.07, 'square', 0.12), 160); },
    hit(head) { tone(head ? 1400 : 1000, 0.06, 'sine', 0.3); },
    hurt() { tone(90, 0.18, 'sawtooth', 0.3, 50); },
    kill() { tone(660, 0.08, 'sine', 0.25); setTimeout(() => tone(990, 0.12, 'sine', 0.25), 90); },
    plant() { tone(440, 0.1, 'sine', 0.25); setTimeout(() => tone(440, 0.1, 'sine', 0.25), 180); },
    beep() { tone(880, 0.09, 'sine', 0.25); },
    boom() { noise(0.7, 1.0, 400); tone(60, 0.6, 'sine', 0.5, 28); },
    roundWin() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'sine', 0.25), i * 140)); },
    roundLose() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'sine', 0.22), i * 150)); },
  };
}
