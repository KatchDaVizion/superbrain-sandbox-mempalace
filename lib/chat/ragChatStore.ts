// src/main/chat/ragChatStore.ts
import fs from 'fs'
import crypto from 'crypto'
import { app } from 'electron'
import { join } from 'path'

// ───── RAG-ONLY TYPES ─────
export type Role = 'user' | 'assistant' | 'system'

export interface RagMessage {
  id: string
  role: Role
  content: string
  createdAt: string
}

export interface RagThread {
  id: string
  collectionName: string
  title: string
  messages: RagMessage[]
  createdAt: string
  updatedAt: string
  lastMessage: string
  lastTimestamp: string
}

export interface RagStore {
  version: number
  collections: Record<string, { threads: RagThread[] }> // ← collection-based
}

// ───── CONSTANTS ─────
const STORE_VERSION = 1
const MAX_MSGS_PER_THREAD = 1000
const MAX_THREADS_PER_COLLECTION = 500

const uuid = () => crypto.randomUUID()
const nowISO = () => new Date().toISOString()

// ───── FILE PATHS (RAG only) ─────
function getRagStorePaths() {
  const userData = app.getPath('userData')
  const historyFilePath = join(userData, 'rag-store.json')
  const backupFilePath = join(userData, 'rag-store.backup.json')
  return { historyFilePath, backupFilePath }
}

// ───── INIT & ENSURE RAG STORE ─────
export function initRagStore(): RagStore {
  const { historyFilePath, backupFilePath } = getRagStorePaths()

  if (!fs.existsSync(historyFilePath)) {
    const fresh: RagStore = { version: STORE_VERSION, collections: {} }
    fs.writeFileSync(historyFilePath, JSON.stringify(fresh, null, 2), 'utf-8')
    fs.writeFileSync(backupFilePath, JSON.stringify(fresh, null, 2), 'utf-8')
    return fresh
  }

  try {
    const raw = fs.readFileSync(historyFilePath, 'utf-8')
    const data = JSON.parse(raw) as RagStore
    if (!data.collections) data.collections = {}
    return data
  } catch {
    try {
      const raw = fs.readFileSync(backupFilePath, 'utf-8')
      return JSON.parse(raw)
    } catch {
      return { version: STORE_VERSION, collections: {} }
    }
  }
}

// ───── WRITE RAG STORE ─────
export function writeRagStore(store: RagStore) {
  const { historyFilePath, backupFilePath } = getRagStorePaths()
  const data = JSON.stringify(store, null, 2)
  fs.writeFileSync(historyFilePath, data, 'utf-8')
  fs.writeFileSync(backupFilePath, data, 'utf-8')
}

// ───── RAG THREAD HELPERS (all prefixed with rag) ─────
export function ragUpsertThread(store: RagStore, collectionName: string, thread: RagThread) {
  if (!store.collections[collectionName]) {
    store.collections[collectionName] = { threads: [] }
  }
  const list = store.collections[collectionName].threads
  const idx = list.findIndex((t) => t.id === thread.id)
  if (idx >= 0) {
    list[idx] = thread
  } else {
    list.unshift(thread)
  }

  if (list.length > MAX_THREADS_PER_COLLECTION) {
    store.collections[collectionName].threads = list.slice(0, MAX_THREADS_PER_COLLECTION)
  }
  list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function ragTouchThread(thread: RagThread) {
  thread.updatedAt = nowISO()
  const last = thread.messages[thread.messages.length - 1]
  thread.lastMessage = last ? last.content.slice(0, 200) : ''
  thread.lastTimestamp = last ? last.createdAt : thread.updatedAt
  if (thread.messages.length > MAX_MSGS_PER_THREAD) {
    thread.messages = thread.messages.slice(-MAX_MSGS_PER_THREAD)
  }
}

export function ragCreateThread(collectionName: string, title?: string): RagThread {
  return {
    id: uuid(),
    collectionName,
    title: title || 'New RAG Chat',
    messages: [],
    createdAt: nowISO(),
    updatedAt: nowISO(),
    lastMessage: '',
    lastTimestamp: nowISO(),
  }
}

export function ragAppendMessage(store: RagStore, collectionName: string, threadId: string, message: RagMessage) {
  const threads = store.collections[collectionName]?.threads
  if (!threads) return null

  const thread = threads.find((t) => t.id === threadId)
  if (!thread) return null

  thread.messages.push(message)
  ragTouchThread(thread)
  ragUpsertThread(store, collectionName, thread)
  writeRagStore(store)
  return message
}

export function ragDeleteThread(store: RagStore, collectionName: string, threadId: string) {
  if (!store.collections[collectionName]) return { ok: false, threads: [] }
  const filtered = store.collections[collectionName].threads.filter((t) => t.id !== threadId)
  store.collections[collectionName].threads = filtered
  writeRagStore(store)
  return { ok: true, threads: filtered }
}
