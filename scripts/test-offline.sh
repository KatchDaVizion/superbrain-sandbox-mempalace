#!/bin/bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SuperBrain v12.0.0 — Offline System Test
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

set -e

GREEN="\033[32m"
RED="\033[31m"
YELLOW="\033[33m"
CYAN="\033[36m"
DIM="\033[2m"
BOLD="\033[1m"
RESET="\033[0m"

echo ""
echo -e "${BOLD}${CYAN}━━━ SuperBrain v12.0.0 Offline System Test ━━━${RESET}"
echo ""

PASS=0
FAIL=0

check() {
  local label="$1"
  local result="$2"
  if [ "$result" = "0" ]; then
    echo -e "  ${GREEN}✅${RESET} ${label}"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}❌${RESET} ${label}"
    FAIL=$((FAIL + 1))
  fi
}

# ── 1. kiwix-serve binary ─────────────────────────────────────────────────

echo -e "${BOLD}1. kiwix-serve${RESET}"
if command -v kiwix-serve &>/dev/null; then
  VERSION=$(kiwix-serve --version 2>&1 | head -1)
  check "kiwix-serve installed: ${DIM}${VERSION}${RESET}" 0
else
  check "kiwix-serve NOT INSTALLED" 1
fi
echo ""

# ── 2. ZIM directory ──────────────────────────────────────────────────────

echo -e "${BOLD}2. ZIM Storage${RESET}"
ZIM_DIR="$HOME/.superbrain/zim"
if [ -d "$ZIM_DIR" ]; then
  ZIM_COUNT=$(find "$ZIM_DIR" -name "*.zim" 2>/dev/null | wc -l)
  ZIM_SIZE=$(du -sh "$ZIM_DIR" 2>/dev/null | cut -f1)
  check "ZIM directory exists: ${DIM}${ZIM_DIR}${RESET}" 0
  if [ "$ZIM_COUNT" -gt 0 ]; then
    check "ZIM files found: ${DIM}${ZIM_COUNT} file(s), ${ZIM_SIZE}${RESET}" 0
    echo ""
    echo -e "  ${DIM}Files:${RESET}"
    find "$ZIM_DIR" -name "*.zim" -exec basename {} \; | while read f; do
      SIZE=$(stat -c %s "$ZIM_DIR/$f" 2>/dev/null | numfmt --to=iec 2>/dev/null || echo "?")
      echo -e "    ${DIM}${f} (${SIZE})${RESET}"
    done
  else
    echo -e "  ${YELLOW}⚠  No ZIM files installed yet${RESET}"
    echo -e "  ${DIM}Download via Settings → Knowledge Packs${RESET}"
  fi
else
  check "ZIM directory does NOT exist" 1
fi
echo ""

# ── 3. kiwix-serve running ───────────────────────────────────────────────

echo -e "${BOLD}3. kiwix-serve HTTP${RESET}"
if curl -s -o /dev/null -w "%{http_code}" http://localhost:8383 2>/dev/null | grep -q "200"; then
  check "kiwix-serve responding on port 8383" 0

  # Test search if running
  SEARCH_RESULT=$(curl -s "http://localhost:8383/search?pattern=test&pageLength=1" 2>/dev/null | wc -c)
  if [ "$SEARCH_RESULT" -gt 100 ]; then
    check "Search API returning results" 0
  else
    check "Search API returned empty" 1
  fi
else
  echo -e "  ${YELLOW}⚠  kiwix-serve not running (expected if no ZIMs installed)${RESET}"
fi
echo ""

# ── 4. Ollama (local inference) ──────────────────────────────────────────

echo -e "${BOLD}4. Ollama${RESET}"
if curl -s http://localhost:11434/api/tags -o /dev/null 2>/dev/null; then
  MODELS=$(curl -s http://localhost:11434/api/tags 2>/dev/null | grep -o '"name":"[^"]*"' | cut -d'"' -f4 | tr '\n' ', ' | sed 's/,$//')
  check "Ollama running: ${DIM}${MODELS}${RESET}" 0
else
  check "Ollama NOT running" 1
fi
echo ""

# ── 5. Qdrant (vector DB) ───────────────────────────────────────────────

echo -e "${BOLD}5. Qdrant${RESET}"
if curl -s http://localhost:6333/healthz -o /dev/null 2>/dev/null; then
  check "Qdrant running on port 6333" 0
else
  echo -e "  ${YELLOW}⚠  Qdrant not running (RAG search will skip vector layer)${RESET}"
fi
echo ""

# ── 6. Frankfurt / SN442 (network) ──────────────────────────────────────

echo -e "${BOLD}6. SN442 Network${RESET}"
if curl -s --connect-timeout 5 http://46.225.114.202:8400/health -o /dev/null 2>/dev/null; then
  check "Frankfurt seed node reachable" 0
else
  echo -e "  ${YELLOW}⚠  Frankfurt unreachable — offline mode active${RESET}"
fi
echo ""

# ── Summary ──────────────────────────────────────────────────────────────

echo -e "${BOLD}${CYAN}━━━ Summary ━━━${RESET}"
echo ""
echo -e "  Passed: ${GREEN}${PASS}${RESET}"
echo -e "  Failed: ${RED}${FAIL}${RESET}"
echo ""

# 4-layer status
echo -e "${BOLD}Knowledge Hierarchy:${RESET}"
echo -e "  1. ${CYAN}ZIM (offline)${RESET}  → $([ -d "$ZIM_DIR" ] && [ "$(find "$ZIM_DIR" -name "*.zim" 2>/dev/null | wc -l)" -gt 0 ] && echo "READY" || echo "No packs installed")"
echo -e "  2. ${CYAN}Qdrant (local)${RESET} → $(curl -s http://localhost:6333/healthz -o /dev/null 2>/dev/null && echo "READY" || echo "Not running")"
echo -e "  3. ${CYAN}SN442 (network)${RESET}→ $(curl -s --connect-timeout 3 http://46.225.114.202:8400/health -o /dev/null 2>/dev/null && echo "REACHABLE" || echo "Offline")"
echo -e "  4. ${CYAN}Ollama (local)${RESET} → $(curl -s http://localhost:11434/api/tags -o /dev/null 2>/dev/null && echo "READY" || echo "Not running")"
echo ""
