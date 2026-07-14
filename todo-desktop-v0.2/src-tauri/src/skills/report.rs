use crate::models::SkillDataContext;

pub fn build_prompt(ctx: &SkillDataContext, date_range_text: &str) -> String {
    format!(r#"【周报/月报 Skill — 单次完成】

你是笺流管家，用户希望生成一份周期总结报告。

== 用户输入的时间范围 ==
{date_range_text}

== 数据上下文（JSON）==
{ctx_json}

== 你的任务 ==
1. 根据用户输入的时间范围（"{date_range_text}"），结合 ctx.current_date（{current_date}），自行计算起止日期
   - "这周"：本周一到今天
   - "上周"：上周一到上周日
   - "这个月"：本月 1 号到今天
   - "上个月"：上月 1 号到上月最后一天
   - "最近 N 天"：今天往前推 N 天
   - "X月Y号到X月Z号"：按字面解析
2. 从 recent_reports 中筛出该日期范围内的报告
3. 如果 recent_reports 不够覆盖范围，可以用 ctx 中的其他数据补充
4. 生成一份结构化的周期总结报告
5. 通过 `report_save` 工具保存：
   - date: 用今天日期 "{current_date}"
   - user_summary: <markdown 报告正文>
   - ai_data: <JSON 字符串，包含 total_focus_minutes / avg_daily_focus / completion_rate / category_breakdown 等>
   - report_type: "weekly" 或 "monthly" 或 "custom"（根据用户输入判断）

== 报告内容要求 ==
1. **周期概览**：总专注时长、平均每日专注、待办总完成率
2. **趋势分析**：与前一个周期对比（如有 recent_reports 数据）
3. **分类时间分配**：各学习/工作分类的时长占比
4. **主要问题**：列出 2-3 个值得改进的点
5. **进步与亮点**：列出 2-3 个值得保持的点
6. **下个周期建议**：1-3 条具体建议

== 输出格式 ==
1. 先调用 `report_save` 工具保存报告
2. 然后向用户展示报告正文（markdown）作为最终回复"#,
        date_range_text = date_range_text,
        ctx_json = serde_json::to_string_pretty(ctx).unwrap_or_default(),
        current_date = ctx.current_date
    )
}
