import { qboQuery, qboRequest, type QboConnection } from '@/lib/qbo';

const q = (v: string) => v.replace(/'/g, "\\'");

export async function ensureVendor(conn: QboConnection, name: string): Promise<string> {
  const found = await qboQuery<{ QueryResponse?: { Vendor?: { Id: string }[] } }>(
    conn,
    `select Id from Vendor where DisplayName = '${q(name)}' maxresults 1`
  );
  const existing = found.QueryResponse?.Vendor?.[0];
  if (existing) return existing.Id;
  const created = await qboRequest<{ Vendor: { Id: string } }>(conn, '/vendor', { method: 'POST', body: { DisplayName: name } });
  return created.Vendor.Id;
}

// Picks the expense account a materials bill is booked to: a "job materials" or "cost of goods" style account when there is one.
export async function pickExpenseAccount(conn: QboConnection): Promise<string> {
  const res = await qboQuery<{ QueryResponse?: { Account?: { Id: string; Name: string; AccountType: string }[] } }>(
    conn,
    "select Id, Name, AccountType from Account where AccountType in ('Cost of Goods Sold','Expense') and Active = true maxresults 200"
  );
  const list = res.QueryResponse?.Account ?? [];
  if (list.length === 0) throw new Error('QuickBooks has no expense account to book the bill to. Add one in QuickBooks first.');
  const best =
    list.find((a) => /job materials|materials/i.test(a.Name)) ??
    list.find((a) => a.AccountType === 'Cost of Goods Sold') ??
    list.find((a) => /supplies|purchases/i.test(a.Name)) ??
    list[0];
  return best.Id;
}

export async function createBill(
  conn: QboConnection,
  args: {
    vendorId: string;
    accountId: string;
    txnDate: string;
    docNumber: string;
    amount: number;
    description: string;
    customerId: string | null;
    note: string;
  }
): Promise<string> {
  const amount = Math.round(args.amount * 100) / 100;
  const res = await qboRequest<{ Bill: { Id: string } }>(conn, '/bill', {
    method: 'POST',
    body: {
      VendorRef: { value: args.vendorId },
      TxnDate: args.txnDate,
      DocNumber: args.docNumber.slice(0, 21),
      PrivateNote: args.note,
      Line: [
        {
          DetailType: 'AccountBasedExpenseLineDetail',
          Amount: amount,
          Description: args.description.slice(0, 4000),
          AccountBasedExpenseLineDetail: {
            AccountRef: { value: args.accountId },
            ...(args.customerId ? { CustomerRef: { value: args.customerId }, BillableStatus: 'NotBillable' } : {}),
          },
        },
      ],
    },
  });
  return res.Bill.Id;
}
