// APP - 导航、初始化
(function () {
  const U = window.Utils;
  window.App = {
    currentDate: U.getTodayStr(),
    currentPage: 'home',

    async init() {
      this.currentDate = U.getTodayStr();
      await this.loadTheme();
      this.bindNavEvents();
      this.bindGlobalEvents();
      this.showPage('home');
      if (window.Todos) window.Todos.init();
      if (window.PomoPresets) window.PomoPresets.init();
      if (window.DailyLog) window.DailyLog.init();
      if (window.Calendar) window.Calendar.init();
      if (window.Countdown) window.Countdown.init();
      if (window.Timetable) window.Timetable.init();
      if (window.Stats) window.Stats.init();
      if (window.Settings) { window.Settings.init(); window.Settings.loadBgs(); }
    },

    async loadTheme() {
      try {
        const theme = await window.todoAPI.getSetting('theme');
        document.documentElement.setAttribute('data-theme', theme || 'warm');
      } catch (e) { document.documentElement.setAttribute('data-theme', 'warm'); }
    },

    bindNavEvents() {
      document.querySelectorAll('.sidebar-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const page = btn.dataset.page;
          if (page) this.showPage(page);
        });
      });
    },

    bindGlobalEvents() {
      window.todoAPI.onFocusAddTodo(() => {
        this.showPage('home');
        setTimeout(() => { const inp = document.getElementById('todoInput'); if (inp) inp.focus(); }, 100);
      });

      document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
          e.preventDefault();
          this.undoLastAction();
        }
        if (e.key === 'F12' && e.ctrlKey) {
          e.preventDefault();
          this.testRecurringNextDay();
        }
      });
    },

    async testRecurringNextDay() {
      const d = new Date(this.currentDate + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      const nextDate = U.formatDate(d);
      try {
        const created = await window.todoAPI.generateRecurringTasks(nextDate);
        window.Utils.showToast(`测试 ${nextDate}: 生成 ${created} 条`);
      } catch (e) {
        window.Utils.showToast('测试失败: ' + e.message);
      }
    },

    async undoLastAction() {
      if (window.UndoManager.isEmpty()) {
        window.Utils.showToast('没有可撤销的操作');
        return;
      }
      const action = window.UndoManager.pop();
      try {
        await action.undo();
        window.Utils.showToast('已撤销');
        if (window.Todos) window.Todos.renderAll();
        if (window.Stats) window.Stats.render();
      } catch (e) {
        window.Utils.showToast('撤销失败');
      }
    },

    showPage(name) {
      this.currentPage = name;
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.sidebar-btn').forEach(b => b.classList.remove('active'));
      const el = document.getElementById('page-' + name);
      if (el) el.classList.add('active');
      const nb = document.querySelector('.sidebar-btn[data-page="' + name + '"]');
      if (nb) nb.classList.add('active');

      if (name === 'home') {
        if (window.Todos) window.Todos.renderAll();
        if (window.DailyLog) window.DailyLog.render();
        if (window.PomoPresets) window.PomoPresets.render();
      }
      if (name === 'report') {
        if (window.Timetable) window.Timetable.render();
        if (window.Stats) window.Stats.render();
      }
      if (name === 'calendar-page') {
        if (window.Calendar) window.Calendar.render();
      }
      if (name === 'countdown-page') {
        if (window.Countdown) window.Countdown.render();
      }
      if (name === 'settings-page') {
        if (window.Settings) window.Settings.render();
      }
    },

    setCurrentDate(dateStr) {
      if (dateStr === this.currentDate) return;
      this.currentDate = dateStr;
      if (window.Todos) window.Todos.renderAll();
      if (window.DailyLog) window.DailyLog.render();
      if (window.Todos) window.Todos.renderDateBadge();
    },

    goToToday() { this.setCurrentDate(U.getTodayStr()); },
    goPrevDay() {
      const d = new Date(this.currentDate + 'T00:00:00');
      d.setDate(d.getDate() - 1);
      this.setCurrentDate(U.formatDate(d));
    },
    goNextDay() {
      const d = new Date(this.currentDate + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      this.setCurrentDate(U.formatDate(d));
    }
  };

  document.addEventListener('DOMContentLoaded', () => window.App.init());
})();
