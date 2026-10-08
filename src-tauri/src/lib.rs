#[cfg(debug_assertions)]
use tauri::Manager;

// `.open_devtools()` only exists on WebviewWindow when the `devtools` Cargo feature is
// enabled, which a release build deliberately doesn't do — a runtime `if cfg!(debug_assertions)`
// check still compiles the branch's code in every build, so calling it unconditionally would
// fail `tauri build`. Real `#[cfg(debug_assertions)]` conditional compilation (this helper,
// stubbed out entirely for release below) is what actually removes it from the release binary.
// Whether a dev build opens the webview's dev tools on launch. Off by default; flip this to
// `true`, or set the environment variable ORGANISAITOR_DEVTOOLS=1 for one run
// (`$env:ORGANISAITOR_DEVTOOLS=1; npm run tauri dev`). Release builds never open them.
// Dev tools can still be opened by hand in a dev build (Ctrl+Shift+I / right-click → Inspect).
#[cfg(debug_assertions)]
const OPEN_DEVTOOLS_ON_START: bool = false;

#[cfg(debug_assertions)]
fn open_devtools_in_dev(app: &tauri::App) {
    let from_env = std::env::var("ORGANISAITOR_DEVTOOLS").is_ok_and(|v| v == "1" || v.eq_ignore_ascii_case("true"));
    if !(OPEN_DEVTOOLS_ON_START || from_env) {
        return;
    }
    if let Some(window) = app.get_webview_window("main") {
        window.open_devtools();
    }
}

#[cfg(not(debug_assertions))]
fn open_devtools_in_dev(_app: &tauri::App) {}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
                open_devtools_in_dev(app);
            }
            Ok(())
        })
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
