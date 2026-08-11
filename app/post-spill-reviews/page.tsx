'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

function ageDays(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

type Filter = 'all' | 'needsReview' | 'aiDraft' | 'whsReviewed' | 'hasOpenActions';

export default function PostSpillReviewQueuePage() {
  const [queue, setQueue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('needsReview');

  async function load() {
    setLoading(true);
    const res = await fetch('/api/post-spill-reviews', { cache: 'no-store' });
    const data = await res.json();
    setQueue(data.queue || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = queue.filter((r) => {
    if (filter === 'needsReview') return r.reviewStatus !== 'WHS Reviewed';
    if (filter === 'aiDraft') return r.reviewStatus === 'AI Draft' || r.reviewStatus === 'WHS Review Required';
    if (filter === 'whsReviewed') return r.reviewStatus === 'WHS Reviewed';
    if (filter === 'hasOpenActions') return r.openCorrectiveActions > 0;
    return true;
  });

  return (
    <div className="text-sm">
      <div className="flex justify-between items-center mb-3">
        <h1 className="text-lg font-bold">Post-Spill Reviews</h1>
        <Link href="/" className="underline">
          ← Dashboard
        </Link>
      </div>

      <div className="flex gap-2 mb-3 text-sm flex-wrap">
        {(
          [
            ['needsReview', 'Needs Review'],
            ['aiDraft', 'AI Draft'],
            ['whsReviewed', 'WHS Reviewed'],
            ['hasOpenActions', 'Has Open Corrective Actions'],
            ['all', 'All'],
          ] as [Filter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`border px-2 py-1 ${filter === key ? 'bg-green-100' : ''}`}
          >
            {label}
          </button>
        ))}
        <button onClick={load} className="ml-auto border px-2 py-1">
          Refresh
        </button>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b border-green-800">
            <th className="p-1">Spill ID</th>
            <th>Date</th>
            <th>Location</th>
            <th>Material</th>
            <th>Spill Status</th>
            <th>Review Status</th>
            <th>Open Gaps</th>
            <th>Open Actions</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => (
            <tr key={r.incidentId} className="border-b hover:bg-green-50">
              <td className="p-1">{r.code}</td>
              <td>
                {new Date(r.reportedAt).toLocaleDateString()} ({ageDays(r.reportedAt)}d)
              </td>
              <td>{r.location || '—'}</td>
              <td>{r.product || '—'}</td>
              <td>{r.spillStatus}</td>
              <td>{r.reviewStatus}</td>
              <td className={r.openDocumentationGaps > 0 ? 'text-red-700' : ''}>{r.openDocumentationGaps}</td>
              <td className={r.openCorrectiveActions > 0 ? 'text-red-700' : ''}>{r.openCorrectiveActions}</td>
              <td>
                <Link href={`/incidents/${r.incidentId}/post-spill-review`} className="underline">
                  Review
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!loading && filtered.length === 0 && <p className="mt-3">No records in this view.</p>}
    </div>
  );
}
