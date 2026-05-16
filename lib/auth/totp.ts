import 'server-only'
import { authenticator } from 'otplib'
import QRCode from 'qrcode'

/**
 * TOTP (RFC 6238) using the default SHA-1 / 30s window — matches Google
 * Authenticator, Authy, 1Password, Bitwarden, etc.
 *
 * `verify` allows ±1 step of clock skew (±30 s) to absorb clock drift without
 * widening the attack window beyond what's standard.
 */
authenticator.options = { window: 1, digits: 6, step: 30 }

export function generateSecret(): string {
  return authenticator.generateSecret()
}

export function totpUri(secret: string, accountName: string, issuer = 'Suma Consultation'): string {
  return authenticator.keyuri(accountName, issuer, secret)
}

export async function totpQrPngDataUrl(uri: string): Promise<string> {
  return QRCode.toDataURL(uri, { width: 240, margin: 1 })
}

export function verifyTotp(secret: string, code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false
  try {
    return authenticator.check(code, secret)
  } catch {
    return false
  }
}
