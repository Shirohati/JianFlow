import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/pages.css';
import './styles/dark.css';
import { store } from './js/store';
import { router } from './js/router';
import { settingsApi } from './js/api';
import { initIcons } from './js/icons';
import { utils } from './js/utils';
import { homePage } from './js/pages/home';
import { boardPage } from './js/pages/board';
import { pomodoroPage } from './js/pages/pomodoro';
import { reportPage } from './js/pages/report';
import { calendarPage } from './js/pages/calendar';
import { settingsPage } from './js/pages/settings';
import { history } from './js/history';

async function init() {
  const settings = await settingsApi.get();
  store.set('settings', settings);
  store.set('currentDate', utils.getTodayStr());

  document.documentElement.setAttribute('data-theme', settings.theme);

  router.init();
  router.onPageEnter('home', () => homePage.init());
  router.onPageEnter('board', () => boardPage.init());
  router.onPageEnter('pomodoro', () => pomodoroPage.init());
  router.onPageEnter('report', () => reportPage.init());
  router.onPageEnter('calendar', () => calendarPage.init());
  router.onPageEnter('settings', () => settingsPage.init());

  initIcons();
  router.navigate('home');

  document.addEventListener('keydown', (e) => {
    // Only handle undo/redo on board page
    const boardPage = document.getElementById('page-board');
    if (!boardPage || boardPage.style.display === 'none') return;
    if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      history.undo();
    }
    if (e.ctrlKey && e.key === 'z' && e.shiftKey) {
      e.preventDefault();
      history.redo();
    }
  });
}

init();
