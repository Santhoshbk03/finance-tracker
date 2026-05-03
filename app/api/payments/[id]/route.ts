import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase-admin';
import { getLoanAdmin, getPaymentsAdmin, updateLoanAdmin } from '@/lib/db/loans';
import { localDateStr } from '@/lib/calculations';
import { sendWhatsAppPaymentReceived } from '@/lib/whatsapp';

// ─── PATCH: extend / reschedule due_date ─────────────────────────────────────
// If the new due_date falls after the loan's end_date, the loan's end_date is
// automatically pushed forward to match — keeping the loan term in sync with
// the actual last scheduled payment (e.g. 100-day loan → 101 days).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { due_date, loan_id } = await request.json();

    if (!loan_id) return NextResponse.json({ error: 'loan_id required' }, { status: 400 });
    if (!due_date || !/^\d{4}-\d{2}-\d{2}$/.test(due_date)) {
      return NextResponse.json({ error: 'due_date required in YYYY-MM-DD format' }, { status: 400 });
    }

    // Fetch payment and loan in parallel
    const [{ data: payment, error: fetchErr }, loan] = await Promise.all([
      db.from('payments').select('*').eq('id', id).eq('loan_id', loan_id).single(),
      getLoanAdmin(loan_id),
    ]);
    if (fetchErr || !payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    if (!loan) return NextResponse.json({ error: 'Loan not found' }, { status: 404 });

    // Don't allow rescheduling an already-paid payment
    if (
      payment.status === 'paid' ||
      (Number(payment.paid_amount) >= Number(payment.expected_amount) && Number(payment.expected_amount) > 0)
    ) {
      return NextResponse.json({ error: 'Cannot extend a paid payment' }, { status: 400 });
    }

    const today = localDateStr(new Date());
    const newStatus = due_date < today ? 'overdue' : 'pending';

    // Update payment due_date
    const { error: updateErr } = await db.from('payments').update({
      due_date,
      status: newStatus,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (updateErr) throw updateErr;

    // If the new due_date pushes past the loan's end_date, extend the loan end_date
    // so that "total days" stays accurate (e.g. 100-day loan → 101 days).
    let loanEndDateExtended = false;
    let newLoanEndDate = loan.endDate;
    if (due_date > loan.endDate) {
      await updateLoanAdmin(loan_id, { endDate: due_date });
      loanEndDateExtended = true;
      newLoanEndDate = due_date;
    }

    const { data: updated } = await db.from('payments').select('*').eq('id', id).single();
    return NextResponse.json({
      id: updated?.id,
      loanId: loan_id,
      dueDate: due_date,
      status: newStatus,
      loanEndDateExtended,
      newLoanEndDate,
      ...updated,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to extend payment' }, { status: 500 });
  }
}

// ─── PUT: collect / mark payment paid ────────────────────────────────────────
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
