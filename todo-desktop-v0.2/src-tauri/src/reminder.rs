use crate::activity::{ActivityStore, get_idle_seconds};
use crate::database::Database;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread::JoinHandle;
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

pub struct ReminderEngine {
    store: Arc<ActivityStore>,
    db: Database,
    app: AppHandle,
    running: Arc<AtomicBool>,
    handle: Mutex<Option<JoinHandle<()>>>,
}

impl ReminderEngine {
    pub fn new(store: Arc<ActivityStore>, db: Database, app: AppHandle) -> Self {
        Self { store, db, app, running: Arc::new(AtomicBool::new(false)), handle: Mutex::new(None) }
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    pub fn start(&self) {
        if self.is_running() { return; }
        self.running.store(true, Ordering::SeqCst);
        let running = self.running.clone();
        let store = self.store.clone();
        let db = self.db.clone();
        let app = self.app.clone();
        let mut notified_today = std::collections::HashSet::<String>::new();
        let mut idle_last_notified: i64 = -1;

        let handle = std::thread::spawn(move || {
            loop {
                if !running.load(Ordering::SeqCst) { break; }

                let settings = store.get_settings();
                let config = &settings.reminder_config;
                let today = chrono::Local::now().format("%Y-%m-%d").to_string();

                // 空闲提醒
                if config.idle_reminder_enabled {
                    let idle_secs = get_idle_seconds() as i64;
                    let threshold_secs = (config.idle_threshold_min.max(1)) * 60;
                    if idle_secs >= threshold_secs as i64 && idle_secs != idle_last_notified {
                        idle_last_notified = idle_secs;
                        let body = format!("您已空闲 {} 分钟，该活动一下了！", idle_secs / 60);
                        let _ = app.notification().builder()
                            .title("笺流 - 空闲提醒")
                            .body(&body)
                            .show();
                    }
                } else {
                    idle_last_notified = -1;
                }

                // 截止提醒（每 30 分钟检查一次）
                if config.deadline_reminder_enabled {
                    if let Ok(data) = db.data.lock() {
                        for task in &data.tasks {
                            if task.status != "active" && task.status != "pending" { continue; }
                            if let Some(ref deadline) = task.deadline {
                                // 只提醒今天截止或已过期的
                                if deadline.as_str() <= today.as_str() {
                                    let key = format!("{}-{}", task.id, today);
                                    if !notified_today.contains(&key) {
                                        notified_today.insert(key);
                                        let body = if deadline.as_str() < today.as_str() {
                                            format!("待办「{}」已过期（截止：{}）", task.title, deadline)
                                        } else {
                                            format!("待办「{}」今天截止！", task.title)
                                        };
                                        let _ = app.notification().builder()
                                            .title("笺流 - 截止提醒")
                                            .body(&body)
                                            .show();
                                    }
                                }
                            }
                        }
                    }
                }

                // 休眠 60 秒
                for _ in 0..60 {
                    std::thread::sleep(std::time::Duration::from_secs(1));
                    if !running.load(Ordering::SeqCst) { break; }
                }
            }
        });
        *self.handle.lock().unwrap() = Some(handle);
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
        if let Some(handle) = self.handle.lock().unwrap().take() {
            let _ = handle.join();
        }
    }
}
