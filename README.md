# SuperBrain AI

SuperBrain AI is a **desktop AI chat application** built with **ElectronJS** and **Ollama**, designed to run **completely offline**. Manage local AI models, track chat history, adjust creativity, and interact with your AI securely — no internet required.

---

## Features

- **Offline AI Models:** Download and manage Ollama models locally.
- **Multiple Models:** Easily switch between installed models.
- **Chat History:** View, delete, or clear all chat history.
- **Creativity Control:** Adjust AI responses from logical to creative.
- **Performance Monitoring:** Response time, tokens/sec, memory usage.
- **Bittensor Mining:** Built-in TAO mining and pool earnings dashboard.
- **RAG System:** Ingest documents and query them with local LLMs.
- **Privacy First:** All data is stored locally; no external servers.
- **Dark & Light Mode:** Theme-aware UI for comfortable usage.
- **Responsive UI:** Optimized for desktop screens.

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- [Ollama](https://ollama.com/) installed and running locally
- npm (comes with Node.js)

---

## Installation

```bash
git clone https://github.com/KatchDaVizion/superbrain-desktop-work.git
cd superbrain-desktop-work
npm install
```

## Development

```bash
npm run dev
```

## Build

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

---

## Tech Stack

- **Electron** — Cross-platform desktop framework
- **React 19** — UI library
- **TypeScript** — Type-safe JavaScript
- **Vite** — Fast build tooling
- **Tailwind CSS** — Utility-first styling
- **shadcn/ui** — Component library
- **LangChain** — LLM orchestration and RAG

---

## License

MIT — David Louis-Charles ([KatchDaVizion](https://github.com/KatchDaVizion))
