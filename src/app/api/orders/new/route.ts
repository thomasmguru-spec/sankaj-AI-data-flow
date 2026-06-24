import { NextRequest, NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest) {
  noStore();
  try {
    const supabase = createServiceRoleClient();
    const { searchParams } = req.nextUrl;
    const limit = Math.min(Number(searchParams.get('limit') || '50'), 200);
    const offset = Number(searchParams.get('offset') || '0');

    // Fetch from pending_approvals table which stores WhatsApp orders
    const { data, count, error } = await supabase
      .from('pending_approvals')
      .select('id, n8n_execution_id, whatsapp_sender, twilio_message_sid, status, type, analyzed_items, created_at, updated_at, media_url', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);


    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Map `pending_approvals` records to the format the `NewOrders` tab expects
    const mappedRows = (data || []).map(row => {
      const items = Array.isArray(row.analyzed_items) ? row.analyzed_items : [];
      return {
        id: row.id,
        order_number: null,
        order_date: row.created_at.slice(0, 10),
        delivery_date: null,
        customer_name: row.whatsapp_sender,
        customer_phone: row.whatsapp_sender,
        customer_email: null,
        customer_whatsapp: row.whatsapp_sender,
        billing_address: null,
        shipping_address: null,
        payment_terms: null,
        special_instructions: [
          row.twilio_message_sid ? `Twilio SID: ${row.twilio_message_sid}` : null,
          row.n8n_execution_id ? `n8n: ${row.n8n_execution_id}` : null,
        ].filter(Boolean).join(' | ') || null,
        order_type: row.type,
        subtotal: null,
        tax_amount: null,
        total_amount: null,
        validation_status: null,
        exception_status: null,
        export_status: null,
        // The table uses `approval_status` for the badge rendering
        approval_status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
        documents: {
          source: 'whatsapp',
          original_filename: `WhatsApp order from ${row.whatsapp_sender}`,
          received_at: row.created_at,
          source_identifier: row.twilio_message_sid,
          file_mime_type: row.type === 'text' ? 'text/plain' : 'image/jpeg',
          media_url: row.type === 'image' ? (row.media_url || null) : null,
        },

        order_lines: items.map((it: any, i: number) => ({
          line_number: i + 1,
          sku_name: it.item || it.description || it.itemName || null,
          sku_code: null,
          description: it.item || it.description || it.itemName || null,
          quantity: it.quantity != null ? Number(it.quantity) : null,
          unit_of_measure: it.uom || null,
          unit_price: null,
          line_total: null,
          sku_matched: false,
        })),
      };
    });

    // Return the records so the frontend can display them easily
    return NextResponse.json(
      { data: mappedRows, total: count ?? 0 },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('New orders API error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}

