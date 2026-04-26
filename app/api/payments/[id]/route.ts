import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase-admin';
import { getLoanAdmin, getPaymentsAdmin, updateLoanAdmin } from '@/lib/db/loans';
import { localDateStr } from '@/lib/calculations';
import { sendWhatsAppPaymentReceived } from '@/lib/whatsapp';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { paid_amount, paid_date, notes, loan_id } = await request.json();

    if (!loan_id) {
      return NextResponse.json({ error: 'loan_id is required' }, { status: 400 });
    }

    // Fetch current payment
    const { data: payment, error: fetchErr } = await db
      .from('payments')
      .select('*')
      .eq('id', id)
      .eq('loan_id', loan_id)
      .single();
    if (fetchErr || !payment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const amount = Math.max(0, parseFloat(paid_amount) || 0);
    const today = localDateStr(new Date());
    let status: string;
    if (amount >= Number(payment.expected_amount)) status = 'paid';
    else if (amount > 0) status = 'partial';
    else status = payment.due_date < today ? 'overdue' : 'pending';

    const { error: updateErr } = await db.from('payments').update({
      paid_amount:  amount,
      paid_date:    amount > 0 ? (paid_date || today) : null,
      status,
      notes:        notes || '',
      updated_at:   new Date().toISOString(),
    }).eq('id', id);
    if (updateErr) throw updateErr;

    // Check if loan is now fully paid → mark completed
    const allPayments = await getPaymentsAdmin(loan_id);
    const allPaid = allPayments.length > 0 &&
      allPayments.every(p => p.id === id ? status === 'paid' : p.status === 'paid');
    if (allPaid) await updateLoanAdmin(loan_id, { status: 'completed' });

    // WhatsApp notification (non-blocking)
    if (amount > 0) {
      const loan = await getLoanAdmin(loan_id);
      if (loan?.customerPhone) {
        const totalCollected = allPayments.reduce((s, p) =>
          s + (p.id === id ? amount : p.paidAmount), 0);
        const outstanding = Math.max(0, loan.principal - totalCollected);
        const remaining = allPayments.filter(p =>
          p.id === id ? status !== 'paid' : p.status !== 'paid').length;
        sendWhatsAppPaymentReceived(loan, amount, outstanding, remaining).catch(console.error);
      }
    }

    const { data: updated } = await db.from('payments').select('*').eq('id', id).single();
    return NextResponse.json({ id: updated?.id, loanId: loan_id, ...updated });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to update payment' }, { status: 500 });
  }
}
