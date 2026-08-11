import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// PATCH /api/corrective-actions/:id -- WHS user fills in / edits final
// details (owner, due date, status, priority, description). This is the
// step that turns a "Draft" corrective action into an official one with
// real ownership -- the AI never sets these fields.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  const body = await req.json();
  const { actor, actorRole, description, owner, due_date, status, priority } = body;

  const update: Record<string, any> = {};
  if (description !== undefined) update.description = description;
  if (owner !== undefined) update.owner = owner;
  if (due_date !== undefined) update.due_date = due_date;
  if (priority !== undefined) update.priority = priority;
  if (status !== undefined) {
    if (!['Draft', 'Open', 'In Progress', 'Complete', 'Cancelled'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    update.status = status;
    update.completed_at = status === 'Complete' ? new Date().toISOString() : null;
  }

  const { data, error } = await supabase.from('corrective_actions').update(update).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(data.incident_id, actor, actorRole, 'Corrective action updated', { correctiveActionId: id, update });

  return NextResponse.json({ correctiveAction: data });
}
