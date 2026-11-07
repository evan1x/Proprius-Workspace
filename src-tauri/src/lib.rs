use serde::Serialize;
use tauri_plugin_sql::{Migration, MigrationKind};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HardwareInfo {
    os_name: String,
    os_version: String,
    hostname: String,
    arch: String,
    cpu_brand: String,
    cpu_cores_physical: usize,
    cpu_cores_logical: usize,
    total_memory_bytes: u64,
    available_memory_bytes: u64,
    gpus: Vec<String>,
}

/// Detect local machine hardware for display in Settings.
#[tauri::command]
fn get_hardware_info() -> Result<HardwareInfo, String> {
    use sysinfo::{CpuRefreshKind, MemoryRefreshKind, RefreshKind, System};

    let mut system = System::new_with_specifics(
        RefreshKind::nothing()
            .with_cpu(CpuRefreshKind::everything())
            .with_memory(MemoryRefreshKind::everything()),
    );
    system.refresh_cpu_all();
    system.refresh_memory();

    let cpu_brand = system
        .cpus()
        .first()
        .map(|cpu| cpu.brand().trim().to_string())
        .filter(|brand| !brand.is_empty())
        .unwrap_or_else(|| "Unknown CPU".to_string());

    Ok(HardwareInfo {
        os_name: System::name().unwrap_or_else(|| "Unknown OS".to_string()),
        os_version: System::os_version().unwrap_or_else(|| "Unknown".to_string()),
        hostname: System::host_name().unwrap_or_else(|| "Unknown".to_string()),
        arch: System::cpu_arch(),
        cpu_brand,
        cpu_cores_physical: system.physical_core_count().unwrap_or(0),
        cpu_cores_logical: system.cpus().len(),
        total_memory_bytes: system.total_memory(),
        available_memory_bytes: system.available_memory(),
        gpus: detect_gpus(),
    })
}

fn detect_gpus() -> Vec<String> {
    #[cfg(target_os = "windows")]
    {
        let output = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name",
            ])
            .output();

        if let Ok(output) = output {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let gpus: Vec<String> = stdout
                    .lines()
                    .map(|line| line.trim().to_string())
                    .filter(|line| !line.is_empty())
                    .collect();
                if !gpus.is_empty() {
                    return gpus;
                }
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        let output = std::process::Command::new("system_profiler")
            .args(["SPDisplaysDataType", "-json"])
            .output();

        if let Ok(output) = output {
            if output.status.success() {
                if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&output.stdout) {
                    let mut gpus = Vec::new();
                    if let Some(items) = json
                        .get("SPDisplaysDataType")
                        .and_then(|value| value.as_array())
                    {
                        for item in items {
                            if let Some(name) = item
                                .get("sppci_model")
                                .or_else(|| item.get("_name"))
                                .and_then(|value| value.as_str())
                            {
                                let trimmed = name.trim();
                                if !trimmed.is_empty() {
                                    gpus.push(trimmed.to_string());
                                }
                            }
                        }
                    }
                    if !gpus.is_empty() {
                        return gpus;
                    }
                }
            }
        }
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let output = std::process::Command::new("sh")
            .args([
                "-c",
                "lspci 2>/dev/null | grep -iE 'vga|3d|display' || true",
            ])
            .output();

        if let Ok(output) = output {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let gpus: Vec<String> = stdout
                    .lines()
                    .filter_map(|line| {
                        line.split(": ").nth(1).map(|value| value.trim().to_string())
                    })
                    .filter(|line| !line.is_empty())
                    .collect();
                if !gpus.is_empty() {
                    return gpus;
                }
            }
        }
    }

    Vec::new()
}

/// Open a system terminal for advanced Ollama control (`ollama list`, `pull`, etc.).
#[tauri::command]
fn open_terminal() -> Result<(), String> {
    open_system_terminal().map_err(|err| err.to_string())
}

/// Fetch HTML from ollama.com (library / search) so the UI can mirror the website catalog.
#[tauri::command]
async fn fetch_ollama_html(path: String) -> Result<String, String> {
    if !path.starts_with('/') || path.contains("://") || path.contains("..") {
        return Err("Only relative ollama.com paths are allowed.".into());
    }

    let url = format!("https://ollama.com{path}");
    let response = reqwest::Client::new()
        .get(&url)
        .header(
            "User-Agent",
            "PropriusWorkspace/0.1 (+https://github.com/evan1x/Proprius-Workspace)",
        )
        .header("Accept", "text/html")
        .send()
        .await
        .map_err(|err| format!("Failed to reach ollama.com: {err}"))?;

    if !response.status().is_success() {
        return Err(format!("ollama.com returned HTTP {}", response.status()));
    }

    response
        .text()
        .await
        .map_err(|err| format!("Failed to read ollama.com response: {err}"))
}

fn open_system_terminal() -> std::io::Result<()> {
    #[cfg(target_os = "windows")]
    {
        // Prefer Windows Terminal when available; otherwise open cmd.
        if std::process::Command::new("wt.exe").spawn().is_ok() {
            return Ok(());
        }

        // `start`'s first quoted arg is the window title — keep it empty.
        std::process::Command::new("cmd.exe")
            .args(["/c", "start", "", "cmd.exe"])
            .spawn()?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-a", "Terminal"])
            .spawn()?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        const CANDIDATES: &[&[&str]] = &[
            &["x-terminal-emulator"],
            &["gnome-terminal"],
            &["konsole"],
            &["xfce4-terminal"],
            &["alacritty"],
            &["kitty"],
            &["xterm"],
        ];

        for candidate in CANDIDATES {
            if std::process::Command::new(candidate[0]).spawn().is_ok() {
                return Ok(());
            }
        }

        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "No supported terminal emulator found.",
        ));
    }

    #[cfg(not(any(
        target_os = "windows",
        target_os = "macos",
        all(unix, not(target_os = "macos"))
    )))]
    {
        Err(std::io::Error::new(
            std::io::ErrorKind::Unsupported,
            "Opening a terminal is not supported on this platform.",
        ))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "create_conversations_and_messages",
        sql: r#"
            CREATE TABLE IF NOT EXISTS conversations (
              id TEXT PRIMARY KEY NOT NULL,
              title TEXT NOT NULL,
              updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS messages (
              id TEXT PRIMARY KEY NOT NULL,
              conversation_id TEXT NOT NULL,
              role TEXT NOT NULL,
              content TEXT NOT NULL,
              created_at INTEGER NOT NULL,
              FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
              ON messages(conversation_id);

            CREATE INDEX IF NOT EXISTS idx_conversations_updated_at
              ON conversations(updated_at DESC);
        "#,
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:proprius.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            open_terminal,
            fetch_ollama_html,
            get_hardware_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
