use crate::ai_service;
use crate::commands;
use crate::database::Database;
use crate::models::*;

pub struct AgentOrchestrator;

impl AgentOrchestrator {
    pub fn new() -> Self {
        Self
    }

    pub async fn decompose(
        &self,
        message: &str,
        _history: &[ConversationMessage],
        settings: &ActivitySettings,
        _profile: &UserProfile,
    ) -> Result<TaskDecomposition, String> {
        let decomposition_prompt = format!(
            r#"分析用户请求并拆解为子任务。用户说: "{}"
            
可能的子任务类型：
- ORCHESTRATOR: 只需回复、无需操作
- PLANNER: 日程规划、目标设定
- ANALYST: 数据分析、周报、洞察
- EXECUTOR: 创建/修改/删除任务、便签、连接线
- MEMORY: 保存/查询记忆

返回格式：
任务1 | 类型 | 说明
任务2 | 类型 | 说明
..."#,
            message
        );

        let msgs = vec![ConversationMessage {
            role: "system".into(),
            content: decomposition_prompt,
        }];
        let reply = ai_service::call_ai_api_simple(settings, &msgs).await?;

        let mut tasks = Vec::new();
        for line in reply.lines() {
            let parts: Vec<&str> = line.split('|').collect();
            if parts.len() >= 2 {
                let agent_type = match parts[1].trim() {
                    "PLANNER" => AgentType::Planner,
                    "ANALYST" => AgentType::Analyst,
                    "EXECUTOR" => AgentType::Executor,
                    "MEMORY" => AgentType::Memory,
                    _ => continue,
                };
                tasks.push(AgentTask {
                    id: format!("task_{}", tasks.len()),
                    agent_type,
                    instruction: parts[0].trim().to_string(),
                    context: message.to_string(),
                    requires_tools: true,
                    status: "pending".into(),
                    result: None,
                    error: None,
                });
            }
        }

        if tasks.is_empty() {
            tasks.push(AgentTask {
                id: "task_0".into(),
                agent_type: AgentType::Orchestrator,
                instruction: message.to_string(),
                context: String::new(),
                requires_tools: true,
                status: "pending".into(),
                result: None,
                error: None,
            });
        }

        Ok(TaskDecomposition {
            tasks,
            reasoning: reply,
        })
    }

    pub async fn execute_task(
        &self,
        task: &AgentTask,
        settings: &ActivitySettings,
        db: &Database,
    ) -> Result<String, String> {
        match task.agent_type {
            AgentType::Planner => {
                let prompt = format!(
                    "你是一个学习规划助手。用户需求: {}\n\n上下文: {}",
                    task.instruction, task.context
                );
                let msgs = vec![ConversationMessage {
                    role: "system".into(),
                    content: prompt,
                }];
                ai_service::call_ai_api_simple(settings, &msgs).await
            }
            AgentType::Analyst => {
                let prompt = format!(
                    "你是一个数据分析助手。用户需求: {}\n\n上下文: {}",
                    task.instruction, task.context
                );
                let msgs = vec![ConversationMessage {
                    role: "system".into(),
                    content: prompt,
                }];
                ai_service::call_ai_api_simple(settings, &msgs).await
            }
            AgentType::Executor => {
                let mut msgs = vec![ConversationMessage {
                    role: "system".into(),
                    content: format!(
                        "你是一个执行助手，负责根据用户需求执行操作。\n\n{}",
                        ai_service::tool_system_prompt("persona_default")
                    ),
                }];
                if !task.context.is_empty() {
                    msgs.push(ConversationMessage {
                        role: "system".into(),
                        content: format!("上下文:\n{}", task.context),
                    });
                }
                msgs.push(ConversationMessage {
                    role: "user".into(),
                    content: task.instruction.clone(),
                });

                let reply = ai_service::call_ai_api_simple(settings, &msgs).await?;
                let tool_calls = ai_service::parse_tool_calls(&reply);

                if tool_calls.is_empty() {
                    return Ok(reply);
                }

                let mut tool_messages = Vec::new();
                for tc in &tool_calls {
                    let result = commands::execute_tool_call(tc, db, None, None).await;
                    tool_messages.push(format!(
                        "{}{}",
                        if result.success { "✅ " } else { "❌ " },
                        result.message
                    ));
                }

                let result_summary = tool_messages.join("\n");
                Ok(format!(
                    "{}\n\n执行结果:\n{}",
                    ai_service::strip_tool_calls(&reply),
                    result_summary
                ))
            }
            AgentType::Memory => {
                let prompt = format!("你是一个记忆助手。用户需求: {}", task.instruction);
                let msgs = vec![ConversationMessage {
                    role: "system".into(),
                    content: prompt,
                }];
                ai_service::call_ai_api_simple(settings, &msgs).await
            }
            AgentType::Orchestrator => Ok(String::new()),
        }
    }

    pub fn merge_results(&self, tasks: &[AgentTask], _original_message: &str) -> String {
        let mut output = String::new();
        for task in tasks {
            if let Some(ref result) = task.result {
                if !result.is_empty() {
                    output.push_str(&format!(
                        "**{}**:\n{}\n\n",
                        match task.agent_type {
                            AgentType::Planner => "📋 规划",
                            AgentType::Analyst => "📊 分析",
                            AgentType::Executor => "⚡ 执行",
                            AgentType::Memory => "🧠 记忆",
                            _ => "ℹ️",
                        },
                        result
                    ));
                }
            }
        }
        output
    }
}
