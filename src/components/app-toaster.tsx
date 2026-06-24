'use client';

import { Toaster } from 'react-hot-toast';

export const toastWarningOptions = {
  style: { background: '#fffbeb', color: '#92400e', border: '1px solid #fcd34d' },
};

export function AppToaster() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 4000,
        success: {
          style: { background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0' },
        },
        error: {
          style: { background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' },
        },
        loading: {
          style: { background: '#f8fafc', color: '#334155', border: '1px solid #e2e8f0' },
        },
      }}
    />
  );
}
