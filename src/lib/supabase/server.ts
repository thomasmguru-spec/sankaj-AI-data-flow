/**
 * src/lib/supabase/server.ts
 *
 * Server-side Supabase helpers for Next.js App Router Route Handlers.
 *
 * Two clients are exported:
 *
 *  createServiceRoleClient()
 *    — Uses the SERVICE_ROLE key (bypasses RLS).
 *      Only for trusted server-side work that must read/write across all rows
 *      (e.g. the orders/new pipeline, item-master sync).
 *      Never expose this client to the browser.
 *
 *  createServerSupabase()
 *    — Uses the ANON key with the user's session cookie so RLS policies apply.
 *      Use this for authenticated user actions (edit, approve, delete).
 */

import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

// ── Env validation ──────────────────────────────────────────────────────────
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[supabase/server] Missing required environment variable: ${name}. ` +
        `Add it to your .env.local file.`
    );
  }
  return value;
}

// ── Service-role client (bypasses RLS) ─────────────────────────────────────
/**
 * Returns a Supabase client authenticated with the service-role key.
 * Bypasses Row Level Security — only use for server-to-server operations.
 */
export function createServiceRoleClient() {
  return createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        // Disable auto token refresh & session persistence; this is a
        // short-lived server client, not a browser session.
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

// ── Authenticated server client (respects RLS) ─────────────────────────────
/**
 * Returns a Supabase client that reads the user's session from Next.js
 * request cookies so that Row Level Security policies are enforced.
 *
 * Must only be called from Route Handlers or Server Components (not browser).
 */
export function createServerSupabase() {
  const cookieStore = cookies();

  return createServerClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Route Handlers that return a streaming response may throw here;
            // it is safe to ignore since the session has already been read.
          }
        },
      },
    }
  );
}
