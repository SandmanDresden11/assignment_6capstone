import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// POST /api/incidents/:id/assignment -- create the (single, MVP) Safety /
// ABM / RME task for this incident (Screen 4 top).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  const body = await req.json();
  const { actor, actorRole, team, assigned_person } = body;

  const { data, error } = await supabase
    .from('assignments')
    .insert({ incident_id: id, team, assigned_person, status: 'Requested' })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from('incidents').update({ status: 'Cleanup In Progress', cleanup_in_progress_at: new Date().toISOString() }).eq('id', id);

  await logAudit(id, actor, actorRole, `Assignment created (${team})`, { assigned_person });

  return NextResponse.json({ assignment: data });
}

// PATCH /api/incidents/:id/assignment -- update status / completion notes.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  const body = await req.json();
  const { actor, actorRole, assignmentId, status, completion_notes } = body;

  const update: Record<string, any> = {};
  if (status) update.status = status;
  if (completion_notes !== undefined) update.completion_notes = completion_notes;
  if (status === 'Accepted') update.acknowledgment_time = new Date().toISOString();
  if (status === 'Complete') update.completion_time = new Date().toISOString();

  const { data, error } = await supabase.from('assignments').update(update).eq('id', assignmentId).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(id, actor, actorRole, `Assignment updated: ${status || 'notes'}`, { assignmentId, update });

  return NextResponse.json({ assignment: data });
}
