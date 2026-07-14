use crate::database::Database;
use serde_json::Value;

/// 初始化问卷表单 schema（固定结构，不依赖 AI 生成【FORM】标记）
pub fn init_form_schema() -> Value {
    serde_json::json!({
        "title": "初始化问卷",
        "fields": [
            {"key": "identity", "label": "你的身份是？（如：考研学生、程序员、自由职业）", "type": "text", "required": true},
            {"key": "target", "label": "你的目标是什么？（如：XX大学研究生、掌握Rust、减重10kg）", "type": "text", "required": true},
            {"key": "subjects", "label": "主要学习/工作科目", "type": "tags", "required": true},
            {"key": "progress", "label": "当前进度", "type": "select", "options": ["尚未开始", "初期", "中期", "冲刺阶段", "持续进行中"]},
            {"key": "materials", "label": "使用的教辅/课程/资料", "type": "tags"},
            {"key": "daily_hours", "label": "每日可投入时长（小时）", "type": "number", "required": true},
            {"key": "weakness", "label": "弱项/需要加强的方面", "type": "tags"},
            {"key": "rest_days", "label": "固定休息日", "type": "tags"},
            {"key": "extra", "label": "其他想告诉管家的话", "type": "textarea"}
        ]
    })
}

/// 将表单数据规范化后存入 user_profile_json
pub fn save_init_form(db: &Database, form_data: &Value) -> Result<(), String> {
    let profile_json = serde_json::json!({
        "identity": form_data.get("identity").and_then(|v| v.as_str()).unwrap_or(""),
        "target": form_data.get("target").and_then(|v| v.as_str()).unwrap_or(""),
        "subjects": form_data.get("subjects").and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect::<Vec<_>>()).unwrap_or_default(),
        "progress": form_data.get("progress").and_then(|v| v.as_str()).unwrap_or(""),
        "materials": form_data.get("materials").and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect::<Vec<_>>()).unwrap_or_default(),
        "daily_hours": form_data.get("daily_hours").and_then(|v| v.as_f64()).unwrap_or(0.0),
        "weakness": form_data.get("weakness").and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect::<Vec<_>>()).unwrap_or_default(),
        "rest_days": form_data.get("rest_days").and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect::<Vec<_>>()).unwrap_or_default(),
        "extra": form_data.get("extra").and_then(|v| v.as_str()).unwrap_or("")
    });
    db.update_user_profile_json(&profile_json.to_string());
    Ok(())
}
