use crate::activity::{ActivityMonitor, ActivityStore};
use crate::ai_service;
use crate::database::Database;
use crate::learning;
use crate::models::*;
use crate::reminder::ReminderEngine;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{Emitter, State};

#[tauri::command]
pub fn task_list(db: State<'_, Database>, filters: TaskFilters) -> Vec<TaskItem> {
    db.get_tasks(filters)
}

#[tauri::command]
pub fn task_get(db: State<'_, Database>, id: String) -> Option<TaskItem> {
    db.get_task(&id)
}

#[tauri::command]
pub fn task_create(db: State<'_, Database>, task: TaskCreateInput) -> TaskItem {
    db.add_task(task.into_task())
}

#[tauri::command]
pub fn task_update(db: State<'_, Database>, id: String, updates: Value) -> Option<TaskItem> {
    db.update_task(&id, updates)
}

#[tauri::command]
pub fn task_delete(db: State<'_, Database>, id: String) -> bool {
    db.delete_task(&id)
}

#[tauri::command]
pub fn task_update_type_cascade(id: String, new_type: String, db: State<'_, Database>) -> Result<Vec<TaskItem>, String> {
    Ok(db.update_task_type_cascade(&id, &new_type))
}

#[tauri::command]
pub fn task_batch_create(db: State<'_, Database>, tasks: Vec<TaskCreateInput>) -> Vec<TaskItem> {
    db.batch_add_tasks(tasks.into_iter().map(|t| t.into_task()).collect())
}

#[tauri::command]
pub fn task_generate_recurring(db: State<'_, Database>, date: String) -> i32 {
    db.generate_recurring_tasks(&date)
}

#[tauri::command]
pub fn category_list(db: State<'_, Database>) -> Vec<Category> {
    db.get_categories()
}

#[tauri::command]
pub fn category_create(db: State<'_, Database>, name: String, color: String) -> Category {
    db.add_category(&name, &color)
}

#[tauri::command]
pub fn category_update(db: State<'_, Database>, id: String, name: String, color: String) -> Option<Category> {
    db.update_category(&id, &name, &color)
}

#[tauri::command]
pub fn category_delete(db: State<'_, Database>, id: String) -> bool {
    db.delete_category(&id)
}

#[tauri::command]
pub fn daily_log_get(db: State<'_, Database>, date: String) -> Option<String> {
    db.get_daily_log(&date)
}

#[tauri::command]
pub fn daily_log_set(db: State<'_, Database>, date: String, content: String) {
    db.set_daily_log(&date, &content)
}

#[tauri::command]
pub fn time_type_list(db: State<'_, Database>) -> Vec<TimeType> {
    db.get_time_types()
}

#[tauri::command]
pub fn time_type_create(db: State<'_, Database>, name: String, color: String) -> TimeType {
    db.add_time_type(&name, &color)
}

#[tauri::command]
pub fn time_type_update(db: State<'_, Database>, id: String, updates: Value) -> Option<TimeType> {
    db.update_time_type(&id, updates)
}

#[tauri::command]
pub fn time_type_delete(db: State<'_, Database>, id: String) -> bool {
    db.delete_time_type(&id)
}

#[tauri::command]
pub fn time_record_create(db: State<'_, Database>, record: TimeRecord) -> TimeRecord {
    db.add_time_record(record)
}

#[tauri::command]
pub fn time_record_list(db: State<'_, Database>, date: String) -> Vec<TimeRecord> {
    db.get_time_records(&date)
}

#[tauri::command]
pub fn time_record_list_range(db: State<'_, Database>, start: String, end: String) -> Vec<TimeRecord> {
    db.get_time_records_range(&start, &end)
}

#[tauri::command]
pub fn time_record_list_all(db: State<'_, Database>) -> Vec<TimeRecord> {
    db.get_all_time_records()
}

#[tauri::command]
pub fn time_record_update(db: State<'_, Database>, id: String, updates: Value) -> Option<TimeRecord> {
    db.update_time_record(&id, updates)
}

#[tauri::command]
pub fn time_record_delete(db: State<'_, Database>, id: String) -> bool {
    db.delete_time_record(&id)
}

#[tauri::command]
pub fn preset_list(db: State<'_, Database>) -> Vec<PomodoroPreset> {
    db.get_presets()
}

#[tauri::command]
pub fn preset_create(db: State<'_, Database>, preset: PomodoroPreset) -> PomodoroPreset {
    db.add_preset(preset)
}

#[tauri::command]
pub fn preset_update(db: State<'_, Database>, id: String, updates: Value) -> Option<PomodoroPreset> {
    db.update_preset(&id, updates)
}

#[tauri::command]
pub fn preset_delete(db: State<'_, Database>, id: String) -> bool {
    db.delete_preset(&id)
}

#[tauri::command]
pub fn goal_list(db: State<'_, Database>) -> Vec<Goal> {
    db.get_goals()
}

#[tauri::command]
pub fn goal_set(db: State<'_, Database>, goal_type: String, target_minutes: i32) -> Goal {
    db.set_goal(&goal_type, target_minutes)
}

#[tauri::command]
pub fn countdown_list(db: State<'_, Database>) -> Vec<Countdown> {
    db.get_countdowns()
}

#[tauri::command]
pub fn countdown_create(db: State<'_, Database>, title: String, target_date: String, color: Option<String>) -> Countdown {
    db.add_countdown(&title, &target_date, color.as_deref())
}

#[tauri::command]
pub fn countdown_update(db: State<'_, Database>, id: String, updates: Value) -> Option<Countdown> {
    db.update_countdown(&id, updates)
}

#[tauri::command]
pub fn countdown_delete(db: State<'_, Database>, id: String) -> bool {
    db.delete_countdown(&id)
}

#[tauri::command]
pub fn connection_list(db: State<'_, Database>) -> Vec<Connection> {
    db.get_connections()
}

#[tauri::command]
pub fn connection_create(db: State<'_, Database>, from_id: String, to_id: String) -> Connection {
    db.add_connection(&from_id, to_id)
}

#[tauri::command]
pub fn connection_delete(db: State<'_, Database>, from_id: String, to_id: String) -> bool {
    db.remove_connection(&from_id, &to_id)
}

#[tauri::command]
pub fn settings_get(db: State<'_, Database>) -> AppSettings {
    db.get_settings()
}

#[tauri::command]
pub fn settings_update(db: State<'_, Database>, updates: Value) -> AppSettings {
    db.update_settings(updates)
}

#[tauri::command]
pub fn stats_study(db: State<'_, Database>, range: String) -> Value {
    db.get_study_stats(&range)
}

#[tauri::command]
pub fn stats_streak(db: State<'_, Database>) -> i32 {
    db.get_streak()
}

#[tauri::command]
pub fn data_export(db: State<'_, Database>) -> Value {
    db.export_all_data()
}

#[tauri::command]
pub fn data_import_legacy(db: State<'_, Database>, json_path: String) -> Result<String, String> {
    let raw = std::fs::read_to_string(&json_path).map_err(|e| format!("读取文件失败: {}", e))?;
    do_import_legacy(&db, &raw)
}

#[tauri::command]
pub fn data_import_legacy_json(db: State<'_, Database>, json_content: String) -> Result<String, String> {
    do_import_legacy(&db, &json_content)
}

#[tauri::command]
pub fn data_import_v01_native(db: State<'_, Database>, path: String) -> Result<String, String> {
    let count = db.import_v01_native(&std::path::Path::new(&path))?;
    Ok(format!("成功导入 {} 条数据", count))
}

#[tauri::command]
pub fn data_import_v01_auto(db: State<'_, Database>) -> Result<String, String> {
    let count = db.import_v01_auto()?;
    Ok(format!("成功导入 {} 条数据", count))
}

