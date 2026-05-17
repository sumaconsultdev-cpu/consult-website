# Suma Consultation — Complete Technical Guide for Beginners

This guide explains every technology used in this application: what it is, why we use it, where to find it in the code, and how to change it. Written for someone who is testing or learning — no prior coding background needed.

---

## Part 1 — The Big Picture

Before diving into individual technologies, here is how the whole system works end-to-end.

```
Your Customer's Browser
        │
        │  (opens website, clicks Book)
        ▼
  Vercel (our cloud host)
  runs Next.js — our application
        │
        ├──▶ Supabase (database — stores bookings, admin, etc.)
        ├──▶ Upstash Redis (rate limiter — stops bots)
        ├──▶ Razorpay (payment gateway — collects money)
        ├──▶ Meta WhatsApp API (sends WhatsApp messages)
        └──▶ Resend (sends emails as fallback)
```

**What is a browser?** The app your customer uses to open a website (Chrome, Safari, Firefox).

**What is a server?** A computer (hosted by Vercel) that runs our code. The customer never sees it directly — their browser talks to it over the internet.

**What is a database?** A structured store for data. Think of it like a very strict, very powerful Excel spreadsheet in the cloud (Supabase). It stores every booking, every slot, the admin's password, and every payment event.

**What is an API?** A URL your browser can call to ask the server to do something — like "create a booking" or "check available slots". The server does the work and sends back a response.

**Frontend vs Backend:**
- **Frontend** = what the customer sees in their browser (pages, buttons, forms). Files in `app/` and `components/`.
- **Backend** = code that runs on the server, touches the database, sends notifications. Files in `app/api/` and `lib/`.

---

## Part 2 — The Framework: Next.js 15

**What it is:** Next.js is the main framework that powers the entire application. Think of it as the engine that makes both the website pages *and* the backend API work — all in one project.

**Why we use it:** Instead of building a separate backend server and a separate frontend website, Next.js lets us put everything in one place. It handles:
- Serving web pages to browsers
- Running API routes (our backend logic)
- Automatic performance optimisations (caching, image compression)

**Where it lives:**
| Purpose | Location |
|---|---|
| Web pages | `app/page.tsx` (home), `app/book/page.tsx` (booking), `app/admin/` (admin area) |
| API routes (backend) | `app/api/` — every folder with `route.ts` is one API endpoint |
| Configuration | `next.config.mjs` |
| Runs on Vercel | `vercel.json` |

**Key file — `next.config.mjs`:**
```
poweredByHeader: false   ← hides "X-Powered-By: Next.js" from HTTP responses (security)
remotePatterns            ← allows images from Unsplash to be loaded
```

**Key file — `middleware.ts`:**
This file runs on *every single request* before anything else. It does two things:
1. Adds security headers (tells browsers how to behave safely)
2. Redirects anyone without a valid admin session away from `/admin/dashboard`

**How to add a new page:**
Create a new folder inside `app/` with a `page.tsx` file. For example, `app/about/page.tsx` would be accessible at `https://yoursite.com/about`.

**How to add a new API endpoint:**
Create a new folder inside `app/api/` with a `route.ts` file. Export a function named `GET` or `POST`. For example, `app/api/ping/route.ts` with `export function GET() { return Response.json({ ok: true }) }` would be accessible at `/api/ping`.

---

## Part 3 — The Language: TypeScript

**What it is:** TypeScript is the programming language used throughout this project. It is JavaScript (the language all browsers understand) with an extra layer that checks your code for mistakes *before* you run it.

**Why we use it:** This app handles real money. A simple typo like `ammount` instead of `amount` could send the wrong price to Razorpay. TypeScript catches these mistakes at development time, not when a real customer is paying.

**Where it lives:** Every file ending in `.ts` or `.tsx`. The configuration is in `tsconfig.json`.

**The `@/` shortcut:** Throughout the code you will see imports like `import { db } from '@/lib/supabase/server'`. The `@/` is a shortcut that means "the root of this project". So `@/lib/supabase/server` means the file `lib/supabase/server.ts`. This is configured in `tsconfig.json`.

**As a tester:** You don't need to write TypeScript. Just know that if you see a `.ts` or `.tsx` file, it's code that the computer reads.

---

## Part 4 — Styling: Tailwind CSS + shadcn/ui

