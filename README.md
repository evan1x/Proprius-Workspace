# Proprius Workspace

Proprius Workspace is a private, all-in-one desktop application for running and managing local large language models.
The goal of Proprius is to provide users with a streamlined AI workspace while keeping conversations, files, and model interactions on their own machine.

## Current Status

Early desktop shell is in place: a **Tauri + React** app launches with a chat interface for sending prompts and viewing responses.
Local LLM / Ollama integration is not wired yet — replies currently come from a placeholder service.

## Prerequisites

- [Node.js](https://nodejs.org/) (LTS)
- [Rust](https://www.rust-lang.org/tools/install) (via rustup)
- On Windows: [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the **Desktop development with C++** workload
- WebView2 (included with recent Windows 10/11)

## Getting Started

```bash
npm install
npm run tauri dev
```

This starts the Vite frontend and opens the Proprius desktop window.

### Useful scripts

| Command | Description |
|---|---|
| `npm run tauri dev` | Run the desktop app in development mode |
| `npm run build` | Type-check and build the frontend |
| `npm run tauri build` | Produce a packaged desktop installer |

## Planned Features

* Local LLM downloading and management
* Model selection and parameter configuration
* Organized conversations and folders
* File attachments and code-formatted responses
* Hardware detection and model recommendations
* Multiple chat workspaces
* Generated file storage and organization
* Clean and user-friendly desktop interface

## Tech Stack

* **Frontend:** React, TypeScript, Tailwind CSS
* **Desktop Framework:** Tauri 2
* **Backend:** Rust
* **Database:** SQLite (planned)
* **Local LLM Integration:** Ollama (planned)
* **Version Control:** Git and GitHub

## Team Members

* Evan Nickason
* Quintin Bird
* Jithin Anil Peter
* Mailles Jonathan Cortes MacHiana

## Course

Proprius Workspace is part of **COMP 3415 – Software Engineering** at Lakehead University.
