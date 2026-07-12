use crate::models::SkillResponse;
use serde_json::Value;

pub fn report_skill_prompt() -> String {
    r#"【周报/月报 Skill】

=== 第一步：确认日期范围 ===

主动询问用户想要总结的时间段（如"你想总结哪段时间？"）。
可能答案："这周"、"上个月"、"7月1号到7月10号"等。
根据当前日期自行计算起止日期（YYYY-MM-DD 格式）。

=== 第二步：生成报告 ===

自行计算出日期范围后，使用 report_list 工具读取该范围内的报告数据。
分析报告数据，提取：
  - 总体趋势（专注时长变化、完成率）
  - 各分类的时间分配
  - 主要问题和进步
  - 对比前一周/月的改善情况

生成一份结构化的周期总结报告。

=== 第三步：确认并保存 ===

在报告下方附加【FORM】确认表单：

【FORM】{"title":"报告确认","fields":[{"key":"confirmed","label":"是否确认这份报告？","type":"select","options":["确认","需要修改"]}]}【/FORM】

如果用户选择"需要修改"，继续对话调整。
如果用户选择"确认"，将报告保存到数据库（用工具调用保存）。

当前日期可以通过"当前页面数据"获取。
注意：日期范围由你自行计算，不要问用户具体的起止日期格式。
"#.to_string()
}

pub fn process_report_form(_data: &Value) -> Result<SkillResponse, String> {
    Ok(SkillResponse {
        message: "正在生成报告…".to_string(),
        form_schema: None,
        done: false,
    })
}

pub fn save_report(date: &str, user_summary: &str, ai_data: Option<String>, report_type: &str) -> crate::models::DailyReport {
    crate::models::DailyReport {
        date: date.to_string(),
        user_summary: user_summary.to_string(),
        ai_data,
        report_type: report_type.to_string(),
        created_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    }
}