**Tailwind CSS — what it is:** A system for styling web pages using short class names written directly in the HTML/JSX. Instead of writing a separate CSS file, you write things like `className="text-xl font-bold text-blue-600"` directly on an element.

**Why we use it:** Faster to write, easier to read at a glance, and the original design (from Figma) was already built this way.

**Where it lives:**
- Global styles: `app/globals.css`
- Classes appear inline in every component file (`components/`, `app/`)

**shadcn/ui — what it is:** A library of pre-built, accessible UI components like buttons, cards, dialogs, and input fields. These are the building blocks of the visual design — things like the booking form, the admin login screen, and the dashboard cards.

**Why we use it:** Instead of building a "Button" from scratch, we use the one from shadcn/ui which already handles keyboard navigation, screen readers, and consistent styling.

**Where it lives:** `components/ui/` — there are 50+ components here (Button, Card, Input, Dialog, Toast, etc.).

**How to change colours or fonts:**
Edit `app/globals.css` — the CSS variables at the top (like `--primary`, `--background`) control the colour theme across the entire site.

---

## Part 5 — The Database: Supabase (PostgreSQL)

**What it is:** Supabase is a cloud-hosted database service. PostgreSQL is the actual database engine — think of it as a very powerful, structured spreadsheet in the cloud where every row must follow strict rules.

**Why we use it:**
- Stores every booking, service, availability slot, admin account, and audit event
- Enforces the double-booking rule at the database level (not just in code)
- Row-level security (RLS) is enabled — the database itself refuses requests that don't come with the service-role key

**Where it lives:**
| File | Purpose |
|---|---|
| `lib/supabase/server.ts` | The ONLY place we connect to the database. All other files import from here. |
| `db/schema.sql` | The complete database definition. Paste into Supabase SQL Editor to create all tables. |

**Key tables:**
| Table | What it stores |
|---|---|
| `bookings` | Every booking (name, phone, service, date, time, payment status) |
| `availability` | Per-date overrides (which time slots are open on a specific date) |
| `availability_template` | Default slots for each day of the week |
| `services` | The list of services (Numerology, Vaastu, etc.) with prices |
| `admin_user` | The single admin account (hashed password, encrypted TOTP secret) |
| `admin_sessions` | Active login sessions (stores hashed token, not the real token) |
| `audit_log` | Record of every admin action (login, logout, data export) |
| `webhook_events` | Razorpay webhook events (prevents processing the same event twice) |

**The double-booking guarantee:**
The database has a special rule called a **partial UNIQUE index**:
```sql
CREATE UNIQUE INDEX bookings_active_slot_uniq
  ON bookings(date, time_slot)
  WHERE payment_status IN ('pending', 'paid');
```
Translation: no two rows can share the same date+time if either is pending or paid. If two customers try to book the same slot at the same millisecond, the database rejects the second one — even if the app code didn't catch it first.

**Key environment variables:**
| Variable | What it does |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | The address of your Supabase project (starts with `https://`) |
| `SUPABASE_SERVICE_ROLE_KEY` | The master key that lets server code read/write everything (keep secret!) |

**How to make a database change:**
1. Edit `db/schema.sql`
2. Go to Supabase Dashboard → SQL Editor
3. Paste and run the relevant `ALTER TABLE` or new statement

**Important:** Never use the service role key in the browser or commit it to GitHub. It bypasses all security rules.

---

## Part 6 — Rate Limiting: Upstash Redis

**What it is:** Upstash Redis is an in-memory counter service in the cloud. "Rate limiting" means counting how many requests come from one IP address and blocking them if they exceed the allowed amount.

**Why we use it:** Without rate limiting, a bot could:
- Flood the booking form and fill up the database with fake bookings
- Try millions of password combinations on the admin login
- Repeatedly trigger payment creation wasting Razorpay credits

**Where it lives:** `lib/rate-limit.ts`

**The five rate limiters:**
| Name | Limit | Protects |
|---|---|---|
| `public` | 100 requests / 1 minute / IP | General browsing |
| `booking` | 10 bookings / 10 minutes / IP | Booking creation |
| `admin-login` | 5 attempts / 15 minutes / IP | Admin login page |
| `webhook` | 60 requests / 1 minute | Razorpay webhook |
| `admin-action` | 30 actions / 1 minute / session | Admin dashboard |

**Key environment variables:**
| Variable | What it does |
|---|---|
| `UPSTASH_REDIS_REST_URL` | The URL of your Upstash Redis instance |
| `UPSTASH_REDIS_REST_TOKEN` | The secret token to authenticate with Upstash |

