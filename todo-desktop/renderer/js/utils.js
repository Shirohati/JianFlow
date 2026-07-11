// UTILS - 工具函数
window.Utils = {
  getTodayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  },

  formatDate(d) {
    if (typeof d === 'string') d = new Date(d + 'T00:00:00');
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  },

  getWeekDay(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
  },

  formatDateDisplay(dateStr) {
    const parts = dateStr.split('-');
    return parts[0] + '年' + parseInt(parts[1]) + '月' + parseInt(parts[2]) + '日 ' + this.getWeekDay(dateStr);
  },

  formatMinutes(minutes) {
    if (!minutes || minutes <= 0) return '0分';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return m + '分';
    if (m === 0) return h + '小时';
    return h + '小时' + m + '分';
  },

  formatMinutesShort(minutes) {
    if (!minutes || minutes <= 0) return '0h';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return m + 'm';
    if (m === 0) return h + 'h';
    return h + 'h' + m + 'm';
  },

  formatTimerDisplay(totalSeconds) {
    const abs = Math.abs(totalSeconds);
    const h = Math.floor(abs / 3600);
    const m = Math.floor((abs % 3600) / 60);
    const s = abs % 60;
    if (h > 0) {
      return String(h) + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  },

  getHeatLevel(minutes) {
    if (minutes <= 0) return 0;
    if (minutes <= 60) return 1;
    if (minutes <= 120) return 2;
    if (minutes <= 240) return 3;
    if (minutes <= 360) return 4;
    if (minutes <= 480) return 5;
    return 6;
  },

  getMonday(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const day = d.getDay();
    const offset = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + offset);
    return this.formatDate(d);
  },

  getSunday(mondayStr) {
    const d = new Date(mondayStr + 'T00:00:00');
    d.setDate(d.getDate() + 6);
    return this.formatDate(d);
  },

  generateId(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  priorityLabel(priority) {
    return ['', '🟢 低', '🟡 中', '🔴 高'][priority] || '';
  },

  priorityClass(priority) {
    return ['', 'priority-low', 'priority-mid', 'priority-high'][priority] || '';
  },

  debounce(fn, delay) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  },

  showToast(msg) {
    if (window._toastTimer) clearTimeout(window._toastTimer);
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    window._toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
  },

  shakeElement(el) {
    el.style.animation = 'none';
    el.offsetHeight;
    el.style.animation = 'shake 0.4s ease';
    setTimeout(() => { el.style.animation = ''; }, 400);
  }
};

window.UndoManager = {
  stack: [],
  maxSize: 20,

  push(action) {
    this.stack.push(action);
    if (this.stack.length > this.maxSize) this.stack.shift();
  },

  pop() {
    return this.stack.pop();
  },

  isEmpty() {
    return this.stack.length === 0;
  },

  clear() {
    this.stack = [];
  }
};
