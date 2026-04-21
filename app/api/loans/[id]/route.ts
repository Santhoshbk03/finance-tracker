import { NextRequest, NextResponse } from 'next/server';
import { getLoanAdmin, updateLoanAdmin, deleteLoanAdmin, getPaymentsAdmin } from '@/lib/firestore/loans';
import { localDateStr, computePaymentStatus } from '@/lib/calculations';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const loan = await getLoanAdmin(id);
    if (!loan) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const today = localDateStr(new Date());
    let payments = await getPaymentsAdmin(id);

    // Compute display status client-side (no DB write needed)
    payments = payments.map((p) => ({
      ...p,
      status: computePaymentStatus({ ...p, dueDate: p.dueDate, expectedAmount: p.expectedAmount, paidAmount: p.paidAmount }),
    }));

    return NextResponse.json({ ...loan, payments });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to fetch loan' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const existing = await getLoanAdmin(id);
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await updateLoanAdmin(id, {
      notes: body.notes ?? existing.notes,
      status: body.status ?? existing.status,
    });
    return NextResponse.json(await getLoanAdmin(id));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to update loan' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const existing = await getLoanAdmin(id);
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if ('interest_collected' in body) {
      const collected = !!body.interest_collected;
      const date = collected
        ? (body.interest_collected_date || localDateStr(new Date()))
        : null;
      await updateLoanAdmin(id, {
        interestCollected: collected,
        interestCollectedDate: date,
      });
    }

    return NextResponse.json(await getLoanAdmin(id));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to update loan' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteLoanAdmin(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to delete loan' }, { status: 500 });
  }
}