#[tauri::command]
pub fn data_reset(db: State<'_, Database>) -> Result<String, String> {
    let mut data = db.data.lock().map_err(|e| format!("锁定数据失败: {}", e))?;
    data.tasks.clear();
    data.categories.clear();
    data.connections.clear();
    data.time_records.clear();
    data.time_types.clear();
    data.pomodoro_presets.clear();
    data.goals.clear();
    data.countdowns.clear();
    data.daily_logs.clear();
    drop(data);
    db.save();
    Ok("数据已清空".to_string())
}

#[tauri::command]
pub fn data_reset_tasks(db: State<'_, Database>) -> Result<String, String> {
    let mut data = db.data.lock().map_err(|e| format!("锁定数据失败: {}", e))?;
    let count = data.tasks.len();
    data.tasks.clear();
    data.connections.clear();
    drop(data);
    db.save();
    Ok(format!("已清空 {} 条待办", count))
}

fn do_import_legacy(db: &Database, raw: &str) -> Result<String, String> {
    let legacy: serde_json::Value = serde_json::from_str(&raw).map_err(|e| format!("解析JSON失败: {}", e))?;

    let mut data = db.data.lock().map_err(|e| format!("锁定数据失败: {}", e))?;
    let mut imported = 0u32;

    if let Some(todos) = legacy.get("todos").and_then(|v| v.as_array()) {
        for t in todos {
            let id = t.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
            if id.is_empty() || data.tasks.iter().any(|et| et.id == id) { continue; }
            let completed = t.get("completed").and_then(|v| {
                if v.is_boolean() { v.as_bool() }
                else if v.is_number() { Some(v.as_i64().unwrap_or(0) != 0) }
                else { None }
            }).unwrap_or(false);
            let text = t.get("text").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let date = t.get("date").or_else(|| t.get("todo_date")).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let cat_id = t.get("category_id").and_then(|v| v.as_str()).unwrap_or("cat_default").to_string();
            let priority = t.get("priority").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            let recurrence = t.get("recurrence").and_then(|v| v.as_str()).map(|s| s.to_string());
            let parent_id = t.get("parent_id").and_then(|v| v.as_str()).map(|s| s.to_string());
            let note = t.get("note").and_then(|v| v.as_str()).map(|s| s.to_string());
            let created_at = t.get("created_at").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let completed_at = t.get("completed_at").and_then(|v| v.as_str()).map(|s| s.to_string());

            let is_board = parent_id.is_none() && recurrence.is_none() && date.is_empty() && !completed;
            let task = TaskItem {
                id: id.clone(),
                r#type: "note".to_string(),
                sub_type: if is_board { "note".to_string() } else { "task".to_string() },
                title: text,
                content: String::new(),
                category_id: cat_id,
                priority,
                parent_id,
                sort_order: 0,
                status: if completed { "completed".to_string() } else { "active".to_string() },
                grid_x: if is_board { None } else { None },
                grid_y: None,
                home_x: None,
                home_y: None,
                todo_date: if !date.is_empty() { Some(date) } else if completed && !is_board {
                    let d = created_at.split('T').next().unwrap_or("").to_string();
                    if d.is_empty() { None } else { Some(d) }
                } else { None },
                todo_status: Some(if completed { "completed".to_string() } else { "pending".to_string() }),
                recurrence,
                completed_at,
                deadline: None,
                pin_date: None,
                collapsed: false,
                note,
                time_start: None,
                time_end: None,
                note_width: None,
                note_height: None,
                open_width: None,
                open_height: None,
                group_id: None,
                board_tab: None,
                node_mode: None,
                schedule_start: None,
                schedule_end: None,
                created_at,
                updated_at: String::new(),
            };
            data.tasks.push(task);
            imported += 1;
        }
    }

    if let Some(cats) = legacy.get("categories").and_then(|v| v.as_array()) {
        for c in cats {
            let id = c.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
            if id.is_empty() || data.categories.iter().any(|ec| ec.id == id) { continue; }
            data.categories.push(Category {
                id,
                name: c.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                color: c.get("color").and_then(|v| v.as_str()).unwrap_or("#8e8e8e").to_string(),
                sort_order: c.get("sort_order").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
            });
            imported += 1;
        }
    }

    if let Some(records) = legacy.get("timeRecords").and_then(|v| v.as_array()) {
        for r in records {
            let id = r.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
            if id.is_empty() || data.time_records.iter().any(|er| er.id == id) { continue; }
            data.time_records.push(TimeRecord {
                id,
                date: r.get("date").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                time_type: r.get("time_type").and_then(|v| v.as_str()).unwrap_or("其他").to_string(),
                start_time: r.get("start_time").and_then(|v| v.as_str()).map(|s| s.to_string()),
                end_time: r.get("end_time").and_then(|v| v.as_str()).map(|s| s.to_string()),
                total_minutes: r.get("total_minutes").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
                pauses: r.get("pauses").and_then(|v| v.as_str()).map(|s| s.to_string()),
                source: r.get("source").and_then(|v| v.as_str()).unwrap_or("import").to_string(),
                note: r.get("note").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                created_at: r.get("created_at").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            });
            imported += 1;
        }
    }

    if let Some(tts) = legacy.get("timeTypes").and_then(|v| v.as_array()) {
        for tt in tts {
            let id = tt.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
            if id.is_empty() || data.time_types.iter().any(|et| et.id == id) { continue; }
            data.time_types.push(TimeType {
                id,
                name: tt.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                color: tt.get("color").and_then(|v| v.as_str()).unwrap_or("#5b7fff").to_string(),
                sort_order: tt.get("sort_order").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
            });
            imported += 1;
        }
    }

    if let Some(presets) = legacy.get("pomodoroPresets").or_else(|| legacy.get("presets")).and_then(|v| v.as_array()) {
        for p in presets {
            let id = p.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
            if id.is_empty() || data.pomodoro_presets.iter().any(|ep| ep.id == id) { continue; }
            data.pomodoro_presets.push(PomodoroPreset {
                id,
                time_type: p.get("time_type").and_then(|v| v.as_str()).unwrap_or("学习").to_string(),
                color: p.get("color").and_then(|v| v.as_str()).unwrap_or("#5b7fff").to_string(),
                duration_minutes: p.get("duration_minutes").and_then(|v| v.as_i64()).unwrap_or(25) as i32,
                mode: p.get("mode").and_then(|v| v.as_str()).unwrap_or("countdown").to_string(),
                created_at: p.get("created_at").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            });
            imported += 1;
        }
    }

    if let Some(goals) = legacy.get("goals").and_then(|v| v.as_array()) {
        for g in goals {
            let goal_type = g.get("type").or_else(|| g.get("goal_type")).and_then(|v| v.as_str()).unwrap_or("").to_string();
            if goal_type.is_empty() { continue; }
            if let Some(existing) = data.goals.iter_mut().find(|eg| eg.goal_type == goal_type) {
                existing.target_minutes = g.get("target_minutes").and_then(|v| v.as_i64()).unwrap_or(existing.target_minutes as i64) as i32;
            } else {
                data.goals.push(Goal {
                    id: g.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    goal_type: goal_type.clone(),
                    target_minutes: g.get("target_minutes").and_then(|v| v.as_i64()).unwrap_or(120) as i32,
                    is_active: g.get("is_active").and_then(|v| v.as_i64()).map(|v| v != 0).unwrap_or(true),
                });
            }
            imported += 1;
        }
    }

    if let Some(countdowns) = legacy.get("countdowns").and_then(|v| v.as_array()) {
        for cd in countdowns {
            let id = cd.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
            if id.is_empty() || data.countdowns.iter().any(|ec| ec.id == id) { continue; }
            data.countdowns.push(Countdown {
                id,
                title: cd.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                target_date: cd.get("target_date").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                color: cd.get("color").and_then(|v| v.as_str()).map(|s| s.to_string()),
                created_at: cd.get("created_at").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            });
            imported += 1;
        }
    }

    if let Some(settings) = legacy.get("settings").and_then(|v| v.as_object()) {
        if let Some(v) = settings.get("theme").and_then(|v| v.as_str()) { data.settings.theme = v.to_string(); }
        if let Some(v) = settings.get("master_plan").and_then(|v| v.as_str()) { data.settings.master_plan = v.to_string(); }
        if let Some(v) = settings.get("master_reflection").and_then(|v| v.as_str()) { data.settings.master_reflection = v.to_string(); }
        if let Some(v) = settings.get("quotes").and_then(|v| v.as_str()) { data.settings.quotes = v.to_string(); }
        if let Some(v) = settings.get("quote_mode").and_then(|v| v.as_str()) { data.settings.quote_mode = v.to_string(); }
        if let Some(v) = settings.get("quote_interval").and_then(|v| v.as_str()) { data.settings.quote_interval = v.to_string(); }
        if let Some(v) = settings.get("startup_minimized") { data.settings.startup_minimized = v.as_bool().unwrap_or(v.as_str() == Some("true")); }
        imported += 1;
    }

    if let Some(logs) = legacy.get("dailyLogs").and_then(|v| v.as_object()) {
        for (date, content) in logs {
            if let Some(text) = content.as_str() {
                data.daily_logs.insert(date.clone(), text.to_string());
                imported += 1;
            }
        }
    }

    drop(data);
    db.save();
    Ok(format!("成功导入 {} 条数据", imported))
}

