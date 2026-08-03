mod models;
mod database;
mod commands;
mod lock;

use database::Database;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder},
    Emitter, Manager, RunEvent, WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("无法获取应用数据目录");
            let db = Database::new(app_data_dir);
            app.manage(db);

            let show_item = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

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
                    "quit" => {
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

            // Ctrl+Alt+L：锁机让位期间提前结束番茄钟并解锁
            let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyL);
            app.global_shortcut().on_shortcut(shortcut, move |app, _sc, event| {
                if event.state == ShortcutState::Pressed {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.emit("pomo://global-stop", ());
                    }
                }
            })?;

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
            commands::data_reset,
            commands::data_reset_tasks,
            lock::lock_enter,
            lock::lock_exit,
            lock::lock_yield,
            lock::lock_resume,
            lock::lock_foreground_info,
            lock::lock_activate_app,
            lock::lock_activate_title,
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if lock::is_locked() {
                    // Lock is active (or yielded to whitelisted app): never allow closing
                    api.prevent_close();
                } else {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("构建 Tauri 应用时出错")
        .run(|_app, event| {
            if let RunEvent::ExitRequested { .. } = event {
                lock::restore_on_exit();
            }
        });
}
