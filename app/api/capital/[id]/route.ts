import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase-admin';

// ─── PUT: update a capital entry ─────────────────────────────────────────────
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { date, amount, note } = await request.json();

    if (!date || !amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return NextResponse.json({ error: 'date and positive amount are required' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
    }

    const { data, error } = await db.from('capital_entries').update({
      date,
      amount: Number(amount),
      note: note || '',
      updated_at: new Date().toISOString(),
    }).eq('id', id).select().single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to update capital entry' }, { status: 500 });
  }
}

// ─── DELETE: remove a capital entry ──────────────────────────────────────────
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { error } = await db.from('capital_entries').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to delete capital entry' }, { status: 500 });
  }
}
