#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager,
};

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

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
