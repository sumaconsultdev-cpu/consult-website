# Suma Consultation

Production booking platform for a small spiritual-consultation business. Next.js + Supabase + Razorpay + WhatsApp.

Designed to run unattended: no IT team, no constant monitoring. Security, slot integrity, and payment integrity are enforced at multiple layers so a single mistake at any layer can't take the system down or let money slip through.

---

## Stack at a glance

| Concern            | Choice                                                |
| ------------------ | ----------------------------------------------------- |
| Framework          | Next.js 15 (App Router)                               |
| Language           | TypeScript (strict)                                   |
| UI                 | Tailwind v4 + shadcn/ui (unchanged from Figma export) |
| Database           | Supabase Postgres (RLS-on, service-role server-side)  |
| Hosting            | Vercel (frontend + serverless API + Cron)             |
| DNS / CDN          | Cloudflare                                            |
| Payments           | Razorpay (driver) + built-in mock driver              |
| WhatsApp           | Meta Cloud API (driver) + mock                        |
| Email fallback     | Resend (driver) + mock                                |
| Rate limiting      | Upstash Redis                                         |
| Admin auth         | bcrypt password + TOTP 2FA + recovery codes           |
| Encrypted exports  | AES-256-GCM (scrypt-derived key) ZIP archive          |

---

## Folder layout

```
app/                      Next.js App Router routes
  api/                    JSON route handlers (server)
    availability/         Public slot listing
    services/             Public service catalog
    booking/create        Create pending booking + payment order
    booking/verify        Verify Razorpay signature, promote to paid
    webhook/razorpay      Authoritative payment confirmation
    cron/release-expired  Vercel-cron entrypoint
    dev/mock-pay          Mock-only: mints valid mock signatures
    admin/*               Admin-only routes (setup, login, bookings, …)
  admin/                  Admin pages (setup, login, dashboard/*)
  book/                   Customer booking page
  booking/{success,failed}
  privacy, terms          Legal pages
  page.tsx                Home
components/               Page sections + shadcn UI
lib/                      Server-only business logic
  auth/                   bcrypt, TOTP, sessions, recovery codes, throttle
  booking/                slots, validation
  payment/                Razorpay + mock drivers
  whatsapp/               Meta + mock drivers
  email/                  Resend + mock drivers
  export/                 Encrypted archive builder
  supabase/server.ts      Singleton service-role client
  csrf.ts, rate-limit.ts, http.ts, time.ts, ids.ts, env.ts, logger.ts
db/
  schema.sql              Single migration — services, bookings, etc.
  decrypt-export.mjs      Offline decryption helper for encrypted exports
public/imports/           Legacy image assets (preserved)
middleware.ts             Security headers + admin redirect
vercel.json               Cron schedule
```

---

## Local development

```bash
# 1. install deps
npm install

# 2. copy env template and fill in at minimum:
#    APP_SECRET, APP_BASE_URL, the four NEXT_PUBLIC_/SUPABASE_* vars
cp .env.example .env.local

# 3. apply the schema (paste db/schema.sql into Supabase SQL editor, or
#    run via the Supabase CLI). The seed inserts three services and the
#    default availability template.

# 4. run
npm run dev
```

The site comes up at `http://localhost:3000`. With `PAYMENT_DRIVER=mock`,
`WHATSAPP_DRIVER=mock` and `EMAIL_DRIVER=mock` (the defaults), you can take a
booking end-to-end without any external service credentials.

### Bootstrapping the admin

1. Visit `/admin` — you'll be redirected to `/admin/setup`.
2. Scan the QR with any TOTP app (Google Authenticator, 1Password, Authy, …).
3. Choose a password (min 12 chars, mixed letters + digits/symbols).
4. Enter the 6-digit TOTP code shown on your authenticator.
5. **Save the 10 recovery codes shown next.** They are shown ONCE.
6. Sign in at `/admin` with password + a fresh TOTP code.

The setup route auto-disables itself the moment the admin row is finalised.

---

## Production deployment (Vercel)

### 1. Supabase

- Create a new Supabase project.
- In SQL Editor, paste and run `db/schema.sql`.
- Copy `Project URL`, `anon` key (public), `service_role` key (secret).
- (Optional) Configure backups in Supabase: daily PITR is included on the
  Pro plan and strongly recommended once you go live.

### 2. Upstash Redis

- Create a free Upstash Redis database.
- Copy the REST URL + token. Without these, rate-limiting silently no-ops and
  a WARN is logged on every cold start — fine for development, not for
  production.

### 3. Razorpay

- Use **Test Mode** keys to begin (`rzp_test_...`).
- Set the webhook URL to `https://<your-domain>/api/webhook/razorpay` with the
  events: `payment.captured`, `payment.failed`. Copy the webhook secret.
- Switch `PAYMENT_DRIVER=razorpay` once the three secrets are set in Vercel.

### 4. Meta WhatsApp Cloud API

- Create a Meta business app, enable WhatsApp.
- Get `phone_number_id` + a permanent system-user access token.
- Approve a template named `booking_confirmation` with 4 body variables in
  this order: customer name, service name, date+time, booking ID.
- Set `WHATSAPP_DRIVER=meta`.

### 5. Resend (email fallback)

