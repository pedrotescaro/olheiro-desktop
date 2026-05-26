use std::{
    net::{SocketAddr, TcpStream},
    process::{Child, Command, Stdio},
    sync::Mutex,
    time::Duration,
};

use tauri::{Manager, WindowEvent};

struct BackendProcess(Mutex<Option<Child>>);

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let backend = spawn_backend(app);
            app.manage(BackendProcess(Mutex::new(backend)));
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed) {
                let state = window.state::<BackendProcess>();
                if let Ok(mut backend) = state.0.lock() {
                    if let Some(child) = backend.as_mut() {
                        terminate_backend(child);
                    }
                    *backend = None;
                };
            }
        })
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Olheiro");
}

fn spawn_backend(app: &tauri::App) -> Option<Child> {
    if backend_port_is_open() {
        return None;
    }

    for path in backend_candidates(app) {
        if path.exists() {
            let mut command = Command::new(path);
            command.env("OLHEIRO_PARENT_PID", std::process::id().to_string());
            hide_console(&mut command);
            if let Ok(child) = command.spawn() {
                wait_for_backend();
                return Some(child);
            }
        }
    }
    None
}

fn backend_candidates(app: &tauri::App) -> Vec<std::path::PathBuf> {
    let mut paths = Vec::new();
    if let Ok(path) = app
        .path()
        .resolve("olheiro-backend.exe", tauri::path::BaseDirectory::Resource)
    {
        paths.push(path);
    }
    if let Ok(path) = app
        .path()
        .resolve("resources/olheiro-backend.exe", tauri::path::BaseDirectory::Resource)
    {
        paths.push(path);
    }
    if let Ok(current_dir) = std::env::current_dir() {
        paths.push(current_dir.join("src-tauri/resources/olheiro-backend.exe"));
        paths.push(current_dir.join("resources/olheiro-backend.exe"));
        paths.push(current_dir.join("olheiro-backend.exe"));
    }
    paths
}

fn backend_port_is_open() -> bool {
    let address: SocketAddr = "127.0.0.1:8765".parse().expect("valid backend address");
    TcpStream::connect_timeout(&address, Duration::from_millis(250)).is_ok()
}

fn wait_for_backend() {
    for _ in 0..30 {
        if backend_port_is_open() {
            return;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}

#[cfg(windows)]
fn terminate_backend(child: &mut Child) {
    let pid = child.id().to_string();
    let mut command = Command::new("taskkill");
    command
        .args(["/PID", &pid, "/T", "/F"])
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    hide_console(&mut command);
    let _ = command.status();
}

#[cfg(not(windows))]
fn terminate_backend(child: &mut Child) {
    let _ = child.kill();
}

#[cfg(windows)]
fn hide_console(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn hide_console(_command: &mut Command) {}
