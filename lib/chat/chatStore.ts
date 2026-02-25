// src/main/chat/chatStore.ts
import fs from 'fs'
import crypto from 'crypto'
import { app } from 'electron'
import { join } from 'path'

// ───── TYPES ─────
export type Role = 'user' | 'assistant' | 'system'

export interface Message {
  id: string
  role: Role
  content: string
  createdAt: string
}

export interface Thread {
  id: string
  modelId: string
  modelName?: string
  title: string
  messages: Message[]
  createdAt: string
  updatedAt: string
  lastMessage: string
  lastTimestamp: string
}

export interface Store {
  version: number
  models: Record<string, { modelName?: string; threads: Thread[] }>
}

// ───── CONSTANTS ─────
const STORE_VERSION = 1
const MAX_MSGS_PER_THREAD = 1000
const MAX_THREADS_PER_MODEL = 500

// Remove the global file path variables since we'll handle them per store type
// let historyFilePath: string
// let backupFilePath: string

const uuid = () =>
  crypto.randomUUID?.() ||
  (([1e7] as any) + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c: any) =>
    (c ^ (crypto.randomBytes(1)[0] & (15 >> (c / 4)))).toString(16)
  )

const nowISO = () => new Date().toISOString()

// ───── GET FILE PATHS ─────
function getStorePaths(storeType: string = 'chat') {
  const userData = app.getPath('userData')
  const historyFilePath = join(userData, `${storeType}-store.json`)
  const backupFilePath = join(userData, `${storeType}-store.backup.json`)
  return { historyFilePath, backupFilePath }
}

// ───── INIT STORE ─────
export function initStore(storeType: string = 'chat'): Store {
  getStorePaths(storeType)

  // Ensure user data directory exists
  const userData = app.getPath('userData')
  if (!fs.existsSync(userData)) {
    fs.mkdirSync(userData, { recursive: true })
  }

  return ensureStore(storeType)
}

// ───── ENSURE STORE ─────
export function ensureStore(storeType: string = 'chat'): Store {
  const { historyFilePath, backupFilePath } = getStorePaths(storeType)

  if (!fs.existsSync(historyFilePath)) {
    const fresh: Store = { version: STORE_VERSION, models: {} }
    fs.writeFileSync(historyFilePath, JSON.stringify(fresh, null, 2), 'utf-8')
    fs.writeFileSync(backupFilePath, JSON.stringify(fresh, null, 2), 'utf-8')
    return fresh
  }

  try {
    const raw = fs.readFileSync(historyFilePath, 'utf-8')
    const data: Store = JSON.parse(raw)
    if (!data.version) data.version = STORE_VERSION
    if (!data.models) data.models = {}
    return data
  } catch {
    // fallback to backup
    try {
      const raw = fs.readFileSync(backupFilePath, 'utf-8')
      return JSON.parse(raw)
    } catch {
      return { version: STORE_VERSION, models: {} }
    }
  }
}

// ───── WRITE STORE ─────
export function writeStore(store: Store, storeType: string = 'chat') {
  const { historyFilePath, backupFilePath } = getStorePaths(storeType)
  fs.writeFileSync(historyFilePath, JSON.stringify(store, null, 2), 'utf-8')
  fs.writeFileSync(backupFilePath, JSON.stringify(store, null, 2), 'utf-8')
}

// ───── THREAD HELPERS ─────
export function upsertThread(store: Store, thread: Thread) {
  const { modelId } = thread
  if (!store.models[modelId]) store.models[modelId] = { threads: [] }
  const list = store.models[modelId].threads
  const idx = list.findIndex((t) => t.id === thread.id)
  if (idx >= 0) list[idx] = thread
  else list.unshift(thread)

  if (list.length > MAX_THREADS_PER_MODEL) {
    store.models[modelId].threads = list.slice(0, MAX_THREADS_PER_MODEL)
  }
  store.models[modelId].threads.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function touchThread(thread: Thread) {
  thread.updatedAt = nowISO()
  const last = thread.messages[thread.messages.length - 1]
  thread.lastMessage = last ? last.content.slice(0, 200) : ''
  thread.lastTimestamp = last ? last.createdAt : thread.updatedAt
  if (thread.messages.length > MAX_MSGS_PER_THREAD) {
    thread.messages = thread.messages.slice(-MAX_MSGS_PER_THREAD)
  }
}

// ───── CREATE NEW THREAD ─────
export function createThread(modelId: string, modelName?: string, title?: string): Thread {
  const thread: Thread = {
    id: uuid(),
    modelId,
    modelName,
    title: title || 'New Chat',
    messages: [],
    createdAt: nowISO(),
    updatedAt: nowISO(),
    lastMessage: '',
    lastTimestamp: nowISO(),
  }
  return thread
}

// ───── ADD THREAD TO STORE ─────
export function addThreadToStore(store: Store, thread: Thread, storeType: string = 'chat') {
  upsertThread(store, thread)
  writeStore(store, storeType)
  return thread
}

// ───── DELETE THREAD ─────
export function deleteThreadFromStore(store: Store, modelId: string, threadId: string, storeType: string = 'chat') {
  if (!store.models[modelId]) return { ok: false, threads: [] }
  store.models[modelId].threads = store.models[modelId].threads.filter((t) => t.id !== threadId)
  writeStore(store, storeType)
  return { ok: true, threads: store.models[modelId].threads }
}

// ───── APPEND MESSAGE ─────
export function appendMessageToThread(
  store: Store,
  modelId: string,
  threadId: string,
  message: Message,
  storeType: string = 'chat'
) {
  const threads = store.models[modelId]?.threads
  if (!threads) return null

  const thread = threads.find((t) => t.id === threadId)
  if (!thread) return null

  thread.messages.push(message)
  touchThread(thread)
  upsertThread(store, thread)
  writeStore(store, storeType)

  return message
}