// ===== v0.2 活动监测命令 =====

// --- 活动监测控制 ---

#[tauri::command]
pub fn activity_get_state(monitor: State<'_, Arc<ActivityMonitor>>) -> ActivityState {
    monitor.get_state()
}

#[tauri::command]
pub fn activity_start(monitor: State<'_, Arc<ActivityMonitor>>) {
    monitor.start();
}

#[tauri::command]
pub fn activity_stop(monitor: State<'_, Arc<ActivityMonitor>>) {
    monitor.stop();
}

#[tauri::command]
pub fn activity_pause(monitor: State<'_, Arc<ActivityMonitor>>) {
    monitor.pause();
}

#[tauri::command]
pub fn activity_resume(monitor: State<'_, Arc<ActivityMonitor>>) {
    monitor.resume();
}

// --- 活动设置 ---

#[tauri::command]
pub fn activity_get_settings(store: State<'_, Arc<ActivityStore>>) -> ActivitySettings {
    store.get_settings()
}

#[tauri::command]
pub fn activity_update_settings(
    store: State<'_, Arc<ActivityStore>>,
    monitor: State<'_, Arc<ActivityMonitor>>,
    updates: Value,
) -> ActivitySettings {
    let old_enabled = store.get_settings().monitor_enabled;
    let result = store.update_settings(updates);
    let new_enabled = result.monitor_enabled;
    if new_enabled && !old_enabled {
        monitor.start();
    } else if !new_enabled && old_enabled {
        monitor.stop();
    }
    result
}

// --- 活动数据 ---

#[tauri::command]
pub fn activity_get_sessions(
    store: State<'_, Arc<ActivityStore>>,
    date: String,
) -> Vec<ActivitySession> {
    store.get_sessions_by_date(&date)
}

#[tauri::command]
pub fn activity_get_summary(
    store: State<'_, Arc<ActivityStore>>,
    date: String,
) -> ActivitySummary {
    store.get_daily_summary(&date)
}

#[tauri::command]
pub fn activity_update_session(
    store: State<'_, Arc<ActivityStore>>,
    id: String,
    updates: Value,
) -> Option<ActivitySession> {
    store.update_session(&id, updates)
}

#[tauri::command]
pub fn activity_delete_session(store: State<'_, Arc<ActivityStore>>, id: String) -> bool {
    store.delete_session(&id)
}

#[tauri::command]
pub fn activity_clear_date(store: State<'_, Arc<ActivityStore>>, date: String) -> i32 {
    store.clear_date(&date)
}

// --- 分类规则 ---

#[tauri::command]
pub fn activity_get_rules(store: State<'_, Arc<ActivityStore>>) -> Vec<CategoryRule> {
    store.get_rules()
}

#[tauri::command]
pub fn activity_set_rules(
    store: State<'_, Arc<ActivityStore>>,
    rules: Vec<CategoryRule>,
) {
    store.set_user_rules(rules);
}

#[tauri::command]
pub fn activity_reclassify(store: State<'_, Arc<ActivityStore>>) -> i32 {
    store.reclassify_all()
}

// --- 导入导出 ---

#[tauri::command]
pub fn activity_export_csv(store: State<'_, Arc<ActivityStore>>) -> String {
    store.export_csv()
}

#[tauri::command]
pub fn activity_export_json(store: State<'_, Arc<ActivityStore>>) -> String {
    store.export_json()
}

/// 简易 CSV 解析（支持带引号字段）
fn parse_csv_row(line: &str) -> Vec<String> {
    let mut fields = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut chars = line.chars().peekable();
    while let Some(c) = chars.next() {
        if in_quotes {
            if c == '"' {
                if chars.peek() == Some(&'"') {
                    current.push('"');
                    chars.next();
                } else {
                    in_quotes = false;
                }
            } else {
                current.push(c);
            }
        } else if c == '"' {
            in_quotes = true;
        } else if c == ',' {
            fields.push(std::mem::take(&mut current));
        } else {
            current.push(c);
        }
    }
    fields.push(current);
    fields
}

#[tauri::command]
pub fn activity_import_csv(
    store: State<'_, Arc<ActivityStore>>,
    content: String,
) -> Result<String, String> {
    let mut lines = content.lines();
    let header = lines.next().ok_or_else(|| "CSV 为空".to_string())?;
    let headers: Vec<String> = parse_csv_row(header)
        .iter()
        .map(|s| s.trim().to_lowercase())
        .collect();
    let col = |name: &str| -> Option<usize> {
        headers.iter().position(|h| h == name)
    };
    let mut sessions = Vec::new();
    for line in lines {
        if line.trim().is_empty() {
            continue;
        }
        let cells = parse_csv_row(line);
        let get = |idx: Option<usize>| -> String {
            idx.and_then(|i| cells.get(i)).cloned().unwrap_or_default()
        };
        let duration: i64 = get(col("duration_seconds")).parse().unwrap_or(0);
        sessions.push(ActivitySession {
            id: String::new(),
            date: get(col("date")),
            start_time: get(col("start_time")),
            end_time: get(col("end_time")),
            process_name: get(col("process_name")),
            window_title: get(col("window_title")),
            web_title: {
                let w = get(col("web_title"));
                if w.is_empty() {
                    None
                } else {
                    Some(w)
                }
            },
            category: get(col("category")),
            duration_seconds: duration,
            source: String::new(),
            import_batch_id: None,
        });
    }
    if sessions.is_empty() {
        return Err("未解析到有效会话".to_string());
    }
    let batch_id = store.import_sessions(sessions);
    Ok(batch_id)
}

