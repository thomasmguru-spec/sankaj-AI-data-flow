import './globals.css';
import { AppToaster } from '@/components/app-toaster';

export const metadata = {
  title: 'AI Data Flow — Order Processing',
  description: 'Automated order ingestion and processing dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {/* Top nav bar */}
        <header className="sticky top-0 z-30 h-14 bg-white border-b border-slate-200 shadow-sm flex items-center px-6 gap-4">
          <span className="font-semibold text-slate-800 tracking-tight text-base">
            📦 Order Processing
          </span>
        </header>

        {/* Page content — centred, with comfortable side & vertical padding */}
        <main className="mx-auto w-full max-w-screen-2xl px-4 sm:px-6 lg:px-10 py-8">
          {children}
        </main>
        <AppToaster />
      </body>
    </html>
  );
}
