import 'server-only'
import { createCipheriv, randomBytes, scryptSync } from 'node:crypto'
import archiver from 'archiver'
import { Writable } from 'node:stream'

/**
 * Encrypted-archive exporter.
 *
 * Process:
 *   1. Build a plain ZIP in-memory containing customers.csv + bookings.csv +
 *      services.csv + manifest.json.
 *   2. Encrypt the entire ZIP with AES-256-GCM under a key derived from the
 *      admin-supplied passphrase via scrypt(N=2^15, r=8, p=1).
 *   3. Wrap salt + iv + ciphertext + auth-tag in a tiny self-describing
 *      envelope so decryption only needs the passphrase + this file.
 *
 * File format (binary):
 *   "SUMA1"  (5 bytes magic)
 *   1 byte   format version (0x01)
 *   16 bytes salt
 *   12 bytes iv
 *   N bytes  ciphertext
 *   16 bytes auth tag
 *
 * Decrypt with the matching helper below. The passphrase is never persisted
 * anywhere; the admin must remember it or store it in a password manager.
 */

const MAGIC = Buffer.from('SUMA1', 'utf8')
const VERSION = 0x01

export type ExportInputs = {
  customers: Record<string, unknown>[]
  bookings: Record<string, unknown>[]
  services: Record<string, unknown>[]
  generatedAt: string
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))))
  const head = headers.map(csvEscape).join(',')
  const body = rows.map((r) => headers.map((h) => csvEscape(r[h])).join(',')).join('\n')
  return head + '\n' + body + '\n'
}

async function buildZip(inputs: ExportInputs): Promise<Buffer> {
  const chunks: Buffer[] = []
  const sink = new Writable({
    write(chunk, _enc, cb) { chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); cb() },
  })
  const archive = archiver('zip', { zlib: { level: 9 } })
  const done = new Promise<void>((resolve, reject) => {
    sink.on('finish', () => resolve())
    archive.on('error', reject)
  })
  archive.pipe(sink)

  archive.append(rowsToCsv(inputs.customers), { name: 'customers.csv' })
  archive.append(rowsToCsv(inputs.bookings), { name: 'bookings.csv' })
  archive.append(rowsToCsv(inputs.services), { name: 'services.csv' })

  const manifest = {
    generated_at: inputs.generatedAt,
    counts: {
      customers: inputs.customers.length,
      bookings: inputs.bookings.length,
      services: inputs.services.length,
    },
    schema_version: 1,
  }
  archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' })

  const jsonBundle = {
    customers: inputs.customers,
    bookings: inputs.bookings,
    services: inputs.services,
    manifest,
  }
  archive.append(JSON.stringify(jsonBundle), { name: 'bundle.json' })

  await archive.finalize()
  await done
  return Buffer.concat(chunks)
}

/** Derive a 32-byte key from passphrase using scrypt (N=32768, r=8, p=1). */
function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase.normalize('NFKC'), salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
}

export async function buildEncryptedArchive(inputs: ExportInputs, passphrase: string): Promise<Buffer> {
  if (!passphrase || passphrase.length < 12) {
    throw new Error('passphrase must be at least 12 characters')
  }
  const zipBuf = await buildZip(inputs)
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = deriveKey(passphrase, salt)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(zipBuf), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([MAGIC, Buffer.from([VERSION]), salt, iv, enc, tag])
}

/**
 * Decryption helper — shipped only as a doc reference for the admin. Run with:
 *   node scripts/decrypt-export.mjs <file> <passphrase>
 * (script is included in db/decrypt-export.mjs for offline use).
 */