#[tauri::command]
pub fn activity_import_json(
    store: State<'_, Arc<ActivityStore>>,
    content: String,
) -> Result<String, String> {
    let parsed: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("解析 JSON 失败: {}", e))?;
    let sessions_val = parsed
        .get("sessions")
        .or_else(|| parsed.as_array().map(|_| &parsed))
        .ok_or_else(|| "JSON 缺少 sessions 字段".to_string())?;
    let arr = sessions_val
        .as_array()
        .ok_or_else(|| "sessions 不是数组".to_string())?;
    let mut sessions = Vec::new();
    for v in arr {
        let s: ActivitySession = serde_json::from_value(v.clone())
            .map_err(|e| format!("解析会话失败: {}", e))?;
        sessions.push(s);
    }
    if sessions.is_empty() {
        return Err("未解析到有效会话".to_string());
    }
    let batch_id = store.import_sessions(sessions);
    Ok(batch_id)
}

#[tauri::command]
pub fn activity_get_batches(store: State<'_, Arc<ActivityStore>>) -> Vec<ActivityBatch> {
    store.get_batches()
}

#[tauri::command]
pub fn activity_delete_batch(store: State<'_, Arc<ActivityStore>>, batch_id: String) -> i32 {
    store.delete_batch(&batch_id)
}

// --- AI ---

/// 计算某日待办统计（总数 / 已完成）
fn compute_todo_stats(db: &Database, date: &str) -> (i32, i32) {
    let tasks = db.get_tasks(TaskFilters {
        status: None,
        r#type: None,
        category_id: None,
        parent_id: None,
        todo_date: Some(date.to_string()),
        pin_date: None,
    });
    let total = tasks.len() as i32;
    let completed = tasks
        .iter()
        .filter(|t| t.todo_status.as_deref() == Some("completed"))
        .count() as i32;
    (total, completed)
}

#[tauri::command]
pub async fn ai_generate(
    store: State<'_, Arc<ActivityStore>>,
    db: State<'_, Database>,
    date: String,
) -> Result<String, String> {
    let settings = store.get_settings();
    let summary = store.get_daily_summary(&date);
    let pomo_minutes: i32 = db
        .get_time_records(&date)
        .iter()
        .map(|r| r.total_minutes)
        .sum();
    let (todo_total, todo_completed) = compute_todo_stats(&db, &date);

    if !settings.ai_api_enabled || settings.ai_api_key.is_empty() {
        return Ok(ai_service::template_summary(
            &summary,
            pomo_minutes,
            todo_total,
            todo_completed,
            &date,
        ));
    }

    let store_arc = store.inner().clone();
    let content = ai_service::generate_report(
        &settings,
        &summary,
        pomo_minutes,
        todo_total,
        todo_completed,
        &date,
    )
    .await?;
    store_arc.set_cached_summary(&date, content.clone());
    Ok(content)
}

#[tauri::command]
pub async fn ai_test(store: State<'_, Arc<ActivityStore>>) -> Result<String, String> {
    let settings = store.get_settings();
    ai_service::test_connection(&settings).await
}

#[tauri::command]
pub fn ai_get_cached(
    store: State<'_, Arc<ActivityStore>>,
    date: String,
) -> Option<String> {
    store.get_cached_summary(&date)
}

// --- 生产力评分 ---

#[tauri::command]
pub async fn activity_get_productivity_score(
    store: State<'_, Arc<ActivityStore>>,
    db: State<'_, Database>,
    date: String,
) -> Result<ProductivityScore, String> {
    let pomo_minutes: i32 = db
        .get_time_records(&date)
        .iter()
        .map(|r| r.total_minutes)
        .sum();
    let (todo_total, todo_completed) = compute_todo_stats(&db, &date);
    let settings = store.get_settings();
    let mut ps = store.get_productivity_score(&date, pomo_minutes, todo_total, todo_completed);

    // 尝试 AI 评分
    if settings.ai_api_enabled && !settings.ai_api_key.is_empty() {
        let summary = store.get_daily_summary(&date);
        let streak = db.get_streak();
        match ai_service::ai_score(&settings, &summary, pomo_minutes, todo_total, todo_completed, streak, &date).await {
            Ok(Some(ai_ps)) => {
                ps.score = ai_ps.score;
                ps.level = ai_ps.level.clone();
                ps.analysis = ai_ps.analysis.clone();
                // 保存 AI 评分到数据库
                store.save_ai_score_to_db(&db, &date, &ai_ps, ai_ps.analysis.as_deref());
            }
            _ => {} // 失败则用公式结果
        }
    }

    Ok(ps)
}

// --- AI 对话 ---

