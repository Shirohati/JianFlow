let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playTones(notes: { freq: number; start: number; dur: number; vol?: number }[], type: OscillatorType = 'sine') {
  const ctx = getCtx();
  const now = ctx.currentTime;
  for (const n of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = n.freq;
    const v = n.vol ?? 0.3;
    gain.gain.setValueAtTime(v, now + n.start);
    gain.gain.exponentialRampToValueAtTime(0.001, now + n.start + n.dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + n.start);
    osc.stop(now + n.start + n.dur);
  }
}

export function playComplete() {
  playTones([
    { freq: 523.25, start: 0, dur: 0.4 },
    { freq: 659.25, start: 0.12, dur: 0.4 },
    { freq: 783.99, start: 0.24, dur: 0.45 },
    { freq: 1046.5, start: 0.36, dur: 0.6, vol: 0.35 },
  ]);
}

export function playMilestone() {
  playTones([
    { freq: 523.25, start: 0, dur: 0.25, vol: 0.2 },
    { freq: 659.25, start: 0.1, dur: 0.25, vol: 0.22 },
    { freq: 783.99, start: 0.2, dur: 0.35, vol: 0.25 },
  ], 'triangle');
}

export function playTaskPop() {
  const ctx = getCtx();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1000, now);
  osc.frequency.exponentialRampToValueAtTime(600, now + 0.12);
  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.15);
}
