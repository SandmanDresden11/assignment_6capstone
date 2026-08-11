import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// POST /api/incidents/:id/close -- rule-based completeness check (Screen 5
// bottom). Safety may close the incident only when required verification
// and receipt fields are complete (Assignment 5A, Step 2, row 15).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  const body = await req.json().catch(() => ({}));
  const { actor, actorRole } = body;

  const { data: incident } = await supabase.from('incidents').select('*').eq('id', id).single();
  if (!incident) return NextResponse.json({ error: 'Incident not found' }, { status: 404 });

  const { data: handoffs } = await supabase
    .from('handoffs')
    .select('*')
    .eq('incident_id', id)
    .order('created_at', { ascending: false })
    .limit(1);
  const latestHandoff = handoffs?.[0];

  const missing: string[] = [];
  if (incident.verification_status !== 'Verified') missing.push('Safety verification');
  if (!latestHandoff || latestHandoff.status !== 'Received') missing.push('Problem Solve receipt confirmation');

  if (missing.length > 0) {
    return NextResponse.json({ ok: false, missing });
  }

  const { data, error } = await supabase
    .from('incidents')
    .update({ status: 'Closed', closed_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(id, actor, actorRole, 'Incident closed', {});

  return NextResponse.json({ ok: true, incident: data });
}
