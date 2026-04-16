#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager,
};
use std::thread;
use std::time::Duration;
use device_query::{DeviceQuery, DeviceState, Keycode, MouseState};

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
                let mut prev_keys: Vec<Keycode> = vec![];
                let mut prev_mouse_x: i32 = 0;
                let mut prev_mouse_y: i32 = 0;
                let mut prev_buttons: Vec<bool> = vec![];
                
                loop {
                    thread::sleep(Duration::from_millis(30));

                    let mut triggered = false;

                    // Check keyboard - detect ANY new key not in previous set
                    let keys = device.get_keys();
                    for key in &keys {
                        if !prev_keys.contains(key) {
                            triggered = true;
                            break;
                        }
                    }
                    prev_keys = keys;

                    // Check mouse movement (threshold: 5px to avoid noise)
                    if !triggered {
                        let mouse: MouseState = device.get_mouse();
                        let dx = (mouse.coords.0 - prev_mouse_x).abs();
                        let dy = (mouse.coords.1 - prev_mouse_y).abs();
                        if dx > 5 || dy > 5 {
                            triggered = true;
                        }
                        prev_mouse_x = mouse.coords.0;
                        prev_mouse_y = mouse.coords.1;

                        // Check mouse buttons
                        if !triggered {
                            let cur_buttons: Vec<bool> = mouse.button_pressed.clone();
                            let len = cur_buttons.len().min(prev_buttons.len());
                            for i in 0..len {
                                if cur_buttons[i] && !prev_buttons[i] {
                                    triggered = true;
                                    break;
                                }
                            }
                            prev_buttons = cur_buttons;
                        }
                    }

                    if triggered {
                        let _ = app_handle.emit("global-input", ());
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
