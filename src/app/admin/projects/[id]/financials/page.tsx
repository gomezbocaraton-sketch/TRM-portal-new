import { createClient } from '@/lib/supabase/server';
import { recordPayment, addScheduleItem } from './actions';
import { FormWithFeedback } from '@/components/FormWithFeedback';

export default async function FinancialsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = Number(id);
  const supabase = await createClient();

  const [{ data: adjustedValue }, { data: payments }, { data: schedule }] = await Promise.all([
    supabase.rpc('project_adjusted_contract_value', { p_project_id: projectId }),
    supabase.from('payments').select('*').eq('project_id', projectId).order('payment_date', { ascending: false }),
    supabase.from('payment_schedule').select('*').eq('project_id', projectId).order('due_date'),
  ]);

  const contractValue = Number(adjustedValue ?? 0);
  const totalReceived = (payments ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
  const balanceDue = contractValue - totalReceived;

  const paymentsWithUrls = await Promise.all((payments ?? []).map(async (p) => {
    if (!p.proof_file_key) return { ...p, proofUrl: null };
    const { data } = await supabase.storage.from('project-files').createSignedUrl(p.proof_file_key, 3600);
    return { ...p, proofUrl: data?.signedUrl ?? null };
  }));

  const recordWithId = recordPayment.bind(null, projectId);
  const scheduleWithId = addScheduleItem.bind(null, projectId);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard label="Contract value" value={contractValue} />
        <SummaryCard label="Total received" value={totalReceived} tone="success" />
        <SummaryCard label="Balance due" value={balanceDue} tone="accent" />
      </div>

      <div className="rounded-card border border-line bg-white p-4 sm:p-6">
        <p className="mb-4 text-sm font-semibold text-navy">Record payment</p>
        <FormWithFeedback action={recordWithId} submitLabel="Record payment">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <input type="number" name="amount" placeholder="Amount ($)" className="rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
            <input type="date" name="paymentDate" className="rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
            <input name="method" placeholder="Method" className="rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
            <input name="reference" placeholder="Reference" className="rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
            <input type="file" name="proofFile" className="sm:col-span-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
          </div>
        </FormWithFeedback>
      </div>

      <div className="rounded-card border border-line bg-white p-4 sm:p-6">
        <p className="mb-4 text-sm font-semibold text-navy">Payment history</p>
        <div className="space-y-2">
          {paymentsWithUrls.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 text-sm last:border-0">
              <span className="text-ink-soft">{p.payment_date} &middot; {p.method}</span>
              <div className="flex items-center gap-3">
                {p.proofUrl && <a href={p.proofUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-accent-deep underline">View proof</a>}
                <span className="font-semibold text-success">${Number(p.amount).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-card border border-line bg-white p-4 sm:p-6">
        <p className="mb-4 text-sm font-semibold text-navy">Add scheduled payment</p>
        <FormWithFeedback action={scheduleWithId} submitLabel="Add to schedule">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <input name="description" placeholder="Description" className="rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
            <input type="number" name="amount" placeholder="Amount" className="rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
            <input type="date" name="dueDate" className="rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
          </div>
        </FormWithFeedback>
      </div>

      <div className="rounded-card border border-line bg-white p-4 sm:p-6">
        <p className="mb-4 text-sm font-semibold text-navy">Payment schedule</p>
        <div className="space-y-2">
          {(schedule ?? []).map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 text-sm last:border-0">
              <span className="text-ink-soft">{s.due_date} &middot; {s.description}</span>
              <div className="flex items-center gap-3">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${s.status === 'paid' ? 'bg-success-tint text-success' : 'bg-accent-tint text-accent-deep'}`}>{s.status}</span>
                <span className="font-semibold text-navy">${Number(s.amount).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone?: 'success' | 'accent' }) {
  const color = tone === 'success' ? 'text-success' : tone === 'accent' ? 'text-accent-deep' : 'text-navy';
  return (
    <div className="rounded-card border border-line bg-white p-5">
      <p className="mb-1 text-xs text-ink-soft">{label}</p>
      <p className={`text-2xl font-medium ${color}`}>${value.toLocaleString()}</p>
    </div>
  );
}
