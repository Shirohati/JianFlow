// TODOS - 待办模块
(function () {
  const U = window.Utils;
  const API = window.todoAPI;

  let expandedNoteId = null;
  let categories = [];
  let todos = [];
  let lastRecurringDate = '';

  window.Todos = {
    async init() {
      await this.loadCategories();
      this.bindEvents();
      this.renderAll();
    },

    async loadCategories() {
      try { categories = await API.getCategories(); }
      catch (e) { categories = []; }
    },

    bindEvents() {
      document.getElementById('btnAdd').addEventListener('click', () => this.addTodo());
      document.getElementById('todoInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); this.addTodo(); }
      });
      document.getElementById('btnPrevDay').addEventListener('click', () => window.App.goPrevDay());
      document.getElementById('btnNextDay').addEventListener('click', () => window.App.goNextDay());
      document.getElementById('btnToday').addEventListener('click', () => window.App.goToToday());
      document.getElementById('dateDisplay').addEventListener('click', () => {
        const dp = document.getElementById('datePicker');
        dp.showPicker ? dp.showPicker() : dp.click();
      });
      document.getElementById('datePicker').addEventListener('change', () => {
        if (document.getElementById('datePicker').value) {
          window.App.setCurrentDate(document.getElementById('datePicker').value);
        }
      });
      document.getElementById('btnClearDone').addEventListener('click', () => this.clearCompleted());
      document.getElementById('btnMigrate').addEventListener('click', () => this.manualMigrate());
      document.getElementById('btnDailyManage').addEventListener('click', () => this.openDailyManage());
      document.getElementById('btnCloseDailyManage').addEventListener('click', () => this.closeDailyManage());
      document.getElementById('dailyManageOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'dailyManageOverlay') this.closeDailyManage();
      });

      const list = document.getElementById('todoList');
      list.addEventListener('click', (e) => {
        const cb = e.target.closest('.custom-checkbox');
        if (cb) { this.toggleTodo(cb.dataset.id); return; }
        const noteBtn = e.target.closest('.btn-note');
        if (noteBtn) { this.toggleNote(noteBtn.dataset.id); return; }
        const delBtn = e.target.closest('.btn-delete');
        if (delBtn) { this.deleteTodo(delBtn.dataset.id); return; }
        const tag = e.target.closest('.todo-cat-tag');
        if (tag) { this.cycleCategory(tag.dataset.id); return; }
        const pri = e.target.closest('.todo-pri');
        if (pri) { this.cyclePriority(pri.dataset.id); return; }
        const rec = e.target.closest('.todo-rec');
        if (rec) { this.cycleRecurrence(rec.dataset.id); return; }
      });
      list.addEventListener('dblclick', (e) => {
        const span = e.target.closest('.todo-text');
        if (span && span.dataset.id) this.startEdit(span.dataset.id);
      });
      list.addEventListener('input', (e) => {
        if (e.target.tagName === 'TEXTAREA' && e.target.dataset.noteId) {
          this.saveNoteContent(e.target.dataset.noteId, e.target.value);
        }
      });
    },

    async renderAll() {
      const date = window.App.currentDate;
      if (date !== lastRecurringDate) {
        await this.generateRecurring();
        lastRecurringDate = date;
      }
      await this.loadTodos();
      this.renderDateDisplay();
      this.renderTodos();
      this.renderStats();
      this.renderDateBadge();
    },

    async generateRecurring() {
      try {
        const date = window.App.currentDate;
        const today = U.getTodayStr();
        if (date >= today) {
          const created = await API.generateRecurringTasks(date);
          if (created > 0) U.showToast(`自动生成 ${created} 条重复任务`);
        }
      } catch (e) {}
    },

    async loadTodos() {
      try { todos = await API.getTodos(window.App.currentDate); }
      catch (e) { todos = []; }
    },

    async addTodo() {
      const input = document.getElementById('todoInput');
      const text = input.value.trim();
      if (!text) { input.focus(); U.shakeElement(input); return; }
      if (text.length > 200) { U.showToast('待办不能超过200字'); return; }
      const rec = document.getElementById('todoRecurrence').value;
      const todo = { id: U.generateId('td'), date: window.App.currentDate, text, completed: false, note: '', category_id: '', priority: 0, sort_order: 0, recurrence: rec };
      await API.addTodo(todo);
      input.value = '';
      input.focus();
      expandedNoteId = null;
      await this.renderAll();
      U.showToast('已添加');
    },

    async toggleTodo(id) {
      const todo = todos.find(t => t.id === id);
      if (!todo) return;
      await API.updateTodo(id, { completed: !todo.completed, completed_at: !todo.completed ? new Date().toISOString() : null });
      await this.renderAll();
      if (!todo.completed) U.showToast('任务完成');
    },

    async deleteTodo(id) {
      const todo = todos.find(t => t.id === id);
      if (!todo) return;
      if (todo.note && todo.note.trim() && !confirm(`确定删除「${todo.text}」？\n附带心得也会删除。`)) return;
      const todoCopy = JSON.parse(JSON.stringify(todo));
      await API.deleteTodo(id);
      window.UndoManager.push({
        type: 'deleteTodo',
        undo: async () => {
          await API.addTodo(todoCopy);
        }
      });
      if (expandedNoteId === id) expandedNoteId = null;
      await this.renderAll();
      U.showToast('已删除');
    },

    async clearCompleted() {
      const completed = todos.filter(t => t.completed);
      if (completed.length === 0) { U.showToast('没有已完成的待办'); return; }
      if (!confirm(`清除当前日期 ${completed.length} 条已完成待办？`)) return;
      const completedCopy = JSON.parse(JSON.stringify(completed));
      await API.clearCompletedTodos(window.App.currentDate);
      window.UndoManager.push({
        type: 'clearCompleted',
        undo: async () => {
          await API.batchAddTodos(completedCopy);
        }
      });
      if (expandedNoteId && completed.some(t => t.id === expandedNoteId)) expandedNoteId = null;
      await this.renderAll();
      U.showToast(`已清除 ${completed.length} 条`);
    },

    async manualMigrate() {
      const prev = new Date(window.App.currentDate + 'T00:00:00');
      prev.setDate(prev.getDate() - 1);
      const prevStr = U.formatDate(prev);
      const uncompleted = await API.getUncompletedForDate(prevStr);
      if (!uncompleted || uncompleted.length === 0) { U.showToast('昨天没有未完成的待办'); return; }
      const today = window.App.currentDate;
      const todayTodos = await API.getTodos(today);
      const batch = uncompleted
        .filter(t => !t.recurrence || t.recurrence === '')
        .map(t => ({
          id: U.generateId('td'), date: today, text: t.text, completed: false,
          note: '', category_id: t.category_id, priority: t.priority, sort_order: 0, recurrence: ''
        }));
      const filtered = batch.filter(t => !todayTodos.some(tt => tt.text === t.text));
      if (filtered.length === 0) { U.showToast('所有未完成项今天已存在（每日任务已自动跳过）'); return; }
      await API.batchAddTodos(filtered);
      await this.renderAll();
      U.showToast(`已迁移 ${filtered.length} 条未完成待办`);
    },

    toggleNote(id) {
      this.saveExpandedNote();
      expandedNoteId = (expandedNoteId === id) ? null : id;
      this.renderTodos();
    },

    saveExpandedNote() {
      if (!expandedNoteId) return;
      const ta = document.querySelector(`textarea[data-note-id="${expandedNoteId}"]`);
      if (!ta) return;
      const todo = todos.find(t => t.id === expandedNoteId);
      if (!todo) return;
      const v = ta.value.trim();
      if (todo.note !== v) { todo.note = v; API.updateTodo(expandedNoteId, { note: v }); }
    },

    async saveNoteContent(id, value) {
      const todo = todos.find(t => t.id === id);
      if (!todo) return;
      todo.note = value.trim();
      await API.updateTodo(id, { note: todo.note });
      const btn = document.querySelector(`.btn-note[data-id="${id}"]`);
      if (btn) { btn.classList.toggle('has-note', !!todo.note); }
    },

    startEdit(id) {
      const span = document.querySelector(`.todo-text[data-id="${id}"]`);
      if (!span || span.classList.contains('editing')) return;
      const todo = todos.find(t => t.id === id);
      if (!todo || todo.completed) return;
      span.classList.add('editing');
      span.contentEditable = 'true';
      span.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(span);
      sel.removeAllRanges();
      sel.addRange(range);

      const finish = () => {
        span.contentEditable = 'false';
        span.classList.remove('editing');
        span.removeEventListener('blur', finish);
        span.removeEventListener('keydown', onKd);
        const txt = span.textContent.trim();
        if (txt && txt !== todo.text) { todo.text = txt.substring(0, 200); API.updateTodo(id, { text: todo.text }); }
        else if (!txt) this.renderTodos();
      };
      const onKd = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); span.blur(); }
        if (e.key === 'Escape') { span.textContent = todo.text; span.blur(); }
      };
      span.addEventListener('blur', finish);
      span.addEventListener('keydown', onKd);
    },

    async cycleCategory(id) {
      const todo = todos.find(t => t.id === id);
      if (!todo) return;
      const idx = categories.findIndex(c => c.id === todo.category_id);
      const next = idx < 0 ? categories[0] : categories[(idx + 1) % categories.length];
      todo.category_id = next ? next.id : '';
      await API.updateTodo(id, { category_id: todo.category_id });
      this.renderTodos();
    },

    async cyclePriority(id) {
      const todo = todos.find(t => t.id === id);
      if (!todo) return;
      todo.priority = ((todo.priority || 0) + 1) % 4;
      await API.updateTodo(id, { priority: todo.priority });
      this.renderTodos();
    },

    async cycleRecurrence(id) {
      const todo = todos.find(t => t.id === id);
      if (!todo) return;
      const opts = ['', 'daily', 'weekly', 'monthly'];
      const idx = opts.indexOf(todo.recurrence || '');
      todo.recurrence = opts[(idx + 1) % 4];
      await API.updateTodo(id, { recurrence: todo.recurrence });
      this.renderTodos();
    },

    renderDateDisplay() {
      const dt = window.App.currentDate;
      const parts = dt.split('-');
      const el = document.getElementById('dateDisplay');
      el.textContent = parts[0] + '年' + parseInt(parts[1]) + '月' + parseInt(parts[2]) + '日 ' + U.getWeekDay(dt);
      el.classList.toggle('today-highlight', dt === U.getTodayStr());
      document.getElementById('datePicker').value = dt;
    },

    async renderDateBadge() {
      let mins = 0;
      try {
        const records = await API.getTimeRecords(window.App.currentDate);
        mins = records.reduce((s, r) => s + (r.total_minutes || 0), 0);
      } catch (e) {}
      document.getElementById('dateStudyBadge').textContent = '⏱ ' + U.formatMinutesShort(mins);
    },

    renderTodos() {
      const list = document.getElementById('todoList');
      const empty = document.getElementById('emptyState');
      const clearArea = document.getElementById('clearArea');
      list.innerHTML = '';
      if (todos.length === 0) { empty.style.display = 'block'; clearArea.style.display = 'none'; return; }
      empty.style.display = 'none';
      const pending = todos.filter(t => !t.completed);
      const completed = todos.filter(t => t.completed);
      const sorted = [...pending, ...completed];

      sorted.forEach(todo => {
        const li = document.createElement('li');
        li.style.cssText = `display:flex;align-items:flex-start;gap:8px;padding:10px 12px;border-radius:var(--radius);border:1.5px solid transparent;background:var(--card-bg);animation:slideIn .3s cubic-bezier(0.16,1,0.3,1);transition:var(--transition);opacity:${todo.completed ? '0.65' : '1'}`;
        li.addEventListener('mouseenter', () => { li.style.borderColor = 'var(--border)'; li.style.boxShadow = 'var(--shadow-sm)'; });
        li.addEventListener('mouseleave', () => { li.style.borderColor = 'transparent'; li.style.boxShadow = 'none'; });

        const cat = categories.find(c => c.id === todo.category_id);

        li.innerHTML =
          `<div style="flex-shrink:0;padding-top:1px">
            <div class="custom-checkbox ${todo.completed ? 'checked' : ''}" data-id="${todo.id}" title="${todo.completed ? '取消完成' : '标记完成'}"
              style="width:20px;height:20px;border-radius:50%;border:2px solid ${todo.completed ? 'var(--success)' : '#d5d0c8'};cursor:pointer;display:flex;align-items:center;justify-content:center;background:${todo.completed ? 'var(--success)' : '#fff'};transition:var(--transition);flex-shrink:0">${todo.completed ? '<span style=color:#fff;font-size:0.7rem;font-weight:700>✓</span>' : ''}</div>
          </div>
          <span class="todo-text ${todo.completed ? 'completed-text' : ''}" data-id="${todo.id}" title="双击编辑"
            style="flex:1;font-size:0.9rem;word-break:break-word;cursor:pointer;padding:1px 3px;border-radius:3px;min-width:0;line-height:1.5;${todo.completed ? 'text-decoration:line-through;color:#b5b0a8' : ''}">
            ${U.escapeHtml(todo.text)}
            ${todo.recurrence ? `<span style="font-size:0.7rem;background:var(--primary-light);color:var(--primary);padding:1px 8px;border-radius:10px;margin-left:6px;font-weight:600" data-id="${todo.id}" class="todo-rec" title="重复:${todo.recurrence} 点击切换">🔁 ${todo.recurrence === 'daily' ? '每天' : todo.recurrence === 'weekly' ? '每周' : '每月'}</span>` : ''}
          </span>
          <div style="display:flex;gap:1px;flex-shrink:0">
            <button class="todo-cat-tag" data-id="${todo.id}" title="分类:${cat ? cat.name : '无'} 点击切换"
              style="padding:0 6px;border-radius:10px;border:none;cursor:pointer;font-size:0.65rem;font-weight:500;background:${cat ? cat.color + '22' : 'var(--bg2)'};color:${cat ? cat.color : 'var(--text-lighter)'};font-family:var(--font)">${cat ? cat.name : '无'}</button>
            <button class="todo-pri" data-id="${todo.id}" title="优先级 点击切换"
              style="padding:0 6px;border-radius:10px;border:none;cursor:pointer;font-size:0.65rem;font-weight:600;background:transparent;color:${todo.priority === 3 ? 'var(--danger)' : todo.priority === 2 ? 'var(--warning)' : todo.priority === 1 ? 'var(--success)' : 'var(--text-lighter)'};font-family:var(--font)">
              ${todo.priority === 3 ? '🔴' : todo.priority === 2 ? '🟡' : todo.priority === 1 ? '🟢' : '⚪'}
            </button>
            <button class="btn-note ${todo.note ? 'has-note' : ''}" data-id="${todo.id}" title="心得" style="width:26px;height:26px;border-radius:50%;border:none;background:transparent;cursor:pointer;font-size:0.85rem;color:${todo.note ? '#e0a83c' : 'var(--text-lighter)'};position:relative">💬</button>
            <button class="btn-delete" data-id="${todo.id}" title="删除" style="width:26px;height:26px;border-radius:50%;border:none;background:transparent;cursor:pointer;font-size:0.8rem;color:var(--text-lighter)">✕</button>
          </div>`;

        if (expandedNoteId === todo.id) {
          const nd = document.createElement('div');
          nd.style.cssText = 'margin-top:4px;padding:8px 12px;background:#fefdf9;border-radius:8px;border:1px dashed #e8e3d4;width:100%';
          nd.innerHTML = `<textarea data-note-id="${todo.id}" placeholder="学习心得…" rows="2" style="width:100%;border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-family:var(--font);font-size:0.8rem;resize:vertical;min-height:40px;background:var(--input-bg);outline:none">${U.escapeHtml(todo.note || '')}</textarea>`;
          li.appendChild(nd);
          nd.querySelector('textarea').addEventListener('input', (e) => {
            const t = todos.find(tx => tx.id === todo.id);
            if (t) { t.note = e.target.value.trim(); API.updateTodo(todo.id, { note: t.note }); }
          });
        }

        list.appendChild(li);

        // hover tooltip for note
        if (todo.note && !(expandedNoteId === todo.id)) {
          const noteBtn = li.querySelector('.btn-note');
          if (noteBtn) {
            noteBtn.addEventListener('mouseenter', (ev) => {
              const tip = document.createElement('div');
              tip.className = 'note-tooltip';
              tip.style.cssText = `position:fixed;background:#3a3a3a;color:#fff;padding:8px 14px;border-radius:8px;font-size:0.75rem;max-width:220px;word-break:break-word;z-index:999;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,0.2)`;
              tip.textContent = todo.note;
              document.body.appendChild(tip);
              const r = noteBtn.getBoundingClientRect();
              tip.style.left = (r.right + 8) + 'px';
              tip.style.top = (r.top - 4) + 'px';
              noteBtn._tip = tip;
            });
            noteBtn.addEventListener('mouseleave', () => {
              if (noteBtn._tip) { noteBtn._tip.remove(); noteBtn._tip = null; }
            });
          }
        }
      });

      const hasDone = todos.some(t => t.completed);
      clearArea.style.display = (todos.length > 0 && hasDone) ? 'block' : 'none';
    },

    renderStats() {
      document.getElementById('statTotal').textContent = todos.length;
      document.getElementById('statPending').textContent = todos.filter(t => !t.completed).length;
      document.getElementById('statDone').textContent = todos.filter(t => t.completed).length;
    },

    async openDailyManage() {
      try {
        const dailyTasks = await API.getRecurringDailyTasks();
        const listEl = document.getElementById('dailyTaskList');
        const emptyEl = document.getElementById('dailyTaskEmpty');
        listEl.innerHTML = '';
        if (!dailyTasks || dailyTasks.length === 0) {
          emptyEl.style.display = 'block';
        } else {
          emptyEl.style.display = 'none';
          dailyTasks.forEach(task => {
            const item = document.createElement('div');
            item.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--card-bg);border-radius:8px;border:1px solid var(--border)';
            const cat = categories.find(c => c.id === task.category_id);
            item.innerHTML = `
              <span style="flex:1;font-size:0.9rem">${U.escapeHtml(task.text)}</span>
              <span style="font-size:0.7rem;padding:2px 8px;border-radius:10px;background:${cat ? cat.color + '22' : 'var(--bg2)'};color:${cat ? cat.color : 'var(--text-lighter)'}">${cat ? cat.name : '无'}</span>
              <span style="font-size:0.7rem;color:var(--text-lighter)">${task.priority === 3 ? '🔴' : task.priority === 2 ? '🟡' : task.priority === 1 ? '🟢' : '⚪'}</span>
              <button class="btn-delete" data-daily-id="${task.id}" title="删除此每日任务" style="width:26px;height:26px;border-radius:50%;border:none;background:transparent;cursor:pointer;font-size:0.8rem;color:var(--text-lighter)">✕</button>
            `;
            listEl.appendChild(item);
            item.querySelector('.btn-delete').addEventListener('click', async () => {
              if (!confirm(`确定删除「${task.text}」这个每日任务吗？\n已生成的实例不会被删除。`)) return;
              await API.deleteTodo(task.id);
              this.openDailyManage();
              U.showToast('已删除');
            });
          });
        }
        document.getElementById('dailyManageOverlay').style.display = 'flex';
        document.getElementById('dailyManageOverlay').classList.add('open');
      } catch (e) {
        U.showToast('加载失败: ' + e.message);
      }
    },

    closeDailyManage() {
      document.getElementById('dailyManageOverlay').style.display = 'none';
      document.getElementById('dailyManageOverlay').classList.remove('open');
    }
  };
})();