fn execute_tool_call(tool_call: &AiToolCall, db: &Database) -> AiToolResult {
    match tool_call.tool.as_str() {
        "task_create" => {
            let title = tool_call.args.get("title").and_then(|v| v.as_str()).unwrap_or("新待办");
            let category_id = tool_call.args.get("category_id").and_then(|v| v.as_str()).unwrap_or("cat_default");
            let priority = tool_call.args.get("priority").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            let deadline = tool_call.args.get("deadline").and_then(|v| v.as_str()).map(|s| s.to_string());
            let note = tool_call.args.get("note").and_then(|v| v.as_str()).map(|s| s.to_string());
            let todo_date = tool_call.args.get("todo_date").and_then(|v| v.as_str()).map(|s| s.to_string());

            let task = db.add_task(TaskItem {
                id: String::new(),
                r#type: "todo".into(),
                sub_type: "todo".into(),
                title: title.into(),
                content: String::new(),
                category_id: category_id.into(),
                priority,
                parent_id: None,
                sort_order: 0,
                status: "active".into(),
                grid_x: None, grid_y: None,
                home_x: None, home_y: None,
                todo_date,
                todo_status: None,
                recurrence: None,
                completed_at: None,
                deadline,
                pin_date: None,
                collapsed: false,
                note,
                time_start: None, time_end: None,
                note_width: None, note_height: None,
                open_width: None, open_height: None,
                group_id: None,
                board_tab: None,
                node_mode: None,
                schedule_start: None, schedule_end: None,
                created_at: String::new(),
                updated_at: String::new(),
            });
            AiToolResult { success: true, message: format!("已创建待办「{}」", title), data: Some(serde_json::json!({"id": task.id, "title": task.title})) }
        }
        "task_update" => {
            let id = tool_call.args.get("id").and_then(|v| v.as_str()).unwrap_or("");
            if id.is_empty() {
                return AiToolResult { success: false, message: "缺少 id 参数".into(), data: None };
            }
            let mut updates = serde_json::Map::new();
            for key in &["title", "status", "priority", "deadline", "note", "category_id", "todo_date"] {
                if let Some(val) = tool_call.args.get(*key) {
                    updates.insert(key.to_string(), val.clone());
                }
            }
            let result = db.update_task(id, serde_json::Value::Object(updates));
            match result {
                Some(task) => AiToolResult { success: true, message: format!("已更新待办「{}」", task.title), data: Some(serde_json::json!({"id": task.id})) },
                None => AiToolResult { success: false, message: "未找到该待办".into(), data: None },
            }
        }
        "task_complete" => {
            let id = tool_call.args.get("id").and_then(|v| v.as_str()).unwrap_or("");
            if id.is_empty() {
                return AiToolResult { success: false, message: "缺少 id 参数".into(), data: None };
            }
            let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
            let updates = serde_json::json!({"status": "done", "todo_status": "completed", "completed_at": now});
            let result = db.update_task(id, updates);
            match result {
                Some(task) => AiToolResult { success: true, message: format!("已完成待办「{}」", task.title), data: Some(serde_json::json!({"id": task.id})) },
                None => AiToolResult { success: false, message: "未找到该待办".into(), data: None },
            }
        }
        "task_delete" => {
            let id = tool_call.args.get("id").and_then(|v| v.as_str()).unwrap_or("");
            if id.is_empty() {
                return AiToolResult { success: false, message: "缺少 id 参数".into(), data: None };
            }
            if db.delete_task(id) {
                AiToolResult { success: true, message: "已删除待办".into(), data: None }
            } else {
                AiToolResult { success: false, message: "未找到该待办".into(), data: None }
            }
        }
        "task_list" => {
            let keyword = tool_call.args.get("keyword").and_then(|v| v.as_str());
            let status = tool_call.args.get("status").and_then(|v| v.as_str());
            let category_id = tool_call.args.get("category_id").and_then(|v| v.as_str());
            let todo_date = tool_call.args.get("todo_date").and_then(|v| v.as_str());
            let filters = TaskFilters {
                status: status.map(|s| s.to_string()),
                r#type: None,
                category_id: category_id.map(|s| s.to_string()),
                parent_id: None,
                todo_date: todo_date.map(|s| s.to_string()),
                pin_date: None,
            };
            let tasks = db.get_tasks(filters);
            let filtered: Vec<&TaskItem> = tasks.iter().filter(|t| {
                if let Some(kw) = keyword {
                    t.title.contains(kw) || t.content.contains(kw)
                } else { true }
            }).collect();
            let data = serde_json::json!(filtered.iter().map(|t| {
                serde_json::json!({"id": t.id, "title": t.title, "status": t.status, "todo_date": t.todo_date, "deadline": t.deadline})
            }).collect::<Vec<_>>());
            AiToolResult { success: true, message: format!("找到 {} 条待办", filtered.len()), data: Some(data) }
        }
        "task_get" => {
            let id = tool_call.args.get("id").and_then(|v| v.as_str()).unwrap_or("");
            if id.is_empty() { return AiToolResult { success: false, message: "缺少 id 参数".into(), data: None }; }
            match db.get_task(id) {
                Some(t) => {
                    let data = serde_json::json!({
                        "id": t.id, "title": t.title, "status": t.status,
                        "category_id": t.category_id, "priority": t.priority,
                        "todo_date": t.todo_date, "deadline": t.deadline,
                        "note": t.note, "content": t.content,
                        "created_at": t.created_at,
                    });
                    AiToolResult { success: true, message: format!("待办「{}」", t.title), data: Some(data) }
                }
                None => AiToolResult { success: false, message: "未找到该待办".into(), data: None },
            }
        }
        "goal_set" => {
            let goal_type = tool_call.args.get("goal_type").and_then(|v| v.as_str()).unwrap_or("daily");
            let target_minutes = tool_call.args.get("target_minutes").and_then(|v| v.as_i64()).unwrap_or(120) as i32;
            db.set_goal(goal_type, target_minutes);
            AiToolResult { success: true, message: format!("已将 {} 目标设为 {} 分钟", goal_type, target_minutes), data: None }
        }
        "note_create" => {
            let title = tool_call.args.get("title").and_then(|v| v.as_str()).unwrap_or("新便签");
            let note = tool_call.args.get("note").and_then(|v| v.as_str()).map(|s| s.to_string());
            let board_tab = tool_call.args.get("board_tab").and_then(|v| v.as_str()).map(|s| s.to_string());
            let grid_x = tool_call.args.get("grid_x").and_then(|v| v.as_i64()).map(|v| v as i32);
            let grid_y = tool_call.args.get("grid_y").and_then(|v| v.as_i64()).map(|v| v as i32);

            let task = db.add_task(TaskItem {
                id: String::new(),
                r#type: "note".into(),
                sub_type: "note".into(),
                title: title.into(),
                content: String::new(),
                category_id: "cat_default".into(),
                priority: 0,
                parent_id: None,
                sort_order: 0,
                status: "active".into(),
                grid_x, grid_y,
                home_x: None, home_y: None,
                todo_date: None, todo_status: None,
                recurrence: None, completed_at: None,
                deadline: None, pin_date: None,
                collapsed: false,
                note,
                time_start: None, time_end: None,
                note_width: None, note_height: None,
                open_width: None, open_height: None,
                group_id: None,
                board_tab,
                node_mode: None,
                schedule_start: None, schedule_end: None,
                created_at: String::new(),
                updated_at: String::new(),
            });
            AiToolResult { success: true, message: format!("已创建便签「{}」", title), data: Some(serde_json::json!({"id": task.id})) }
        }
        "note_update" => {
            let id = tool_call.args.get("id").and_then(|v| v.as_str()).unwrap_or("");
            if id.is_empty() { return AiToolResult { success: false, message: "缺少 id 参数".into(), data: None }; }
            let mut updates = serde_json::Map::new();
            for key in &["title", "note", "board_tab", "grid_x", "grid_y", "note_width", "note_height"] {
                if let Some(val) = tool_call.args.get(*key) {
                    updates.insert(key.to_string(), val.clone());
                }
            }
            match db.update_task(id, serde_json::Value::Object(updates)) {
                Some(t) => AiToolResult { success: true, message: format!("已更新便签「{}」", t.title), data: None },
                None => AiToolResult { success: false, message: "未找到该便签".into(), data: None },
            }
        }
        "note_delete" => {
            let id = tool_call.args.get("id").and_then(|v| v.as_str()).unwrap_or("");
            if id.is_empty() { return AiToolResult { success: false, message: "缺少 id 参数".into(), data: None }; }
            if db.delete_task(id) {
                AiToolResult { success: true, message: "已删除便签".into(), data: None }
            } else {
                AiToolResult { success: false, message: "未找到该便签".into(), data: None }
            }
        }
        "connection_create" => {
            let from_id = tool_call.args.get("from_id").and_then(|v| v.as_str()).unwrap_or("");
            let to_id = tool_call.args.get("to_id").and_then(|v| v.as_str()).unwrap_or("");
            if from_id.is_empty() || to_id.is_empty() {
                return AiToolResult { success: false, message: "缺少 from_id 或 to_id 参数".into(), data: None };
            }
            let conn = db.add_connection(from_id, to_id.to_string());
            AiToolResult { success: true, message: "已创建连接线".into(), data: Some(serde_json::json!({"from_id": conn.from_id, "to_id": conn.to_id})) }
        }
        "memory_search" => {
            let keyword = tool_call.args.get("keyword").and_then(|v| v.as_str()).unwrap_or("");
            if keyword.is_empty() { return AiToolResult { success: false, message: "缺少 keyword 参数".into(), data: None }; }
            let memories = db.get_memories();
            let matched: Vec<&crate::models::Memory> = memories.iter().filter(|m| {
                m.key.contains(keyword) || m.content.contains(keyword)
            }).collect();
            if matched.is_empty() {
                AiToolResult { success: true, message: "没有找到相关的记忆".into(), data: None }
            } else {
                let data = serde_json::json!(matched.iter().map(|m| {
                    serde_json::json!({"id": m.id, "key": m.key, "content": m.content, "created_at": m.created_at})
                }).collect::<Vec<_>>());
                let summary: Vec<String> = matched.iter().map(|m| format!("「{}」: {}", m.key, m.content)).collect();
                AiToolResult { success: true, message: format!("找到 {} 条相关记忆：{}", matched.len(), summary.join("；")), data: Some(data) }
            }
        }
        "memory_save" => {
            let key = tool_call.args.get("key").and_then(|v| v.as_str()).unwrap_or("");
            let content = tool_call.args.get("content").and_then(|v| v.as_str()).unwrap_or("");
            if key.is_empty() || content.is_empty() {
                return AiToolResult { success: false, message: "缺少 key 或 content 参数".into(), data: None };
            }
            let mem = db.add_memory(key, content);
            AiToolResult { success: true, message: format!("已记住: {} = {}", key, content), data: Some(serde_json::json!({"id": mem.id})) }
        }
        "memory_list" => {
            let memories = db.get_memories();
            let data = serde_json::json!(memories.iter().map(|m| {
                serde_json::json!({"id": m.id, "key": m.key, "content": m.content, "created_at": m.created_at})
            }).collect::<Vec<_>>());
            AiToolResult { success: true, message: format!("共有 {} 条记忆", memories.len()), data: Some(data) }
        }
        "memory_delete" => {
            let id = tool_call.args.get("id").and_then(|v| v.as_str()).unwrap_or("");
            if id.is_empty() { return AiToolResult { success: false, message: "缺少 id 参数".into(), data: None }; }
            if db.delete_memory(id) {
                AiToolResult { success: true, message: "已删除该记忆".into(), data: None }
            } else {
                AiToolResult { success: false, message: "未找到该记忆".into(), data: None }
            }
        }
        "workflow_create" => {
            let notes = tool_call.args.get("notes").and_then(|v| v.as_array());
            if notes.is_none() || notes.unwrap().is_empty() {
                return AiToolResult { success: false, message: "缺少 notes 参数".into(), data: None };
            }
            let notes = notes.unwrap();
            let empty_connections = vec![];
            let connections = tool_call.args.get("connections").and_then(|v| v.as_array()).unwrap_or(&empty_connections);

            // 1. 创建所有便签
            let mut created: Vec<String> = Vec::new();
            let mut title_to_id: std::collections::HashMap<String, String> = std::collections::HashMap::new();
            let mut x_offset = 0;

            for note_val in notes {
                let title = note_val.get("title").and_then(|v| v.as_str()).unwrap_or("便签").to_string();
                let note = note_val.get("note").and_then(|v| v.as_str()).map(|s| s.to_string());
                let board_tab = note_val.get("board_tab").and_then(|v| v.as_str()).map(|s| s.to_string());
                let group_id = note_val.get("group_id").and_then(|v| v.as_str()).map(|s| s.to_string());

                let task = db.add_task(TaskItem {
                    id: String::new(),
                    r#type: "note".into(),
                    sub_type: "note".into(),
                    title: title.clone(),
                    content: String::new(),
                    category_id: "cat_default".into(),
                    priority: 0,
                    parent_id: None,
                    sort_order: 0,
                    status: "active".into(),
                    grid_x: Some(x_offset), grid_y: Some(0),
                    home_x: None, home_y: None,
                    todo_date: None, todo_status: None,
                    recurrence: None, completed_at: None,
                    deadline: None, pin_date: None,
                    collapsed: false,
                    note,
                    time_start: None, time_end: None,
                    note_width: None, note_height: None,
                    open_width: None, open_height: None,
                    group_id,
                    board_tab,
                    node_mode: None,
                    schedule_start: None, schedule_end: None,
                    created_at: String::new(),
                    updated_at: String::new(),
                });
                title_to_id.insert(title.clone(), task.id.clone());
                created.push(task.id.clone());
                x_offset += 2;
            }

            // 2. 创建连接线
            let mut conn_count = 0;
            for conn_val in connections {
                let from = conn_val.get("from_title").and_then(|v| v.as_str()).unwrap_or("");
                let to = conn_val.get("to_title").and_then(|v| v.as_str()).unwrap_or("");
                if let (Some(fid), Some(tid)) = (title_to_id.get(from), title_to_id.get(to)) {
                    db.add_connection(fid, tid.to_string());
                    conn_count += 1;
                }
            }

            let data = serde_json::json!({
                "created_note_ids": created,
                "created_connections": conn_count,
            });
            AiToolResult {
                success: true,
                message: format!("已创建 {} 张便签和 {} 条连接线", created.len(), conn_count),
                data: Some(data),
            }
        }
        "connection_delete" => {
            let from_id = tool_call.args.get("from_id").and_then(|v| v.as_str()).unwrap_or("");
            let to_id = tool_call.args.get("to_id").and_then(|v| v.as_str()).unwrap_or("");
            if from_id.is_empty() || to_id.is_empty() {
                return AiToolResult { success: false, message: "缺少 from_id 或 to_id 参数".into(), data: None };
            }
            if db.remove_connection(from_id, to_id) {
                AiToolResult { success: true, message: "已删除连接线".into(), data: None }
            } else {
                AiToolResult { success: false, message: "未找到该连接线".into(), data: None }
            }
        }
        "daily_plan" => {
            let date = tool_call.args.get("date").and_then(|v| v.as_str()).unwrap_or("");
            let plan_date = if date.is_empty() {
                chrono::Local::now().format("%Y-%m-%d").to_string()
            } else { date.to_string() };

            let today = chrono::Local::now().naive_local().date();
            let yesterday = (today - chrono::Duration::days(1)).format("%Y-%m-%d").to_string();

            let profile = db.get_user_profile();

            let today_tasks = db.get_tasks(TaskFilters {
                status: None, r#type: None, category_id: None, parent_id: None,
                todo_date: Some(plan_date.clone()), pin_date: None,
            });
            let active_today: Vec<&TaskItem> = today_tasks.iter()
                .filter(|t| t.todo_status.as_deref() != Some("completed") && t.status != "done").collect();
            let done_today: Vec<&TaskItem> = today_tasks.iter()
                .filter(|t| t.todo_status.as_deref() == Some("completed") || t.status == "done").collect();

            let yesterday_tasks = db.get_tasks(TaskFilters {
                status: None, r#type: None, category_id: None, parent_id: None,
                todo_date: Some(yesterday), pin_date: None,
            });
            let overflow: Vec<&TaskItem> = yesterday_tasks.iter()
                .filter(|t| t.todo_status.as_deref() != Some("completed") && t.status != "done").collect();

            let unassigned = db.get_tasks(TaskFilters {
                status: Some("active".into()), r#type: None, category_id: None, parent_id: None,
                todo_date: None, pin_date: None,
            });
            let unassigned_todos: Vec<&TaskItem> = unassigned.iter()
                .filter(|t| t.grid_x.is_none() && t.grid_y.is_none()).collect();

            let all_tasks = db.get_tasks(TaskFilters {
                status: None, r#type: None, category_id: None, parent_id: None,
                todo_date: None, pin_date: None,
            });
            let three_days = today + chrono::Duration::days(3);
            let upcoming_deadlines: Vec<&TaskItem> = all_tasks.iter()
                .filter(|t| {
                    if t.status == "done" { return false; }
                    if let Some(ref dl) = t.deadline {
                        chrono::NaiveDate::parse_from_str(dl, "%Y-%m-%d")
                            .map(|d| d >= today && d <= three_days).unwrap_or(false)
                    } else { false }
                }).collect();

            // Get weekly goals & progress
            let goals = db.get_goals();
            let weekday = today.format("%u").to_string().parse::<i64>().unwrap_or(1);
            let week_start = today - chrono::Duration::days(weekday - 1);
            let mut weekly_focus = 0i32;
            for i in 0..7 {
                let d = (week_start + chrono::Duration::days(i)).format("%Y-%m-%d").to_string();
                weekly_focus += db.get_time_records(&d).iter().map(|r| r.total_minutes).sum::<i32>();
            }

            let data = serde_json::json!({
                "date": plan_date,
                "weekday": today.format("%A").to_string(),
                "done_today": done_today.len(),
                "tasks": active_today.iter().map(|t| serde_json::json!({
                    "id": t.id, "title": t.title, "priority": t.priority,
                    "deadline": t.deadline, "category_id": t.category_id, "note": t.note,
                })).collect::<Vec<_>>(),
                "overflow": overflow.iter().map(|t| serde_json::json!({
                    "id": t.id, "title": t.title, "priority": t.priority,
                })).collect::<Vec<_>>(),
                "unassigned": unassigned_todos.iter().map(|t| serde_json::json!({
                    "id": t.id, "title": t.title, "priority": t.priority,
                })).collect::<Vec<_>>(),
                "upcoming_deadlines": upcoming_deadlines.iter().map(|t| serde_json::json!({
                    "id": t.id, "title": t.title, "deadline": t.deadline,
                })).collect::<Vec<_>>(),
                "weekly_focus_minutes": weekly_focus,
                "goals": goals.iter().map(|g| serde_json::json!({
                    "goal_type": g.goal_type, "target_minutes": g.target_minutes,
                })).collect::<Vec<_>>(),
                "preferred_hours": profile.preferred_work_hours,
                "common_categories": profile.common_categories,
            });
            AiToolResult { success: true, message: format!("已生成 {} 的日程数据", plan_date), data: Some(data) }
        }
        "weekly_review" => {
            let now = chrono::Local::now().naive_local().date();
            let mut daily_data = Vec::new();
            let mut total_focus = 0i32;
            let mut total_tasks = 0i32;
            let mut total_done = 0i32;

            for i in 0..7 {
                let date = (now - chrono::Duration::days(i)).format("%Y-%m-%d").to_string();
                let focus: i32 = db.get_time_records(&date).iter().map(|r| r.total_minutes).sum();
                let (tt, td) = compute_todo_stats(db, &date);
                total_focus += focus; total_tasks += tt; total_done += td;
                daily_data.push(serde_json::json!({
                    "date": date, "focus_minutes": focus,
                    "tasks_total": tt, "tasks_done": td,
                    "completion_rate": if tt > 0 { (td as f64 / tt as f64 * 100.0).round() } else { 0.0 },
                }));
            }

            let mut prev_total_focus = 0i32;
            for i in 7..14 {
                let date = (now - chrono::Duration::days(i)).format("%Y-%m-%d").to_string();
                prev_total_focus += db.get_time_records(&date).iter().map(|r| r.total_minutes).sum::<i32>();
            }

            let mut cat_stats: HashMap<String, i32> = HashMap::new();
            for i in 0..7 {
                let date = (now - chrono::Duration::days(i)).format("%Y-%m-%d").to_string();
                for r in &db.get_time_records(&date) {
                    *cat_stats.entry(r.time_type.clone()).or_insert(0) += r.total_minutes;
                }
            }
            let mut cat_vec: Vec<(String, i32)> = cat_stats.into_iter().collect();
            cat_vec.sort_by(|a, b| b.1.cmp(&a.1));

            let streak = db.get_streak();
            let profile = db.get_user_profile();

            let data = serde_json::json!({
                "period": format!("{} ~ {}", (now - chrono::Duration::days(6)).format("%m-%d"), now.format("%m-%d")),
                "daily": daily_data,
                "total_focus_minutes": total_focus,
                "daily_avg_focus": (total_focus as f64 / 7.0 * 10.0).round() / 10.0,
                "total_tasks": total_tasks, "total_completed": total_done,
                "overall_completion_rate": if total_tasks > 0 { (total_done as f64 / total_tasks as f64 * 100.0).round() } else { 0.0 },
                "category_breakdown": cat_vec.iter().map(|(c, m)| serde_json::json!({"category": c, "minutes": m})).collect::<Vec<_>>(),
                "prev_week_focus": prev_total_focus,
                "focus_trend": if prev_total_focus > 0 { ((total_focus as f64 - prev_total_focus as f64) / prev_total_focus as f64 * 100.0).round() } else { 0.0 },
                "streak": streak,
                "insights_count": profile.insights.len(),
            });
            AiToolResult { success: true, message: "已生成周度回顾数据".into(), data: Some(data) }
        }
        "smart_suggest" => {
            let now = chrono::Local::now();
            let today = now.format("%Y-%m-%d").to_string();
            let hour = now.format("%H").to_string().parse::<i32>().unwrap_or(12);
            let profile = db.get_user_profile();

            let (tt, td) = compute_todo_stats(db, &today);
            let active = db.get_tasks(TaskFilters {
                status: Some("active".into()), r#type: None, category_id: None, parent_id: None,
                todo_date: Some(today.clone()), pin_date: None,
            });
            let high_pri = active.iter().filter(|t| t.priority > 0).count();
            let with_deadline = active.iter().filter(|t| t.deadline.is_some()).count();
            let streak = db.get_streak();

            let time_label = if hour < 6 { "凌晨" } else if hour < 9 { "早晨" } else if hour < 12 { "上午" }
                else if hour < 14 { "午间" } else if hour < 18 { "下午" } else { "晚间" };

            let goals = db.get_goals();
            let weekday_i = now.format("%u").to_string().parse::<i64>().unwrap_or(1);
            let week_start = now.naive_local().date() - chrono::Duration::days(weekday_i - 1);
            let mut week_focus = 0i32;
            for i in 0..7 {
                let d = (week_start + chrono::Duration::days(i)).format("%Y-%m-%d").to_string();
                week_focus += db.get_time_records(&d).iter().map(|r| r.total_minutes).sum::<i32>();
            }

            let data = serde_json::json!({
                "time_label": time_label, "hour": hour,
                "weekday": now.format("%A").to_string(),
                "today_tasks_total": tt, "today_tasks_done": td,
                "today_remaining": active.len(),
                "high_priority_remaining": high_pri,
                "deadline_count": with_deadline,
                "streak": streak,
                "weekly_focus_minutes": week_focus,
                "goals": goals.iter().map(|g| serde_json::json!({
                    "goal_type": g.goal_type, "target_minutes": g.target_minutes,
                })).collect::<Vec<_>>(),
                "preferred_hours": profile.preferred_work_hours,
            });
            let summary = format!("当前{time_label}，今日待办{tt}项已完成{td}项，剩余{}项（{}项高优先级）。", active.len(), high_pri);
            AiToolResult { success: true, message: summary, data: Some(data) }
        }
        _ => AiToolResult { success: false, message: format!("未知工具: {}", tool_call.tool), data: None },
    }
}

