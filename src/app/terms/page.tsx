export const metadata = { title: 'Terms of Use - TRM Partners Portal' };

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-sm leading-relaxed text-ink sm:px-8">
      <h1 className="mb-2 text-2xl font-medium text-navy">Terms of Use</h1>
      <p className="mb-6 text-ink-soft">TRM Partners Portal, operated by TRM Partners LLC. Last updated October 22, 2026.</p>

      <h2 className="mb-1 mt-6 font-semibold text-navy">Who may use the portal</h2>
      <p>
        The portal is a private tool for TRM Partners LLC and the people it authorizes. Access is by invitation only.
        You may use it only for TRM Partners business and only with the access you were given.
      </p>

      <h2 className="mb-1 mt-6 font-semibold text-navy">QuickBooks Online</h2>
      <p>
        The portal connects to QuickBooks Online only after an authorized administrator approves it. The portal acts
        with the permissions of that administrator and is limited to accounting data. You are responsible for
        reviewing invoices and records before relying on them. The connection can be removed at any time from the
        QuickBooks page in the portal or from your QuickBooks account.
      </p>

      <h2 className="mb-1 mt-6 font-semibold text-navy">Your responsibilities</h2>
      <p>
        Keep your login private, enter accurate information, and do not attempt to access data you are not authorized
        to see.
      </p>

      <h2 className="mb-1 mt-6 font-semibold text-navy">No warranty</h2>
      <p>
        The portal is provided as is for internal business use. We work to keep it accurate and available, but we
        do not promise that it will be uninterrupted or error free, and its figures should be checked against your
        accounting records.
      </p>

      <h2 className="mb-1 mt-6 font-semibold text-navy">Privacy</h2>
      <p>
        How we handle information is described in our <a href="/privacy" className="underline">Privacy Policy</a>.
      </p>

      <h2 className="mb-1 mt-6 font-semibold text-navy">Contact</h2>
      <p>TRM Partners LLC, Florida. Email: gomezbocaraton@gmail.com</p>
    </main>
  );
}
