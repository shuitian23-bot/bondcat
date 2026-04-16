#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager,
};
use std::thread;
use std::time::Duration;
use device_query::{DeviceQuery, DeviceState, MouseState};

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

            // Position window at bottom-center
            let window = app.get_webview_window("main").unwrap();
            if let Ok(Some(monitor)) = window.current_monitor() {
                let screen = monitor.size();
                let scale = monitor.scale_factor();
                let sw = (screen.width as f64 / scale) as i32;
                let sh = (screen.height as f64 / scale) as i32;
                let x = (sw - 500) / 2;
                let y = sh - 160 - 80;
                let _ = window.set_position(tauri::LogicalPosition::new(x as f64, y as f64));
            }

            // Global input polling with device_query
            let app_handle = app.handle().clone();
            thread::spawn(move || {
                let device = DeviceState::new();
                let mut prev_keys_count = 0usize;
                let mut prev_buttons: Vec<bool> = vec![];
                loop {
                    thread::sleep(Duration::from_millis(100));

                    // Check keyboard
                    let keys = device.get_keys();
                    let cur_count = keys.len();
                    if cur_count > prev_keys_count {
                        // New key pressed
                        let _ = app_handle.emit("global-input", ());
                    }
                    prev_keys_count = cur_count;

                    // Check mouse buttons
                    let mouse: MouseState = device.get_mouse();
                    let cur_buttons: Vec<bool> = mouse.button_pressed.clone();
                    if cur_buttons.len() > 0 && prev_buttons.len() > 0 {
                        for i in 0..cur_buttons.len().min(prev_buttons.len()) {
                            if cur_buttons[i] && !prev_buttons[i] {
                                let _ = app_handle.emit("global-input", ());
                                break;
                            }
                        }
                    }
                    prev_buttons = cur_buttons;
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
