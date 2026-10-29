'use client';

import { Download } from 'lucide-react';

export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="btn-primary !py-2 text-sm">
      <Download size={15} /> {label}
    </button>
  );
}
