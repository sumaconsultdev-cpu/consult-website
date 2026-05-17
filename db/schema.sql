-- =============================================================================
-- Suma Consultation — Supabase schema (single migration)
-- Run via: supabase db push  OR  paste into Supabase SQL editor.
-- Designed so a fresh database can be brought up by executing this file once.
-- =============================================================================

-- Extensions ------------------------------------------------------------------
create extension if not exists "pgcrypto";    -- gen_random_uuid + digest()
create extension if not exists "citext";      -- case-insensitive email

-- =============================================================================
-- 1. Services
-- =============================================================================
create table if not exists public.services (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  name            text not null,
  description     text not null default '',
  -- Price in paise (₹1 = 100 paise) — avoids float rounding bugs.
  price_paise     integer not null check (price_paise >= 0),
  duration_minutes integer not null default 60 check (duration_minutes > 0),
  active          boolean not null default true,
  display_order   integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- =============================================================================
-- 2. Customers (guest-checkout, identified by phone)
-- =============================================================================
create table if not exists public.customers (
  id              uuid primary key default gen_random_uuid(),
  full_name       text not null check (length(full_name) between 1 and 120),
  -- Stored in E.164 (+91XXXXXXXXXX). UNIQUE so the same person merges across bookings.
  phone           text not null unique check (phone ~ '^\+91[6-9][0-9]{9}$'),
  email           citext check (email is null or length(email) <= 254),
  date_of_birth   date,
  time_of_birth   time,
  place_of_birth  text,
  gender          text check (gender in ('male','female','other','prefer_not_to_say')),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- =============================================================================
-- 3. Bookings — single source of slot truth
-- =============================================================================
-- payment_status lifecycle:
--   pending   — booking created, awaiting payment verification
--   paid      — verified (signature OR webhook), slot permanently held
--   expired   — pending lapsed past hold window, slot released
--   failed    — payment explicitly failed
--   cancelled — admin or customer cancelled (refund flow lives separately)
--                NOTE: payment_status='cancelled' is legacy; new cancellations
--                are recorded on booking_status (below) so payment history is
--                preserved.
-- booking_status lifecycle (mirrors the customer-facing state machine):
--   pending   — default on insert. Customer is in checkout; the 10-minute
--               hold guards the slot via the partial UNIQUE index below.
--   active    — payment captured AND consultation slot is still in the future.
--   completed — payment captured AND the slot has elapsed (cron-managed).
--   cancelled — payment never succeeded (hold-expired/failed/admin-cancel)
--               OR an admin explicitly cancelled a paid booking. Either way
--               the slot is released. The original payment_status is kept
--               for the audit trail.
create table if not exists public.bookings (
  id                  uuid primary key default gen_random_uuid(),
  booking_id          text not null unique,                      -- human-friendly e.g. SC-7K3PQ9
  customer_id         uuid not null references public.customers(id) on delete restrict,
  service_id          uuid not null references public.services(id) on delete restrict,
  -- Denormalised snapshot — protects history if service is renamed/repriced.
  service_name_snapshot   text not null,
  amount_paise        integer not null check (amount_paise >= 0),

  -- Slot stored in IST as DATE + TIME for clean grouping.
  date                date not null,
  time_slot           time not null,

  payment_status      text not null
                      check (payment_status in ('pending','paid','expired','failed','cancelled')),
  booking_status      text default 'pending'
                      check (booking_status is null or booking_status in ('pending','active','completed','cancelled')),
  -- Auto-expiry timestamp for pending rows. NULL for terminal states.
  hold_expires_at     timestamptz,

  -- AES-256-GCM encrypted JSON payload of sensitive PII
  -- (dob, time-of-birth, place-of-birth, gender, notes). Decrypted only
  -- server-side in admin routes. Plaintext PII columns on `customers` are
  -- deprecated and no longer written by the booking-create route.
  encrypted_payload   text,
  cancellation_reason text,

  razorpay_order_id   text,
  razorpay_payment_id text,
  razorpay_signature  text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  paid_at             timestamptz,
  cancelled_at        timestamptz
);

-- Idempotent upgrade for pre-existing databases: add booking_status,
-- encrypted_payload, cancellation_reason if the table predates them. Safe to
-- re-run; no-op when columns already exist.
alter table public.bookings
  add column if not exists booking_status text;
alter table public.bookings
  add column if not exists encrypted_payload text;
alter table public.bookings
  add column if not exists cancellation_reason text;

-- Migrate the booking_status semantics. Each booking now carries an explicit
-- state from creation onwards:
--   pending → active → completed (happy path)
--   pending → cancelled (hold expired / payment failed / admin cancel)
--   active  → cancelled (admin cancel after payment)
alter table public.bookings alter column booking_status drop not null;
alter table public.bookings drop constraint if exists bookings_booking_status_check;
alter table public.bookings
  add constraint bookings_booking_status_check
  check (booking_status is null or booking_status in ('pending','active','completed','cancelled'));
alter table public.bookings alter column booking_status set default 'pending';

-- Backfill historic rows so the new state machine is internally consistent.
--   1. Pending payment that was wrongly tagged 'active' (or NULL) → 'pending'.
update public.bookings
   set booking_status = 'pending'
 where payment_status = 'pending'
   and (booking_status is null or booking_status = 'active');

--   2. Any row whose payment definitively failed/expired/cancelled — drop
--      booking_status to 'cancelled' so the slot is correctly released and
--      the booking pill reflects reality. Also stamp cancelled_at if absent.
update public.bookings
   set booking_status = 'cancelled',
       cancelled_at = coalesce(cancelled_at, now())
 where payment_status in ('failed','expired','cancelled')
   and (booking_status is null or booking_status in ('pending','active'));

--   3. Paid + null → 'active'. Cron will flip past-slot rows to 'completed'
--      on the next pass; the read-time derivation handles the lag.
update public.bookings
   set booking_status = 'active'
 where payment_status = 'paid'
   and booking_status is null;

-- Indexes for the access patterns we actually run.
create index if not exists bookings_date_idx       on public.bookings (date);
create index if not exists bookings_customer_idx   on public.bookings (customer_id);
create index if not exists bookings_status_idx     on public.bookings (payment_status);
create index if not exists bookings_booking_status_idx on public.bookings (booking_status);
create index if not exists bookings_hold_idx       on public.bookings (hold_expires_at)
  where payment_status = 'pending';

-- THE critical invariant: at most one active booking per (date, time_slot).
-- A row holds its slot iff booking_status IN ('pending','active'). The
-- booking_status column is now the single source of truth — payment_status
-- is the audit trail only.
drop index if exists bookings_active_slot_uniq;
create unique index bookings_active_slot_uniq
  on public.bookings (date, time_slot)
  where booking_status in ('pending','active');

-- =============================================================================
-- 4. Availability — per-date slot configuration set by admin.
-- =============================================================================
-- One row per date. `slots` is a sorted array of HH:MM strings.
create table if not exists public.availability (
  id          uuid primary key default gen_random_uuid(),
  date        date not null unique,
  slots       text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Default weekly template — used when no per-date row exists.
-- Single-row table with array of HH:MM per weekday.
create table if not exists public.availability_template (
  id          integer primary key default 1 check (id = 1),
  -- index 0 = Sunday ... 6 = Saturday (matches JS Date.getDay)
  sunday      text[] not null default '{10:00,11:00,12:00,15:00,16:00,17:00}',
  monday      text[] not null default '{10:00,11:00,12:00,15:00,16:00,17:00}',
  tuesday     text[] not null default '{10:00,11:00,12:00,15:00,16:00,17:00}',
  wednesday   text[] not null default '{10:00,11:00,12:00,15:00,16:00,17:00}',
  thursday    text[] not null default '{10:00,11:00,12:00,15:00,16:00,17:00}',
  friday      text[] not null default '{10:00,11:00,12:00,15:00,16:00,17:00}',
  saturday    text[] not null default '{10:00,11:00,12:00,15:00,16:00,17:00}',
  updated_at  timestamptz not null default now()
);

-- =============================================================================
-- 5. Admin account (single-admin model)
-- =============================================================================
create table if not exists public.admin_user (
  id              integer primary key default 1 check (id = 1),
  username        text not null default 'admin',
  password_hash   text,                            -- bcrypt (60 chars)
  totp_secret_enc text,                            -- AES-GCM-encrypted base32 TOTP secret
  totp_confirmed  boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Sessions: opaque random IDs in a cookie; row holds hashed ID + expiry.
create table if not exists public.admin_sessions (
  id              uuid primary key default gen_random_uuid(),
  session_token_hash text not null unique,         -- sha256(token)
  created_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  expires_at      timestamptz not null,
  ip              text,
  user_agent      text,
  revoked         boolean not null default false
);
create index if not exists admin_sessions_expires_idx on public.admin_sessions (expires_at);

-- Recovery codes — single-use one-time codes for TOTP/password recovery.
create table if not exists public.admin_recovery_codes (
  id          uuid primary key default gen_random_uuid(),
  code_hash   text not null unique,                -- sha256(code)
  used        boolean not null default false,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- Login attempt log for throttling. Cleared periodically; throttle reads last N minutes.
create table if not exists public.admin_login_attempts (
  id          uuid primary key default gen_random_uuid(),
  identifier  text not null,                       -- ip OR ip|username
  succeeded   boolean not null default false,
  at          timestamptz not null default now()
);
create index if not exists admin_login_attempts_id_at_idx on public.admin_login_attempts (identifier, at desc);

-- =============================================================================
-- 6. Webhook event log — idempotency for Razorpay webhooks.
-- =============================================================================
create table if not exists public.webhook_events (
  id            uuid primary key default gen_random_uuid(),
  -- Razorpay does not send a unique event id header, but signature+payload-hash is unique enough.
  event_id      text not null unique,
  event_type    text not null,
  payload       jsonb not null,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz
);

-- =============================================================================
-- 7. Audit log — admin-side actions (slot edits, exports, logins).
-- =============================================================================
create table if not exists public.audit_log (
  id          bigserial primary key,
  actor       text not null,                       -- 'admin' or 'system'
  action      text not null,                       -- e.g. 'availability.update', 'export.run'
  target      text,                                -- arbitrary subject id
  metadata    jsonb not null default '{}',
  ip          text,
  at          timestamptz not null default now()
);
create index if not exists audit_log_at_idx on public.audit_log (at desc);

-- =============================================================================
-- updated_at trigger ----------------------------------------------------------
-- =============================================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['services','customers','bookings','availability','availability_template','admin_user'] loop
    execute format(
      'drop trigger if exists trg_touch_%1$s on public.%1$s;
       create trigger trg_touch_%1$s before update on public.%1$s
         for each row execute function public.touch_updated_at();', t);
  end loop;
end $$;

-- =============================================================================
-- RLS — deny all by default. Server uses service role which bypasses RLS.
-- =============================================================================
alter table public.services              enable row level security;
alter table public.customers             enable row level security;
alter table public.bookings              enable row level security;
alter table public.availability          enable row level security;
alter table public.availability_template enable row level security;
alter table public.admin_user            enable row level security;
alter table public.admin_sessions        enable row level security;
alter table public.admin_recovery_codes  enable row level security;
alter table public.admin_login_attempts  enable row level security;
alter table public.webhook_events        enable row level security;
alter table public.audit_log             enable row level security;

-- No policies = no anon/auth role access. Service role bypasses RLS.
-- Revoke any incidental grants explicitly:
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- =============================================================================
-- Seed data
-- =============================================================================
insert into public.services (slug, name, description, price_paise, duration_minutes, display_order)
values
  ('numerology', 'Numerology Consultation',
   'Discover how numbers influence your life path, relationships, and career.',
   150000, 60, 1),
  ('vaastu', 'Vaastu Consultation',
   'Align your home or workspace with positive energy flow using practical remedies.',
   150000, 60, 2),
  ('guidance', 'Personalized Guidance',
   'A holistic approach blending reiki, mindfulness, and intuitive counseling.',
   150000, 60, 3)
on conflict (slug) do nothing;

insert into public.availability_template (id) values (1)
on conflict (id) do nothing;

insert into public.admin_user (id, username) values (1, 'admin')
on conflict (id) do nothing;

-- =============================================================================
-- Helper RPC — periodic booking-lifecycle maintenance.
-- Called by Vercel cron every 2 minutes AND opportunistically on the public
-- availability read so the slot view never lags behind for long.
--
-- Two transitions in one pass:
--   1. Pending bookings past their 10-minute hold →
--        payment_status = 'failed'
--        booking_status = 'cancelled'
--      The slot is released atomically through the partial UNIQUE index.
--   2. Paid+active bookings whose IST date/time has elapsed →
--        booking_status = 'completed'
--      (payment_status stays 'paid' for the audit trail.)
-- =============================================================================
create or replace function public.release_expired_bookings()
returns integer language plpgsql security definer as $$
declare
  expired_n  integer := 0;
  completed_n integer := 0;
begin
  update public.bookings
     set payment_status = 'failed',
         booking_status = 'cancelled',
         cancelled_at = coalesce(cancelled_at, now()),
         hold_expires_at = null,
         updated_at = now()
   where payment_status = 'pending'
     and booking_status = 'pending'
     and hold_expires_at is not null
     and hold_expires_at < now();
  get diagnostics expired_n = row_count;

  update public.bookings
     set booking_status = 'completed',
         updated_at = now()
   where payment_status = 'paid'
     and booking_status = 'active'
     -- Combine the IST date + slot, reinterpret as IST wall-clock, compare to UTC now()
     and ((date + time_slot) at time zone 'Asia/Kolkata') < now();
  get diagnostics completed_n = row_count;

  return expired_n + completed_n;
end;
$$;
revoke all on function public.release_expired_bookings() from public, anon, authenticated;
