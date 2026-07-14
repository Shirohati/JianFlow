mod activity;
mod ai_service;
mod commands;
mod database;
mod learning;
mod models;
mod reminder;
mod skills;

use activity::{ActivityMonitor, ActivityStore};
use database::Database;
use reminder::ReminderEngine;
use std::sync::Arc;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, TrayIconBuilder},
    Manager, WindowEvent,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("无法获取应用数据目录");
            let db = Database::new(app_data_dir.clone());
            // 修复历史数据：同步 todo_status='completed' 但 status='active' 的任务
            let fixed = db.sync_completed_status();
            if fixed > 0 {
                println!("已修复 {} 条待办的完成状态", fixed);
            }
            let db_for_reminder = db.clone();
            app.manage(db);

            // v0.2 活动监测：创建独立 ActivityStore 与 ActivityMonitor
            let store = Arc::new(ActivityStore::new(app_data_dir));
            let monitor_enabled = store.get_settings().monitor_enabled;
            let monitor = Arc::new(ActivityMonitor::new(store.clone()));
            app.manage(store);
            app.manage(monitor.clone());
            if monitor_enabled {
                monitor.start();
            }

            // v0.2 提醒引擎
            let reminder = Arc::new(ReminderEngine::new(
                app.state::<Arc<ActivityStore>>().inner().clone(),
                db_for_reminder,
                app.handle().clone(),
            ));
            app.manage(reminder);

            let show_item = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
            let sep1 = PredefinedMenuItem::separator(app)?;
            let pause_item =
                MenuItem::with_id(app, "activity_pause", "暂停活动监测", true, None::<&str>)?;
            let resume_item =
                MenuItem::with_id(app, "activity_resume", "恢复活动监测", true, None::<&str>)?;
            let sep2 = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[
                    &show_item,
                    &sep1,
                    &pause_item,
                    &resume_item,
                    &sep2,
                    &quit_item,
                ],
            )?;

            let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png"))
                .expect("无法加载托盘图标");
            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .tooltip("笺流")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "activity_pause" => {
                        if let Some(monitor) = app.try_state::<Arc<ActivityMonitor>>() {
                            monitor.pause();
                        }
                    }
                    "activity_resume" => {
                        if let Some(monitor) = app.try_state::<Arc<ActivityMonitor>>() {
                            monitor.resume();
                        }
                    }
                    "quit" => {
                        // before-quit：停止活动监测并刷盘
                        if let Some(monitor) = app.try_state::<Arc<ActivityMonitor>>() {
                            monitor.stop();
                        }
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click { button, .. } = event {
                        if button == MouseButton::Left {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            // v0.1
            commands::task_list,
            commands::task_get,
            commands::task_create,
            commands::task_update,
            commands::task_delete,
            commands::task_update_type_cascade,
            commands::task_batch_create,
            commands::task_generate_recurring,
            commands::category_list,
            commands::category_create,
            commands::category_update,
            commands::category_delete,
            commands::daily_log_get,
            commands::daily_log_set,
            commands::time_type_list,
            commands::time_type_create,
            commands::time_type_update,
            commands::time_type_delete,
            commands::time_record_create,
            commands::time_record_list,
            commands::time_record_list_range,
            commands::time_record_list_all,
            commands::time_record_update,
            commands::time_record_delete,
            commands::preset_list,
            commands::preset_create,
            commands::preset_update,
            commands::preset_delete,
            commands::goal_list,
            commands::goal_set,
            commands::countdown_list,
            commands::countdown_create,
            commands::countdown_update,
            commands::countdown_delete,
            commands::connection_list,
            commands::connection_create,
            commands::connection_delete,
            commands::settings_get,
            commands::settings_update,
            commands::stats_study,
            commands::stats_streak,
            commands::data_export,
            commands::data_import_legacy,
            commands::data_import_legacy_json,
            commands::data_import_v01_native,
            commands::data_import_v01_auto,
            commands::data_reset,
            commands::data_reset_tasks,
            // v0.2 活动监测控制
            commands::activity_get_state,
            commands::activity_start,
            commands::activity_stop,
            commands::activity_pause,
            commands::activity_resume,
            // v0.2 活动设置
            commands::activity_get_settings,
            commands::activity_update_settings,
            // v0.2 活动数据
            commands::activity_get_sessions,
            commands::activity_get_summary,
            commands::activity_update_session,
            commands::activity_delete_session,
            commands::activity_clear_date,
            // v0.2 分类规则
            commands::activity_get_rules,
            commands::activity_set_rules,
            commands::activity_reclassify,
            // v0.2 导入导出
            commands::activity_export_csv,
            commands::activity_export_json,
            commands::activity_import_csv,
            commands::activity_import_json,
            commands::activity_get_batches,
            commands::activity_delete_batch,
            // v0.2 AI
            commands::ai_generate,
            commands::ai_test,
            commands::ai_get_cached,
            // v0.2 生产力评分
            commands::activity_get_productivity_score,
            // v0.2 AI 对话
            commands::ai_chat,
            commands::ai_chat_stream,
            // v0.2 评分历史
            commands::get_daily_score_history,
            // v0.2 提醒控制
            commands::reminder_start,
            commands::reminder_stop,
            commands::reminder_status,
            // v0.2 人设
            commands::persona_list,
            // v0.2 对话记录
            commands::conversation_list,
            commands::conversation_get,
            commands::conversation_delete,
            // v0.2 数据修复
            commands::sync_completed_status,
            // v0.2 用户画像
            commands::user_get_profile,
            commands::user_analyze,
            commands::user_get_insights,
            commands::user_delete_insight,
            // v0.2 Skill 系统
            commands::skill_run,
            commands::skill_get_init_form,
            commands::board_read,
            commands::report_list,
            commands::user_update_profile_json,
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("运行 Tauri 应用时出错");
}
