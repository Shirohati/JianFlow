use crate::models::SkillResponse;
use serde_json::Value;

pub fn morning_skill_prompt() -> String {
    r#"【晨间规划 Skill】

今日/昨日待办、用户画像（身份/目标/进度）、目标板路线图、活动习惯数据已通过"当前页面数据"提供。

你的任务：在单次回复中完成全部规划，不要分多轮对话。

=== 第一步：分析数据 ===

1. 查看今日已有待办，是否有昨日未完成需优先处理的
2. 查看今日时间轴（有 schedule_start 的任务），了解今日已有安排
3. 参考用户画像中的身份、目标、偏好时段
4. 参考目标板路线图（如二轮复习计划）

=== 第二步：生成完整规划（文字方案） ===

输出完整的今日执行计划，包含优先任务、时间段建议、重点内容建议。

=== 第三步：附加确认表单 ===

在方案下方附加【FORM】确认表单：
【FORM】{"title":"确认今日计划","fields":[{"key":"action","label":"是否执行以上计划？","type":"select","options":["确认执行","需要调整"]}]}【/FORM】

如果用户选择"需要调整"，继续对话修改。
如果用户选择"确认执行"，使用 task_create 或 task_batch_create 创建真实时间轴数据。

=== 重要：时间轴字段说明 ===

时间轴是笺流首页右侧的纵向日程栏（06:00-22:00 纵向刻度，每格=36px）。
要让任务出现在时间轴上，创建任务时必须设置以下字段：

  - schedule_start（必填）：开始时间，格式 "HH:MM"，如 "09:00"
  - schedule_end（可选）：结束时间，格式 "HH:MM"，如 "10:30"
  - todo_date：今天的日期 "YYYY-MM-DD"
  - category_id：分类ID，决定时间块的颜色
  - title：任务标题

不设置 schedule_start 的任务不会出现在时间轴上。

对于学习/工作类任务，用常规 task_create：
  【TOOL】{"tool":"task_create","args":{"title":"数学《880》高数","category_id":"cat_study","todo_date":"2026-07-12","schedule_start":"09:00","schedule_end":"10:30"}}【/TOOL】

对于休息/用餐等纯时间块，也用 task_create，type 设为 "note"：
  【TOOL】{"tool":"task_create","args":{"title":"午休","type":"note","category_id":"cat_default","todo_date":"2026-07-12","schedule_start":"12:00","schedule_end":"13:00"}}【/TOOL】

用户可以在一句话中同时插入多个工具调用，依次执行。
"#.to_string()
}

pub fn process_morning_form(data: &Value) -> Result<SkillResponse, String> {
    let confirmed = data.get("action").and_then(|v| v.as_str()).unwrap_or("");
    if confirmed == "确认执行" {
        Ok(SkillResponse {
            message: "计划已确认，正在创建待办…".to_string(),
            form_schema: None,
            done: true,
        })
    } else {
        Ok(SkillResponse {
            message: "好的，请告诉我需要调整哪些部分？".to_string(),
            form_schema: None,
            done: false,
        })
    }
}
