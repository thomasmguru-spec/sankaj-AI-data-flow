'use client';

import { Card, Badge } from '@/components/ui';
import { formatCurrency, formatDate, getStatusColor } from '@/lib/utils';
import { Package, RefreshCw, ChevronLeft, ChevronRight, MessageSquare, Mail, ScanLine, Cloud, Image, FileText, Phone, X, Pencil } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { toastWarningOptions } from '@/components/app-toaster';
import { OrderEditModal, type EditableOrder } from '@/components/orders/OrderEditModal';

interface WhatsAppItem {
  itemName: string;
  quantity: string;
}

interface WhatsAppMessage {
  sid: string;
  from: string;
  to: string;
  body: string;
  dateSent: string;
  direction: string;
  status: string;
  numMedia: number;
  mediaUrls: string[];
  items: WhatsAppItem[];
  ocrText: string | null;
  profileName: string | null;
  nameAndLocation: string | null;
}

interface NewOrderLine {
  line_number: number | null;
  sku_name: string | null;
  sku_code: string | null;
  description: string | null;
  quantity: number | null;
  unit_of_measure: string | null;
  unit_price: number | null;
  line_total: number | null;
  sku_matched?: boolean;
  item_master?: {
    matched: boolean;
    match_method: 'sku' | 'upc' | 'name_exact' | 'name_fuzzy' | null;
    master_sku_code: string | null;
    master_description: string | null;
    master_group: string | null;
    master_location: string | null;
    master_on_hand: number | null;
    master_unit_price: number | null;
  } | null;
}

interface NewOrder {
  id: string;
  order_number: string | null;
  order_date: string | null;
  delivery_date: string | null;
  customer_name: string | null;
  customer_code?: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_whatsapp: string | null;
  billing_address: string | null;
  shipping_address: string | null;
  payment_terms?: string | null;
  special_instructions?: string | null;
  subtotal: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  validation_status: string | null;
  exception_status: string | null;
  export_status: string | null;
  approval_status: string | null;
  order_type?: 'image' | 'text' | null;
  created_at: string;
  document_id?: string | null;
  documents: {
    source: string;
    original_filename: string;
    received_at: string;
    source_identifier?: string | null;
    file_mime_type?: string | null;
    media_url?: string | null;
  };
  order_lines: NewOrderLine[] | null;
}

