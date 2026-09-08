# TRM Partners Portal — Clean Rebuild

This is a completely fresh, clean copy of your admin portal, rebuilt
from scratch after the previous GitHub repository was found to be
contaminated with files from an unrelated project (Code Consultation
NYC). Every file here is verified TRM Partners code — nothing else.

## Your data is safe

Your Supabase database is completely separate from this codebase and
was never touched by the contamination. Every project, milestone,
payment, subcontractor, and uploaded file you've created is still
there. This rebuild only replaces the application code — you'll
reconnect it to your *existing* Supabase project using the same URL
and anon key you already have.

## Setup — new repo, new Vercel project, same database

1. Create a **brand new** GitHub repository (do not reuse the old
   contaminated one — starting clean is the whole point).
2. Upload every file and folder in this package to that new repo,
   preserving the folder structure exactly.
3. In Supabase, you don't need to run any SQL — your existing
   database already has everything this code needs.
4. Create a **brand new** Vercel project, importing this new repo.
5. Add two environment variables, using your *existing* Supabase
   project's values (Settings → API in Supabase):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
6. Deploy. Log in with your existing admin account — same email and
   password as before, since the Supabase Auth user was never
   affected by any of this either.

## What's included

All 11 admin tabs: Overview (with project snapshot), Milestones
(with to-dos and photos), Punch List, Financials (with payment proof
attachments), Profitability, Change Orders, Subcontractors (with
license/insurance tracking, expiry warnings, quotes, invoices, lien
waivers, and payment tracking), Documents (with Current/Superseded
versioning), Matterport, Daily Log, and RFIs.

Login, logout, and the shared save-confirmation/loading pattern
(`FormWithFeedback`) are also included and applied to every form
across every tab.

## What's NOT included (by design, not oversight)

Client logins, QuickBooks sync, real e-signing, Selections — all
deliberately deferred to a later phase, same as before. Nothing
about this rebuild changes that plan.
