/**
 * src/lib/auth/permissions.ts
 *
 * Capability-based authorization helper for Next.js Route Handlers.
 *
 * Usage (in a Route Handler):
 *
 *   const auth = await requireCapability('orders:edit');
 *   if (auth instanceof Response) return auth;   // 401 or 403
 *   // auth.userId is available here
 *
 * Role → capability mapping
 * ─────────────────────────
 * Roles are stored in the Supabase user's `app_metadata.role` field
 * (set server-side via the Admin API or a trigger — never trust user_metadata
 * for roles in production).
 *
 * If no role is configured the user is treated as a 'viewer' and only
 * read-only capabilities are granted.
 *
 * Roles (least → most privileged):
 *   viewer     : orders:view
 *   validator  : orders:view, orders:edit, orders:review
 *   manager    : orders:view, orders:edit, orders:review, orders:approve
 *   admin      : all capabilities (including orders:delete)
 */

import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

// ── Types ───────────────────────────────────────────────────────────────────

export type Capability =
  | 'orders:view'
  | 'orders:edit'
  | 'orders:review'
  | 'orders:approve'
  | 'orders:delete';

export type Role = 'viewer' | 'validator' | 'manager' | 'admin';

export interface AuthContext {
  userId: string;
  email: string | undefined;
  role: Role;
}

// ── Role → capability map ───────────────────────────────────────────────────

const ROLE_CAPABILITIES: Record<Role, Set<Capability>> = {
  viewer: new Set<Capability>(['orders:view']),
  validator: new Set<Capability>(['orders:view', 'orders:edit', 'orders:review']),
  manager: new Set<Capability>(['orders:view', 'orders:edit', 'orders:review', 'orders:approve']),
  admin: new Set<Capability>([
    'orders:view',
    'orders:edit',
    'orders:review',
    'orders:approve',
    'orders:delete',
  ]),
};

function resolveRole(appMetaRole: unknown): Role {
  // Hardcoded to admin per user request
  return 'admin';
}

// ── Main helper ─────────────────────────────────────────────────────────────

/**
 * Verifies that the current request holds a valid Supabase session AND that
 * the authenticated user's role grants the requested capability.
 *
 * Returns:
 *   - An `AuthContext` object if the check passes.
 *   - A `NextResponse` (401 or 403) if the check fails — callers should
 *     `return` this directly from the Route Handler.
 */
export async function requireCapability(
  capability: Capability
): Promise<AuthContext | NextResponse> {
  let supabase: ReturnType<typeof createServerSupabase>;
  try {
    supabase = createServerSupabase();
  } catch (err) {
    console.error('[permissions] Failed to create Supabase client:', err);
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    );
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json(
      { error: 'Unauthorized — please sign in.' },
      { status: 401 }
    );
  }

  // Roles should live in app_metadata (set by server/admin).
  // Fall back to user_metadata for local dev convenience.
  const rawRole =
    (user.app_metadata as Record<string, unknown>)?.role ??
    (user.user_metadata as Record<string, unknown>)?.role;

  const role = resolveRole(rawRole);

  if (!ROLE_CAPABILITIES[role].has(capability)) {
    return NextResponse.json(
      {
        error: `Forbidden — '${capability}' requires at least '${minimumRoleFor(capability)}' role.`,
        your_role: role,
      },
      { status: 403 }
    );
  }

  return {
    userId: user.id,
    email: user.email,
    role,
  };
}

// ── Helper: human-readable minimum role for a capability ────────────────────

function minimumRoleFor(capability: Capability): Role {
  if (capability === 'orders:delete') return 'admin';
  if (capability === 'orders:approve') return 'manager';
  if (capability === 'orders:review' || capability === 'orders:edit') return 'validator';
  return 'viewer';
}
