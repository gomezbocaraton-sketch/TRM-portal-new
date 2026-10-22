'use server';

import { revalidatePath } from 'next/cache';
import { getConnection, revokeAndClear } from '@/lib/qbo';

export async function disconnectQuickBooks(): Promise<void> {
  const conn = await getConnection();
  await revokeAndClear(conn);
  revalidatePath('/admin/quickbooks');
}
