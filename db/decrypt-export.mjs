#!/usr/bin/env node
// Usage: node db/decrypt-export.mjs <encrypted-file> <passphrase>
// Outputs the inner ZIP to <encrypted-file>.zip.
// No dependencies — runs on any Node ≥ 18.

import { readFileSync, writeFileSync } from 'node:fs'
import { createDecipheriv, scryptSync } from 'node:crypto'

const [, , inputPath, passphrase] = process.argv
if (!inputPath || !passphrase) {
  console.error('Usage: node decrypt-export.mjs <encrypted-file> <passphrase>')
  process.exit(2)
}

const buf = readFileSync(inputPath)
const MAGIC = Buffer.from('SUMA1', 'utf8')
if (!buf.subarray(0, 5).equals(MAGIC)) {
  console.error('Not a Suma encrypted export (bad magic).')
  process.exit(3)
}
const version = buf[5]
if (version !== 0x01) {
  console.error('Unsupported version:', version)
  process.exit(4)
}

const salt = buf.subarray(6, 22)
const iv = buf.subarray(22, 34)
const tag = buf.subarray(buf.length - 16)
const ciphertext = buf.subarray(34, buf.length - 16)

const key = scryptSync(passphrase.normalize('NFKC'), salt, 32, {
  N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024,
})
const decipher = createDecipheriv('aes-256-gcm', key, iv)
decipher.setAuthTag(tag)
let out
try {
  out = Buffer.concat([decipher.update(ciphertext), decipher.final()])
} catch (e) {
  console.error('Decryption failed — wrong passphrase or corrupted file.')
  process.exit(5)
}

const outPath = inputPath.replace(/\.(enc|bin)?$/i, '') + '.zip'
writeFileSync(outPath, out)
console.log('Wrote', outPath, '(', out.length, 'bytes )')
