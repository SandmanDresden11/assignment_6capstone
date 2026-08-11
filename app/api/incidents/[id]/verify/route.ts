import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// POST /api/incidents/:id/verify -- Safety verification checklist
// (Screen 4 bottom). Required before the incident can be closed.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  const body = await req.json();
  const { actor, actorRole, leak_controlled, work_complete, restrictions } = body;

  const status = leak_controlled && work_complete ? 'Verified' : 'Pending';

  const { data, error } = await supabase
    .from('incidents')
    .update({
      verification_status: status,
      verifier: actor,
      verification_time: new Date().toISOString(),
      remaining_restrictions: restrictions || null,
    })
    .eq('id', id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(id, actor, actorRole, `Safety verification recorded (${status})`, { leak_controlled, work_complete, restrictions });

  return NextResponse.json({ incident: data });
}
