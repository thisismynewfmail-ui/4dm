// Everything you hear is synthesised at runtime — no audio files, no loading.

const CTX = { ctx: null, master: null, enabled: true, volume: 0.6 };

export function initAudio() {
  if (CTX.ctx) return CTX.ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  CTX.ctx = new AC();
  CTX.master = CTX.ctx.createGain();
  CTX.master.gain.value = CTX.volume;
  CTX.master.connect(CTX.ctx.destination);
  return CTX.ctx;
}
export function resumeAudio() { if (CTX.ctx && CTX.ctx.state === 'suspended') CTX.ctx.resume(); }
export function setVolume(v) { CTX.volume = v; if (CTX.master) CTX.master.gain.value = v; }
export function getVolume() { return CTX.volume; }

function env(node, t0, a, d, peak = 1) {
  node.gain.setValueAtTime(0.0001, t0);
  node.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + a);
  node.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
}

function noiseBuffer(ctx, dur) {
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function tone(freq, dur, type = 'sine', gain = 0.25, detune = 0, slide = 0) {
  const ctx = CTX.ctx; if (!ctx || !CTX.enabled) return;
  const t0 = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t0 + dur);
  o.detune.value = detune;
  env(g, t0, Math.min(0.02, dur * 0.2), dur, gain);
  o.connect(g); g.connect(CTX.master);
  o.start(t0); o.stop(t0 + dur + 0.05);
}

function noise(dur, filterFreq, gain = 0.25, q = 1, type = 'bandpass') {
  const ctx = CTX.ctx; if (!ctx || !CTX.enabled) return;
  const t0 = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, dur + 0.02);
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = filterFreq; f.Q.value = q;
  const g = ctx.createGain();
  env(g, t0, 0.005, dur, gain);
  src.connect(f); f.connect(g); g.connect(CTX.master);
  src.start(t0); src.stop(t0 + dur + 0.05);
}

const STEP_PROFILE = {
  grass:  () => noise(0.08, 900 + Math.random() * 400, 0.10, 0.7, 'lowpass'),
  stone:  () => noise(0.06, 1800 + Math.random() * 700, 0.10, 1.4),
  wood:   () => { noise(0.05, 700, 0.08, 2); tone(180 + Math.random() * 40, 0.05, 'triangle', 0.06); },
  sand:   () => noise(0.09, 2600 + Math.random() * 900, 0.07, 0.6, 'highpass'),
  gravel: () => noise(0.07, 1400 + Math.random() * 600, 0.11, 1.0),
  cloth:  () => noise(0.09, 500, 0.06, 0.7, 'lowpass'),
  glass:  () => { noise(0.04, 4200, 0.06, 3); tone(1800, 0.05, 'sine', 0.04); },
};

export const sfx = {
  step(mat) { (STEP_PROFILE[mat] || STEP_PROFILE.stone)(); },
  dig(mat) { (STEP_PROFILE[mat] || STEP_PROFILE.stone)(); },
  break(mat) {
    (STEP_PROFILE[mat] || STEP_PROFILE.stone)();
    noise(0.16, 900, 0.16, 0.8, 'lowpass');
  },
  place(mat) { (STEP_PROFILE[mat] || STEP_PROFILE.stone)(); tone(120, 0.06, 'sine', 0.08); },
  pickup() { tone(880, 0.07, 'triangle', 0.10, 0, 1.6); },
  craft() { tone(520, 0.09, 'triangle', 0.12); setTimeout(() => tone(780, 0.11, 'triangle', 0.10), 70); },
  click() { tone(1200, 0.03, 'square', 0.05); },
  uiOpen() { tone(420, 0.07, 'triangle', 0.08, 0, 1.4); },
  uiClose() { tone(420, 0.07, 'triangle', 0.08, 0, 0.7); },
  hurt() { tone(160, 0.18, 'sawtooth', 0.16, 0, 0.55); noise(0.12, 500, 0.10, 0.8, 'lowpass'); },
  die() { tone(220, 0.7, 'sawtooth', 0.18, 0, 0.25); },
  hit() { noise(0.06, 1200, 0.14, 1.2); tone(300, 0.06, 'square', 0.06, 0, 0.7); },
  phaseStart() { tone(260, 0.55, 'sine', 0.12, 0, 2.4); tone(392, 0.55, 'sine', 0.07, 12, 2.1); },
  phaseEnd() { tone(520, 0.35, 'sine', 0.10, 0, 0.5); },
  phaseBlocked() { tone(90, 0.24, 'square', 0.14, 0, 0.6); noise(0.2, 260, 0.10, 0.7, 'lowpass'); },
  phaseTick() { tone(1300 + Math.random() * 200, 0.03, 'sine', 0.035); },
  levelUp() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'triangle', 0.10), i * 90)); },
  mobIdle(kind) {
    if (kind === 'hostile') tone(120 + Math.random() * 60, 0.35, 'sawtooth', 0.06, 0, 0.7);
    else tone(300 + Math.random() * 200, 0.18, 'triangle', 0.05, 0, 1.2);
  },
  door() { noise(0.2, 400, 0.09, 0.6, 'lowpass'); },
  splash() { noise(0.3, 1200, 0.12, 0.5, 'lowpass'); },
  eat() { noise(0.12, 600, 0.08, 0.8, 'lowpass'); },
};
