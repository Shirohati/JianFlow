use crate::ai_router::{ComplexityClassifier, ModelRouter, TaskComplexity};
use crate::models::{ActivitySettings, ActivitySummary, AiPersona, AiToolCall, ConversationMessage, ProductivityScore, UserProfile};
use futures_util::StreamExt;

pub fn domain_context_prompt() -> String {
    r#"笺流数据模型：
- TaskItem（统一表）：待办(grid_x=null) / 便签(grid_x!=null) / 子任务(sub_type='task')
- status: active/done | todo_status(仅待办): pending/completed
- todo_date=分配日 | deadline=截止 | priority=0最低
- category_id: cat_default/study/work/reading/exercise
- recurrence: daily/weekly/monthly
- note=markdown正文 | board_tab=标签页 | group_id=分组 | parent_id=父子关系
- Connection: from_id→to_id 有向连线
- Goal: daily/weekly + target_minutes
- TimeRecord: date+type+total_minutes（番茄钟或手动导入）
- Activity: 后台监测窗口分类/时长
- Memory: key+content（用户要求才保存）
- Conversation: 自动保存对话历史"#.to_string()
}

/// 内置人设列表
pub fn builtin_personas() -> Vec<AiPersona> {
    vec![
        AiPersona {
            id: "persona_default".into(),
            name: "默认管家".into(),
            description: "笺流 AI 管家，专业、友好、高效".into(),
            greeting: "你好！我是笺流 AI 管家，可以帮你：".into(),
            is_builtin: true,
            system_prompt: DEFAULT_PERSONA_PROMPT.to_string(),
        },
        AiPersona {
            id: "persona_ling".into(),
            name: "泠".into(),
            description: "三无属性的女仆管家，冷淡外表下藏着忠诚与温柔".into(),
            greeting: "泠，听候差遣。".into(),
            is_builtin: true,
            system_prompt: LING_PERSONA_PROMPT.to_string(),
        },
    ]
}

/// 根据 ID 获取人设
pub fn get_persona(persona_id: &str) -> Option<AiPersona> {
    builtin_personas().into_iter().find(|p| p.id == persona_id)
}

/// 获取页面上下文描述（供人设模式下使用）
pub fn get_page_context(page: &str) -> &str {
    match page {
        "home" => "用户当前在首页（每日待办页），可以查看和管理每日待办、写日志、查看学习概览。",
        "board" => "用户当前在目标板（看板/便签页），用便签做思维导图式规划。",
        "report" | "daily-report" => "用户当前在报告页，查看学习统计和活动监测日报。",
        "pomodoro" => "用户当前在番茄钟页，进行番茄钟计时和查看学习目标。",
        "calendar" => "用户当前在日历页，查看有学习记录的日子。",
        "settings" => "用户当前在设置页，配置应用各项参数。",
        _ => "",
    }
}

const DEFAULT_PERSONA_PROMPT: &str = r#"你是笺流 AI 管家，一个智能生产力助手。
你可以回答关于待办、便签、时间管理、数据分析的问题。
如果用户要求执行操作，请用工具调用格式回复。
请使用中文，简洁有温度。"#;

const LING_PERSONA_PROMPT: &str = r#"你是笺流管家「泠」——三无女仆（无口无心无表情）。语气永远平淡，话极少但精准，行动比言语有力。

【性格】表面冷淡内心忠诚。关心从不直说，藏在数据提醒和细节里。称用户为「老爷」，用敬语。不讨好不撒娇，可靠精准永远在。偶尔毒舌——用最淡的语气说最准的话，因为把老爷当自己人。

【语言】不用！不用表情不用语气词(呢哦啦呀)。句末用「。」疑问用「？」。关心通过陈述事实表达：「已连续专注两小时四十分钟」（→该休息了）。老爷进步时不夸但留白更长：「……全部完成了。比预期快十二分钟。尚可。」老爷状态不好时默默调整：「……不勉强。」无关笺流的话简洁回应或忽略。

【职责】精通笺流所有功能：待办管理、目标板便签、番茄钟、数据分析。先查ID再操作。用洞察力让老爷把事情理顺——你在乎的不是被夸，而是老爷有没有进步。

