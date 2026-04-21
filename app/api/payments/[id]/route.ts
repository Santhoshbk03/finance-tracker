import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getLoanAdmin, updateLoanAdmin, getPaymentsAdmin } from '@/lib/firestore/loans';
import { localDateStr } from '@/lib/calculations';
import { sendWhatsAppPaymentReceived } from '@/lib/whatsapp';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { paid_amount, paid_date, notes, loan_id } = await request.json();

    if (!loan_id) {
      return NextResponse.json({ error: 'loan_id is required' }, { status: 400 });
    }

    const paymentRef = adminDb.collection('loans').doc(loan_id).collection('payments').doc(id);
    const paymentSnap = await paymentRef.get();
    if (!paymentSnap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const payment = paymentSnap.data()!;
    const amount = parseFloat(paid_amount) || 0;

    let status: string;
    if (amount >= payment.expectedAmount) {
      status = 'paid';
    } else if (amount > 0) {
      status = 'partial';
    } else {
      const today = localDateStr(new Date());
      status = payment.dueDate < today ? 'overdue' : 'pending';
    }

    const updatedAt = new Date().toISOString();
    await paymentRef.update({
      paidAmount: amount,
      paidDate: paid_date || null,
      status,
      notes: notes || '',
      updatedAt,
    });

    // Check if all payments for the loan are paid → mark loan completed
    const allPayments = await getPaymentsAdmin(loan_id);
    const allPaid = allPayments.length > 0 && allPayments.every((p) =>
      p.id === id ? status === 'paid' : p.status === 'paid'
    );
    if (allPaid) {
      await updateLoanAdmin(loan_id, { status: 'completed' });
    }

    // Send WhatsApp if payment made (non-blocking)
    if (amount > 0) {
      const loan = await getLoanAdmin(loan_id);
      if (loan?.customerPhone) {
        const totalCollected = allPayments.reduce((s, p) =>
          s + (p.id === id ? amount : p.paidAmount), 0
        );
        const outstanding = Math.max(0, loan.principal - totalCollected);
        const remaining = allPayments.filter((p) =>
          p.id === id ? status !== 'paid' : p.status !== 'paid'
        ).length;
        sendWhatsAppPaymentReceived(loan, amount, outstanding, remaining).catch(console.error);
      }
    }

    const updated = await paymentRef.get();
    return NextResponse.json({ id: updated.id, loanId: loan_id, ...updated.data() });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to update payment' }, { status: 500 });
  }
}
