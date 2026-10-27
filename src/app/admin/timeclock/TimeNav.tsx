'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/admin/timeclock', label: 'Time sheet', match: (p: string) => p === '/admin/timeclock' },
  { href: '/admin/timeclock/card', label: 'Time cards', match: (p: string) => p.startsWith('/admin/timeclock/card') },
  { href: '/admin/timeclock/reports', label: 'Reports', match: (p: string) => p.startsWith('/admin/timeclock/reports') },
  { href: '/admin/timeclock/locations', label: 'Locations', match: (p: string) => p.startsWith('/admin/timeclock/locations') },
  { href: '/admin/timeclock/employees', label: 'Employees', match: (p: string) => p.startsWith('/admin/timeclock/employees') },
];

export function TimeNav() {
  const path = usePathname();
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            t.match(path) ? 'bg-navy text-white' : 'border border-line bg-white text-ink-soft hover:border-accent'
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
