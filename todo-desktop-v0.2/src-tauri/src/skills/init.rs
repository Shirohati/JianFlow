use crate::models::SkillResponse;
use serde_json::Value;

/// 初始化问卷表单 schema（AI 用这个生成表单）
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

/// 处理初始化表单提交
pub fn process_init_form(data: &Value) -> Result<SkillResponse, String> {
    let identity = data.get("identity").and_then(|v| v.as_str()).unwrap_or("");
    let target = data.get("target").and_then(|v| v.as_str()).unwrap_or("");

    let _profile_json = serde_json::json!({
        "identity": identity,
        "target": target,
        "subjects": data.get("subjects").and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect::<Vec<_>>()).unwrap_or_default(),
        "progress": data.get("progress").and_then(|v| v.as_str()).unwrap_or(""),
        "materials": data.get("materials").and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect::<Vec<_>>()).unwrap_or_default(),
        "daily_hours": data.get("daily_hours").and_then(|v| v.as_f64()).unwrap_or(0.0),
        "weakness": data.get("weakness").and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect::<Vec<_>>()).unwrap_or_default(),
        "rest_days": data.get("rest_days").and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect::<Vec<_>>()).unwrap_or_default(),
        "extra": data.get("extra").and_then(|v| v.as_str()).unwrap_or("")
    });

    Ok(SkillResponse {
        message: format!(
            "已收到您的信息！\n\n**身份**：{}\n**目标**：{}\n\n画像已保存。现在我可以为您提供更有针对性的建议了。开始使用「晨间规划」或「晚间总结」功能吧。",
            identity, target
        ),
        form_schema: None,
        done: true,
    })
}

/// 获取初始化 prompt（供 AI 系统 prompt 使用）
pub fn init_skill_prompt() -> String {
    r#"【初始化 Skill — 必须严格遵循以下格式】

用户点击了初始化按钮，你需要生成一份可交互的问卷表单。

规则：
1. 你的回复必须包含【FORM】标记，格式如下：
   【FORM】{"title":"...","fields":[...]}【/FORM】
2. 表单必须包含 identity(文本)、target(文本)、subjects(标签)、daily_hours(数字) 这四个必填字段
3. 可选字段：progress(下拉)、materials(标签)、weakness(标签)、rest_days(标签)、extra(多行文本)
4. 【FORM】标记内必须是纯 JSON，不能有额外文字、换行、空格美化
5. 【FORM】标记前后可以写自然语言
6. 用户提交后表单数据会以【FORM_DATA】格式返回

必须输出的精确格式示例（照抄，只改字段值不要改结构）：
【FORM】{"title":"初始化问卷","fields":[{"key":"identity","label":"你的身份是？","type":"text","required":true},{"key":"target","label":"你的目标是什么？","type":"text","required":true},{"key":"subjects","label":"主要学习/工作科目","type":"tags","required":true},{"key":"daily_hours","label":"每日可投入时长（小时）","type":"number","required":true},{"key":"progress","label":"当前进度","type":"select","options":["尚未开始","初期","中期","冲刺阶段","持续进行中"]},{"key":"materials","label":"使用的教辅/课程/资料","type":"tags"},{"key":"weakness","label":"弱项/需要加强的方面","type":"tags"},{"key":"rest_days","label":"固定休息日","type":"tags"},{"key":"extra","label":"其他想告诉管家的话","type":"textarea"}]}【/FORM】

注意：中间必须是一行纯 JSON，没有多余空格和换行。严格按照这个格式输出。
"#.to_string()
}
