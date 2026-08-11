-- Hazmat Spill Response Tracker (Assignment 5B) schema
-- Run this once in the Supabase SQL Editor (Supabase dashboard -> SQL Editor -> New query).
-- Mirrors the data list from Assignment 5A, Step 3, scoped to the 5B MVP entities:
-- Incidents, SDS Records, Assignments, Handoffs, AI Runs, Audit Events.

create extension if not exists "pgcrypto";

-- ---------- SDS Records ----------
create table if not exists sds_records (
  id uuid primary key default gen_random_uuid(),
  product_name text not null,
  manufacturer text,
  identifier text,
  revision_date date,
  document_url text,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- Incidents ----------
create sequence if not exists incident_code_seq start 1000;

create table if not exists incidents (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('INC-' || nextval('incident_code_seq')::text),
  status text not null default 'Reported',
  priority text default 'Normal',
  site text,
  department text,
  location text,
  radio_description text,
  reporter_name text,
  reporter_role text,
  reporter_contact text,
  safety_responder text,
  safety_lead text,

  -- status timeline
  reported_at timestamptz not null default now(),
  en_route_at timestamptz,
  on_scene_at timestamptz,
  response_selected_at timestamptz,
  cleanup_in_progress_at timestamptz,
  awaiting_problem_solve_at timestamptz,
  closed_at timestamptz,

  -- product and scene
  product_known boolean default true,
  product_name text,
  manufacturer text,
  label_identifier text,
  quantity text,
  container_condition text,
  leak_source text,
  continuing_leak boolean default false,

  equipment_involved boolean default false,
  equipment_name text,
  asset_id text,
  equipment_restricted boolean default false,
  scene_notes text,

  emergency_escalation boolean not null default false,
  escalation_reason text,

  -- SDS and decision support
  selected_sds_id uuid references sds_records(id),
  sds_match_evidence text,
  sds_rejected_candidates jsonb default '[]',
  sds_confirmed_by text,
  sds_confirmed_at timestamptz,
  final_route text,

  -- verification
  verification_status text not null default 'Pending',
  verifier text,
  verification_time timestamptz,
  remaining_restrictions text,
  followup_notes text,

  -- overdue flags set by the scheduled job (Assignment 5B automation #1)
  overdue_flags jsonb not null default '[]',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Assignments (Safety / ABM / RME) ----------
create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references incidents(id) on delete cascade,
  team text not null check (team in ('Safety', 'ABM', 'RME')),
  assigned_person text,
  request_time timestamptz not null default now(),
  acknowledgment_time timestamptz,
  status text not null default 'Requested',
  escalation_reason text,
  completion_time timestamptz,
  completion_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Handoffs (Problem Solve) ----------
create table if not exists handoffs (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references incidents(id) on delete cascade,
  product_condition text,
  destination_station text,
  transfer_owner text,
  approved_note text,
  receiving_associate text,
  transfer_time timestamptz not null default now(),
  receipt_time timestamptz,
  status text not null default 'Pending',
  created_at timestamptz not null default now()
);

-- ---------- AI Runs (Generate Response Brief -- Assignment 5B automation #2) ----------
create table if not exists ai_runs (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references incidents(id) on delete cascade,
  inputs jsonb,
  brief_text text,
  sources jsonb,
  uncertainty_notes text,
  proposed_route text,
  reviewer_corrections text,
  final_route text,
  reviewer text,
  decision text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- Audit Events (append-only) ----------
create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references incidents(id) on delete cascade,
  actor text,
  actor_role text,
  action text not null,
  details jsonb default '{}',
  source text not null default 'user' check (source in ('user', 'system')),
  created_at timestamptz not null default now()
);

create index if not exists idx_assignments_incident on assignments(incident_id);
create index if not exists idx_handoffs_incident on handoffs(incident_id);
create index if not exists idx_ai_runs_incident on ai_runs(incident_id);
create index if not exists idx_audit_events_incident on audit_events(incident_id);
create index if not exists idx_incidents_status on incidents(status);

-- keep updated_at current (also used by the scheduled job as a "last activity" signal)
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_incidents_updated on incidents;
create trigger trg_incidents_updated before update on incidents
  for each row execute function set_updated_at();

drop trigger if exists trg_assignments_updated on assignments;
create trigger trg_assignments_updated before update on assignments
  for each row execute function set_updated_at();

-- ---------- Seed a small approved SDS list (5A: "small seeded list of approved SDS references") ----------
insert into sds_records (product_name, manufacturer, identifier, revision_date, document_url, notes)
values
  ('Cleaner A', 'BrightChem', 'SKU-4471', '2025-02-01', 'https://example.com/sds/cleaner-a.pdf', 'Common floor/line cleaner, mild irritant.'),
  ('Lubricant B', 'MotionWorks', 'SKU-8820', '2024-11-15', 'https://example.com/sds/lubricant-b.pdf', 'Machine lubricant, slip hazard, combustible.'),
  ('Degreaser C', 'IndustrialPro', 'SKU-1190', '2025-05-20', 'https://example.com/sds/degreaser-c.pdf', 'Solvent-based degreaser, flammable vapors.'),
  ('Battery Electrolyte D', 'PowerCell', 'SKU-3305', '2023-09-10', 'https://example.com/sds/electrolyte-d.pdf', 'Corrosive acid solution, requires neutralization kit.')
on conflict do nothing;
