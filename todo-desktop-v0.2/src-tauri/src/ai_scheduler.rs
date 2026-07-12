use chrono::Datelike;
use crate::activity::ActivityStore;
use crate::ai_service;
use crate::database::Database;
use crate::models::*;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

pub struct AgentScheduler {
    tasks: Mutex<Vec<ScheduledTask>>,
    running: Arc<AtomicBool>,
    store: Arc<ActivityStore>,
    db: Database,
}

impl AgentScheduler {
    pub fn new(store: Arc<ActivityStore>, db: Database) -> Self {
        let tasks = default_scheduled_tasks();
        Self {
            tasks: Mutex::new(tasks),
            running: Arc::new(AtomicBool::new(false)),
            store,
            db,
        }
    }

    pub fn get_tasks(&self) -> Vec<ScheduledTask> {
        let mut tasks = self.tasks.lock().unwrap().clone();
        let now = chrono::Local::now();
        for task in &mut tasks {
            if task.enabled {
                task.next_run = Self::compute_next_run(&task.cron_expression, &now);
            } else {
                task.next_run = None;
            }
        }
        tasks
    }

    pub fn add_task(&self, task: ScheduledTask) {
        let mut tasks = self.tasks.lock().unwrap();
        tasks.push(task);
    }

    pub fn remove_task(&self, id: &str) -> bool {
        let mut tasks = self.tasks.lock().unwrap();
        let before = tasks.len();
        tasks.retain(|t| t.id != id);
        tasks.len() < before
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    pub fn start(&self) {
        if self.is_running() {
            return;
        }
        self.running.store(true, Ordering::SeqCst);
        let tasks_clone = self.tasks.lock().unwrap().clone();
        let store = self.store.clone();
        let db = self.db.clone();
        let flag = self.running.clone();

        tokio::spawn(async move {
            loop {
                if !flag.load(Ordering::SeqCst) {
                    break;
                }

                let settings = store.get_settings();
                if !settings.ai_api_enabled || settings.ai_api_key.is_empty() {
                    for _ in 0..60 {
                        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                        if !flag.load(Ordering::SeqCst) {
                            return;
                        }
                    }
                    continue;
                }

                let now = chrono::Local::now();
                let now_str = now.format("%Y-%m-%d %H:%M:%S").to_string();
                let tasks_to_run: Vec<ScheduledTask> = tasks_clone
                    .iter()
                    .filter(|t| {
                        t.enabled
                            && Self::matches_cron(&t.cron_expression, &now)
                            && t.last_run.as_deref() != Some(&now_str[..16])
                    })
                    .cloned()
                    .collect();

                for scheduled in &tasks_to_run {
                    let msgs = vec![
                        ConversationMessage {
                            role: "system".into(),
                            content: format!(
                                "你是一个自动化的{}助手。{}",
                                match scheduled.agent_type.as_str() {
                                    "planner" => "规划",
                                    "analyst" => "分析",
                                    "memory" => "记忆整理",
                                    _ => "",
                                },
                                scheduled.instruction
                            ),
                        },
                        ConversationMessage {
                            role: "user".into(),
                            content: if scheduled.context.is_empty() {
                                format!(
                                    "当前时间: {}，请执行你的任务。",
                                    now.format("%Y-%m-%d %H:%M")
                                )
                            } else {
                                scheduled.context.clone()
                            },
                        },
                    ];

                    let result = ai_service::call_ai_api_simple(&settings, &msgs).await;
                    if let Ok(reply) = result {
                        let short = if reply.len() > 100 { &reply[..100] } else { &reply };
                        println!(
                            "[AI Scheduler] 执行任务 '{}': {}",
                            scheduled.name, short
                        );
                        let _ = db.add_memory(
                            &format!("scheduled_{}", scheduled.id),
                            &reply,
                        );
                    }
                }

                for _ in 0..60 {
                    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                    if !flag.load(Ordering::SeqCst) {
                        return;
                    }
                }
            }
        });
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
    }

    fn matches_cron(cron: &str, now: &chrono::DateTime<chrono::Local>) -> bool {
        let parts: Vec<&str> = cron.split_whitespace().collect();
        if parts.len() != 5 {
            return false;
        }

        let minute = now.format("%M").to_string().parse::<i32>().unwrap_or(0);
        let hour = now.format("%H").to_string().parse::<i32>().unwrap_or(0);
        let day = now.format("%d").to_string().parse::<i32>().unwrap_or(1);
        let month = now.format("%m").to_string().parse::<i32>().unwrap_or(1);
        let wd = now.weekday().number_from_sunday() - 1;

        Self::match_cron_part(parts[0], minute)
            && Self::match_cron_part(parts[1], hour)
            && Self::match_cron_part(parts[2], day)
            && Self::match_cron_part(parts[3], month)
            && Self::match_cron_part(parts[4], wd as i32)
    }

    fn match_cron_part(pattern: &str, value: i32) -> bool {
        if pattern == "*" {
            return true;
        }
        for part in pattern.split(',') {
            if let Ok(n) = part.trim().parse::<i32>() {
                if n == value {
                    return true;
                }
            }
        }
        false
    }

    fn compute_next_run(
        cron: &str,
        from: &chrono::DateTime<chrono::Local>,
    ) -> Option<String> {
        let parts: Vec<&str> = cron.split_whitespace().collect();
        if parts.len() != 5 {
            return None;
        }

        let mut candidate = from.clone();
        for _ in 0..1440 {
            candidate = candidate + chrono::Duration::minutes(1);
            if Self::matches_cron(cron, &candidate) {
                return Some(candidate.format("%Y-%m-%d %H:%M").to_string());
            }
        }
        None
    }
}

pub fn default_scheduled_tasks() -> Vec<ScheduledTask> {
    let now = chrono::Local::now();
    vec![
        ScheduledTask {
            id: "morning_plan".into(),
            name: "早安规划".into(),
            cron_expression: "0 8 * * *".into(),
            agent_type: "planner".into(),
            instruction: "查看今天的待办事项，生成今日规划建议，用 markdown 列出优先级排序。".into(),
            enabled: false,
            last_run: None,
            next_run: AgentScheduler::compute_next_run("0 8 * * *", &now),
            context: String::new(),
        },
        ScheduledTask {
            id: "weekly_review".into(),
            name: "周报总结".into(),
            cron_expression: "0 20 * * 0".into(),
            agent_type: "analyst".into(),
            instruction: "分析本周的学习数据，生成周报总结，包含专注时长、完成率、趋势和下周建议。".into(),
            enabled: false,
            last_run: None,
            next_run: AgentScheduler::compute_next_run("0 20 * * 0", &now),
            context: String::new(),
        },
        ScheduledTask {
            id: "night_memory".into(),
            name: "夜间整理".into(),
            cron_expression: "0 0 * * *".into(),
            agent_type: "memory".into(),
            instruction: "整理今天的对话记录，提取重要的记忆和洞察，压缩低价值记忆。".into(),
            enabled: false,
            last_run: None,
            next_run: AgentScheduler::compute_next_run("0 0 * * *", &now),
            context: String::new(),
        },
    ]
}
