use crate::ai_service;
use crate::database::Database;
use crate::activity::ActivityStore;
use crate::models::{
    ActivitySettings, AiToolCall, AiToolResult, ConversationMessage,
    SkillDataContext, SkillOutcome, SkillParams, UserProfile,
};
use crate::skills::{data_context, init, morning, evening, report, tools};

/// Skill 编排入口：根据 skill name 走统一管道
pub async fn run_skill(
    name: &str,
    params: &SkillParams,
    db: &Database,
    store: &ActivityStore,
    settings: &ActivitySettings,
) -> Result<SkillOutcome, String> {
    // 校验：除 init 外，其他 skill 需要已初始化
    if name != "init" {
        if db.get_user_profile_json().is_none() {
            return Ok(SkillOutcome {
                reply: "请先完成初始化设置（点击「初始化」按钮），然后才能使用此功能。".to_string(),
                tool_results: vec![],
                saved_reports: vec![],
                created_tasks: vec![],
                needs_followup: false,
            });
        }
    }

    match name {
        "init" => run_init_skill(params, db),
        "morning" => run_ai_skill("morning", params, db, store, settings).await,
        "evening" => run_ai_skill("evening", params, db, store, settings).await,
        "report" => run_ai_skill("report", params, db, store, settings).await,
        _ => Err(format!("未知 skill: {}", name)),
    }
}

/// init skill：不走 AI，直接处理表单
fn run_init_skill(params: &SkillParams, db: &Database) -> Result<SkillOutcome, String> {
    let form_data = match &params.form_data {
        Some(v) => v,
        None => return Ok(SkillOutcome {
            reply: "未收到表单数据".to_string(),
            ..Default::default()
        }),
    };

    match init::save_init_form(db, form_data) {
        Ok(()) => {
            let identity = form_data.get("identity").and_then(|v| v.as_str()).unwrap_or("");
            let target = form_data.get("target").and_then(|v| v.as_str()).unwrap_or("");
            Ok(SkillOutcome {
                reply: format!(
                    "已收到您的信息！\n\n**身份**：{}\n**目标**：{}\n\n画像已保存。现在我可以为您提供更有针对性的建议了。开始使用「晨间规划」或「晚间总结」功能吧。",
                    identity, target
                ),
                tool_results: vec![],
                saved_reports: vec![],
                created_tasks: vec![],
                needs_followup: false,
            })
        }
        Err(e) => Ok(SkillOutcome {
            reply: format!("保存失败：{}", e),
            ..Default::default()
        }),
    }
}

/// 通用 AI Skill 编排：morning / evening / report
async fn run_ai_skill(
    skill_name: &str,
    params: &SkillParams,
    db: &Database,
    store: &ActivityStore,
    settings: &ActivitySettings,
) -> Result<SkillOutcome, String> {
    // 1. 构建数据上下文
    let ctx = data_context::build_context(db, store);

    // 2. 构建 skill prompt
    let skill_prompt = match skill_name {
        "morning" => morning::build_prompt(&ctx),
        "evening" => evening::build_prompt(&ctx),
        "report" => {
            let date_range = params.date_range_text.as_deref().unwrap_or("这周");
            report::build_prompt(&ctx, date_range)
        }
        _ => return Err(format!("未知 skill: {}", skill_name)),
    };

    // 3. 构建 messages
    let messages = build_skill_messages(settings, &skill_prompt, &ctx);

    // 4. 获取工具 schemas
    let tool_schemas = tools::skill_tool_schemas(skill_name);

    // 5. 第一轮：调用 AI with tools
    let (first_reply, tool_calls) = if tool_schemas.is_empty() {
        // 没有工具的 skill，直接走 followup
        let reply = ai_service::call_followup(settings, &messages).await?;
        (reply, Vec::<AiToolCall>::new())
    } else {
        ai_service::call_with_tools(settings, &messages, &tool_schemas).await?
    };

    // 6. 执行工具调用
    let mut tool_results: Vec<AiToolResult> = Vec::new();
    let mut saved_reports: Vec<String> = Vec::new();
    let mut created_tasks: Vec<String> = Vec::new();

    for tc in &tool_calls {
        let result = tools::execute_skill_tool(&tc.tool, &tc.args, db, store);
        // 从工具结果中提取保存的报告 ID 和创建的任务 ID
        if tc.tool == "report_save" {
            if let Some(data) = &result.data {
                if let Some(id) = data.get("id").and_then(|v| v.as_str()) {
                    saved_reports.push(id.to_string());
                }
            }
        } else if tc.tool == "schedule_create" {
            if let Some(data) = &result.data {
                if let Some(ids) = data.get("created_ids").and_then(|v| v.as_array()) {
                    for id in ids {
                        if let Some(s) = id.as_str() {
                            created_tasks.push(s.to_string());
                        }
                    }
                }
            }
        }
        tool_results.push(result);
    }

    // 7. 如果有工具调用，需要二次 AI 调用让 AI 看到工具结果并生成最终回复
    let final_reply = if tool_calls.is_empty() {
        // 没有工具调用，直接用第一轮回复
        first_reply
    } else {
        // 构建带工具结果的 followup messages
        let mut followup_messages = messages.clone();
        followup_messages.push(ConversationMessage {
            role: "assistant".into(),
            content: first_reply.clone(),
        });

        // 把工具执行结果作为 system 消息注入
        let tool_summary: Vec<String> = tool_results.iter().map(|r| {
            if r.success {
                format!("✅ 操作成功：{}", r.message)
            } else {
                format!("❌ 操作失败：{}", r.message)
            }
        }).collect();
        followup_messages.push(ConversationMessage {
            role: "system".into(),
            content: format!("以上工具调用的执行结果：\n{}\n\n请基于以上结果，向用户做最终回复（markdown 格式）。", tool_summary.join("\n")),
        });

        ai_service::call_followup(settings, &followup_messages).await?
    };

    Ok(SkillOutcome {
        reply: final_reply,
        tool_results,
        saved_reports,
        created_tasks,
        needs_followup: false,
    })
}

/// 构建 Skill 调用时的 messages
fn build_skill_messages(
    settings: &ActivitySettings,
    skill_prompt: &str,
    ctx: &SkillDataContext,
) -> Vec<ConversationMessage> {
    let mut messages = Vec::new();

    // 1. 注入人设 prompt（如果配置了）
    if !settings.current_persona_id.is_empty() {
        if let Some(persona) = ai_service::get_persona(&settings.current_persona_id) {
            messages.push(ConversationMessage {
                role: "system".into(),
                content: persona.system_prompt.clone(),
            });
        }
    }

    // 2. 注入项目数据说明
    messages.push(ConversationMessage {
        role: "system".into(),
        content: ai_service::domain_context_prompt(),
    });

    // 3. 注入用户画像动态 prompt（如果有）
    if let Some(ref profile_json) = ctx.user_profile_json {
        let profile = UserProfile {
            profile_json: Some(profile_json.clone()),
            ..Default::default()
        };
        let dynamic_prompt = ai_service::build_persona_dynamic_prompt(&profile, &settings.current_persona_id);
        if !dynamic_prompt.is_empty() {
            messages.push(ConversationMessage {
                role: "system".into(),
                content: dynamic_prompt,
            });
        }
    }

    // 4. 注入 skill prompt（已包含 data_context JSON）
    messages.push(ConversationMessage {
        role: "system".into(),
        content: skill_prompt.to_string(),
    });

    // 5. 用户触发消息
    messages.push(ConversationMessage {
        role: "user".into(),
        content: "请开始执行这个 skill".to_string(),
    });

    messages
}
