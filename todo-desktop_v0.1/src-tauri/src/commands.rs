use crate::database::Database;
use crate::models::*;
use serde_json::Value;
use tauri::State;

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
