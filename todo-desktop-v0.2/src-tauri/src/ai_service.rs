use crate::models::{ActivitySettings, ActivitySummary, AiToolCall, ConversationMessage, ProductivityScore};
use futures_util::StreamExt;

pub fn domain_context_prompt() -> String {
    r#"== 笺流应用数据说明 ==

笺流是一款个人生产力 + 学习追踪应用，核心功能如下：

【统一数据模型 TaskItem】
待办和便签共用同一张 tasks 表，靠字段区分：
- 每日待办：grid_x IS NULL 且 grid_y IS NULL（出现在首页每日列表）
- 看板便签：grid_x NOT NULL 且 grid_y NOT NULL 且 sub_type != 'task'（出现在目标板画布）
- 看板子任务：grid_x NOT NULL 且 grid_y NOT NULL 且 sub_type == 'task'（挂靠在父便签下）

status 字段：'active'(活跃) / 'done'(已完成) / 'completed'(已完成混用)
todo_status 字段：仅待办有，'pending'(待办) / 'completed'(当日已完成)
todo_date：待办分配日期 YYYY-MM-DD
deadline：截止日期 YYYY-MM-DD，用于截止提醒
priority：优先级（0=最低）
category_id：分类 ID（cat_default=其他、cat_study=学习、cat_work=工作、cat_reading=阅读、cat_exercise=运动）
recurrence：重复规则 'daily'/'weekly'/'monthly'，用于定期生成新待办
note：便签正文或待办备注（markdown 格式）
parent_id：看板子任务指向父便签；重复子任务指向模板
board_tab：便签标签页名（目标板多 tab）
group_id：便签分组 ID（目标板分组折叠）
collapsed：分组是否折叠

【分类 Category】
每个待办有一个 category_id，对应分类的 id。

【时长记录 TimeRecord】
番茄钟完成或手动导入的学习时长记录，含 date + time_type（类型名）+ total_minutes。
source='import' 为手动导入，source='' 为番茄钟自动记录。

【番茄钟 Pomodoro】
预设（PomodoroPreset）定义 mode（countdown/stopwatch）和 duration_minutes。
番茄钟完成后自动生成 TimeRecord。

【学习目标 Goal】
goal_type='daily' 或 'weekly'，target_minutes 为每日/每周目标分钟数。

【倒计时 Countdown】
有 target_date 的事件，用于倒计时显示。

【连接线 Connection】
from_id → to_id 有向连接，用于目标板便签间的思维导图式连接。

【活动监测 Activity】
后台自动监测用户电脑使用情况，记录每个窗口的进程名、分类、时长。
分类规则（CategoryRule）将进程/窗口标题映射到：学习/编程/浏览/社交/娱乐/其他。

【AI 长期记忆 Memory】
用户明确要求记住的信息（key + content），需要用户主动要求才使用 memory_save。

【对话记录 Conversation】
每次 AI 对话自动保存到会话记录，可通过 conversation_id 切换历史对话。

【格言 Quotes】
用户自定的格言列表，以 JSON 字符串数组形式存在 settings.quotes 中。

== 核心使用场景 ==
- 每天在首页管理待办（增删改查、标记完成、分配日期）
- 在目标板用便签做思维导图式规划（便签+连接线+分组）
- 用番茄钟计时专注学习，自动记录时长
- 活动监测自动记录电脑使用情况，生成生产力报告
- AI 管家辅助分析数据、执行操作、给出建议"#.to_string()
}