**Graceful degradation:** If these env vars are missing, rate limiting is disabled (requests are allowed through) but a warning is logged. The site still works — you just lose the protection.

**How to change limits:**
Edit the numbers in `lib/rate-limit.ts`. For example, to allow 20 login attempts instead of 5:
```
'admin-login': new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20, '15 m'), ... })
```

---

## Part 7 — Payments: Razorpay

**What it is:** Razorpay is an Indian payment gateway. It handles UPI, credit/debit cards, and netbanking. When a customer pays, money goes into the business's Razorpay account.

**Why we use it:** Most popular Indian payment processor, supports all common payment methods, and sends webhooks (automatic notifications to our server) when a payment succeeds or fails.

**The driver pattern:** The code supports two modes controlled by one env var:
- `PAYMENT_DRIVER=mock` — no real money moves; useful for testing (current default)
- `PAYMENT_DRIVER=razorpay` — real payments

**Where it lives:**
| File | Purpose |
|---|---|
| `lib/payment/types.ts` | Defines what a payment driver must be able to do |
| `lib/payment/razorpay.ts` | Real Razorpay implementation |
| `lib/payment/mock.ts` | Fake implementation that just logs to console |
| `lib/payment/index.ts` | Picks which one to use based on `PAYMENT_DRIVER` |
| `app/api/booking/create/route.ts` | Creates a payment order before showing the checkout |
| `app/api/booking/verify/route.ts` | Verifies the payment signature after customer pays |
| `app/api/webhook/razorpay/route.ts` | Receives Razorpay's server-to-server notifications |
| `app/api/dev/mock-pay/route.ts` | Mock payment endpoint for testing (only in mock mode) |

**How payment works step by step:**
1. Customer clicks "Pay" → our server creates an order with Razorpay (`/api/booking/create`)
2. Razorpay shows the payment popup in the browser
3. Customer pays → Razorpay calls back our verify endpoint (`/api/booking/verify`)
4. Our server checks the HMAC signature (a cryptographic proof from Razorpay)
5. If valid: booking is marked `paid`, notifications sent
6. Razorpay also sends a webhook (`/api/webhook/razorpay`) as a backup

**Security:** The booking price comes from our database, not from the browser. A customer cannot change the price by modifying JavaScript in their browser.

**Key environment variables:**
| Variable | What it does |
|---|---|
| `PAYMENT_DRIVER` | `mock` (testing) or `razorpay` (real) |
| `RAZORPAY_KEY_ID` | Public key shown to browser for Razorpay popup |
| `RAZORPAY_KEY_SECRET` | Private key used server-side to sign/verify |
| `RAZORPAY_WEBHOOK_SECRET` | Used to verify Razorpay webhook authenticity |

**How to enable real payments:**
1. Create a Razorpay account at razorpay.com
2. Get your Key ID and Key Secret from Dashboard → Settings → API Keys
3. Get the Webhook Secret from Dashboard → Webhooks (set it to call `https://yoursite.com/api/webhook/razorpay`)
4. In `.env.local` set:
   ```
   PAYMENT_DRIVER=razorpay
   RAZORPAY_KEY_ID=rzp_live_...
   RAZORPAY_KEY_SECRET=...
   RAZORPAY_WEBHOOK_SECRET=...
   ```

---

## Part 8 — WhatsApp Notifications: Meta Cloud API

**What it is:** The Meta (Facebook) WhatsApp Cloud API lets businesses send WhatsApp messages programmatically — meaning our server can send a WhatsApp message automatically after a booking.

**Why we use it:** Customers get an instant booking confirmation on WhatsApp. The admin also gets a notification for each new booking. More reliable and immediate than email for Indian customers.

**The driver pattern:** Same as payments — two modes:
- `WHATSAPP_DRIVER=mock` — messages printed to the server console, nothing actually sent (current default)
- `WHATSAPP_DRIVER=meta` — real WhatsApp messages

**Where it lives:**
| File | Purpose |
|---|---|
| `lib/whatsapp/types.ts` | Defines what a WhatsApp driver must do |
| `lib/whatsapp/meta.ts` | Real Meta API implementation |
| `lib/whatsapp/mock.ts` | Fake implementation (logs to console) |
| `lib/whatsapp/index.ts` | Picks which one to use based on `WHATSAPP_DRIVER` |
| `lib/notify.ts` | Orchestrates notifications — calls WhatsApp, falls back to email if WhatsApp fails |

