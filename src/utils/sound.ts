let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctx = w.AudioContext || w.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) {
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function beep(freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.15, delay = 0) {
  const ctx = getCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(ctx.destination);
  const startTime = ctx.currentTime + delay;
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

export const playSound = {
  select: () => beep(680, 0.06, 'triangle', 0.12),
  deselect: () => beep(420, 0.05, 'triangle', 0.08),
  play: () => {
    beep(280, 0.09, 'square', 0.12);
    beep(480, 0.11, 'square', 0.1, 0.05);
  },
  pass: () => beep(200, 0.16, 'sine', 0.1),
  special: () => {
    beep(440, 0.08, 'sawtooth', 0.13);
    beep(660, 0.1, 'sawtooth', 0.12, 0.08);
    beep(880, 0.16, 'sawtooth', 0.12, 0.16);
  },
  ability: () => {
    beep(523, 0.1, 'sine', 0.14);
    beep(784, 0.16, 'sine', 0.14, 0.1);
  },
};
