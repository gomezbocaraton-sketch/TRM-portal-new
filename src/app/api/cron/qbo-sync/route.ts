import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getConnectionAsService } from '@/lib/qbo';
import { syncProject } from '@/lib/qbo-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Runs once a day (see vercel.json). Vercel sends "Authorization: Bearer <CRON_SECRET>" with every scheduled call.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const started = new Date().toISOString();
  try {
    const conn = await getConnectionAsService();
    if (!conn) {
      console.log(JSON.stringify({ source: 'qbo-daily-sync', result: 'skipped', reason: 'QuickBooks not connected', at: started }));
      return NextResponse.json({ result: 'skipped', reason: 'not connected' });
    }

    const admin = createAdminClient();
    // Only projects that still have an invoice with money owed need checking.
    const { data: open, error } = await admin.from('schedule_qbo').select('project_id').gt('balance', 0);
    if (error) throw new Error(error.message);
    const projectIds = Array.from(new Set((open ?? []).map((r) => Number(r.project_id))));

    let synced = 0;
    const failed: { project: number; error: string }[] = [];
    for (const id of projectIds) {
      try {
        const r = await syncProject(admin, conn, id);
        if (r === 'ok') synced++;
      } catch (e) {
        failed.push({ project: id, error: e instanceof Error ? e.message : 'unknown error' });
      }
    }

    const summary = { source: 'qbo-daily-sync', result: failed.length ? 'partial' : 'ok', projects_checked: projectIds.length, synced, failed, at: started };
    if (failed.length) console.error(JSON.stringify(summary));
    else console.log(JSON.stringify(summary));
    return NextResponse.json(summary, { status: failed.length ? 207 : 200 });
  } catch (e) {
    const detail = e instanceof Error ? e.message : 'unknown error';
    console.error(JSON.stringify({ source: 'qbo-daily-sync', result: 'error', detail, at: started }));
    return NextResponse.json({ result: 'error', detail }, { status: 500 });
  }
}
