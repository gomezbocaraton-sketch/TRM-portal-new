import { STAGES, STAGE_ORDER } from '@/lib/purchasing';

// A small key so the colours mean the same thing everywhere.
export function StageLegend() {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft">
      {STAGE_ORDER.map((k) => (
        <span key={k} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${STAGES[k].dot}`} />
          {STAGES[k].label}
        </span>
      ))}
    </div>
  );
}
