'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useRole } from '@/components/RoleBar';

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

// Screens 3-5 combined: SDS Match & Response Brief, Cleanup Assignment &
// Verification, Problem Solve Handoff & Closure (Assignment 5A, Step 5).
export default function IncidentDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const { name, role } = useRole();

  const [data, setData] = useState<any>(null);
  const [sdsQuery, setSdsQuery] = useState('');
  const [sdsResults, setSdsResults] = useState<any[]>([]);
  const [matchEvidence, setMatchEvidence] = useState('');
  const [route, setRoute] = useState('Safety-managed response');
  const [correction, setCorrection] = useState('');
  const [assignTeam, setAssignTeam] = useState('Safety');
  const [assignedPerson, setAssignedPerson] = useState('');
  const [leakControlled, setLeakControlled] = useState(false);
  const [workComplete, setWorkComplete] = useState(false);
  const [restrictions, setRestrictions] = useState('');
  const [destStation, setDestStation] = useState('');
  const [transferOwner, setTransferOwner] = useState('');
  const [approvedNote, setApprovedNote] = useState('');
  const [receivingAssociate, setReceivingAssociate] = useState('');
  const [closeMissing, setCloseMissing] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const actorBody = { actor: name || 'Unknown', actorRole: role };

  async function refresh() {
    const res = await fetch(`/api/incidents/${id}`, { cache: 'no-store' });
    setData(await res.json());
  }

  useEffect(() => {
    if (id) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function patchIncident(fields: any) {
    setBusy(true);
    await fetch(`/api/incidents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...fields, ...actorBody }),
    });
    await refresh();
    setBusy(false);
  }

  async function searchSds() {
    const res = await fetch(`/api/sds-search?q=${encodeURIComponent(sdsQuery)}`);
    const d = await res.json();
    setSdsResults(d.results || []);
  }

  async function confirmSds(sdsId: string) {
    setBusy(true);
    await fetch(`/api/incidents/${id}/confirm-sds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...actorBody,
        sdsId,
        matchEvidence,
        rejectedCandidates: sdsResults.filter((r) => r.id !== sdsId).map((r) => r.id),
      }),
    });
    await refresh();
    setBusy(false);
  }

  async function generateBrief() {
    setBusy(true);
    const res = await fetch(`/api/incidents/${id}/generate-brief`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(actorBody),
    });
    const d = await res.json();
    setBusy(false);
    if (d.error) alert(d.error);
    await refresh();
  }

  async function decideBrief(runId: string, decision: 'approved' | 'rejected') {
    setBusy(true);
    await fetch(`/api/incidents/${id}/approve-brief`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...actorBody, runId, decision, correctedRoute: route, reviewerCorrections: correction }),
    });
    await refresh();
    setBusy(false);
  }

  async function createAssignment() {
    setBusy(true);
    await fetch(`/api/incidents/${id}/assignment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...actorBody, team: assignTeam, assigned_person: assignedPerson }),
    });
    await refresh();
    setBusy(false);
  }

  async function updateAssignment(assignmentId: string, status: string) {
    setBusy(true);
    await fetch(`/api/incidents/${id}/assignment`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...actorBody, assignmentId, status }),
    });
    await refresh();
    setBusy(false);
  }

  async function recordVerification() {
    setBusy(true);
    await fetch(`/api/incidents/${id}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...actorBody, leak_controlled: leakControlled, work_complete: workComplete, restrictions }),
    });
    await refresh();
    setBusy(false);
  }

  async function createHandoff() {
    setBusy(true);
    await fetch(`/api/incidents/${id}/handoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...actorBody,
        product_condition: 'Contained / identified',
        destination_station: destStation,
        transfer_owner: transferOwner,
        approved_note: approvedNote,
      }),
    });
    await refresh();
    setBusy(false);
  }

  async function confirmReceipt(handoffId: string) {
    setBusy(true);
    await fetch(`/api/incidents/${id}/handoff`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...actorBody, handoffId, receiving_associate: receivingAssociate }),
    });
    await refresh();
    setBusy(false);
  }

  async function runClose() {
    setBusy(true);
    const res = await fetch(`/api/incidents/${id}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(actorBody),
    });
    const d = await res.json();
    setBusy(false);
    setCloseMissing(d.ok ? [] : d.missing || []);
    await refresh();
  }

  if (!data || !data.incident) return <p>Loading…</p>;
  const { incident: inc, assignments, handoffs, aiRuns, auditEvents, sds } = data;
  const latestRun = aiRuns?.[0];
  const latestAssignment = assignments?.[0];
  const latestHandoff = handoffs?.[0];

  return (
    <div className="text-sm space-y-4">
      <Link href="/" className="underline">
        ← Dashboard
      </Link>

      <div className="border border-green-800 p-2">
        <div className="flex justify-between font-bold">
          <span>{inc.code}</span>
          <span>
            Status: {inc.status}
            {inc.emergency_escalation ? ' (Emergency Escalation)' : ''}
          </span>
        </div>
        <p>
          Location: {inc.location || '—'} · Department: {inc.department || '—'} · Reported: {fmt(inc.reported_at)}
        </p>
        <p>Radio description: {inc.radio_description || '—'}</p>
        <p>
          Product: {inc.product_known ? inc.product_name || '—' : 'Unknown'} · Qty: {inc.quantity || '—'} · Container:{' '}
          {inc.container_condition || '—'}
        </p>
        <p>
          Continuing leak: {inc.continuing_leak ? 'Yes' : 'No'} · Equipment involved:{' '}
          {inc.equipment_involved ? `Yes (${inc.asset_id || 'no asset id'})` : 'No'}
        </p>
        {(inc.overdue_flags || []).length > 0 && <p className="text-red-700">Overdue flags: {inc.overdue_flags.join(', ')}</p>}
        <div className="mt-2 flex gap-2">
          <button disabled={busy} className="border px-2 py-1" onClick={() => patchIncident({ status: 'En Route', safety_responder: name })}>
            Accept / En Route
          </button>
          <button disabled={busy} className="border px-2 py-1" onClick={() => patchIncident({ status: 'On Scene' })}>
            On Scene
          </button>
        </div>
      </div>

      {inc.emergency_escalation && (
        <div className="border border-red-700 bg-red-50 p-2">
          Emergency Escalation: the site emergency response process controls operations. This record continues to track status,
          ownership, follow-up, and handoff details only.
        </div>
      )}

      <div className="border p-2">
        <h2 className="font-bold mb-1">SDS Match</h2>
        {sds ? (
          <p>
            Confirmed SDS: <strong>{sds.product_name}</strong> ({sds.manufacturer}, {sds.identifier}) — confirmed by{' '}
            {inc.sds_confirmed_by} at {fmt(inc.sds_confirmed_at)}
          </p>
        ) : (
          <>
            <div className="flex gap-2">
              <input
                className="border p-1 flex-1"
                placeholder="product / manufacturer / identifier"
                value={sdsQuery}
                onChange={(e) => setSdsQuery(e.target.value)}
              />
              <button className="border px-2" onClick={searchSds}>
                Search Approved SDS List
              </button>
            </div>
            {sdsResults.map((r) => (
              <div key={r.id} className="flex justify-between border-t py-1">
                <span>
                  {r.product_name} — {r.manufacturer} ({r.identifier})
                </span>
                <button className="border px-2" onClick={() => confirmSds(r.id)}>
                  Select &amp; Confirm
                </button>
              </div>
            ))}
            <input
              className="border p-1 w-full mt-1"
              placeholder="match evidence (e.g. label + SKU)"
              value={matchEvidence}
              onChange={(e) => setMatchEvidence(e.target.value)}
            />
          </>
        )}
      </div>

      <div className="border p-2">
        <h2 className="font-bold mb-1">Response Brief (on-demand Claude call — agentic step)</h2>
        <button disabled={busy || !sds} className="border px-2 py-1 bg-green-700 text-white disabled:opacity-50" onClick={generateBrief}>
          Generate Response Brief
        </button>
        {!sds && <p className="text-xs">Confirm an SDS first.</p>}
        {latestRun && (
          <div className="mt-2 border-t pt-2">
            <pre className="whitespace-pre-wrap text-xs bg-green-50 p-2">{latestRun.brief_text}</pre>
            <p className="text-xs">Decision: {latestRun.decision || 'Draft — pending review'}</p>
            {!latestRun.decision && (
              <div className="mt-1 space-y-1">
                <select className="border p-1" value={route} onChange={(e) => setRoute(e.target.value)}>
                  <option>Emergency Escalation</option>
                  <option>Safety-managed response</option>
                  <option>ABM request</option>
                  <option>RME request</option>
                </select>
                <input
                  className="border p-1 w-full"
                  placeholder="Safety correction (optional)"
                  value={correction}
                  onChange={(e) => setCorrection(e.target.value)}
                />
                <div className="flex gap-2">
                  <button className="border px-2 py-1" onClick={() => decideBrief(latestRun.id, 'approved')}>
                    Approve
                  </button>
                  <button className="border px-2 py-1" onClick={() => decideBrief(latestRun.id, 'rejected')}>
                    Reject / Regenerate
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border p-2">
        <h2 className="font-bold mb-1">Response Task</h2>
        {latestAssignment ? (
          <div>
            <p>
              {latestAssignment.team} — {latestAssignment.assigned_person || '—'} — status: {latestAssignment.status}
            </p>
            <div className="flex gap-2 mt-1 flex-wrap">
              {['Accepted', 'In Progress', 'Complete', 'Needs Escalation'].map((s) => (
                <button key={s} className="border px-2 py-1" onClick={() => updateAssignment(latestAssignment.id, s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <select className="border p-1" value={assignTeam} onChange={(e) => setAssignTeam(e.target.value)}>
              <option>Safety</option>
              <option>ABM</option>
              <option>RME</option>
            </select>
            <input
              className="border p-1 flex-1"
              placeholder="assigned person"
              value={assignedPerson}
              onChange={(e) => setAssignedPerson(e.target.value)}
            />
            <button className="border px-2" onClick={createAssignment}>
              Create Assignment
            </button>
          </div>
        )}
      </div>

      <div className="border p-2">
        <h2 className="font-bold mb-1">Safety Verification</h2>
        <label className="mr-3">
          <input type="checkbox" checked={leakControlled} onChange={(e) => setLeakControlled(e.target.checked)} /> Leak controlled
        </label>
        <label>
          <input type="checkbox" checked={workComplete} onChange={(e) => setWorkComplete(e.target.checked)} /> Approved work complete
        </label>
        <input
          className="border p-1 w-full mt-1"
          placeholder="remaining restrictions"
          value={restrictions}
          onChange={(e) => setRestrictions(e.target.value)}
        />
        <button className="border px-2 py-1 mt-1" onClick={recordVerification}>
          Record Verification
        </button>
        <p className="text-xs mt-1">
          Current: {inc.verification_status} {inc.verifier ? `(by ${inc.verifier})` : ''}
        </p>
      </div>

      <div className="border p-2">
        <h2 className="font-bold mb-1">Problem Solve Handoff</h2>
        {latestHandoff ? (
          <div>
            <p>
              Destination: {latestHandoff.destination_station} · Owner: {latestHandoff.transfer_owner} · Status:{' '}
              {latestHandoff.status}
            </p>
            {latestHandoff.status === 'Pending' && (
              <div className="flex gap-2 mt-1">
                <input
                  className="border p-1"
                  placeholder="receiving associate"
                  value={receivingAssociate}
                  onChange={(e) => setReceivingAssociate(e.target.value)}
                />
                <button className="border px-2" onClick={() => confirmReceipt(latestHandoff.id)}>
                  Confirm Receipt
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <input className="border p-1" placeholder="destination station" value={destStation} onChange={(e) => setDestStation(e.target.value)} />
            <input className="border p-1" placeholder="transfer owner" value={transferOwner} onChange={(e) => setTransferOwner(e.target.value)} />
            <input
              className="border p-1"
              placeholder="approved special-handling note"
              value={approvedNote}
              onChange={(e) => setApprovedNote(e.target.value)}
            />
            <button className="border px-2 py-1 w-fit" onClick={createHandoff}>
              Create Transfer
            </button>
          </div>
        )}
      </div>

      <div className="border p-2">
        <h2 className="font-bold mb-1">Completeness Check &amp; Closure</h2>
        <button className="border px-2 py-1" onClick={runClose}>
          Run / Close Incident
        </button>
        {closeMissing &&
          (closeMissing.length > 0 ? (
            <p className="text-red-700 text-xs mt-1">Missing: {closeMissing.join(', ')}</p>
          ) : (
            <p className="text-green-700 text-xs mt-1">All requirements met — incident closed.</p>
          ))}
      </div>

      <div className="border p-2">
        <h2 className="font-bold mb-1">Audit Timeline</h2>
        <ul className="text-xs space-y-1 max-h-64 overflow-y-auto">
          {(auditEvents || []).map((e: any) => (
            <li key={e.id}>
              {fmt(e.created_at)} — [{e.source}] {e.actor || 'system'} ({e.actor_role || '—'}): {e.action}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
