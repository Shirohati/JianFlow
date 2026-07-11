// POMODORO PRESETS - 主页预设快捷按钮
(function(){
  const U = window.Utils;
  const API = window.todoAPI;

  window.PomoPresets = {
    presets: [],
    async init(){
      await this.load();
      this.bindEvents();
      this.render();
      // Listen for pomodoro stop to refresh badge
      API.onPomodoroStopped(()=>{ if(window.Todos) window.Todos.renderDateBadge(); });
    },
    async load(){
      try{ this.presets = await API.getPresets(); } catch(e){ this.presets=[]; }
    },
    bindEvents(){
      document.getElementById('btnQuickStart').addEventListener('click',()=>this.quickStart());
      document.getElementById('quickTimerMin').addEventListener('keydown',(e)=>{
        if(e.key==='Enter') this.quickStart();
      });
    },
    render(){
      const row = document.getElementById('presetQuickRow');
      row.innerHTML = this.presets.map(p=>`
        <button class="preset-quick-btn" data-id="${p.id}" style="background:${p.color}" title="${p.time_type} ${p.duration_minutes}min ${p.mode==='countdown'?'倒计时':'正向'}">
          ${U.escapeHtml(p.time_type)} ${p.duration_minutes}m
        </button>`).join('') || '<span style="font-size:0.78rem;color:var(--text-lighter)">暂无预设，去设置页创建</span>';

      row.querySelectorAll('.preset-quick-btn').forEach(b=>{
        b.addEventListener('click',()=>{
          const p = this.presets.find(pr=>pr.id===b.dataset.id);
          if(p) this.start(p.duration_minutes, p.mode, p.time_type, p.color);
        });
      });
    },
    quickStart(){
      const min = parseInt(document.getElementById('quickTimerMin').value) || 25;
      const mode = document.getElementById('quickTimerMode').value;
      this.start(min, mode, '学习', '#5b7fff');
    },
    async start(durationMinutes, mode, timeType, color){
      await API.startPomodoro({ durationMinutes, mode, timeType, color });
    }
  };
})();
