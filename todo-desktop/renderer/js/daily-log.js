// DAILY LOG - 折叠面板 + 日志
(function () {
  const U = window.Utils;
  const API = window.todoAPI;

  let logSaveTimer;
  const foldConfigs = [
    { header: 'foldHeaderPlan', body: 'foldBodyPlan', arrow: 'arrowPlan', textarea: 'masterPlan', settingKey: 'master_plan', dot: 'dotPlan', foldKey: 'fold_plan' },
    { header: 'foldHeaderRef', body: 'foldBodyRef', arrow: 'arrowRef', textarea: 'masterReflection', settingKey: 'master_reflection', dot: 'dotRef', foldKey: 'fold_reflection' },
    { header: 'foldHeaderLog', body: 'foldBodyLog', arrow: 'arrowLog', textarea: 'dailyLog', settingKey: null, dot: 'dotLog', isDaily: true, foldKey: 'fold_log' }
  ];

  window.DailyLog = {
    foldStates: { fold_plan: true, fold_reflection: true, fold_log: true },

    async init() {
      await this.loadFoldStates();
      this.bindEvents();
      this.render();
    },

    async loadFoldStates() {
      for (const f of foldConfigs) {
        try {
          const val = await API.getSetting(f.foldKey);
          this.foldStates[f.foldKey] = val !== 'false';
        } catch (e) {}
      }
    },

    bindEvents() {
      for (const f of foldConfigs) {
        const hdr = document.getElementById(f.header);
        const body = document.getElementById(f.body);
        const arrow = document.getElementById(f.arrow);
        const ta = document.getElementById(f.textarea);
        const dot = document.getElementById(f.dot);

        const isOpen = this.foldStates[f.foldKey];
        body.style.display = isOpen ? 'block' : 'none';
        if (isOpen) arrow.classList.add('open');

        hdr.addEventListener('click', async () => {
          const open = body.style.display !== 'none';
          if (open) {
            body.style.display = 'none';
            arrow.classList.remove('open');
            this.foldStates[f.foldKey] = false;
          } else {
            body.style.display = 'block';
            arrow.classList.add('open');
            this.foldStates[f.foldKey] = true;
            setTimeout(() => ta.focus(), 100);
          }
          try { await API.setSetting(f.foldKey, this.foldStates[f.foldKey] ? 'true' : 'false'); } catch (e) {}
          this.saveField(f);
        });

        ta.addEventListener('blur', () => this.saveField(f));
        ta.addEventListener('input', U.debounce(() => this.saveField(f), 800));

        if (f.isDaily) {
          ta.addEventListener('input', () => {
            clearTimeout(logSaveTimer);
            logSaveTimer = setTimeout(() => this.saveField(f), 600);
          });
        }
      }
    },

    async saveField(f) {
      try {
        const ta = document.getElementById(f.textarea);
        const val = ta.value;
        if (f.isDaily) {
          await API.setDailyLog(window.App.currentDate, val);
        } else if (f.settingKey) {
          await API.setSetting(f.settingKey, val);
        }
        this.updateDot(f.dot, val);
      } catch (e) {}
    },

    updateDot(dotId, content) {
      const dot = document.getElementById(dotId);
      if (dot) dot.classList.toggle('filled', content && content.trim());
    },

    async render() {
      try {
        const date = window.App.currentDate;
        const dailyVal = await API.getDailyLog(date);
        document.getElementById('dailyLog').value = dailyVal;
        const planVal = await API.getSetting('master_plan') || '';
        document.getElementById('masterPlan').value = planVal;
        const refVal = await API.getSetting('master_reflection') || '';
        document.getElementById('masterReflection').value = refVal;
        this.updateDot('dotPlan', planVal);
        this.updateDot('dotRef', refVal);
        this.updateDot('dotLog', dailyVal);
      } catch (e) {}
    }
  };
})();
