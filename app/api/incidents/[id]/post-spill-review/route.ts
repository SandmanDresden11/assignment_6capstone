import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { anthropic, CLAUDE_MODEL, textFromMessage, parseJsonResponse } from '@/lib/anthropic';
import { logAudit } from '@/lib/audit';
import { computeDeterministicSignals } from '@/lib/postSpillSignals';

export const dynamic = 'force-dynamic';
// Two sequential Claude calls (drafting, then the bounded routing agent) --
// give this more headroom than the single-call generate-brief route.
export const maxDuration = 60;

async function loadReviewBundle(incidentId: string) {
  const { data: review } = await supabase.from('post_spill_reviews').select('*').eq('incident_id', incidentId).single();
  if (!review) return { review: null, gaps: [], themes: [], questions: [], suggestedActions: [] };

  const [{ data: gaps }, { data: themes }, { data: questions }, { data: suggestedActions }] = await Promise.all([
    supabase.from('documentation_gaps').select('*').eq('review_id', review.id).order('created_at'),
    supabase.from('followup_themes').select('*').eq('review_id', review.id).order('created_at'),
    supabase.from('followup_questions').select('*').eq('review_id', review.id).order('created_at'),
    supabase.from('ai_suggested_actions').select('*').eq('review_id', review.id).order('created_at'),
  ]);

  return { review, gaps: gaps || [], themes: themes || [], questions: questions || [], suggestedActions: suggestedActions || [] };
}

// GET /api/incidents/:id/post-spill-review -- fetch the existing review (or
// nulls if "Start Post-Spill Review" hasn't been clicked yet). Also returns
// the source incident and its corrective actions, since the review screen's
// top/left section displays the original spill record.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { id } = params;

  const [{ data: incident, error }, { data: sds }, { data: correctiveActions }, bundle] = await Promise.all([
    supabase.from('incidents').select('*').eq('id', id).single(),
    Promise.resolve({ data: null as any }),
    supabase.from('corrective_actions').select('*').eq('incident_id', id).order('created_at', { ascending: false }),
    loadReviewBundle(id),
  ]);
  if (error || !incident) return NextResponse.json({ error: 'Incident not found' }, { status: 404 });

  let confirmedSds = null;
  if (incident.selected_sds_id) {
    const { data } = await supabase.from('sds_records').select('*').eq('id', incident.selected_sds_id).single();
    confirmedSds = data;
  }

  return NextResponse.json({
    incident,
    sds: confirmedSds,
    correctiveActions: correctiveActions || [],
    ...bundle,
  });
}

const RECOMMENDED_STATES = [
  'DOCUMENTATION_INCOMPLETE',
  'CORRECTIVE_ACTION_REVIEW_NEEDED',
  'TREND_REVIEW_RECOMMENDED',
  'READY_FOR_WHS_SIGN_OFF',
];

