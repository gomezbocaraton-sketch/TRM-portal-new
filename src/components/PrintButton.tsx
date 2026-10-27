'use client';

export function PrintButton({ label = 'Print or save as PDF' }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white print:hidden">
      {label}
    </button>
  );
}
