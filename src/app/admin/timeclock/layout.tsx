import { TimeNav } from './TimeNav';

export default function TimeClockLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-10">
      <h1 className="mb-4 text-xl font-medium text-navy sm:text-2xl">Time clock</h1>
      <TimeNav />
      {children}
    </main>
  );
}
