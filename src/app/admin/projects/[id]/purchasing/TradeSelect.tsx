'use client';

// Ticks or clears every item in one trade, so a purchase order can be started for that trade.
export function TradeSelect({ trade }: { trade: string }) {
  function set(e: React.MouseEvent, on: boolean) {
    e.preventDefault();
    e.stopPropagation();
    document.querySelectorAll<HTMLInputElement>('input[name="ids"]').forEach((el) => {
      if (el.dataset.trade === trade) el.checked = on;
    });
  }
  return (
    <span className="flex gap-3 text-xs">
      <button type="button" onClick={(e) => set(e, true)} className="font-semibold text-accent underline">Select all</button>
      <button type="button" onClick={(e) => set(e, false)} className="text-ink-soft underline">Clear</button>
    </span>
  );
}
