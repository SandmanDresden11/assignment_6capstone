import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET /api/corrective-actions -- cross-incident list for the Corrective
// Actions view. Days-open/overdue/due-soon are computed client-side with
// deterministic logic (lib/postSpillSignals.ts), never by AI.
export async function GET() {
  const [{ data: actions, error }, { data: incidents }] = await Promise.all([
    supabase.from('corrective_actions').select('*').order('created_at', { ascending: false }),
    supabase.from('incidents').select('id, code, location, department'),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const incidentById = new Map((incidents || []).map((i) => [i.id, i]));
  const enriched = (actions || []).map((a) => ({ ...a, incident: incidentById.get(a.incident_id) || null }));

  return NextResponse.json({ correctiveActions: enriched });
}
