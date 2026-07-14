use crate::database::Database;
use crate::activity::ActivityStore;
use crate::models::{AiToolCall, AiToolResult};
use serde_json::Value;

/// 为指定 Skill 返回它的工具 schemas 列表（OpenAI function calling 格式）
pub fn skill_tool_schemas(skill: &str) -> Vec<Value> {
    fn t(name: &str, desc: &str, props: &[(&str, &str, &str, bool)]) -> Value {
        let mut properties = serde_json::Map::new();
        let mut required = Vec::new();
        for (pname, ptype, pdesc, is_req) in props {
            properties.insert(pname.to_string(), serde_json::json!({"type": ptype, "description": pdesc}));
            if *is_req { required.push(pname.to_string()); }
        }
        serde_json::json!({"type": "function", "function": {"name": name, "description": desc, "parameters": {"type": "object", "properties": properties, "required": required}}})
    }

    match skill {
        "init" => vec![
            // init skill 不走 AI 调用，不需要工具
        ],
        "morning" => vec![
            t("schedule_create",
              "批量创建带时段的待办任务到时间轴。每个任务必须包含 title / category_id / todo_date / schedule_start / schedule_end。",
              &[("tasks", "array", "任务数组，每个任务对象包含 title(标题) / category_id(分类ID,如 cat_study/cat_work/cat_default) / todo_date(日期 YYYY-MM-DD) / schedule_start(开始时间 HH:MM) / schedule_end(结束时间 HH:MM) / priority(优先级数字,可选) / type(类型,可选,默认 todo,纯时间块用 note)", true)]),
            t("task_list",
              "按条件列出待办",
              &[("todo_date","string","日期 YYYY-MM-DD",false),("status","string","active 或 done",false)]),
            t("board_read", "读取目标板所有便签和连线", &[]),
        ],
        "evening" => vec![
            t("report_save",
              "保存一份报告到数据库。报告包含 user_summary(markdown 给用户看) 和 ai_data(JSON 字符串给 AI 后续读取)。",
              &[("date","string","报告日期 YYYY-MM-DD",true),("user_summary","string","markdown 格式的报告正文",true),("ai_data","string","JSON 字符串,结构化数据(如 focus_minutes / todo_completion_rate 等)",false),("report_type","string","报告类型: daily/weekly/monthly",true)]),
            t("task_list",
              "按条件列出待办",
              &[("todo_date","string","日期 YYYY-MM-DD",false)]),
        ],
        "report" => vec![
            t("report_save",
              "保存一份报告到数据库",
              &[("date","string","报告日期 YYYY-MM-DD",true),("user_summary","string","markdown 格式的报告正文",true),("ai_data","string","JSON 字符串,结构化数据",false),("report_type","string","报告类型: weekly/monthly/custom",true)]),
            t("task_list",
              "按条件列出待办",
              &[("todo_date","string","日期 YYYY-MM-DD",false)]),
        ],
        _ => vec![],
    }
}

/// 执行 Skill 工具调用
/// 优先复用 commands.rs 中的 execute_tool_call 逻辑
/// 新增 Skill 专用工具：schedule_create / profile_save
pub fn execute_skill_tool(
    tool: &str,
    args: &Value,
    db: &Database,
    store: &ActivityStore,
) -> AiToolResult {
    match tool {
        "schedule_create" => execute_schedule_create(args, db),
        "profile_save" => execute_profile_save(args, db),
        _ => {
            // 其他工具走现有的 execute_tool_call
            let tool_call = AiToolCall {
                tool: tool.to_string(),
                args: args.clone(),
            };
            crate::commands::execute_tool_call(&tool_call, db, Some(store))
        }
    }
}

/// schedule_create: 批量创建带时段的待办
fn execute_schedule_create(args: &Value, db: &Database) -> AiToolResult {
    let tasks = match args.get("tasks").and_then(|v| v.as_array()) {
        Some(arr) => arr,
        None => return AiToolResult {
            success: false,
            message: "缺少 tasks 参数或格式错误".to_string(),
            data: None,
        },
    };

    let mut created_ids: Vec<String> = Vec::new();
    let mut created_count = 0;
    let mut errors: Vec<String> = Vec::new();

    for (idx, task_val) in tasks.iter().enumerate() {
        let title = task_val.get("title").and_then(|v| v.as_str()).unwrap_or("新待办");
        let category_id = task_val.get("category_id").and_then(|v| v.as_str()).unwrap_or("cat_default");
        let priority = task_val.get("priority").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
        let todo_date = task_val.get("todo_date").and_then(|v| v.as_str()).map(|s| s.to_string());
        let schedule_start = task_val.get("schedule_start").and_then(|v| v.as_str()).map(|s| s.to_string());
        let schedule_end = task_val.get("schedule_end").and_then(|v| v.as_str()).map(|s| s.to_string());
        let task_type = task_val.get("type").and_then(|v| v.as_str()).unwrap_or("todo");
        let note = task_val.get("note").and_then(|v| v.as_str()).map(|s| s.to_string());

        let task = crate::models::TaskItem {
            id: String::new(),
            r#type: task_type.to_string(),
            sub_type: if task_type == "note" { "note".to_string() } else { "todo".to_string() },
            title: title.to_string(),
            content: String::new(),
            category_id: category_id.to_string(),
            priority,
            parent_id: None,
            sort_order: 0,
            status: "active".to_string(),
            grid_x: None, grid_y: None,
            home_x: None, home_y: None,
            todo_date,
            todo_status: None,
            recurrence: None,
            completed_at: None,
            deadline: None,
            pin_date: None,
            collapsed: false,
            note,
            time_start: None, time_end: None,
            note_width: None, note_height: None,
            open_width: None, open_height: None,
            group_id: None,
            board_tab: None,
            node_mode: None,
            schedule_start: schedule_start.clone(),
            schedule_end: schedule_end.clone(),
            created_at: String::new(),
            updated_at: String::new(),
        };

        let added = db.add_task(task);
        created_ids.push(added.id.clone());
        created_count += 1;

        if let (Some(s), Some(e)) = (&schedule_start, &schedule_end) {
            let _ = (s, e, idx); // 仅用于错误日志
        }
    }

    if created_count > 0 {
        AiToolResult {
            success: true,
            message: format!("已批量创建 {} 个时间轴任务", created_count),
            data: Some(serde_json::json!({"created_ids": created_ids, "count": created_count})),
        }
    } else {
        AiToolResult {
            success: false,
            message: format!("未能创建任何任务。错误: {}", errors.join("; ")),
            data: None,
        }
    }
}

/// profile_save: 保存初始化画像到 user_profile_json
fn execute_profile_save(args: &Value, db: &Database) -> AiToolResult {
    // 复用 skills/init.rs 中的 save_init_form
    match crate::skills::init::save_init_form(db, args) {
        Ok(()) => AiToolResult {
            success: true,
            message: "已保存用户画像".to_string(),
            data: None,
        },
        Err(e) => AiToolResult {
            success: false,
            message: format!("保存画像失败: {}", e),
            data: None,
        },
    }
}