function mapSavedRowToOrder(
  order: NewOrder,
  saved: {
    whatsapp_sender: string;
    analyzed_items: { item?: string; itemName?: string; description?: string; quantity?: number | null; uom?: string | null }[];
  }
): NewOrder {
  const items = Array.isArray(saved.analyzed_items) ? saved.analyzed_items : [];
  return {
    ...order,
    customer_whatsapp: saved.whatsapp_sender,
    customer_phone: saved.whatsapp_sender,
    customer_name: saved.whatsapp_sender,
    order_lines: items.map((it, i) => ({
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
}

const SOURCE_ICONS: Record<string, typeof MessageSquare> = {
  whatsapp: MessageSquare,
  email: Mail,
  scanner: ScanLine,
  google_drive: Cloud,
  cloud_upload: Cloud,
};

const SOURCE_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  email: 'Email',
  scanner: 'Scanner',
  google_drive: 'Google Drive',
  cloud_upload: 'Upload',
};


export default function OrdersPage() {
  const router = useRouter();
  const [newOrders, setNewOrders] = useState<NewOrder[]>([]);
  const [newOrdersTotal, setNewOrdersTotal] = useState(0);
  const [newOrdersSource, setNewOrdersSource] = useState('whatsapp');
  const [gdriveSyncing, setGdriveSyncing] = useState(false);
  const [bulkReprocessing, setBulkReprocessing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newOrdersPage, setNewOrdersPage] = useState(1);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<EditableOrder | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const TABLE_PAGE_SIZE = 10;
  const paginatedNewOrders = newOrders.slice((newOrdersPage - 1) * TABLE_PAGE_SIZE, newOrdersPage * TABLE_PAGE_SIZE);
  const totalNewOrdersPages = Math.max(1, Math.ceil(newOrders.length / TABLE_PAGE_SIZE));

  const blankGoogleDriveCount = newOrders.filter((o) =>
    o.documents?.source === 'google_drive' &&
    ((o.order_lines?.length ?? 0) === 0 || (!o.order_number && !o.customer_name && o.total_amount == null))
  ).length;




  const fetchNewOrders = useCallback(async (options?: { silent?: boolean }): Promise<NewOrder[]> => {
    if (!options?.silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '200', _: String(Date.now()) });
      if (newOrdersSource) params.set('source', newOrdersSource);
      const res = await fetch(`/api/orders/new?${params}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      });
      if (!res.ok) {
        const raw = await res.text();
        let msg = `HTTP ${res.status}`;
        try { msg = JSON.parse(raw).error || msg; } catch { /* HTML error page — use status */ }
        throw new Error(msg);
      }
      const json = await res.json();
      const rows: NewOrder[] = json.data || [];
      setNewOrders(rows);
      setNewOrdersTotal(json.total || 0);
      return rows;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch new orders');
      return [];
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [newOrdersSource]);

  /**
   * On-demand: import any new files from the customer-orders Google Drive
   * folder, then run OCR + LLM extraction for every pending document
   * (newly imported AND any older imports that never finished processing).
   *
   * Why this is structured as multiple short HTTP calls instead of one big
   * server-side job:
   *   - Vercel serverless functions have a 60s wall-clock budget. Doing
   *     N file-downloads + N OCR+LLM calls in one route trips the budget
   *     and Vercel returns an HTML 504 page (which previously broke
   *     `res.json()` with "Unexpected token 'A'..." in the dashboard).
   *   - Splitting the work lets each /api/process invocation get its own
   *     60s budget. The browser orchestrates concurrency.
   */
  const syncGoogleDriveOrders = useCallback(async () => {
    setGdriveSyncing(true);
    try {
      // ── STEP 1: Import a small batch of any NEW files in the Drive folder.
      const importRes = await fetch('/api/gdrive/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_kind: 'orders', batch_size: 5 }),
      });
      const importRaw = await importRes.text();
      let importJson: { imported?: number; total_in_folder?: number; remaining_unimported?: number; new_documents?: { document_id: string }[]; error?: string } = {};
      try { importJson = importRaw ? JSON.parse(importRaw) : {}; }
      catch {
        const snippet = importRaw.slice(0, 120).replace(/\s+/g, ' ').trim();
        throw new Error(importRes.ok
          ? `Server returned non-JSON response: "${snippet}"`
          : `HTTP ${importRes.status}: ${snippet || importRes.statusText}`);
      }
      if (!importRes.ok) throw new Error(importJson.error || `HTTP ${importRes.status}`);

      const importedCount = importJson.imported ?? 0;
      const remaining = importJson.remaining_unimported ?? 0;

      // ── STEP 2: Fetch ALL docs in the orders folder that still need
      // OCR/LLM processing (status='new' / 'failed' / 'exception' / etc).
      const pendingRes = await fetch('/api/gdrive/process-pending?folder_kind=orders&limit=500');
      const pendingJson = await pendingRes.json().catch(() => ({}));
      const pendingIds: string[] = pendingJson?.document_ids || [];

      if (importedCount > 0) {
        toast.success(
          `Imported ${importedCount} new document(s)` +
          (remaining > 0 ? ` (${remaining} more queued — click Sync again).` : '.')
        );
      } else if (pendingIds.length === 0) {
        toast(`No new files (${importJson.total_in_folder ?? 0} already imported).`);
      }

      // ── STEP 3: Process pending docs concurrently with limited parallelism.
      // Too much parallelism saturates the OpenRouter free model and Vision
      // API. Three at a time is a good compromise.
      if (pendingIds.length > 0) {
        toast(`Running OCR + LLM extraction on ${pendingIds.length} document(s)…`);
        const PARALLEL = 3;
        let ok = 0;
        let failed = 0;
        const queue = pendingIds.slice();
        const worker = async () => {
          while (queue.length > 0) {
            const id = queue.shift();
            if (!id) return;
            try {
              const r = await fetch('/api/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ document_id: id }),
              });
              if (!r.ok) {
                failed++;
                // eslint-disable-next-line no-console
                console.error(`[gdrive sync] process(${id}) HTTP ${r.status}`);
              } else {
                ok++;
              }
            } catch (e) {
              failed++;
              // eslint-disable-next-line no-console
              console.error(`[gdrive sync] process(${id}) threw`, e);
            }
            // Refresh table periodically so the user sees progress.
            if ((ok + failed) % 3 === 0) await fetchNewOrders();
          }
        };
        await Promise.all(Array.from({ length: PARALLEL }, () => worker()));
        if (failed > 0) {
          toast.error(`OCR/LLM failed for ${failed}/${pendingIds.length} document(s) — see console.`);
        } else {
          toast.success(`Processed ${ok} document(s) successfully.`);
        }
      }

      await fetchNewOrders();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setGdriveSyncing(false);
    }
  }, [fetchNewOrders]);

  /**
   * Re-run the OCR + LLM pipeline on a single document. Used from the
   * Reprocess button on order rows whose extraction failed (status='failed'
   * or empty line items).
   */
  const reprocessDocument = useCallback(async (documentId: string) => {
    try {
      const r = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: documentId }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(j.error || `Reprocess failed: HTTP ${r.status}`);
        return;
      }
      toast.success('Reprocess complete.');
      await fetchNewOrders();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Reprocess failed');
    }
  }, [fetchNewOrders]);

  const reprocessBlankGoogleDrive = useCallback(async () => {
    const targets = newOrders
      .filter((o) =>
        o.documents?.source === 'google_drive' &&
        ((o.order_lines?.length ?? 0) === 0 || (!o.order_number && !o.customer_name && o.total_amount == null))
      )
      .map((o) => o.document_id ?? o.id)
      .filter((id): id is string => !!id)
      .slice(0, 10);

    if (targets.length === 0) {
      toast('No blank Google Drive rows to reprocess.');
      return;
    }

    setBulkReprocessing(true);
    try {
      let ok = 0;
      let failed = 0;
      const queue = targets.slice();
      const PARALLEL = 2;

      const worker = async () => {
        while (queue.length > 0) {
          const id = queue.shift();
          if (!id) return;
          try {
            const r = await fetch('/api/process', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ document_id: id }),
            });
            if (r.ok) ok++;
            else failed++;
          } catch {
            failed++;
          }
        }
      };

      toast(`Reprocessing ${targets.length} blank Google Drive row(s)…`);
      await Promise.all(Array.from({ length: PARALLEL }, () => worker()));
      await fetchNewOrders();
      if (failed > 0) toast.error(`Reprocessed ${ok}/${targets.length}. ${failed} failed.`);
      else toast.success(`Reprocessed ${ok} row(s) successfully.`);
    } finally {
      setBulkReprocessing(false);
    }
  }, [newOrders, fetchNewOrders]);




  const updateApprovalStatus = useCallback(async (orderId: string, status: string) => {
    const toastMessages: Record<string, { loading: string; success: string; error: string }> = {
      approved: {
        loading: 'Approving order…',
        success: 'Order approved successfully',
        error: 'Failed to approve order',
      },
      rejected: {
        loading: 'Rejecting order…',
        success: 'Order rejected successfully',
        error: 'Failed to reject order',
      },
      pending: {
        loading: 'Updating order status…',
        success: 'Order set back to pending',
        error: 'Failed to update order status',
      },
    };
    const messages = toastMessages[status] ?? toastMessages.pending;
    const toastId = toast.loading(messages.loading);

    try {
      const res = await fetch('/api/orders/update-status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: orderId,
          status,
          ...(status === 'rejected' ? { error: 'error' } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === 'ALREADY_PROCESSED') {
          toast('Order already processed', { id: toastId, ...toastWarningOptions });
          return;
        }
        throw new Error(data.error || messages.error);
      }
      toast.success(messages.success, { id: toastId });
      await fetchNewOrders();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : messages.error, { id: toastId });
    }
  }, [fetchNewOrders]);

  const openOrderEditor = useCallback((order: NewOrder) => {
    const lines = (order.order_lines || []).map((line) => ({
      item: line.sku_name || line.description || '',
      quantity: line.quantity != null ? String(line.quantity) : '',
      uom: line.unit_of_measure || '',
    }));
    setEditingOrder({
      id: order.id,
      customer_whatsapp: order.customer_whatsapp,
      order_lines: lines,
    });
  }, []);

  const saveOrderEdit = useCallback(async (payload: {
    id: string;
    whatsapp_sender: string;
    analyzed_items: { item: string; quantity: number | null; uom: string | null }[];
  }) => {
    setSavingEdit(true);
    const toastId = toast.loading('Saving order…');
    try {
      const res = await fetch('/api/orders/edit', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        if (data.code === 'NOT_EDITABLE') {
          toast('Only pending orders can be edited', { id: toastId, ...toastWarningOptions });
          setEditingOrder(null);
          return;
        }
        throw new Error(data.error || `Failed to save order (HTTP ${res.status})`);
      }

      // Update table immediately from verified API response (DB row).
      if (data.data) {
        setNewOrders((prev) =>
          prev.map((o) => (o.id === payload.id ? mapSavedRowToOrder(o, data.data) : o))
        );
      }

      toast.success('Order updated successfully', { id: toastId });
      setEditingOrder(null);
      router.refresh();
      void fetchNewOrders({ silent: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save order', { id: toastId });
    } finally {
      setSavingEdit(false);
    }
  }, [fetchNewOrders, router]);

  useEffect(() => {
    fetchNewOrders();
  }, [fetchNewOrders]);

  useEffect(() => { setNewOrdersPage(1); }, [newOrdersSource]);


  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Orders</h1>
          <p className="text-slate-500 mt-1.5 text-sm">
            {/* {mainTab === 'whatsapp'
              ? `${whatsappTotal} WhatsApp messages — items extracted from text & images`
              : mainTab === 'silo'
                ? `Live data from Silo WMS — ${salesTotal.toLocaleString()} sales, ${purchaseTotal.toLocaleString()} purchase orders`
                : `${newOrdersTotal.toLocaleString()} new orders from WhatsApp, Email, Scanner & Cloud`} */}
            {`${newOrdersTotal.toLocaleString()} new orders from WhatsApp`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => fetchNewOrders()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white text-brand-600 hover:bg-slate-50 hover:text-brand-700 disabled:opacity-50 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

            {error && <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>}

      {/* ─── NEW ORDERS VIEW ─── */}
      {/* Source filter */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1 bg-slate-50 p-1 rounded-lg w-fit">
          {[
            // { value: '', label: 'All Sources' },
            { value: 'whatsapp', label: 'WhatsApp' },
            // { value: 'email', label: 'Email' },
            // { value: 'scanner', label: 'Scanner' },
            // { value: 'google_drive', label: 'Google Drive' },
          ].map(s => (
            <button
              key={s.value}
              onClick={() => setNewOrdersSource(s.value)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition ${newOrdersSource === s.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {newOrdersSource === 'google_drive' && (
          <div className="flex items-center gap-2">
            <button
              onClick={syncGoogleDriveOrders}
              disabled={gdriveSyncing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Import any new order PDFs/images from the Google Drive orders folder and run OCR + LLM extraction"
            >
              <RefreshCw className={`w-4 h-4 ${gdriveSyncing ? 'animate-spin' : ''}`} />
              {gdriveSyncing ? 'Syncing…' : 'Sync Google Drive Orders'}
            </button>
            <button
              onClick={reprocessBlankGoogleDrive}
              disabled={bulkReprocessing || blankGoogleDriveCount === 0}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Re-run OCR + LLM extraction for blank Google Drive rows (up to 10 at a time)"
            >
              <RefreshCw className={`w-4 h-4 ${bulkReprocessing ? 'animate-spin' : ''}`} />
              {bulkReprocessing ? 'Reprocessing…' : `Reprocess Blank (${blankGoogleDriveCount})`}
            </button>
          </div>
        )}
      </div>

      <Card>
        <div className="overflow-x-auto">
          {/* Dense data table — the OCR + LLM + Item-Master pipeline can
                  produce very long values (multi-line addresses, many items).
                  We render every value in full at 8px so the client never
                  loses information to truncation. */}
          <table className="w-full" style={{ fontSize: '12px', lineHeight: 1.35 }}>
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200 bg-slate-50/60 uppercase tracking-wide" style={{ fontSize: '12px' }}>
                <th className="px-2 py-2 font-semibold align-bottom">Source</th>
                <th className="px-2 py-2 font-semibold align-bottom">Order #</th>
                <th className="px-2 py-2 font-semibold align-bottom">Client / Contact</th>
                <th className="px-2 py-2 font-semibold align-bottom">Billing / Shipping</th>
                <th className="px-2 py-2 font-semibold align-bottom">Extracted Line Items (OCR + AI/LLM &rarr; Item Master)</th>
                <th className="px-2 py-2 font-semibold align-bottom whitespace-nowrap">Order Date</th>
                <th className="px-2 py-2 font-semibold align-bottom whitespace-nowrap">Delivery</th>
                <th className="px-2 py-2 font-semibold align-bottom text-right">Subtotal</th>
                <th className="px-2 py-2 font-semibold align-bottom text-right">Tax</th>
                <th className="px-2 py-2 font-semibold align-bottom text-right">Total</th>
                <th className="px-2 py-2 font-semibold align-bottom">Status</th>
                <th className="px-2 py-2 font-semibold align-bottom">Approval</th>
                <th className="px-2 py-2 font-semibold align-bottom">Export</th>
                <th className="px-2 py-2 font-semibold align-bottom whitespace-nowrap">Actions</th>
                <th className="px-2 py-2 font-semibold align-bottom whitespace-nowrap">Received</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100" style={{ fontSize: '12px' }}>
              {loading && newOrders.length === 0 ? (
                <tr><td colSpan={15} className="px-2 py-12 text-center text-slate-500" style={{ fontSize: '11px' }}>
                  <RefreshCw className="w-6 h-6 text-slate-300 mx-auto mb-2 animate-spin" /> Loading new orders...
                </td></tr>
              ) : newOrders.length === 0 ? (
                <tr><td colSpan={15} className="px-2 py-12 text-center text-slate-500" style={{ fontSize: '11px' }}>
                  <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" /> No new orders found
                </td></tr>
              ) : paginatedNewOrders.map(o => {
                const src = o.documents?.source || 'unknown';
                const Icon = SOURCE_ICONS[src] || Package;
                const driveFileId = src === 'google_drive' ? o.documents?.source_identifier : null;
                const driveMime = o.documents?.file_mime_type || '';
                const driveUrl = driveFileId ? `https://drive.google.com/file/d/${driveFileId}/view` : null;
                const driveThumb = driveFileId
                  ? `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w64`
                  : null;
                const driveFilename = o.documents?.original_filename || 'Open in Google Drive';
                const ap = o.approval_status || 'pending';
                const orderType = o.order_type || (o.documents?.media_url ? 'image' : 'text');
                // Sort line items by line_number for stable display.
                const lines = (o.order_lines || [])
                  .slice()
                  .sort((a, b) => (a.line_number ?? 0) - (b.line_number ?? 0));
                return (
                  <tr key={o.id} className="hover:bg-slate-50 align-top">
                    {/* SOURCE */}
                    <td className="px-2 py-2 align-top">
                      {driveUrl ? (
                        <a
                          href={driveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Open "${driveFilename}" in Google Drive`}
                          className="inline-flex items-start gap-1 group"
                        >
                          {driveThumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={driveThumb}
                              alt={driveFilename}
                              width={28}
                              height={28}
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              className="w-7 h-7 rounded border border-slate-200 object-cover bg-slate-50 shrink-0"
                              onError={(e) => {
                                const target = e.currentTarget;
                                target.style.display = 'none';
                                const fb = target.nextElementSibling as HTMLElement | null;
                                if (fb) fb.style.display = 'inline-flex';
                              }}
                            />
                          ) : null}
                          <span
                            className="w-7 h-7 rounded border border-slate-200 bg-slate-50 items-center justify-center text-slate-500 shrink-0"
                            style={{ display: driveThumb ? 'none' : 'inline-flex' }}
                          >
                            {driveMime.startsWith('image/') ? (
                              <Image className="w-3 h-3" />
                            ) : (
                              <FileText className="w-3 h-3" />
                            )}
                          </span>
                          <span className="text-slate-700 group-hover:text-brand-600 group-hover:underline break-all">
                            {SOURCE_LABELS[src] || src}<br />
                            <span className="text-slate-500 break-all">{driveFilename}</span>
                          </span>
                        </a>
                      ) : (
                        <div className="flex flex-col gap-1 items-start">
                          <div className="flex items-center gap-1 flex-wrap">
                            <Icon className="w-3 h-3 text-slate-400" />
                            <span className="text-slate-600">{SOURCE_LABELS[src] || src}</span>
                            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              orderType === 'image'
                                ? 'bg-violet-50 text-violet-700'
                                : 'bg-sky-50 text-sky-700'
                            }`}>
                              {orderType === 'image' ? (
                                <><Image className="w-2.5 h-2.5" /> Image</>
                              ) : (
                                <><FileText className="w-2.5 h-2.5" /> Text</>
                              )}
                            </span>
                          </div>
                          {orderType === 'image' && o.documents?.media_url && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewImageUrl(o.documents.media_url!);
                              }}
                              className="text-xs text-brand-600 hover:text-brand-700 font-medium inline-flex items-center gap-1 mt-1"
                            >
                              <Image className="w-3 h-3" /> Preview
                            </button>
                          )}
                        </div>
                      )}
                    </td>

                    {/* ORDER # */}
                    <td className="px-2 py-2 font-semibold text-slate-900 break-all align-top">{o.order_number || '—'}</td>

                    {/* CLIENT / CONTACT — full address shown, not truncated */}
                    <td className="px-2 py-2 text-slate-700 align-top whitespace-normal break-words" style={{ minWidth: 110, maxWidth: 180 }}>
                      {/*<div className="font-semibold text-slate-900">{o.customer_name || '—'}</div>
                          {o.customer_code && <div className="text-slate-600">Code: {o.customer_code}</div>}
                          {o.customer_phone && <div className="text-slate-600">📞 {o.customer_phone}</div>}*/}
                      {o.customer_whatsapp && <div className="text-slate-600">🟢 {o.customer_whatsapp}</div>}
                      {o.customer_email && <div className="text-slate-600 break-all">✉ {o.customer_email}</div>}
                    </td>

                    {/* BILLING / SHIPPING — fully expanded */}
                    <td className="px-2 py-2 text-slate-700 align-top whitespace-pre-wrap break-words" style={{ minWidth: 130, maxWidth: 220 }}>
                      {o.billing_address && (
                        <div className="mb-1">
                          <span className="font-semibold text-slate-500">BILL:</span> <span className="text-slate-700">{o.billing_address}</span>
                        </div>
                      )}
                      {o.shipping_address && (
                        <div>
                          <span className="font-semibold text-slate-500">SHIP:</span> <span className="text-slate-700">{o.shipping_address}</span>
                        </div>
                      )}
                      {o.payment_terms && (
                        <div className="mt-1">
                          <span className="font-semibold text-slate-500">TERMS:</span> <span className="text-slate-700">{o.payment_terms}</span>
                        </div>
                      )}
                      {o.special_instructions && (
                        <div className="mt-1">
                          <span className="font-semibold text-slate-500">NOTES:</span> <span className="text-slate-700">{o.special_instructions}</span>
                        </div>
                      )}
                      {!o.billing_address && !o.shipping_address && !o.payment_terms && !o.special_instructions && (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    {/* LINE ITEMS — OCR + LLM + Item-Master matches, fully shown */}
                    <td className="px-2 py-2 text-slate-700 align-top whitespace-normal break-words" style={{ minWidth: 260 }}>
                      {lines.length === 0 ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <>
                          <table className="w-full border border-slate-200" style={{ fontSize: '12px' }}>
                            <thead className="bg-slate-100/70">
                              <tr>
                                <th className="px-1 py-0.5 text-left font-semibold border-b border-slate-200">#</th>
                                <th className="px-1 py-0.5 text-left font-semibold border-b border-slate-200">SKU</th>
                                <th className="px-1 py-0.5 text-left font-semibold border-b border-slate-200">Item / Description</th>
                                <th className="px-1 py-0.5 text-right font-semibold border-b border-slate-200">Qty</th>
                                <th className="px-1 py-0.5 text-left font-semibold border-b border-slate-200">UoM</th>
                                <th className="px-1 py-0.5 text-right font-semibold border-b border-slate-200">Unit ₹</th>
                                <th className="px-1 py-0.5 text-right font-semibold border-b border-slate-200">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lines.map((l, i) => {
                                return (
                                  <tr key={i} className="border-b border-slate-100 last:border-0">
                                    <td className="px-1 py-0.5 align-top text-slate-500">{l.line_number ?? i + 1}</td>
                                    <td className="px-1 py-0.5 align-top font-mono text-slate-700 break-all whitespace-normal">{l.sku_code || '—'}</td>
                                    <td className="px-1 py-0.5 align-top text-slate-900 whitespace-normal break-words">
                                      <div className="font-medium">{l.sku_name || l.description || '—'}</div>
                                      {l.sku_name && l.description && l.description !== l.sku_name && (
                                        <div className="text-slate-500 whitespace-normal break-words">{l.description}</div>
                                      )}
                                    </td>
                                    <td className="px-1 py-0.5 align-top text-right font-semibold whitespace-nowrap">{l.quantity ?? '—'}</td>
                                    <td className="px-1 py-0.5 align-top text-slate-600 whitespace-nowrap">{l.unit_of_measure || '—'}</td>
                                    <td className="px-1 py-0.5 align-top text-right text-slate-700 whitespace-nowrap">{l.unit_price != null ? Number(l.unit_price).toFixed(2) : '—'}</td>
                                    <td className="px-1 py-0.5 align-top text-right text-slate-700 whitespace-nowrap">{l.line_total != null ? Number(l.line_total).toFixed(2) : '—'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </>
                      )}
                    </td>

                    {/* DATES */}
                    <td className="px-2 py-2 text-slate-600 align-top whitespace-nowrap">{formatDate(o.order_date)}</td>
                    <td className="px-2 py-2 text-slate-600 align-top whitespace-nowrap">{formatDate(o.delivery_date)}</td>

                    {/* AMOUNTS */}
                    <td className="px-2 py-2 align-top text-right text-slate-700 whitespace-nowrap">{o.subtotal != null ? formatCurrency(o.subtotal) : '—'}</td>
                    <td className="px-2 py-2 align-top text-right text-slate-700 whitespace-nowrap">{o.tax_amount != null ? formatCurrency(o.tax_amount) : '—'}</td>
                    <td className="px-2 py-2 align-top text-right font-semibold text-slate-900 whitespace-nowrap">{formatCurrency(o.total_amount)}</td>

                    {/* STATUS */}
                    <td className="px-2 py-2 align-top">
                      <Badge className={getStatusColor(o.validation_status || 'pending') + ' !text-[12px] !px-1.5 !py-0.5'}>{o.validation_status || 'pending'}</Badge>
                    </td>

                    {/* APPROVAL */}
                    <td className="px-2 py-2 align-top">
                      <div className="flex flex-col items-start gap-1 w-fit">
                        {[
                          { value: 'pending', label: 'Pending', activeClass: 'bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full', inactiveClass: 'text-slate-700 hover:opacity-80 px-1 py-1' },
                          { value: 'approved', label: 'Approve', activeClass: 'bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full', inactiveClass: 'text-teal-600 hover:opacity-80 px-1 py-1' },
                          { value: 'rejected', label: 'Reject', activeClass: 'bg-red-100 text-red-700 px-2.5 py-1 rounded-full', inactiveClass: 'text-red-700 hover:opacity-80 px-1 py-1' }
                        ].map(opt => {
                          const isActive = ap === opt.value;
                          if (isActive) {
                            return (
                              <span key={opt.value} className={`text-[13px] font-medium leading-none ${opt.activeClass}`}>
                                {opt.label}
                              </span>
                            );
                          }
                          return (
                            <button
                              key={opt.value}
                              onClick={() => updateApprovalStatus(o.id, opt.value)}
                              className={`text-[13px] font-medium leading-none bg-transparent border-none cursor-pointer text-left ${opt.inactiveClass}`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}

                        {src === 'google_drive' && (o.validation_status === 'failed' || lines.length === 0) && (
                          <button
                            onClick={() => reprocessDocument(o.document_id ?? o.id)}
                            className="px-1.5 py-0.5 mt-1 rounded text-amber-700 hover:bg-amber-50"
                            style={{ fontSize: '10px' }}
                            title="Re-run OCR + LLM extraction for this document"
                          >
                            Reprocess
                          </button>
                        )}
                      </div>
                    </td>

                    {/* EXPORT */}
                    <td className="px-2 py-2 align-top">
                      <Badge className={getStatusColor(o.export_status || 'pending') + ' !text-[12px] !px-1.5 !py-0.5'}>{o.export_status || 'pending'}</Badge>
                    </td>

                    {/* ACTIONS */}
                    <td className="px-2 py-2 align-top">
                      <button
                        type="button"
                        onClick={() => openOrderEditor(o)}
                        disabled={ap !== 'pending'}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
                        title={ap === 'pending' ? 'Edit order' : 'Only pending orders can be edited'}
                      >
                        <Pencil className="w-3 h-3" /> Edit
                      </button>
                    </td>

                    <td className="px-2 py-2 text-slate-500 align-top whitespace-nowrap">{formatDate(o.documents?.received_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {newOrders.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <span className="text-sm text-slate-500">
              Showing {(newOrdersPage - 1) * TABLE_PAGE_SIZE + 1}–{Math.min(newOrdersPage * TABLE_PAGE_SIZE, newOrders.length)} of {newOrders.length.toLocaleString()} orders
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setNewOrdersPage(p => Math.max(1, p - 1))}
                disabled={newOrdersPage === 1}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" /> Prev
              </button>
              <span className="text-sm text-slate-500">{newOrdersPage} / {totalNewOrdersPages}</span>
              <button
                onClick={() => setNewOrdersPage(p => Math.min(totalNewOrdersPages, p + 1))}
                disabled={newOrdersPage === totalNewOrdersPages}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </Card>

      {editingOrder && (
        <OrderEditModal
          order={editingOrder}
          saving={savingEdit}
          onClose={() => !savingEdit && setEditingOrder(null)}
          onSave={saveOrderEdit}
        />
      )}

      {/* Draggable Image Preview */}
      {previewImageUrl && (
        <DraggableImagePreview
          url={previewImageUrl}
          onClose={() => setPreviewImageUrl(null)}
        />
      )}
    </div>
  );
}

function MediaPreviewContent({
  proxyUrl,
  isLoading,
  onLoad,
}: {
  proxyUrl: string;
  isLoading: boolean;
  onLoad: () => void;
}) {
  return (
    <div className="flex-1 min-h-0 overflow-auto bg-slate-50/50 flex items-center justify-center relative p-2 sm:p-2">
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50/80 z-10">
          <RefreshCw className="w-6 h-6 text-brand-600 animate-spin mb-2" />
          <span className="text-xs text-slate-500 font-medium tracking-wide">Fetching secure media...</span>
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={proxyUrl}
        alt="WhatsApp media preview"
        onLoad={onLoad}
        className={`max-w-full max-h-full object-contain pointer-events-none rounded shadow-sm bg-white transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
      />
    </div>
  );
}

function DraggableImagePreview({ url, onClose }: { url: string; onClose: () => void }) {
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setPosition({ x: Math.max(50, window.innerWidth - 450), y: 100 });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const proxyUrl = `/api/twilio/media?url=${encodeURIComponent(url)}`;

  return (
    <>
      {/* Mobile: fullscreen modal with backdrop tap-to-close */}
      <div className="sm:hidden fixed inset-0 z-[100] flex flex-col">
        <button
          type="button"
          className="absolute inset-0 bg-black/60"
          onClick={onClose}
          aria-label="Close preview"
        />
        <div
          className="relative z-10 mt-auto flex flex-col bg-white rounded-t-2xl shadow-2xl"
          style={{ height: 'min(92dvh, 100%)' }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white rounded-t-2xl shrink-0">
            <div className="flex items-center gap-2 font-medium text-slate-700 text-sm">
              <span>🖼️</span> WhatsApp Media
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-600 hover:text-slate-900 active:bg-slate-200 w-11 h-11 -mr-2 rounded-xl flex items-center justify-center transition-colors shrink-0 touch-manipulation"
              aria-label="Close preview"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          <MediaPreviewContent
            proxyUrl={proxyUrl}
            isLoading={isLoading}
            onLoad={() => setIsLoading(false)}
          />
        </div>
      </div>

      {/* Desktop: draggable floating panel */}
      <div
        className="hidden sm:flex fixed z-[100] shadow-2xl rounded-xl bg-white border border-slate-300 flex-col"
        style={{
          left: position.x,
          top: position.y,
          width: '400px',
          height: '500px',
          resize: 'both',
          overflow: 'hidden',
        }}
      >
        <div
          className="bg-slate-100 px-3 py-2 flex items-center justify-between cursor-move border-b border-slate-200 select-none shadow-sm"
          onPointerDown={(e) => {
            setIsDragging(true);
            setDragOffset({ x: e.clientX - position.x, y: e.clientY - position.y });
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (isDragging) {
              setPosition({ x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y });
            }
          }}
          onPointerUp={(e) => {
            setIsDragging(false);
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
        >
          <div className="flex items-center gap-1.5 font-medium text-slate-700 text-sm">
            <span>🖼️</span> WhatsApp Media
          </div>
          <button
            type="button"
            onClick={onClose}
            onPointerDown={(e) => e.stopPropagation()}
            className="text-slate-400 hover:text-slate-700 hover:bg-slate-200 w-8 h-8 rounded-md flex items-center justify-center transition-colors shrink-0"
            aria-label="Close preview"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <MediaPreviewContent
          proxyUrl={proxyUrl}
          isLoading={isLoading}
          onLoad={() => setIsLoading(false)}
        />
      </div>
    </>
  );
}
