import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

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
  importV01Native: (path: string) => invoke<string>('data_import_v01_native', { path }),
  importV01Auto: () => invoke<string>('data_import_v01_auto'),
  syncCompletedStatus: () => invoke<number>('sync_completed_status'),
};

// 活动监测相关类型
export interface ActivitySession {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  process_name: string;
  window_title: string;
  web_title: string | null;
  category: string;
  duration_seconds: number;
  source: string;
  import_batch_id: string | null;
}

export interface ActivitySettings {
  monitor_enabled: boolean;
  sample_interval_sec: number;
  idle_threshold_min: number;
  exclude_keywords: string[];
  ai_api_enabled: boolean;
  ai_api_base_url: string;
  ai_api_key: string;
  ai_model: string;
  ai_system_prompt: string;
  ai_strict_mode: boolean;
  show_thinking: boolean;
  current_persona_id: string;
  reminder_config: ReminderConfig;
}

export interface AiPersona {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  greeting: string;
  is_builtin: boolean;
}

export interface ReminderConfig {
  idle_reminder_enabled: boolean;
  deadline_reminder_enabled: boolean;
  idle_threshold_min: number;
  check_interval_min: number;
}

export interface ActivityState {
  running: boolean;
  paused: boolean;
  current_process: string;
  current_web_title: string | null;
  current_category: string;
  session_start: string | null;
}

export interface TopApp {
  name: string;
  seconds: number;
  category: string;
}

export interface BrowserSession {
  web_title: string;
  seconds: number;
}

export interface ActivitySummary {
  total_active_seconds: number;
  category_breakdown: Record<string, number>;
  top_apps: TopApp[];
  browser_sessions: BrowserSession[];
}

export interface CategoryRule {
  id: string;
  rule_type: string;
  mode: string;
  value: string;
  category: string;
  is_default: boolean;
}

export interface ActivityBatch {
  batch_id: string;
  date: string;
  count: number;
  total_seconds: number;
}

export interface ProductivityScore {
  score: number;
  level: string;
  focus_score: number;
  pomo_score: number;
  todo_score: number;
  consistency_score: number;
  analysis?: string | null;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ConversationMessage[];
  created_at: string;
  updated_at: string;
}

export interface ConversationMessage {
  role: string;
  content: string;
}

export interface AiChatRequest {
  session_id: string;
  message: string;
  page: string;
  page_data?: string;
  history?: ConversationMessage[];
}

export interface AiChatResponse {
  session_id: string;
  reply: string;
}

export interface DailyScoreRecord {
  date: string;
  score: number;
  level: string;
  details?: string | null;
}

export interface BehaviorPattern {
  pattern_type: string;
  description: string;
  confidence: number;
  detected_at: string;
}

export interface UserInsight {
  id: string;
  insight_type: string;
  content: string;
  source: string;
  created_at: string;
}

export interface UserProfile {
  preferred_work_hours: string[];
  common_categories: string[];
  productivity_patterns: BehaviorPattern[];
  insights: UserInsight[];
  last_updated: string;
  total_days_active: number;
  average_daily_focus: number;
}

export const activityApi = {
  getState: () => invoke<ActivityState>('activity_get_state'),
  start: () => invoke<void>('activity_start'),
  stop: () => invoke<void>('activity_stop'),
  pause: () => invoke<void>('activity_pause'),
  resume: () => invoke<void>('activity_resume'),
  getSettings: () => invoke<ActivitySettings>('activity_get_settings'),
  updateSettings: (updates: Partial<ActivitySettings>) => invoke<ActivitySettings>('activity_update_settings', { updates }),
  getSessions: (date: string) => invoke<ActivitySession[]>('activity_get_sessions', { date }),
  getSummary: (date: string) => invoke<ActivitySummary>('activity_get_summary', { date }),
  updateSession: (id: string, updates: Partial<ActivitySession>) => invoke<ActivitySession | null>('activity_update_session', { id, updates }),
  deleteSession: (id: string) => invoke<boolean>('activity_delete_session', { id }),
  clearDate: (date: string) => invoke<number>('activity_clear_date', { date }),
  getRules: () => invoke<CategoryRule[]>('activity_get_rules'),
  setRules: (rules: CategoryRule[]) => invoke<void>('activity_set_rules', { rules }),
  reclassify: () => invoke<number>('activity_reclassify'),
  exportCsv: () => invoke<string>('activity_export_csv'),
  exportJson: () => invoke<string>('activity_export_json'),
  importCsv: (content: string) => invoke<string>('activity_import_csv', { content }),
  importJson: (content: string) => invoke<string>('activity_import_json', { content }),
  getBatches: () => invoke<ActivityBatch[]>('activity_get_batches'),
  deleteBatch: (batchId: string) => invoke<number>('activity_delete_batch', { batchId }),
  getProductivityScore: (date: string) => invoke<ProductivityScore>('activity_get_productivity_score', { date }),
};

