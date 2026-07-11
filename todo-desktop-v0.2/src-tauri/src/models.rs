use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct TaskCreateInput {
    pub id: Option<String>,
    pub r#type: Option<String>,
    pub sub_type: Option<String>,
    pub title: Option<String>,
    pub content: Option<String>,
    pub category_id: Option<String>,
    pub priority: Option<i32>,
    pub parent_id: Option<String>,
    pub sort_order: Option<i32>,
    pub status: Option<String>,
    pub grid_x: Option<i32>,
    pub grid_y: Option<i32>,
    pub home_x: Option<i32>,
    pub home_y: Option<i32>,
    pub todo_date: Option<String>,
    pub todo_status: Option<String>,
    pub recurrence: Option<String>,
    pub completed_at: Option<String>,
    pub deadline: Option<String>,
    pub pin_date: Option<String>,
    pub collapsed: Option<bool>,
    pub note: Option<String>,
    pub time_start: Option<String>,
    pub time_end: Option<String>,
    pub note_width: Option<i32>,
    pub note_height: Option<i32>,
    pub open_width: Option<i32>,
    pub open_height: Option<i32>,
    pub group_id: Option<String>,
    pub board_tab: Option<String>,
    pub node_mode: Option<bool>,
    pub schedule_start: Option<String>,
    pub schedule_end: Option<String>,
}

