# Proprius Workspace

Proprius Workspace is a private desktop app for chatting with local large language models. Conversations, generated files, and model traffic stay on your machine. The app talks to [Ollama](https://ollama.com/) at `http://localhost:11434` and stores chats in a local SQLite database.

The default model is **`llama3.2:3b`**.

## Prerequisites

Install these before the first run:

- [Node.js](https://nodejs.org/) 20.19+ or 22.12+ (current LTS is fine)
- [Rust](https://www.rust-lang.org/tools/install) 1.85 or newer, installed with rustup. If Rust is already installed, run `rustup update`.
- [Ollama](https://ollama.com/)

Platform extras:

- **Windows:** [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the **Desktop development with C++** workload, and the WebView2 runtime (already included on current Windows 10 and 11).
- **macOS:** Xcode Command Line Tools (`xcode-select --install`).
- **Linux (Debian or Ubuntu):** WebKitGTK and the usual Tauri build packages:

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

## Setup

### 1. Start Ollama and pull the default model

Install Ollama, then:

```bash
ollama pull llama3.2:3b
```

The Ollama app keeps the local server running. If nothing is listening yet, start it with:

```bash
ollama serve
```

Check that `http://localhost:11434` responds before opening Proprius. The app cannot generate a reply while Ollama is offline. Other models can be downloaded later from the Models panel.

### 2. Install dependencies and run the desktop app

```bash
git clone https://github.com/evan1x/Proprius-Workspace.git
cd Proprius-Workspace
npm install
npm run tauri dev
```

`npm run tauri dev` starts the Vite dev server on port 1420 and opens the Proprius window. The first launch compiles the Rust backend, which can take several minutes. Later launches are much faster.

Use the desktop command rather than `npm run dev` on its own. The Vite site does not include the SQLite database or the other Tauri commands.

### 3. Sign in

Every launch opens a sign-in screen before the workspace. A default account is created the first time the database opens:

| | |
|---|---|
| Username | `admin` |
| Password | `admin` |

1. Enter `admin` and `admin`.
2. Choose **Sign in**.

The header shows the signed-in username. **Sign out** returns to the same screen. The app remembers the last account on this computer, so the next launch skips the form until you sign out.

To add someone else, choose **Create an account** on the sign-in screen. Usernames are 3–32 characters (letters, numbers, underscores, or hyphens) and passwords are 4–128 characters. A new account starts with an empty workspace. Chats, folders, and generated files stay with the account that created them. Anything saved before accounts existed stays on `admin`.

## Scripts

| Command | What it does |
|---|---|
| `npm run tauri dev` | Run the desktop app against the Vite dev server |
| `npm run build` | Type-check and build the frontend only |
| `npm run tauri build` | Build a packaged desktop installer |

`npm run tauri build` needs the same Rust and C++ toolchain as development. The installer output is under `src-tauri/target/release/bundle/`.

## Tech stack

- **Frontend:** React, TypeScript, Tailwind CSS
- **Desktop:** Tauri 2
- **Backend:** Rust
- **Database:** SQLite
- **Models:** Ollama (`llama3.2:3b` by default)

## Team

- Evan Nickason
- Quintin Bird
- Jithin Anil Peter
- Mailles Jonathan Cortes MacHiana

## Course

Proprius Workspace is part of **COMP 3415 – Software Engineering** at Lakehead University.
