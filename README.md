# Hazmat Spill Tracker 2.0 — AI-Assisted Post-Spill Review and Corrective Action Management

**Assignment 6 Capstone.** This is a standalone application developed as an extension of the Assignment 5B Hazmat Spill Response Tracker. It was bootstrapped by copying that project's committed source as a starting point (Next.js app, Supabase schema, scheduled + on-demand Claude call pattern), then diverges into its own independent codebase, database, and deployment.

**This project does not depend on Assignment 5B at runtime, at build time, or at deploy time.** It has its own `package.json`, its own environment configuration, its own Supabase project (see Setup), and its own GitHub repository. Stopping, deleting, or modifying the Assignment 5B project has no effect on this one.

The original Assignment 5B build remains untouched at its own location and continues to run independently — see that project's own README for its scope (spill intake through closure). This document covers only the Assignment 6 capstone.

---

The paragraph below is inherited from the Assignment 5B README and describes the *inherited* baseline behavior before capstone-specific features are added on top. It will be revised as capstone features land.

## What the app does

Safety logs a spill (radio report), works it through SDS confirmation, an AI-assisted response brief, a cleanup assignment (Safety/ABM/RME), a verification checklist, and a Problem Solve handoff, then closes the incident once a completeness check passes. Every action is written to an append-only audit timeline. See `Assignment_5A.pdf` (the design doc this was built from) for the full current-state map, redesign table, and wireframes.

## Which piece is scheduled vs. on-demand

- **Scheduled**: `app/api/cron/overdue-check/route.ts`, triggered once a day by Vercel Cron (`vercel.json`). It checks every open incident against the four MVP thresholds from the 5A design (Safety ack within 10 min, ABM/RME ack within 10 min, no cleanup update for 30 min, Problem Solve receipt within 30 min), flags anything overdue, and writes a system audit event. It never closes an incident or changes the selected route.

  *Cadence note*: the 5A design specified a 10-minute check interval. Vercel's Hobby plan only supports daily cron triggers, so this runs once a day instead. The threshold **values** (10/10/30/30 minutes) are unchanged — they're evaluated against real timestamps regardless of how often the job runs. What changes is detection latency (up to 24h instead of up to 10 min). In a paid-tier or production deployment, this same route could run every few minutes.

- **On-demand**: `app/api/incidents/[id]/generate-brief/route.ts`, triggered by the "Generate Response Brief" button on an incident's detail page. **This is the agentic step.** It calls the Claude API with only the confirmed SDS and recorded scene facts and asks for a structured, source-linked brief: summary, missing facts, uncertainty, and a proposed route. Claude cannot select the SDS, authorize cleanup, verify completion, or close the incident — the result is saved as a Draft that a named Safety user must explicitly approve or reject (`approve-brief/route.ts`) before the incident can move to "Response Selected."

## Data model (Supabase / Postgres)

`supabase/schema.sql` creates six tables matching the 5A data list:

| Table | Purpose |
|---|---|
| `incidents` | One record per spill, report through closure |
| `sds_records` | Small seeded list of approved SDS references |
| `assignments` | Safety/ABM/RME task and status history |
| `handoffs` | Transfer to and receipt by Problem Solve |
| `ai_runs` | Claude inputs, generated brief, sources, reviewer decision |
| `audit_events` | Append-only history of user and system actions |

## MVP scope

Follows the Assignment 5A Step 6 scope table: simple role selector (Safety / ABM / RME / Problem Solve / Safety Lead) with no real authentication, one active assignment and one active Problem Solve handoff per incident, manual/deterministic SDS search (Claude-assisted candidate comparison is explicitly deferred to a future version), and required-field validation before closure. No email/SMS notifications, multi-site support, or live SDS/inventory integrations.

## Setup

See the step-by-step Supabase and Vercel instructions provided alongside this repo. Summary:

1. Create a Supabase project, run `supabase/schema.sql` in the SQL Editor.
2. `cp .env.example .env` and fill in `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY` (from platform.claude.com), and optionally `CRON_SECRET`.
3. `npm install`, then `npm run dev` to run locally.
4. Push to GitHub, import into Vercel, add the same three (or four) environment variables in the Vercel dashboard, deploy.
5. Test the on-demand button directly in the deployed app. Test the scheduled job by visiting `/api/cron/overdue-check` (append `?secret=...` if you set `CRON_SECRET`) directly in your browser.

## Security note

All Supabase access happens server-side through Next.js Route Handlers using the service role key — the browser never talks to Supabase directly, so no Supabase key is ever exposed to the client. No keys are hardcoded; everything comes from environment variables.
