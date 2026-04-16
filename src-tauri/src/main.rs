#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager,
};
use std::thread;
use std::panic;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

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

            // Global input: rdev sets flag, polling thread emits
            let input_flag = Arc::new(AtomicBool::new(false));
            let flag_writer = input_flag.clone();

            // rdev listener thread - only sets atomic flag, never calls Tauri APIs
            thread::spawn(move || {
                let result = panic::catch_unwind(|| {
                    use rdev::{listen, Event, EventType};
                    let flag = flag_writer;
                    let _ = listen(move |event: Event| {
                        match event.event_type {
                            EventType::KeyPress(_) | EventType::ButtonPress(_) | EventType::MouseMove { .. } => {
                                flag.store(true, Ordering::Relaxed);
                            }
                            _ => {}
                        }
                    });
                });
                if result.is_err() {
                    eprintln!("rdev listener failed - no accessibility permission");
                }
            });

            // Polling thread - reads flag, emits to frontend (safe thread)
            let app_handle = app.handle().clone();
            let flag_reader = input_flag;
            thread::spawn(move || {
                loop {
                    thread::sleep(Duration::from_millis(200));
                    if flag_reader.swap(false, Ordering::Relaxed) {
                        let _ = app_handle.emit("global-input", ());
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
