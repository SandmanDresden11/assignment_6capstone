import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// PATCH /api/incidents/:id/post-spill-review/gaps/:gapId -- WHS user
// resolves or dismisses an AI-flagged documentation gap. The AI can flag a
// potential gap; only a human can decide it isn't actually required.
export async function PATCH(req: Request, { params }: { params: { id: string; gapId: string } }) {
  const { id, gapId } = params;
  const body = await req.json();
  const { actor, actorRole, status, reviewerNotes } = body;

  if (!['Open', 'Resolved', 'Dismissed'].includes(status)) {
    return NextResponse.json({ error: 'status must be Open, Resolved, or Dismissed' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('documentation_gaps')
    .update({ status, reviewer_notes: reviewerNotes ?? undefined })
    .eq('id', gapId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(id, actor, actorRole, `Documentation gap ${status.toLowerCase()}`, { gapId, description: data.description });

  return NextResponse.json({ gap: data });
}
