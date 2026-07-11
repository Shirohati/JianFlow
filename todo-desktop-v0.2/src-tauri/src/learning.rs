use crate::database::Database;
use crate::models::*;
use chrono::Local;
use std::collections::HashMap;

fn now_str() -> String {
    Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// 分析用户行为数据，生成用户画像
pub fn analyze_user_behavior(db: &Database) -> UserProfile {
    let tasks = db.get_tasks(TaskFilters {
        status: None,
        r#type: None,
        category_id: None,
        parent_id: None,
        todo_date: None,
        pin_date: None,
    });

    let all_records = db.get_all_time_records();

    // 计算活跃天数
    let mut active_dates: std::collections::HashSet<String> = std::collections::HashSet::new();
    for r in &all_records {
        if r.total_minutes > 0 {
            active_dates.insert(r.date.clone());
        }
    }
    let total_days_active = active_dates.len() as i32;

    // 计算日均专注分钟数
    let total_minutes: i64 = all_records.iter().map(|r| r.total_minutes as i64).sum();
    let average_daily_focus = if total_days_active > 0 {
        (total_minutes / total_days_active as i64) as i32
    } else {
        0
    };

    // 统计常用分类
    let mut cat_count: HashMap<String, i64> = HashMap::new();
    for t in &tasks {
        if t.status == "active" || t.status == "done" {
            *cat_count.entry(t.category_id.clone()).or_default() += 1;
        }
    }
    let mut common_categories: Vec<String> = cat_count
        .into_iter()
        .filter(|(_, c)| *c >= 2)
        .collect::<Vec<_>>()
        .into_iter()
        .map(|(k, _)| k)
        .collect();
    common_categories.sort();

    // 检测行为模式
    let patterns = detect_patterns(&tasks, &all_records);

    // 计算偏好工作时间段
    let mut hour_count: HashMap<i32, i64> = HashMap::new();
    for r in &all_records {
        if let Some(ref start) = r.start_time {
            if let Some(hour_str) = start.split(':').next() {
                if let Ok(h) = hour_str.parse::<i32>() {
                    *hour_count.entry(h).or_default() += r.total_minutes as i64;
                }
            }
        }
    }
    let mut preferred_hours: Vec<(i32, i64)> = hour_count.into_iter().collect();
    preferred_hours.sort_by(|a, b| b.1.cmp(&a.1));
    let preferred_work_hours = preferred_hours
        .iter()
        .take(3)
        .map(|(h, _)| format!("{:02}:00-{:02}:00", h, (h + 2) % 24))
        .collect();

    let old_profile = db.get_user_profile();

    UserProfile {
        preferred_work_hours,
        common_categories,
        productivity_patterns: patterns,
        insights: old_profile.insights,
        last_updated: now_str(),
        total_days_active,
        average_daily_focus,
    }
}

/// 检测行为模式
pub fn detect_patterns(tasks: &[TaskItem], records: &[TimeRecord]) -> Vec<BehaviorPattern> {
    let mut patterns = Vec::new();
    let now = now_str();

    // 1. 检测生产力高峰时段
    let mut hour_minutes: HashMap<i32, i64> = HashMap::new();
    for r in records {
        if let Some(ref start) = r.start_time {
            if let Some(hour_str) = start.split(':').next() {
                if let Ok(h) = hour_str.parse::<i32>() {
                    *hour_minutes.entry(h).or_default() += r.total_minutes as i64;
                }
            }
        }
    }
    if !hour_minutes.is_empty() {
        let mut sorted: Vec<(i32, i64)> = hour_minutes.into_iter().collect();
        sorted.sort_by(|a, b| b.1.cmp(&a.1));
        if let Some((peak_hour, peak_min)) = sorted.first() {
            if *peak_min > 60 {
                patterns.push(BehaviorPattern {
                    pattern_type: "peak_hours".into(),
                    description: format!("生产力高峰时段为 {:02}:00 左右", peak_hour),
                    confidence: 0.8,
                    detected_at: now.clone(),
                });
            }
        }
    }

    // 2. 检测拖延模式
    let procrastinated: Vec<&TaskItem> = tasks
        .iter()
        .filter(|t| {
            t.todo_date.is_some()
                && t.todo_status.as_deref() != Some("completed")
                && t.status == "active"
        })
        .collect();
    let procrastinated_count = procrastinated.len();
    if procrastinated_count >= 3 {
        patterns.push(BehaviorPattern {
            pattern_type: "procrastination".into(),
            description: format!("有 {} 项未完成待办积压", procrastinated_count),
            confidence: 0.7,
            detected_at: now.clone(),
        });
    }

    // 3. 检测分类趋势
    let mut cat_minutes: HashMap<String, i64> = HashMap::new();
    for r in records {
        *cat_minutes.entry(r.time_type.clone()).or_default() += r.total_minutes as i64;
    }
    let mut sorted_cats: Vec<(String, i64)> = cat_minutes.into_iter().collect();
    sorted_cats.sort_by(|a, b| b.1.cmp(&a.1));
    if let Some((top_type, top_min)) = sorted_cats.first() {
        if *top_min > 120 {
            patterns.push(BehaviorPattern {
                pattern_type: "category_trend".into(),
                description: format!("主要时间投入在「{}」，累计 {} 分钟", top_type, top_min),
                confidence: 0.9,
                detected_at: now.clone(),
            });
        }
    }

    patterns
}

/// 从对话中提取用户特征（Post-Conversation Extraction）
/// 使用 AI 分析对话内容，返回提取的洞察列表
pub async fn extract_from_conversation(
    settings: &ActivitySettings,
    history: &[ConversationMessage],
    user_message: &str,
    ai_reply: &str,
) -> Result<Vec<UserInsight>, String> {
    if settings.ai_api_key.is_empty() {
        return Ok(Vec::new());
    }

    // 只提取最近几轮对话
    let recent_history: Vec<&ConversationMessage> = history.iter().rev().take(6).collect::<Vec<_>>().into_iter().rev().collect();

    let mut dialogue = String::new();
    for m in &recent_history {
        let role = if m.role == "user" { "用户" } else { "AI" };
        dialogue.push_str(&format!("{}: {}\n", role, m.content));
    }
    dialogue.push_str(&format!("用户: {}\n", user_message));
    dialogue.push_str(&format!("AI: {}\n", ai_reply));

    let extraction_prompt = format!(
        r#"分析以下对话，提取关于用户的新特征。只提取确实能从对话中推断出的信息，不要编造。
返回 JSON 数组，每条包含：
- insight_type: "preference"(偏好) / "style"(沟通风格) / "expertise"(专业领域) / "pain_point"(痛点) / "observation"(观察) / "background"(背景)
- content: 具体内容（简洁描述）

如果没有可提取的特征，返回空数组 []。
只返回 JSON，不要其他文字。

对话内容：
{}"#,
        dialogue
    );

    let messages = vec![
        ConversationMessage {
            role: "system".into(),
            content: "你是一个用户特征提取助手。你的任务是分析对话内容，提取用户的偏好、风格、专业领域等特征。只返回 JSON 数组格式。".into(),
        },
        ConversationMessage {
            role: "user".into(),
            content: extraction_prompt,
        },
    ];

    let reply = crate::ai_service::call_ai_api_simple(settings, &messages).await?;

    // 解析 JSON 数组
    let cleaned = reply
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let parsed: serde_json::Value = match serde_json::from_str(cleaned) {
        Ok(v) => v,
        Err(_) => return Ok(Vec::new()), // 解析失败不报错，静默跳过
    };

    let mut insights = Vec::new();
    if let Some(arr) = parsed.as_array() {
        let now = now_str();
        for item in arr {
            let insight_type = item
                .get("insight_type")
                .and_then(|v| v.as_str())
                .unwrap_or("observation")
                .to_string();
            let content = item
                .get("content")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if !content.is_empty() {
                insights.push(UserInsight {
                    id: new_id(),
                    insight_type,
                    content,
                    source: "conversation_extract".into(),
                    created_at: now.clone(),
                });
            }
        }
    }

    Ok(insights)
}
