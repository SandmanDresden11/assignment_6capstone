# Capstone Deliverable and Governance Plan

**Deliverable:** Post-Spill Review and Corrective Action Management, a new feature added to the Hazmat Spill Response Tracker (Module 5 app)
**Live URL:** https://assignment-6capstone.vercel.app/
**Repo:** https://github.com/SandmanDresden11/assignment_6capstone

---

## Part 1: What I Built

### The deliverable

The Module 5 app (Hazmat Spill Response Tracker) covers a spill from radio report through response and closure. It had no mechanism for what happens *after* closure: nobody reviewed the documentation quality, nobody was prompted to notice a recurring pattern, and nothing routed a closed-out record toward a follow-up action. This capstone adds that missing piece: a **Post-Spill Review** workflow that a WHS Specialist runs against a documented incident, plus a **Corrective Actions** register that tracks follow-up work to completion.

Concretely, this added:
- A new screen per incident showing the source spill record alongside an AI-drafted post-event summary, a list of documentation gaps, potential follow-up themes, follow-up questions, and suggested corrective actions.
- A bounded **Post-Spill Review Routing Agent** — the real judgment call in this deliverable — that recommends one of four next steps (Documentation Incomplete / Corrective Action Review Needed / Trend Review Recommended / Ready for WHS Sign-Off).
- A queue page listing every incident's review status, and a Corrective Actions page tracking owner, due date, and status through to completion.
- Six new database tables, none of which write back to the original incident record.

I deliberately built this as a **separate standalone project** (its own repo, database, and deployment) rather than editing the Module 5 app in place, at the assignment's own request — the Module 5 app remains untouched and independently functional at its original URL, and this capstone imports and extends its source rather than depending on it at runtime.

### How I built it

I used **Claude Code** for the entire build, across many distinct steps rather than a single prompt: designing the six-table schema, writing eight new API routes, building three new pages, and — critically — the prompt engineering for the two Claude calls inside the app itself (the drafting call and the routing agent). This wasn't a one-shot generation. Testing surfaced several real problems that took real debugging, not just code generation:

- A JSON-truncation bug: the drafting call's first token budget (1,400) wasn't enough for a full five-section response and cut off mid-JSON. Found by actually running the flow, not by inspection.
- A Postgres permission error in production (`permission denied for table incidents`) that turned out to be a missing grant on the fresh Supabase project, unrelated to application code.
- A cosmetic-but-real quality problem: the routing agent's "evidence" field was echoing raw internal field names (`leak_source: null`) instead of writing sentences a WHS Specialist could actually read. Caught by reading the actual live output, not by assuming the prompt worked.

Each of these required looking at real output, diagnosing what actually went wrong, and revising — the kind of visible, iterative AI involvement this assignment is asking for, not a single prompt lightly edited.

---

## Part 2: Governance Plan

### Risk categories that apply here

**Hallucination — live risk, the primary one.** Both Claude calls generate free-text content (a summary, gap descriptions, theme evidence, suggested actions) grounded in a structured record. Nothing stops the model from asserting something not actually in the record — the prompts instruct it not to, but an instruction is not a guarantee. This is the risk this deliverable is most exposed to, and it's the reason nothing the AI writes is allowed to become authoritative without a human reading it against the source record first.

**Accountability — live risk.** The failure mode here isn't the AI acting wrongly; it's a human treating AI output as more settled than it is. If a WHS Specialist checks the sign-off box without actually comparing the review to the record, the human accountability the design assumes doesn't exist in practice. The design forces a checkpoint; it can't force someone to take it seriously.

**Privacy — partially live, worth naming honestly.** The drafting prompt sends the incident's operational fields (location, product, scene notes, SDS details) plus any existing corrective actions, and a corrective action's `owner` field can contain a real person's name. That name flows to the Anthropic API as part of the prompt payload. It's a narrow exposure — no broader personnel data, medical information, or contact details are included — but it isn't zero, and it should be disclosed rather than assumed away.

**Bias — not a significant live risk for this deliverable, and here's why:** no demographic or protected-class data enters either prompt at all; the record is entirely operational (location, product, container condition, timestamps). The closest analog isn't classic bias but an uneven-documentation effect — a department that writes thinner scene notes could get flagged "Documentation Incomplete" more often than one that writes thorough notes, for reasons that have nothing to do with actual safety performance. That's a monitoring consideration, not a bias risk in the sense Reading 1 describes, so I'm setting it aside as a primary category while flagging it as worth watching.

