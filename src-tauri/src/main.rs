#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager,
};
use serde::Deserialize;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

#[cfg(all(target_os = "macos", not(feature = "appstore")))]
use std::ffi::c_void;

// ---- macOS CoreGraphics Event Tap (global input monitoring) ----
// App Store 版不能为非辅助用途请求 Accessibility/Input Monitoring 权限。
#[cfg(all(target_os = "macos", not(feature = "appstore")))]
mod macos {
    use std::ffi::c_void;

    pub type CGEventRef = *mut c_void;
    pub type CGEventMask = u64;
    pub type CGEventType = u32;

    pub const KEY_DOWN: CGEventType = 10;
    pub const LEFT_MOUSE_DOWN: CGEventType = 1;
    pub const RIGHT_MOUSE_DOWN: CGEventType = 3;
    pub const MOUSE_MOVED: CGEventType = 5;
    pub const LEFT_MOUSE_DRAGGED: CGEventType = 6;
    pub const RIGHT_MOUSE_DRAGGED: CGEventType = 7;
    pub const OTHER_MOUSE_DOWN: CGEventType = 25;
    pub const OTHER_MOUSE_DRAGGED: CGEventType = 27;

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
        pub static kCFBooleanTrue: *const c_void;
    }

    extern "C" {
        pub static kAXTrustedCheckOptionPrompt: *const c_void;
    }
}

static KEY_COUNTER: AtomicU64 = AtomicU64::new(0);
static MOUSE_COUNTER: AtomicU64 = AtomicU64::new(0);
static MOUSE_MOVE_COUNTER: AtomicU64 = AtomicU64::new(0);
static INTERACTIVE_UNTIL: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Debug, Deserialize)]
struct UiRegion {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

type InteractiveRegions = Arc<Mutex<Vec<UiRegion>>>;

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn wake_interactive_for(ms: u64) {
    INTERACTIVE_UNTIL.store(now_millis().saturating_add(ms), Ordering::Relaxed);
}

fn place_window_on_primary(app: &tauri::AppHandle, window: &tauri::WebviewWindow) {
    #[cfg(feature = "appstore")]
    {
        #[cfg(target_os = "macos")]
        {
            let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
            let _ = app.show();
        }
        let _ = window.set_ignore_cursor_events(false);
        let _ = window.set_size(tauri::LogicalSize::new(900.0, 520.0));
        let _ = window.center();
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.request_user_attention(Some(tauri::UserAttentionType::Informational));
        return;
    }
    #[cfg(not(feature = "appstore"))]
    {
        if let Ok(Some(monitor)) = app.primary_monitor() {
            let pos = monitor.position();
            let size = monitor.size();
            let scale = monitor.scale_factor();
            let left = pos.x as f64 / scale;
            let top = pos.y as f64 / scale;
            let sw = size.width as f64 / scale;
            let sh = size.height as f64 / scale;
            let ww = 640.0_f64.min(sw.max(360.0));
            let wh = 180.0_f64.min(sh.max(120.0));
            let x = left + ((sw - ww) / 2.0).max(16.0);
            let y = top + (sh - wh - 80.0).max(24.0);
            let _ = window.set_size(tauri::LogicalSize::new(ww, wh));
            let _ = window.set_position(tauri::LogicalPosition::new(x, y));
        }
    }
}

#[cfg(all(target_os = "macos", not(feature = "appstore")))]
unsafe extern "C" fn on_event(
    _proxy: *mut c_void, etype: macos::CGEventType,
    event: macos::CGEventRef, _info: *mut c_void,
) -> macos::CGEventRef {
    if etype == macos::KEY_DOWN {
        KEY_COUNTER.fetch_add(1, Ordering::Relaxed);
    } else if etype == macos::LEFT_MOUSE_DOWN
        || etype == macos::RIGHT_MOUSE_DOWN
        || etype == macos::OTHER_MOUSE_DOWN {
        MOUSE_COUNTER.fetch_add(1, Ordering::Relaxed);
    } else if etype == macos::MOUSE_MOVED
        || etype == macos::LEFT_MOUSE_DRAGGED
        || etype == macos::RIGHT_MOUSE_DRAGGED
        || etype == macos::OTHER_MOUSE_DRAGGED {
        MOUSE_MOVE_COUNTER.fetch_add(1, Ordering::Relaxed);
    }
    event
}

#[cfg(not(feature = "appstore"))]
#[tauri::command]
fn open_ax_settings() {
    let _ = std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
        .spawn();
}

#[cfg(not(feature = "appstore"))]
#[tauri::command]
fn open_input_settings() {
    let _ = std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent")
        .spawn();
}

#[tauri::command]
fn build_channel() -> &'static str {
    if cfg!(feature = "appstore") {
        "appstore"
    } else {
        "desktop"
    }
}

#[tauri::command]
fn set_interactive_regions(regions: Vec<UiRegion>, state: tauri::State<'_, InteractiveRegions>) {
    if let Ok(mut current) = state.lock() {
        *current = regions;
    }
}

