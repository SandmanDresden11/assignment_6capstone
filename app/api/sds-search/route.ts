import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET /api/sds-search?q=... -- search the small seeded approved SDS list
// (deterministic, fixed-rule search per Assignment 5A Step 2 / Step 6; no
// Claude involvement here -- candidate comparison is explicitly deferred).
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() || '';

  let query = supabase.from('sds_records').select('*').limit(10);
  if (q) {
    query = query.or(`product_name.ilike.%${q}%,manufacturer.ilike.%${q}%,identifier.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ results: data });
}
