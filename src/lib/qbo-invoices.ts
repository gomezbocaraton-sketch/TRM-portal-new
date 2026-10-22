import { qboQuery, qboRequest, type QboConnection } from '@/lib/qbo';

export type QboCustomer = { Id: string; DisplayName: string; Email: string | null };
export type QboInvoice = {
  Id: string;
  DocNumber?: string;
  TotalAmt: number;
  Balance: number;
  BillEmail?: { Address?: string };
};
type QboPaymentLine = { Amount?: number; LinkedTxn?: { TxnId: string; TxnType: string }[] };
type QboPayment = { Id: string; TxnDate?: string; Line?: QboPaymentLine[] };

const q = (v: string) => v.replace(/'/g, "\\'");

export async function listCustomers(conn: QboConnection): Promise<QboCustomer[]> {
  const res = await qboQuery<{
    QueryResponse?: { Customer?: { Id: string; DisplayName: string; PrimaryEmailAddr?: { Address?: string } }[] };
  }>(conn, 'select Id, DisplayName, PrimaryEmailAddr from Customer where Active = true order by DisplayName maxresults 1000');
  return (res.QueryResponse?.Customer ?? []).map((c) => ({
    Id: c.Id,
    DisplayName: c.DisplayName,
    Email: c.PrimaryEmailAddr?.Address ?? null,
  }));
}

export async function getCustomer(conn: QboConnection, id: string): Promise<QboCustomer | null> {
  const res = await qboRequest<{ Customer?: { Id: string; DisplayName: string; PrimaryEmailAddr?: { Address?: string } } }>(
    conn,
    `/customer/${encodeURIComponent(id)}`
  );
  const c = res.Customer;
  return c ? { Id: c.Id, DisplayName: c.DisplayName, Email: c.PrimaryEmailAddr?.Address ?? null } : null;
}

export async function createCustomer(conn: QboConnection, name: string): Promise<QboCustomer> {
  const res = await qboRequest<{ Customer: { Id: string; DisplayName: string } }>(conn, '/customer', {
    method: 'POST',
    body: { DisplayName: name },
  });
  return { Id: res.Customer.Id, DisplayName: res.Customer.DisplayName, Email: null };
}

// Invoices need a product/service line. We use one service item for all progress billing.
export async function ensureBillingItem(conn: QboConnection): Promise<string> {
  const name = 'Construction progress billing';
  const found = await qboQuery<{ QueryResponse?: { Item?: { Id: string }[] } }>(
    conn,
    `select Id from Item where Name = '${q(name)}' maxresults 1`
  );
  const existing = found.QueryResponse?.Item?.[0];
  if (existing) return existing.Id;

  const acct = await qboQuery<{ QueryResponse?: { Account?: { Id: string }[] } }>(
    conn,
    "select Id from Account where AccountType = 'Income' and Active = true maxresults 1"
  );
  const income = acct.QueryResponse?.Account?.[0];
  if (!income) throw new Error('QuickBooks has no income account to bill against. Add one in QuickBooks first.');

  const created = await qboRequest<{ Item: { Id: string } }>(conn, '/item', {
    method: 'POST',
    body: { Name: name, Type: 'Service', IncomeAccountRef: { value: income.Id } },
  });
  return created.Item.Id;
}

export async function createInvoice(
  conn: QboConnection,
  args: { customerId: string; itemId: string; description: string; amount: number; dueDate: string | null; email: string | null; note: string }
): Promise<QboInvoice> {
  const amount = Math.round(args.amount * 100) / 100;
  const res = await qboRequest<{ Invoice: QboInvoice }>(conn, '/invoice', {
    method: 'POST',
    body: {
      CustomerRef: { value: args.customerId },
      ...(args.dueDate ? { DueDate: args.dueDate } : {}),
      ...(args.email ? { BillEmail: { Address: args.email } } : {}),
      PrivateNote: args.note,
      Line: [
        {
          Amount: amount,
          DetailType: 'SalesItemLineDetail',
          Description: args.description,
          SalesItemLineDetail: { ItemRef: { value: args.itemId }, Qty: 1, UnitPrice: amount },
        },
      ],
    },
  });
  return res.Invoice;
}

export async function emailInvoice(conn: QboConnection, invoiceId: string, to: string): Promise<void> {
  await qboRequest<unknown>(conn, `/invoice/${encodeURIComponent(invoiceId)}/send?sendTo=${encodeURIComponent(to)}`, {
    method: 'POST',
    contentType: 'application/octet-stream',
  });
}

export async function getInvoice(conn: QboConnection, invoiceId: string): Promise<QboInvoice> {
  const res = await qboRequest<{ Invoice: QboInvoice }>(conn, `/invoice/${encodeURIComponent(invoiceId)}`);
  return res.Invoice;
}

// Returns, per invoice id, the date of the latest payment recorded against it in QuickBooks.
export async function latestPaymentDates(conn: QboConnection, customerId: string): Promise<Map<string, string>> {
  const res = await qboQuery<{ QueryResponse?: { Payment?: QboPayment[] } }>(
    conn,
    `select Id, TxnDate, Line from Payment where CustomerRef = '${q(customerId)}' maxresults 1000`
  );
  const out = new Map<string, string>();
  for (const p of res.QueryResponse?.Payment ?? []) {
    for (const line of p.Line ?? []) {
      for (const t of line.LinkedTxn ?? []) {
        if (t.TxnType !== 'Invoice' || !p.TxnDate) continue;
        const prev = out.get(t.TxnId);
        if (!prev || p.TxnDate > prev) out.set(t.TxnId, p.TxnDate);
      }
    }
  }
  return out;
}
