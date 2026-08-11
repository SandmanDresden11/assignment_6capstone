import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const TEN_MIN_MS = 10 * 60 * 1000;
const THIRTY_MIN_MS = 30 * 60 * 1000;

function msSince(iso: string | null) {
  if (!iso) return Infinity;
  return Date.now() - new Date(iso).getTime();
}

// GET /api/cron/overdue-check
//
// SCHEDULED step, run once a day by Vercel Cron (see vercel.json). Real,
// meaningful work: it evaluates every open incident against the four MVP
// thresholds from Assignment 5A Step 4 (Safety ack <=10min, ABM/RME ack
// <=10min, cleanup update <=30min, Problem Solve receipt <=30min), flags any
// incident that has crossed a threshold, and writes a system audit event.
// It never closes an incident or changes the selected response route.
//
// Note on cadence: Vercel Hobby only supports daily cron triggers, so
// detection latency here is up to 24h rather than the 10-minute cadence in
// the original 5A design. The threshold VALUES themselves (10/10/30/30
// minutes) are unchanged -- they're evaluated against real timestamps
// regardless of how often this job runs. See README for more.
//
// Because Vercel's dashboard can't manually fire a Hobby cron job, test this
// by visiting this route's URL directly in a browser (add ?secret=... if
// CRON_SECRET is set).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    const url = new URL(req.url);
    const querySecret = url.searchParams.get('secret');
    if (auth !== `Bearer ${secret}` && querySecret !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const { data: incidents, error } = await supabase.from('incidents').select('*').not('status', 'in', '(Closed,Cancelled)');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const flaggedSummary: { incident: string; newFlags: string[] }[] = [];

  for (const incident of incidents || []) {
    const existingFlags: string[] = Array.isArray(incident.overdue_flags) ? incident.overdue_flags : [];
    const newFlags: string[] = [];

    if (incident.status === 'Reported' && msSince(incident.reported_at) > TEN_MIN_MS && !existingFlags.includes('safety_ack')) {
      newFlags.push('safety_ack');
    }

    const { data: assignments } = await supabase
      .from('assignments')
      .select('*')
      .eq('incident_id', incident.id)
      .order('created_at', { ascending: false })
      .limit(1);
    const assignment = assignments?.[0];
    if (
      assignment &&
      ['ABM', 'RME'].includes(assignment.team) &&
      assignment.status === 'Requested' &&
      msSince(assignment.request_time) > TEN_MIN_MS &&
      !existingFlags.includes('assignment_ack')
    ) {
      newFlags.push('assignment_ack');
    }

    if (incident.status === 'Cleanup In Progress' && msSince(incident.updated_at) > THIRTY_MIN_MS && !existingFlags.includes('cleanup_stalled')) {
      newFlags.push('cleanup_stalled');
    }

    const { data: handoffs } = await supabase
      .from('handoffs')
      .select('*')
      .eq('incident_id', incident.id)
      .order('created_at', { ascending: false })
      .limit(1);
    const handoff = handoffs?.[0];
    if (
      handoff &&
      handoff.status === 'Pending' &&
      msSince(handoff.transfer_time) > THIRTY_MIN_MS &&
      !existingFlags.includes('handoff_overdue')
    ) {
      newFlags.push('handoff_overdue');
    }

    if (newFlags.length > 0) {
      const updatedFlags = [...existingFlags, ...newFlags];
      await supabase.from('incidents').update({ overdue_flags: updatedFlags }).eq('id', incident.id);
      await logAudit(incident.id, 'Scheduled job', 'System', `Overdue check flagged: ${newFlags.join(', ')}`, { newFlags }, 'system');
      flaggedSummary.push({ incident: incident.code, newFlags });
    }
  }

  return NextResponse.json({
    checked: incidents?.length || 0,
    flagged: flaggedSummary,
    ranAt: new Date().toISOString(),
  });
}
