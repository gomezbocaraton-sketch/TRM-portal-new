import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getPurchasingContext } from '@/lib/purchasing';

// Shown on every admin page, and only when the signed-in person is the approver and orders are waiting.
export async function ApprovalBanner() {
  try {
    const supabase = await createClient();
    const ctx = await getPurchasingContext(supabase);
    if (!ctx.isApprover) return null;
    const { count } = await supabase.from('purchases').select('id', { count: 'exact', head: true }).eq('status', 'pending');
    if (!count) return null;
    return (
      <Link href="/admin/purchasing" className="block print:hidden border-b border-accent bg-accent-tint px-4 py-3 text-center text-sm font-semibold text-accent-deep hover:underline sm:px-8">
        {count} purchase order{count === 1 ? '' : 's'} waiting for your approval. Click here to review and approve.
      </Link>
    );
  } catch {
    return null;
  }
}