**How to enable real WhatsApp:**
1. Set up a Meta Business account and WhatsApp Cloud API at developers.facebook.com
2. Create message templates for booking confirmation (must be approved by Meta)
3. In `.env.local` set:
   ```
   WHATSAPP_DRIVER=meta
   META_WA_PHONE_NUMBER_ID=...
   META_WA_ACCESS_TOKEN=...
   META_WA_TEMPLATE_CONFIRMATION=booking_confirmation
   ADMIN_WHATSAPP_NUMBER=91XXXXXXXXXX
   ```

**Key environment variables:**
| Variable | What it does |
|---|---|
| `WHATSAPP_DRIVER` | `mock` or `meta` |
| `META_WA_PHONE_NUMBER_ID` | Your WhatsApp Business phone number ID |
| `META_WA_ACCESS_TOKEN` | The API token from Meta |
| `META_WA_TEMPLATE_CONFIRMATION` | Name of the approved message template |
| `ADMIN_WHATSAPP_NUMBER` | Admin's phone number to receive booking alerts |

---

## Part 9 — Email: Resend

**What it is:** Resend is a developer-focused email delivery service. It sends transactional emails (booking confirmations, receipts).

**Why we use it:** Fallback for when WhatsApp fails or for customers who prefer email. Also provides a more formal paper trail.

**The driver pattern:** Same pattern again:
- `EMAIL_DRIVER=mock` — emails logged to console, not sent (current default)
- `EMAIL_DRIVER=resend` — real emails

**Where it lives:**
| File | Purpose |
|---|---|
| `lib/email/types.ts` | Defines what an email driver must do |
| `lib/email/resend.ts` | Real Resend implementation |
| `lib/email/mock.ts` | Fake implementation |
| `lib/email/index.ts` | Picks driver based on `EMAIL_DRIVER` |
| `lib/notify.ts` | Tries WhatsApp first, sends email if WhatsApp fails |

**Key environment variables:**
| Variable | What it does |
|---|---|
| `EMAIL_DRIVER` | `mock` or `resend` |
| `RESEND_API_KEY` | API key from resend.com |
| `EMAIL_FROM` | The "from" address customers see (e.g., `Suma Consultation <noreply@example.com>`) |
| `ADMIN_EMAIL` | Admin's email for booking alert copies |

---

## Part 10 — Hosting: Vercel

**What it is:** Vercel is the cloud platform that runs the application. When you push code to GitHub, Vercel automatically builds and deploys it.

**Why we use it:** Zero-configuration deployment for Next.js apps (they built Next.js). Includes free SSL certificates, a global CDN, and built-in cron job support.

**Where it lives:**
| File | Purpose |
|---|---|
| `vercel.json` | Vercel-specific configuration (cron jobs) |
| GitHub repo | Source of truth — Vercel pulls from here on every push |