#[tauri::command]
pub async fn ai_chat(
    store: State<'_, Arc<ActivityStore>>,
    db: State<'_, Database>,
    request: AiChatRequest,
) -> Result<AiChatResponse, String> {
    let settings = store.get_settings();
    if !settings.ai_api_enabled || settings.ai_api_key.is_empty() {
        return Err("AI 未启用，请先在设置页配置 AI API".to_string());
    }

    // 获取用户画像
    let profile = db.get_user_profile();

    // 第一轮：调用 AI 获取回复（含工具调用 + 用户画像）
    let reply = ai_service::chat_with_tools_profile(
        &settings,
        &request.history,
        &request.message,
        &request.page,
        request.page_data.as_deref(),
        &profile,
    )
    .await?;

    // 解析工具调用
    let tool_calls = ai_service::parse_tool_calls(&reply);

    let final_reply = if tool_calls.is_empty() {
        reply
    } else {
        // 有工具调用：执行并反馈给 AI 生成最终回复
        let mut tool_results = Vec::new();
        for tc in &tool_calls {
            let result = execute_tool_call(tc, &db);
            tool_results.push(result);
        }

        let mut followup_history = request.history.clone();
        followup_history.push(ConversationMessage { role: "user".into(), content: request.message.clone() });
        followup_history.push(ConversationMessage { role: "assistant".into(), content: reply.clone() });

        let tool_summary: Vec<String> = tool_results.iter().map(|r| {
            if r.success { format!("✅ 操作成功：{}", r.message) } else { format!("❌ 操作失败：{}", r.message) }
        }).collect();

        let followup_msg = format!("以上工具调用的执行结果：\n{}\n\n请根据结果向用户做出最终回复。", tool_summary.join("\n"));

        ai_service::chat_with_profile(&settings, &followup_history, &followup_msg, &request.page, None, &profile).await?
    };

    let clean_reply = ai_service::strip_tool_calls(&final_reply);

    // 保存到对话记录
    let mut db_messages: Vec<ConversationMessage> = request.history.clone();
    db_messages.push(ConversationMessage { role: "user".into(), content: request.message.clone() });
    db_messages.push(ConversationMessage { role: "assistant".into(), content: clean_reply.clone() });
    let conv = Conversation {
        id: request.session_id.clone(),
        title: String::new(),
        messages: db_messages,
        created_at: String::new(),
        updated_at: String::new(),
    };
    db.save_conversation(conv);

    // 异步从对话中提取用户特征（Post-Conversation Extraction）
    if settings.ai_api_enabled && !settings.ai_api_key.is_empty() {
        let settings_clone = settings.clone();
        let history_clone = request.history.clone();
        let user_msg = request.message.clone();
        let reply_clone = clean_reply.clone();
        let db_clone = db.inner().clone();
        tokio::spawn(async move {
            match learning::extract_from_conversation(&settings_clone, &history_clone, &user_msg, &reply_clone).await {
                Ok(insights) => {
                    if !insights.is_empty() {
                        for insight in insights {
                            db_clone.add_user_insight(insight);
                        }
                    }
                }
                Err(_) => {} // 静默失败
            }
        });
    }

    Ok(AiChatResponse { session_id: request.session_id, reply: clean_reply })
}