fn point_in_region(x: f64, y: f64, regions: &[UiRegion]) -> bool {
    regions.iter().any(|r| x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)
}

fn start_click_through_guard(app: tauri::AppHandle, regions: InteractiveRegions) {
    thread::spawn(move || {
        let mut ignoring = false;
        loop {
            thread::sleep(Duration::from_millis(16));
            let Some(window) = app.get_webview_window("main") else {
                continue;
            };
            let visible = window.is_visible().unwrap_or(false);
            if !visible {
                continue;
            }
            let Ok(cursor) = app.cursor_position() else {
                continue;
            };
            let Ok(pos) = window.outer_position() else {
                continue;
            };
            let Ok(size) = window.inner_size() else {
                continue;
            };
            let scale = window.scale_factor().unwrap_or(1.0).max(0.5);
            let raw_x = cursor.x - pos.x as f64;
            let raw_y = cursor.y - pos.y as f64;
            let local_x = raw_x / scale;
            let local_y = raw_y / scale;
            let window_w = size.width as f64 / scale;
            let window_h = size.height as f64 / scale;
            let raw_window_w = size.width as f64;
            let raw_window_h = size.height as f64;
            let region_list = regions.lock().map(|r| r.clone()).unwrap_or_default();
            let forced_by_window_event = now_millis() < INTERACTIVE_UNTIL.load(Ordering::Relaxed);
            let on_secondary_monitor = match (window.current_monitor(), app.primary_monitor()) {
                (Ok(Some(current)), Ok(Some(primary))) => {
                    let current_pos = current.position();
                    let primary_pos = primary.position();
                    let current_size = current.size();
                    let primary_size = primary.size();
                    current_pos.x != primary_pos.x
                        || current_pos.y != primary_pos.y
                        || current_size.width != primary_size.width
                        || current_size.height != primary_size.height
                }
                _ => false,
            };
            let check_css = |x: f64, y: f64, w: f64, h: f64, use_regions: bool| {
                let inside = x >= -10.0 && y >= -10.0 && x <= w + 10.0 && y <= h + 10.0;
                if !inside {
                    return false;
                }
                let reported_region = use_regions && point_in_region(x, y, &region_list);
                let toolbar_fallback = x >= w - 380.0 && y >= h - 64.0;
                let drag_fallback = x <= 64.0 && y >= h - 86.0 && y <= h - 16.0;
                reported_region || toolbar_fallback || drag_fallback
            };
            // 多屏/不同缩放下, Tauri 和 WebView 可能分别给出物理或逻辑坐标。
            // 同时尝试几种换算, 避免拖到副屏后窗口一直停在鼠标穿透状态。
            let over_ui = forced_by_window_event
                || on_secondary_monitor
                || check_css(local_x, local_y, window_w, window_h, true)
                || check_css(raw_x, raw_y, window_w, window_h, true)
                || check_css(cursor.x - pos.x as f64 / scale, cursor.y - pos.y as f64 / scale, window_w, window_h, true)
                || check_css(cursor.x / scale - pos.x as f64, cursor.y / scale - pos.y as f64, window_w, window_h, true)
                || check_css(raw_x, raw_y, raw_window_w, raw_window_h, false);
            let next_ignoring = !over_ui;
            if next_ignoring != ignoring {
                if window.set_ignore_cursor_events(next_ignoring).is_ok() {
                    ignoring = next_ignoring;
                }
            }
        }
    });
}

