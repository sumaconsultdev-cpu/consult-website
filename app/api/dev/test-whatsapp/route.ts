import { NextRequest } from 'next/server'
import { ok, fail, safe } from '@/lib/http'
import { env } from '@/lib/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Dev-only endpoint to fire a raw WhatsApp send and return Meta's full
 * response body. Use this to diagnose token, template, or number issues
 * without going through the entire booking flow.
 *
 * GET /api/dev/test-whatsapp
 *
 * Blocked in production (WHATSAPP_DRIVER must not be 'meta' with NODE_ENV
 * 'production', or this route simply returns 404).
 */
export const GET = safe(async (_req: NextRequest) => {
  if (env.isProd()) return fail(404, 'not_found', 'Not found')

  const phoneNumberId = env.metaWaPhoneNumberId()
  const accessToken = env.metaWaAccessToken()
  const template = env.metaWaTemplate()
  const language = env.metaWaTemplateLanguage()
  const override = env.metaWaTestOverrideTo()

  if (!phoneNumberId || !accessToken) {
    return fail(500, 'misconfigured', 'META_WA_PHONE_NUMBER_ID or META_WA_ACCESS_TOKEN not set.')
  }
  if (!override) {
    return fail(400, 'no_override', 'META_WA_TEST_OVERRIDE_TO is not set. Set it to a verified test number.')
  }

  const to = override.replace(/^\+/, '')
  const url = `https://graph.facebook.com/v25.0/${phoneNumberId}/messages`
  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: template,
      language: { code: language },
      components: [],
    },
  }

  let status: number
  let responseBody: unknown
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    status = res.status
    try { responseBody = await res.json() } catch { responseBody = await res.text() }
  } catch (e: any) {
    return fail(500, 'fetch_exception', e?.message ?? 'unknown')
  }

  return ok({ metaStatus: status, template, to: override, metaResponse: responseBody })
})