#[tauri::command]
pub async fn ai_chat_stream(
    app: tauri::AppHandle,
    store: State<'_, Arc<ActivityStore>>,
    db: State<'_, Database>,
    request: AiChatRequest,
) -> Result<(), String> {
    let settings = store.get_settings();
    if !settings.ai_api_enabled || settings.ai_api_key.is_empty() {
        let _ = app.emit("ai-chat-error", "AI 未启用，请先在设置页配置 AI API");
        return Err("AI 未启用，请先在设置页配置 AI API".to_string());
    }

    // 获取用户画像
    let profile = db.get_user_profile();

    let messages = ai_service::build_messages(&settings, &request.history, &request.message, &request.page, request.page_data.as_deref(), true, Some(&profile));

    let app_token = app.clone();
    let app_reason = app.clone();

    let stream_content = ai_service::call_ai_api_stream(
        &settings,
        &messages,
        |token| { let _ = app_token.emit("ai-chat-token", token); },
        |reasoning| { let _ = app_reason.emit("ai-chat-reasoning", reasoning); },
    )
    .await?;

    // 解析工具调用
    let tool_calls = ai_service::parse_tool_calls(&stream_content);

    let final_reply = if tool_calls.is_empty() {
        stream_content
    } else {
        // 执行工具
        let mut tool_results = Vec::new();
        for tc in &tool_calls {
            let result = execute_tool_call(tc, &db);
            tool_results.push(result);
        }

        let mut followup_history = request.history.clone();
        followup_history.push(ConversationMessage { role: "user".into(), content: request.message.clone() });
        followup_history.push(ConversationMessage { role: "assistant".into(), content: stream_content.clone() });

        let tool_summary: Vec<String> = tool_results.iter().map(|r| {
            if r.success { format!("✅ 操作成功：{}", r.message) } else { format!("❌ 操作失败：{}", r.message) }
        }).collect();

        let followup_msg = format!("以上工具调用的执行结果：\n{}\n\n请根据结果向用户做出最终回复。", tool_summary.join("\n"));

        ai_service::chat_with_profile(&settings, &followup_history, &followup_msg, &request.page, None, &profile).await?
    };

    // 保证存储和显示的回复不含工具调用标记
    let clean_reply = ai_service::strip_tool_calls(&final_reply);

    // 保存到对话记录
    let mut db_messages: Vec<ConversationMessage> = request.history.clone();
    db_messages.push(ConversationMessage { role: "user".into(), content: request.message.clone() });
    db_messages.push(ConversationMessage { role: "assistant".into(), content: clean_reply.clone() });
    let conv = Conversation {
        id: request.session_id.clone(),
        title: String::new(),
        messages: db_messages,
        created_at: String::new(),
        updated_at: String::new(),
    };
    db.save_conversation(conv);

    // 异步从对话中提取用户特征（Post-Conversation Extraction）
    if settings.ai_api_enabled && !settings.ai_api_key.is_empty() {
        let settings_clone = settings.clone();
        let history_clone = request.history.clone();
        let user_msg = request.message.clone();
        let reply_clone = clean_reply.clone();
        let db_clone = db.inner().clone();
        tokio::spawn(async move {
            match learning::extract_from_conversation(&settings_clone, &history_clone, &user_msg, &reply_clone).await {
                Ok(insights) => {
                    if !insights.is_empty() {
                        for insight in insights {
                            db_clone.add_user_insight(insight);
                        }
                    }
                }
                Err(_) => {} // 静默失败
            }
        });
    }

    let _ = app.emit("ai-chat-done", serde_json::json!({
        "content": clean_reply,
        "session_id": request.session_id,
    }));

    Ok(())
}

