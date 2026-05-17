import 'server-only'
import archiver from 'archiver'
import zipEncrypted from 'archiver-zip-encrypted'
import { Writable } from 'node:stream'

/**
 * Password-protected ZIP exporter.
 *
 * The output is a standard AES-256-encrypted ZIP (WinZip AE-2). Any modern
 * unarchiver can open it with the chosen passphrase:
 *   - macOS  → Keka, The Unarchiver, or `unzip` from Homebrew
 *   - Windows → 7-Zip, WinRAR
 *   - Linux  → 7z, unzip-aes
 *
 * Contents (two human-readable text files):
 *   - customer_details.txt — personal info per customer (DOB, time/place of
 *                            birth, gender, notes), decrypted from the
 *                            most-recent booking's encrypted_payload.
 *   - bookings.txt         — bookings grouped per customer, each entry
 *                            showing only booking id + date + payment id.
 *
 * The encryption key is derived from the admin-supplied passphrase by the
 * ZIP AES extension itself (PBKDF2-HMAC-SHA1, 1000 iterations). We enforce
 * a 12+ character passphrase to keep brute-force impractical.
 */

let formatRegistered = false
function registerFormat() {
  if (formatRegistered) return
  // `archiver` allows a custom format to be registered once per process.
  // Re-registering throws, so we guard with the boolean. The cast is needed
  // because `archiver-zip-encrypted` ships no types.
  ;(archiver as any).registerFormat('zip-encrypted', zipEncrypted)
  formatRegistered = true
}

export type ExportCustomer = {
  name: string
  phone: string
  email: string | null
  dob: string | null
  timeOfBirth: string | null
  placeOfBirth: string | null
  gender: string | null
  notes: string | null
  bookings: Array<{ bookingId: string; date: string; paymentId: string | null }>
}

const SEP = '='.repeat(72)
const SUB = '-'.repeat(72)

function pad(label: string, value: string, width = 18): string {
  return label.padEnd(width) + value
}

function formatCustomerDetails(rows: ExportCustomer[], generatedLocal: string): string {
  const out: string[] = []
  out.push(SEP)
  out.push('                    SUMA CONSULTATION')
  out.push('                       Customer Details')
  out.push('')
  out.push(`                    Generated: ${generatedLocal}`)
  out.push(`                    Total customers: ${rows.length}`)
  out.push(SEP)
  out.push('')

  rows.forEach((c, i) => {
    out.push(SUB)
    out.push(`Customer ${i + 1} of ${rows.length}`)
    out.push(SUB)
    out.push(pad('Name:',          c.name))
    out.push(pad('Phone:',         c.phone))
    out.push(pad('Email:',         c.email ?? '—'))
    out.push('')
    out.push(pad('Date of Birth:',  c.dob ?? '—'))
    out.push(pad('Time of Birth:',  c.timeOfBirth ?? '—'))
    out.push(pad('Place of Birth:', c.placeOfBirth ?? '—'))
    out.push(pad('Gender:',         c.gender ?? '—'))
    if (c.notes && c.notes.trim().length > 0) {
      out.push('Notes:')
      for (const line of c.notes.split(/\r?\n/)) out.push('  ' + line)
    } else {
      out.push(pad('Notes:', '—'))
    }
    out.push('')
  })
  return out.join('\n') + '\n'
}

function formatBookings(rows: ExportCustomer[], generatedLocal: string): string {
  const customersWithBookings = rows.filter((r) => r.bookings.length > 0)
  const totalBookings = customersWithBookings.reduce((a, r) => a + r.bookings.length, 0)

  const out: string[] = []
  out.push(SEP)
  out.push('                    SUMA CONSULTATION')
  out.push('                          Bookings')
  out.push('')
  out.push(`                    Generated: ${generatedLocal}`)
  out.push(`                    Total: ${totalBookings} booking(s) across ${customersWithBookings.length} customer(s)`)
  out.push(SEP)
  out.push('')

  for (const c of customersWithBookings) {
    out.push(SUB)
    out.push(`${c.name}  ·  ${c.phone}`)
    out.push(SUB)
    for (const b of c.bookings) {
      out.push(pad('Booking ID:', b.bookingId))
      out.push(pad('Date:',       b.date))
      out.push(pad('Payment ID:', b.paymentId ?? '—'))
      out.push('')
    }
  }
  return out.join('\n') + '\n'
}

export async function buildPasswordZip(
  rows: ExportCustomer[],
  passphrase: string,
  generatedLocal: string,
): Promise<Buffer> {
  if (!passphrase || passphrase.length < 12) {
    throw new Error('passphrase must be at least 12 characters')
  }
  registerFormat()

  const chunks: Buffer[] = []
  const sink = new Writable({
    write(chunk, _enc, cb) { chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); cb() },
  })
  // AES-256 (WinZip AE-2) — strong, standard, decryptable by Keka / 7-Zip.
  const archive = (archiver as any)('zip-encrypted', {
    zlib: { level: 9 },
    encryptionMethod: 'aes256',
    password: passphrase,
  })
  const done = new Promise<void>((resolve, reject) => {
    sink.on('finish', resolve)
    archive.on('error', reject)
  })
  archive.pipe(sink)
  archive.append(formatCustomerDetails(rows, generatedLocal), { name: 'customer_details.txt' })
  archive.append(formatBookings(rows, generatedLocal), { name: 'bookings.txt' })
  await archive.finalize()
  await done
  return Buffer.concat(chunks)
}
