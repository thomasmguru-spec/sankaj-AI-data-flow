'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';

export interface EditableOrderLine {
  item: string;
  quantity: string;
  uom: string;
}

export interface EditableOrder {
  id: string;
  customer_whatsapp: string | null;
  order_lines: EditableOrderLine[];
}

interface OrderEditModalProps {
  order: EditableOrder;
  saving: boolean;
  onClose: () => void;
  onSave: (payload: {
    id: string;
    whatsapp_sender: string;
    analyzed_items: { item: string; quantity: number | null; uom: string | null }[];
  }) => void;
}

function linesFromOrder(order: EditableOrder): EditableOrderLine[] {
  if (order.order_lines.length > 0) return order.order_lines;
  return [{ item: '', quantity: '', uom: '' }];
}

export function OrderEditModal({ order, saving, onClose, onSave }: OrderEditModalProps) {
  const [whatsappSender, setWhatsappSender] = useState(order.customer_whatsapp ?? '');
  const [lines, setLines] = useState<EditableOrderLine[]>(() => linesFromOrder(order));

  useEffect(() => {
    setWhatsappSender(order.customer_whatsapp ?? '');
    setLines(linesFromOrder(order));
  }, [order]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose, saving]);

  const updateLine = (index: number, field: keyof EditableOrderLine, value: string) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, [field]: value } : line)));
  };

  const addLine = () => {
    setLines((prev) => [...prev, { item: '', quantity: '', uom: '' }]);
  };

  const removeLine = (index: number) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedSender = whatsappSender.trim();
    if (!trimmedSender) return;

    const analyzed_items = lines
      .map((line) => ({
        item: line.item.trim(),
        quantity: line.quantity.trim() ? Number(line.quantity) : null,
        uom: line.uom.trim() || null,
      }))
      .filter((line) => line.item);

    if (analyzed_items.length === 0) {
      toast.error('Add at least one line item with a name');
      return;
    }

    onSave({
      id: order.id,
      whatsapp_sender: trimmedSender,
      analyzed_items,
    });
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        onClick={() => !saving && onClose()}
        aria-label="Close edit dialog"
      />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-xl bg-white shadow-2xl border border-slate-200 flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Edit order</h2>
            <p className="text-sm text-slate-500 mt-0.5">Update customer contact and line items before approval.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-slate-500 hover:text-slate-800 disabled:opacity-50 p-2 rounded-lg hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
          <div className="overflow-y-auto px-5 py-4 space-y-5">
            <div>
              <label htmlFor="whatsapp-sender" className="block text-sm font-medium text-slate-700 mb-1.5">
                WhatsApp / Contact
              </label>
              <input
                id="whatsapp-sender"
                type="text"
                value={whatsappSender}
                onChange={(e) => setWhatsappSender(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                placeholder="+1234567890"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-slate-700">Line items</label>
                <button
                  type="button"
                  onClick={addLine}
                  className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
                >
                  <Plus className="w-4 h-4" /> Add line
                </button>
              </div>

              <div className="space-y-2">
                {lines.map((line, index) => (
                  <div key={index} className="grid grid-cols-[1fr_80px_80px_36px] gap-2 items-start">
                    <input
                      type="text"
                      value={line.item}
                      onChange={(e) => updateLine(index, 'item', e.target.value)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      placeholder="Item / description"
                    />
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={line.quantity}
                      onChange={(e) => updateLine(index, 'quantity', e.target.value)}
                      className="rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      placeholder="Qty"
                    />
                    <input
                      type="text"
                      value={line.uom}
                      onChange={(e) => updateLine(index, 'uom', e.target.value)}
                      className="rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      placeholder="UoM"
                    />
                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      disabled={lines.length <= 1}
                      className="h-[38px] w-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Remove line"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200 bg-slate-50">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !whatsappSender.trim()}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
