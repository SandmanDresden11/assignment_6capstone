import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// Maps a status transition to the timestamp column it should stamp, matching
// the MVP Status Model in Assignment 5A, Step 6.
const STATUS_TIMESTAMP_COL: Record<string, string> = {
  'En Route': 'en_route_at',
  'On Scene': 'on_scene_at',
  'Response Selected': 'response_selected_at',
  'Cleanup In Progress': 'cleanup_in_progress_at',
  'Awaiting Problem Solve': 'awaiting_problem_solve_at',
  Closed: 'closed_at',
};

// GET /api/incidents/:id -- full detail for the incident workflow page
// (Screens 3-5): incident record plus assignment, handoff, AI runs, and the
// audit timeline.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { id } = params;

  const [{ data: incident, error }, { data: assignments }, { data: handoffs }, { data: aiRuns }, { data: auditEvents }] =
    await Promise.all([
      supabase.from('incidents').select('*').eq('id', id).single(),
      supabase.from('assignments').select('*').eq('incident_id', id).order('created_at', { ascending: false }),
      supabase.from('handoffs').select('*').eq('incident_id', id).order('created_at', { ascending: false }),
      supabase.from('ai_runs').select('*').eq('incident_id', id).order('created_at', { ascending: false }),
      supabase.from('audit_events').select('*').eq('incident_id', id).order('created_at', { ascending: false }),
    ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  let sds = null;
  if (incident.selected_sds_id) {
    const { data } = await supabase.from('sds_records').select('*').eq('id', incident.selected_sds_id).single();
    sds = data;
  }

  return NextResponse.json({ incident, assignments, handoffs, aiRuns, auditEvents, sds });
}

// PATCH /api/incidents/:id -- status transitions and field updates (e.g.
// Accept / En Route, On Scene).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  const body = await req.json();
  const { actor, actorRole, status, ...rest } = body;

  const update: Record<string, any> = { ...rest };
  if (status) {
    update.status = status;
    const col = STATUS_TIMESTAMP_COL[status];
    if (col) update[col] = new Date().toISOString();
  }

  const { data, error } = await supabase.from('incidents').update(update).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(id, actor, actorRole, `Incident updated${status ? `: status -> ${status}` : ''}`, { update });

  return NextResponse.json({ incident: data });
}
