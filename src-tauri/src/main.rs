#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager,
};
use std::thread;
use std::time::Duration;
use std::ffi::c_void;
use std::sync::atomic::{AtomicU64, Ordering};

// ---- macOS CoreGraphics Event Tap (global input monitoring) ----
#[cfg(target_os = "macos")]
mod macos {
    use std::ffi::c_void;

    pub type CGEventRef = *mut c_void;
    pub type CGEventMask = u64;
    pub type CGEventType = u32;

    pub const KEY_DOWN: CGEventType = 10;
    pub const MOUSE_MOVED: CGEventType = 5;
    pub const LEFT_MOUSE_DOWN: CGEventType = 1;
    pub const RIGHT_MOUSE_DOWN: CGEventType = 3;
    pub const OTHER_MOUSE_DOWN: CGEventType = 25;

    pub fn mask_bit(t: CGEventType) -> CGEventMask { 1u64 << (t as u64) }

    pub type TapCallback = unsafe extern "C" fn(
        *mut c_void, CGEventType, CGEventRef, *mut c_void
    ) -> CGEventRef;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        pub fn CGEventTapCreate(
            tap: u32, place: u32, options: u32,
            events_of_interest: CGEventMask,
            callback: TapCallback, user_info: *mut c_void,
        ) -> *mut c_void;
        pub fn CGEventTapEnable(tap: *mut c_void, enable: bool);
    }

    #[link(name = "IOKit", kind = "framework")]
    extern "C" {
        pub fn IOHIDRequestAccess(request_type: u32) -> bool;
    }
    pub const K_IOHID_REQUEST_TYPE_LISTEN_EVENT: u32 = 1;

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        pub fn CFMachPortCreateRunLoopSource(
            allocator: *const c_void, port: *mut c_void, order: i64,
        ) -> *mut c_void;
        pub fn CFRunLoopGetCurrent() -> *mut c_void;
        pub fn CFRunLoopAddSource(rl: *mut c_void, source: *mut c_void, mode: *const c_void);
        pub fn CFRunLoopRun();
        pub static kCFRunLoopCommonModes: *const c_void;
    }

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        pub fn AXIsProcessTrusted() -> bool;
        pub fn AXIsProcessTrustedWithOptions(options: *const c_void) -> bool;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        pub fn CFDictionaryCreate(
            allocator: *const c_void, keys: *const *const c_void, values: *const *const c_void,
            num_values: i64, key_callbacks: *const c_void, value_callbacks: *const c_void,
        ) -> *const c_void;
        pub fn CFBooleanGetValue(b: *const c_void) -> bool;
        pub static kCFBooleanTrue: *const c_void;
    }

    extern "C" {
        pub static kAXTrustedCheckOptionPrompt: *const c_void;
    }
}

static INPUT_COUNTER: AtomicU64 = AtomicU64::new(0);

#[cfg(target_os = "macos")]
unsafe extern "C" fn on_event(
    _proxy: *mut c_void, _etype: macos::CGEventType,
    event: macos::CGEventRef, _info: *mut c_void,
) -> macos::CGEventRef {
    INPUT_COUNTER.fetch_add(1, Ordering::Relaxed);
    event
}

#[tauri::command]
fn open_ax_settings() {
    let _ = std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
        .spawn();
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![open_ax_settings])
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
                        "backpack" => { let _ = window.show(); let _ = app.emit("open-backpack", ()); }
                        "shop" => { let _ = window.show(); let _ = app.emit("open-shop", ()); }
                        "reset" => { let _ = app.emit("reset-data", ()); }
                        "quit" => { app.exit(0); }
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

            // ---- Global input via CGEventTap ----
            #[cfg(target_os = "macos")]
            {
                // Trigger native Accessibility prompt via AXIsProcessTrustedWithOptions
                let trusted = unsafe {
                    let keys = [macos::kAXTrustedCheckOptionPrompt];
                    let values = [macos::kCFBooleanTrue];
                    let opts = macos::CFDictionaryCreate(
                        std::ptr::null(),
                        keys.as_ptr(),
                        values.as_ptr(),
                        1,
                        std::ptr::null(),
                        std::ptr::null(),
                    );
                    macos::AXIsProcessTrustedWithOptions(opts)
                };
                // Trigger native Input Monitoring prompt
                unsafe { macos::IOHIDRequestAccess(macos::K_IOHID_REQUEST_TYPE_LISTEN_EVENT); }
                let app_handle = app.handle().clone();

                if !trusted {
                    let h = app.handle().clone();
                    thread::spawn(move || {
                        thread::sleep(Duration::from_millis(500));
                        let _ = h.emit("accessibility-needed", ());
                    });
                }

                thread::spawn(move || {
                    unsafe {
                        let mask = macos::mask_bit(macos::KEY_DOWN)
                            | macos::mask_bit(macos::MOUSE_MOVED)
                            | macos::mask_bit(macos::LEFT_MOUSE_DOWN)
                            | macos::mask_bit(macos::RIGHT_MOUSE_DOWN)
                            | macos::mask_bit(macos::OTHER_MOUSE_DOWN);

                        let tap = macos::CGEventTapCreate(
                            1, 0, 1, mask, on_event, std::ptr::null_mut(),
                        );

                        if tap.is_null() {
                            let _ = app_handle.emit("input-tap-failed", ());
                            return;
                        }

                        macos::CGEventTapEnable(tap, true);
                        let _ = app_handle.emit("input-tap-ok", ());

                        let source = macos::CFMachPortCreateRunLoopSource(
                            std::ptr::null(), tap, 0,
                        );
                        let rl = macos::CFRunLoopGetCurrent();
                        macos::CFRunLoopAddSource(rl, source, macos::kCFRunLoopCommonModes);

                        // Poll counter → emit Tauri events
                        let h2 = app_handle.clone();
                        thread::spawn(move || {
                            let mut last = 0u64;
                            let mut tick = 0u64;
                            loop {
                                thread::sleep(Duration::from_millis(30));
                                let cur = INPUT_COUNTER.load(Ordering::Relaxed);
                                if cur != last {
                                    let _ = h2.emit("global-input", cur);
                                    last = cur;
                                }
                                tick += 1;
                                if tick % 30 == 0 { // every ~900ms, debug heartbeat
                                    let _ = h2.emit("input-heartbeat", cur);
                                }
                            }
                        });

                        macos::CFRunLoopRun(); // blocks
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
