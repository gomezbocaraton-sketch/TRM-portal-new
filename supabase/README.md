# Database notes

You do NOT need to run any SQL for this rebuild — your Supabase
database already has every table, column, and policy this code
expects, since none of today's contamination touched Supabase at
all (it's entirely a GitHub/Vercel code problem). This folder is
just kept for reference/history, in case you ever need to stand up
a second environment (staging, etc.) from scratch.

Your existing Supabase project's URL and anon key are exactly what
you'll reuse in the new Vercel project's environment variables.
