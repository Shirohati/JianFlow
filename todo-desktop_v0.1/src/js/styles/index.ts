import { setFeedbackStyle } from '../feedback';

export interface AppStyleDef {
  id: string;
  label: string;
  feedbackStyle?: string;
}

export const APP_STYLES: AppStyleDef[] = [
  { id: 'default', label: '经典' },
  { id: 'pop', label: '波普', feedbackStyle: 'pop' },
  { id: 'swiss', label: '瑞士', feedbackStyle: 'swiss' },
];

export function applyAppStyle(style: string): void {
  const def = APP_STYLES.find(s => s.id === style);
  const id = def ? def.id : 'default';
  document.documentElement.setAttribute('data-app-style', id);
  setFeedbackStyle(def?.feedbackStyle ?? 'default');
}
