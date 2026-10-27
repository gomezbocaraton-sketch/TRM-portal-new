import type { SupabaseClient } from '@supabase/supabase-js';

export const PURCHASE_DOC_CATEGORIES = ['Quote', 'Purchase order', 'Invoice', 'Plans', 'Other'];

export type PurchaseStatus = 'pending' | 'approved' | 'rejected';

export type Purchase = {
  id: number;
  project_id: string | number | null;
  vendor: string;
  notes: string | null;
  total: number | string;
  status: PurchaseStatus;
  auto_approved: boolean;
  created_by_name: string | null;
  created_at: string;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_note: string | null;
  closed_at?: string | null;
  closed_by_name?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  invoice_amount?: number | string | null;
  cost_id?: string | null;
  qbo_bill_id?: string | null;
  qbo_synced_at?: string | null;
  qbo_error?: string | null;
  vendor_email?: string | null;
  sent_at?: string | null;
  sent_to?: string | null;
  receipt_status?: string | null;
};

// The categories used on the Profitability tab, and which one an order's items usually belong to.
export const COST_CATEGORIES = [
  'Plumbing', 'Electrical', 'HVAC', 'Drywall', 'Framing', 'Flooring', 'Paint', 'Roofing',
  'Windows & Doors', 'Cabinets & Countertops', 'General Construction', 'Permits',
  'Equipment Rental', 'Dumpster & Hauling', 'Materials', 'Labor', 'Subcontractor', 'Other',
];
export const TRADE_TO_COST_CATEGORY: Record<string, string> = {
  'General construction': 'General Construction',
  Electrical: 'Electrical',
  Plumbing: 'Plumbing',
  HVAC: 'HVAC',
  Paint: 'Paint',
  Millwork: 'Cabinets & Countertops',
  Finishes: 'Materials',
  'Doors, windows & hardware': 'Windows & Doors',
  'Appliances & equipment': 'Materials',
  Other: 'Materials',
};

// The order's stage follows the usual construction PO process: Submitted, Approved, Sent, Partially received, Received, Closed.
// Each stage has one colour that is used everywhere (badges, item cards, the tracker).
export type StageKey = 'submitted' | 'approved' | 'sent' | 'partial' | 'received' | 'closed' | 'rejected';

export const STAGES: Record<StageKey, { label: string; hint: string; badge: string; card: string; dot: string }> = {
  submitted: { label: 'Submitted', hint: 'Waiting for approval', badge: 'bg-amber-100 text-amber-800', card: 'border-amber-300 bg-amber-50', dot: 'bg-amber-500' },
  approved: { label: 'Approved', hint: 'Ready to send and buy', badge: 'bg-sky-100 text-sky-800', card: 'border-sky-300 bg-sky-50', dot: 'bg-sky-500' },
  sent: { label: 'Sent to vendor', hint: 'Vendor has the PO', badge: 'bg-indigo-100 text-indigo-800', card: 'border-indigo-300 bg-indigo-50', dot: 'bg-indigo-500' },
  partial: { label: 'Partially received', hint: 'Some items arrived', badge: 'bg-orange-100 text-orange-800', card: 'border-orange-300 bg-orange-50', dot: 'bg-orange-500' },
  received: { label: 'Received', hint: 'Everything arrived', badge: 'bg-teal-100 text-teal-800', card: 'border-teal-300 bg-teal-50', dot: 'bg-teal-500' },
  closed: { label: 'Closed', hint: 'Bought and invoiced', badge: 'bg-green-100 text-green-800', card: 'border-green-300 bg-green-50', dot: 'bg-green-600' },
  rejected: { label: 'Rejected', hint: 'Not approved', badge: 'bg-red-100 text-red-800', card: 'border-red-300 bg-red-50', dot: 'bg-red-500' },
};

export const STAGE_ORDER: StageKey[] = ['submitted', 'approved', 'sent', 'partial', 'received', 'closed'];

export function poStage(p: { status: string; closed_at?: string | null; receipt_status?: string | null; sent_at?: string | null }): StageKey {
  if (p.status === 'rejected') return 'rejected';
  if (p.status === 'pending') return 'submitted';
  if (p.closed_at) return 'closed';
  if (p.receipt_status === 'received') return 'received';
  if (p.receipt_status === 'partial') return 'partial';
  if (p.sent_at) return 'sent';
  return 'approved';
}

export function isClosed(p: { closed_at?: string | null }): boolean {
  return Boolean(p.closed_at);
}

export const DEFAULT_APPROVER = 'vgomez@codeconsultationnyc.com';
export const DEFAULT_THRESHOLD = 1000;

export function poNumber(id: number | string): string {
  return 'PO-' + String(id).padStart(4, '0');
}

export function money(n: number | string): string {
  return (
    '$' +
    Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

export function formatWhen(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  });
}

export type PurchasingContext = {
  userId: string;
  email: string;
  name: string;
  approverEmail: string;
  threshold: number;
  isApprover: boolean;
};

// Who is signed in, who the approver is, and the approval threshold.
export async function getPurchasingContext(supabase: SupabaseClient): Promise<PurchasingContext> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Please sign in again.');

  const [{ data: profile }, { data: settings }] = await Promise.all([
    supabase.from('users').select('full_name, email').eq('id', user.id).maybeSingle(),
    supabase.from('purchase_settings').select('approver_email, approval_threshold').eq('id', 1).maybeSingle(),
  ]);

  const email = String(user.email ?? profile?.email ?? '').toLowerCase();
  const approverEmail = String(settings?.approver_email ?? DEFAULT_APPROVER).toLowerCase();
  return {
    userId: user.id,
    email,
    name: String(profile?.full_name ?? user.email ?? 'Portal user'),
    approverEmail,
    threshold: Number(settings?.approval_threshold ?? DEFAULT_THRESHOLD),
    isApprover: email !== '' && email === approverEmail,
  };
}
