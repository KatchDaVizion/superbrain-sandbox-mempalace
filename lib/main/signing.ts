/**
 * Ed25519 identity signing for SuperBrain SN442 P2P contributions.
 * Keys live in the Electron main process only — renderer never sees the private key.
 * Encoding: HEX (matches Frankfurt server validator which checks len==64 pub / len==128 sig).
 * Canonicalization: sorted keys, compact JSON, UTF-8 (same as SDK + Frankfurt server).
 */
import crypto, { KeyObject } from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import { app } from 'electron'

interface KeypairRecord {
  // hex-encoded seed (32 bytes / 64 chars) + hex-encoded pubkey (32 bytes / 64 chars)
  seedHex: string
  publicKeyHex: string
}

// Ed25519 PKCS8 DER prefix (RFC 8410). Prepending to a 32-byte seed produces a valid PKCS8 key.
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex')

const KEY_FILE = path.join(app.getPath('userData'), 'superbrain-identity.json')

function seedHexToPrivateKey(seedHex: string): KeyObject {
  const seed = Buffer.from(seedHex, 'hex')
  if (seed.length !== 32) throw new Error(`ed25519 seed must be 32 bytes, got ${seed.length}`)
  const der = Buffer.concat([PKCS8_ED25519_PREFIX, seed])
  return crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' })
}

function publicKeyHexFromPrivate(privateKey: KeyObject): string {
  const spki = crypto.createPublicKey(privateKey).export({ format: 'der', type: 'spki' })
  // last 32 bytes of the SPKI DER are the raw Ed25519 public key
  return spki.subarray(spki.length - 32).toString('hex')
}

function generateKeypair(): KeypairRecord {
  const seed = crypto.randomBytes(32)
  const seedHex = seed.toString('hex')
  const publicKeyHex = publicKeyHexFromPrivate(seedHexToPrivateKey(seedHex))
  return { seedHex, publicKeyHex }
}

let cached: { privateKey: KeyObject; publicKeyHex: string } | null = null

function getOrCreateKeypair(): { privateKey: KeyObject; publicKeyHex: string } {
  if (cached) return cached
  let rec: KeypairRecord
  try {
    const raw = fs.readFileSync(KEY_FILE, 'utf8')
    rec = JSON.parse(raw)
    if (!rec.seedHex || rec.seedHex.length !== 64) throw new Error('corrupt keyfile')
  } catch {
    rec = generateKeypair()
    fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true })
    fs.writeFileSync(KEY_FILE, JSON.stringify(rec), { mode: 0o600 })
    console.log('[signing] Generated new Ed25519 identity. Public key:', rec.publicKeyHex)
  }
  cached = {
    privateKey: seedHexToPrivateKey(rec.seedHex),
    publicKeyHex: rec.publicKeyHex,
  }
  return cached
}

/**
 * Deterministic JSON: alphabetical keys, compact separators, UTF-8.
 * MUST match the server's canonicalization byte-for-byte. The server's
 * _share_canonical_bytes() uses json.dumps(payload, sort_keys=True,
 * separators=(",", ":"), ensure_ascii=False).
 */
export function canonicalize(value: unknown): string {
  const walk = (v: unknown): string => {
    if (v === null) return 'null'
    const t = typeof v
    if (t === 'boolean') return String(v)
    if (t === 'number') {
      if (!Number.isFinite(v as number)) throw new TypeError('Non-finite number in canonical payload')
      return JSON.stringify(v)
    }
    if (t === 'string') return JSON.stringify(v)
    if (Array.isArray(v)) return '[' + v.map(walk).join(',') + ']'
    const obj = v as Record<string, unknown>
    return '{' + Object.keys(obj).sort().map(k => JSON.stringify(k) + ':' + walk(obj[k])).join(',') + '}'
  }
  return walk(value)
}

/**
 * Sign the 5-field share payload subset the server canonicalizes.
 * Server expects exactly these 5 keys (alphabetical): category, content, hotkey, source, title.
 * Returns hex-encoded signature + public_key (64/128 chars) ready to paste into the POST envelope.
 */
export function signShare(body: {
  content: string
  title: string
  source: string
  category?: string
  contributor_hotkey?: string
  hotkey?: string
}): { signature: string; public_key: string } {
  const { privateKey, publicKeyHex } = getOrCreateKeypair()
  const subset = {
    category: (body.category || '').trim() || 'general',
    content: body.content,
    hotkey: body.contributor_hotkey || body.hotkey || '',
    source: body.source,
    title: body.title,
  }
  const canonical = Buffer.from(canonicalize(subset), 'utf8')
  const signature = crypto.sign(null, canonical, privateKey).toString('hex')
  return { signature, public_key: publicKeyHex }
}

/** For UI display / future on-chain registration — return our Ed25519 identity pubkey hex. */
export function getIdentityPublicKeyHex(): string {
  return getOrCreateKeypair().publicKeyHex
}
