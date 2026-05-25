import React from 'react';

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function Card({ children, className = '', ...props }: CardProps) {
  return (
    <div
      className={`bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------
interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
}

export function Badge({ children, className = '', ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
