// v0.2 活动监测核心：ActivityStore（独立存储）+ ActivityMonitor（采样线程）+ Win32 API

use crate::database::Database;
use crate::models::*;
use chrono::Local;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};
use uuid::Uuid;

// 浏览器进程名（小写，不含扩展名）
const BROWSER_PROCESSES: &[&str] = &[
    "chrome", "msedge", "firefox", "safari", "opera", "brave", "arc",
];

// 浏览器窗口标题后缀
const BROWSER_TITLE_SUFFIXES: &[&str] = &[
    " - Google Chrome",
    " - Microsoft Edge",
    " - Mozilla Firefox",
    " - Brave",
    " - Opera",
    " - Arc",
    " - Safari",
];

fn now_str() -> String {
    Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn today_str() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

fn new_id() -> String {
    Uuid::new_v4().to_string()
}

/// 活动数据整体结构（存储于 activity-data.json）
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct ActivityData {
    pub sessions: Vec<ActivitySession>,
    /// 仅存用户规则（is_default=false）；默认规则由函数动态生成
    pub category_rules: Vec<CategoryRule>,
    pub ai_summaries: HashMap<String, AISummary>,
    pub settings: ActivitySettings,
    pub version: String,
}

pub struct ActivityStore {
    pub data: Arc<Mutex<ActivityData>>,
    pub path: PathBuf,
}

/// 生成默认分类规则（id 以 dcr_ 开头，is_default=true）
fn default_category_rules() -> Vec<CategoryRule> {
    let mut rules = Vec::new();
    let mk = |id: &str, rt: &str, mode: &str, val: &str, cat: &str| CategoryRule {
        id: id.to_string(),
        rule_type: rt.to_string(),
        mode: mode.to_string(),
        value: val.to_string(),
        category: cat.to_string(),
        is_default: true,
    };
    // 学习
    for kw in ["Anki", "Notion", "Obsidian", "OneNote", "Word", "PDF"] {
        rules.push(mk(
            &format!("dcr_study_{}", kw.to_lowercase()),
            "title",
            "contains",
            kw,
            "学习",
        ));
    }
    // 编程
    for kw in ["Code", "VSCode", "Cursor", "IntelliJ", "Terminal", "PowerShell"] {
        rules.push(mk(
            &format!("dcr_program_{}", kw.to_lowercase()),
            "title",
            "contains",
            kw,
            "编程",
        ));
    }
    // 浏览（浏览器进程；运行时强制识别，此处作为规则文档与回退匹配）
    for kw in BROWSER_PROCESSES {
        rules.push(mk(
            &format!("dcr_browse_{}", kw),
            "process",
            "contains",
            kw,
            "浏览",
        ));
    }
    // 社交
    for kw in ["WeChat", "QQ", "DingTalk", "Telegram", "Discord"] {
        rules.push(mk(
            &format!("dcr_social_{}", kw.to_lowercase()),
            "title",
            "contains",
            kw,
            "社交",
        ));
    }
    // 娱乐
    for kw in ["Steam", "Bilibili", "YouTube", "Netflix"] {
        rules.push(mk(
            &format!("dcr_fun_{}", kw.to_lowercase()),
            "title",
            "contains",
            kw,
            "娱乐",
        ));
    }
    rules
}

/// 判断进程是否为浏览器
fn is_browser_process(process_name: &str) -> bool {
    let name = process_name
        .rsplit(|c| c == '/' || c == '\\')
        .next()
        .unwrap_or(process_name);
    let stem = name.strip_suffix(".exe").unwrap_or(name).to_lowercase();
    BROWSER_PROCESSES.iter().any(|b| stem == *b || stem.starts_with(b))
}

/// 提取浏览器网页标题；非浏览器返回 None
pub fn extract_web_title(window_title: &str, process_name: &str) -> Option<String> {
    if !is_browser_process(process_name) {
        return None;
    }
    let title = window_title.trim();
    if title.is_empty() {
        return Some("新标签页".to_string());
    }
    for suffix in BROWSER_TITLE_SUFFIXES {
        if let Some(stripped) = title.strip_suffix(suffix) {
            let web = stripped.trim();
            if web.is_empty() {
                return Some("新标签页".to_string());
            }
            let lower = web.to_lowercase();
            if lower == "new tab" || lower == "新标签页" {
                return Some("新标签页".to_string());
            }
            return Some(web.to_string());
        }
    }
    // 没有匹配后缀（可能是空白标签页或加载中）
    Some(title.to_string())
}

/// 分类活动：浏览器强制"浏览"，否则按规则匹配，默认"其他"
pub fn classify_activity(
    process_name: &str,
    window_title: &str,
    rules: &[CategoryRule],
) -> String {
    if is_browser_process(process_name) {
        return "浏览".to_string();
    }
    for rule in rules {
        let haystack: &str = match rule.rule_type.as_str() {
            "process" => process_name,
            "title" => window_title,
            _ => continue,
        };
        let matched = match rule.mode.as_str() {
            "contains" => haystack.to_lowercase().contains(&rule.value.to_lowercase()),
            "regex" => Regex::new(&rule.value).map(|re| re.is_match(haystack)).unwrap_or(false),
            _ => false,
        };
        if matched {
            return rule.category.clone();
        }
    }
    "其他".to_string()
}

/// 进程显示名（去除路径与扩展名）
fn process_display_name(process_name: &str) -> String {
    let name = process_name
        .rsplit(|c| c == '/' || c == '\\')
        .next()
        .unwrap_or(process_name);
    name.rsplit_once('.')
        .map(|(s, _)| s.to_string())
        .unwrap_or_else(|| name.to_string())
}

impl ActivityStore {
    pub fn new(app_data_dir: PathBuf) -> Self {
        let data_path = app_data_dir.join("activity-data.json");
        let data = if data_path.exists() {
            let raw = std::fs::read_to_string(&data_path).unwrap_or_default();
            serde_json::from_str::<ActivityData>(&raw).unwrap_or_else(|_| ActivityData {
                category_rules: Vec::new(),
                settings: ActivitySettings::default(),
                version: "0.2.0".to_string(),
                ..Default::default()
            })
        } else {
            let default_data = ActivityData {
                category_rules: Vec::new(),
                settings: ActivitySettings::default(),
                version: "0.2.0".to_string(),
                ..Default::default()
            };
            if let Some(parent) = data_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let _ = std::fs::write(
                &data_path,
                serde_json::to_string_pretty(&default_data).unwrap_or_default(),
            );
            default_data
        };
        ActivityStore {
            data: Arc::new(Mutex::new(data)),
            path: data_path,
        }
    }

    pub fn save(&self) {
        let data = self.data.lock().unwrap();
        let json = serde_json::to_string_pretty(&*data).unwrap_or_default();
        let path = self.path.clone();
        drop(data);
        let _ = std::fs::write(&path, json);
    }

    pub fn get_sessions_by_date(&self, date: &str) -> Vec<ActivitySession> {
        let data = self.data.lock().unwrap();
        let mut sessions: Vec<ActivitySession> = data
            .sessions
            .iter()
            .filter(|s| s.date == date)
            .cloned()
            .collect();
        sessions.sort_by(|a, b| a.start_time.cmp(&b.start_time));
        sessions
    }

    pub fn add_session(&self, mut session: ActivitySession) -> ActivitySession {
        session.id = new_id();
        if session.date.is_empty() {
            session.date = today_str();
        }
        let mut data = self.data.lock().unwrap();
        data.sessions.push(session.clone());
        drop(data);
        self.save();
        session
    }

    /// 扩展会话时长（监测线程每采样一次调用）
    pub fn extend_session(&self, id: &str, delta_seconds: i64) {
        let now = now_str();
        let mut data = self.data.lock().unwrap();
        if let Some(s) = data.sessions.iter_mut().find(|s| s.id == id) {
            s.duration_seconds += delta_seconds;
            s.end_time = now;
        }
        drop(data);
        self.save();
    }

    pub fn update_session(&self, id: &str, updates: Value) -> Option<ActivitySession> {
        let mut data = self.data.lock().unwrap();
        let session = data.sessions.iter_mut().find(|s| s.id == id)?;
        if let Some(v) = updates.get("date").and_then(|v| v.as_str()) {
            session.date = v.to_string();
        }
        if let Some(v) = updates.get("start_time").and_then(|v| v.as_str()) {
            session.start_time = v.to_string();
        }
        if let Some(v) = updates.get("end_time").and_then(|v| v.as_str()) {
            session.end_time = v.to_string();
        }
        if let Some(v) = updates.get("process_name").and_then(|v| v.as_str()) {
            session.process_name = v.to_string();
        }
        if let Some(v) = updates.get("window_title").and_then(|v| v.as_str()) {
            session.window_title = v.to_string();
        }
        if let Some(v) = updates.get("web_title") {
            session.web_title = v.as_str().map(|s| s.to_string());
        }
        if let Some(v) = updates.get("category").and_then(|v| v.as_str()) {
            session.category = v.to_string();
        }
        if let Some(v) = updates.get("duration_seconds").and_then(|v| v.as_i64()) {
            session.duration_seconds = v;
        }
        if let Some(v) = updates.get("source").and_then(|v| v.as_str()) {
            session.source = v.to_string();
        }
        if let Some(v) = updates.get("import_batch_id") {
            session.import_batch_id = v.as_str().map(|s| s.to_string());
        }
        let result = session.clone();
        drop(data);
        self.save();
        Some(result)
    }

    pub fn delete_session(&self, id: &str) -> bool {
        let mut data = self.data.lock().unwrap();
        let before = data.sessions.len();
        data.sessions.retain(|s| s.id != id);
        let deleted = data.sessions.len() < before;
        drop(data);
        if deleted {
            self.save();
        }
        deleted
    }

    /// 聚合某日活动摘要（排除 idle 会话）
    pub fn get_daily_summary(&self, date: &str) -> ActivitySummary {
        let data = self.data.lock().unwrap();
        let mut category_breakdown: HashMap<String, i64> = HashMap::new();
        let mut app_map: HashMap<String, (i64, String)> = HashMap::new();
        let mut browser_map: HashMap<String, i64> = HashMap::new();
        let mut total_active = 0i64;

        for s in data.sessions.iter().filter(|s| s.date == date) {
            let dur = s.duration_seconds.max(0);
            if s.category == "idle" {
                continue;
            }
            total_active += dur;
            *category_breakdown.entry(s.category.clone()).or_insert(0) += dur;
            if is_browser_process(&s.process_name) {
                let web = s
                    .web_title
                    .clone()
                    .unwrap_or_else(|| s.window_title.clone());
                *browser_map.entry(web.clone()).or_insert(0) += dur;
                let entry = app_map.entry(web).or_insert((0, s.category.clone()));
                entry.0 += dur;
            } else {
                let name = process_display_name(&s.process_name);
                let entry = app_map.entry(name).or_insert((0, s.category.clone()));
                entry.0 += dur;
            }
        }

        let mut top_apps: Vec<TopApp> = app_map
            .into_iter()
            .map(|(name, (seconds, category))| TopApp {
                name,
                seconds,
                category,
            })
            .collect();
        top_apps.sort_by(|a, b| b.seconds.cmp(&a.seconds));
        top_apps.truncate(10);

        let mut browser_sessions: Vec<BrowserSession> = browser_map
            .into_iter()
            .map(|(web_title, seconds)| BrowserSession { web_title, seconds })
            .collect();
        browser_sessions.sort_by(|a, b| b.seconds.cmp(&a.seconds));

        ActivitySummary {
            total_active_seconds: total_active,
            category_breakdown,
            top_apps,
            browser_sessions,
        }
    }

    /// 获取规则：用户规则（前）+ 默认规则
    pub fn get_rules(&self) -> Vec<CategoryRule> {
        let data = self.data.lock().unwrap();
        let mut rules = data.category_rules.clone();
        rules.extend(default_category_rules());
        rules
    }

    /// 仅存非默认规则
    pub fn set_user_rules(&self, rules: Vec<CategoryRule>) {
        let mut data = self.data.lock().unwrap();
        data.category_rules = rules.into_iter().filter(|r| !r.is_default).collect();
        drop(data);
        self.save();
    }

    /// 用当前规则重新分类所有会话，返回变更条数
    pub fn reclassify_all(&self) -> i32 {
        let rules = self.get_rules();
        let mut data = self.data.lock().unwrap();
        let mut changed = 0i32;
        for s in data.sessions.iter_mut() {
            let new_cat = classify_activity(&s.process_name, &s.window_title, &rules);
            if new_cat != s.category {
                s.category = new_cat;
                changed += 1;
            }
        }
        drop(data);
        self.save();
        changed
    }

    pub fn clear_date(&self, date: &str) -> i32 {
        let mut data = self.data.lock().unwrap();
        let before = data.sessions.len();
        data.sessions.retain(|s| s.date != date);
        let removed = (before - data.sessions.len()) as i32;
        drop(data);
        if removed > 0 {
            self.save();
        }
        removed
    }

    /// CSV 转义
    fn csv_cell(s: &str) -> String {
        if s.contains(',') || s.contains('"') || s.contains('\n') || s.contains('\r') {
            format!("\"{}\"", s.replace('"', "\"\""))
        } else {
            s.to_string()
        }
    }

    pub fn export_csv(&self) -> String {
        let data = self.data.lock().unwrap();
        let mut rows = vec![
            "id,date,start_time,end_time,process_name,window_title,web_title,category,duration_seconds,source,import_batch_id".to_string(),
        ];
        for s in data.sessions.iter() {
            let web = s.web_title.clone().unwrap_or_default();
            let batch = s.import_batch_id.clone().unwrap_or_default();
            rows.push(format!(
                "{},{},{},{},{},{},{},{},{},{},{}",
                Self::csv_cell(&s.id),
                Self::csv_cell(&s.date),
                Self::csv_cell(&s.start_time),
                Self::csv_cell(&s.end_time),
                Self::csv_cell(&s.process_name),
                Self::csv_cell(&s.window_title),
                Self::csv_cell(&web),
                Self::csv_cell(&s.category),
                s.duration_seconds,
                Self::csv_cell(&s.source),
                Self::csv_cell(&batch),
            ));
        }
        rows.join("\n")
    }

    pub fn export_json(&self) -> String {
        let data = self.data.lock().unwrap();
        serde_json::to_string_pretty(&*data).unwrap_or_default()
    }

    /// 批量导入会话：生成 batch_id，source="import"，返回 batch_id
    pub fn import_sessions(&self, sessions: Vec<ActivitySession>) -> String {
        let batch_id = format!("batch_{}", new_id());
        let now = now_str();
        let today = today_str();
        let mut data = self.data.lock().unwrap();
        for mut s in sessions {
            s.id = new_id();
            s.source = "import".to_string();
            s.import_batch_id = Some(batch_id.clone());
            if s.date.is_empty() {
                s.date = today.clone();
            }
            if s.start_time.is_empty() {
                s.start_time = now.clone();
            }
            if s.end_time.is_empty() {
                s.end_time = now.clone();
            }
            data.sessions.push(s);
        }
        drop(data);
        self.save();
        batch_id
    }

    pub fn get_batches(&self) -> Vec<ActivityBatch> {
        let data = self.data.lock().unwrap();
        let mut map: HashMap<String, ActivityBatch> = HashMap::new();
        for s in data.sessions.iter().filter(|s| s.source == "import") {
            if let Some(bid) = &s.import_batch_id {
                let entry = map
                    .entry(bid.clone())
                    .or_insert_with(|| ActivityBatch {
                        batch_id: bid.clone(),
                        date: s.date.clone(),
                        count: 0,
                        total_seconds: 0,
                    });
                entry.count += 1;
                entry.total_seconds += s.duration_seconds.max(0);
            }
        }
        let mut batches: Vec<ActivityBatch> = map.into_values().collect();
        batches.sort_by(|a, b| b.batch_id.cmp(&a.batch_id));
        batches
    }

    pub fn delete_batch(&self, batch_id: &str) -> i32 {
        let mut data = self.data.lock().unwrap();
        let before = data.sessions.len();
        data.sessions
            .retain(|s| s.import_batch_id.as_deref() != Some(batch_id));
        let removed = (before - data.sessions.len()) as i32;
        drop(data);
        if removed > 0 {
            self.save();
        }
        removed
    }

    pub fn get_cached_summary(&self, date: &str) -> Option<String> {
        let data = self.data.lock().unwrap();
        data.ai_summaries.get(date).map(|s| s.content.clone())
    }

    pub fn set_cached_summary(&self, date: &str, content: String) {
        let mut data = self.data.lock().unwrap();
        data.ai_summaries.insert(
            date.to_string(),
            AISummary {
                date: date.to_string(),
                content,
                created_at: now_str(),
            },
        );
        drop(data);
        self.save();
    }

    pub fn get_settings(&self) -> ActivitySettings {
        let data = self.data.lock().unwrap();
        data.settings.clone()
    }

    pub fn update_settings(&self, updates: Value) -> ActivitySettings {
        let mut data = self.data.lock().unwrap();
        if let Some(v) = updates.get("monitor_enabled").and_then(|v| v.as_bool()) {
            data.settings.monitor_enabled = v;
        }
        if let Some(v) = updates.get("sample_interval_sec").and_then(|v| v.as_u64()) {
            data.settings.sample_interval_sec = v;
        }
        if let Some(v) = updates.get("idle_threshold_min").and_then(|v| v.as_u64()) {
            data.settings.idle_threshold_min = v;
        }
        if let Some(v) = updates.get("exclude_keywords").and_then(|v| v.as_array()) {
            data.settings.exclude_keywords = v
                .iter()
                .filter_map(|x| x.as_str().map(|s| s.to_string()))
                .collect();
        }
        if let Some(v) = updates.get("ai_api_enabled").and_then(|v| v.as_bool()) {
            data.settings.ai_api_enabled = v;
        }
        if let Some(v) = updates.get("ai_api_base_url").and_then(|v| v.as_str()) {
            data.settings.ai_api_base_url = v.to_string();
        }
        if let Some(v) = updates.get("ai_api_key").and_then(|v| v.as_str()) {
            data.settings.ai_api_key = v.to_string();
        }
        if let Some(v) = updates.get("ai_model").and_then(|v| v.as_str()) {
            data.settings.ai_model = v.to_string();
        }
        if let Some(v) = updates.get("ai_system_prompt").and_then(|v| v.as_str()) {
            data.settings.ai_system_prompt = v.to_string();
        }
        if let Some(v) = updates.get("ai_strict_mode").and_then(|v| v.as_bool()) {
            data.settings.ai_strict_mode = v;
        }
        if let Some(v) = updates.get("current_persona_id").and_then(|v| v.as_str()) {
            data.settings.current_persona_id = v.to_string();
        }
        // reminder config
        if let Some(v) = updates.get("idle_reminder_enabled").and_then(|v| v.as_bool()) {
            data.settings.reminder_config.idle_reminder_enabled = v;
        }
        if let Some(v) = updates.get("deadline_reminder_enabled").and_then(|v| v.as_bool()) {
            data.settings.reminder_config.deadline_reminder_enabled = v;
        }
        if let Some(v) = updates.get("reminder_idle_threshold_min").and_then(|v| v.as_u64()) {
            data.settings.reminder_config.idle_threshold_min = v;
        }
        if let Some(v) = updates.get("reminder_check_interval_min").and_then(|v| v.as_u64()) {
            data.settings.reminder_config.check_interval_min = v;
        }
        let result = data.settings.clone();
        drop(data);
        self.save();
        result
    }

    /// 生产力评分（支持 AI 评分，无 AI 时用公式兜底）
    pub fn get_productivity_score(
        &self,
        date: &str,
        pomo_minutes: i32,
        todo_total: i32,
        todo_completed: i32,
    ) -> ProductivityScore {
        let summary = self.get_daily_summary(date);
        let total_active = summary.total_active_seconds as f64;
        let focus_seconds = summary.category_breakdown.get("学习").copied().unwrap_or(0) as f64
            + summary.category_breakdown.get("编程").copied().unwrap_or(0) as f64;

        // 先用公式计算兜底分数
        let focus_score = if total_active > 0.0 {
            ((focus_seconds / total_active) * 100.0).min(100.0) as i32
        } else { 0 };

        let pomo_target = 120.0;
        let pomo_score = if pomo_minutes > 0 {
            ((pomo_minutes as f64 / pomo_target) * 100.0).min(100.0) as i32
        } else { 0 };

        let todo_score = if todo_total > 0 {
            ((todo_completed as f64 / todo_total as f64) * 100.0).min(100.0) as i32
        } else { 0 };

        let consistency_score = if pomo_minutes > 0 {
            let pomo_seconds = pomo_minutes as f64 * 60.0;
            ((focus_seconds / pomo_seconds) * 100.0).min(100.0) as i32
        } else if focus_seconds > 0.0 { 100 } else { 0 };

        let score = (focus_score as f64 * 0.4 + pomo_score as f64 * 0.3
            + todo_score as f64 * 0.2 + consistency_score as f64 * 0.1).round() as i32;
        let level = match score {
            s if s >= 90 => "优秀".to_string(),
            s if s >= 75 => "良好".to_string(),
            s if s >= 60 => "中等".to_string(),
            _ => "待改进".to_string(),
        };

        ProductivityScore {
            score,
            level,
            focus_score,
            pomo_score,
            todo_score,
            consistency_score,
            analysis: None,
        }
    }

    /// 保存 AI 评分到数据库
    pub fn save_ai_score_to_db(&self, db: &Database, date: &str, ps: &ProductivityScore, analysis: Option<&str>) {
        db.save_daily_score(crate::models::DailyScoreRecord {
            date: date.to_string(),
            score: ps.score,
            level: ps.level.clone(),
            details: analysis.map(|s| s.to_string()),
        });
    }
}

// ===== 活动监测线程 =====

pub struct ActivityMonitor {
    store: Arc<ActivityStore>,
    state: Arc<Mutex<ActivityState>>,
    running: Arc<AtomicBool>,
    paused: Arc<AtomicBool>,
    handle: Mutex<Option<JoinHandle<()>>>,
    /// 当前正在累计的会话 id（None 表示无活动会话）
    current_session_id: Arc<Mutex<Option<String>>>,
}

impl ActivityMonitor {
    pub fn new(store: Arc<ActivityStore>) -> Self {
        Self {
            store,
            state: Arc::new(Mutex::new(ActivityState::default())),
            running: Arc::new(AtomicBool::new(false)),
            paused: Arc::new(AtomicBool::new(false)),
            handle: Mutex::new(None),
            current_session_id: Arc::new(Mutex::new(None)),
        }
    }

    pub fn start(&self) {
        let mut handle_guard = self.handle.lock().unwrap();
        if handle_guard.is_some() {
            return;
        }
        self.running.store(true, Ordering::SeqCst);
        self.paused.store(false, Ordering::SeqCst);
        {
            let mut st = self.state.lock().unwrap();
            st.running = true;
            st.paused = false;
        }
        let store = self.store.clone();
        let state = self.state.clone();
        let running = self.running.clone();
        let paused = self.paused.clone();
        let current_session_id = self.current_session_id.clone();
        let handle = thread::spawn(move || {
            while running.load(Ordering::SeqCst) {
                if !paused.load(Ordering::SeqCst) {
                    sample_activity(&store, &state, &current_session_id);
                }
                let interval_ms = store.get_settings().sample_interval_sec.max(1) * 1000;
                let start = Instant::now();
                while running.load(Ordering::SeqCst)
                    && start.elapsed().as_millis() < interval_ms as u128
                {
                    thread::sleep(Duration::from_millis(200));
                }
            }
        });
        *handle_guard = Some(handle);
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
        let mut handle_guard = self.handle.lock().unwrap();
        if let Some(handle) = handle_guard.take() {
            let _ = handle.join();
        }
        let mut st = self.state.lock().unwrap();
        st.running = false;
        st.paused = false;
        st.session_start = None;
        st.current_process.clear();
        st.current_web_title = None;
        st.current_category.clear();
        drop(st);
        let mut cid = self.current_session_id.lock().unwrap();
        *cid = None;
    }

    pub fn pause(&self) {
        self.paused.store(true, Ordering::SeqCst);
        let mut st = self.state.lock().unwrap();
        st.paused = true;
    }

    pub fn resume(&self) {
        self.paused.store(false, Ordering::SeqCst);
        let mut st = self.state.lock().unwrap();
        st.paused = false;
    }

    pub fn get_state(&self) -> ActivityState {
        self.state.lock().unwrap().clone()
    }
}

/// 应用排除关键词：命中则返回 "[已过滤]"
fn apply_exclude_keywords(title: &str, keywords: &[String]) -> String {
    let lower = title.to_lowercase();
    for kw in keywords {
        if !kw.is_empty() && lower.contains(&kw.to_lowercase()) {
            return "[已过滤]".to_string();
        }
    }
    title.to_string()
}

/// 单次采样：9 步流程
fn sample_activity(
    store: &Arc<ActivityStore>,
    state: &Mutex<ActivityState>,
    current_session_id: &Mutex<Option<String>>,
) {
    let settings = store.get_settings();
    let rules = store.get_rules();
    let interval_sec = settings.sample_interval_sec.max(1) as i64;
    let idle_threshold_sec = settings.idle_threshold_min.saturating_mul(60);

    // 1. 获取前台窗口
    let (process_name, window_title) = get_foreground_window_info();

    // 2. 检查空闲
    let idle_seconds = get_idle_seconds();
    let is_idle = idle_threshold_sec > 0 && idle_seconds >= idle_threshold_sec as u64;

    // 计算当前活动 key
    let (key_process, key_web, category): (String, Option<String>, String) = if is_idle {
        // 空闲
        ("__idle__".to_string(), None, "idle".to_string())
    } else {
        // 4. 应用排除关键词
        let title_filtered = apply_exclude_keywords(&window_title, &settings.exclude_keywords);
        // 5. 提取网页标题
        let web = extract_web_title(&title_filtered, &process_name);
        // 6. 分类
        let cat = classify_activity(&process_name, &title_filtered, &rules);
        (process_name.clone(), web, cat)
    };

    // 读取当前状态
    let st = state.lock().unwrap().clone();

    // 7. 会话合并判断
    let same_activity = st.current_process == key_process && st.current_web_title == key_web;

    if same_activity {
        // 8. 合并：扩展当前会话
        let cid_opt = current_session_id.lock().unwrap().clone();
        if let Some(id) = cid_opt {
            store.extend_session(&id, interval_sec);
        }
    } else {
        // 8/9. 结束上一会话（隐式：清空 current），开始新会话
        let now = now_str();
        let today = today_str();
        let session = ActivitySession {
            id: String::new(),
            date: today,
            start_time: now.clone(),
            end_time: now,
            process_name: if is_idle {
                "__idle__".to_string()
            } else {
                process_name.clone()
            },
            window_title: if is_idle {
                "空闲".to_string()
            } else {
                apply_exclude_keywords(&window_title, &settings.exclude_keywords)
            },
            web_title: key_web.clone(),
            category: category.clone(),
            duration_seconds: interval_sec,
            source: "monitor".to_string(),
            import_batch_id: None,
        };
        let added = store.add_session(session);
        let mut cid = current_session_id.lock().unwrap();
        *cid = Some(added.id.clone());
        drop(cid);
    }

    // 9. 更新状态
    let mut st = state.lock().unwrap();
    st.current_process = key_process;
    st.current_web_title = key_web;
    st.current_category = category;
    if st.session_start.is_none() {
        st.session_start = Some(now_str());
    }
}

// ===== Win32 API（仅 Windows） =====

#[cfg(windows)]
fn get_foreground_window_info() -> (String, String) {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId,
    };

    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return (String::new(), String::new());
        }
        let mut title_buf = [0u16; 512];
        let len = GetWindowTextW(hwnd, &mut title_buf);
        let title = if len > 0 {
            String::from_utf16_lossy(&title_buf[..len as usize])
        } else {
            String::new()
        };
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid as *mut u32));
        let process_name = get_process_name(pid);
        (process_name, title)
    }
}

