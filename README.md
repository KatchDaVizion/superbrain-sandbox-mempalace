# SuperBrain AI

SuperBrain AI is a **desktop AI chat application** built with **ElectronJS** and **Ollama**. AI inference and your private data stay **offline on your machine**; the app optionally connects to the SuperBrain peer network to share knowledge and earn TAO on the Bittensor chain. You choose what, if anything, leaves your laptop.

---

## Features

### Local AI
- **Offline AI Models:** Download and manage Ollama models locally.
- **Multiple Models:** Easily switch between installed models.
- **Chat History:** View, delete, or clear all chat history.
- **Creativity Control:** Adjust AI responses from logical to creative.
- **Performance Monitoring:** Response time, tokens/sec, memory usage.
- **Privacy First:** You control which data leaves your machine — nothing is sent to OpenAI, Anthropic, or any cloud AI provider.

### SN442 Knowledge Network (Bittensor Subnet 442)
- **Bittensor Mining:** Register a hotkey and earn TAO by contributing validated knowledge chunks to SN442.
- **RAG over the network:** Ask questions via the `/query` endpoint and get answers backed by peer-contributed, on-chain validated knowledge.
- **Live Feed:** Real-time stream of knowledge being validated across SN442 agents (arXiv, YouTube, Reddit, HackerNews, Wikipedia, and more).
- **Earnings Dashboard:** See your hotkey's chunk count, retrievals, and estimated TAO earnings, read directly from the subnet metagraph.

### Offline & Privacy
- **ZIM Wikipedia:** Full offline Wikipedia integration via ZIM files — query offline, ingest to local Qdrant.
- **MemPalace Layer:** Spatial knowledge organization with a 3D knowledge-graph view.
- **P2P Knowledge Share:** Hyperswarm-based peer-to-peer sync — share knowledge directly with nearby peers, not just the seed node.
- **I2P Privacy Layer:** Optional anonymous P2P routing via I2P.

### UI
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
git clone https://github.com/KatchDaVizion/superbrain-sandbox-mempalace.git
cd superbrain-sandbox-mempalace/desktop
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

## Privacy & Network

SuperBrain is **offline-first**. AI inference, your knowledge store, and your chat history never leave your machine. You only reach the internet when you choose to participate in the network — to sync shared knowledge with other nodes or to collect TAO rewards on the Bittensor chain.

- **Runs fully offline:** Ollama models, knowledge store (Qdrant + ZIM), chat history, document ingestion, benchmarks.
- **Connects to the internet only for:** the Bittensor chain (TAO balance and rewards) and peer sync between SuperBrain nodes.
- **What you earn:** TAO tokens for **sharing knowledge the network actually uses** — not by burning GPU cycles for someone else's inference job.
- **What we never do:** No data is ever sent to OpenAI, Anthropic, or any third-party cloud AI provider. There is no telemetry, no analytics, no shadow tracking.
- **You control your node:** Every outbound connection is driven by a deliberate action — downloading a model, sharing a knowledge chunk, checking your earnings. Close the app and everything stops.

### What connects to the internet and why

| Component | Internet? | Why |
|---|---|---|
| AI inference | **No** | Runs on local Ollama — your prompts never leave the machine |
| Chat history | **No** | Stored locally in `~/.config/SuperBrain/` |
| Knowledge store (RAG, ZIM) | **No** | Qdrant and ZIM files run on your disk |
| Model downloads | **Yes** | Fetches Ollama models on first pull |
| Knowledge sharing | **Yes** | Syncs chunks with other nodes so you earn TAO when someone retrieves them |
| Bittensor chain | **Yes** | Required to register a hotkey, read stake, and collect TAO rewards |
| P2P peer sync | **Yes** | Connects to the Frankfurt seed node on first launch to discover peers |

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
