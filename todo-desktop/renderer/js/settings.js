// SETTINGS - 设置页面
(function () {
  const U = window.Utils;
  const API = window.todoAPI;

  let timeTypes = [];
  let presets = [];

  window.Settings = {
    init() {
      this.bindEvents();
    },

    bindEvents() {
      // Theme
      document.querySelectorAll('.theme-btn').forEach(b => {
        b.addEventListener('click', () => this.setTheme(b.dataset.theme));
      });

      // Time types
      document.getElementById('btnAddTimeType').addEventListener('click', () => this.addTimeType());

      // Import
      document.getElementById('btnBulkImport').addEventListener('click', () => this.bulkImport());
      document.getElementById('btnDetailImport').addEventListener('click', () => this.detailImport());

      // Goals
      document.getElementById('btnSaveGoals').addEventListener('click', () => this.saveGoals());

      // Quotes
      document.getElementById('btnAddQuote').addEventListener('click', () => this.addQuote());
      document.getElementById('quoteInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); this.addQuote(); }
      });
      document.getElementById('quoteMode').addEventListener('change', () => this.saveQuoteSettings());
      document.getElementById('quoteInterval').addEventListener('change', () => this.saveQuoteSettings());

      // Background
      document.getElementById('btnBgHome').addEventListener('click', () => this.setBg('home'));
      document.getElementById('btnBgPomodoro').addEventListener('click', () => this.setBg('pomodoro'));
      document.getElementById('btnBgClear').addEventListener('click', () => this.clearBg());

      // Audio
      document.getElementById('btnAddAudio').addEventListener('click', () => this.addAudio());

      // Export
      document.getElementById('btnExportCSV').addEventListener('click', () => this.exportCSV());
      document.getElementById('btnExportJSON').addEventListener('click', () => this.exportJSON());

      // Presets
      document.getElementById('btnAddPreset').addEventListener('click', () => this.addPreset());

      // Auto migrate
      document.getElementById('autoMigrate').addEventListener('change', () => {
        API.setSetting('move_uncompleted', document.getElementById('autoMigrate').checked ? 'true' : 'false');
      });

      // Preset edit modal
      document.getElementById('btnPresetEditCancel').addEventListener('click', () => {
        document.getElementById('presetEditOverlay').classList.remove('open');
      });
      document.getElementById('btnPresetEditSave').addEventListener('click', () => this.savePresetEdit());
    },

    async render() {
      await this.loadAll();
      this.renderTimeTypes();
      this.renderQuotes();
      this.renderGoals();
      this.renderPresets();
      this.renderAudioList();
      this.fillImportSelects();
      this.renderQuoteSettings();
      this.renderAutoMigrate();
      this.renderImportHistory();
    },

    async loadAll() {
      try {
        timeTypes = await API.getTimeTypes();
        presets = await API.getPresets();
      } catch (e) { timeTypes = []; presets = []; }
    },

    // == Theme ==
    async setTheme(theme) {
      document.documentElement.setAttribute('data-theme', theme);
      await API.setSetting('theme', theme);
      U.showToast('主题已切换');
    },

    // == Time types ==
    renderTimeTypes() {
      const list = document.getElementById('timeTypeList');
      list.innerHTML = timeTypes.map(tt => `
        <div style="display:flex;align-items:center;gap:8px;padding:4px 0">
          <input type="color" value="${tt.color}" data-tt-id="${tt.id}" class="tt-color-input" style="width:28px;height:28px">
          <input type="text" value="${U.escapeHtml(tt.name)}" data-tt-id="${tt.id}" class="tt-name-input" style="flex:1;font-size:0.82rem;padding:6px 10px">
          <button class="btn btn-sm btn-danger tt-del-btn" data-tt-id="${tt.id}">删除</button>
        </div>`).join('');

      list.querySelectorAll('.tt-color-input').forEach(inp => {
        inp.addEventListener('change', () => this.updateTimeType(inp.dataset.ttId, { color: inp.value }));
      });
      list.querySelectorAll('.tt-name-input').forEach(inp => {
        inp.addEventListener('change', () => this.updateTimeType(inp.dataset.ttId, { name: inp.value }));
      });
      list.querySelectorAll('.tt-del-btn').forEach(b => {
        b.addEventListener('click', () => this.deleteTimeType(b.dataset.ttId));
      });
    },

    async addTimeType() {
      const name = document.getElementById('ttNameInput').value.trim();
      const color = document.getElementById('ttColorInput').value;
      if (!name) { U.showToast('请输入名称'); return; }
      await API.addTimeType(name, color);
      document.getElementById('ttNameInput').value = '';
      await this.loadAll();
      this.renderTimeTypes();
      this.fillImportSelects();
      U.showToast('已添加');
    },

    async updateTimeType(id, updates) {
      await API.updateTimeType(id, updates);
      if (window.Stats) window.Stats.renderPieChart();
    },

    async deleteTimeType(id) {
      const tt = timeTypes.find(t => t.id === id);
      const ttCopy = tt ? JSON.parse(JSON.stringify(tt)) : null;
      await API.deleteTimeType(id);
      if (ttCopy) {
        window.UndoManager.push({
          type: 'deleteTimeType',
          undo: async () => {
            await API.addTimeType(ttCopy.name, ttCopy.color);
          }
        });
      }
      await this.loadAll();
      this.renderTimeTypes();
      U.showToast('已删除');
    },

    // == Import ==
    fillImportSelects() {
      const sel1 = document.getElementById('importTypeSelect');
      const sel2 = document.getElementById('importDetailType');
      const opts = timeTypes.map(t => `<option value="${U.escapeHtml(t.name)}">${U.escapeHtml(t.name)}</option>`).join('');
      sel1.innerHTML = opts;
      sel2.innerHTML = opts;
    },

    async bulkImport() {
      const type = document.getElementById('importTypeSelect').value;
      const min = parseInt(document.getElementById('importTotalMin').value) || 0;
      if (!type || min <= 0) { U.showToast('请选择类型并输入分钟数'); return; }
      const batchId = 'batch_' + Date.now().toString(36);
      const tid = U.generateId('tr');
      await API.addTimeRecord({
        id: tid, date: U.getTodayStr(), time_type: type,
        start_time: null, end_time: null, total_minutes: min,
        pauses: '[]', source: 'import', note: '', import_batch_id: batchId
      });
      document.getElementById('importTotalMin').value = '';
      U.showToast('累加导入成功: +' + U.formatMinutes(min));
      if (window.Todos) window.Todos.renderDateBadge();
      this.renderImportHistory();
    },

    async detailImport() {
      const type = document.getElementById('importDetailType').value;
      const date = document.getElementById('importDateInput').value;
      const start = document.getElementById('importStartTime').value;
      const end = document.getElementById('importEndTime').value;
      if (!type || !date || !start || !end) { U.showToast('请填写完整信息'); return; }
      const [sh, sm] = start.split(':').map(Number);
      const [eh, em] = end.split(':').map(Number);
      const totalMin = (eh * 60 + em) - (sh * 60 + sm);
      if (totalMin <= 0) { U.showToast('结束时间必须大于开始时间'); return; }
      const batchId = 'batch_' + Date.now().toString(36);
      const tid = U.generateId('tr');
      await API.addTimeRecord({
        id: tid, date, time_type: type, start_time: start, end_time: end,
        total_minutes: totalMin, pauses: '[]', source: 'import', note: '', import_batch_id: batchId
      });
      U.showToast('逐条导入成功: ' + U.formatMinutes(totalMin));
      if (window.Todos) window.Todos.renderDateBadge();
      this.renderImportHistory();
    },

    async renderImportHistory() {
      try {
        const batches = await API.getImportBatches();
        const list = document.getElementById('importHistoryList');
        const empty = document.getElementById('importHistoryEmpty');
        if (!batches || batches.length === 0) {
          list.innerHTML = '';
          empty.style.display = '';
          return;
        }
        empty.style.display = 'none';
        list.innerHTML = batches.map(b => {
          const ts = parseInt(b.batch_id.replace('batch_', ''), 36);
          const dt = new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
          return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--border-light)">
            <span style="flex:1;font-size:0.78rem;color:var(--text-light)">${dt}</span>
            <span style="font-size:0.82rem">${U.escapeHtml(b.time_type)} · ${U.formatMinutes(b.total_minutes)}</span>
            <button class="btn btn-sm btn-danger import-batch-del" data-bid="${U.escapeHtml(b.batch_id)}">撤销</button>
          </div>`;
        }).join('');

        list.querySelectorAll('.import-batch-del').forEach(btn => {
          btn.addEventListener('click', () => this.deleteImportBatch(btn.dataset.bid));
        });
      } catch (e) {}
    },

    async deleteImportBatch(batchId) {
      if (!confirm('确定要撤销这次导入吗？')) return;
      const count = await API.deleteByBatchId(batchId);
      U.showToast(`已撤销 ${count} 条记录`);
      this.renderImportHistory();
      if (window.Todos) window.Todos.renderDateBadge();
    },

    // == Goals ==
    async saveGoals() {
      const daily = parseInt(document.getElementById('goalDaily').value) || 0;
      const weekly = parseInt(document.getElementById('goalWeekly').value) || 0;
      await API.setGoal('daily', daily);
      await API.setGoal('weekly', weekly);
      U.showToast('目标已保存');
    },

    async renderGoals() {
      try {
        const dg = await API.getGoal('daily');
        const wg = await API.getGoal('weekly');
        document.getElementById('goalDaily').value = dg.target_minutes;
        document.getElementById('goalWeekly').value = wg.target_minutes;
      } catch (e) {}
    },

    async renderAutoMigrate() {
      try {
        const val = await API.getSetting('move_uncompleted') || 'true';
        document.getElementById('autoMigrate').checked = val !== 'false';
      } catch (e) {}
    },

    // == Quotes ==
    async renderQuotes() {
      await this.loadQuotesFromDB();
      const list = document.getElementById('quoteList');
      let quotes = [];
      try {
        const raw = localStorage.getItem('__settings_cache_quotes');
        quotes = raw ? JSON.parse(raw) : [];
      } catch (e) { quotes = []; }

      list.innerHTML = quotes.map((q, i) => `
        <div style="display:flex;align-items:center;gap:4px;padding:2px 0">
          <span style="flex:1;font-size:0.82rem">「${U.escapeHtml(q)}」</span>
          <button class="btn btn-sm quote-del" data-idx="${i}">✕</button>
        </div>`).join('') || '<div style="font-size:0.8rem;color:var(--text-lighter)">暂无格言</div>';

      list.querySelectorAll('.quote-del').forEach(b => {
        b.addEventListener('click', () => this.deleteQuote(parseInt(b.dataset.idx)));
      });
    },

    async loadQuotesFromDB() {
      try {
        const raw = await API.getSetting('quotes');
        const quotes = raw ? JSON.parse(raw) : [];
        localStorage.setItem('__settings_cache_quotes', JSON.stringify(quotes));
        return quotes;
      } catch (e) { return []; }
    },

    async addQuote() {
      const inp = document.getElementById('quoteInput');
      const text = inp.value.trim();
      if (!text) return;
      let quotes = await this.loadQuotesFromDB();
      quotes.push(text);
      await API.setSetting('quotes', JSON.stringify(quotes));
      inp.value = '';
      localStorage.setItem('__settings_cache_quotes', JSON.stringify(quotes));
      this.renderQuotes();
      U.showToast('格言已添加');
    },

    async deleteQuote(idx) {
      let quotes = await this.loadQuotesFromDB();
      quotes.splice(idx, 1);
      await API.setSetting('quotes', JSON.stringify(quotes));
      localStorage.setItem('__settings_cache_quotes', JSON.stringify(quotes));
      this.renderQuotes();
    },

    async saveQuoteSettings() {
      await API.setSetting('quote_mode', document.getElementById('quoteMode').value);
      await API.setSetting('quote_interval', document.getElementById('quoteInterval').value);
    },

    async renderQuoteSettings() {
      try {
        document.getElementById('quoteMode').value = await API.getSetting('quote_mode') || 'random';
        document.getElementById('quoteInterval').value = await API.getSetting('quote_interval') || '30';
      } catch (e) {}
    },

    // == Background ==
    async setBg(target) {
      const path = await API.openImageDialog();
      if (!path) return;
      const key = target === 'home' ? 'bg_home' : 'bg_pomodoro';
      await API.setSetting(key, path);
      if (target === 'home') {
        document.querySelector('.main-content').style.backgroundImage = 'url(file:///' + path.replace(/\\/g, '/') + ')';
        document.querySelector('.main-content').style.backgroundSize = 'contain';
        document.querySelector('.main-content').style.backgroundPosition = 'center';
        document.querySelector('.main-content').style.backgroundRepeat = 'no-repeat';
      } else {
        API.pushPomoWallpaper(path);
      }
      U.showToast('背景已设置');
    },

    async clearBg() {
      await API.setSetting('bg_home', '');
      await API.setSetting('bg_pomodoro', '');
      var mc = document.querySelector('.main-content');
      if (mc) { mc.style.backgroundImage = ''; mc.style.backgroundSize = ''; mc.style.backgroundPosition = ''; mc.style.backgroundRepeat = ''; }
      API.pushPomoWallpaper('');
      U.showToast('背景已清除');
    },

    async loadBgs() {
      try {
        const home = await API.getSetting('bg_home');
        if (home) {
          var mc = document.querySelector('.main-content');
          if (mc) {
            mc.style.backgroundImage = 'url(file:///' + home.replace(/\\/g, '/') + ')';
            mc.style.backgroundSize = 'contain';
            mc.style.backgroundPosition = 'center';
            mc.style.backgroundRepeat = 'no-repeat';
          }
        }
      } catch (e) {}
    },

    // == Audio ==
    async renderAudioList() {
      await this.loadAudioFromDB();
      const list = document.getElementById('audioList');
      let files = [];
      try {
        const raw = localStorage.getItem('__settings_cache_audio');
        files = raw ? JSON.parse(raw) : [];
      } catch (e) { files = []; }
      list.innerHTML = files.map((f, i) => `
        <div style="display:flex;align-items:center;gap:4px">
          <span style="font-size:0.78rem;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${U.escapeHtml(f)}">🎵 ${U.escapeHtml(f.split(/[\\/]/).pop())}</span>
          <button class="btn btn-sm audio-del" data-idx="${i}">✕</button>
        </div>`).join('') || '<div style="font-size:0.8rem;color:var(--text-lighter)">暂无音频</div>';

      list.querySelectorAll('.audio-del').forEach(b => {
        b.addEventListener('click', () => this.deleteAudio(parseInt(b.dataset.idx)));
      });
    },

    async loadAudioFromDB() {
      try {
        const raw = await API.getSetting('audio_files');
        const files = raw ? JSON.parse(raw) : [];
        localStorage.setItem('__settings_cache_audio', JSON.stringify(files));
      } catch (e) {}
    },

    async addAudio() {
      const paths = await API.openAudioDialog();
      if (!paths || paths.length === 0) return;
      let files = [];
      try {
        const raw = await API.getSetting('audio_files');
        files = raw ? JSON.parse(raw) : [];
      } catch (e) { files = []; }
      files = files.concat(paths);
      await API.setSetting('audio_files', JSON.stringify(files));
      localStorage.setItem('__settings_cache_audio', JSON.stringify(files));
      this.renderAudioList();
      U.showToast(paths.length + ' 个音频已添加');
    },

    async deleteAudio(idx) {
      let files = [];
      try {
        const raw = await API.getSetting('audio_files');
        files = raw ? JSON.parse(raw) : [];
      } catch (e) { files = []; }
      files.splice(idx, 1);
      await API.setSetting('audio_files', JSON.stringify(files));
      localStorage.setItem('__settings_cache_audio', JSON.stringify(files));
      this.renderAudioList();
    },

    // == Export ==
    async exportCSV() {
      try {
        const records = await API.getAllTimeRecords();
        const rows = ['日期,时间类型,开始时间,结束时间,有效时长(分钟),暂停段,来源,备注'];
        for (const r of records) {
          rows.push([r.date, r.time_type, r.start_time || '', r.end_time || '', r.total_minutes, r.pauses || '', r.source, (r.note || '').replace(/,/g, '，')].join(','));
        }
        await API.saveFileDialog('学习记录.csv', rows.join('\n'));
        U.showToast('CSV 已导出');
      } catch (e) {}
    },

    async exportJSON() {
      try {
        const data = await API.exportAllData();
        await API.saveFileDialog('学习数据.json', data);
        U.showToast('JSON 已导出');
      } catch (e) {}
    },

    // == Presets ==
    async renderPresets() {
      const mgr = document.getElementById('presetManager');
      mgr.innerHTML = presets.map(p => `
        <div style="display:flex;align-items:center;gap:6px;padding:4px 0">
          <span style="width:8px;height:8px;border-radius:50%;background:${p.color};flex-shrink:0"></span>
          <span style="font-size:0.82rem;flex:1">${U.escapeHtml(p.time_type)} · ${p.duration_minutes}min · ${p.mode==='countdown'?'倒计时':'正向'}</span>
          <button class="btn btn-sm presets-edit" data-id="${p.id}">✏️</button>
          <button class="btn btn-sm btn-danger presets-del" data-id="${p.id}">删除</button>
        </div>`).join('') || '<div style="font-size:0.8rem;color:var(--text-lighter)">暂无预设</div>';

      mgr.querySelectorAll('.presets-del').forEach(b => {
        b.addEventListener('click', () => this.deletePreset(b.dataset.id));
      });
      mgr.querySelectorAll('.presets-edit').forEach(b => {
        b.addEventListener('click', () => this.openPresetEdit(b.dataset.id));
      });

      // Fill preset type select
      const sel = document.getElementById('presetTypeSelect');
      sel.innerHTML = timeTypes.map(t => `<option value="${U.escapeHtml(t.name)}">${U.escapeHtml(t.name)}</option>`).join('');
    },

    async addPreset() {
      const type = document.getElementById('presetTypeSelect').value;
      const duration = parseInt(document.getElementById('presetDuration').value) || 25;
      const mode = document.getElementById('presetMode').value;
      const color = document.getElementById('presetColor').value;
      if (!type) return;
      await API.addPreset({ time_type: type, duration_minutes: duration, mode, color });
      await this.loadAll();
      this.renderPresets();
      if (window.PomoPresets) { window.PomoPresets.load(); window.PomoPresets.render(); }
      U.showToast('预设已添加');
    },

    async deletePreset(id) {
      const p = presets.find(pr => pr.id === id);
      const pCopy = p ? JSON.parse(JSON.stringify(p)) : null;
      await API.deletePreset(id);
      if (pCopy) {
        window.UndoManager.push({
          type: 'deletePreset',
          undo: async () => {
            await API.addPreset(pCopy);
          }
        });
      }
      await this.loadAll();
      this.renderPresets();
      if (window.PomoPresets) { window.PomoPresets.load(); window.PomoPresets.render(); }
      U.showToast('预设已删除');
    },

    openPresetEdit(id) {
      const p = presets.find(pr => pr.id === id);
      if (!p) return;
      document.getElementById('presetEditName').value = p.time_type;
      document.getElementById('presetEditDuration').value = p.duration_minutes;
      document.getElementById('presetEditMode').value = p.mode;
      document.getElementById('presetEditColor').value = p.color;
      document.getElementById('presetEditName').dataset.editId = id;
      document.getElementById('presetEditOverlay').classList.add('open');
    },

    async savePresetEdit() {
      const id = document.getElementById('presetEditName').dataset.editId;
      if (!id) return;
      const updates = {
        time_type: document.getElementById('presetEditName').value.trim(),
        duration_minutes: parseInt(document.getElementById('presetEditDuration').value) || 25,
        mode: document.getElementById('presetEditMode').value,
        color: document.getElementById('presetEditColor').value
      };
      if (!updates.time_type) { U.showToast('请输入类型名称'); return; }
      await API.updatePreset(id, updates);
      document.getElementById('presetEditOverlay').classList.remove('open');
      await this.loadAll();
      this.renderPresets();
      if (window.PomoPresets) { window.PomoPresets.load(); window.PomoPresets.render(); }
      U.showToast('预设已更新');
    }
  };
})();
