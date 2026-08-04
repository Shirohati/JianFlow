export type FeedbackType =
  | 'task-done'
  | 'task-done-inhale'
  | 'step-tick'
  | 'pomo-done'
  | 'goal-reached'
  | 'milestone'
  | 'lock-warn';

export interface ToneNote {
  freq: number;
  start: number;
  dur: number;
  vol?: number;
}

export interface SlideSpec {
  from: number;
  to: number;
  dur: number;
  vol: number;
}

export interface SoundPreset {
  kind: 'tones' | 'slide';
  tones?: ToneNote[];
  oscType?: OscillatorType;
  slide?: SlideSpec;
}

export interface ParticlePreset {
  kind: 'confetti' | 'burst' | 'inhale';
  count: number;
}

export interface FeedbackPreset {
  sound?: SoundPreset;
  particles?: ParticlePreset;
  flash?: boolean;
}

export type StyleFeedbackMap = Record<FeedbackType, FeedbackPreset>;

export const DEFAULT_FEEDBACK: StyleFeedbackMap = {
  'task-done': {
    sound: { kind: 'slide', slide: { from: 1000, to: 600, dur: 0.15, vol: 0.12 } },
    particles: { kind: 'burst', count: 14 },
  },
  'task-done-inhale': {
    sound: { kind: 'slide', slide: { from: 1000, to: 600, dur: 0.15, vol: 0.12 } },
    particles: { kind: 'inhale', count: 34 },
  },
  'step-tick': {
    sound: { kind: 'slide', slide: { from: 880, to: 660, dur: 0.12, vol: 0.05 } },
    particles: { kind: 'burst', count: 6 },
  },
  'pomo-done': {
    sound: {
      kind: 'tones',
      tones: [
        { freq: 523.25, start: 0, dur: 0.4 },
        { freq: 659.25, start: 0.12, dur: 0.4 },
        { freq: 783.99, start: 0.24, dur: 0.45 },
        { freq: 1046.5, start: 0.36, dur: 0.6, vol: 0.35 },
      ],
    },
    particles: { kind: 'confetti', count: 80 },
  },
  'goal-reached': {
    sound: {
      kind: 'tones',
      tones: [
        { freq: 523.25, start: 0, dur: 0.4 },
        { freq: 659.25, start: 0.12, dur: 0.4 },
        { freq: 783.99, start: 0.24, dur: 0.45 },
        { freq: 1046.5, start: 0.36, dur: 0.6, vol: 0.35 },
      ],
    },
    particles: { kind: 'confetti', count: 120 },
    flash: true,
  },
  'milestone': {
    sound: {
      kind: 'tones',
      tones: [
        { freq: 523.25, start: 0, dur: 0.25, vol: 0.2 },
        { freq: 659.25, start: 0.1, dur: 0.25, vol: 0.22 },
        { freq: 783.99, start: 0.2, dur: 0.35, vol: 0.25 },
      ],
      oscType: 'triangle',
    },
    particles: { kind: 'confetti', count: 50 },
  },
  'lock-warn': {
    sound: {
      kind: 'tones',
      tones: [
        { freq: 330, start: 0, dur: 0.18, vol: 0.18 },
        { freq: 262, start: 0.2, dur: 0.25, vol: 0.2 },
      ],
    },
  },
};

