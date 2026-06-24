import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

// _shared imports are not bundled on deploy — Supabase only packages each
// function folder (e.g. update-order/). Keep helpers inline here instead of:
// import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface AnalyzedItemInput {
  item?: string;
  itemName?: string;
  description?: string;
  quantity?: number | string | null;
  uom?: string | null;
}

function normalizeAnalyzedItems(items: unknown): AnalyzedItemInput[] {
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'PATCH') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
    (() => {
      try {
        const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
        return keys ? JSON.parse(keys)['default'] : undefined;
      } catch {
        return undefined;
      }
    })();

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }

  let body: {
    id?: string;
    whatsapp_sender?: string;
    analyzed_items?: unknown;
  };

  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const { id, whatsapp_sender, analyzed_items } = body;
  if (!id) {
    return jsonResponse({ error: 'Missing id' }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: row, error: fetchError } = await supabase
    .from('pending_approvals')
    .select('id, status')
    .eq('id', id)
    .single();

  if (fetchError || !row) {
    return jsonResponse({ error: 'Order not found' }, 404);
  }

  if (row.status !== 'pending') {
    return jsonResponse(
      { error: 'Only pending orders can be edited', code: 'NOT_EDITABLE' },
      409
    );
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (whatsapp_sender !== undefined) {
    if (typeof whatsapp_sender !== 'string' || !whatsapp_sender.trim()) {
      return jsonResponse({ error: 'whatsapp_sender must be a non-empty string' }, 400);
    }
    updates.whatsapp_sender = whatsapp_sender.trim();
  }

  if (analyzed_items !== undefined) {
    try {
      updates.analyzed_items = normalizeAnalyzedItems(analyzed_items);
    } catch (err) {
      return jsonResponse(
        { error: err instanceof Error ? err.message : 'Invalid analyzed_items' },
        400
      );
    }
  }

  if (Object.keys(updates).length === 1) {
    return jsonResponse({ error: 'No fields to update' }, 400);
  }

  const { data, error } = await supabase
    .from('pending_approvals')
    .update(updates)
    .eq('id', id)
    .select('id, whatsapp_sender, analyzed_items, status, updated_at')
    .single();

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({ success: true, data });
});
