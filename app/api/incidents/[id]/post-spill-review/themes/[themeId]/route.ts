import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// PATCH /api/incidents/:id/post-spill-review/themes/:themeId -- WHS user
// accepts or dismisses a potential follow-up theme. Never relabels a theme
// as a root cause -- that requires a human to enter it on the source record
// directly, outside this AI-assisted flow.
export async function PATCH(req: Request, { params }: { params: { id: string; themeId: string } }) {
  const { id, themeId } = params;
  const body = await req.json();
  const { actor, actorRole, accepted } = body;

  if (typeof accepted !== 'boolean') {
    return NextResponse.json({ error: 'accepted must be a boolean' }, { status: 400 });
  }

  const { data, error } = await supabase.from('followup_themes').update({ accepted }).eq('id', themeId).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(id, actor, actorRole, `Follow-up theme ${accepted ? 'accepted' : 'dismissed'}`, { themeId, theme: data.theme });

  return NextResponse.json({ theme: data });
}
