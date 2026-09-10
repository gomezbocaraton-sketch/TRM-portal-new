import { createClient } from '@/lib/supabase/server';
import { updateProjectInfo, updateDocumentDates, uploadEstimateOrContract, uploadQuoteOrInvoice } from './actions';
import { FormWithFeedback } from '@/components/FormWithFeedback';
import { DropFileInput } from '@/components/DropFileInput';

export default async function OverviewTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = Number(id);
  const supabase = await createClient();

  const { data: project } = await supabase.from('projects').select('*').eq('id', projectId).single();
  if (!project) return null;

  const [
    { data: completionPct },
    { data: adjustedValue },
    { data: payments },
    { count: punchOpenCount },
    { count: rfisOpenCount },
    { count: cosPendingCount },
  ] = await Promise.all([
    supabase.rpc('project_completion_percent', { p_project_id: projectId }),
    supabase.rpc('project_adjusted_contract_value', { p_project_id: projectId }),
    supabase.from('payments').select('amount').eq('project_id', projectId),
    supabase.from('punch_list_items').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('status', 'open'),
    supabase.from('rfis').select('id', { count: 'exact', head: true }).eq('project_id', projectId).is('answer', null),
    supabase.from('change_orders').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('status', 'pending'),
  ]);

  const totalReceived = (payments ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
  const balanceDue = Number(adjustedValue ?? 0) - totalReceived;

  const updateInfoWithId = updateProjectInfo.bind(null, projectId);
  const updateDatesWithId = updateDocumentDates.bind(null, projectId);
  const uploadEstimate = uploadEstimateOrContract.bind(null, projectId, 'estimate');
  const uploadContract = uploadEstimateOrContract.bind(null, projectId, 'contract');
  const uploadQI = uploadQuoteOrInvoice.bind(null, projectId);

  const estimateUrl = project.estimate_file_key
    ? (await supabase.storage.from('project-files').createSignedUrl(project.estimate_file_key, 3600)).data?.signedUrl
    : null;
  const contractUrl = project.contract_file_key
    ? (await supabase.storage.from('project-files').createSignedUrl(project.contract_file_key, 3600)).data?.signedUrl
    : null;

  const { data: quotesInvoices } = await supabase
    .from('documents')
    .select('*')
    .eq('project_id', projectId)
    .eq('category', 'quotes_invoices')
    .order('uploaded_at', { ascending: false });
  const quotesInvoicesWithUrls = await Promise.all(
    (quotesInvoices ?? []).map(async (d) => {
      const { data } = await supabase.storage.from('project-files').createSignedUrl(d.storage_key, 3600);
      return { ...d, signedUrl: data?.signedUrl ?? null };
    })
  );

  return (
    <div className="space-y-6">
      <div className="rounded-card border border-line bg-white p-4 sm:p-6">
        <p className="mb-4 text-sm font-semibold text-navy">Project snapshot</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SnapshotStat label="Complete" value={`${completionPct ?? 0}%`} />
          <SnapshotStat label="Balance due" value={`$${Math.round(balanceDue).toLocaleString()}`} />
          <SnapshotStat label="Punch list open" value={String(punchOpenCount ?? 0)} />
          <SnapshotStat label="RFIs open" value={String(rfisOpenCount ?? 0)} />
        </div>
        {(cosPendingCount ?? 0) > 0 && (
          <p className="mt-3 text-xs font-semibold text-accent-deep">
            {cosPendingCount} change order{cosPendingCount !== 1 ? 's' : ''} awaiting approval
          </p>
        )}
      </div>

      <div className="rounded-card border border-line bg-white p-4 sm:p-6">
        <p className="mb-4 text-sm font-semibold text-navy">Client information</p>
        <FormWithFeedback action={updateInfoWithId} submitLabel="Save changes">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Client name" name="clientName" defaultValue={project.client_name} />
            <Field label="Entity name" name="entityName" defaultValue={project.client_entity_name} />
            <Field label="Address" name="address" defaultValue={project.address} full />
            <Field label="Phone" name="phone" defaultValue={project.client_phone} />
            <Field label="Email" name="email" defaultValue={project.client_email} />
            <Field label="Contract value ($)" name="contractValue" type="number" defaultValue={project.contract_value} />
          </div>
        </FormWithFeedback>
      </div>

      <div className="rounded-card border border-line bg-white p-4 sm:p-6">
        <p className="mb-4 text-sm font-semibold text-navy">Documents</p>

        <div className="mb-6 rounded-lg border border-line p-4">
          <p className="mb-3 text-sm font-medium text-navy">Key dates</p>
          <FormWithFeedback action={updateDatesWithId} submitLabel="Save dates">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Estimate sent" name="estimateSent" type="date" defaultValue={project.estimate_sent_date} />
              <Field label="Estimate accepted" name="estimateAccepted" type="date" defaultValue={project.estimate_accepted_date} />
              <Field label="Contract sent" name="contractSent" type="date" defaultValue={project.contract_sent_date} />
              <Field label="Contract signed" name="contractSigned" type="date" defaultValue={project.contract_signed_date} />
            </div>
          </FormWithFeedback>
        </div>

        <div className="mb-4 rounded-lg border border-line p-4">
          <p className="mb-2 text-sm font-medium text-navy">Estimate file</p>
          <FormWithFeedback action={uploadEstimate} submitLabel="Upload" pendingLabel="Uploading…" className="flex flex-wrap items-center gap-2">
            <DropFileInput name="file" compact />
            {estimateUrl && <a href={estimateUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-accent-deep underline">View file</a>}
          </FormWithFeedback>
        </div>

        <div className="mb-4 rounded-lg border border-line p-4">
          <p className="mb-2 text-sm font-medium text-navy">Quotes &amp; Invoices</p>
          {quotesInvoicesWithUrls.length > 0 && (
            <div className="mb-3 space-y-2">
              {quotesInvoicesWithUrls.map((d) => (
                <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-paper px-3 py-2">
                  <div>
                    <p className="text-xs font-semibold text-navy">{d.notes || d.file_name}</p>
                    <p className="text-xs text-ink-soft">{d.uploaded_at?.slice(0, 10)}</p>
                  </div>
                  {d.signedUrl && <a href={d.signedUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-accent-deep underline">View</a>}
                </div>
              ))}
            </div>
          )}
          <FormWithFeedback action={uploadQI} submitLabel="Add" pendingLabel="Uploading…" className="flex flex-wrap items-center gap-2">
            <input name="label" placeholder="e.g. Quote #2, Invoice — Jan draw" className="rounded-lg border border-line bg-paper px-2 py-1.5 text-xs" />
            <DropFileInput name="file" compact />
          </FormWithFeedback>
        </div>

        <div className="rounded-lg border border-line p-4">
          <p className="mb-2 text-sm font-medium text-navy">Contract file</p>
          <FormWithFeedback action={uploadContract} submitLabel="Upload" pendingLabel="Uploading…" className="flex flex-wrap items-center gap-2">
            <DropFileInput name="file" compact />
            {contractUrl && <a href={contractUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-accent-deep underline">View file</a>}
          </FormWithFeedback>
        </div>
      </div>
    </div>
  );
}

function SnapshotStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-paper p-3">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className="text-lg font-medium text-navy">{value}</p>
    </div>
  );
}

function Field({ label, name, type = 'text', defaultValue, full = false }: { label: string; name: string; type?: string; defaultValue?: string | number | null; full?: boolean }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <label className="mb-1 block text-xs font-medium text-ink-soft">{label}</label>
      <input name={name} type={type} defaultValue={defaultValue ?? ''} className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
    </div>
  );
}