fn main() {
    let builder = tauri::Builder::default()
        .manage(Arc::new(Mutex::new(Vec::<UiRegion>::new())))
        .plugin(tauri_plugin_shell::init());

    #[cfg(feature = "appstore")]
    let builder =
        builder.invoke_handler(tauri::generate_handler![set_interactive_regions, build_channel]);

    #[cfg(not(feature = "appstore"))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        open_ax_settings,
        open_input_settings,
        set_interactive_regions,
        build_channel
    ]);

    builder
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "Show / Hide", true, None::<&str>)?;
            let backpack = MenuItem::with_id(app, "backpack", "Backpack", true, None::<&str>)?;
            let shop = MenuItem::with_id(app, "shop", "Shop", true, None::<&str>)?;
            let reset = MenuItem::with_id(app, "reset", "Reset Save", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &backpack, &shop, &reset, &quit])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("BondCat")
                .menu(&menu)
                .on_menu_event(|app, event| {
                    let window = app.get_webview_window("main").unwrap();
                    match event.id.as_ref() {
                        "show" => {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                place_window_on_primary(app, &window);
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "backpack" => { place_window_on_primary(app, &window); let _ = window.show(); let _ = app.emit("open-backpack", ()); }
                        "shop" => { place_window_on_primary(app, &window); let _ = window.show(); let _ = app.emit("open-shop", ()); }
                        "reset" => { let _ = app.emit("reset-data", ()); }
                        "quit" => { app.exit(0); }
                        _ => {}
                    }
                })
                .build(app)?;

            let window = app.get_webview_window("main").unwrap();
            let window_for_events = window.clone();
            #[cfg(feature = "appstore")]
            let app_for_close = app.handle().clone();
            window.on_window_event(move |event| match event {
                #[cfg(feature = "appstore")]
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    app_for_close.exit(0);
                }
                tauri::WindowEvent::Moved(_)
                | tauri::WindowEvent::Focused(true)
                | tauri::WindowEvent::Resized(_)
                | tauri::WindowEvent::ScaleFactorChanged { .. } => {
                    wake_interactive_for(8_000);
                    let _ = window_for_events.set_ignore_cursor_events(false);
                }
                _ => {}
            });
            wake_interactive_for(3_000);
            place_window_on_primary(app.handle(), &window);
            #[cfg(feature = "appstore")]
            {
                let _ = window.set_focus();
            }
            #[cfg(not(feature = "appstore"))]
            start_click_through_guard(app.handle().clone(), app.state::<InteractiveRegions>().inner().clone());

            // ---- Global input: Windows/Linux via rdev ----
            #[cfg(not(target_os = "macos"))]
            {
                let app_handle = app.handle().clone();
                // Poll-emit thread (同 mac 分支, 读取 KEY/MOUSE_COUNTER 发事件)
                let h_poll = app_handle.clone();
                thread::spawn(move || {
                    let mut last_total = 0u64;
                    let mut tick = 0u64;
                    loop {
                        thread::sleep(Duration::from_millis(30));
                        let k = KEY_COUNTER.load(Ordering::Relaxed);
                        let m = MOUSE_COUNTER.load(Ordering::Relaxed);
                        let mv = MOUSE_MOVE_COUNTER.load(Ordering::Relaxed);
                        let total = k + m + mv;
                        if total != last_total {
                            let _ = h_poll.emit("global-input", serde_json::json!({"k": k, "m": m, "mv": mv}));
                            last_total = total;
                        }
                        tick += 1;
                        if tick % 20 == 0 {
                            let _ = h_poll.emit("input-heartbeat", serde_json::json!({"k": k, "m": m, "mv": mv}));
                            let _ = h_poll.emit("input-tap-ok", ());
                        }
                    }
                });
                // rdev::listen 阻塞, 放独立线程
                thread::spawn(move || {
                    use rdev::{listen, Event, EventType};
                    if let Err(e) = listen(|event: Event| {
                        match event.event_type {
                            EventType::KeyPress(_) => {
                                KEY_COUNTER.fetch_add(1, Ordering::Relaxed);
                            }
                            EventType::ButtonPress(_) => {
                                MOUSE_COUNTER.fetch_add(1, Ordering::Relaxed);
                            }
                            EventType::MouseMove { .. } => {
                                MOUSE_MOVE_COUNTER.fetch_add(1, Ordering::Relaxed);
                            }
                            _ => {}
                        }
                    }) {
                        eprintln!("rdev listen failed: {:?}", e);
                        let _ = app_handle.emit("input-tap-failed", ());
                    }
                });
            }

            // ---- Global input via CGEventTap (macOS) ----
            #[cfg(all(target_os = "macos", not(feature = "appstore")))]
            {
                // 已授权时不要每次启动都触发系统权限弹窗。
                let trusted = unsafe { macos::AXIsProcessTrusted() };
                let trusted = if trusted {
                    true
                } else {
                    unsafe {
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
                    }
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
                            | macos::mask_bit(macos::LEFT_MOUSE_DOWN)
                            | macos::mask_bit(macos::RIGHT_MOUSE_DOWN)
                            | macos::mask_bit(macos::OTHER_MOUSE_DOWN)
                            | macos::mask_bit(macos::MOUSE_MOVED)
                            | macos::mask_bit(macos::LEFT_MOUSE_DRAGGED)
                            | macos::mask_bit(macos::RIGHT_MOUSE_DRAGGED)
                            | macos::mask_bit(macos::OTHER_MOUSE_DRAGGED);

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
                            let mut last_total = 0u64;
                            let mut tick = 0u64;
                            loop {
                                thread::sleep(Duration::from_millis(30));
                                let k = KEY_COUNTER.load(Ordering::Relaxed);
                                let m = MOUSE_COUNTER.load(Ordering::Relaxed);
                                let mv = MOUSE_MOVE_COUNTER.load(Ordering::Relaxed);
                                let total = k + m + mv;
                                if total != last_total {
                                    let _ = h2.emit("global-input", serde_json::json!({"k": k, "m": m, "mv": mv}));
                                    last_total = total;
                                }
                                tick += 1;
                                if tick % 20 == 0 {
                                    let _ = h2.emit("input-heartbeat", serde_json::json!({"k": k, "m": m, "mv": mv}));
                                    let _ = h2.emit("input-tap-ok", ());
                                }
                            }
                        });

                        macos::CFRunLoopRun(); // blocks
                    }
                });
            }

            #[cfg(all(target_os = "macos", feature = "appstore"))]
            {
                let h = app.handle().clone();
                thread::spawn(move || {
                    thread::sleep(Duration::from_millis(250));
                    let _ = h.emit("appstore-window-mode", ());
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