**The cron job:** Every 2 minutes, Vercel automatically calls `/api/cron/release-expired`. This frees any booking slots that were held as "pending" (customer started checkout but didn't pay within 10 minutes). Without this, slots would be locked forever if someone abandoned the payment.

```json
// vercel.json
{
  "crons": [{
    "path": "/api/cron/release-expired",
    "schedule": "*/2 * * * *"
  }]
}
```

**Key environment variable:**
| Variable | What it does |
|---|---|
| `CRON_SECRET` | Secret token Vercel includes in cron requests so our API knows it's real (not a random visitor) |

**How to deploy:**
1. Push code to GitHub
2. Vercel automatically builds and deploys within ~2 minutes
3. Set all environment variables in Vercel Dashboard → Project → Settings → Environment Variables

---

## Part 11 — Security: Admin Authentication

This is the most complex security system in the app. There are three layers protecting the admin area.

### Layer 1 — Password (bcrypt)

**What it is:** bcrypt is a password hashing algorithm. When you set a password, bcrypt converts it into a long scrambled string (a "hash") that cannot be reversed back to the original password.

**Why we use it:** If someone steals the database, they get the hash — not your actual password. To verify a login, bcrypt hashes what you typed and compares it to the stored hash.

**Where it lives:** `lib/auth/password.ts`

**Password requirements** (enforced by `passwordPolicyError()`):
- Minimum 12 characters
- Must contain letters AND at least one non-letter character

### Layer 2 — TOTP 2FA (Time-based One-Time Password)

**What it is:** The 6-digit code your authenticator app (Google Authenticator, Authy, 1Password) shows. It changes every 30 seconds and is mathematically tied to a secret key shared between the app and your authenticator.

**Why we use it:** Even if someone guesses or steals your password, they still can't log in without the rotating 6-digit code from your phone.

**How it works:**
1. During admin setup (`/admin/setup`), a QR code is shown
2. You scan it with Google Authenticator
3. From that point on, every login requires both password + 6-digit code
4. The secret is stored in the database encrypted with AES-256-GCM (so even database access doesn't reveal it without `APP_SECRET`)

**Where it lives:** `lib/auth/totp.ts`

**Key environment variable:**
| Variable | What it does |
|---|---|
| `APP_SECRET` | Used to encrypt/decrypt the TOTP secret in the database. MUST be rotated before production and kept secret. |

### Layer 3 — Session Cookie

**What it is:** After successful login (correct password + correct TOTP), the server creates a session. A random 32-byte token is stored in an HttpOnly cookie on your browser. The database only stores a SHA-256 hash of that token.

**Why we use it:** HttpOnly cookies can't be read by JavaScript — so even if a malicious script runs on the page, it can't steal your session. And if someone steals the database, the stored hash is useless without the original token.

**Session expiry:**
- **Idle timeout:** 30 minutes — if you do nothing for 30 minutes, session expires
- **Absolute timeout:** 8 hours — maximum session length no matter what

**Where it lives:** `lib/auth/session.ts`

**Login throttling:** After 5 failed login attempts, the account is locked for 15 minutes. After 8 attempts, 1 hour. After 12 attempts, 6 hours. This is in `lib/auth/throttle.ts`.

**Recovery codes:** During setup, 10 single-use recovery codes are generated. If you lose your authenticator app, you can use one of these codes instead of the TOTP. Each code is used only once. The generation happens in `lib/auth/recovery.ts`.

---

## Part 12 — Security: CSRF Protection

**What it is:** CSRF stands for Cross-Site Request Forgery. It's an attack where a malicious website tricks your browser into making a request to our admin API while you're logged in.

**Why we use it:** Without CSRF protection, a hacker could create a fake website that, when you visit it, silently calls our `/api/admin/logout` or changes slot availability — because your browser automatically includes your session cookie on all requests to our domain.

**How it works (double-submit pattern):**
1. When you log in, the server creates an HMAC-signed CSRF token and stores it in a regular (JavaScript-readable) cookie
2. Our admin frontend JavaScript reads that cookie and puts the token in an `x-csrf-token` HTTP header on every write request
3. Our API routes check that the header matches the cookie
4. A malicious third-party site can't do this because it can't read our cookies (browser security rules prevent it)

**Where it lives:** `lib/csrf.ts`

**As a tester:** If you see a `403` error mentioning "csrf", the CSRF token is missing or mismatched. This is expected if you try to call admin API routes directly without going through the browser UI.

---

## Part 13 — Input Validation: Zod

**What it is:** Zod is a library that validates the shape and content of data before the app processes it.

**Why we use it:** When a booking request arrives, we need to verify that:
- The date is a real date in `YYYY-MM-DD` format
- The phone number is a valid Indian mobile number
- The service ID is not empty
- The time slot is in `HH:MM` format

Without validation, malformed data could crash the server or corrupt the database.

**Where it lives:** `lib/booking/validation.ts` — all booking-related schemas are here.

**Example** (in plain English):
```
BookingCreateSchema requires:
  - serviceId: non-empty string
  - date: string matching YYYY-MM-DD
  - timeSlot: string matching HH:MM
  - name: 2-80 characters
  - phone: Indian mobile format (10 digits starting 6-9, optionally with +91)
  - email: optional, but must be valid if provided
```

**How to modify validation rules:** Edit the schemas in `lib/booking/validation.ts`. For example, to allow names up to 100 characters instead of 80, change `.max(80)` to `.max(100)`.

---

## Part 14 — Slot Management

**What it is:** The logic that determines which time slots are available on any given date.

**Where it lives:** `lib/booking/slots.ts`

**Key constants:**
| Constant | Value | Meaning |
|---|---|---|
| `LEAD_HOURS` | 24 | Customers can only book slots at least 24 hours in the future |
| `HORIZON_DAYS` | 60 | Customers can book at most 60 days in advance |
| `HOLD_MINUTES` | 10 | A "pending" booking holds its slot for 10 minutes while the customer pays |

**How slot availability is determined:**
1. Check the `availability` table for that specific date (per-date override)
2. If no override exists, check the `availability_template` table for the day of the week (default schedule)
3. Remove any slots already taken by pending or paid bookings
4. Remove any slots that are less than 24 hours from now

**How to change the booking window:**
Edit the constants at the top of `lib/booking/slots.ts`:
```typescript
export const LEAD_HOURS = 24     // change to 48 for 2-day advance booking
export const HORIZON_DAYS = 60   // change to 90 for 3-month advance booking
export const HOLD_MINUTES = 10   // change to 15 for longer payment window
```

---

## Part 15 — Encrypted Data Export

**What it is:** The admin can download all booking data as an encrypted file. Only someone with the correct passphrase can open it.

**Why we use it:** Provides offline data backup that is safe even if the file is intercepted — without the passphrase, the file is unreadable.

**Where it lives:**
| File | Purpose |
|---|---|
| `lib/export/encrypt.ts` | Builds a ZIP file, encrypts it with AES-256-GCM |
| `app/api/admin/export/route.ts` | API route that triggers the export |
| `app/admin/dashboard/export/page.tsx` | Admin UI for the export feature |
| `db/decrypt-export.mjs` | Standalone script to decrypt the file on your computer |

**How to decrypt an exported file:**
On your computer, run:
```bash
node db/decrypt-export.mjs downloaded-file.enc 'your passphrase here'
```
This outputs a ZIP file containing CSV and JSON of all bookings.

---

## Part 16 — Environment Variables: Complete Reference

Environment variables are secret configuration values stored in `.env.local` (local development) or Vercel's environment variable settings (production). The file `.env.example` shows every variable the app needs.

| Variable | Required | What it does | Mock/Default |
|---|---|---|---|
| `APP_BASE_URL` | Yes | Full URL of the site (e.g., `https://yoursite.com`) | `http://localhost:3000` |
| `APP_TIMEZONE` | Yes | Timezone for slot calculations | `Asia/Kolkata` |
| `APP_SECRET` | Yes | Master secret for TOTP encryption. Rotate before production! | Dev placeholder |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL | — |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase publishable key (not actually used by our code) | — |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service-role key (full database access) | — |
| `UPSTASH_REDIS_REST_URL` | No | Upstash Redis URL for rate limiting | Rate limiting disabled if missing |
| `UPSTASH_REDIS_REST_TOKEN` | No | Upstash Redis token | Rate limiting disabled if missing |
| `PAYMENT_DRIVER` | Yes | `mock` or `razorpay` | `mock` |
| `RAZORPAY_KEY_ID` | If real payments | Razorpay public key | — |
| `RAZORPAY_KEY_SECRET` | If real payments | Razorpay private key | — |
| `RAZORPAY_WEBHOOK_SECRET` | If real payments | Razorpay webhook signing secret | — |
| `WHATSAPP_DRIVER` | Yes | `mock` or `meta` | `mock` |
| `META_WA_PHONE_NUMBER_ID` | If real WhatsApp | Meta WhatsApp phone number ID | — |
| `META_WA_ACCESS_TOKEN` | If real WhatsApp | Meta API access token | — |
| `META_WA_TEMPLATE_CONFIRMATION` | If real WhatsApp | Name of WhatsApp message template | `booking_confirmation` |
| `ADMIN_WHATSAPP_NUMBER` | If real WhatsApp | Admin's WhatsApp number for alerts | — |
| `EMAIL_DRIVER` | Yes | `mock` or `resend` | `mock` |
| `RESEND_API_KEY` | If real email | Resend API key | — |
| `EMAIL_FROM` | If real email | From address for emails | `Suma Consultation <noreply@example.com>` |
| `ADMIN_EMAIL` | If real email | Admin email for booking alerts | — |
| `ADMIN_SETUP_TOKEN` | Optional | Token for `/admin/setup` — leave blank after setup | — |
| `CRON_SECRET` | Yes | Secret header Vercel sends with cron requests | Dev placeholder — rotate before production! |

---

## Part 17 — How to Make Common Changes

### Add a new service (e.g., "Feng Shui Consultation")

1. Go to the Admin Dashboard → Services
2. Click to add a new service, fill in name, slug, description, duration, price
3. The service will appear immediately on the booking page

### Change the available time slots for a specific date

1. Go to Admin Dashboard → Availability
2. Select the date
3. Check/uncheck the time slots you want

### Change the default weekly schedule

1. Go to Supabase Dashboard → Table Editor → `availability_template`
2. Edit the row with `id=1`
3. Each column (`monday`, `tuesday`, etc.) holds a list of time strings like `["09:00","10:00","11:00"]`

### Change how far in advance customers can book

Edit `lib/booking/slots.ts`:
- `LEAD_HOURS` — minimum hours before a slot (default: 24)
- `HORIZON_DAYS` — how many days ahead the calendar opens (default: 60)

### Change the admin session timeout

Edit `lib/auth/session.ts`:
- `IDLE_MS` — idle timeout (default: 30 minutes)
- `ABSOLUTE_MS` — absolute maximum session length (default: 8 hours)

### Enable real payments

1. Sign up at razorpay.com and get API keys
2. Update `.env.local`:
   ```
   PAYMENT_DRIVER=razorpay
   RAZORPAY_KEY_ID=rzp_live_...
   RAZORPAY_KEY_SECRET=...
   RAZORPAY_WEBHOOK_SECRET=...
   ```
3. Set the same vars in Vercel environment variables for production

### Enable real WhatsApp notifications

1. Set up a Meta Business account and WhatsApp Cloud API
2. Create and get approval for a message template named `booking_confirmation`
3. Update `.env.local`:
   ```
   WHATSAPP_DRIVER=meta
   META_WA_PHONE_NUMBER_ID=...
   META_WA_ACCESS_TOKEN=...
   ADMIN_WHATSAPP_NUMBER=91XXXXXXXXXX
   ```

### Enable real email notifications

1. Sign up at resend.com and create an API key
2. Update `.env.local`:
   ```
   EMAIL_DRIVER=resend
   RESEND_API_KEY=re_...
   EMAIL_FROM=Suma Consultation <noreply@yourdomain.com>
   ADMIN_EMAIL=your@email.com
   ```

---

## Part 18 — File Map: Where Everything Lives

```
Consult-website/
│
├── app/                        ← Next.js pages and API routes
│   ├── page.tsx                   Home page
│   ├── book/page.tsx              Booking page
│   ├── booking/
│   │   ├── success/page.tsx       Post-payment success page
│   │   └── failed/page.tsx        Payment failure page
│   ├── admin/
│   │   ├── page.tsx               Admin login page
│   │   ├── setup/page.tsx         First-time admin setup
│   │   └── dashboard/             Admin dashboard (protected)
│   │       ├── page.tsx           Overview / analytics
│   │       ├── bookings/          Booking list
│   │       ├── availability/      Slot management
│   │       ├── services/          Service catalog
│   │       └── export/            Data export
│   ├── api/                    ← All backend API endpoints
│   │   ├── services/              GET: public service list
│   │   ├── availability/          GET: slot availability for a date
│   │   ├── booking/
│   │   │   ├── create/            POST: create booking + payment order
│   │   │   └── verify/            POST: verify payment after checkout
│   │   ├── webhook/razorpay/      POST: Razorpay server webhook
│   │   ├── cron/release-expired/  GET: frees stale pending bookings
│   │   ├── dev/mock-pay/          POST: test payment (mock mode only)
│   │   └── admin/
│   │       ├── setup/             GET+POST: admin setup flow
│   │       ├── login/             POST: admin login
│   │       ├── logout/            POST: admin logout
│   │       ├── me/                GET: current session info
│   │       ├── bookings/          GET: booking list with filters
│   │       ├── availability/      GET+PUT: slot management
│   │       ├── services/          GET+PUT: service management
│   │       ├── analytics/         GET: booking/revenue stats
│   │       └── export/            POST: encrypted data export
│   ├── layout.tsx              Root layout (header, footer, cookie banner)
│   └── globals.css             Global styles and colour theme
│
├── components/                 ← Reusable UI components
│   ├── ui/                        shadcn/ui building blocks (Button, Card, etc.)
│   ├── booking/
│   │   └── BookingFlow.tsx         The 3-step booking wizard
│   ├── admin/
│   │   ├── AdminLogin.tsx          Login form
│   │   ├── AdminSetup.tsx          First-time setup flow
│   │   ├── AdminShell.tsx          Dashboard sidebar
│   │   ├── AdminOverview.tsx       Analytics cards
│   │   ├── AdminBookings.tsx       Booking table
│   │   ├── AdminAvailability.tsx   Slot manager
│   │   ├── AdminServices.tsx       Service editor
│   │   └── AdminExport.tsx         Export form
│   ├── site-header.tsx             Top navigation bar
│   ├── site-footer.tsx             Footer
│   └── cookie-banner.tsx           Cookie consent popup
│
├── lib/                        ← Server-side utilities and business logic
│   ├── supabase/server.ts          Database client (only one in whole app)
│   ├── env.ts                      Reads environment variables safely
│   ├── logger.ts                   Structured JSON logging
│   ├── http.ts                     HTTP helpers (ok, fail, safe wrapper)
│   ├── ids.ts                      Booking ID generation
│   ├── time.ts                     Date/time math in IST
│   ├── utils.ts                    cn() helper for Tailwind class names
│   ├── rate-limit.ts               Upstash Redis rate limiters
│   ├── csrf.ts                     CSRF token issue + verify
│   ├── notify.ts                   Orchestrates WhatsApp + email notifications
│   ├── auth/
│   │   ├── crypto.ts               AES-256-GCM encrypt/decrypt, SHA-256 hash
│   │   ├── password.ts             bcrypt hash + verify + policy check
│   │   ├── totp.ts                 TOTP generate, QR, verify
│   │   ├── throttle.ts             Login attempt tracking + lockout
│   │   ├── session.ts              Session create, validate, destroy
│   │   └── recovery.ts             Recovery codes issue + consume
│   ├── booking/
│   │   ├── validation.ts           Zod schemas for all booking requests
│   │   └── slots.ts                Slot availability logic
│   ├── payment/
│   │   ├── types.ts                Payment driver interface
│   │   ├── razorpay.ts             Real Razorpay implementation
│   │   ├── mock.ts                 Mock implementation
│   │   └── index.ts                Driver selector
│   ├── whatsapp/
│   │   ├── types.ts                WhatsApp driver interface
│   │   ├── meta.ts                 Real Meta API implementation
│   │   ├── mock.ts                 Mock implementation
│   │   └── index.ts                Driver selector
│   ├── email/
│   │   ├── types.ts                Email driver interface
│   │   ├── resend.ts               Real Resend implementation
│   │   ├── mock.ts                 Mock implementation
│   │   └── index.ts                Driver selector
│   └── export/
│       └── encrypt.ts              AES-encrypted ZIP export builder
│
├── db/
│   ├── schema.sql                  Complete database definition (paste into Supabase)
│   └── decrypt-export.mjs          Offline decryption script for exported backups
│
├── middleware.ts               ← Runs on every request (security headers + admin redirect)
├── next.config.mjs             ← Next.js configuration
├── vercel.json                 ← Vercel cron job configuration
├── tsconfig.json               ← TypeScript configuration
├── .env.local                  ← Local dev secrets (never commit this)
├── .env.example                ← Template showing all required env vars
└── package.json                ← All dependencies and scripts
```

---

## Part 19 — Pre-Production Checklist

Before going live with real customers:

- [ ] **Rotate APP_SECRET** — run `openssl rand -base64 48` and replace in Vercel env vars
- [ ] **Rotate CRON_SECRET** — run `openssl rand -base64 32` and replace in Vercel env vars
- [ ] **Complete admin bootstrap** — visit `/admin/setup`, scan QR, save recovery codes
- [ ] **Enable real payments** — set `PAYMENT_DRIVER=razorpay` and add real Razorpay keys
- [ ] **Enable real WhatsApp** — set `WHATSAPP_DRIVER=meta` and add Meta credentials
- [ ] **Enable real email** — set `EMAIL_DRIVER=resend` and add Resend key
- [ ] **Verify Razorpay webhook** — point `https://yoursite.com/api/webhook/razorpay` in Razorpay Dashboard
- [ ] **Set real content** — update service names, descriptions, and prices through Admin → Services
- [ ] **Test a full booking** — make a real booking end-to-end before announcing launch
- [ ] **Save recovery codes** — print and store the 10 admin recovery codes securely

---

*Generated for the Suma Consultation platform — Vercel + Next.js 15 + Supabase + Razorpay + Meta WhatsApp*
