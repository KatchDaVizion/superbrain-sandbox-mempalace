// lib/node/localApiServer.ts
// OpenAI-compatible HTTP server on 127.0.0.1:11435 backed by the local node-chunks store.
// Exposes POST /v1/chat/completions so any OpenAI SDK can hit it with baseURL override.

import http from 'node:http'
import { getNetworkChunkStore } from './networkChunkStore'

const HOST = '127.0.0.1'
const PORT = 11435
const MODEL_ID = 'superbrain-node-v1'

function jsonResponse(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  })
  res.end(payload)
}

function errorResponse(res: http.ServerResponse, status: number, message: string): void {
  jsonResponse(res, status, { error: { message, type: 'invalid_request_error' } })
}

const OLLAMA_URL = 'http://localhost:11434'

async function handleChatCompletions(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  let body: any
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return errorResponse(res, 400, 'Invalid JSON body')
  }

  const messages: { role: string; content: string }[] = body?.messages ?? []
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  if (!lastUser?.content) return errorResponse(res, 400, 'No user message found')

  const query = lastUser.content.trim()
  const store = getNetworkChunkStore()
  const id = `chatcmpl-sb-${Date.now()}`
  const wantsStream = body?.stream === true

  // Retrieve relevant chunks from local Qdrant store
  let contextChunks: Awaited<ReturnType<typeof store.query>>['results'] = []
  let sources: { source: string; score: number }[] = []
  try {
    const result = await store.query(query, body?.n ?? 5)
    contextChunks = result.results
    sources = contextChunks.map((r) => ({ source: r.source, score: r.score }))
  } catch (e) {
    console.error('[LocalApiServer] query error:', e)
  }

  if (contextChunks.length === 0) {
    // No chunks — short-circuit without calling Ollama
    const noChunkText = 'No relevant chunks found in the local network store.'
    if (wantsStream) {
      sseResponse(res, id, noChunkText, 0, 0)
    } else {
      jsonResponse(res, 200, {
        id, object: 'chat.completion', model: MODEL_ID,
        choices: [{ index: 0, message: { role: 'assistant', content: noChunkText }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        sources,
      })
    }
    return
  }

  // Build prompt (same as generateAnswer in networkChunkStore)
  const context = contextChunks.slice(0, 5).map((c, i) => `[${i + 1}] ${c.content.slice(0, 500)}`).join('\n\n')
  const prompt = `Answer the question using the context below. Cite sources as [1], [2], etc.\n\nContext:\n${context}\n\nQuestion: ${query}\n\nAnswer:`

  // Resolve model (same helper as networkChunkStore)
  let model = 'qwen2.5:0.5b'
  try {
    const tagsRes = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3_000) })
    if (tagsRes.ok) {
      const data = (await tagsRes.json()) as { models?: { name: string }[] }
      model = data.models?.[0]?.name ?? model
    }
  } catch { /* keep fallback */ }

  if (wantsStream) {
    // ── SSE streaming path ──────────────────────────────────────────────────
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    })

    try {
      const ollamaRes = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, stream: true }),
      })

      if (!ollamaRes.ok || !ollamaRes.body) {
        sendSseDone(res, id)
        return
      }

      const reader = ollamaRes.body.getReader()
      const dec = new TextDecoder()
      let evalCount = 0
      let promptEvalCount = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        for (const line of dec.decode(value).split('\n')) {
          if (!line.trim()) continue
          try {
            const chunk = JSON.parse(line)
            if (chunk.response) {
              const delta = {
                id, object: 'chat.completion.chunk', model: MODEL_ID,
                choices: [{ index: 0, delta: { content: chunk.response }, finish_reason: null }],
              }
              res.write(`data: ${JSON.stringify(delta)}\n\n`)
            }
            if (chunk.done) {
              evalCount = chunk.eval_count ?? 0
              promptEvalCount = chunk.prompt_eval_count ?? 0
            }
          } catch { /* malformed line — skip */ }
        }
      }

      // Final chunk with usage
      const final = {
        id, object: 'chat.completion.chunk', model: MODEL_ID,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: promptEvalCount, completion_tokens: evalCount, total_tokens: promptEvalCount + evalCount },
      }
      res.write(`data: ${JSON.stringify(final)}\n\n`)
    } catch (e) {
      console.error('[LocalApiServer] stream error:', e)
    }
    res.write('data: [DONE]\n\n')
    res.end()
  } else {
    // ── Non-streaming path ──────────────────────────────────────────────────
    try {
      const ollamaRes = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, stream: false }),
      })
      if (!ollamaRes.ok) throw new Error(`Ollama ${ollamaRes.status}`)
      const data = (await ollamaRes.json()) as any
      const text: string = data.response ?? ''
      const promptTokens: number = data.prompt_eval_count ?? 0
      const completionTokens: number = data.eval_count ?? 0
      jsonResponse(res, 200, {
        id, object: 'chat.completion', model: MODEL_ID,
        choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
        usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens },
        sources,
      })
    } catch (e) {
      console.error('[LocalApiServer] generate error:', e)
      jsonResponse(res, 200, {
        id, object: 'chat.completion', model: MODEL_ID,
        choices: [{ index: 0, message: { role: 'assistant', content: 'Error generating answer.' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        sources,
      })
    }
  }
}

function sseResponse(res: http.ServerResponse, id: string, content: string, promptTokens: number, completionTokens: number): void {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' })
  const delta = { id, object: 'chat.completion.chunk', model: MODEL_ID, choices: [{ index: 0, delta: { content }, finish_reason: 'stop' }], usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens } }
  res.write(`data: ${JSON.stringify(delta)}\n\n`)
  res.write('data: [DONE]\n\n')
  res.end()
}

function sendSseDone(res: http.ServerResponse, _id: string): void {
  res.write('data: [DONE]\n\n')
  res.end()
}

export class LocalApiServer {
  private _server: http.Server | null = null

  start(): void {
    if (this._server) return

    this._server = http.createServer(async (req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        })
        res.end()
        return
      }

      if (req.method === 'POST' && req.url === '/v1/chat/completions') {
        await handleChatCompletions(req, res)
        return
      }

      if (req.method === 'GET' && req.url === '/v1/models') {
        jsonResponse(res, 200, {
          object: 'list',
          data: [{ id: MODEL_ID, object: 'model', owned_by: 'superbrain' }],
        })
        return
      }

      errorResponse(res, 404, 'Not found')
    })

    this._server.listen(PORT, HOST, () => {
      console.log(`[LocalApiServer] Listening on http://${HOST}:${PORT}`)
    })

    this._server.on('error', (e) => {
      console.error('[LocalApiServer] Server error:', e)
    })
  }

  stop(): void {
    if (!this._server) return
    this._server.close(() => console.log('[LocalApiServer] Stopped'))
    this._server = null
  }
}

let _instance: LocalApiServer | null = null

export function getLocalApiServer(): LocalApiServer {
  if (!_instance) _instance = new LocalApiServer()
  return _instance
}
