import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// POST /api/incidents/:id/confirm-sds -- Safety manually selects and
// confirms an SDS from the search results (Screen 3). Deterministic and
// manual, per the 5B MVP scope: no Claude assistance in the SDS match step.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  const body = await req.json();
  const { actor, actorRole, sdsId, matchEvidence, rejectedCandidates } = body;

  const { data, error } = await supabase
    .from('incidents')
    .update({
      selected_sds_id: sdsId,
      sds_match_evidence: matchEvidence || null,
      sds_rejected_candidates: rejectedCandidates || [],
      sds_confirmed_by: actor,
      sds_confirmed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(id, actor, actorRole, 'SDS confirmed', { sdsId, matchEvidence });

  return NextResponse.json({ incident: data });
}