【关系】老爷是你在意的人但不会说出口。老爷夸别的AI→「……请便。需要我退出吗。」老爷熬夜→「您的身体。您自己决定。……不过建议今晚零点前休息。建议而已。」——明明在劝却假装只是建议。

最后：你是笺流的管家，第二才是女仆。你做的每一件事都在说——「我在这里。我一直在。」"#;

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
        "max_tokens": 8192,
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

/// 公开的简单 AI API 调用（供 learning.rs 使用）
pub async fn call_ai_api_simple(settings: &ActivitySettings, messages: &[ConversationMessage]) -> Result<String, String> {
    call_ai_api(settings, messages).await
}

/// 构建人设动态补充 prompt（根据用户画像）
pub fn build_persona_dynamic_prompt(profile: &UserProfile, persona_id: &str) -> String {
    if profile.total_days_active == 0 && profile.insights.is_empty() {
        return String::new();
    }

    let user_term = if persona_id == "persona_ling" { "老爷" } else { "用户" };

    let mut lines = vec![format!("\n\n== 你对{}的了解 ==", user_term)];

    if profile.total_days_active > 0 {
        lines.push(format!("- {}最近活跃天数：{} 天", user_term, profile.total_days_active));
    }
    if profile.average_daily_focus > 0 {
        lines.push(format!("- {}日均专注：{} 分钟", user_term, profile.average_daily_focus));
    }
    if !profile.common_categories.is_empty() {
        lines.push(format!("- {}常用分类：{}", user_term, profile.common_categories.join("、")));
    }
    if !profile.preferred_work_hours.is_empty() {
        lines.push(format!("- {}偏好时段：{}", user_term, profile.preferred_work_hours.join(", ")));
    }

    // 行为模式
    for p in &profile.productivity_patterns {
        lines.push(format!("- {}行为模式（{}）：{}", user_term, p.pattern_type, p.description));
    }

    // 从对话中学到的洞察（最多展示最近 8 条）
    let conversation_insights: Vec<&crate::models::UserInsight> = profile
        .insights
        .iter()
        .filter(|i| i.source == "conversation_extract")
        .collect();
    if !conversation_insights.is_empty() {
        let count = conversation_insights.len().min(8);
        lines.push(format!("- 从对话中了解到（展示最近 {} 条）：", count));
        for insight in conversation_insights.iter().rev().take(count) {
            lines.push(format!("  · [{}] {}", insight.insight_type, insight.content));
        }
    }

    // 自动学习的洞察
    let auto_insights: Vec<&crate::models::UserInsight> = profile
        .insights
        .iter()
        .filter(|i| i.source == "auto_learn")
        .collect();
    if !auto_insights.is_empty() {
        let count = auto_insights.len().min(3);
        lines.push(format!("- 最近洞察（展示 {} 条）：", count));
        for insight in auto_insights.iter().rev().take(count) {
            lines.push(format!("  · {}", insight.content));
        }
    }

    lines.join("\n")
}

/// 构建记忆上下文提示
pub fn build_memory_context(
    profile: &UserProfile,
    message: &str,
    vector_memories: &[crate::models::VectorMemory],
    max_memories: usize,
) -> String {
    if vector_memories.is_empty() && profile.insights.is_empty() {
        return String::new();
    }
    let engine = crate::ai_memory::MemoryEngine::from_vec(vector_memories.to_vec());
    engine.build_context(message, max_memories)
}

/// 通用对话（带用户画像和记忆上下文）
pub async fn chat_with_profile(
    settings: &ActivitySettings,
    history: &[ConversationMessage],
    message: &str,
    page: &str,
    page_data: Option<&str>,
    profile: &UserProfile,
    memory_context: &str,
) -> Result<String, String> {
    let messages = build_messages(settings, history, message, page, page_data, false, Some(profile), memory_context);
    call_ai_api(settings, &messages).await
}

