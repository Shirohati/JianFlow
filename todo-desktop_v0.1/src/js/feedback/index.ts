import { DEFAULT_FEEDBACK, FEEDBACK_STYLES, type FeedbackPreset, type FeedbackType, type StyleFeedbackMap } from './presets';
import { playTones, playSlide } from '../audio';
import { triggerConfetti, triggerBurst, triggerInhale, triggerScreenFlash } from '../confetti';

let currentStyle = 'default';

export function setFeedbackStyle(style: string): void {
  currentStyle = FEEDBACK_STYLES[style] ? style : 'default';
}

export function getFeedbackStyle(): string {
  return currentStyle;
}

export function getFeedbackPresets(): StyleFeedbackMap {
  return FEEDBACK_STYLES[currentStyle] ?? DEFAULT_FEEDBACK;
}

function preset(type: FeedbackType): FeedbackPreset {
  const map = FEEDBACK_STYLES[currentStyle] ?? DEFAULT_FEEDBACK;
  return map[type];
}

export function feedbackSound(type: FeedbackType): void {
  const snd = preset(type)?.sound;
  if (!snd) return;
  if (snd.kind === 'tones' && snd.tones) {
    playTones(snd.tones, snd.oscType);
  } else if (snd.kind === 'slide' && snd.slide) {
    playSlide(snd.slide);
  }
}

export function feedbackBurst(type: FeedbackType, x?: number, y?: number): void {
  const p = preset(type)?.particles;
  if (!p) return;
  const px = x ?? window.innerWidth / 2;
  const py = y ?? window.innerHeight / 2;
  if (p.kind === 'confetti') triggerConfetti(p.count);
  else if (p.kind === 'burst') triggerBurst(px, py, p.count);
  else if (p.kind === 'inhale') triggerInhale(px, py, p.count);
}

export function feedbackFlash(): void {
  triggerScreenFlash();
}

export function feedbackAll(type: FeedbackType, x?: number, y?: number): void {
  feedbackSound(type);
  feedbackBurst(type, x, y);
}
