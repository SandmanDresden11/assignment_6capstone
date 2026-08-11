import { supabase } from '@/lib/supabase';

// Appends one row to the append-only audit_events table (5A Step 3: "Audit
// and configuration"). `source` distinguishes a human-driven action ('user')
// from the scheduled job ('system').
export async function logAudit(
  incidentId: string,
  actor: string | undefined,
  actorRole: string | undefined,
  action: string,
  details: Record<string, unknown> = {},
  source: 'user' | 'system' = 'user'
) {
  const { error } = await supabase.from('audit_events').insert({
    incident_id: incidentId,
    actor: actor || 'Unknown',
    actor_role: actorRole || null,
    action,
    details,
    source,
  });
  if (error) {
    console.error('Failed to write audit event:', error.message);
  }
}