export const FEEDBACK_STYLES: Record<string, StyleFeedbackMap> = {
  default: DEFAULT_FEEDBACK,
  pop: {
    'task-done': {
      sound: {
        kind: 'tones',
        tones: [
          { freq: 660, start: 0, dur: 0.1, vol: 0.16 },
          { freq: 990, start: 0.08, dur: 0.16, vol: 0.16 },
        ],
        oscType: 'square',
      },
      particles: { kind: 'burst', count: 26 },
    },
    'task-done-inhale': {
      sound: {
        kind: 'tones',
        tones: [
          { freq: 660, start: 0, dur: 0.1, vol: 0.16 },
          { freq: 990, start: 0.08, dur: 0.16, vol: 0.16 },
        ],
        oscType: 'square',
      },
      particles: { kind: 'inhale', count: 46 },
    },
    'step-tick': {
      sound: { kind: 'slide', slide: { from: 880, to: 440, dur: 0.08, vol: 0.07 } },
      particles: { kind: 'burst', count: 10 },
    },
    'pomo-done': {
      sound: {
        kind: 'tones',
        tones: [
          { freq: 523.25, start: 0, dur: 0.18, vol: 0.3 },
          { freq: 659.25, start: 0.12, dur: 0.18, vol: 0.3 },
          { freq: 783.99, start: 0.24, dur: 0.18, vol: 0.3 },
          { freq: 1046.5, start: 0.36, dur: 0.4, vol: 0.4 },
          { freq: 1318.5, start: 0.5, dur: 0.5, vol: 0.35 },
        ],
        oscType: 'square',
      },
      particles: { kind: 'confetti', count: 140 },
      flash: true,
    },
    'goal-reached': {
      sound: {
        kind: 'tones',
        tones: [
          { freq: 523.25, start: 0, dur: 0.15, vol: 0.3 },
          { freq: 659.25, start: 0.1, dur: 0.15, vol: 0.3 },
          { freq: 783.99, start: 0.2, dur: 0.15, vol: 0.3 },
          { freq: 1046.5, start: 0.3, dur: 0.2, vol: 0.35 },
          { freq: 1318.5, start: 0.42, dur: 0.45, vol: 0.35 },
        ],
        oscType: 'square',
      },
      particles: { kind: 'confetti', count: 200 },
      flash: true,
    },
    'milestone': {
      sound: {
        kind: 'tones',
        tones: [
          { freq: 660, start: 0, dur: 0.12, vol: 0.22 },
          { freq: 880, start: 0.1, dur: 0.12, vol: 0.24 },
          { freq: 1100, start: 0.2, dur: 0.2, vol: 0.26 },
        ],
        oscType: 'square',
      },
      particles: { kind: 'confetti', count: 90 },
    },
    'lock-warn': {
      sound: {
        kind: 'tones',
        tones: [
          { freq: 392, start: 0, dur: 0.15, vol: 0.22 },
          { freq: 311, start: 0.18, dur: 0.15, vol: 0.22 },
          { freq: 262, start: 0.36, dur: 0.25, vol: 0.24 },
        ],
        oscType: 'square',
      },
    },
  },
  swiss: {
    'task-done': {
      sound: {
        kind: 'tones',
        tones: [{ freq: 880, start: 0, dur: 0.08, vol: 0.14 }],
        oscType: 'sine',
      },
      particles: { kind: 'burst', count: 8 },
    },
    'task-done-inhale': {
      sound: {
        kind: 'tones',
        tones: [{ freq: 880, start: 0, dur: 0.08, vol: 0.14 }],
        oscType: 'sine',
      },
      particles: { kind: 'inhale', count: 20 },
    },
    'step-tick': {
      sound: { kind: 'slide', slide: { from: 1000, to: 800, dur: 0.06, vol: 0.05 } },
      particles: { kind: 'burst', count: 4 },
    },
    'pomo-done': {
      sound: {
        kind: 'tones',
        tones: [
          { freq: 880, start: 0, dur: 0.3, vol: 0.3 },
          { freq: 1174.66, start: 0.2, dur: 0.3, vol: 0.3 },
          { freq: 1567.98, start: 0.4, dur: 0.5, vol: 0.32 },
        ],
        oscType: 'sine',
      },
      particles: { kind: 'confetti', count: 60 },
    },
    'goal-reached': {
      sound: {
        kind: 'tones',
        tones: [
          { freq: 880, start: 0, dur: 0.25, vol: 0.3 },
          { freq: 1174.66, start: 0.2, dur: 0.25, vol: 0.3 },
          { freq: 1567.98, start: 0.4, dur: 0.5, vol: 0.32 },
        ],
        oscType: 'sine',
      },
      particles: { kind: 'confetti', count: 90 },
      flash: true,
    },
    'milestone': {
      sound: {
        kind: 'tones',
        tones: [
          { freq: 1046.5, start: 0, dur: 0.1, vol: 0.22 },
          { freq: 1318.5, start: 0.12, dur: 0.14, vol: 0.24 },
        ],
        oscType: 'sine',
      },
      particles: { kind: 'confetti', count: 40 },
    },
    'lock-warn': {
      sound: {
        kind: 'tones',
        tones: [
          { freq: 440, start: 0, dur: 0.12, vol: 0.2 },
          { freq: 330, start: 0.16, dur: 0.2, vol: 0.2 },
        ],
        oscType: 'sine',
      },
    },
  },
};
