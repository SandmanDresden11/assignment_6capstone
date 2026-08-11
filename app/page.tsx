'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

function ageMinutes(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

// Screen 1: Safety Dashboard (Assignment 5A, Step 5).
export default function DashboardPage() {
  const [incidents, setIncidents] = useState<any[]>([]);
  const [filter, setFilter] = useState<'open' | 'overdue' | 'all'>('open');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/incidents', { cache: 'no-store' });
    const data = await res.json();
    setIncidents(data.incidents || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = incidents.filter((i) => {
    if (filter === 'open') return i.status !== 'Closed' && i.status !== 'Cancelled';
    if (filter === 'overdue') return (i.overdue_flags || []).length > 0 && i.status !== 'Closed';
    return true;
  });

  const overdueCount = incidents.filter((i) => (i.overdue_flags || []).length > 0 && i.status !== 'Closed').length;

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h1 className="text-lg font-bold">Safety Dashboard</h1>
        <Link href="/new-incident" className="border px-3 py-1 bg-green-700 text-white">
          + New Incident
        </Link>
      </div>

      <div className="flex gap-2 mb-3 text-sm">
        <button onClick={() => setFilter('open')} className={`border px-2 py-1 ${filter === 'open' ? 'bg-green-100' : ''}`}>
          Open
        </button>
        <button onClick={() => setFilter('overdue')} className={`border px-2 py-1 ${filter === 'overdue' ? 'bg-green-100' : ''}`}>
          Overdue
        </button>
        <button onClick={() => setFilter('all')} className={`border px-2 py-1 ${filter === 'all' ? 'bg-green-100' : ''}`}>
          All
        </button>
        <button onClick={load} className="ml-auto border px-2 py-1">
          Refresh
        </button>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b border-green-800">
            <th className="p-1">ID</th>
            <th>Location</th>
            <th>Product</th>
            <th>Status</th>
            <th>Owner</th>
            <th>Age</th>
            <th>Flags</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((i) => (
            <tr key={i.id} className="border-b hover:bg-green-50">
              <td className="p-1">
                <Link href={`/incidents/${i.id}`} className="underline">
                  {i.code}
                </Link>
              </td>
              <td>{i.location || '—'}</td>
              <td>{i.product_known ? i.product_name || '—' : 'Unknown'}</td>
              <td>{i.status}</td>
              <td>{i.safety_responder || '--'}</td>
              <td>{ageMinutes(i.reported_at)}m</td>
              <td className="text-red-700">{(i.overdue_flags || []).length > 0 ? `⚠ ${(i.overdue_flags || []).join(', ')}` : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!loading && filtered.length === 0 && <p className="text-sm mt-3">No incidents in this view.</p>}

      <p className="text-sm mt-3 border-t pt-2">
        Safety-lead summary: {overdueCount} incident{overdueCount === 1 ? '' : 's'} require attention.
      </p>
    </div>
  );
}