pub fn default_chat_system_prompt(page: &str) -> String {
    match page {
        "home" => "你是笺流 AI 管家，用户当前在首页（每日待办页）。\
用户可以在这里查看和管理每日待办、写日志、查看学习概览。\
你可以回答关于待办事项、每日计划、学习统计的问题。\
如果用户要求操作待办（创建、修改、完成、删除），请用工具调用格式回复。\
请使用中文，简洁有温度。".to_string(),
        "board" => "你是笺流 AI 管家，用户当前在目标板（看板/便签页）。\
用户在这里用便签做思维导图式规划，便签可以连接、分组、折叠。\
你可以回答关于便签、目标、连接线的问题。\
如果用户要求操作便签，请用工具调用格式回复。\
请使用中文，简洁有温度。".to_string(),
        "report" | "daily-report" => "你是笺流 AI 管家，用户当前在报告页。\
用户可以查看学习时长统计报表和活动监测日报。\
你可以根据活动数据和生产力评分进行分析和建议。\
请使用中文，简洁有温度。".to_string(),
        "pomodoro" => "你是笺流 AI 管家，用户当前在番茄钟页。\
用户在这里用番茄钟计时专注学习，查看学习目标进度。\
你可以回答关于番茄钟、时间记录、专注情况的问题。\
请使用中文，简洁有温度。".to_string(),
        "calendar" => "你是笺流 AI 管家，用户当前在日历页。\
用户可以查看日历上有学习记录的日子。\
你可以回答关于日程、日期相关记录的问题。\
请使用中文，简洁有温度。".to_string(),
        "settings" => "你是笺流 AI 管家，用户当前在设置页。\
用户可以配置外观、分类、番茄钟、目标、AI 参数、活动监测、提醒等。\
你可以回答关于应用配置、数据管理的问题。\
如果用户要求修改设置，请用工具调用格式回复。\
请使用中文，简洁有温度。".to_string(),
        _ => "你是笺流 AI 管家，一个智能生产力助手。\
你可以回答关于待办、便签、时间管理、数据分析的问题。\
如果用户要求执行操作，请用工具调用格式回复。\
请使用中文，简洁有温度。".to_string(),
    }
}

async fn call_ai_api(settings: &ActivitySettings, messages: &[ConversationMessage]) -> Result<String, String> {
    if settings.ai_api_key.is_empty() {
        return Err("未配置 API Key".to_string());
    }
    let base_url = if settings.ai_api_base_url.is_empty() {
        "https://api.openai.com/v1".to_string()
    } else {
        settings.ai_api_base_url.trim_end_matches('/').to_string()
    };
    let url = format!("{}/chat/completions", base_url);
    let model = if settings.ai_model.is_empty() {
        "gpt-4o-mini".to_string()
    } else {
        settings.ai_model.clone()
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let req_messages: Vec<serde_json::Value> = messages.iter().map(|m| {
        serde_json::json!({"role": m.role, "content": m.content})
    }).collect();

    let body = serde_json::json!({
        "model": model,
        "messages": req_messages,
        "temperature": 0.7,
        "max_tokens": 2048,
    });

    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", settings.ai_api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("请求 AI API 失败: {}", e))?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| format!("读取响应失败: {}", e))?;
    if !status.is_success() {
        return Err(format!("AI API 返回错误 {}: {}", status, text));
    }

    let v: serde_json::Value = serde_json::from_str(&text).map_err(|e| format!("解析响应 JSON 失败: {}", e))?;
    v.get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "响应中缺少 choices[0].message.content".to_string())
}

/// 通用对话：支持多轮 + 页面上下文
pub async fn chat(
    settings: &ActivitySettings,
    history: &[ConversationMessage],
    message: &str,
    page: &str,
    page_data: Option<&str>,
) -> Result<String, String> {
    let messages = build_messages(settings, history, message, page, page_data, false);
    call_ai_api(settings, &messages).await
}

/// 支持工具调用的对话
pub async fn chat_with_tools(
    settings: &ActivitySettings,
    history: &[ConversationMessage],
    message: &str,
    page: &str,
    page_data: Option<&str>,
) -> Result<String, String> {
    let messages = build_messages(settings, history, message, page, page_data, true);
    call_ai_api(settings, &messages).await
}

pub fn build_messages(
    settings: &ActivitySettings,
    history: &[ConversationMessage],
    message: &str,
    page: &str,
    page_data: Option<&str>,
    enable_tools: bool,
) -> Vec<ConversationMessage> {
    let system_prompt = default_chat_system_prompt(page);
    let mut messages = Vec::new();

    messages.push(ConversationMessage { role: "system".into(), content: system_prompt });

    // 注入项目数据说明，让 AI 理解业务语义
    messages.push(ConversationMessage { role: "system".into(), content: domain_context_prompt() });

    if enable_tools {
        messages.push(ConversationMessage { role: "system".into(), content: tool_system_prompt() });
    }

    if let Some(data) = page_data {
        if !data.is_empty() {
            messages.push(ConversationMessage {
                role: "system".into(),
                content: format!("当前页面数据：\n{}", data),
            });
        }
    }

    if !settings.ai_system_prompt.is_empty() {
        messages.push(ConversationMessage { role: "system".into(), content: settings.ai_system_prompt.clone() });
    }

    messages.extend_from_slice(history);
    messages.push(ConversationMessage { role: "user".into(), content: message.to_string() });
    messages
}

