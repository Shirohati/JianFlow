import { createIcons, icons } from 'lucide';

export function initIcons(): void {
  createIcons({ icons });
}

export function icon(name: string, attrs: string = ''): string {
  return `<i data-lucide="${name}" ${attrs}></i>`;
}
