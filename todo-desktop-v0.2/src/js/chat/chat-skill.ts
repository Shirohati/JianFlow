export type SkillName = 'init' | 'morning' | 'evening' | 'report';
export type SkillStatus = 'ready' | 'locked' | 'running' | 'done';

interface SkillDef {
  name: string;
  label: string;
  icon: string;
  status: SkillStatus;
}

const SKILLS: Record<SkillName, SkillDef> = {
  init: { name: 'init', label: '初始化', icon: '📋', status: 'ready' },
  morning: { name: 'morning', label: '晨间规划', icon: '🌅', status: 'locked' },
  evening: { name: 'evening', label: '晚间总结', icon: '🌙', status: 'locked' },
  report: { name: 'report', label: '周报月报', icon: '📊', status: 'locked' },
};

let onTrigger: ((name: SkillName) => void) | null = null;

export function getSkills(): SkillDef[] {
  return Object.values(SKILLS);
}

export function setSkillStatus(name: SkillName, status: SkillStatus): void {
  if (SKILLS[name]) {
    SKILLS[name].status = status;
  }
}

export function setOnTrigger(cb: (name: SkillName) => void): void {
  onTrigger = cb;
}

export function renderToolbar(): string {
  const skills = Object.values(SKILLS);
  return `
    <div class="cs-toolbar" id="chatSkillBar">
      ${skills.map(s => `
        <button class="cs-btn" data-skill="${s.name}" data-status="${s.status}" title="${s.status === 'locked' ? '请先完成初始化' : s.label}">
          <span class="cs-icon">${s.icon}</span>
          <span class="cs-label">${s.label}</span>
        </button>
      `).join('')}
    </div>
  `;
}

export function bindSkillButtons(container: HTMLElement): void {
  container.querySelectorAll('.cs-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = (btn as HTMLElement).dataset.skill as SkillName;
      const status = (btn as HTMLElement).dataset.status as SkillStatus;
      if (status === 'locked' || status === 'running') return;
      if (onTrigger) onTrigger(name);
    });
  });
}

export function updateToolbarState(): void {
  document.querySelectorAll('.cs-btn').forEach(btn => {
    const name = (btn as HTMLElement).dataset.skill as SkillName;
    if (name && SKILLS[name]) {
      const status = SKILLS[name].status;
      (btn as HTMLElement).dataset.status = status;
      (btn as HTMLElement).title = status === 'locked' ? '请先完成初始化' : SKILLS[name].label;
    }
  });
}