/// AI 生产力评分
pub async fn ai_score(
    settings: &ActivitySettings,
    summary: &ActivitySummary,
    pomo_minutes: i32,
    todo_total: i32,
    todo_completed: i32,
    streak: i32,
    date: &str,
) -> Result<Option<ProductivityScore>, String> {
    if settings.ai_api_key.is_empty() {
        return Ok(None);
    }

    let cats: Vec<String> = summary.category_breakdown.iter()
        .map(|(k, v)| format!("- {}: {} 分钟", k, v / 60)).collect();
    let apps: Vec<String> = summary.top_apps.iter().take(5)
        .map(|a| format!("- {}（{}）：{} 分钟", a.name, a.category, a.seconds / 60)).collect();

    let payload = format!(
        "请为以下用户今日数据给出生产力评分（0-100），\
        并给出等级（优秀/良好/中等/待改进）和简要分析。\
        以 JSON 格式返回：{{ \"score\": 数字, \"level\": \"等级\", \"analysis\": \"分析文字\" }}\n\n\
        日期：{}\n总活跃：{} 分钟\n分类：\n{}\nTop 应用：\n{}\n\
        番茄钟专注：{} 分钟\n待办完成：{}/{}\n连续学习天数：{}",
        date, summary.total_active_seconds / 60,
        cats.join("\n"), apps.join("\n"),
        pomo_minutes, todo_completed, todo_total, streak
    );

    let messages = vec![
        ConversationMessage {
            role: "system".into(),
            content: "你是一个严格但公正的生产力评分专家。根据用户的活动数据、番茄钟使用、\
            待办完成情况和连续学习天数，给出 0-100 分的生产力评分。\
            评分标准：90+ 优秀（高效专注），75-89 良好（基本达标），\
            60-74 中等（有提升空间），<60 待改进。只需返回 JSON，不要其他文字。".to_string()
        },
        ConversationMessage { role: "user".into(), content: payload },
    ];

    let reply = call_ai_api(settings, &messages).await?;

    let cleaned = reply.trim_start_matches("```json").trim_start_matches("```").trim_end_matches("```").trim();
    let parsed: serde_json::Value = serde_json::from_str(cleaned)
        .map_err(|_| format!("AI 返回格式异常: {}", reply))?;

    let score = parsed.get("score").and_then(|v| v.as_i64()).unwrap_or(50) as i32;
    let level = parsed.get("level").and_then(|v| v.as_str()).unwrap_or("中等").to_string();
    let analysis = parsed.get("analysis").and_then(|v| v.as_str()).map(|s| s.to_string());

    Ok(Some(ProductivityScore {
        score: score.min(100).max(0),
        level,
        focus_score: 0,
        pomo_score: 0,
        todo_score: 0,
        consistency_score: 0,
        analysis,
    }))
}

/// 调用 AI 生成每日报告
pub async fn generate_report(
    settings: &ActivitySettings,
    summary: &ActivitySummary,
    pomo_minutes: i32,
    todo_total: i32,
    todo_completed: i32,
    date: &str,
) -> Result<String, String> {
    let default_prompt = "你是一个生产力分析助手。请根据用户当天的活动数据\
        生成一份结构化的中文 markdown 报告，包含以下部分：\n\
        1. **概览**：总活跃时长、专注情况一句话总结\n\
        2. **时间分配分析**：各分类时长占比与简要点评\n\
        3. **专注度评估**：结合番茄钟与专注类活动时长评估专注水平\n\
        4. **改进建议**：给出 2-3 条具体可行的改进建议\n\n\
        要求语言简洁、有洞察力，避免空话。".to_string();

    let prompt = if settings.ai_system_prompt.is_empty() {
        default_prompt
    } else {
        settings.ai_system_prompt.clone()
    };

    let cats: Vec<String> = summary.category_breakdown.iter()
        .map(|(k, v)| format!("- {}: {} 分钟", k, v / 60)).collect();
    let payload = if settings.ai_strict_mode {
        format!("日期：{}\n总活跃时长：{} 分钟\n\n分类时长：\n{}\n\n番茄钟：{} 分钟\n待办完成：{}/{}",
            date, summary.total_active_seconds / 60, cats.join("\n"),
            pomo_minutes, todo_completed, todo_total)
    } else {
        let apps: Vec<String> = summary.top_apps.iter()
            .map(|a| format!("- {}（{}）：{} 分钟", a.name, a.category, a.seconds / 60)).collect();
        format!("日期：{}\n总活跃时长：{} 分钟\n\n分类时长：\n{}\n\nTop 应用：\n{}\n\n番茄钟：{} 分钟\n待办完成：{}/{}",
            date, summary.total_active_seconds / 60, cats.join("\n"), apps.join("\n"),
            pomo_minutes, todo_completed, todo_total)
    };

    let messages = vec![
        ConversationMessage { role: "system".into(), content: prompt },
        ConversationMessage { role: "user".into(), content: payload },
    ];

    call_ai_api(settings, &messages).await
}

