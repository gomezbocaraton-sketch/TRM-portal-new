import { money, poNumber } from '@/lib/purchasing';

// Emails the approver when an order needs approval. Best effort: if the email
// settings are not set up yet, this quietly does nothing and the order simply
// shows under "Waiting for approval" in the portal.
export async function sendApprovalRequest(opts: {
  to: string;
  purchaseId: number;
  vendor: string;
  total: number;
  createdBy: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PURCHASING_FROM;
  if (!apiKey || !from) return;

  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://trm-portal-new.vercel.app';
  const link = `${base}/admin/purchasing/${opts.purchaseId}`;
  const po = poNumber(opts.purchaseId);

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: `Approval needed: ${po}, ${opts.vendor}, ${money(opts.total)}`,
        html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#14284B">
          <p>${opts.createdBy} entered a purchase that needs your approval.</p>
          <p><b>${po}</b><br>${opts.vendor}<br><b>${money(opts.total)}</b></p>
          <p><a href="${link}" style="background:#B4572A;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Review and approve</a></p>
          <p style="font-size:12px;color:#666">You will be asked to sign in to the portal. Only you can approve or reject this order.</p>
        </div>`,
      }),
    });
  } catch {
    // never block the purchase because an email failed
  }
}
