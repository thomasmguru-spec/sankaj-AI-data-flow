// ---------------------------------------------------------------------------
// formatCurrency
// ---------------------------------------------------------------------------
export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

// ---------------------------------------------------------------------------
// getStatusColor  — returns Tailwind bg+text classes for a status badge
// ---------------------------------------------------------------------------
export function getStatusColor(status: string | null | undefined): string {
  switch ((status || '').toLowerCase()) {
    case 'validated':
    case 'approved':
    case 'exported':
    case 'complete':
    case 'completed':
      return 'bg-green-100 text-green-800';
    case 'pending':
    case 'draft':
      return 'bg-slate-100 text-slate-600';
    case 'under_review':
    case 'processing':
      return 'bg-amber-100 text-amber-800';
    case 'failed':
    case 'rejected':
    case 'error':
      return 'bg-red-100 text-red-700';
    case 'exception':
      return 'bg-orange-100 text-orange-800';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}