/// 测试 AI 连接
pub async fn test_connection(settings: &ActivitySettings) -> Result<String, String> {
    let messages = vec![
        ConversationMessage { role: "user".into(), content: "请回复：连接成功".to_string() }
    ];
    call_ai_api(settings, &messages).await
}

/// 工具调用系统提示
pub fn tool_system_prompt() -> String {
    r#"你有能力执行以下操作。当用户要求执行操作时，请在你的回复中插入工具调用。
工具调用格式（JSON 放在一对特殊标记中）：

【TOOL】{"tool": "<工具名>", "args": {}}【/TOOL】

重要：你可以在一句话中同时插入多个工具调用，会依次执行。

数据语义说明：
- todo_date：待办分配在哪一天（YYYY-MM-DD），表示这条待办属于该日
- deadline：截止日期（YYYY-MM-DD），过期会有通知提醒
- status：全局状态 'active'(进行中) / 'done'(已完成)
- todo_status：每日完成状态 'pending'(待办) / 'completed'(当日已完成)
- category_id：分类ID，常见值: cat_default(其他) cat_study(学习) cat_work(工作) cat_reading(阅读) cat_exercise(运动)
- priority：优先级（数值越大越优先，0=未设置）
- note：便签正文或待办备注（支持 markdown 格式）
- grid_x/grid_y：看板便签在画布上的坐标位置（有坐标=便签，无坐标=每日待办）
- sub_type='task'：看板上的子任务（挂靠在父便签下）
- board_tab：看板标签页名
- group_id：看板分组ID，用于将多个便签分在一组
- recurrence：重复规则 'daily'/'weekly'/'monthly'，会定期生成新待办

支持的工具有：

=== 待办操作（grid_x/grid_y 为空的条目）===

1. task_list — 按条件列出待办
    参数: status (可选: "active","done"), todo_date (可选, 如 "2026-07-11"),
          category_id (可选), keyword (可选, 标题关键词)
    示例: 【TOOL】{"tool":"task_list","args":{"todo_date":"2026-07-11"}}【/TOOL】
    说明: 不传任何参数则列出所有待办。返回每个任务的 id/title/status/todo_date/deadline。

2. task_get — 查看待办详情
    参数: id (必填)
    示例: 【TOOL】{"tool":"task_get","args":{"id":"xxx"}}【/TOOL】
    说明: 返回完整待办信息，包括 title/status/category_id/priority/todo_date/deadline/note/content。

3. task_create — 创建待办
    参数: title (必填), category_id (可选, 默认 cat_default), priority (可选, 默认0),
          deadline (可选, 格式 YYYY-MM-DD), note (可选, markdown备注),
          todo_date (可选, 格式 YYYY-MM-DD, 默认今天)
    示例: 【TOOL】{"tool":"task_create","args":{"title":"读《原子习惯》第3章","category_id":"cat_reading","priority":2,"todo_date":"2026-07-11"}}【/TOOL】

4. task_update — 修改待办
    参数: id (必填), 可改 title/status/priority/deadline/note/category_id/todo_date
    示例: 【TOOL】{"tool":"task_update","args":{"id":"xxx","title":"新标题"}}【/TOOL】

5. task_complete — 完成待办
    参数: id (必填)
    说明: 将待办标记为已完成，设置 status='done' 和 completed_at。
    示例: 【TOOL】{"tool":"task_complete","args":{"id":"xxx"}}【/TOOL】

6. task_delete — 删除待办
    参数: id (必填)
    示例: 【TOOL】{"tool":"task_delete","args":{"id":"xxx"}}【/TOOL】

=== 目标设置 ===

7. goal_set — 设置学习目标
    参数: goal_type ("daily" 或 "weekly"), target_minutes (数字, 每日/每周目标分钟数)
    说明: daily 目标示例：每天学120分钟。weekly 目标示例：每周学600分钟。
    示例: 【TOOL】{"tool":"goal_set","args":{"goal_type":"daily","target_minutes":180}}【/TOOL】

=== 目标板便签操作（grid_x/grid_y 不为空的条目）===

8. note_create — 创建便签
    参数: title (必填, 便签标题), note (可选, 便签正文), board_tab (可选, 所属标签页),
          grid_x/grid_y (可选, 画布位置坐标, 网格单位)
    说明: 便签放在看板画布上，每个便签有位置和可选正文。
    示例: 【TOOL】{"tool":"note_create","args":{"title":"Q3学习计划","note":"重点：算法和英语","board_tab":"学习"}}【/TOOL】

9. note_update — 修改便签
    参数: id (必填), 可改 title/note/board_tab/grid_x/grid_y/note_width/note_height
    示例: 【TOOL】{"tool":"note_update","args":{"id":"xxx","note":"新内容"}}【/TOOL】

10. note_delete — 删除便签
    参数: id (必填)
    示例: 【TOOL】{"tool":"note_delete","args":{"id":"xxx"}}【/TOOL】

11. connection_create — 创建便签间的连接线
    参数: from_id (必填, 起点便签ID), to_id (必填, 终点便签ID)
    说明: 连接线表示两个便签之间的关联关系（有向），类似思维导图。
    示例: 【TOOL】{"tool":"connection_create","args":{"from_id":"id1","to_id":"id2"}}【/TOOL】

12. connection_delete — 删除连接线
    参数: from_id (必填), to_id (必填)
    示例: 【TOOL】{"tool":"connection_delete","args":{"from_id":"id1","to_id":"id2"}}【/TOOL】

=== 长期记忆 ===

13. memory_search — 搜索关于用户的信息
    参数: keyword (必填), 搜索关键词
    说明: 当用户问「你还记得我之前说的吗」或需要回忆以前聊过的内容时，用此工具查找。
    示例: 【TOOL】{"tool":"memory_search","args":{"keyword":"学习计划"}}【/TOOL】

14. memory_save — 记住用户告诉你的重要信息（只在用户明确要求时使用）
    参数: key (必填, 简短标签), content (必填, 内容)
    说明: 只有用户说「记住这个」或明确要求你记住时才用。不要自作主张。
    示例: 【TOOL】{"tool":"memory_save","args":{"key":"学习目标","content":"用户目标是每天学习4小时"}}【/TOOL】

15. memory_list — 列出所有的记忆
    参数: 无
    示例: 【TOOL】{"tool":"memory_list","args":{}}【/TOOL】

16. memory_delete — 删除记忆
    参数: id (必填)
    示例: 【TOOL】{"tool":"memory_delete","args":{"id":"xxx"}}【/TOOL】

使用建议：
- 用户问「今天有哪些待办」→ 用 task_list({todo_date: "今天日期"}) 列出所有今天的待办
- 用户问「昨天的完成情况」→ 用 task_list({todo_date: "昨天日期", status: "done"})
- 用户问「我有哪些学习任务」→ 用 task_list({category_id: "cat_study"})
- 用户要求操作某个待办 → 先用 task_list 或 task_get 找到 id，再执行操作
- 用户问「今天有什么截止」→ 用 task_list 获取今天待办，检查 deadline 字段
- 用户问「我的番茄钟目标」→ 用 goal_set 查看或修改每日/每周目标
- 用户问「你能记住吗」→ 如果涉及保存信息用 memory_save，查找已存信息用 memory_search

执行完工具后会告知你结果，请根据结果向用户做最终回复。
如果用户没有要求操作，正常对话即可，不要插入工具调用。"#.to_string()
}

