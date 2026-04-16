#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager,
};
use std::thread;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "显示/隐藏", true, None::<&str>)?;
            let backpack = MenuItem::with_id(app, "backpack", "背包", true, None::<&str>)?;
            let shop = MenuItem::with_id(app, "shop", "商城", true, None::<&str>)?;
            let reset = MenuItem::with_id(app, "reset", "重置存档", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;

            let menu = Menu::with_items(app, &[&show, &backpack, &shop, &reset, &quit])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("像素邦德小猫·敲敲打宝")
                .menu(&menu)
                .on_menu_event(|app, event| {
                    let window = app.get_webview_window("main").unwrap();
                    match event.id.as_ref() {
                        "show" => {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "backpack" => {
                            let _ = window.show();
                            let _ = app.emit("open-backpack", ());
                        }
                        "shop" => {
                            let _ = window.show();
                            let _ = app.emit("open-shop", ());
                        }
                        "reset" => {
                            let _ = app.emit("reset-data", ());
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            // Global keyboard/mouse listener (throttled)
            let app_handle = app.handle().clone();
            thread::spawn(move || {
                use rdev::{listen, Event, EventType};
                static LAST_EMIT: AtomicU64 = AtomicU64::new(0);
                let callback = move |event: Event| {
                    let dominated = match event.event_type {
                        EventType::KeyPress(_) | EventType::ButtonPress(_) => true,
                        EventType::MouseMove { .. } => {
                            // Throttle mouse move to 1 per 500ms
                            let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as u64;
                            let last = LAST_EMIT.load(Ordering::Relaxed);
                            if now - last > 500 {
                                LAST_EMIT.store(now, Ordering::Relaxed);
                                true
                            } else {
                                false
                            }
                        }
                        _ => false,
                    };
                    if dominated {
                        let _ = app_handle.emit("global-input", ());
                    }
                };
                if let Err(error) = listen(callback) {
                    eprintln!("Global listener error: {:?}", error);
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
