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

            // Position window at bottom-center of screen
            let window = app.get_webview_window("main").unwrap();
            if let Ok(Some(monitor)) = window.current_monitor() {
                let screen = monitor.size();
                let scale = monitor.scale_factor();
                let sw = (screen.width as f64 / scale) as i32;
                let sh = (screen.height as f64 / scale) as i32;
                let ww = 500;
                let wh = 160;
                let x = (sw - ww) / 2;
                let y = sh - wh - 80; // above dock
                let _ = window.set_position(tauri::LogicalPosition::new(x as f64, y as f64));
            }

            // Global input: rdev sets flag, polling thread emits
            let input_flag = Arc::new(AtomicBool::new(false));
            let flag_writer = input_flag.clone();

            thread::spawn(move || {
                let result = panic::catch_unwind(|| {
                    use rdev::{listen, Event, EventType};
                    let flag = flag_writer;
                    let _ = listen(move |event: Event| {
                        match event.event_type {
                            EventType::KeyPress(_) | EventType::ButtonPress(_) => {
                                flag.store(true, Ordering::Relaxed);
                            }
                            _ => {}
                        }
                    });
                });
                if result.is_err() {
                    eprintln!("rdev failed - grant Accessibility permission in System Settings");
                }
            });

            let app_handle = app.handle().clone();
            let flag_reader = input_flag;
            thread::spawn(move || {
                loop {
                    thread::sleep(Duration::from_millis(150));
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
