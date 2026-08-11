import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET /api/post-spill-reviews -- the review queue/dashboard: every incident
// alongside its post-spill review status (or "Not Started" if the review
// was never generated), open documentation gap count, and open corrective
// action count. Filtering happens client-side against this one payload.
export async function GET() {
  const [{ data: incidents, error }, { data: reviews }, { data: gaps }, { data: actions }] = await Promise.all([
    supabase.from('incidents').select('id, code, reported_at, location, product_name, product_known, status').order('reported_at', { ascending: false }),
    supabase.from('post_spill_reviews').select('*'),
    supabase.from('documentation_gaps').select('review_id, status'),
    supabase.from('corrective_actions').select('incident_id, status'),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const reviewByIncident = new Map((reviews || []).map((r) => [r.incident_id, r]));
  const openGapsByReview = new Map<string, number>();
  for (const g of gaps || []) {
    if (g.status === 'Open') openGapsByReview.set(g.review_id, (openGapsByReview.get(g.review_id) || 0) + 1);
  }
  const openActionsByIncident = new Map<string, number>();
  for (const a of actions || []) {
    if (!['Complete', 'Cancelled'].includes(a.status)) {
      openActionsByIncident.set(a.incident_id, (openActionsByIncident.get(a.incident_id) || 0) + 1);
    }
  }

  const queue = (incidents || []).map((inc) => {
    const review = reviewByIncident.get(inc.id) || null;
    return {
      incidentId: inc.id,
      code: inc.code,
      reportedAt: inc.reported_at,
      location: inc.location,
      product: inc.product_known ? inc.product_name : 'Unknown',
      spillStatus: inc.status,
      reviewStatus: review?.review_status || 'Not Started',
      recommendedState: review?.recommended_state || null,
      openDocumentationGaps: review ? openGapsByReview.get(review.id) || 0 : 0,
      openCorrectiveActions: openActionsByIncident.get(inc.id) || 0,
    };
  });

  return NextResponse.json({ queue });
}
