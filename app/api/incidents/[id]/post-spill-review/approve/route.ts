import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// POST /api/incidents/:id/post-spill-review/approve -- WHS sign-off.
// Requires the explicit "I have compared this AI-generated review with the
// source spill record..." confirmation from the client. This approves the
// POST-SPILL REVIEW only -- it never certifies or rewrites the original
// incident record, and never changes the incident's own status.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  const body = await req.json().catch(() => ({}));
  const { actor, actorRole, confirmed } = body;

  if (confirmed !== true) {
    return NextResponse.json(
      { error: 'You must confirm you compared this review against the source record before approving.' },
      { status: 400 }
    );
  }

  const { data: review, error: reviewErr } = await supabase
    .from('post_spill_reviews')
    .select('*')
    .eq('incident_id', id)
    .single();
  if (reviewErr || !review) return NextResponse.json({ error: 'No post-spill review found for this incident.' }, { status: 404 });

  const { data, error } = await supabase
    .from('post_spill_reviews')
    .update({ review_status: 'WHS Reviewed', reviewed_at: new Date().toISOString(), reviewer: actor || 'Unknown' })
    .eq('id', review.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(id, actor, actorRole, 'Post-spill review approved (WHS Reviewed)', { reviewId: review.id });

  return NextResponse.json({ review: data });
}
