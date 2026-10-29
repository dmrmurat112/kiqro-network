'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export function CopyField({ value, copyLabel, copiedLabel }: { value: string; copyLabel: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-stretch overflow-hidden rounded-xl border border-line-strong bg-bg">
      <code className="flex-1 overflow-x-auto px-4 py-3 font-mono text-[0.8rem] whitespace-nowrap text-fg/90">{value}</code>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        }}
        className="flex shrink-0 items-center gap-1.5 border-l border-line-strong px-4 text-xs font-medium text-muted transition-colors hover:bg-surface-strong hover:text-fg"
      >
        {copied ? <Check size={14} className="text-good" /> : <Copy size={14} />}
        {copied ? copiedLabel : copyLabel}
      </button>
    </div>
  );
}
