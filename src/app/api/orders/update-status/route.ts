import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const allowedStatuses = ['pending', 'approved', 'rejected'] as const;

/** Must match the Wait node "Webhook Suffix" in n8n (not included in $execution.resumeUrl). */
const N8N_WAIT_WEBHOOK_SUFFIX =
  process.env.N8N_WAIT_WEBHOOK_SUFFIX?.trim() || 'vercel-approval-callback';

/**
 * n8n Wait nodes with a webhook suffix expect:
 *   /webhook-waiting/{executionId}/{suffix}?signature=...
 * but $execution.resumeUrl omits /{suffix} — append it before the query string.
 */
function normalizeN8nResumeUrl(url: string): string {
  const suffixSegment = `/${N8N_WAIT_WEBHOOK_SUFFIX.replace(/^\/+/, '')}`;
  const queryIndex = url.indexOf('?');
  const pathPart = queryIndex === -1 ? url : url.slice(0, queryIndex);

  if (pathPart.endsWith(suffixSegment)) {
    return url;
  }

  if (!pathPart.match(/\/webhook-waiting\/[^/]+$/)) {
    return url;
  }

  if (queryIndex !== -1) {
    return `${pathPart}${suffixSegment}${url.slice(queryIndex)}`;
  }

  return `${pathPart}${suffixSegment}`;
}

async function invokeWaitNodeWebhook(
  callbackUrl: string,
  status: 'approved' | 'rejected',
  errorMessage: string
) {
  const payload =
    status === 'approved'
      ? { status: 'approved' as const, error: '' }
      : { status: 'rejected' as const, error: errorMessage };

  const res = await fetch(callbackUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Wait node webhook failed (${res.status}): ${text || res.statusText}`);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = createServiceRoleClient();
    const body = await req.json();
    const { id, status, error: rejectionError } = body;

    if (!id || !status) {
      return NextResponse.json({ error: 'Missing id or status' }, { status: 400 });
    }

    if (!allowedStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${allowedStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    const { data: row, error: fetchError } = await supabase
      .from('pending_approvals')
      .select('id, status, n8n_wait_node_callbackurl')
      .eq('id', id)
      .single();

    if (fetchError || !row) {
      return NextResponse.json({ error: fetchError?.message ?? 'Order not found' }, { status: 404 });
    }

    const callbackUrl = row.n8n_wait_node_callbackurl?.trim();
    const shouldNotifyWaitNode = status === 'approved' || status === 'rejected';

    if (shouldNotifyWaitNode) {
      if (!callbackUrl) {
        return NextResponse.json(
          { error: 'Order already processed', code: 'ALREADY_PROCESSED' },
          { status: 409 }
        );
      }

      const errorMessage =
        status === 'rejected'
          ? typeof rejectionError === 'string' && rejectionError.trim()
            ? rejectionError.trim()
            : 'error'
          : '';

      await invokeWaitNodeWebhook(normalizeN8nResumeUrl(callbackUrl), status, errorMessage);
    }

    const { error } = await supabase
      .from('pending_approvals')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      id,
      status,
      webhookCalled: shouldNotifyWaitNode,
    });
  } catch (err) {
    console.error('Update status API error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}
