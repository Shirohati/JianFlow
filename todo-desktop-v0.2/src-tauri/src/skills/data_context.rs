use crate::database::Database;
use crate::activity::ActivityStore;
use crate::models::{SkillDataContext, TaskFilters};
use chrono::{Local, Duration};

/// 构建 Skill 数据上下文：一次性拉取所有 Skill 所需的数据
pub fn build_context(db: &Database, store: &ActivityStore) -> SkillDataContext {
    let today = Local::now().format("%Y-%m-%d").to_string();
    let yesterday = (Local::now() - Duration::days(1)).format("%Y-%m-%d").to_string();
    let week_ago = (Local::now() - Duration::days(7)).format("%Y-%m-%d").to_string();

    // 今日待办
    let today_tasks = db.get_tasks(TaskFilters {
        todo_date: Some(today.clone()),
        ..Default::default()
    });

    // 昨日待办（用于 morning skill 识别未完成项）
    let yesterday_tasks = db.get_tasks(TaskFilters {
        todo_date: Some(yesterday),
        ..Default::default()
    });

    // 活动监测摘要
    let activity_summary = store.get_daily_summary(&today);

    // 番茄钟/专注记录
    let pomodoro_records = db.get_time_records(&today);

    // 目标板便签+连接
    let board_data = db.get_board_data();
    let board_notes = board_data.notes;
    let board_connections = board_data.connections;

    // 用户画像 JSON
    let user_profile_json = db.get_user_profile_json();

    // 最近 7 天报告
    let recent_reports = db.get_reports(&week_ago, &today);

    // 学习目标
    let goals = db.get_goals();

    SkillDataContext {
        current_date: today,
        today_tasks,
        yesterday_tasks,
        activity_summary,
        pomodoro_records,
        board_notes,
        board_connections,
        user_profile_json,
        recent_reports,
        goals,
    }
}
