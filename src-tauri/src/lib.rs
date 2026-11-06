use tauri_plugin_sql::{Migration, MigrationKind};

/// Open a system terminal for advanced Ollama control (`ollama list`, `pull`, etc.).
#[tauri::command]
fn open_terminal() -> Result<(), String> {
    open_system_terminal().map_err(|err| err.to_string())
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
        .invoke_handler(tauri::generate_handler![open_terminal])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
