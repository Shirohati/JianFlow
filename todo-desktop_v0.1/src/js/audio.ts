let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

export function playTones(notes: { freq: number; start: number; dur: number; vol?: number }[], type: OscillatorType = 'sine') {
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

export function playSlide(spec: { from: number; to: number; dur: number; vol: number }) {
  const ctx = getCtx();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(spec.from, now);
  osc.frequency.exponentialRampToValueAtTime(spec.to, now + spec.dur);
  gain.gain.setValueAtTime(spec.vol, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + spec.dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + spec.dur);
}
