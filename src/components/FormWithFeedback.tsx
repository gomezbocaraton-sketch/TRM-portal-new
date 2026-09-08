'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';

type ActionResult = { success: boolean; error: string | null };

function SubmitBtn({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

export function FormWithFeedback({
  action,
  children,
  submitLabel = 'Save',
  pendingLabel = 'Saving…',
  className,
}: {
  action: (formData: FormData) => Promise<void>;
  children: React.ReactNode;
  submitLabel?: string;
  pendingLabel?: string;
  className?: string;
}) {
  async function wrapped(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
    try {
      await action(formData);
      return { success: true, error: null };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Something went wrong.' };
    }
  }

  const [state, formAction] = useActionState(wrapped, { success: false, error: null });
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (state.success || state.error) {
      setShow(true);
      const t = setTimeout(() => setShow(false), 3000);
      return () => clearTimeout(t);
    }
  }, [state]);

  return (
    <form action={formAction} className={className}>
      {children}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <SubmitBtn label={submitLabel} pendingLabel={pendingLabel} />
        {show && state.success && <span className="text-xs font-semibold text-success">Saved ✓</span>}
        {show && state.error && <span className="text-xs font-semibold text-red-600">{state.error}</span>}
      </div>
    </form>
  );
}
