import { store } from './store';

type PageCallback = () => void;

const pageCallbacks: Map<string, PageCallback> = new Map();

export const router = {
  init(): void {
    document.querySelectorAll('.sidebar-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const page = (btn as HTMLElement).dataset.page;
        if (page) {
          router.navigate(page);
        }
      });
    });
  },

  navigate(page: string): void {
    store.set('currentPage', page);

    document.querySelectorAll('.page').forEach(el => {
      el.classList.remove('page--active');
    });
    const target = document.getElementById('page-' + page);
    if (target) {
      target.classList.add('page--active');
    }

    document.querySelectorAll('.sidebar-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    const activeBtn = document.querySelector(`.sidebar-btn[data-page="${page}"]`);
    if (activeBtn) {
      activeBtn.classList.add('active');
    }

    const callback = pageCallbacks.get(page);
    if (callback) {
      callback();
    }
  },

  onPageEnter(page: string, callback: PageCallback): void {
    pageCallbacks.set(page, callback);
  },
};
