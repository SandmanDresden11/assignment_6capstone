'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useRole } from '@/components/RoleBar';

// Screen 2: New Incident / On-Scene Intake (Assignment 5A, Step 5).
export default function NewIncidentPage() {
  const router = useRouter();
  const { name, role } = useRole();
  const [form, setForm] = useState({
    department: '',
    location: '',
    radio_description: '',
    product_known: true,
    product_name: '',
    quantity: '',
    container_condition: '',
    continuing_leak: false,
    equipment_involved: false,
    asset_id: '',
    scene_notes: '',
  });
  const [saving, setSaving] = useState(false);

  function set(k: string, v: any) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(emergency: boolean) {
    setSaving(true);
    const res = await fetch('/api/incidents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        reporter_name: name || 'Unknown',
        reporter_role: role,
        emergency_escalation: emergency,
        status: emergency ? 'Emergency Escalated' : 'Reported',
        actor: name || 'Unknown',
        actorRole: role,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.incident) router.push(`/incidents/${data.incident.id}`);
    else alert(data.error || 'Failed to create incident');
  }

  return (
    <div className="text-sm">
      <Link href="/" className="underline">
        ← Dashboard
      </Link>
      <h1 className="text-lg font-bold my-2">New Incident</h1>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col">
          Reported by (department / name)
          <input className="border p-1" value={form.department} onChange={(e) => set('department', e.target.value)} />
        </label>
        <label className="flex flex-col">
          Location
          <input className="border p-1" value={form.location} onChange={(e) => set('location', e.target.value)} />
        </label>
        <label className="flex flex-col col-span-2">
          Radio description
          <textarea className="border p-1" value={form.radio_description} onChange={(e) => set('radio_description', e.target.value)} />
        </label>
        <label className="flex flex-col">
          Product known?
          <select
            className="border p-1"
            value={form.product_known ? 'yes' : 'no'}
            onChange={(e) => set('product_known', e.target.value === 'yes')}
          >
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        <label className="flex flex-col">
          Product / label
          <input
            className="border p-1"
            value={form.product_name}
            disabled={!form.product_known}
            onChange={(e) => set('product_name', e.target.value)}
          />
        </label>
        <label className="flex flex-col">
          Quantity
          <input className="border p-1" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} />
        </label>
        <label className="flex flex-col">
          Container condition
          <input className="border p-1" value={form.container_condition} onChange={(e) => set('container_condition', e.target.value)} />
        </label>
        <label className="flex flex-col">
          Continuing leak?
          <select
            className="border p-1"
            value={form.continuing_leak ? 'yes' : 'no'}
            onChange={(e) => set('continuing_leak', e.target.value === 'yes')}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </label>
        <label className="flex flex-col">
          Equipment involved?
          <select
            className="border p-1"
            value={form.equipment_involved ? 'yes' : 'no'}
            onChange={(e) => set('equipment_involved', e.target.value === 'yes')}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </label>
        {form.equipment_involved && (
          <label className="flex flex-col">
            Asset ID
            <input className="border p-1" value={form.asset_id} onChange={(e) => set('asset_id', e.target.value)} />
          </label>
        )}
        <label className="flex flex-col col-span-2">
          Scene notes
          <textarea className="border p-1" value={form.scene_notes} onChange={(e) => set('scene_notes', e.target.value)} />
        </label>
      </div>

      <div className="mt-4 flex gap-2">
        <button disabled={saving} onClick={() => submit(true)} className="border px-3 py-1 bg-red-700 text-white disabled:opacity-50">
          Emergency Escalation
        </button>
        <button disabled={saving} onClick={() => submit(false)} className="border px-3 py-1 bg-green-700 text-white disabled:opacity-50">
          Save
        </button>
      </div>
    </div>
  );
}