export const aiApi = {
  generate: (date: string) => invoke<string>('ai_generate', { date }),
  test: () => invoke<string>('ai_test'),
  getCached: (date: string) => invoke<string | null>('ai_get_cached', { date }),
  chat: (request: AiChatRequest) => invoke<AiChatResponse>('ai_chat', { request }),
};

export const reminderApi = {
  start: () => invoke<string>('reminder_start'),
  stop: () => invoke<string>('reminder_stop'),
  status: () => invoke<boolean>('reminder_status'),
};

export const scoreApi = {
  getHistory: () => invoke<DailyScoreRecord[]>('get_daily_score_history'),
};

export const conversationApi = {
  list: () => invoke<Conversation[]>('conversation_list'),
  get: (id: string) => invoke<Conversation | null>('conversation_get', { id }),
  delete: (id: string) => invoke<boolean>('conversation_delete', { id }),
};

export const personaApi = {
  list: () => invoke<AiPersona[]>('persona_list'),
};

export const userApi = {
  getProfile: () => invoke<UserProfile>('user_get_profile'),
  analyze: () => invoke<UserProfile>('user_analyze'),
  getInsights: () => invoke<UserInsight[]>('user_get_insights'),
  deleteInsight: (id: string) => invoke<boolean>('user_delete_insight', { id }),
};

export interface McpServerConfig {
  id: string;
  name: string;
  transport: string;
  command?: string | null;
  args?: string[] | null;
  url?: string | null;
  enabled: boolean;
}

export interface McpServerStatus {
  id: string;
  name: string;
  connected: boolean;
  tools_count: number;
  error?: string | null;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  server_id: string;
}

export interface McpToolCallRequest {
  server_id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
}

export interface McpContentItem {
  type: 'text' | 'resource';
  text?: string;
  resource?: Record<string, unknown>;
}

export interface McpToolCallResult {
  success: boolean;
  content: McpContentItem[];
  error?: string | null;
}

export const mcpApi = {
  listServers: () => invoke<McpServerStatus[]>('mcp_list_servers'),
  addServer: (config: McpServerConfig) => invoke<void>('mcp_add_server', { config }),
  removeServer: (id: string) => invoke<boolean>('mcp_remove_server', { id }),
  connectServer: (id: string) => invoke<void>('mcp_connect_server', { id }),
  disconnectServer: (id: string) => invoke<void>('mcp_disconnect_server', { id }),
  getTools: (serverId: string) => invoke<McpToolDefinition[]>('mcp_get_tools', { serverId }),
  callTool: (request: McpToolCallRequest) => invoke<McpToolCallResult>('mcp_call_tool', { request }),
};

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onReasoning: (reasoning: string) => void;
  onDone: (result: { content: string; session_id: string }) => void;
  onError: (error: string) => void;
}

export async function streamChat(request: AiChatRequest, callbacks: StreamCallbacks): Promise<() => void> {
  const unlisteners: (() => void)[] = [];

  const u1 = await listen<string>('ai-chat-token', (event) => {
    callbacks.onToken(event.payload);
  });
  unlisteners.push(u1);

  const u2 = await listen<string>('ai-chat-reasoning', (event) => {
    callbacks.onReasoning(event.payload);
  });
  unlisteners.push(u2);

  const u3 = await listen<{ content: string; session_id: string }>('ai-chat-done', (event) => {
    callbacks.onDone(event.payload);
  });
  unlisteners.push(u3);

  const u4 = await listen<string>('ai-chat-error', (event) => {
    callbacks.onError(event.payload);
  });
  unlisteners.push(u4);

  invoke('ai_chat_stream', { request }).catch((err) => {
    callbacks.onError(err?.message || String(err));
  });

  return () => unlisteners.forEach(fn => fn());
}
