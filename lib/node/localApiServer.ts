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

  let text = 'No relevant chunks found in the local network store.'
  let sources: { source: string; score: number }[] = []

  try {
    const result = await store.query(query, body?.n ?? 5)
    if (result.results.length > 0) {
      const answer = await store.generateAnswer(query, result.results)
      text = answer.text
      sources = result.results.map((r) => ({ source: r.source, score: r.score }))
    }
  } catch (e) {
    console.error('[LocalApiServer] query error:', e)
    text = 'Error querying local network store.'
  }

  const id = `chatcmpl-sb-${Date.now()}`
  jsonResponse(res, 200, {
    id,
    object: 'chat.completion',
    model: MODEL_ID,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: text },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    sources,
  })
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
