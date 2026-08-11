'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useRole } from '@/components/RoleBar';

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

const STATE_LABELS: Record<string, string> = {
  DOCUMENTATION_INCOMPLETE: 'Documentation Incomplete',
  CORRECTIVE_ACTION_REVIEW_NEEDED: 'Corrective Action Review Needed',
  TREND_REVIEW_RECOMMENDED: 'Trend Review Recommended',
  READY_FOR_WHS_SIGN_OFF: 'Ready for WHS Sign-Off',
};

export default function PostSpillReviewPage() {
  const params = useParams();
  const id = params?.id as string;
  const { name, role } = useRole();
  const actorBody = { actor: name || 'Unknown', actorRole: role };

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editingSuggestion, setEditingSuggestion] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch(`/api/incidents/${id}/post-spill-review`, { cache: 'no-store' });
    setData(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    if (id) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function startReview() {
    setGenerating(true);
    setGenError(null);
    const res = await fetch(`/api/incidents/${id}/post-spill-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(actorBody),
    });
    const d = await res.json();
    setGenerating(false);
    if (!res.ok) {
      setGenError(d.error || 'Failed to generate post-spill review.');
      return;
    }
    await refresh();
  }

  async function updateGap(gapId: string, status: 'Resolved' | 'Dismissed') {
    setBusy(true);
    await fetch(`/api/incidents/${id}/post-spill-review/gaps/${gapId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...actorBody, status }),
    });
    await refresh();
    setBusy(false);
  }

  async function updateTheme(themeId: string, accepted: boolean) {
    setBusy(true);
    await fetch(`/api/incidents/${id}/post-spill-review/themes/${themeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...actorBody, accepted }),
    });
    await refresh();
    setBusy(false);
  }

  async function decideSuggestion(suggestionId: string, decision: 'accept' | 'edit' | 'reject') {
    setBusy(true);
    await fetch(`/api/incidents/${id}/post-spill-review/suggested-actions/${suggestionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...actorBody, decision, editedText: decision === 'edit' ? editText : undefined }),
    });
    setEditingSuggestion(null);
    setEditText('');
    await refresh();
    setBusy(false);
  }

  async function approveReview() {
    setBusy(true);
    const res = await fetch(`/api/incidents/${id}/post-spill-review/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...actorBody, confirmed: confirmChecked }),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) alert(d.error || 'Failed to approve review.');
    await refresh();
  }

  if (loading) return <p>Loading…</p>;
  if (!data || !data.incident) return <p>Incident not found.</p>;

  const { incident: inc, sds, correctiveActions, review, gaps, themes, questions, suggestedActions } = data;

  return (
    <div className="text-sm space-y-4">
      <Link href={`/incidents/${id}`} className="underline">
        ← Back to Incident
      </Link>
      <h1 className="text-lg font-bold">Post-Spill Review — {inc.code}</h1>

      {!review && (
        <div className="border p-3">
          <p className="mb-2">
            No post-spill review has been started for this incident yet. This is separate from Generate Response
            Brief — it evaluates the completed documentation record and drafts follow-up material for WHS review.
          </p>
          <button
            disabled={generating}
            onClick={startReview}
            className="border px-3 py-1 bg-green-700 text-white disabled:opacity-50"
          >
            {generating ? 'Generating…' : 'Start Post-Spill Review'}
          </button>
          {genError && <p className="text-red-700 text-xs mt-2">{genError}</p>}
        </div>
      )}

      {review && (
        <>
          <div
            className={`border p-2 ${review.review_status === 'WHS Reviewed' ? 'border-green-800 bg-green-50' : 'border-yellow-700 bg-yellow-50'}`}
          >
            {review.review_status === 'WHS Reviewed' ? (
              <p className="font-bold">
                WHS Reviewed — approved by {review.reviewer} at {fmt(review.reviewed_at)}
              </p>
            ) : (
              <>
                <p className="font-bold">AI-Assisted Draft — WHS Review Required</p>
                <p className="text-xs mt-1">
                  This review was generated from the documented spill record to assist post-event follow-up.
                  AI-generated content must be verified against the source record and does not replace approved
                  procedures, regulatory requirements, or WHS professional judgment.
                </p>
              </>
            )}
          </div>

          {/* Source Spill Record */}
          <div className="border p-2">
            <h2 className="font-bold mb-1">Source Spill Record</h2>
            <p>
              {inc.code} · Reported: {fmt(inc.reported_at)} · Status: {inc.status}
            </p>
            <p>
              Location: {inc.location || '—'} · Department: {inc.department || '—'}
            </p>
            <p>Radio description: {inc.radio_description || '—'}</p>
            <p>
              Product: {inc.product_known ? inc.product_name || '—' : 'Unknown'} · Qty: {inc.quantity || '—'} ·
              Container: {inc.container_condition || '—'}
            </p>
            <p>Confirmed SDS: {sds ? `${sds.product_name} (${sds.manufacturer})` : '—'}</p>
            <p>Scene notes: {inc.scene_notes || '—'}</p>
            <p>Selected route: {inc.final_route || '—'}</p>
            <p>Verification status: {inc.verification_status}</p>
            <p>Existing corrective actions: {correctiveActions?.length || 0}</p>
          </div>

          {/* AI Post-Spill Review */}
          <div className="border p-2 space-y-4">
            <h2 className="font-bold">AI-Assisted Post-Spill Review</h2>

            <div>
              <h3 className="font-bold text-xs uppercase">AI-Generated Incident Summary</h3>
              <p>{review.ai_summary}</p>
            </div>

            <div>
              <h3 className="font-bold text-xs uppercase">Documentation Gaps</h3>
              {gaps.length === 0 && <p className="text-xs">None identified.</p>}
              {gaps.map((g: any) => (
                <div key={g.id} className="border-t py-1">
                  <p>
                    <strong>{g.description}</strong> — {g.status}
                  </p>
                  <p className="text-xs">{g.reason}</p>
                  {g.status === 'Open' && (
                    <div className="flex gap-2 mt-1">
                      <button disabled={busy} className="border px-2" onClick={() => updateGap(g.id, 'Resolved')}>
                        Resolve
                      </button>
                      <button disabled={busy} className="border px-2" onClick={() => updateGap(g.id, 'Dismissed')}>
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div>
              <h3 className="font-bold text-xs uppercase">Potential Follow-Up Themes</h3>
              {themes.length === 0 && <p className="text-xs">None identified.</p>}
              {themes.map((t: any) => (
                <div key={t.id} className="border-t py-1">
                  <p>
                    <strong>Theme:</strong> {t.theme} &nbsp;
                    <span className="text-xs">(Confidence: {t.confidence})</span>
                  </p>
                  <p className="text-xs">
                    <strong>Reason:</strong> {t.rationale}
                  </p>
                  <p className="text-xs">
                    <strong>Evidence from Record:</strong> {t.evidence}
                  </p>
                  {t.accepted === null ? (
                    <div className="flex gap-2 mt-1">
                      <button disabled={busy} className="border px-2" onClick={() => updateTheme(t.id, true)}>
                        Accept
                      </button>
                      <button disabled={busy} className="border px-2" onClick={() => updateTheme(t.id, false)}>
                        Dismiss
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs">{t.accepted ? 'Accepted' : 'Dismissed'} for follow-up.</p>
                  )}
                </div>
              ))}
            </div>

            <div>
              <h3 className="font-bold text-xs uppercase">Follow-Up Questions</h3>
              {questions.length === 0 && <p className="text-xs">None generated.</p>}
              <ul className="list-disc pl-5">
                {questions.map((q: any) => (
                  <li key={q.id}>{q.question_text}</li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-xs uppercase">AI-Suggested Corrective Actions</h3>
              {suggestedActions.length === 0 && <p className="text-xs">None generated.</p>}
              {suggestedActions.map((s: any) => (
                <div key={s.id} className="border-t py-1">
                  <p className="text-xs font-bold">AI-Suggested Corrective Action</p>
                  <p>{s.suggested_action}</p>
                  <p className="text-xs">{s.rationale}</p>
                  <p className="text-xs">Status: {s.status}</p>
                  {s.status === 'Suggested' &&
                    (editingSuggestion === s.id ? (
                      <div className="flex gap-2 mt-1">
                        <input
                          className="border p-1 flex-1"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          placeholder="edited action text"
                        />
                        <button disabled={busy} className="border px-2" onClick={() => decideSuggestion(s.id, 'edit')}>
                          Save Edit
                        </button>
                        <button className="border px-2" onClick={() => setEditingSuggestion(null)}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2 mt-1">
                        <button disabled={busy} className="border px-2" onClick={() => decideSuggestion(s.id, 'accept')}>
                          Accept
                        </button>
                        <button
                          disabled={busy}
                          className="border px-2"
                          onClick={() => {
                            setEditingSuggestion(s.id);
                            setEditText(s.suggested_action);
                          }}
                        >
                          Edit
                        </button>
                        <button disabled={busy} className="border px-2" onClick={() => decideSuggestion(s.id, 'reject')}>
                          Reject
                        </button>
                      </div>
                    ))}
                </div>
              ))}
            </div>

            {review.recommended_state && (
              <div className="border border-green-800 p-2">
                <h3 className="font-bold text-xs uppercase">AI Recommended Next Step</h3>
                <p className="font-bold">{STATE_LABELS[review.recommended_state]}</p>
                <p className="text-xs mt-1">
                  <strong>Reason:</strong> {review.recommended_reason}
                </p>
                {review.recommended_evidence?.length > 0 && (
                  <ul className="text-xs list-disc pl-5">
                    {review.recommended_evidence.map((e: string, i: number) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                )}
                <p className="text-xs mt-1">
                  <strong>Recommended Next Step:</strong> {review.recommended_next_step}
                </p>
                <p className="text-xs italic mt-1">{review.recommended_limitations}</p>
                <p className="text-xs mt-1 text-gray-600">
                  This is advisory only. The WHS Specialist may ignore or override it — it never changes the
                  incident's status.
                </p>
              </div>
            )}
          </div>

          {/* WHS Sign-off */}
          <div className="border p-2">
            <h2 className="font-bold mb-1">WHS Sign-Off</h2>
            {review.review_status === 'WHS Reviewed' ? (
              <p>
                Approved by {review.reviewer} at {fmt(review.reviewed_at)}. This approval applies to the post-spill
                review only — it does not certify or rewrite the original incident record.
              </p>
            ) : (
              <>
                <label className="flex items-start gap-2">
                  <input type="checkbox" checked={confirmChecked} onChange={(e) => setConfirmChecked(e.target.checked)} />
                  <span>I have compared this AI-generated review with the source spill record and reviewed the information for accuracy.</span>
                </label>
                <button
                  disabled={busy || !confirmChecked}
                  className="border px-3 py-1 mt-2 bg-green-700 text-white disabled:opacity-50"
                  onClick={approveReview}
                >
                  Approve WHS Review
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
