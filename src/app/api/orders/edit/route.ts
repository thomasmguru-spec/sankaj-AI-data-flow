import { NextRequest, NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

interface AnalyzedItemInput {
  item?: string;
  itemName?: string;
  description?: string;
  quantity?: number | string | null;
  uom?: string | null;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function normalizeAnalyzedItems(items: unknown) {
  if (!Array.isArray(items)) {
    throw new Error('analyzed_items must be an array');
  }

  return items
    .map((raw) => {
      const it = raw as AnalyzedItemInput;
      const name = String(it.item ?? it.itemName ?? it.description ?? '').trim();
      if (!name) return null;

      const quantity =
        it.quantity != null && it.quantity !== '' ? Number(it.quantity) : null;

      return {
        item: name,
        itemName: name,
        description: String(it.description ?? name).trim(),
        quantity: Number.isFinite(quantity) ? quantity : null,
        uom: it.uom ? String(it.uom).trim() : null,
      };
    })
    .filter((it): it is NonNullable<typeof it> => it !== null);
}

async function supabaseRest<T>(
  path: string,
  init: RequestInit = {}
): Promise<{ data: T | null; error: string | null; status: number }> {
  const baseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  const res = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  const text = await res.text();
  let data: T | null = null;
  if (text) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      return { data: null, error: text || res.statusText, status: res.status };
    }
  }

  if (!res.ok) {
    const message =
      typeof data === 'object' && data && 'message' in data
        ? String((data as { message: string }).message)
        : text || res.statusText;
    return { data: null, error: message, status: res.status };
  }

  return { data, error: null, status: res.status };
}

export async function PATCH(req: NextRequest) {
  noStore();
  try {
    const body = await req.json();
    const { id, whatsapp_sender, analyzed_items } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    const existing = await supabaseRest<{ id: string; status: string }[]>(
      `pending_approvals?id=eq.${encodeURIComponent(id)}&select=id,status`
    );

    if (existing.error || !existing.data?.[0]) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (existing.data[0].status !== 'pending') {
      return NextResponse.json(
        { error: 'Only pending orders can be edited', code: 'NOT_EDITABLE' },
        { status: 409 }
      );
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (whatsapp_sender !== undefined) {
      if (typeof whatsapp_sender !== 'string' || !whatsapp_sender.trim()) {
        return NextResponse.json({ error: 'whatsapp_sender must be a non-empty string' }, { status: 400 });
      }
      updates.whatsapp_sender = whatsapp_sender.trim();
    }

    if (analyzed_items !== undefined) {
      try {
        updates.analyzed_items = normalizeAnalyzedItems(analyzed_items);
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : 'Invalid analyzed_items' },
          { status: 400 }
        );
      }
    }

    if (Object.keys(updates).length === 1) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const patched = await supabaseRest<
      {
        id: string;
        whatsapp_sender: string;
        analyzed_items: unknown;
        status: string;
        updated_at: string;
      }[]
    >(`pending_approvals?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(updates),
    });

    if (patched.error || !patched.data?.[0]) {
      console.error('Order edit update error:', patched.error);
      return NextResponse.json({ error: patched.error || 'Update failed' }, { status: 500 });
    }

    const verified = await supabaseRest<
      {
        id: string;
        whatsapp_sender: string;
        analyzed_items: unknown;
        status: string;
        updated_at: string;
      }[]
    >(
      `pending_approvals?id=eq.${encodeURIComponent(id)}&select=id,whatsapp_sender,analyzed_items,status,updated_at`
    );

    if (verified.error || !verified.data?.[0]) {
      return NextResponse.json({ error: 'Update could not be verified' }, { status: 500 });
    }

    const row = verified.data[0];
    if (
      updates.whatsapp_sender !== undefined &&
      row.whatsapp_sender !== updates.whatsapp_sender
    ) {
      return NextResponse.json(
        { error: 'Update did not persist to database', code: 'VERIFY_FAILED' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, data: row },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch (err) {
    console.error('Order edit API error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}
