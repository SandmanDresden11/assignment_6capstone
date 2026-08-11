'use client';

import { createContext, useContext, useEffect, useState } from 'react';

type Role = 'Safety' | 'ABM' | 'RME' | 'Problem Solve' | 'Safety Lead';
const ROLES: Role[] = ['Safety', 'ABM', 'RME', 'Problem Solve', 'Safety Lead'];

interface RoleContextValue {
  name: string;
  role: Role;
  setName: (n: string) => void;
  setRole: (r: Role) => void;
}

const RoleContext = createContext<RoleContextValue | null>(null);

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error('useRole must be used inside RoleProvider');
  return ctx;
}

// Simple role selector -- no enterprise identity integration, per the
// Assignment 5A MVP scope table. This is intentionally not authentication;
// it just tags who performed each action for the audit trail.
export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [name, setNameState] = useState('');
  const [role, setRoleState] = useState<Role>('Safety');

  useEffect(() => {
    setNameState(localStorage.getItem('hst_name') || '');
    setRoleState((localStorage.getItem('hst_role') as Role) || 'Safety');
  }, []);

  const setName = (n: string) => {
    setNameState(n);
    localStorage.setItem('hst_name', n);
  };
  const setRole = (r: Role) => {
    setRoleState(r);
    localStorage.setItem('hst_role', r);
  };

  return (
    <RoleContext.Provider value={{ name, role, setName, setRole }}>
      <div className="border border-green-800 bg-green-50 mb-4 p-2 flex flex-wrap gap-2 items-center text-sm">
        <a href="/" className="font-bold text-green-900">
          HAZMAT SPILL RESPONSE TRACKER
        </a>
        <span className="ml-auto">Acting as:</span>
        <input
          className="border px-1 py-0.5"
          placeholder="your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select className="border px-1 py-0.5" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      {children}
    </RoleContext.Provider>
  );
}
