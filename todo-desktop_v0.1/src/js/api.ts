import { invoke } from '@tauri-apps/api/core';

export interface TaskItem {
  id: string;
  type: string;
  sub_type: string;
  title: string;
  content: string;
  category_id: string;
  priority: number;
  parent_id: string | null;
  sort_order: number;
  status: string;
  grid_x: number | null;
  grid_y: number | null;
  home_x: number | null;
  home_y: number | null;
  todo_date: string | null;
  todo_status: string | null;
  recurrence: string | null;
  completed_at: string | null;
  deadline: string | null;
  collapsed: boolean;
  note: string | null;
  pin_date: string | null;
  time_start: string | null;
  time_end: string | null;
  note_width: number | null;
  note_height: number | null;
  open_width: number | null;
  open_height: number | null;
  group_id: string | null;
  board_tab: string | null;
  node_mode: boolean | null;
  schedule_start: string | null;
  schedule_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskFilters {
  status?: string;
  type?: string;
  category_id?: string;
  parent_id?: string;
  todo_date?: string;
  pin_date?: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  sort_order: number;
}

export interface TimeType {
  id: string;
  name: string;
  color: string;
  sort_order: number;
}

export interface TimeRecord {
  id: string;
  date: string;
  time_type: string;
  start_time: string | null;
  end_time: string | null;
  total_minutes: number;
  pauses: string | null;
  source: string;
  note: string;
  created_at: string;
}

export interface PomodoroPreset {
  id: string;
  time_type: string;
  color: string;
  duration_minutes: number;
  mode: string;
  created_at: string;
}

export interface Goal {
  id: string;
  goal_type: string;
  target_minutes: number;
  is_active: boolean;
}

export interface Countdown {
  id: string;
  title: string;
  target_date: string;
  color: string | null;
  created_at: string;
}

export interface Connection {
  from_id: string;
  to_id: string;
}

export interface AppSettings {
  theme: string;
  master_plan: string;
  master_reflection: string;
  quotes: string;
  quote_mode: string;
  quote_interval: string;
  pomodoro_show_todos: boolean;
  pomodoro_show_plan: boolean;
  pomodoro_show_countdown: boolean;
  bg_home: string;
  bg_pomodoro: string;
  startup_minimized: boolean;
  move_uncompleted: boolean;
  board_bg_style: string;
  note_spacing: number;
}

export const taskApi = {
  list: (filters?: TaskFilters) => invoke<TaskItem[]>('task_list', { filters: filters ?? {} }),
  listAll: () => invoke<TaskItem[]>('task_list', { filters: {} }),
  get: (id: string) => invoke<TaskItem>('task_get', { id }),
  create: (task: Partial<TaskItem>) => invoke<TaskItem>('task_create', { task }),
  update: (id: string, updates: Partial<TaskItem>) => invoke<TaskItem>('task_update', { id, updates }),
  delete: (id: string) => invoke<boolean>('task_delete', { id }),
  batchCreate: (tasks: Partial<TaskItem>[]) => invoke<TaskItem[]>('task_batch_create', { tasks }),
  generateRecurring: (date: string) => invoke<number>('task_generate_recurring', { date }),
  updateTypeCascade: (id: string, newType: string) => invoke<TaskItem[]>('task_update_type_cascade', { id, newType }),
};

export const categoryApi = {
  list: () => invoke<Category[]>('category_list'),
  create: (name: string, color: string) => invoke<Category>('category_create', { name, color }),
  update: (id: string, name: string, color: string) => invoke<Category>('category_update', { id, name, color }),
  delete: (id: string) => invoke<boolean>('category_delete', { id }),
};

export const dailyLogApi = {
  get: (date: string) => invoke<string | null>('daily_log_get', { date }),
  set: (date: string, content: string) => invoke<void>('daily_log_set', { date, content }),
};

export const timeTypeApi = {
  list: () => invoke<TimeType[]>('time_type_list'),
  create: (name: string, color: string) => invoke<TimeType>('time_type_create', { name, color }),
  update: (id: string, updates: Partial<TimeType>) => invoke<TimeType>('time_type_update', { id, updates }),
  delete: (id: string) => invoke<boolean>('time_type_delete', { id }),
};

export const timeRecordApi = {
  create: (record: Partial<TimeRecord>) => invoke<TimeRecord>('time_record_create', { record }),
  list: (date: string) => invoke<TimeRecord[]>('time_record_list', { date }),
  listRange: (start: string, end: string) => invoke<TimeRecord[]>('time_record_list_range', { start, end }),
  listAll: () => invoke<TimeRecord[]>('time_record_list_all'),
  update: (id: string, updates: Partial<TimeRecord>) => invoke<TimeRecord>('time_record_update', { id, updates }),
  delete: (id: string) => invoke<boolean>('time_record_delete', { id }),
};

export const presetApi = {
  list: () => invoke<PomodoroPreset[]>('preset_list'),
  create: (preset: Partial<PomodoroPreset>) => invoke<PomodoroPreset>('preset_create', { preset }),
  update: (id: string, updates: Partial<PomodoroPreset>) => invoke<PomodoroPreset>('preset_update', { id, updates }),
  delete: (id: string) => invoke<boolean>('preset_delete', { id }),
};

export const goalApi = {
  list: () => invoke<Goal[]>('goal_list'),
  set: (goalType: string, targetMinutes: number) => invoke<Goal>('goal_set', { goalType, targetMinutes }),
};

export const countdownApi = {
  list: () => invoke<Countdown[]>('countdown_list'),
  create: (title: string, targetDate: string, color?: string) => invoke<Countdown>('countdown_create', { title, targetDate, color }),
  update: (id: string, updates: Partial<Countdown>) => invoke<Countdown>('countdown_update', { id, updates }),
  delete: (id: string) => invoke<boolean>('countdown_delete', { id }),
};

export const connectionApi = {
  list: () => invoke<Connection[]>('connection_list'),
  create: (fromId: string, toId: string) => invoke<Connection>('connection_create', { fromId, toId }),
  delete: (fromId: string, toId: string) => invoke<boolean>('connection_delete', { fromId, toId }),
};

export const settingsApi = {
  get: () => invoke<AppSettings>('settings_get'),
  update: (updates: Partial<AppSettings>) => invoke<AppSettings>('settings_update', { updates }),
};

export const statsApi = {
  getStudyStats: (range: string) => invoke<Record<string, unknown>>('stats_study', { range }),
  getStreak: () => invoke<number>('stats_streak'),
  exportAll: () => invoke<Record<string, unknown>>('data_export'),
  importLegacy: (jsonPath: string) => invoke<string>('data_import_legacy', { jsonPath }),
  importLegacyJson: (jsonContent: string) => invoke<string>('data_import_legacy_json', { jsonContent }),
  reset: () => invoke<string>('data_reset'),
  resetTasks: () => invoke<string>('data_reset_tasks'),
};
