export const toast = {
  show(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info', duration: number = 2500): void {
    const container = document.querySelector('.toast-container');
    if (!container) return;

    const existing = container.querySelectorAll('.toast');
    if (existing.length >= 3) {
      const oldest = existing[0] as HTMLElement;
      oldest.classList.remove('toast-show');
      oldest.classList.add('toast-hide');
      setTimeout(() => oldest.remove(), 300);
    }

    const duplicate = Array.from(container.querySelectorAll('.toast')).find(
      el => el.textContent === message && el.classList.contains(`toast--${type}`)
    );
    if (duplicate) return;

    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.textContent = message;
    container.appendChild(el);

    requestAnimationFrame(() => {
      el.classList.add('toast-show');
    });

    setTimeout(() => {
      el.classList.remove('toast-show');
      el.classList.add('toast-hide');
      const onEnd = () => {
        el.remove();
        el.removeEventListener('transitionend', onEnd);
      };
      el.addEventListener('transitionend', onEnd);
      setTimeout(() => el.remove(), 500);
    }, duration);
  },

  success(message: string): void {
    toast.show(message, 'success');
  },

  error(message: string): void {
    toast.show(message, 'error');
  },

  info(message: string): void {
    toast.show(message, 'info');
  },

  warning(message: string): void {
    toast.show(message, 'warning');
  },
};
