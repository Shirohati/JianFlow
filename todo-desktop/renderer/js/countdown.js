// COUNTDOWN - 日期倒计时
(function () {
  const U = window.Utils;
  const API = window.todoAPI;

  let countdowns = [];
  let cdInterval = null;

  window.Countdown = {
    init() {
      this.bindEvents();
    },

    bindEvents() {
      document.getElementById('btnAddCountdown').addEventListener('click', () => this.addCountdown());
    },

    async render() {
      await this.load();
      this.renderList();
      this.startTick();
    },

    async load() {
      try { countdowns = await API.getCountdowns(); } catch (e) { countdowns = []; }
    },

    async addCountdown() {
      const title = document.getElementById('cdTitleInput').value.trim();
      const date = document.getElementById('cdDateInput').value;
      const color = document.getElementById('cdColorInput').value;
      if (!title || !date) { U.showToast('请填写名称和日期'); return; }
      await API.addCountdown(title, date, color);
      document.getElementById('cdTitleInput').value = '';
      document.getElementById('cdDateInput').value = '';
      await this.render();
      U.showToast('倒计时已添加');
    },

    async deleteCountdown(id) {
      await API.deleteCountdown(id);
      await this.render();
    },

    renderList() {
      const el = document.getElementById('countdownList');
      el.innerHTML = '';
      if (countdowns.length === 0) {
        el.innerHTML = '<div style="font-size:0.85rem;color:var(--text-lighter);padding:12px 0">暂无倒计时，添加一个吧</div>';
        return;
      }
      const now = Date.now();
      countdowns.forEach(cd => {
        const target = new Date(cd.target_date + 'T00:00:00').getTime();
        const diff = target - now;
        const passed = diff <= 0;

        let displayStr;
        if (passed) {
          const since = Math.abs(diff);
          const d = Math.floor(since / 86400000);
          displayStr = '已过 ' + d + ' 天';
        } else {
          const d = Math.floor(diff / 86400000);
          const h = Math.floor((diff % 86400000) / 3600000);
          const m = Math.floor((diff % 3600000) / 60000);
          const s = Math.floor((diff % 60000) / 1000);
          displayStr = d + '天 ' + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
        }

        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;background:var(--card-bg);border:1px solid var(--border-light)';
        row.innerHTML = `
          <span style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:${cd.color}"></span>
          <span style="flex:1;font-weight:600;font-size:0.9rem">${U.escapeHtml(cd.title)}</span>
          <span style="font-size:0.8rem;font-variant-numeric:tabular-nums;color:${passed ? 'var(--text-lighter)' : 'var(--primary)'};font-weight:600">${displayStr}</span>
          <span style="font-size:0.7rem;color:var(--text-lighter)">${cd.target_date}</span>
          <button style="width:24px;height:24px;border-radius:50%;border:none;background:transparent;cursor:pointer;color:var(--text-lighter);font-size:0.8rem" title="删除" data-cd-id="${cd.id}">✕</button>`;
        row.querySelector('button').addEventListener('click', (e) => { e.stopPropagation(); this.deleteCountdown(cd.id); });
        el.appendChild(row);
      });
    },

    startTick() {
      clearInterval(cdInterval);
      cdInterval = setInterval(() => {
        if (window.App.currentPage === 'countdown-page') this.renderList();
      }, 1000);
    }
  };
})();
