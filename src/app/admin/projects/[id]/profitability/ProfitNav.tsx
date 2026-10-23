'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function ProfitNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/admin/projects/${projectId}/profitability`;
  const tabs = [
    { href: base, label: 'Summary & costs', active: pathname === base || pathname.startsWith(`${base}/file`) },
    { href: `${base}/invoices`, label: 'Invoices', active: pathname.startsWith(`${base}/invoices`), isNew: true },
  ];
  return (
    <div className="mb-5 flex flex-wrap gap-2 rounded-card border border-line bg-white p-1.5">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`rounded-lg px-4 py-2 text-sm ${
            t.active ? 'bg-navy font-semibold text-white' : 'text-ink-soft hover:text-navy'
          }`}
        >
          {t.label}
          {t.isNew && <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-white">NEW</span>}
        </Link>
      ))}
    </div>
  );
}