impl TaskCreateInput {
    pub fn into_task(self) -> TaskItem {
        TaskItem {
            id: self.id.unwrap_or_default(),
            r#type: self.r#type.unwrap_or_else(|| "note".to_string()),
            sub_type: self.sub_type.unwrap_or_else(|| "note".to_string()),
            title: self.title.unwrap_or_default(),
            content: self.content.unwrap_or_default(),
            category_id: self.category_id.unwrap_or_else(|| "cat_default".to_string()),
            priority: self.priority.unwrap_or(0),
            parent_id: self.parent_id,
            sort_order: self.sort_order.unwrap_or(0),
            status: self.status.unwrap_or_else(|| "active".to_string()),
            grid_x: self.grid_x,
            grid_y: self.grid_y,
            home_x: self.home_x,
            home_y: self.home_y,
            todo_date: self.todo_date,
            todo_status: self.todo_status,
            recurrence: self.recurrence,
            completed_at: self.completed_at,
            deadline: self.deadline,
            pin_date: self.pin_date,
            collapsed: self.collapsed.unwrap_or(false),
            note: self.note,
            time_start: self.time_start,
            time_end: self.time_end,
            note_width: self.note_width,
            note_height: self.note_height,
            open_width: self.open_width,
            open_height: self.open_height,
            group_id: self.group_id,
            board_tab: self.board_tab,
            node_mode: self.node_mode,
            schedule_start: self.schedule_start,
            schedule_end: self.schedule_end,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TaskItem {
    pub id: String,
    pub r#type: String,
    pub sub_type: String,
    pub title: String,
    pub content: String,
    pub category_id: String,
    pub priority: i32,
    pub parent_id: Option<String>,
    pub sort_order: i32,
    pub status: String,
    pub grid_x: Option<i32>,
    pub grid_y: Option<i32>,
    pub home_x: Option<i32>,
    pub home_y: Option<i32>,
    pub todo_date: Option<String>,
    pub todo_status: Option<String>,
    pub recurrence: Option<String>,
    pub completed_at: Option<String>,
    pub deadline: Option<String>,
    pub pin_date: Option<String>,
    pub collapsed: bool,
    pub note: Option<String>,
    pub time_start: Option<String>,
    pub time_end: Option<String>,
    pub note_width: Option<i32>,
    pub note_height: Option<i32>,
    pub open_width: Option<i32>,
    pub open_height: Option<i32>,
    pub group_id: Option<String>,
    pub board_tab: Option<String>,
    pub node_mode: Option<bool>,
    pub schedule_start: Option<String>,
    pub schedule_end: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Category {
    pub id: String,
    pub name: String,
    pub color: String,
    pub sort_order: i32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TimeType {
    pub id: String,
    pub name: String,
    pub color: String,
    pub sort_order: i32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TimeRecord {
    pub id: String,
    pub date: String,
    pub time_type: String,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub total_minutes: i32,
    pub pauses: Option<String>,
    pub source: String,
    pub note: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PomodoroPreset {
    pub id: String,
    pub time_type: String,
    pub color: String,
    pub duration_minutes: i32,
    pub mode: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Goal {
    pub id: String,
    pub goal_type: String,
    pub target_minutes: i32,
    pub is_active: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Countdown {
    pub id: String,
    pub title: String,
    pub target_date: String,
    pub color: Option<String>,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Connection {
    pub from_id: String,
    pub to_id: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AppSettings {
    pub theme: String,
    pub master_plan: String,
    pub master_reflection: String,
    pub quotes: String,
    pub quote_mode: String,
    pub quote_interval: String,
    pub pomodoro_show_todos: bool,
    pub pomodoro_show_plan: bool,
    pub pomodoro_show_countdown: bool,
    pub bg_home: String,
    pub bg_pomodoro: String,
    pub startup_minimized: bool,
    pub move_uncompleted: bool,
    pub board_bg_style: String,
    pub note_spacing: i32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AppData {
    pub tasks: Vec<TaskItem>,
    pub categories: Vec<Category>,
    pub time_types: Vec<TimeType>,
    #[serde(default)]
    pub time_records: Vec<TimeRecord>,
    pub pomodoro_presets: Vec<PomodoroPreset>,
    pub goals: Vec<Goal>,
    pub countdowns: Vec<Countdown>,
    pub connections: Vec<Connection>,
    pub settings: AppSettings,
    pub daily_logs: HashMap<String, String>,
    #[serde(default)]
    pub daily_scores: Vec<DailyScoreRecord>,
    #[serde(default)]
    pub memories: Vec<Memory>,
    #[serde(default)]
    pub conversations: Vec<Conversation>,
    pub version: String,
}

impl Default for AppData {
    fn default() -> Self {
        Self {
            tasks: Vec::new(),
            categories: vec![
                Category { id: "cat_default".into(), name: "其他".into(), color: "#8e8e8e".into(), sort_order: 99 },
                Category { id: "cat_study".into(), name: "学习".into(), color: "#5b7fff".into(), sort_order: 1 },
                Category { id: "cat_work".into(), name: "工作".into(), color: "#e07b6e".into(), sort_order: 2 },
                Category { id: "cat_reading".into(), name: "阅读".into(), color: "#4caf84".into(), sort_order: 3 },
                Category { id: "cat_exercise".into(), name: "运动".into(), color: "#e0a83c".into(), sort_order: 4 },
            ],
            time_types: vec![
                TimeType { id: "tt_study".into(), name: "学习".into(), color: "#5b7fff".into(), sort_order: 1 },
                TimeType { id: "tt_programming".into(), name: "编程".into(), color: "#4caf84".into(), sort_order: 2 },
                TimeType { id: "tt_english".into(), name: "英语".into(), color: "#e07b6e".into(), sort_order: 3 },
                TimeType { id: "tt_math".into(), name: "数学".into(), color: "#e0a83c".into(), sort_order: 4 },
                TimeType { id: "tt_reading".into(), name: "阅读".into(), color: "#9b7fd4".into(), sort_order: 5 },
            ],
            time_records: Vec::new(),
            pomodoro_presets: Vec::new(),
            goals: vec![
                Goal { id: "goal_daily".into(), goal_type: "daily".into(), target_minutes: 120, is_active: true },
                Goal { id: "goal_weekly".into(), goal_type: "weekly".into(), target_minutes: 600, is_active: true },
            ],
            countdowns: Vec::new(),
            connections: Vec::new(),
            settings: AppSettings {
                theme: "warm".into(),
                master_plan: String::new(),
                master_reflection: String::new(),
                quotes: "[]".into(),
                quote_mode: "random".into(),
                quote_interval: "30".into(),
                pomodoro_show_todos: true,
                pomodoro_show_plan: false,
                pomodoro_show_countdown: true,
                bg_home: String::new(),
                bg_pomodoro: String::new(),
                startup_minimized: false,
                move_uncompleted: false,
                board_bg_style: "cork".into(),
                note_spacing: 16,
            },
            daily_logs: HashMap::new(),
            daily_scores: Vec::new(),
            memories: Vec::new(),
            conversations: Vec::new(),
            version: "0.1.1".into(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TaskFilters {
    pub status: Option<String>,
    pub r#type: Option<String>,
    pub category_id: Option<String>,
    pub parent_id: Option<String>,
    pub todo_date: Option<String>,
    pub pin_date: Option<String>,
}

// ===== v0.2 活动监测数据结构（追加在文件末尾，不修改 v0.1 现有结构）=====

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct ActivitySession {
    pub id: String,
    pub date: String,
    pub start_time: String,
    pub end_time: String,
    pub process_name: String,
    pub window_title: String,
    pub web_title: Option<String>,
    pub category: String,
    pub duration_seconds: i64,
    pub source: String,
    pub import_batch_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CategoryRule {
    pub id: String,
    pub rule_type: String,
    pub mode: String,
    pub value: String,
    pub category: String,
    pub is_default: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct ActivityBatch {
    pub batch_id: String,
    pub date: String,
    pub count: i32,
    pub total_seconds: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AISummary {
    pub date: String,
    pub content: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ActivitySettings {
    pub monitor_enabled: bool,
    pub sample_interval_sec: u64,
    pub idle_threshold_min: u64,
    pub exclude_keywords: Vec<String>,
    pub ai_api_enabled: bool,
    pub ai_api_base_url: String,
    pub ai_api_key: String,
    pub ai_model: String,
    pub ai_system_prompt: String,
    pub ai_strict_mode: bool,
    pub show_thinking: bool,
    pub reminder_config: ReminderConfig,
}

impl Default for ActivitySettings {
    fn default() -> Self {
        Self {
            monitor_enabled: false,
            sample_interval_sec: 10,
            idle_threshold_min: 3,
            exclude_keywords: Vec::new(),
            ai_api_enabled: false,
            ai_api_base_url: String::new(),
            ai_api_key: String::new(),
            ai_model: String::new(),
            ai_system_prompt: String::new(),
            ai_strict_mode: false,
            show_thinking: false,
            reminder_config: ReminderConfig::default(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct ActivityState {
    pub running: bool,
    pub paused: bool,
    pub current_process: String,
    pub current_web_title: Option<String>,
    pub current_category: String,
    pub session_start: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct ActivitySummary {
    pub total_active_seconds: i64,
    pub category_breakdown: std::collections::HashMap<String, i64>,
    pub top_apps: Vec<TopApp>,
    pub browser_sessions: Vec<BrowserSession>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct TopApp {
    pub name: String,
    pub seconds: i64,
    pub category: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct BrowserSession {
    pub web_title: String,
    pub seconds: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct ProductivityScore {
    pub score: i32,
    pub level: String,
    pub focus_score: i32,
    pub pomo_score: i32,
    pub todo_score: i32,
    pub consistency_score: i32,
    #[serde(default)]
    pub analysis: Option<String>,
}

// ===== v0.2 AI 对话 =====

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ConversationMessage {
    pub role: String,  // "user" | "assistant" | "system"
    pub content: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AiChatRequest {
    pub session_id: String,
    pub message: String,
    pub page: String,
    pub page_data: Option<String>,
    #[serde(default)]
    pub history: Vec<ConversationMessage>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AiChatResponse {
    pub session_id: String,
    pub reply: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Conversation {
    pub id: String,
    pub title: String,
    pub messages: Vec<ConversationMessage>,
    pub created_at: String,
    pub updated_at: String,
}

// ===== v0.2 AI 工具调用 =====

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AiToolCall {
    pub tool: String,
    pub args: serde_json::Value,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AiToolResult {
    pub success: bool,
    pub message: String,
    pub data: Option<serde_json::Value>,
}

// ===== v0.2 评分持久化 =====

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DailyScoreRecord {
    pub date: String,
    pub score: i32,
    pub level: String,
    pub details: Option<String>,  // AI 给出的详细分析
}

// ===== v0.2 提醒配置 =====

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ReminderConfig {
    pub idle_reminder_enabled: bool,
    pub deadline_reminder_enabled: bool,
    pub idle_threshold_min: u64,
    pub check_interval_min: u64,
}

impl Default for ReminderConfig {
    fn default() -> Self {
        Self {
            idle_reminder_enabled: false,
            deadline_reminder_enabled: false,
            idle_threshold_min: 5,
            check_interval_min: 30,
        }
    }
}

// ===== 长期记忆 =====

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Memory {
    pub id: String,
    pub key: String,
    pub content: String,
    pub created_at: String,
}
