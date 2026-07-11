const WEEK_DAYS = ['日', '一', '二', '三', '四', '五', '六'];

export const utils = {
  getTodayStr(): string {
    return utils.formatDate(new Date());
  },

  formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  getWeekDay(dateStr: string): string {
    const d = new Date(dateStr);
    return `周${WEEK_DAYS[d.getDay()]}`;
  },

  formatDateDisplay(dateStr: string): string {
    const d = new Date(dateStr);
    const m = d.getMonth() + 1;
    const day = d.getDate();
    return `${m}月${day}日 ${utils.getWeekDay(dateStr)}`;
  },

  formatMinutes(minutes: number): string {
    if (minutes < 60) return `${minutes}分钟`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}小时${m}分钟` : `${h}小时`;
  },

  formatMinutesShort(minutes: number): string {
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h${m}m` : `${h}h`;
  },

  formatTimerDisplay(totalSeconds: number): string {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  },

  getHeatLevel(minutes: number): number {
    if (minutes === 0) return 0;
    if (minutes <= 60) return 1;
    if (minutes <= 120) return 2;
    if (minutes <= 240) return 3;
    if (minutes <= 360) return 4;
    if (minutes <= 480) return 5;
    return 6;
  },

  generateId(prefix: string = ''): string {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).substring(2, 8);
    return prefix ? `${prefix}_${ts}${rand}` : `${ts}${rand}`;
  },

  escapeHtml(str: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return str.replace(/[&<>"']/g, c => map[c]);
  },

  debounce(fn: (...args: unknown[]) => void, ms: number): (...args: unknown[]) => void {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return (...args: unknown[]) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  },

  clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  },

  snapToGrid(value: number, step: number): number {
    return Math.round(value / step) * step;
  },
};
