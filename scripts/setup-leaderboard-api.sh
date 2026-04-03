#!/bin/bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SuperBrain Leaderboard API — Setup Script for Frankfurt
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# Run this on the Frankfurt server (46.225.114.202):
#   ssh root@46.225.114.202
#   bash setup-leaderboard-api.sh
#
# It creates a lightweight Bun HTTP server on port 8401
# with SQLite storage for benchmark scores.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

set -e

DIR="/root/superbrain-leaderboard-api"
echo "[*] Setting up leaderboard API at $DIR"

mkdir -p "$DIR"

# ── Server Code ───────────────────────────────────────────
cat > "$DIR/server.ts" << 'SERVEREOF'
/**
 * SuperBrain SN442 Leaderboard API
 * Bun HTTP server with SQLite storage.
 * Port: 8401
 */

import { Database } from "bun:sqlite";

const PORT = 8401;
const DB_PATH = "/root/superbrain-leaderboard-api/leaderboard.db";

// Initialize SQLite
const db = new Database(DB_PATH);
db.run(`
  CREATE TABLE IF NOT EXISTS scores (
    anonymous_id TEXT PRIMARY KEY,
    score INTEGER NOT NULL,
    tier TEXT NOT NULL,
    cpu_cores INTEGER,
    ram_gb REAL,
    ollama_model TEXT,
    tokens_per_sec REAL,
    platform TEXT,
    app_version TEXT,
    submitted_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);
db.run(`CREATE INDEX IF NOT EXISTS idx_score ON scores(score DESC)`);

console.log(`[Leaderboard] SQLite ready at ${DB_PATH}`);

// ── HTTP Server ──────────────────────────────────────────

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // CORS headers
    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    // ── POST /benchmark/submit ──
    if (path === "/benchmark/submit" && req.method === "POST") {
      try {
        const body = await req.json();
        const { anonymousId, score, tier, cpuCores, ramGB, ollamaModel, tokensPerSec, platform, appVersion, submittedAt } = body;

        if (!anonymousId || score == null || !tier) {
          return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers });
        }

        db.run(`
          INSERT INTO scores (anonymous_id, score, tier, cpu_cores, ram_gb, ollama_model, tokens_per_sec, platform, app_version, submitted_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(anonymous_id) DO UPDATE SET
            score = excluded.score,
            tier = excluded.tier,
            cpu_cores = excluded.cpu_cores,
            ram_gb = excluded.ram_gb,
            ollama_model = excluded.ollama_model,
            tokens_per_sec = excluded.tokens_per_sec,
            platform = excluded.platform,
            app_version = excluded.app_version,
            updated_at = excluded.updated_at
        `, [anonymousId, score, tier, cpuCores, ramGB, ollamaModel, tokensPerSec, platform, appVersion, submittedAt || new Date().toISOString(), new Date().toISOString()]);

        return new Response(JSON.stringify({ ok: true }), { headers });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
      }
    }

    // ── GET /benchmark/leaderboard ──
    if (path === "/benchmark/leaderboard" && req.method === "GET") {
      const limit = parseInt(url.searchParams.get("limit") || "100");
      const rows = db.query(`
        SELECT
          anonymous_id as anonymousId,
          score,
          tier,
          platform,
          tokens_per_sec as tokensPerSec,
          cpu_cores as cpuCores,
          ram_gb as ramGB,
          submitted_at as submittedAt
        FROM scores
        ORDER BY score DESC
        LIMIT ?
      `).all(limit);

      // Add rank
      const entries = (rows as any[]).map((r, i) => ({ ...r, rank: i + 1 }));

      const totalMiners = (db.query("SELECT COUNT(*) as count FROM scores").get() as any).count;
      const avgScore = (db.query("SELECT AVG(score) as avg FROM scores").get() as any).avg || 0;

      return new Response(JSON.stringify({
        entries,
        totalMiners,
        avgScore: Math.round(avgScore),
        fetchedAt: new Date().toISOString(),
      }), { headers });
    }

    // ── GET /benchmark/stats ──
    if (path === "/benchmark/stats" && req.method === "GET") {
      const totalMiners = (db.query("SELECT COUNT(*) as count FROM scores").get() as any).count;
      const avgScore = (db.query("SELECT AVG(score) as avg FROM scores").get() as any).avg || 0;

      const tiers = db.query("SELECT tier, COUNT(*) as count FROM scores GROUP BY tier").all() as any[];
      const tierDistribution: Record<string, number> = {};
      for (const t of tiers) tierDistribution[t.tier] = t.count;

      return new Response(JSON.stringify({
        totalMiners,
        avgScore: Math.round(avgScore),
        tierDistribution,
      }), { headers });
    }

    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers });
  },
});

console.log(`[Leaderboard] API running on port ${PORT}`);
SERVEREOF

# ── PM2 Ecosystem ─────────────────────────────────────────
cat > "$DIR/ecosystem.config.cjs" << 'PM2EOF'
module.exports = {
  apps: [{
    name: "superbrain-leaderboard",
    script: "server.ts",
    interpreter: "/root/.bun/bin/bun",
    cwd: "/root/superbrain-leaderboard-api",
    instances: 1,
    autorestart: true,
    max_memory_restart: "128M",
    env: {
      NODE_ENV: "production"
    }
  }]
};
PM2EOF

echo "[*] Starting leaderboard API with PM2..."
cd "$DIR"

# Check if Bun is installed
if ! command -v bun &>/dev/null; then
  echo "[!] Bun not found. Installing..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
fi

# Start/restart with PM2
pm2 stop superbrain-leaderboard 2>/dev/null || true
pm2 delete superbrain-leaderboard 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

echo ""
echo "[+] Leaderboard API is running!"
echo "    POST http://46.225.114.202:8401/benchmark/submit"
echo "    GET  http://46.225.114.202:8401/benchmark/leaderboard"
echo "    GET  http://46.225.114.202:8401/benchmark/stats"
echo ""
echo "    SQLite DB: $DIR/leaderboard.db"
echo "    PM2 name:  superbrain-leaderboard"
echo ""

# Allow port 8401 through firewall if ufw is active
if command -v ufw &>/dev/null; then
  ufw allow 8401/tcp 2>/dev/null && echo "[+] Port 8401 opened in UFW"
fi

echo "[+] Setup complete."
