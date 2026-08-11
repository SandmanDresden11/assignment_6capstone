import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// POST /api/incidents/:id/approve-brief -- Safety explicitly approves or
// rejects the Draft brief (Screen 3 bottom). Approval is what actually
// selects the final route; the app never does this automatically.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  const body = await req.json();
  const { actor, actorRole, runId, decision, correctedRoute, reviewerCorrections } = body;

  if (!['approved', 'rejected'].includes(decision)) {
    return NextResponse.json({ error: 'decision must be approved or rejected' }, { status: 400 });
  }

  const { data: run, error: runErr } = await supabase.from('ai_runs').select('*').eq('id', runId).single();
  if (runErr || !run) return NextResponse.json({ error: 'AI run not found' }, { status: 404 });

  const finalRoute = decision === 'approved' ? correctedRoute || run.proposed_route : null;

  const { error: updErr } = await supabase
    .from('ai_runs')
    .update({
      decision,
      reviewer: actor,
      decided_at: new Date().toISOString(),
      reviewer_corrections: reviewerCorrections || null,
      final_route: finalRoute,
    })
    .eq('id', runId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  if (decision === 'approved') {
    await supabase
      .from('incidents')
      .update({ status: 'Response Selected', response_selected_at: new Date().toISOString(), final_route: finalRoute })
      .eq('id', id);
  }

  await logAudit(id, actor, actorRole, `AI response brief ${decision}`, { runId, finalRoute });

  return NextResponse.json({ ok: true });
}
