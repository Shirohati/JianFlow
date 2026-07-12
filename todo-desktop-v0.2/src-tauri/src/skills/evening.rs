use crate::models::SkillResponse;
use serde_json::Value;

pub fn evening_skill_prompt() -> String {
    r#"【晚间总结 Skill】

今日的完整数据（待办、活动监测、番茄钟、专注记录）已通过"当前页面数据"提供。

你的任务分两步：

=== 第一步：分析数据 → 生成针对性表单 ===

仔细分析数据，找出值得追问的点：

1. 待办完成率：完成/未完成比例。如果偏低，用户遇到了什么困难？
2. 活动监测：各分类时长分布（学习/编程/娱乐/浏览等）有无不合理之处？
3. 异常片段：例如安排了学习任务但有长时间娱乐活动、某时段无活动记录
4. 番茄钟/专注记录：专注总时长是否达标、中断次数
5. 生产力评分：如果偏低，可能的原因

基于分析结果，生成一个【FORM】收集用户反馈。
表单字段必须根据当日实际数据动态生成，禁止套用固定模板。

【FORM】中必须包含三个核心字段（可在此基础上增减）：
  - study_hours (type: number, label: "今天实际学习了几个小时？")
  - completion (type: select, label: "今日完成情况如何？")
  - mood (type: select, label: "今天整体状态如何？")

此外，根据数据特点添加针对性字段。例如：
  - 某时段活动监测为娱乐但安排了学习 → 问当时发生了什么
  - 完成率偏低 → 问卡在哪里
  - 番茄钟中断多 → 问干扰因素
  - 活动监测有大段空白 → 问在做什么
  - 有长时间的非学习活动 → 问原因

【FORM】标记必须是一行纯 JSON，不要有多余空格和换行。

=== 第二步：用户提交【FORM_DATA】后 ===

结合用户填写的表单数据和已有的监测数据，生成一份结构化的晚间报告。
报告应包括：
  - 今日概览（专注时长、完成率、总体评价）
  - 像日记一样，将用户的今日状态等等写清楚，方便用户复盘
  - 时间分配分析（各分类用时，是否有失衡）
  - 针对用户填写的困难/干扰给出具体建议
  - 明日的小建议（1-3条，具体可执行）

报告要有数据支撑，不能笼统。
"#.to_string()
}

pub fn process_evening_form(_data: &Value) -> Result<SkillResponse, String> {
    Ok(SkillResponse {
        message: "已收到，正在生成报告…".to_string(),
        form_schema: None,
        done: false,
    })
}

pub fn save_evening_report(date: &str, user_summary: &str, ai_data: Option<String>) -> crate::models::DailyReport {
    crate::models::DailyReport {
        date: date.to_string(),
        user_summary: user_summary.to_string(),
        ai_data,
        report_type: "daily".to_string(),
        created_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    }
}
