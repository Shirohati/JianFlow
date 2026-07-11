import { createIcons, icons } from 'lucide';

export function initIcons(): void {
  createIcons({ icons });
}

export function getIconHTML(name: string, attrs?: Record<string, string>): string {
  const attrStr = attrs
    ? Object.entries(attrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ')
    : '';
  return `<i data-lucide="${name}" ${attrStr}></i>`;
}
