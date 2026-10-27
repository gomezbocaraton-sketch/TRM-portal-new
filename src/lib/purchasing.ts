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
