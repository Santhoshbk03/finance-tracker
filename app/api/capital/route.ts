import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase-admin';

// ─── GET: list all capital entries (sorted by date asc) ──────────────────────
export async function GET() {
  try {
    const { data, error } = await db
      .from('capital_entries')
      .select('*')
      .order('date', { ascending: true });
    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (e: any) {
    const msg: string = e?.message ?? String(e);
    console.error('[capital GET]', msg);
    // Surface the real error so the client can show actionable instructions
    // (e.g. "table does not exist" → user knows to run the migration SQL)
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── POST: create a new capital entry ────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const { date, amount, note } = await request.json();
    if (!date || !amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return NextResponse.json({ error: 'date and positive amount are required' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
    }

    const { data, error } = await db.from('capital_entries').insert({
      date,
      amount: Number(amount),
      note: note || '',
    }).select().single();
    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (e: any) {
    const msg: string = e?.message ?? String(e);
    console.error('[capital POST]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