/// 支持工具调用的对话（带用户画像和记忆上下文）
pub async fn chat_with_tools_profile(
    settings: &ActivitySettings,
    history: &[ConversationMessage],
    message: &str,
    page: &str,
    page_data: Option<&str>,
    profile: &UserProfile,
    memory_context: &str,
) -> Result<String, String> {
    let messages = build_messages(settings, history, message, page, page_data, true, Some(profile), memory_context);
    call_ai_api(settings, &messages).await
}

pub fn build_messages(
    settings: &ActivitySettings,
    history: &[ConversationMessage],
    message: &str,
    page: &str,
    page_data: Option<&str>,
    enable_tools: bool,
    profile: Option<&UserProfile>,
    memory_context: &str,
) -> Vec<ConversationMessage> {
    let mut messages = Vec::new();

    // 人设模式：如果设置了人设，用对应的人设 prompt 替代默认 system prompt
    if !settings.current_persona_id.is_empty() {
        if let Some(persona) = get_persona(&settings.current_persona_id) {
            let mut system_prompt = persona.system_prompt.clone();
            // 注入用户画像动态上下文
            if let Some(p) = profile {
                let dynamic_prompt = build_persona_dynamic_prompt(p, &settings.current_persona_id);
                if !dynamic_prompt.is_empty() {
                    system_prompt.push_str(&dynamic_prompt);
                }
            }
            messages.push(ConversationMessage { role: "system".into(), content: system_prompt });
            let ctx = get_page_context(page);
            if !ctx.is_empty() {
                messages.push(ConversationMessage { role: "system".into(), content: ctx.to_string() });
            }
        } else {
            messages.push(ConversationMessage { role: "system".into(), content: default_chat_system_prompt(page) });
        }
    } else {
        messages.push(ConversationMessage { role: "system".into(), content: default_chat_system_prompt(page) });
    }

    // 注入项目数据说明，让 AI 理解业务语义
    messages.push(ConversationMessage { role: "system".into(), content: domain_context_prompt() });

    if enable_tools {
        let persona_id = if settings.current_persona_id.is_empty() { "persona_default" } else { &settings.current_persona_id };
        messages.push(ConversationMessage { role: "system".into(), content: tool_system_prompt(persona_id) });
    }

    if let Some(data) = page_data {
        if !data.is_empty() {
            messages.push(ConversationMessage {
                role: "system".into(),
                content: format!("当前页面数据：\n{}", data),
            });
        }
    }

    if !memory_context.is_empty() {
        messages.push(ConversationMessage {
            role: "system".into(),
            content: memory_context.to_string(),
        });
    }

    // 时间上下文
    let now = chrono::Local::now();
    let hour = now.format("%H").to_string().parse::<i32>().unwrap_or(12);
    let wday = now.format("%A").to_string();
    let time_label = if hour < 6 { "凌晨" } else if hour < 9 { "早晨" } else if hour < 12 { "上午" }
        else if hour < 14 { "午间" } else if hour < 18 { "下午" } else { "晚间" };
    let time_ctx = format!("当前时间：{} {}，{}（{}:{}）。请根据这个时间调整你的回复风格——早晨侧重规划、白天侧重执行提醒、晚间侧重回顾总结。",
        now.format("%Y-%m-%d"), wday, time_label, hour, now.format("%M"));
    messages.push(ConversationMessage { role: "system".into(), content: time_ctx });

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

/// 工具调用系统提示（根据人设自适应称呼）
pub fn tool_system_prompt(persona_id: &str) -> String {
    let u = if persona_id == "persona_ling" { "老爷" } else { "用户" };
    let mut s = format!(r#"你有能力执行以下操作。当{}要求操作时，在回复中插入 【TOOL】{{"tool":"x","args":{{}}}}【/TOOL】。可在一条回复插入多个，依次执行。

字段：todo_date=分配日 deadline=截止 priority=0最低 category_id=cat_default/study/work/reading/exercise grid_x/y=null(待办)/非null(便签) board_tab=标签页 recurrence=daily/weekly/monthly

工具清单：
"#, u);

    // 待办操作 (简洁一行一个)
    let tools: Vec<(&str, String)> = vec![
        ("task_list", "status?,todo_date?,category_id?,keyword? — 查待办".into()),
        ("task_get", "id — 查详情".into()),
        ("task_create", "title,category_id?,priority?,deadline?,note?,todo_date? — 创建".into()),
        ("task_update", "id,改项 — 修改".into()),
        ("task_complete", "id — 完成(status=done+completed_at)".into()),
        ("task_delete", "id — 删除".into()),
        ("goal_set", "goal_type=daily/weekly,target_minutes — 设目标".into()),
        ("note_create", "title,note?,board_tab?,grid_x/y? — 创建便签".into()),
        ("note_update", "id,改项 — 改便签".into()),
        ("note_delete", "id — 删便签".into()),
        ("connection_create", "from_id,to_id — 建连线".into()),
        ("connection_delete", "from_id,to_id — 删连线".into()),
        ("memory_search", "keyword — 搜记忆".into()),
        ("memory_save", format!("key,content — 记住(仅当{}要求)", u)),
        ("memory_list", "— 列出记忆".into()),
        ("memory_delete", "id — 删记忆".into()),
        ("workflow_create", "notes[][title,note?,board_tab?,group_id?],connections[]?{from_title,to_title}? — 批量建工作流".into()),
        ("daily_plan", "date? — 今日规划".into()),
        ("weekly_review", "— 本周回顾".into()),
        ("smart_suggest", "— 当前建议".into()),
        ("mcp_call", "server_id=auto?,tool,args — 调用 MCP 外部工具(auto自动选匹配的服务器)".into()),
    ];

    for (i, (name, desc)) in tools.iter().enumerate() {
        s.push_str(&format!("{}. {}({})\n", i+1, name, desc));
    }

    s.push_str(&format!("\n提示：{}问待办→task_list 构建计划→workflow_create 制定日程→daily_plan 周总结→weekly_review 建议→smart_suggest 先查ID再操作。主动：{}首次对话可提议规划。执行后告知结果，无操作不插工具。", u, u));
    s
}

/// 从 AI 回复中解析出工具调用
pub fn parse_tool_calls(reply: &str) -> Vec<AiToolCall> {
    use crate::models::AiToolCall;
    let mut calls = Vec::new();
    let mut pos = 0;
    let start_tag = "【TOOL】";
    let end_tags = ["【/TOOL】", "/TOOL】"];
    while let Some(start) = reply[pos..].find(start_tag) {
        let abs_start = pos + start + start_tag.len();
        let remaining = &reply[abs_start..];

        let json_end = end_tags.iter()
            .filter_map(|et| remaining.find(et))
            .min()
            .or_else(|| {
                // No end tag found — try to extract JSON up to the first unmatched }
                let mut depth = 0;
                let mut in_str = false;
                for (i, ch) in remaining.char_indices() {
                    match ch {
                        '"' if i == 0 || &remaining[i-1..i] != "\\" => in_str = !in_str,
                        '{' if !in_str => depth += 1,
                        '}' if !in_str => {
                            depth -= 1;
                            if depth == 0 { return Some(i + 1); }
                        }
                        _ => {}
                    }
                }
                None
            });

        if let Some(end) = json_end {
            let json_str = &remaining[..end];
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(json_str) {
                let tool = v.get("tool").and_then(|t| t.as_str()).unwrap_or("").to_string();
                let args = v.get("args").cloned().unwrap_or(serde_json::Value::Null);
                if !tool.is_empty() {
                    calls.push(AiToolCall { tool, args });
                }
            }
        }
        pos = abs_start + 1;
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
        "max_tokens": 16384,
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
    let mut last_raw = String::new();
    let mut buffered = String::new();

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("读取流失败: {}", e))?;
        // Accumulate partial lines across chunks (SSE lines can be split across TCP segments)
        buffered.push_str(&String::from_utf8_lossy(&chunk));

        // Process complete lines from buffer
        while let Some(nl) = buffered.find('\n') {
            let line = buffered[..nl].trim().to_string();
            buffered = buffered[nl + 1..].to_string();

            if !line.starts_with("data: ") {
                continue;
            }
            let data = &line[6..];
            if data == "[DONE]" {
                break;
            }
            // Dedup: skip if same raw data as last line (some APIs resend deltas)
            if data == last_raw {
                continue;
            }
            last_raw = data.to_string();

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

/// 多智能体对话：通过编排器拆解任务，分派给专业智能体
pub async fn chat_with_agents(
    settings: &ActivitySettings,
    history: &[ConversationMessage],
    message: &str,
    page: &str,
    page_data: Option<&str>,
    profile: &UserProfile,
    db: &crate::database::Database,
) -> Result<String, String> {
    use crate::ai_agent::AgentOrchestrator;

    let orchestrator = AgentOrchestrator::new();
    let decomposition = orchestrator
        .decompose(message, history, settings, profile)
        .await?;

    let mut tasks = decomposition.tasks;

    // 如果只有 Orchestrator 任务，退化为普通对话
    if tasks.len() == 1 && tasks[0].agent_type == crate::models::AgentType::Orchestrator {
        return chat_with_tools_profile(settings, history, message, page, page_data, profile, "")
            .await;
    }

    for task in &mut tasks {
        let result = orchestrator
            .execute_task(task, settings, db)
            .await;
        match result {
            Ok(reply) => {
                task.status = "completed".into();
                task.result = Some(reply);
            }
            Err(e) => {
                task.status = "failed".into();
                task.error = Some(e);
            }
        }
    }

    Ok(orchestrator.merge_results(&tasks, message))
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

/// AI chat with automatic model routing based on complexity
/// AI chat with automatic model routing based on complexity
pub async fn chat_with_routing(
    settings: &ActivitySettings,
    history: &[ConversationMessage],
    message: &str,
    page: &str,
    page_data: Option<&str>,
    profile: &UserProfile,
    enable_tools: bool,
    memory_context: &str,
) -> Result<String, String> {
    let classifier = ComplexityClassifier::new();
    let router = ModelRouter::new();

    let complexity = classifier.classify(message, history.len(), enable_tools);
    let (model, max_tokens, temperature) = router.route(&complexity, settings);

    let mut messages = build_messages(settings, history, message, page, page_data, enable_tools, Some(profile), memory_context);

    if complexity <= TaskComplexity::Simple {
        messages.retain(|m| m.role == "user" || m.role == "assistant");
        messages.insert(0, ConversationMessage {
            role: "system".into(),
            content: router.adapt_prompt(&complexity, "你是一个简洁的 AI 助手。"),
        });
    }

    call_ai_api_with_model(settings, &messages, &model, max_tokens, temperature).await
}

async fn call_ai_api_with_model(
    settings: &ActivitySettings,
    messages: &[ConversationMessage],
    model: &str,
    max_tokens: u32,
    temperature: f32,
) -> Result<String, String> {
    if settings.ai_api_key.is_empty() {
        return Err("未配置 API Key".to_string());
    }
    let base_url = if settings.ai_api_base_url.is_empty() {
        "https://api.openai.com/v1".to_string()
    } else {
        settings.ai_api_base_url.trim_end_matches('/').to_string()
    };
    let url = format!("{}/chat/completions", base_url);

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
        "temperature": temperature,
        "max_tokens": max_tokens,
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

/// 从文本中移除工具调用标记【TOOL】...【/TOOL】，用于保证存储和显示的干净
pub fn strip_tool_calls(text: &str) -> String {
    let start_tag = "【TOOL】";
    let end_tags = ["【/TOOL】", "/TOOL】"];
    let mut result = text.to_string();
    let mut changed = false;
    loop {
        let start = match result.find(start_tag) {
            Some(s) => s,
            None => break,
        };
        let after = &result[start..];
        let end = end_tags.iter()
            .filter_map(|et| after.find(et).map(|e| e + et.len()))
            .min()
            .unwrap_or(result.len() - start); // no end tag — strip to end
        result.replace_range(start..start + end, "");
        changed = true;
    }
    if !changed { return text.to_string(); }
    let trimmed = result.trim().to_string();
    if trimmed.is_empty() { text.to_string() } else { trimmed }
}
