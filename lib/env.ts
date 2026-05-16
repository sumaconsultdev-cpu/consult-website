import 'server-only'

/**
 * Centralised env reader. Reading a required var that is missing throws on
 * first access — pages and API routes fail-fast with a clear stack trace
 * instead of producing silent runtime bugs.
 *
 * Why a tagged accessor instead of `process.env.X!`:
 *   - one place to add validation (length, format)
 *   - safe for `mock` drivers that intentionally leave secrets unset
 *   - boot-time vs request-time errors stay legible
 */

type Mode = 'required' | 'optional'

function read(name: string, mode: Mode): string {
  const v = process.env[name]
  if (v && v.length > 0) return v
  if (mode === 'optional') return ''
  throw new Error(`Missing required environment variable: ${name}`)
}

export const env = {
  // App
  appBaseUrl: () => read('APP_BASE_URL', 'required'),
  appSecret: () => {
    const s = read('APP_SECRET', 'required')
    if (s.length < 32) {
      throw new Error('APP_SECRET must be at least 32 characters of random data')
    }
    return s
  },
  timezone: () => process.env.APP_TIMEZONE || 'Asia/Kolkata',
  nodeEnv: () => process.env.NODE_ENV || 'development',
  isProd: () => process.env.NODE_ENV === 'production',

  // Supabase
  supabaseUrl: () => read('NEXT_PUBLIC_SUPABASE_URL', 'required'),
  supabaseServiceRole: () => read('SUPABASE_SERVICE_ROLE_KEY', 'required'),

  // Upstash
  upstashUrl: () => read('UPSTASH_REDIS_REST_URL', 'optional'),
  upstashToken: () => read('UPSTASH_REDIS_REST_TOKEN', 'optional'),

  // Razorpay
  paymentDriver: (): 'mock' | 'razorpay' =>
    (process.env.PAYMENT_DRIVER === 'razorpay' ? 'razorpay' : 'mock'),
  razorpayKeyId: () => read('RAZORPAY_KEY_ID', 'optional'),
  razorpayKeySecret: () => read('RAZORPAY_KEY_SECRET', 'optional'),
  razorpayWebhookSecret: () => read('RAZORPAY_WEBHOOK_SECRET', 'optional'),

  // WhatsApp
  whatsappDriver: (): 'mock' | 'meta' =>
    (process.env.WHATSAPP_DRIVER === 'meta' ? 'meta' : 'mock'),
  metaWaPhoneNumberId: () => read('META_WA_PHONE_NUMBER_ID', 'optional'),
  metaWaAccessToken: () => read('META_WA_ACCESS_TOKEN', 'optional'),
  metaWaTemplate: () => process.env.META_WA_TEMPLATE_CONFIRMATION || 'booking_confirmation',
  adminWhatsappNumber: () => read('ADMIN_WHATSAPP_NUMBER', 'optional'),

  // Email
  emailDriver: (): 'mock' | 'resend' =>
    (process.env.EMAIL_DRIVER === 'resend' ? 'resend' : 'mock'),
  resendApiKey: () => read('RESEND_API_KEY', 'optional'),
  emailFrom: () => process.env.EMAIL_FROM || 'Suma Consultation <noreply@example.com>',
  adminEmail: () => read('ADMIN_EMAIL', 'optional'),

  // Admin setup / cron
  adminSetupToken: () => read('ADMIN_SETUP_TOKEN', 'optional'),
  cronSecret: () => read('CRON_SECRET', 'optional'),
}
