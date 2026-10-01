import Link from 'next/link';
import { logout } from './actions';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <header className="flex items-center justify-between border-b border-line bg-white px-4 py-3 sm:px-8">
        <Link href="/admin" className="flex items-center gap-3">
          <img src="/trm-logo-full.png" alt="TRM Partners" className="h-6 w-auto sm:h-8" />
          <span className="hidden text-xs font-semibold uppercase tracking-wide text-ink-soft sm:inline">
            Admin
          </span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/admin" className="text-xs font-medium text-ink-soft underline decoration-dotted hover:text-navy">
            Home
          </Link>
          <form action={logout}>
            <button className="text-xs font-medium text-ink-soft underline decoration-dotted hover:text-navy">
              Log out
            </button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}
