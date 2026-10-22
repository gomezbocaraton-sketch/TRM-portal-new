export const metadata = { title: 'Privacy Policy - TRM Partners Portal' };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-sm leading-relaxed text-ink sm:px-8">
      <h1 className="mb-2 text-2xl font-medium text-navy">Privacy Policy</h1>
      <p className="mb-6 text-ink-soft">TRM Partners Portal, operated by TRM Partners LLC. Last updated October 22, 2026.</p>

      <h2 className="mb-1 mt-6 font-semibold text-navy">Who we are</h2>
      <p>
        The TRM Partners Portal is a private business tool used by TRM Partners LLC, a construction company based in
        Florida, to manage its projects, costs, invoices and employee time. It is used only by TRM Partners staff and
        is not offered to the public.
      </p>

      <h2 className="mb-1 mt-6 font-semibold text-navy">QuickBooks Online connection</h2>
      <p>
        When an authorized TRM Partners administrator connects the portal to QuickBooks Online, the portal can read
        and create accounting records in that company file: customers, invoices, payments and expenses. We use this
        only to send invoices, show whether they have been paid, and show project costs. We do not sell, rent or share
        this data with anyone.
      </p>
      <p className="mt-2">
        We store the access keys QuickBooks gives us (tokens) in our private database. They are not visible to the
        public and are used only by the portal. We never see or store your QuickBooks or bank login or password. Bank
        credentials stay with Intuit and your bank.
      </p>

      <h2 className="mb-1 mt-6 font-semibold text-navy">Other information we keep</h2>
      <p>
        The portal stores project records, costs, receipts and documents uploaded by staff, and, for the time clock,
        employee names, phone numbers and clock in/out locations. This information is used only to run the business
        and is available only to authorized staff.
      </p>

      <h2 className="mb-1 mt-6 font-semibold text-navy">Security</h2>
      <p>
        Data is stored with Supabase and the website is hosted on Vercel, both over encrypted connections. Access
        requires a login, and database access rules limit data to authorized users.
      </p>

      <h2 className="mb-1 mt-6 font-semibold text-navy">Disconnecting and deleting</h2>
      <p>
        An administrator can disconnect QuickBooks at any time from the QuickBooks page in the portal. This revokes
        the access keys and removes our stored copy. You can also remove the connection from your QuickBooks account
        under the connected apps settings. To ask us to delete other stored information, contact us below.
      </p>

      <h2 className="mb-1 mt-6 font-semibold text-navy">Contact</h2>
      <p>TRM Partners LLC, Florida. Email: gomezbocaraton@gmail.com</p>
    </main>
  );
}
