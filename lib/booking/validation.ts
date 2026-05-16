import { z } from 'zod'

/**
 * Zod schemas guard every API entry point. Phone is canonicalised to E.164
 * Indian format (+91 followed by a 10-digit number starting 6-9) by stripping
 * spaces, dashes, and an optional leading 0 / +91 / 91.
 */

export function canonicalIndianPhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, '')
  let m = digits.replace(/^(\+91|91|0)/, '')
  if (!/^[6-9]\d{9}$/.test(m)) return null
  return '+91' + m
}

const phoneSchema = z.string().transform((v, ctx) => {
  const c = canonicalIndianPhone(v)
  if (!c) {
    ctx.addIssue({ code: 'custom', message: 'Enter a valid 10-digit Indian phone number' })
    return z.NEVER
  }
  return c
})

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:MM')

export const AvailabilityQuerySchema = z.object({
  date: dateSchema,
})

export const BookingCreateSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  phone: phoneSchema,
  email: z.string().trim().email().max(254).optional().or(z.literal('').transform(() => undefined)),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  timeOfBirth: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  placeOfBirth: z.string().trim().max(200).optional(),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).optional(),
  notes: z.string().trim().max(2000).optional(),

  serviceSlug: z.string().min(1).max(64),
  date: dateSchema,
  timeSlot: timeSchema,
})
export type BookingCreateInput = z.infer<typeof BookingCreateSchema>

export const BookingVerifySchema = z.object({
  bookingId: z.string().regex(/^SC-[A-Z0-9]{8}$/),
  razorpayOrderId: z.string().min(1).max(80),
  razorpayPaymentId: z.string().min(1).max(80),
  razorpaySignature: z.string().min(8).max(256),
})

export const AvailabilityUpsertSchema = z.object({
  date: dateSchema,
  slots: z.array(timeSchema).max(48),
})

export const ServiceUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().trim().min(1).max(64).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers and hyphens'),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).default(''),
  pricePaise: z.number().int().min(0).max(10_000_000),     // ₹1 lakh ceiling
  durationMinutes: z.number().int().min(15).max(240).default(60),
  active: z.boolean().default(true),
  displayOrder: z.number().int().min(0).max(1000).default(0),
})