- Create an API key; verify the sending domain.
- Set `EMAIL_DRIVER=resend`.

### 6. Vercel

- Import the repo. Choose the Next.js preset.
- Add all variables from `.env.example` (non-empty for required, empty for
  unused optional ones).
- **Set a strong `APP_SECRET`** — at least 32 random bytes
  (`openssl rand -base64 48`). This protects the at-rest TOTP secret, the CSRF
  signatures, and the mock-driver signing key.
- **Set `CRON_SECRET`** to a random value; Vercel passes it as
  `Authorization: Bearer <CRON_SECRET>` on the slot-cleanup cron.
- The first deploy creates the cron from `vercel.json` (every 2 minutes hitting
  `/api/cron/release-expired`).

### 7. Cloudflare

- Point your domain's nameservers at Cloudflare.
- Add the domain in Vercel; Vercel issues an SSL cert. In Cloudflare set the
  CNAME for `@` to the Vercel target and turn on:
  - SSL/TLS mode: **Full (strict)**
  - Always Use HTTPS: **on**
  - Min TLS version: **1.2**
  - Brotli compression: **on**

---

## Security posture (what's actually enforced where)

| Threat                            | Defence                                                                                                                                      |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Double-booking a slot             | Partial UNIQUE index on `(date, time_slot) WHERE status IN ('pending','paid')` — DB-level, cannot be bypassed by app races.                  |
| Underpaid bookings                | Price pinned server-side from `services.price_paise`. The client cannot inject an amount.                                                    |
| Fake payment confirmation         | HMAC-SHA256 signature verified on `/api/booking/verify` AND independently re-verified by the Razorpay webhook.                               |
| Webhook spoofing                  | Raw body HMAC compared against `RAZORPAY_WEBHOOK_SECRET` with `timingSafeEqual`. JSON parsing happens only after verification.               |
| Webhook replay                    | `webhook_events.event_id` unique constraint; duplicate deliveries short-circuit.                                                             |
| Slot expiry                       | Pending bookings carry `hold_expires_at`; Vercel Cron + opportunistic-on-read both call the `release_expired_bookings()` RPC.                |
| Admin password compromise         | bcrypt cost 12 + 2FA required at every login. No password reveals 2FA recovery.                                                              |
| 2FA secret leak from DB           | TOTP secret is stored AES-256-GCM-encrypted (key = HKDF(APP_SECRET, 'totp')). A DB dump alone cannot generate codes.                         |
| Session hijack                    | Cookie holds random 32-byte token; only `sha256(token)` is in the DB. HttpOnly, Secure, SameSite=Lax.                                        |
| Brute-forced login                | Upstash rate-limit (5/15min/IP) + DB-backed exponential backoff (15min → 1h → 6h).                                                           |
| CSRF on admin mutating routes     | Double-submit cookie + HMAC-signed token, required on every PUT/POST/DELETE outside login.                                                   |
| XSS                               | Strict CSP (no `unsafe-eval` in prod), React auto-escapes, `dangerouslySetInnerHTML` is not used.                                            |
| Clickjacking                      | `X-Frame-Options: DENY` + `frame-ancestors 'none'` in CSP.                                                                                   |
| SQL injection                     | Supabase JS client + parameterised queries throughout. No raw SQL strings on user input.                                                     |
| Sensitive errors leaking          | All routes wrapped in `safe()`; internal errors map to generic 500. Detail goes to structured logs only.                                     |
| Past-date / lead-time abuse       | Server validates `date ≥ today` and `slot ≥ now + 24h` independently of any client value.                                                    |
| Forced admin URLs / SEO indexing  | `/admin/*` routes have `robots: noindex` metadata and are in `robots.txt`'s disallow list.                                                   |

---

## Operational runbook

### Decrypting an export
```bash
node db/decrypt-export.mjs suma-export-2026-05-16.enc 'your-passphrase'
# → produces suma-export-2026-05-16.zip with CSV + JSON inside
```

### Forgot the admin password / 2FA device
1. Sign in via recovery code (UI route is on the roadmap; in the meantime use
   the `consume_recovery_code` flow via SQL or by temporarily setting
   `ADMIN_SETUP_TOKEN` and re-running `/admin/setup`).
2. Re-issue recovery codes after using one — they are single-use.

### Force-release a stuck pending booking
SQL:
```sql
update public.bookings
   set payment_status = 'cancelled', cancelled_at = now(), hold_expires_at = null
 where booking_id = 'SC-XXXXXXXX' and payment_status = 'pending';
```

### Rotate `APP_SECRET`
Rotating `APP_SECRET` invalidates the encrypted TOTP secret and the CSRF tokens.
Plan to:
1. Save recovery codes are accessible (they are stored hashed, but you have the
   plaintext copies you downloaded).
2. After rotation, the admin must use a recovery code to re-pair 2FA and the
   CSRF cookie will be reissued on next login.

---

## Roadmap (deferred by spec)

- Service-mode field (in-person / online / phone) — schema column TBD when
  client confirms.
- GST handling on invoices.
- Cancellation/refund flows in admin UI (Razorpay refund API).
- Reminders 24h/1h before the appointment.
- Recovery-code consumption flow in admin UI (currently SQL-only).

---

## Licence

Proprietary — © Suma Consultation, all rights reserved.
