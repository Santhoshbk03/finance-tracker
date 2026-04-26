import { NextRequest, NextResponse } from 'next/server';
import { getLoanAdmin, getPaymentsAdmin } from '@/lib/db/loans';
import { sendWhatsAppReminder } from '@/lib/whatsapp';
import { computePaymentStatus } from '@/lib/calculations';

export async function POST(request: NextRequest) {
  try {
    const { loan_id, payment_id } = await request.json();
    if (!loan_id || !payment_id) {
      return NextResponse.json({ error: 'loan_id and payment_id required' }, { status: 400 });
    }

    const loan = await getLoanAdmin(loan_id);
    if (!loan) return NextResponse.json({ error: 'Loan not found' }, { status: 404 });
    if (!loan.customerPhone) return NextResponse.json({ error: 'No phone number' }, { status: 400 });

    const payments = await getPaymentsAdmin(loan_id);
    const payment = payments.find((p) => p.id === payment_id);
    if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 });

    const totalCollected = payments.reduce((s, p) => s + p.paidAmount, 0);
    const outstanding = Math.max(0, loan.principal - totalCollected);

    await sendWhatsAppReminder(
      loan.customerPhone,
      payment.expectedAmount,
      payment.dueDate,
      payment.periodNumber,
      loan.planType,
      outstanding
    );

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to send WhatsApp message' }, { status: 500 });
  }
}