// --- 人设 ---

#[tauri::command]
pub fn persona_list() -> Vec<AiPersona> {
    ai_service::builtin_personas()
}

// --- 数据修复 ---

#[tauri::command]
pub fn sync_completed_status(db: State<'_, Database>) -> i32 {
    db.sync_completed_status()
}

// --- 对话记录 ---

#[tauri::command]
pub fn conversation_list(db: State<'_, Database>) -> Vec<Conversation> {
    db.get_conversations()
}

#[tauri::command]
pub fn conversation_get(db: State<'_, Database>, id: String) -> Option<Conversation> {
    db.get_conversation(&id)
}

#[tauri::command]
pub fn conversation_delete(db: State<'_, Database>, id: String) -> bool {
    db.delete_conversation(&id)
}

// --- 评分历史 ---

#[tauri::command]
pub fn get_daily_score_history(
    db: State<'_, Database>,
) -> Vec<DailyScoreRecord> {
    db.get_daily_scores()
}

// --- 提醒控制 ---

#[tauri::command]
pub fn reminder_start(
    reminder: State<'_, Arc<ReminderEngine>>,
) -> Result<String, String> {
    if reminder.is_running() {
        return Ok("提醒引擎已在运行".to_string());
    }
    reminder.start();
    Ok("提醒引擎已启动".to_string())
}

#[tauri::command]
pub fn reminder_stop(
    reminder: State<'_, Arc<ReminderEngine>>,
) -> Result<String, String> {
    reminder.stop();
    Ok("提醒引擎已停止".to_string())
}

#[tauri::command]
pub fn reminder_status(
    reminder: State<'_, Arc<ReminderEngine>>,
) -> bool {
    reminder.is_running()
}

// --- 用户画像 ---

#[tauri::command]
pub fn user_get_profile(db: State<'_, Database>) -> UserProfile {
    db.get_user_profile()
}

#[tauri::command]
pub fn user_analyze(db: State<'_, Database>) -> UserProfile {
    let profile = learning::analyze_user_behavior(&db);
    db.update_user_profile(profile.clone());
    profile
}

#[tauri::command]
pub fn user_get_insights(db: State<'_, Database>) -> Vec<UserInsight> {
    db.get_user_insights()
}

#[tauri::command]
pub fn user_delete_insight(db: State<'_, Database>, id: String) -> bool {
    db.delete_user_insight(&id)
}
