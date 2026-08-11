import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// PATCH /api/incidents/:id/post-spill-review/suggested-actions/:suggestionId
// -- WHS user accepts, edits, or rejects an AI-suggested corrective action.
// Accept/Edit create a "Draft" row in corrective_actions with no owner or
// due date yet -- the AI never assigns those; a human fills them in
// afterward in the Corrective Actions view. Reject creates nothing.
export async function PATCH(req: Request, { params }: { params: { id: string; suggestionId: string } }) {
  const { id, suggestionId } = params;
  const body = await req.json();
  const { actor, actorRole, decision, editedText } = body;

  if (!['accept', 'edit', 'reject'].includes(decision)) {
    return NextResponse.json({ error: 'decision must be accept, edit, or reject' }, { status: 400 });
  }

  const { data: suggestion, error: fetchErr } = await supabase
    .from('ai_suggested_actions')
    .select('*')
    .eq('id', suggestionId)
    .single();
  if (fetchErr || !suggestion) return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 });

  if (decision === 'edit' && !editedText) {
    return NextResponse.json({ error: 'editedText is required when decision is edit' }, { status: 400 });
  }

  const newStatus = decision === 'accept' ? 'Accepted' : decision === 'edit' ? 'Edited' : 'Rejected';
  const { data: updatedSuggestion, error: updateErr } = await supabase
    .from('ai_suggested_actions')
    .update({ status: newStatus })
    .eq('id', suggestionId)
    .select()
    .single();
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  let correctiveAction = null;
  if (decision !== 'reject') {
    const { data: created, error: caErr } = await supabase
      .from('corrective_actions')
      .insert({
        originating_suggestion_id: suggestionId,
        incident_id: id,
        description: decision === 'edit' ? editedText : suggestion.suggested_action,
        status: 'Draft',
        originated_from_ai: true,
      })
      .select()
      .single();
    if (caErr) return NextResponse.json({ error: caErr.message }, { status: 500 });
    correctiveAction = created;
  }

  await logAudit(id, actor, actorRole, `AI-suggested corrective action ${decision}ed`, {
    suggestionId,
    correctiveActionId: correctiveAction?.id,
  });

  return NextResponse.json({ suggestion: updatedSuggestion, correctiveAction });
}
