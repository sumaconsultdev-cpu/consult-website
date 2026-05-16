import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'

/**
 * Service-role Supabase client. Never bundle into client code — the
 * `'server-only'` import + `SUPABASE_SERVICE_ROLE_KEY` being un-prefixed
 * already prevents that, but the singleton lives here to be explicit.
 *
 * We disable auth persistence + token refresh so the client is suitable for
 * stateless serverless invocations (no session storage, no race in cold start).
 */

let _client: SupabaseClient | null = null

export function db(): SupabaseClient {
  if (_client) return _client
  _client = createClient(env.supabaseUrl(), env.supabaseServiceRole(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'x-app': 'suma-consultation' } },
  })
  return _client
}
