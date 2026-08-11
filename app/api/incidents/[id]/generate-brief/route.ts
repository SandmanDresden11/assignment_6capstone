import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { anthropic, CLAUDE_MODEL } from '@/lib/anthropic';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';
// Explicit, higher-than-default execution time limit -- a slow Claude
// response can otherwise get cut off before it returns (per the Assignment
// 5B build instructions).
export const maxDuration = 60;

// POST /api/incidents/:id/generate-brief
//
// ON-DEMAND, AGENTIC step. Triggered by the "Generate Response Brief" button
// on the incident detail page (Screen 3). This is the judgment call the
// Assignment 5A design tagged "Agentic": Claude receives only the
// already-confirmed SDS and recorded scene facts. It cannot choose the SDS,
// authorize cleanup, verify completion, or close the incident -- it only
// drafts a brief that a named Safety user must explicitly approve or reject.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  const body = await req.json().catch(() => ({}));
  const { actor, actorRole } = body;

  const { data: incident, error: incErr } = await supabase.from('incidents').select('*').eq('id', id).single();
  if (incErr || !incident) return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
  if (!incident.selected_sds_id) {
    return NextResponse.json({ error: 'Confirm an SDS before generating a response brief.' }, { status: 400 });
  }

  const { data: sds } = await supabase.from('sds_records').select('*').eq('id', incident.selected_sds_id).single();

  const inputs = {
    location: incident.location,
    department: incident.department,
    product_name: incident.product_name,
    quantity: incident.quantity,
    container_condition: incident.container_condition,
    leak_source: incident.leak_source,
    continuing_leak: incident.continuing_leak,
    equipment_involved: incident.equipment_involved,
    equipment_name: incident.equipment_name,
    asset_id: incident.asset_id,
    scene_notes: incident.scene_notes,
    sds: sds
      ? {
          product_name: sds.product_name,
          manufacturer: sds.manufacturer,
          identifier: sds.identifier,
          notes: sds.notes,
          document_url: sds.document_url,
        }
      : null,
  };

  const prompt = `You are assisting a trained Safety responder handling a hazmat spill. You do NOT authorize cleanup, select the SDS, verify completion, or close the incident -- a human always does that. Using only the confirmed SDS and recorded scene facts below, produce a structured response brief.

Confirmed SDS:
${JSON.stringify(inputs.sds, null, 2)}

Scene facts:
${JSON.stringify(inputs, null, 2)}

Respond in exactly this format:
SUMMARY: <2-4 sentences summarizing the relevant hazard and handling guidance, citing the SDS by name>
MISSING FACTS: <bullet list of information that would improve the recommendation, or "None">
UNCERTAINTY: <1-2 sentences on what is uncertain and why>
PROPOSED ROUTE: <one of: Emergency Escalation, Safety-managed response, ABM request, RME request>
ROUTE RATIONALE: <1 sentence>`;

  let briefText = '';
  try {
    const msg = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }],
    });
    briefText = msg.content
      .map((c) => (c.type === 'text' ? c.text : ''))
      .join('\n')
      .trim();
  } catch (e: any) {
    return NextResponse.json({ error: `Claude call failed: ${e.message}` }, { status: 502 });
  }

  const proposedRouteMatch = briefText.match(/PROPOSED ROUTE:\s*(.+)/i);
  const proposedRoute = proposedRouteMatch ? proposedRouteMatch[1].trim() : 'Safety-managed response';
  const uncertaintyMatch = briefText.match(/UNCERTAINTY:\s*([\s\S]*?)(?:\n[A-Z ]+:|$)/i);
  const uncertainty = uncertaintyMatch ? uncertaintyMatch[1].trim() : '';

  const { data: run, error: runErr } = await supabase
    .from('ai_runs')
    .insert({
      incident_id: id,
      inputs,
      brief_text: briefText,
      sources: sds ? [{ type: 'sds', id: sds.id, name: sds.product_name, url: sds.document_url }] : [],
      uncertainty_notes: uncertainty,
      proposed_route: proposedRoute,
    })
    .select()
    .single();
  if (runErr) return NextResponse.json({ error: runErr.message }, { status: 500 });

  await logAudit(id, actor, actorRole, 'AI response brief generated (Draft)', { runId: run.id, proposedRoute });

  return NextResponse.json({ run });
}
