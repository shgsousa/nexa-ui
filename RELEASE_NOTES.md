# 🚀 Nexa UI v0.1.0 — Initial Release

The first public release of **Nexa UI**, a modern desktop application for managing and interacting with [Nexa SDK](https://github.com/NexaAI/nexa-sdk) AI models locally. Built with Tauri v2, React 19, TypeScript, and a Rust backend.

## ✨ Features

- **📊 Hardware Dashboard** — Real-time monitoring of CPU, RAM, GPU, and NPU usage with live-updating area charts. Supports NVIDIA (via `nvidia-smi`), Adreno/Snapdragon (via WMI), and Xilinx/Nexa NPU detection.

- **📚 Model Library** — Browse, download, and manage Nexa SDK models. Includes real-time download progress, model type selection (LLM, VLM, etc.), download cancellation, and model removal.

- **🧪 Inference Playground** — Chat interface for local LLMs with streaming responses (SSE), Markdown rendering, reasoning mode toggle, and persistent chat history.

- **⚙️ Settings** — Configure HuggingFace token, Nexa SDK token, data directory, and log level. Settings persisted via Tauri Store plugin.

- **🛡️ Backend Reliability** — Automatic server watchdog with 5-second health checks and proper process cleanup.

## 🏗️ Tech Stack

| Layer | Technology |
|:------|:-----------|
| Framework | Tauri v2 |
| Frontend | React 19 + TypeScript |
| Bundler | Vite 7 |
| Styling | Tailwind CSS 3 |
| Backend | Rust (sysinfo, wmi, tokio) |

## 📋 Requirements

- Windows (ARM64)
- [Nexa CLI / SDK](https://github.com/NexaAI/nexa-sdk) installed and available on your system

## 📦 Installation

Download the `.msi` installer from the **Assets** section below and run it.
