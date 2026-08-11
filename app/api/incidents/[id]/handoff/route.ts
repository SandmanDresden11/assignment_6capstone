import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// POST /api/incidents/:id/handoff -- create the Problem Solve transfer
// (Screen 5 top).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  const body = await req.json();
  const { actor, actorRole, product_condition, destination_station, transfer_owner, approved_note } = body;

  const { data, error } = await supabase
    .from('handoffs')
    .insert({ incident_id: id, product_condition, destination_station, transfer_owner, approved_note, status: 'Pending' })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from('incidents').update({ status: 'Awaiting Problem Solve', awaiting_problem_solve_at: new Date().toISOString() }).eq('id', id);

  await logAudit(id, actor, actorRole, 'Problem Solve handoff created', { destination_station, transfer_owner });

  return NextResponse.json({ handoff: data });
}

// PATCH /api/incidents/:id/handoff -- Problem Solve confirms receipt
// (Screen 5 bottom).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  const body = await req.json();
  const { actor, actorRole, handoffId, receiving_associate } = body;

  const { data, error } = await supabase
    .from('handoffs')
    .update({ receiving_associate, receipt_time: new Date().toISOString(), status: 'Received' })
    .eq('id', handoffId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(id, actor, actorRole, 'Problem Solve receipt confirmed', { handoffId, receiving_associate });

  return NextResponse.json({ handoff: data });
}