// POST /api/incidents/:id/post-spill-review -- ON-DEMAND, AGENTIC.
// Triggered once, by "Start Post-Spill Review" on the incident detail page.
// Two distinct Claude calls:
//   1. Drafting: a summarizer/documentation-review assistant that produces
//      the incident summary, documentation gaps, follow-up themes,
//      follow-up questions, and suggested corrective actions -- grounded
//      only in the documented record and the deterministic signals below.
//   2. Post-Spill Review Routing Agent: the REQUIRED bounded agentic step
//      for this assignment. It reasons over the record + the review just
//      drafted + deterministic signals + a light trend scan of other
//      incidents, and picks exactly one of four bounded administrative
//      next-states. It cannot select an SDS, authorize cleanup, determine
//      root cause, or change the incident's status -- its output is purely
//      advisory and stored on the review row for a human to accept or
//      ignore.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  const body = await req.json().catch(() => ({}));
  const { actor, actorRole } = body;

  const { data: incident, error: incErr } = await supabase.from('incidents').select('*').eq('id', id).single();
  if (incErr || !incident) return NextResponse.json({ error: 'Incident not found' }, { status: 404 });

  const { data: existing } = await supabase.from('post_spill_reviews').select('id').eq('incident_id', id).maybeSingle();
  if (existing) {
    return NextResponse.json({ error: 'A post-spill review already exists for this incident.' }, { status: 409 });
  }

  const [{ data: sds }, { data: correctiveActions }, { data: handoffs }, { data: otherIncidents }] = await Promise.all([
    incident.selected_sds_id
      ? supabase.from('sds_records').select('*').eq('id', incident.selected_sds_id).single()
      : Promise.resolve({ data: null as any }),
    supabase.from('corrective_actions').select('*').eq('incident_id', id),
    supabase.from('handoffs').select('*').eq('incident_id', id).order('created_at', { ascending: false }).limit(1),
    supabase
      .from('incidents')
      .select('code, product_name, location, department, created_at')
      .neq('id', id)
      .order('created_at', { ascending: false })
      .limit(15),
  ]);
  const latestHandoff = handoffs?.[0] || null;
  const signals = computeDeterministicSignals(incident, correctiveActions || [], latestHandoff);

  const recordForPrompt = {
    code: incident.code,
    reported_at: incident.reported_at,
    status: incident.status,
    site: incident.site,
    department: incident.department,
    location: incident.location,
    radio_description: incident.radio_description,
    product_known: incident.product_known,
    product_name: incident.product_name,
    quantity: incident.quantity,
    container_condition: incident.container_condition,
    leak_source: incident.leak_source,
    continuing_leak: incident.continuing_leak,
    equipment_involved: incident.equipment_involved,
    scene_notes: incident.scene_notes,
    confirmed_sds: sds ? { product_name: sds.product_name, manufacturer: sds.manufacturer, notes: sds.notes } : null,
    final_route: incident.final_route,
    verification_status: incident.verification_status,
    remaining_restrictions: incident.remaining_restrictions,
    handoff_status: latestHandoff?.status || null,
    existing_corrective_actions: (correctiveActions || []).map((a) => ({
      description: a.description,
      owner: a.owner,
      due_date: a.due_date,
      status: a.status,
    })),
  };

  // -------- Call 1: drafting (summarizer / documentation reviewer) --------
  const draftPrompt = `You are assisting a Workplace Health & Safety (WHS) Specialist with a POST-SPILL documentation review, performed after the immediate response is already complete or sufficiently documented. This is NOT emergency response guidance -- do not give new response instructions, and do not repeat detailed emergency-response steps.

Using ONLY the documented facts below, produce a structured post-spill review. Never invent facts that are not present in the record. Where information needed to draw a conclusion is missing, say so explicitly rather than guessing.

SOURCE SPILL RECORD:
${JSON.stringify(recordForPrompt, null, 2)}

DETERMINISTIC COMPLETENESS SIGNALS (already computed by application code, not by you -- treat as ground truth):
${JSON.stringify(signals, null, 2)}

Respond with ONLY valid JSON matching exactly this shape -- no markdown fences, no commentary before or after:
{
  "summary": "2-5 sentences answering: what happened, where, what material, what response/containment is documented, current status, known follow-up info. Do not repeat emergency-response instructions.",
  "documentationGaps": [ { "description": "...", "reason": "why this matters for follow-up" } ],
  "followupThemes": [ { "theme": "...", "reason": "...", "evidence": "short quote or paraphrase from the record", "confidence": "Low" } ],
  "followupQuestions": ["...", "..."],
  "suggestedActions": [ { "suggestedAction": "...", "rationale": "..." } ]
}

Rules:
- documentationGaps: 0-6 items, only ones that make sense given the fields above (e.g. missing contributing factor, no corrective action identified, cleanup verification incomplete, handoff receipt missing, narrative too thin to support conclusions). Empty array if nothing is missing.
- followupThemes: 0-5 items, using only themes clearly grounded in the record (examples: Container Integrity, Storage Conditions, Material Handling, Housekeeping, Equipment Condition, Inspection Process, Training, Process Adherence, Secondary Containment, Repeated Occurrence). confidence must be exactly "Low", "Medium", or "High". These are POTENTIAL themes for review, never an established root cause -- do not phrase any of them as a determined cause.
- followupQuestions: 2-5 open investigative questions a WHS Specialist might consider. Do not phrase them so the answer is implied.
- suggestedActions: 0-4 items. Phrase each as a reviewable suggestion (e.g. "Review similar containers in the affected storage area"), never as something already done, decided, or authorized. Do not assign an owner, due date, status, or priority -- a human does that later.`;

  let draft: any;
  try {
    const msg = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2500,
      messages: [{ role: 'user', content: draftPrompt }],
    });
    draft = parseJsonResponse(textFromMessage(msg));
  } catch (e: any) {
    return NextResponse.json({ error: `Post-spill review drafting call failed: ${e.message}` }, { status: 502 });
  }

  const { data: review, error: reviewErr } = await supabase
    .from('post_spill_reviews')
    .insert({
      incident_id: id,
      review_status: 'AI Draft',
      ai_summary: draft.summary || '',
    })
    .select()
    .single();
  if (reviewErr) return NextResponse.json({ error: reviewErr.message }, { status: 500 });

  const gapsToInsert = (draft.documentationGaps || []).map((g: any) => ({
    review_id: review.id,
    description: g.description,
    reason: g.reason || null,
  }));
  const themesToInsert = (draft.followupThemes || []).map((t: any) => ({
    review_id: review.id,
    theme: t.theme,
    rationale: t.reason || t.rationale || null,
    evidence: t.evidence || null,
    confidence: ['Low', 'Medium', 'High'].includes(t.confidence) ? t.confidence : 'Low',
  }));
  const questionsToInsert = (draft.followupQuestions || []).map((q: string) => ({
    review_id: review.id,
    question_text: q,
  }));
  const suggestionsToInsert = (draft.suggestedActions || []).map((s: any) => ({
    review_id: review.id,
    suggested_action: s.suggestedAction,
    rationale: s.rationale || null,
  }));

  await Promise.all([
    gapsToInsert.length ? supabase.from('documentation_gaps').insert(gapsToInsert) : Promise.resolve(),
    themesToInsert.length ? supabase.from('followup_themes').insert(themesToInsert) : Promise.resolve(),
    questionsToInsert.length ? supabase.from('followup_questions').insert(questionsToInsert) : Promise.resolve(),
    suggestionsToInsert.length ? supabase.from('ai_suggested_actions').insert(suggestionsToInsert) : Promise.resolve(),
  ]);

  // -------- Call 2: Post-Spill Review Routing Agent (bounded agentic step) --------
  const trendContext = (otherIncidents || []).map((o) => ({
    code: o.code,
    product_name: o.product_name,
    location: o.location,
    department: o.department,
  }));

  const routingPrompt = `You are the Post-Spill Review Routing Agent for a WHS application. Your ONLY job is an administrative workflow judgment: which of four bounded next-states this post-spill review should move to. You are NOT deciding whether the spill response was correct, whether cleanup was adequate, whether an area is safe, whether PPE was correct, whether regulations were satisfied, whether the incident is OSHA recordable, whether environmental reporting is required, whether a root cause has been established, whether a corrective action is sufficient, or whether the spill can be officially closed. You never change the incident's status, close a corrective action, or make a regulatory determination -- your output is only a recommendation a human WHS Specialist can accept, edit, or ignore.

Choose exactly ONE state, using this priority order:
1. DOCUMENTATION_INCOMPLETE -- important information needed for meaningful follow-up appears missing.
2. CORRECTIVE_ACTION_REVIEW_NEEDED -- the record has enough information for follow-up, and one or more reasonable corrective-action opportunities were identified.
3. TREND_REVIEW_RECOMMENDED -- the record appears related to a recurring pattern across other available records. This is ONLY a recommendation to review; it never establishes a shared root cause.
4. READY_FOR_WHS_SIGN_OFF -- no material documentation gaps, no unresolved workflow issue, and the generated review is ready for human verification. This never means the spill itself is "safe," "compliant," or "closed" -- only that the AI-generated administrative review appears ready for human WHS review.

DOCUMENTED SPILL RECORD:
${JSON.stringify(recordForPrompt, null, 2)}

DETERMINISTIC SIGNALS (computed by application code):
${JSON.stringify(signals, null, 2)}

POST-SPILL REVIEW ALREADY DRAFTED (you are evaluating this, not writing it):
${JSON.stringify({ summary: draft.summary, documentationGaps: draft.documentationGaps, followupThemes: draft.followupThemes }, null, 2)}

OTHER RECENT INCIDENTS (product/location only, for trend comparison -- do not treat matches as proof of a shared cause):
${JSON.stringify(trendContext, null, 2)}

Respond with ONLY valid JSON matching exactly this shape:
{
  "recommendedState": "DOCUMENTATION_INCOMPLETE",
  "reason": "1-3 sentences",
  "evidence": ["short grounded evidence string", "..."],
  "recommendedNextStep": "1-2 sentences, phrased as a recommendation for the WHS Specialist, never as an instruction that already occurred",
  "limitations": "1 sentence on what this recommendation does NOT establish (e.g. does not determine root cause, does not certify the spill as closed)"
}
recommendedState must be exactly one of: DOCUMENTATION_INCOMPLETE, CORRECTIVE_ACTION_REVIEW_NEEDED, TREND_REVIEW_RECOMMENDED, READY_FOR_WHS_SIGN_OFF.

Each item in "evidence" must be a short, plain-English sentence fragment a WHS Specialist would actually read (e.g. "Scene notes were not recorded for this incident."). Never output a raw field name, key:value pair, or JSON-looking fragment (e.g. never write "leak_source: null" or "missingFields: ['scene_notes']") -- translate every signal into a readable sentence instead.`;

  let routing: any;
  try {
    const msg = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 900,
      messages: [{ role: 'user', content: routingPrompt }],
    });
    routing = parseJsonResponse(textFromMessage(msg));
  } catch (e: any) {
    // Drafting already succeeded and is saved; the routing recommendation is
    // advisory, so surface the failure but don't discard the review itself.
    await logAudit(id, actor, actorRole, 'Post-spill review drafted (routing agent failed)', { error: e.message });
    return NextResponse.json({ error: `Routing agent call failed: ${e.message}`, review }, { status: 502 });
  }

  const recommendedState = RECOMMENDED_STATES.includes(routing.recommendedState)
    ? routing.recommendedState
    : 'DOCUMENTATION_INCOMPLETE';

  const { data: updatedReview, error: updateErr } = await supabase
    .from('post_spill_reviews')
    .update({
      review_status: 'WHS Review Required',
      recommended_state: recommendedState,
      recommended_reason: routing.reason || null,
      recommended_evidence: routing.evidence || [],
      recommended_next_step: routing.recommendedNextStep || null,
      recommended_limitations: routing.limitations || null,
    })
    .eq('id', review.id)
    .select()
    .single();
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  await logAudit(id, actor, actorRole, 'Post-spill review generated (AI Draft)', {
    reviewId: review.id,
    recommendedState,
  });

  const bundle = await loadReviewBundle(id);
  return NextResponse.json(bundle);
}
