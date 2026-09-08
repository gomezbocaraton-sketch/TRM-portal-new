'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '', label: 'Overview' },
  { href: '/milestones', label: 'Milestones' },
  { href: '/punchlist', label: 'Punch List' },
  { href: '/financials', label: 'Financials' },
  { href: '/profitability', label: 'Profitability' },
  { href: '/changeorders', label: 'Change Orders' },
  { href: '/subcontractors', label: 'Subcontractors' },
  { href: '/documents', label: 'Documents' },
  { href: '/matterport', label: 'Matterport' },
  { href: '/dailylog', label: 'Daily Log' },
  { href: '/rfis', label: 'RFIs' },
];

export default function TabNav({ projectId }: { projectId: number }) {
  const pathname = usePathname();
  const base = `/admin/projects/${projectId}`;

  return (
    <div className="mb-8 flex gap-1 overflow-x-auto whitespace-nowrap border-b border-line">
      {TABS.map((tab) => {
        const href = `${base}${tab.href}`;
        const isActive = tab.href === '' ? pathname === base : pathname.startsWith(href);
        return (
          <Link
            key={tab.href}
            href={href}
            className={`shrink-0 border-b-2 px-3 py-2.5 text-sm transition-colors ${
              isActive ? 'border-accent font-semibold text-navy' : 'border-transparent font-medium text-ink-soft hover:text-navy'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
