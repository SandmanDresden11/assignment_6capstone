import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// GET /api/incidents -- list all incidents for the Safety Dashboard (Screen 1).
export async function GET() {
  const { data, error } = await supabase.from('incidents').select('*').order('reported_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ incidents: data });
}

// POST /api/incidents -- create an incident from the New Incident / On-Scene
// Intake form (Screen 2).
export async function POST(req: Request) {
  const body = await req.json();
  const { actor, actorRole, ...fields } = body;

  const { data, error } = await supabase.from('incidents').insert(fields).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(
    data.id,
    actor,
    actorRole,
    `Incident created (${fields.emergency_escalation ? 'Emergency Escalation' : 'Reported'})`,
    { fields }
  );

  return NextResponse.json({ incident: data });
}
