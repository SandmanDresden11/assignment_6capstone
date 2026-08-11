# Hazmat Spill Tracker 2.0 — AI-Assisted Post-Spill Review and Corrective Action Management

**Assignment 6 Capstone.** This is a standalone application developed as an extension of the Assignment 5B Hazmat Spill Response Tracker. It was bootstrapped by copying that project's committed source as a starting point (Next.js app, Supabase schema, scheduled + on-demand Claude call pattern), then diverges into its own independent codebase, database, and deployment.

**This project does not depend on Assignment 5B at runtime, at build time, or at deploy time.** It has its own `package.json`, its own environment configuration, its own Supabase project (see Setup), and its own GitHub repository. Stopping, deleting, or modifying the Assignment 5B project has no effect on this one.

The original Assignment 5B build remains untouched at its own location and continues to run independently. This document covers the full capstone: the inherited spill-tracking baseline plus the new post-spill review workflow.

## Inherited baseline (from Assignment 5B, unchanged)

Safety logs a spill (radio report), works it through SDS confirmation, an AI-assisted response brief, a cleanup assignment (Safety/ABM/RME), a verification checklist, and a Problem Solve handoff, then closes the incident once a completeness check passes. Every action is written to an append-only audit timeline.

- **Scheduled**: `app/api/cron/overdue-check/route.ts`, run once a day by Vercel Cron. Flags open incidents that have crossed the 10/10/30/30-minute response thresholds; never closes an incident or changes its route.
- **On-demand / agentic (inherited)**: `app/api/incidents/[id]/generate-brief/route.ts` — "Generate Response Brief." Calls Claude with only the confirmed SDS and recorded scene facts to draft a response brief. Claude cannot select the SDS, authorize cleanup, or close the incident; a named Safety user must explicitly approve or reject it.

## New in Assignment 6: Post-Spill Review and Corrective Action Management

This is a distinct, **post-event** workflow layered on top of the baseline above — it runs after the immediate response is complete or sufficiently documented, and it never rewrites the original incident record.

**Entry point**: on an incident's detail page, a new "Post-Spill Review" section sits below (and separate from) "Generate Response Brief," with a **Start Post-Spill Review** / **View Post-Spill Review** button.

**`app/incidents/[id]/post-spill-review/page.tsx`** shows the source spill record alongside the AI-assisted review:

- **AI-Generated Incident Summary** — what happened, where, what material, documented response/containment, current status. Never repeats emergency-response instructions.
- **Documentation Gaps** — things that appear missing for meaningful follow-up (e.g. no contributing factor documented, no corrective action owner). Each can be **Resolved** or **Dismissed** by a WHS user; the AI flags, the human decides.
- **Potential Follow-Up Themes** — never labeled "root cause." Each shows theme / reason / evidence from the record / confidence (Low-Medium-High), and can be accepted or dismissed.
- **Follow-Up Questions** — 2-5 open investigative questions, phrased so the answer isn't implied.
- **AI-Suggested Corrective Actions** — each explicitly labeled "AI-Suggested Corrective Action," with Accept / Edit / Reject. Accepting (or editing then accepting) creates a **Draft** row in `corrective_actions` with no owner or due date — the AI never assigns those. A WHS user fills them in afterward on the Corrective Actions page.
- **AI Recommended Next Step** — the bounded routing agent's output (see below), clearly advisory.
- **WHS Sign-Off** — requires an explicit checkbox ("I have compared this AI-generated review with the source spill record...") before **Approve WHS Review** is enabled. Approval applies to the *review*, not the original incident record.

**`app/post-spill-reviews/page.tsx`** — a queue/dashboard of every incident with its review status, open documentation gap count, and open corrective action count, filterable by Needs Review / AI Draft / WHS Reviewed / Has Open Corrective Actions.

**`app/corrective-actions/page.tsx`** — cross-incident list of every corrective action (draft or official) with inline-editable owner, due date, status, and priority. Days-open, overdue, and due-soon are computed with plain deterministic code (`lib/postSpillSignals.ts`), never by AI.

### The bounded agentic step (new, required capstone feature)

**Post-Spill Review Routing Agent**, called from `app/api/incidents/[id]/post-spill-review/route.ts`. This is a second, separate Claude call from the drafting call above, and it is deliberately **not** a safety judgment. Its only question:

> Given the documented spill record and the AI-assisted review already drafted, which bounded administrative follow-up path should the WHS Specialist address next?

It selects exactly one of four states, in priority order:

1. **Documentation Incomplete** — important follow-up information appears missing.
2. **Corrective Action Review Needed** — the record supports follow-up and reasonable corrective-action opportunities exist.
3. **Trend Review Recommended** — the record resembles a pattern in other recent incidents (a recommendation to look, never a claim of shared root cause).
4. **Ready for WHS Sign-Off** — no material gaps; the *review* (not the incident) is ready for human verification.

It cannot select an SDS, authorize cleanup, verify completion, determine root cause, or change the incident's status or the underlying spill record — the recommendation is purely advisory, stored on the review row, and a human can accept, ignore, or override it. The priority order is biased by deterministic signals computed in code (missing fields, open/overdue corrective actions, unresolved verification/handoff) before Claude ever reasons over narrative completeness or thematic patterns — see Section 11 of the capstone spec this was built from.

## Data model (Supabase / Postgres)

`supabase/schema.sql` creates the six inherited Assignment 5B tables (`incidents`, `sds_records`, `assignments`, `handoffs`, `ai_runs`, `audit_events`) plus six new Assignment 6 tables. Nothing in the new tables ever writes back to `incidents` or its children — AI-generated conclusions live only here:

| Table | Purpose |
|---|---|
| `post_spill_reviews` | One per incident; review status, AI summary, and the routing agent's recommendation |
| `documentation_gaps` | AI-flagged, human-resolved/dismissed completeness gaps |
| `followup_themes` | Potential follow-up themes with confidence, never a root-cause claim |
| `followup_questions` | AI-generated investigative questions |
| `ai_suggested_actions` | Suggested corrective actions with Accept/Edit/Reject status |
| `corrective_actions` | Draft-through-Complete corrective actions; `originated_from_ai` flags AI-sourced ones |

## Setup

This project needs **its own Supabase project**, separate from Assignment 5B's, so the two apps never read or write the same data.

1. Create a **new** Supabase project (do not reuse the Assignment 5B one). Run `supabase/schema.sql` in its SQL Editor — this creates all twelve tables in one pass.
2. `cp .env.example .env` and fill in `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY` (from platform.claude.com), and optionally `CRON_SECRET`. These can reuse the same Anthropic key as Assignment 5B (it's just billing, not shared state) but must point at this project's own Supabase instance.
3. `npm install`, then `npm run dev` to run locally.
4. Push to a **new** GitHub repository, import into a **new** Vercel project, add the same environment variables, deploy.
5. Test: create an incident, confirm an SDS, generate a response brief (inherited feature), then click **Start Post-Spill Review** and walk through gaps/themes/suggested actions/sign-off. Test the scheduled job by visiting `/api/cron/overdue-check` directly.

## Security note

All Supabase access happens server-side through Next.js Route Handlers using the service role key — the browser never talks to Supabase directly. No keys are hardcoded; everything comes from environment variables.
