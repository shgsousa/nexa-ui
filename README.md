# Nexa UI

A modern desktop application for managing and interacting with [Nexa SDK](https://github.com/NexaAI/nexa-sdk) AI models locally. Built with **Tauri v2**, **React 19**, **TypeScript**, and a **Rust** backend, Nexa UI provides real-time hardware monitoring, model management, and a chat-based inference playground — all running entirely on your machine.

---

## ✨ Features

### 📊 Hardware Dashboard
- **Real-time monitoring** of CPU, RAM, GPU, and NPU usage with live-updating area charts powered by [Recharts](https://recharts.org/)
- **Multi-source hardware detection**:
  - CPU & RAM via [`sysinfo`](https://crates.io/crates/sysinfo)
  - GPU via `nvidia-smi` (NVIDIA) or WMI performance counters (Adreno/Snapdragon)
  - NPU via `xrt-smi` (Xilinx/Nexa) or WMI compute engine detection (Snapdragon X Elite)
- Metric cards with at-a-glance percentage readouts
- Rolling 20-sample history with gradient-filled charts

### 📚 Model Library
- **Browse and manage** locally downloaded Nexa SDK models
- **Pull new models** directly from the Nexa model hub with real-time download progress tracking
- **Model type selection** — automatically detects when a model offers multiple types (LLM, VLM, etc.) and prompts you to choose
- **Cancel downloads** in progress
- **Remove models** you no longer need
- Search and filter models by name

### 🧪 Inference Playground
- **Chat interface** for interacting with local LLMs via the Nexa SDK server
- **Streaming responses** using Server-Sent Events (SSE) for real-time token output
- **Markdown rendering** with GFM support via `react-markdown` and `remark-gfm`
- **Reasoning mode toggle** — enable/disable `enable_think` for models that support chain-of-thought reasoning
- **Model selector** — switch between locally served models
- **Server lifecycle control** — start/stop the Nexa inference server (`nexa serve`) directly from the UI
- **Persistent chat history** saved to `localStorage`
- Copy, delete messages, or clear the entire conversation

### ⚙️ Settings
- Configure **HuggingFace Token** (`NEXA_HFTOKEN`) for gated model access
- Configure **Nexa SDK Token** (`NEXA_TOKEN`)
- Set custom **data directory** (`NEXA_DATADIR`) with a native folder picker
- Adjust **log level** (`NEXA_LOG_LEVEL`)
- Settings persisted to disk via the [Tauri Store plugin](https://v2.tauri.app/plugin/store/)

### 🛡️ Backend Reliability
- **Automatic server restart** — a background watchdog checks the inference server every 5 seconds and restarts it if it becomes unresponsive
- **Process management** — proper cleanup of spawned child processes on stop/cancel

---

## 🏗️ Tech Stack

| Layer      | Technology                                                                          |
|:-----------|:------------------------------------------------------------------------------------|
| Framework  | [Tauri v2](https://v2.tauri.app/) — lightweight, secure desktop app framework       |
| Frontend   | [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)      |
| Bundler    | [Vite 7](https://vite.dev/)                                                         |
| Styling    | [Tailwind CSS 3](https://tailwindcss.com/) with HSL CSS-variable design tokens      |
| Charts     | [Recharts](https://recharts.org/)                                                   |
| Icons      | [Lucide React](https://lucide.dev/)                                                 |
| Markdown   | [react-markdown](https://github.com/remarkjs/react-markdown) + remark-gfm          |
| Backend    | Rust — with `sysinfo`, `wmi`, `serde_json`, `tokio`                                |
| AI Runtime | [Nexa CLI / SDK](https://github.com/NexaAI/nexa-sdk) (external dependency)          |

---

## 📋 Prerequisites

- **[Node.js](https://nodejs.org/)** (v18+)
- **[Rust](https://www.rust-lang.org/tools/install)** (stable toolchain)
- **[Nexa CLI](https://github.com/NexaAI/nexa-sdk)** — installed and available on your system
- **Windows** — the backend uses Windows-specific APIs (`wmi`, `CommandExt`, `taskkill`)

---

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/your-username/nexa-ui.git
cd nexa-ui
```

### 2. Install frontend dependencies

```bash
npm install
```

### 3. Run in development mode

```bash
npm run tauri dev
```

This starts the Vite dev server on `http://localhost:1420` and launches the Tauri window with hot-reload enabled.

### 4. Build for production

```bash
npm run tauri build
```

The compiled installer/binary will be output to `src-tauri/target/release/bundle/`.

---

## 📁 Project Structure

```
nexa-ui/
├── src/                          # React frontend
│   ├── App.tsx                   # Main layout with sidebar navigation
│   ├── main.tsx                  # React entry point
│   ├── index.css                 # Global styles & CSS variables
│   ├── App.css                   # App-specific styles
│   └── components/
│       ├── HardwareDashboard.tsx  # Real-time CPU/RAM/GPU/NPU monitoring
│       ├── ModelLibrary.tsx       # Model browser, download, and management
│       ├── InferencePlayground.tsx # Chat UI with streaming inference
│       └── SettingsPane.tsx       # Configuration panel
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── lib.rs                # Tauri commands & application logic
│   │   └── main.rs               # Entry point
│   ├── Cargo.toml                # Rust dependencies
│   ├── tauri.conf.json           # Tauri app configuration
│   └── capabilities/
│       └── default.json          # Permission declarations
├── package.json                  # Node dependencies & scripts
├── vite.config.ts                # Vite configuration (Tauri-optimized)
├── tailwind.config.js            # Tailwind CSS theme & design tokens
├── tsconfig.json                 # TypeScript configuration
└── postcss.config.js             # PostCSS plugins
```

---

## 🔧 Tauri Commands (IPC API)

The Rust backend exposes these commands to the frontend via Tauri's IPC:

| Command               | Description                                                 |
|:-----------------------|:------------------------------------------------------------|
| `get_hardware_stats`   | Returns live CPU, RAM, GPU, and NPU usage percentages       |
| `get_local_models`     | Lists all models downloaded via `nexa list`                 |
| `run_nexa_command`     | Executes an arbitrary `nexa` CLI command                    |
| `nexa_pull_model`      | Downloads a model with real-time progress events            |
| `cancel_pull`          | Cancels an in-progress model download                       |
| `start_nexa_serve`     | Starts the Nexa inference server for a given model          |
| `stop_nexa_serve`      | Stops the running inference server                          |
| `check_server_health`  | Returns `true` if the server on port `18181` is reachable   |

---

## 🎨 Design

The UI follows a **dark-mode-first** design with a slate color palette, glassmorphism-inspired cards, and subtle gradient glow effects. The collapsible sidebar navigation provides access to four main views:

1. **Dashboard** — hardware metrics and charts
2. **Model Library** — download, manage, and launch models
3. **Playground** — chat with local AI models
4. **Settings** — configure tokens and paths

---

## 📝 License

This project is licensed under the [MIT License](LICENSE).
