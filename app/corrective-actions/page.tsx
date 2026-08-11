'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRole } from '@/components/RoleBar';
import { correctiveActionAging } from '@/lib/postSpillSignals';

const STATUSES = ['Draft', 'Open', 'In Progress', 'Complete', 'Cancelled'];
const PRIORITIES = ['Low', 'Medium', 'High'];

export default function CorrectiveActionsPage() {
  const { name, role } = useRole();
  const [actions, setActions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'open' | 'overdue' | 'all'>('open');

  async function load() {
    setLoading(true);
    const res = await fetch('/api/corrective-actions', { cache: 'no-store' });
    const data = await res.json();
    setActions(data.correctiveActions || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function patch(id: string, fields: any) {
    await fetch(`/api/corrective-actions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...fields, actor: name || 'Unknown', actorRole: role }),
    });
    await load();
  }

  const filtered = actions.filter((a) => {
    const { overdue } = correctiveActionAging(a);
    if (filter === 'open') return !['Complete', 'Cancelled'].includes(a.status);
    if (filter === 'overdue') return overdue;
    return true;
  });

  return (
    <div className="text-sm">
      <div className="flex justify-between items-center mb-3">
        <h1 className="text-lg font-bold">Corrective Actions</h1>
        <Link href="/" className="underline">
          ← Dashboard
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
            <th className="p-1">Action</th>
            <th>Related Spill</th>
            <th>Owner</th>
            <th>Due Date</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Days Open / Overdue</th>
            <th>AI</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((a) => {
            const { daysOpen, overdue, dueSoon } = correctiveActionAging(a);
            return (
              <tr key={a.id} className="border-b hover:bg-green-50 align-top">
                <td className="p-1 max-w-xs">
                  <input
                    className="border p-1 w-full"
                    defaultValue={a.description}
                    onBlur={(e) => e.target.value !== a.description && patch(a.id, { description: e.target.value })}
                  />
                </td>
                <td>
                  {a.incident ? (
                    <Link href={`/incidents/${a.incident.id}/post-spill-review`} className="underline">
                      {a.incident.code}
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  <input
                    className="border p-1 w-24"
                    defaultValue={a.owner || ''}
                    placeholder="owner"
                    onBlur={(e) => e.target.value !== (a.owner || '') && patch(a.id, { owner: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="date"
                    className="border p-1"
                    defaultValue={a.due_date || ''}
                    onChange={(e) => patch(a.id, { due_date: e.target.value || null })}
                  />
                </td>
                <td>
                  <select className="border p-1" value={a.status} onChange={(e) => patch(a.id, { status: e.target.value })}>
                    {STATUSES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    className="border p-1"
                    value={a.priority || ''}
                    onChange={(e) => patch(a.id, { priority: e.target.value || null })}
                  >
                    <option value="">—</option>
                    {PRIORITIES.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </td>
                <td className={overdue ? 'text-red-700' : dueSoon ? 'text-yellow-700' : ''}>
                  {daysOpen}d{overdue ? ' — OVERDUE' : dueSoon ? ' — due soon' : ''}
                </td>
                <td>{a.originated_from_ai ? 'AI' : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!loading && filtered.length === 0 && <p className="mt-3">No corrective actions in this view.</p>}
    </div>
  );
}