#[cfg(windows)]
fn get_process_name(pid: u32) -> String {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        OpenProcess, PROCESS_NAME_WIN32, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
    };

    unsafe {
        let handle = match OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
            Ok(h) => h,
            Err(_) => return String::new(),
        };
        let mut buf = [0u16; 1024];
        let mut size = buf.len() as u32;
        let result = QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            windows::core::PWSTR(buf.as_mut_ptr()),
            &mut size,
        );
        let _ = CloseHandle(handle);
        match result {
            Ok(_) => {
                let path = String::from_utf16_lossy(&buf[..size as usize]);
                let file_name = path.rsplit(|c| c == '/' || c == '\\').next().unwrap_or(&path);
                let stem = file_name
                    .rsplit_once('.')
                    .map(|(s, _)| s)
                    .unwrap_or(file_name);
                stem.to_string()
            }
            Err(_) => String::new(),
        }
    }
}

#[cfg(windows)]
pub(crate) fn get_idle_seconds() -> u64 {
    use windows::Win32::System::SystemInformation::GetTickCount64;
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};

    unsafe {
        let mut lii = LASTINPUTINFO::default();
        lii.cbSize = std::mem::size_of::<LASTINPUTINFO>() as u32;
        if GetLastInputInfo(&mut lii).as_bool() {
            let now = GetTickCount64();
            let last = lii.dwTime as u64;
            let now_lo = now & 0xFFFFFFFF;
            let diff = now_lo.wrapping_sub(last);
            diff / 1000
        } else {
            0
        }
    }
}

// 非 Windows 平台桩函数
#[cfg(not(windows))]
fn get_foreground_window_info() -> (String, String) {
    ("unknown".to_string(), String::new())
}

#[cfg(not(windows))]
pub(crate) fn get_idle_seconds() -> u64 {
    0
}
