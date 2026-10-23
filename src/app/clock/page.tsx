import { ClockApp } from './ClockApp';

// Public page for employees: sign in with cell phone + password, then clock in or out.
export const dynamic = 'force-dynamic';

export default function ClockPage() {
  return (
    <main className="mx-auto min-h-screen max-w-md px-4 py-6">
      <ClockApp />
    </main>
  );
}
