import { icon } from '../../icons';
import { utils } from '../../utils';
import type { TaskItem, Category } from '../../api';

export interface TaskItemRenderState {
  isToday: boolean;
  stepsOpen: boolean;
  stepEditing: { parentId: string; stepId: string } | null;
  stepAddingId: string | null;
}

export function renderTaskItem(t: TaskItem, allTasks: TaskItem[], categories: Category[], state: TaskItemRenderState): string {
  const isCompleted = t.todo_status === 'completed';
  const isRecurring = t.recurrence !== null && t.recurrence !== undefined;
  const cat = categories.find(c => c.id === t.category_id);
  const catName = cat ? cat.name : '';
  const catColor = cat ? cat.color : '#8e8e8e';
  const parentTask = t.parent_id ? allTasks.find(p => p.id === t.parent_id) : null;
  const parentName = parentTask ? parentTask.title : '';
  const hasParent = !!t.parent_id;
  const isSecondary = !!t.is_secondary;
  const isImportant = !!t.is_important;
  const scheduleLabel = t.schedule_start ? `${t.schedule_start}${t.schedule_end ? '-' + t.schedule_end : ''}` : '';
  const hasSteps = (t.steps ?? []).length > 0;
  const stepsDone = (t.steps ?? []).filter(s => s.done).length;
  const stepsOpen = state.stepsOpen;
  return `
    <div class="task-wrap${stepsOpen ? ' task-wrap--open' : ''}" data-id="${t.id}">
    <div class="task-item ${isCompleted ? 'task-completed' : ''} ${isImportant ? 'task-item--important' : ''}" data-id="${t.id}">
      <button class="task-toggle" data-id="${t.id}">
        ${isCompleted ? icon('check-circle-2', 'size="20"') : icon('circle', 'size="20"')}
      </button>
      <div class="task-content">
        <span class="task-text" data-field="todo-title" data-task-id="${t.id}">${isRecurring ? `<span class="task-recurring">${icon('repeat', 'size="14"')}</span>` : ''}${utils.escapeHtml(t.title)}</span>
        <span class="task-meta">
          ${scheduleLabel ? `<span class="tag tag--schedule">${icon('clock', 'size="10"')} ${scheduleLabel}</span>` : ''}
          ${catName ? `<span class="tag tag--cat" style="--tag-color:${catColor}">${catName}</span>` : ''}
          ${parentName ? `<span class="task-source">${icon('link', 'size="12"')} <a class="task-source-link" data-parent-id="${t.parent_id}">${utils.escapeHtml(parentName)}</a></span>` : ''}
        </span>
      </div>
      ${isImportant
        ? (state.isToday
          ? `<button class="task-star task-star--on" data-id="${t.id}" title="取消重要标记">${icon('star', 'size="14"')}</button>`
          : `<span class="task-star task-star--on task-star--static" title="历史重要标记">${icon('star', 'size="14"')}</span>`)
        : (state.isToday ? `<button class="task-star" data-id="${t.id}" title="标记为重要待办">${icon('star', 'size="14"')}</button>` : '')}
      ${!isCompleted ? `<button class="task-steps-btn${stepsOpen ? ' task-steps-btn--open' : ''}" data-id="${t.id}" title="${hasSteps ? (stepsOpen ? '收起步骤' : '展开步骤') : '添加步骤'}">${icon(hasSteps ? 'chevron-down' : 'list-plus', 'size="14"')}</button>` : ''}
      ${!isCompleted && hasSteps ? `<span class="task-steps-hint">${stepsDone}/${(t.steps ?? []).length}</span>` : ''}
      ${!hasParent ? `<button class="task-attach-btn" data-id="${t.id}" title="挂靠到便签">${icon('map-pin', 'size="14"')}</button>` : ''}
      ${t.recurrence ? `<span class="task-recurrence" title="重复: ${t.recurrence === 'daily' ? '每天' : t.recurrence === 'weekly' ? '每周' : '每月'}">${t.recurrence === 'daily' ? '🔁每天' : t.recurrence === 'weekly' ? '🔁每周' : '🔁每月'}</span>` : ''}
      ${isSecondary ? `<button class="task-sec-btn" data-id="${t.id}" data-sec="0" title="升为主要待办">${icon('arrow-up', 'size="14"')}</button>` : `<button class="task-sec-btn" data-id="${t.id}" data-sec="1" title="降为次要待办">${icon('arrow-down', 'size="14"')}</button>`}
      <button class="btn btn--ghost btn--sm task-delete" data-id="${t.id}" title="删除">${icon('trash-2', 'size="14"')}</button>
    </div>
    ${!isCompleted ? `
    <div class="task-steps">
      ${(t.steps ?? []).map(s => {
        const isEditing = state.stepEditing && state.stepEditing.parentId === t.id && state.stepEditing.stepId === s.id;
        return `
        <div class="task-step ${s.done ? 'task-step--done' : ''}" data-parent="${t.id}">
          <button class="task-step-toggle" data-parent="${t.id}" data-step="${s.id}">${s.done ? icon('check-square', 'size="14"') : icon('square', 'size="14"')}</button>
          ${isEditing
            ? `<input class="task-step-edit-input" data-parent="${t.id}" data-step="${s.id}" value="${utils.escapeHtml(s.title)}" />`
            : `<span class="task-step-title">${utils.escapeHtml(s.title)}</span>
          <button class="task-step-edit" data-parent="${t.id}" data-step="${s.id}" title="编辑步骤">${icon('pencil', 'size="12"')}</button>`}
          <button class="task-step-del" data-parent="${t.id}" data-step="${s.id}" title="删除步骤">${icon('x', 'size="12"')}</button>
        </div>`;
      }).join('')}
      ${state.stepAddingId === t.id
        ? `<div class="task-step-add">
        <input class="input input--sm task-step-input" data-parent="${t.id}" placeholder="添加步骤，回车确认" />
      </div>`
        : `<button class="task-step-add-btn" data-parent="${t.id}" title="添加步骤">${icon('plus', 'size="12"')} 添加步骤</button>`}
    </div>` : ''}
    </div>`;
}