/// 从 AI 回复中解析出工具调用
pub fn parse_tool_calls(reply: &str) -> Vec<AiToolCall> {
    use crate::models::AiToolCall;
    let mut calls = Vec::new();
    let mut pos = 0;
    let start_tag = "【TOOL】";
    let end_tag = "【/TOOL】";
    while let Some(start) = reply[pos..].find(start_tag) {
        let abs_start = pos + start + start_tag.len();
        if let Some(end) = reply[abs_start..].find(end_tag) {
            let json_str = &reply[abs_start..abs_start + end];
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(json_str) {
                let tool = v.get("tool").and_then(|t| t.as_str()).unwrap_or("").to_string();
                let args = v.get("args").cloned().unwrap_or(serde_json::Value::Null);
                calls.push(AiToolCall { tool, args });
            }
            pos = abs_start + end + end_tag.len();
        } else {
            break;
        }
    }
    calls
}

/// 流式 AI 对话，通过回调逐段发送 token 和 reasoning
pub async fn call_ai_api_stream<F1, F2>(
    settings: &ActivitySettings,
    messages: &[ConversationMessage],
    on_token: F1,
    on_reasoning: F2,
) -> Result<String, String>
where
    F1: Fn(&str) + Send + Sync,
    F2: Fn(&str) + Send + Sync,
{
    if settings.ai_api_key.is_empty() {
        return Err("未配置 API Key".to_string());
    }
    let base_url = if settings.ai_api_base_url.is_empty() {
        "https://api.openai.com/v1".to_string()
    } else {
        settings.ai_api_base_url.trim_end_matches('/').to_string()
    };
    let url = format!("{}/chat/completions", base_url);
    let model = if settings.ai_model.is_empty() {
        "gpt-4o-mini".to_string()
    } else {
        settings.ai_model.clone()
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let req_messages: Vec<serde_json::Value> = messages.iter().map(|m| {
        serde_json::json!({"role": m.role, "content": m.content})
    }).collect();

    let body = serde_json::json!({
        "model": model,
        "messages": req_messages,
        "temperature": 0.7,
        "max_tokens": 4096,
        "stream": true,
    });

    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", settings.ai_api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("请求 AI API 失败: {}", e))?;

    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.map_err(|e| format!("读取响应失败: {}", e))?;
        return Err(format!("AI API 返回错误 {}: {}", status, text));
    }

    let mut full_content = String::new();
    let mut stream = resp.bytes_stream();

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("读取流失败: {}", e))?;
        let text = String::from_utf8_lossy(&chunk);

        for line in text.lines() {
            let line = line.trim();
            if !line.starts_with("data: ") {
                continue;
            }
            let data = &line[6..];
            if data == "[DONE]" {
                break;
            }
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(data) {
                if let Some(choices) = v.get("choices").and_then(|c| c.as_array()) {
                    if let Some(choice) = choices.first() {
                        if let Some(delta) = choice.get("delta") {
                            if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
                                full_content.push_str(content);
                                on_token(content);
                            }
                            if let Some(reasoning) = delta.get("reasoning_content").and_then(|c| c.as_str()) {
                                on_reasoning(reasoning);
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(full_content)
}

/// 降级模板
pub fn template_summary(summary: &ActivitySummary, pomo_minutes: i32, todo_total: i32, todo_completed: i32, date: &str) -> String {
    let total_min = summary.total_active_seconds / 60;
    let hours = total_min / 60;
    let mins = total_min % 60;

    let mut cats: Vec<(String, i64)> = summary.category_breakdown.iter().map(|(k, v)| (k.clone(), *v)).collect();
    cats.sort_by(|a, b| b.1.cmp(&a.1));

    let mut lines = Vec::new();
    lines.push(format!("# {} 每日总结", date));
    lines.push(String::new());
    lines.push(format!("## 概览\n\n总活跃时长 **{} 小时 {} 分钟**（{} 分钟），番茄钟专注 {} 分钟，待办完成 {}/{}。", hours, mins, total_min, pomo_minutes, todo_completed, todo_total));
    lines.push(String::new());
    lines.push("## 时间分配".to_string());
    for (cat, sec) in &cats {
        let pct = if total_min > 0 { (*sec as f64 / (total_min as f64 * 60.0) * 100.0) as i64 } else { 0 };
        lines.push(format!("- **{}**：{} 分钟（{}%）", cat, *sec / 60, pct));
    }
    lines.push(String::new());
    if !summary.top_apps.is_empty() {
        lines.push("## Top 应用".to_string());
        for app in summary.top_apps.iter().take(5) {
            lines.push(format!("- {}（{}）：{} 分钟", app.name, app.category, app.seconds / 60));
        }
        lines.push(String::new());
    }
    lines.push("> 配置 AI API 可获得更智能的分析报告。".to_string());
    lines.join("\n")
}
