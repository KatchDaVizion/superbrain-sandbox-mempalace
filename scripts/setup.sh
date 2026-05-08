#!/bin/bash
# SuperBrain Desktop — dependency setup
# Installs Ollama, nomic-embed-text, Docker, and Qdrant in order.
# Safe to re-run — skips steps that are already complete.

set -e

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $1"; }
info() { echo -e "${YELLOW}→${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; exit 1; }

echo -e "\n${BOLD}SuperBrain Desktop — Setup${NC}\n"

# ── 1. Ollama ──────────────────────────────────────────────────────────────────
if command -v ollama &>/dev/null; then
  ok "Ollama already installed ($(ollama --version 2>/dev/null | head -1))"
else
  info "Installing Ollama..."
  curl -fsSL https://ollama.com/install.sh | sh
  ok "Ollama installed"
fi

# Start Ollama service if not running
if ! curl -sf http://localhost:11434/api/tags &>/dev/null; then
  info "Starting Ollama service..."
  ollama serve &>/dev/null &
  sleep 3
fi

# ── 2. nomic-embed-text ────────────────────────────────────────────────────────
if ollama list 2>/dev/null | grep -q "nomic-embed-text"; then
  ok "nomic-embed-text already present"
else
  info "Pulling nomic-embed-text embedding model (~274 MB)..."
  ollama pull nomic-embed-text
  ok "nomic-embed-text pulled"
fi

# ── 3. Docker ─────────────────────────────────────────────────────────────────
if command -v docker &>/dev/null; then
  ok "Docker already installed ($(docker --version))"
else
  info "Installing Docker..."
  if command -v apt-get &>/dev/null; then
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker "$USER" || true
    ok "Docker installed — you may need to log out and back in for group permissions"
  elif command -v brew &>/dev/null; then
    brew install --cask docker
    ok "Docker Desktop installed via Homebrew"
  else
    fail "Cannot auto-install Docker on this system. Install manually: https://docs.docker.com/get-docker/"
  fi
fi

# ── 4. Qdrant ─────────────────────────────────────────────────────────────────
if docker ps --filter "name=qdrant" --filter "status=running" | grep -q qdrant; then
  ok "Qdrant already running"
elif docker ps -a --filter "name=qdrant" | grep -q qdrant; then
  info "Starting existing Qdrant container..."
  docker start qdrant
  ok "Qdrant started"
else
  info "Starting Qdrant vector store..."
  docker run -d \
    -p 6333:6333 \
    --name qdrant \
    --restart unless-stopped \
    qdrant/qdrant
  ok "Qdrant started on port 6333"
fi

# Wait for Qdrant to be healthy
info "Waiting for Qdrant to be ready..."
for i in $(seq 1 15); do
  if curl -sf http://localhost:6333/healthz &>/dev/null; then
    ok "Qdrant is healthy"
    break
  fi
  sleep 1
done

# ── 5. Final check ────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Status:${NC}"

if curl -sf http://localhost:11434/api/tags &>/dev/null; then
  ok "Ollama running on :11434"
else
  echo -e "${RED}✗${NC} Ollama not responding — run: ollama serve"
fi

if ollama list 2>/dev/null | grep -q "nomic-embed-text"; then
  ok "nomic-embed-text model present"
else
  echo -e "${RED}✗${NC} nomic-embed-text missing — run: ollama pull nomic-embed-text"
fi

if curl -sf http://localhost:6333/healthz &>/dev/null; then
  ok "Qdrant running on :6333"
else
  echo -e "${RED}✗${NC} Qdrant not responding — run: docker start qdrant"
fi

echo ""
echo -e "${GREEN}${BOLD}All dependencies ready. Open SuperBrain and enable Node Mode.${NC}"
echo ""
