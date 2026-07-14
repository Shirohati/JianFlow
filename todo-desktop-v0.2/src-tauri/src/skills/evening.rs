use crate::models::SkillDataContext;

pub fn build_prompt(ctx: &SkillDataContext) -> String {
    format!(r#"【晚间总结 Skill — 单次完成】

你是笺流管家，现在是晚上。当前日期：{current_date}。

== 你的任务 ==
分析用户今日的全部数据，生成一份结构化的晚间报告，并通过 `report_save` 工具直接保存到数据库。不要出"问题表单"让用户填写——基于现有数据直接生成报告。用户可以在报告中看到今日效率评估和明日建议。

== 数据上下文（JSON）==
{ctx_json}

== 工作流程 ==
1. 分析 today_tasks：完成率、未完成任务、有 schedule_start 但未完成的任务
2. 分析 activity_summary：各分类时长分布、总活跃时长、Top 应用
3. 分析 pomodoro_records：专注总时长、按 time_type 分组
4. 分析 user_profile_json：用户的目标、每日目标时长（daily_hours）是否达成
5. 分析 recent_reports：对比前几日的趋势
6. 分析 goals：每日/每周目标达成情况

== 工具调用要求 ==
- 使用 `report_save` 工具保存报告，参数：
  - date: "{current_date}"
  - user_summary: <markdown 格式的报告正文，给用户看>
  - ai_data: <JSON 字符串，包含结构化数据：focus_minutes / todo_completion_rate / activity_breakdown / productivity_score 等，给 AI 后续读取>
  - report_type: "daily"

== 报告内容要求 ==
报告（user_summary）应包含：
1. **今日概览**：专注时长、待办完成率、总体评价（一句话）
2. **时间分配分析**：各分类时长占比，是否有失衡
3. **效率评估**：结合番茄钟和活动监测，评估专注水平
4. **问题诊断**：如有未完成任务、长时间娱乐活动、专注不连续等，指出具体问题
5. **明日建议**：1-3 条具体可执行的建议（基于今日数据，不要泛泛而谈）

报告要像日记一样，将用户的今日状态写清楚，方便复盘。有数据支撑，不能笼统。

== 输出格式 ==
1. 先调用 `report_save` 工具保存报告
2. 然后向用户展示报告正文（markdown）作为最终回复"#,
        current_date = ctx.current_date,
        ctx_json = serde_json::to_string_pretty(ctx).unwrap_or_default()
    )
}