**Regulation — deliberately designed out of scope, not eliminated.** This domain is regulation-adjacent (OSHA recordability, environmental reporting), so it would be easy for an agent to drift into making those calls. I explicitly excluded them: the routing agent's prompt lists "whether the incident is OSHA recordable" and "whether environmental reporting is required" as questions it is *not* answering, and its four permitted outputs are all administrative-workflow states, never compliance determinations. The residual risk is downstream — a human could still misuse a "Ready for WHS Sign-Off" recommendation as if it were a compliance clearance — which is why the UI states explicitly, every time that recommendation appears, that it does not mean the spill is "safe," "compliant," or "closed."

### Autonomy limits

**What the AI can do on its own:** draft the incident summary; propose documentation gaps, follow-up themes (with a Low/Medium/High confidence label), and follow-up questions; propose corrective actions as suggestions; and pick one of exactly four bounded administrative states as a recommendation.

**What stays with a human, enforced in code, not just policy:**
- The AI cannot select or confirm an SDS, authorize cleanup, verify completion, or change an incident's status — those routes are untouched by anything this capstone added.
- The AI cannot resolve or dismiss a documentation gap, or accept/dismiss a follow-up theme — both require an explicit `PATCH` from a logged-in role, never happen automatically.
- The AI cannot assign an owner, due date, priority, or final status to a corrective action. Accepting a suggestion creates a row with `status: 'Draft'`, `owner: null`, `due_date: null` — a human has to fill those in separately on the Corrective Actions page before it's real.
- The AI cannot approve its own output. The `approve` endpoint hard-rejects the request (`400`) unless the client sends `confirmed: true`, which the UI only sends after a WHS user has checked an explicit attestation box.
- The AI never writes to the `incidents` table or any of its children — every new table exists so AI-generated content is structurally incapable of overwriting the original record.

### Sign-off point

The **WHS Specialist currently acting in the app** — tracked via the role selector (this MVP has no real authentication, consistent with the Module 5 scope decision, but every action is stamped with a name and role) — is the sign-off for two distinct things:

1. **Each individual AI output**, one at a time: every documentation gap, theme, and suggested action requires its own explicit Resolve/Dismiss, Accept/Dismiss, or Accept/Edit/Reject action before it does anything.
2. **The review as a whole**, at the end: the named WHS Specialist must check "I have compared this AI-generated review with the source spill record and reviewed the information for accuracy" and click Approve WHS Review. That name and timestamp are recorded on the review row (`reviewer`, `reviewed_at`) and in the append-only audit log.

Neither sign-off touches the original incident record — approving a post-spill review changes only that review's own status.

### If it fails

**Realistic failure mode:** the deterministic signals that bias the routing agent only check a handful of specific fields (scene notes, final route, product name, container condition, verification status, handoff receipt). A real gap that isn't one of those — a narrative inconsistency, a scene description that doesn't match the selected SDS — depends entirely on the model actually noticing it in an unstructured summary. If it misses one, nothing forces a second check, and the agent could recommend "Ready for WHS Sign-Off" on a record that isn't actually ready. A rushed reviewer, primed by a confident "Ready" recommendation, is exactly the person likely to under-scrutinize it — automation bias compounding the original miss.

**What I'd do about it:** two things, both already partly supported by what's built. First, every AI run and every human decision is already in the append-only audit log — that makes a periodic sample audit (a second WHS Specialist spot-checking a percentage of "WHS Reviewed" records against their source incidents) cheap to run without new engineering. Second, each miss found that way becomes a new deterministic check — the same pattern I used this session, where a real bug (truncation, permission error, raw-signal phrasing) became a specific code fix rather than a note to "be more careful."

**Is it reversible?** Largely yes, and by design. Approving a review never closes the incident, never finalizes a corrective action, and never rewrites the source record — so a missed gap can still be caught and acted on afterward; nothing is deleted or locked. The honest caveat is that it isn't cost-free: the damage from a missed gap isn't data loss, it's *time* — a real follow-up action that should have happened sooner. The system stays correctable, but "correctable" and "no harm done" aren't the same thing, and that gap is exactly what the audit-sample habit above is meant to close.

---

## Video (to record separately)

Not something I can produce, but a tight outline for the under-2-minute walkthrough, in the order the rubric wants it:

1. **(~20s)** Show the live app: an incident, then click into Post-Spill Review — point at the AI summary and one documentation gap.
2. **(~30s)** Show the AI Recommended Next Step banner — read its stated state and reason out loud, then click through Accept on a suggested action to show it landing as a Draft with no owner/due date.
3. **(~30s)** Check the WHS Sign-Off box, click Approve, and say out loud what that button does and doesn't do (approves the review, never the incident).
4. **(~20s)** State, directly to camera: the one live risk (hallucination), the one thing the AI can never do (close an incident or assign a corrective action owner), and who signs off (the named WHS Specialist).
