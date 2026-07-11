use crate::models::*;
use chrono::{Datelike, Local};
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use uuid::Uuid;

pub struct Database {
    pub data: Arc<Mutex<AppData>>,
    pub path: PathBuf,
}

fn now_str() -> String {
    Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn today_str() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

fn new_id() -> String {
    Uuid::new_v4().to_string()
}

impl Database {
    pub fn new(app_data_dir: PathBuf) -> Self {
        let data_path = app_data_dir.join("todo-data.json");
        let data = if data_path.exists() {
            let raw = std::fs::read_to_string(&data_path).unwrap_or_default();
            serde_json::from_str::<AppData>(&raw).unwrap_or_default()
        } else {
            let default_data = AppData::default();
            if let Some(parent) = data_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let _ = std::fs::write(&data_path, serde_json::to_string_pretty(&default_data).unwrap_or_default());
            default_data
        };
        Database {
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

    pub fn get_tasks(&self, filters: TaskFilters) -> Vec<TaskItem> {
        let data = self.data.lock().unwrap();
        data.tasks
            .iter()
            .filter(|t| {
                if let Some(ref status) = filters.status {
                    if t.status != *status {
                        return false;
                    }
                }
                if let Some(ref r#type) = filters.r#type {
                    if t.r#type != *r#type {
                        return false;
                    }
                }
                if let Some(ref category_id) = filters.category_id {
                    if t.category_id != *category_id {
                        return false;
                    }
                }
                if let Some(ref parent_id) = filters.parent_id {
                    if t.parent_id.as_ref() != Some(parent_id) {
                        return false;
                    }
                }
                if let Some(ref todo_date) = filters.todo_date {
                    if t.todo_date.as_ref() != Some(todo_date) {
                        return false;
                    }
                }
                if let Some(ref pin_date) = filters.pin_date {
                    if t.pin_date.as_ref() != Some(pin_date) {
                        return false;
                    }
                }
                true
            })
            .cloned()
            .collect()
    }

    pub fn get_task(&self, id: &str) -> Option<TaskItem> {
        let data = self.data.lock().unwrap();
        data.tasks.iter().find(|t| t.id == id).cloned()
    }

    pub fn add_task(&self, mut task: TaskItem) -> TaskItem {
        task.id = new_id();
        let now = now_str();
        task.created_at = now.clone();
        task.updated_at = now;
        let mut data = self.data.lock().unwrap();
        data.tasks.push(task.clone());
        drop(data);
        self.save();
        task
    }

    pub fn update_task(&self, id: &str, updates: Value) -> Option<TaskItem> {
        let mut data = self.data.lock().unwrap();
        let task = data.tasks.iter_mut().find(|t| t.id == id)?;
        let now = now_str();
        task.updated_at = now;
        if let Some(v) = updates.get("type").and_then(|v| v.as_str()) {
            task.r#type = v.to_string();
        }
        if let Some(v) = updates.get("sub_type").and_then(|v| v.as_str()) {
            task.sub_type = v.to_string();
        }
        if let Some(v) = updates.get("title").and_then(|v| v.as_str()) {
            task.title = v.to_string();
        }
        if let Some(v) = updates.get("content").and_then(|v| v.as_str()) {
            task.content = v.to_string();
        }
        if let Some(v) = updates.get("category_id").and_then(|v| v.as_str()) {
            task.category_id = v.to_string();
        }
        if let Some(v) = updates.get("priority").and_then(|v| v.as_i64()) {
            task.priority = v as i32;
        }
        if let Some(v) = updates.get("parent_id") {
            task.parent_id = v.as_str().map(|s| s.to_string());
        }
        if let Some(v) = updates.get("sort_order").and_then(|v| v.as_i64()) {
            task.sort_order = v as i32;
        }
        if let Some(v) = updates.get("status").and_then(|v| v.as_str()) {
            task.status = v.to_string();
        }
        if let Some(v) = updates.get("grid_x") {
            task.grid_x = v.as_i64().map(|i| i as i32);
        }
        if let Some(v) = updates.get("grid_y") {
            task.grid_y = v.as_i64().map(|i| i as i32);
        }
        if let Some(v) = updates.get("home_x") {
            task.home_x = v.as_i64().map(|i| i as i32);
        }
        if let Some(v) = updates.get("home_y") {
            task.home_y = v.as_i64().map(|i| i as i32);
        }
        if let Some(v) = updates.get("todo_date") {
            task.todo_date = v.as_str().map(|s| s.to_string());
        }
        if let Some(v) = updates.get("todo_status") {
            task.todo_status = v.as_str().map(|s| s.to_string());
        }
        if let Some(v) = updates.get("recurrence") {
            task.recurrence = v.as_str().map(|s| s.to_string());
        }
        if let Some(v) = updates.get("completed_at") {
            task.completed_at = v.as_str().map(|s| s.to_string());
        }
        if let Some(v) = updates.get("deadline") {
            task.deadline = v.as_str().map(|s| s.to_string());
        }
        if let Some(v) = updates.get("pin_date") {
            task.pin_date = v.as_str().map(|s| s.to_string());
        }
        if let Some(v) = updates.get("collapsed").and_then(|v| v.as_bool()) {
            task.collapsed = v;
        }
        if let Some(v) = updates.get("note") {
            task.note = v.as_str().map(|s| s.to_string());
        }
        if let Some(v) = updates.get("time_start") {
            task.time_start = v.as_str().map(|s| s.to_string());
        }
        if let Some(v) = updates.get("time_end") {
            task.time_end = v.as_str().map(|s| s.to_string());
        }
        if let Some(v) = updates.get("note_width") {
            task.note_width = v.as_i64().map(|i| i as i32);
        }
        if let Some(v) = updates.get("note_height") {
            task.note_height = v.as_i64().map(|i| i as i32);
        }
        if let Some(v) = updates.get("open_width") {
            task.open_width = v.as_i64().map(|i| i as i32);
        }
        if let Some(v) = updates.get("open_height") {
            task.open_height = v.as_i64().map(|i| i as i32);
        }
        if let Some(v) = updates.get("group_id") {
            task.group_id = v.as_str().map(|s| s.to_string());
        }
        if let Some(v) = updates.get("board_tab") {
            task.board_tab = v.as_str().map(|s| s.to_string());
        }
        if let Some(v) = updates.get("node_mode") {
            task.node_mode = v.as_bool();
        }
        if let Some(v) = updates.get("schedule_start") {
            task.schedule_start = v.as_str().map(|s| s.to_string());
        }
        if let Some(v) = updates.get("schedule_end") {
            task.schedule_end = v.as_str().map(|s| s.to_string());
        }
        let result = task.clone();
        drop(data);
        self.save();
        Some(result)
    }

    pub fn delete_task(&self, id: &str) -> bool {
        let mut data = self.data.lock().unwrap();
        let before = data.tasks.len();
        data.tasks.retain(|t| t.id != id);
        let deleted = data.tasks.len() < before;
        drop(data);
        if deleted {
            self.save();
        }
        deleted
    }

    pub fn update_task_type_cascade(&self, id: &str, new_type: &str) -> Vec<TaskItem> {
        let mut data = self.data.lock().unwrap();
        let mut updated = Vec::new();

        if let Some(task) = data.tasks.iter_mut().find(|t| t.id == id) {
            task.r#type = new_type.to_string();
            task.updated_at = now_str();
            updated.push(task.clone());
        }

        let mut queue = vec![id.to_string()];
        while let Some(parent_id) = queue.pop() {
            for task in data.tasks.iter_mut() {
                if task.parent_id.as_ref() == Some(&parent_id) && task.sub_type == "note" {
                    task.r#type = new_type.to_string();
                    task.updated_at = now_str();
                    queue.push(task.id.clone());
                    updated.push(task.clone());
                }
            }
        }

        drop(data);
        self.save();
        updated
    }

    pub fn batch_add_tasks(&self, tasks: Vec<TaskItem>) -> Vec<TaskItem> {
        let mut data = self.data.lock().unwrap();
        let now = now_str();
        let mut result = Vec::new();
        for mut task in tasks {
            if data.tasks.iter().any(|t| t.id == task.id) {
                continue;
            }
            task.id = new_id();
            task.created_at = now.clone();
            task.updated_at = now.clone();
            data.tasks.push(task.clone());
            result.push(task);
        }
        drop(data);
        self.save();
        result
    }

    pub fn generate_recurring_tasks(&self, target_date: &str) -> i32 {
        let mut data = self.data.lock().unwrap();
        let recurring: Vec<TaskItem> = data
            .tasks
            .iter()
            .filter(|t| t.recurrence.is_some() && t.parent_id.is_none())
            .cloned()
            .collect();

        let mut created = 0i32;
        let now = now_str();

        for task in recurring {
            let recurrence = match &task.recurrence {
                Some(r) => r.clone(),
                None => continue,
            };

            let has_parent = data.tasks.iter().any(|t| {
                t.parent_id.as_ref() == Some(&task.id) && t.todo_date.as_ref() == Some(&target_date.to_string())
            });
            let has_same_title = data.tasks.iter().any(|t| {
                t.todo_date.as_ref() == Some(&target_date.to_string())
                    && t.title == task.title
                    && t.parent_id.is_none()
            });

            if has_parent || has_same_title {
                continue;
            }

            let origin_date = match &task.todo_date {
                Some(d) => d.clone(),
                None => continue,
            };

            let origin = match chrono::NaiveDate::parse_from_str(&origin_date, "%Y-%m-%d") {
                Ok(d) => d,
                Err(_) => continue,
            };
            let target = match chrono::NaiveDate::parse_from_str(target_date, "%Y-%m-%d") {
                Ok(d) => d,
                Err(_) => continue,
            };

            let diff_days = (target - origin).num_days();
            if diff_days <= 0 {
                continue;
            }

            let should_create = match recurrence.as_str() {
                "daily" => true,
                "weekly" => diff_days % 7 == 0,
                "monthly" => origin.day() == target.day(),
                _ => false,
            };

            if should_create {
                let new_task = TaskItem {
                    id: new_id(),
                    r#type: task.r#type.clone(),
                    sub_type: task.sub_type.clone(),
                    title: task.title.clone(),
                    content: task.content.clone(),
                    category_id: task.category_id.clone(),
                    priority: task.priority,
                    parent_id: Some(task.id.clone()),
                    sort_order: 0,
                    status: "active".to_string(),
                    grid_x: None,
                    grid_y: None,
                    home_x: None,
                    home_y: None,
                    todo_date: Some(target_date.to_string()),
                    todo_status: Some("pending".to_string()),
                    recurrence: Some(recurrence),
                    completed_at: None,
                    deadline: None,
                    pin_date: None,
                    collapsed: false,
                    note: None,
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
                    created_at: now.clone(),
                    updated_at: now.clone(),
                };
                data.tasks.push(new_task);
                created += 1;
            }
        }

        drop(data);
        if created > 0 {
            self.save();
        }
        created
    }

    pub fn get_categories(&self) -> Vec<Category> {
        let data = self.data.lock().unwrap();
        let mut cats = data.categories.clone();
        cats.sort_by_key(|c| c.sort_order);
        cats
    }

    pub fn add_category(&self, name: &str, color: &str) -> Category {
        let cat = Category {
            id: new_id(),
            name: name.to_string(),
            color: if color.is_empty() { "#5b7fff".to_string() } else { color.to_string() },
            sort_order: 0,
        };
        let mut data = self.data.lock().unwrap();
        data.categories.push(cat.clone());
        drop(data);
        self.save();
        cat
    }

    pub fn update_category(&self, id: &str, name: &str, color: &str) -> Option<Category> {
        let mut data = self.data.lock().unwrap();
        let cat = data.categories.iter_mut().find(|c| c.id == id)?;
        cat.name = name.to_string();
        cat.color = color.to_string();
        let result = cat.clone();
        drop(data);
        self.save();
        Some(result)
    }

    pub fn delete_category(&self, id: &str) -> bool {
        let mut data = self.data.lock().unwrap();
        data.tasks.iter_mut().for_each(|t| {
            if t.category_id == id {
                t.category_id = "cat_default".to_string();
            }
        });
        let before = data.categories.len();
        data.categories.retain(|c| c.id != id);
        let deleted = data.categories.len() < before;
        drop(data);
        if deleted {
            self.save();
        }
        deleted
    }

    pub fn get_daily_log(&self, date: &str) -> Option<String> {
        let data = self.data.lock().unwrap();
        data.daily_logs.get(date).cloned()
    }

    pub fn set_daily_log(&self, date: &str, content: &str) {
        let mut data = self.data.lock().unwrap();
        if content.trim().is_empty() {
            data.daily_logs.remove(date);
        } else {
            data.daily_logs.insert(date.to_string(), content.to_string());
        }
        drop(data);
        self.save();
    }

    pub fn get_time_types(&self) -> Vec<TimeType> {
        let data = self.data.lock().unwrap();
        let mut tts = data.time_types.clone();
        tts.sort_by_key(|t| t.sort_order);
        tts
    }

    pub fn add_time_type(&self, name: &str, color: &str) -> TimeType {
        let tt = TimeType {
            id: new_id(),
            name: name.to_string(),
            color: if color.is_empty() { "#5b7fff".to_string() } else { color.to_string() },
            sort_order: 0,
        };
        let mut data = self.data.lock().unwrap();
        data.time_types.push(tt.clone());
        drop(data);
        self.save();
        tt
    }

    pub fn update_time_type(&self, id: &str, updates: Value) -> Option<TimeType> {
        let mut data = self.data.lock().unwrap();
        let tt = data.time_types.iter_mut().find(|t| t.id == id)?;
        let old_name = tt.name.clone();
        if let Some(v) = updates.get("name").and_then(|v| v.as_str()) {
            tt.name = v.to_string();
        }
        if let Some(v) = updates.get("color").and_then(|v| v.as_str()) {
            tt.color = v.to_string();
        }
        if let Some(v) = updates.get("sort_order").and_then(|v| v.as_i64()) {
            tt.sort_order = v as i32;
        }
        let new_name = tt.name.clone();
        let result = tt.clone();
        if new_name != old_name {
            for r in data.time_records.iter_mut() {
                if r.time_type == old_name {
                    r.time_type = new_name.clone();
                }
            }
            for p in data.pomodoro_presets.iter_mut() {
                if p.time_type == old_name {
                    p.time_type = new_name.clone();
                }
            }
        }
        drop(data);
        self.save();
        Some(result)
    }

    pub fn delete_time_type(&self, id: &str) -> bool {
        let mut data = self.data.lock().unwrap();
        let tt_name = data.time_types.iter().find(|t| t.id == id).map(|t| t.name.clone());
        if let Some(name) = tt_name {
            data.time_records.iter_mut().for_each(|r| {
                if r.time_type == name {
                    r.time_type = "其他".to_string();
                }
            });
            data.pomodoro_presets.iter_mut().for_each(|p| {
                if p.time_type == name {
                    p.time_type = "其他".to_string();
                }
            });
        }
        let before = data.time_types.len();
        data.time_types.retain(|t| t.id != id);
        let deleted = data.time_types.len() < before;
        drop(data);
        if deleted {
            self.save();
        }
        deleted
    }

    pub fn add_time_record(&self, mut record: TimeRecord) -> TimeRecord {
        record.id = new_id();
        record.created_at = now_str();
        let mut data = self.data.lock().unwrap();
        data.time_records.push(record.clone());
        drop(data);
        self.save();
        record
    }

    pub fn get_time_records(&self, date: &str) -> Vec<TimeRecord> {
        let data = self.data.lock().unwrap();
        let mut records: Vec<TimeRecord> = data
            .time_records
            .iter()
            .filter(|r| r.date == date && !(r.source == "import" && r.start_time.is_none()))
            .cloned()
            .collect();
        records.sort_by(|a, b| a.start_time.as_ref().cmp(&b.start_time.as_ref()));
        records
    }

    pub fn get_time_records_range(&self, start: &str, end: &str) -> Vec<TimeRecord> {
        let data = self.data.lock().unwrap();
        let mut records: Vec<TimeRecord> = data
            .time_records
            .iter()
            .filter(|r| r.date.as_str() >= start && r.date.as_str() <= end)
            .cloned()
            .collect();
        records.sort_by(|a, b| {
            a.date.cmp(&b.date).then_with(|| a.start_time.as_ref().cmp(&b.start_time.as_ref()))
        });
        records
    }

    pub fn get_all_time_records(&self) -> Vec<TimeRecord> {
        let data = self.data.lock().unwrap();
        let mut records = data.time_records.clone();
        records.sort_by(|a, b| b.date.cmp(&a.date));
        records
    }

    pub fn update_time_record(&self, id: &str, updates: Value) -> Option<TimeRecord> {
        let mut data = self.data.lock().unwrap();
        let record = data.time_records.iter_mut().find(|r| r.id == id)?;
        if let Some(v) = updates.get("time_type").and_then(|v| v.as_str()) {
            record.time_type = v.to_string();
        }
        if let Some(v) = updates.get("start_time") {
            record.start_time = v.as_str().map(|s| s.to_string());
        }
        if let Some(v) = updates.get("end_time") {
            record.end_time = v.as_str().map(|s| s.to_string());
        }
        if let Some(v) = updates.get("total_minutes").and_then(|v| v.as_i64()) {
            record.total_minutes = v as i32;
        }
        if let Some(v) = updates.get("pauses") {
            record.pauses = v.as_str().map(|s| s.to_string());
        }
        if let Some(v) = updates.get("note").and_then(|v| v.as_str()) {
            record.note = v.to_string();
        }
        let result = record.clone();
        drop(data);
        self.save();
        Some(result)
    }

    pub fn delete_time_record(&self, id: &str) -> bool {
        let mut data = self.data.lock().unwrap();
        let before = data.time_records.len();
        data.time_records.retain(|r| r.id != id);
        let deleted = data.time_records.len() < before;
        drop(data);
        if deleted {
            self.save();
        }
        deleted
    }

    pub fn get_presets(&self) -> Vec<PomodoroPreset> {
        let data = self.data.lock().unwrap();
        data.pomodoro_presets.clone()
    }

    pub fn add_preset(&self, mut preset: PomodoroPreset) -> PomodoroPreset {
        preset.id = new_id();
        preset.created_at = now_str();
        let mut data = self.data.lock().unwrap();
        data.pomodoro_presets.push(preset.clone());
        drop(data);
        self.save();
        preset
    }

    pub fn update_preset(&self, id: &str, updates: Value) -> Option<PomodoroPreset> {
        let mut data = self.data.lock().unwrap();
        let preset = data.pomodoro_presets.iter_mut().find(|p| p.id == id)?;
        if let Some(v) = updates.get("time_type").and_then(|v| v.as_str()) {
            preset.time_type = v.to_string();
        }
        if let Some(v) = updates.get("duration_minutes").and_then(|v| v.as_i64()) {
            preset.duration_minutes = v as i32;
        }
        if let Some(v) = updates.get("mode").and_then(|v| v.as_str()) {
            preset.mode = v.to_string();
        }
        if let Some(v) = updates.get("color").and_then(|v| v.as_str()) {
            preset.color = v.to_string();
        }
        let result = preset.clone();
        drop(data);
        self.save();
        Some(result)
    }

    pub fn delete_preset(&self, id: &str) -> bool {
        let mut data = self.data.lock().unwrap();
        let before = data.pomodoro_presets.len();
        data.pomodoro_presets.retain(|p| p.id != id);
        let deleted = data.pomodoro_presets.len() < before;
        drop(data);
        if deleted {
            self.save();
        }
        deleted
    }

    pub fn get_goals(&self) -> Vec<Goal> {
        let data = self.data.lock().unwrap();
        data.goals.clone()
    }

    pub fn set_goal(&self, goal_type: &str, target_minutes: i32) -> Goal {
        let mut data = self.data.lock().unwrap();
        if let Some(g) = data.goals.iter_mut().find(|g| g.goal_type == goal_type) {
            g.target_minutes = target_minutes;
            g.is_active = true;
            let result = g.clone();
            drop(data);
            self.save();
            result
        } else {
            let goal = Goal {
                id: format!("goal_{}", goal_type),
                goal_type: goal_type.to_string(),
                target_minutes,
                is_active: true,
            };
            data.goals.push(goal.clone());
            drop(data);
            self.save();
            goal
        }
    }

    pub fn get_countdowns(&self) -> Vec<Countdown> {
        let data = self.data.lock().unwrap();
        let mut cds = data.countdowns.clone();
        cds.sort_by(|a, b| a.target_date.cmp(&b.target_date));
        cds
    }

    pub fn add_countdown(&self, title: &str, target_date: &str, color: Option<&str>) -> Countdown {
        let cd = Countdown {
            id: new_id(),
            title: title.to_string(),
            target_date: target_date.to_string(),
            color: color.map(|c| c.to_string()),
            created_at: now_str(),
        };
        let mut data = self.data.lock().unwrap();
        data.countdowns.push(cd.clone());
        drop(data);
        self.save();
        cd
    }

    pub fn update_countdown(&self, id: &str, updates: Value) -> Option<Countdown> {
        let mut data = self.data.lock().unwrap();
        let cd = data.countdowns.iter_mut().find(|c| c.id == id)?;
        if let Some(v) = updates.get("title").and_then(|v| v.as_str()) {
            cd.title = v.to_string();
        }
        if let Some(v) = updates.get("target_date").and_then(|v| v.as_str()) {
            cd.target_date = v.to_string();
        }
        if let Some(v) = updates.get("color") {
            cd.color = v.as_str().map(|s| s.to_string());
        }
        let result = cd.clone();
        drop(data);
        self.save();
        Some(result)
    }

    pub fn delete_countdown(&self, id: &str) -> bool {
        let mut data = self.data.lock().unwrap();
        let before = data.countdowns.len();
        data.countdowns.retain(|c| c.id != id);
        let deleted = data.countdowns.len() < before;
        drop(data);
        if deleted {
            self.save();
        }
        deleted
    }

    pub fn get_connections(&self) -> Vec<Connection> {
        let data = self.data.lock().unwrap();
        data.connections.clone()
    }

    pub fn add_connection(&self, from_id: &str, to_id: String) -> Connection {
        let conn = Connection {
            from_id: from_id.to_string(),
            to_id,
        };
        let mut data = self.data.lock().unwrap();
        data.connections.push(conn.clone());
        drop(data);
        self.save();
        conn
    }

    pub fn remove_connection(&self, from_id: &str, to_id: &str) -> bool {
        let mut data = self.data.lock().unwrap();
        let before = data.connections.len();
        data.connections
            .retain(|c| !(c.from_id == from_id && c.to_id == to_id));
        let removed = data.connections.len() < before;
        drop(data);
        if removed {
            self.save();
        }
        removed
    }

    pub fn get_settings(&self) -> AppSettings {
        let data = self.data.lock().unwrap();
        data.settings.clone()
    }

    pub fn update_settings(&self, updates: Value) -> AppSettings {
        let mut data = self.data.lock().unwrap();
        if let Some(v) = updates.get("theme").and_then(|v| v.as_str()) {
            data.settings.theme = v.to_string();
        }
        if let Some(v) = updates.get("master_plan").and_then(|v| v.as_str()) {
            data.settings.master_plan = v.to_string();
        }
        if let Some(v) = updates.get("master_reflection").and_then(|v| v.as_str()) {
            data.settings.master_reflection = v.to_string();
        }
        if let Some(v) = updates.get("quotes").and_then(|v| v.as_str()) {
            data.settings.quotes = v.to_string();
        }
        if let Some(v) = updates.get("quote_mode").and_then(|v| v.as_str()) {
            data.settings.quote_mode = v.to_string();
        }
        if let Some(v) = updates.get("quote_interval").and_then(|v| v.as_str()) {
            data.settings.quote_interval = v.to_string();
        }
        if let Some(v) = updates.get("pomodoro_show_todos").and_then(|v| v.as_bool()) {
            data.settings.pomodoro_show_todos = v;
        }
        if let Some(v) = updates.get("pomodoro_show_plan").and_then(|v| v.as_bool()) {
            data.settings.pomodoro_show_plan = v;
        }
        if let Some(v) = updates.get("pomodoro_show_countdown").and_then(|v| v.as_bool()) {
            data.settings.pomodoro_show_countdown = v;
        }
        if let Some(v) = updates.get("bg_home").and_then(|v| v.as_str()) {
            data.settings.bg_home = v.to_string();
        }
        if let Some(v) = updates.get("bg_pomodoro").and_then(|v| v.as_str()) {
            data.settings.bg_pomodoro = v.to_string();
        }
        if let Some(v) = updates.get("startup_minimized").and_then(|v| v.as_bool()) {
            data.settings.startup_minimized = v;
        }
        if let Some(v) = updates.get("move_uncompleted").and_then(|v| v.as_bool()) {
            data.settings.move_uncompleted = v;
        }
        if let Some(v) = updates.get("board_bg_style").and_then(|v| v.as_str()) {
            data.settings.board_bg_style = v.to_string();
        }
        if let Some(v) = updates.get("note_spacing").and_then(|v| v.as_i64()) {
            data.settings.note_spacing = v as i32;
        }
        let result = data.settings.clone();
        drop(data);
        self.save();
        result
    }

    pub fn get_study_stats(&self, range: &str) -> Value {
        let data = self.data.lock().unwrap();
        let records = &data.time_records;
        let today = today_str();
        let date_filter = match range {
            "week" => {
                let d = Local::now() - chrono::Duration::days(7);
                d.format("%Y-%m-%d").to_string()
            }
            "month" => {
                let d = Local::now() - chrono::Duration::days(30);
                d.format("%Y-%m-%d").to_string()
            }
            "year" => {
                let d = Local::now() - chrono::Duration::days(365);
                d.format("%Y-%m-%d").to_string()
            }
            _ => "2000-01-01".to_string(),
        };

        let filtered: Vec<&TimeRecord> = records.iter().filter(|r| r.date >= date_filter).collect();

        let mut daily_map: HashMap<String, Value> = HashMap::new();
        let mut type_map: HashMap<String, Value> = HashMap::new();

        for r in &filtered {
            let type_entry = type_map.entry(r.time_type.clone()).or_insert_with(|| {
                serde_json::json!({
                    "time_type": r.time_type,
                    "minutes": 0,
                    "sessions": 0
                })
            });
            if let Some(obj) = type_entry.as_object_mut() {
                let cur_min = obj.get("minutes").and_then(|v| v.as_i64()).unwrap_or(0);
                let cur_sess = obj.get("sessions").and_then(|v| v.as_i64()).unwrap_or(0);
                *obj.get_mut("minutes").unwrap() = serde_json::json!(cur_min + r.total_minutes as i64);
                *obj.get_mut("sessions").unwrap() = serde_json::json!(cur_sess + 1);
            }

            let effective = !(r.source == "import" && r.start_time.is_none());
            if !effective {
                continue;
            }
            let daily_entry = daily_map.entry(r.date.clone()).or_insert_with(|| {
                serde_json::json!({
                    "date": r.date,
                    "minutes": 0,
                    "sessions": 0
                })
            });
            if let Some(obj) = daily_entry.as_object_mut() {
                let cur_min = obj.get("minutes").and_then(|v| v.as_i64()).unwrap_or(0);
                let cur_sess = obj.get("sessions").and_then(|v| v.as_i64()).unwrap_or(0);
                *obj.get_mut("minutes").unwrap() = serde_json::json!(cur_min + r.total_minutes as i64);
                *obj.get_mut("sessions").unwrap() = serde_json::json!(cur_sess + 1);
            }
        }

        let mut daily_minutes: Vec<Value> = daily_map.into_values().collect();
        daily_minutes.sort_by(|a, b| a["date"].as_str().cmp(&b["date"].as_str()));

        let mut type_distribution: Vec<Value> = type_map.into_values().collect();
        type_distribution.sort_by(|a, b| b["minutes"].as_i64().cmp(&a["minutes"].as_i64()));

        let total_minutes: i64 = records.iter().map(|r| r.total_minutes as i64).sum();
        let total_sessions = records.len() as i64;

        let today_records: Vec<&TimeRecord> = records
            .iter()
            .filter(|r| r.date == today && !(r.source == "import" && r.start_time.is_none()))
            .collect();
        let today_minutes: i64 = today_records.iter().map(|r| r.total_minutes as i64).sum();
        let today_sessions = today_records.len() as i64;

        serde_json::json!({
            "dailyMinutes": daily_minutes,
            "typeDistribution": type_distribution,
            "totalMinutes": total_minutes,
            "totalSessions": total_sessions,
            "todayMinutes": today_minutes,
            "todaySessions": today_sessions
        })
    }

    pub fn get_streak(&self) -> i32 {
        let data = self.data.lock().unwrap();
        let mut dates: Vec<String> = data
            .time_records
            .iter()
            .filter(|r| r.total_minutes > 0)
            .map(|r| r.date.clone())
            .collect();
        dates.sort();
        dates.dedup();
        dates.reverse();

        if dates.is_empty() {
            return 0;
        }

        let today = Local::now().date_naive();
        let mut streak = 0i32;

        for i in 0..dates.len() {
            let check_date = today - chrono::Duration::days(i as i64);
            let check_str = check_date.format("%Y-%m-%d").to_string();

            if i == 0 && dates[0] != check_str {
                let yesterday = today - chrono::Duration::days(1);
                let yesterday_str = yesterday.format("%Y-%m-%d").to_string();
                if dates[0] == yesterday_str {
                    streak += 1;
                    continue;
                }
                break;
            }
            if dates[i] == check_str {
                streak += 1;
            } else {
                break;
            }
        }

        streak
    }

    pub fn export_all_data(&self) -> Value {
        let data = self.data.lock().unwrap();
        serde_json::json!({
            "tasks": data.tasks,
            "dailyLogs": data.daily_logs,
            "timeRecords": data.time_records,
            "timeTypes": data.time_types,
            "categories": data.categories,
            "presets": data.pomodoro_presets,
            "goals": data.goals,
            "countdowns": data.countdowns,
            "settings": data.settings,
            "exportedAt": now_str()
        })
    }
}
