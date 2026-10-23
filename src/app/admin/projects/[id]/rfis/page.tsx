import { createClient } from '@/lib/supabase/server';
import { addRfi, answerRfi } from './actions';
import { FormWithFeedback } from '@/components/FormWithFeedback';

export default async function RfisTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = Number(id);
  const supabase = await createClient();
  const { data: rfis } = await supabase.from('rfis').select('*').eq('project_id', projectId).order('raised_date', { ascending: false });
  const addWithId = addRfi.bind(null, projectId);

  return (
    <div className="space-y-6">
      <div className="rounded-card border border-line bg-white p-4 sm:p-6">
        <p className="mb-4 text-sm font-semibold text-navy">New RFI</p>
        <FormWithFeedback action={addWithId} submitLabel="Submit RFI">
          <textarea name="question" rows={2} placeholder="Question" className="mb-3 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
          <input type="date" name="raisedDate" className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
        </FormWithFeedback>
      </div>
      <div className="space-y-3">
        {(rfis ?? []).map((rfi) => {
          const answerWithIds = answerRfi.bind(null, projectId, rfi.id);
          return (
            <div key={rfi.id} className="rounded-card border border-line bg-white p-5">
              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm text-navy">{rfi.question}</p>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${rfi.answer ? 'bg-success-tint text-success' : 'bg-accent-tint text-accent-deep'}`}>{rfi.answer ? 'Answered' : 'Open'}</span>
              </div>
              <p className="mb-2 text-xs text-ink-soft">Raised {rfi.raised_date}</p>
              {rfi.answer ? <div className="rounded-lg bg-paper p-3 text-xs text-ink">{rfi.answer}</div> : (
                <form action={answerWithIds} className="flex gap-2">
                  <input name="answer" placeholder="Type an answer" className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-xs" />
                  <button className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white">Send</button>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
