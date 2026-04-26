import { NextRequest, NextResponse } from 'next/server';
import { bulkCollectPayments } from '@/lib/db/loans';
import { getLoanAdmin, getPaymentsAdmin } from '@/lib/db/loans';
import { localDateStr } from '@/lib/calculations';
import { sendWhatsAppPaymentReceived } from '@/lib/whatsapp';

interface BulkCollectItem {
  loanId: string;
  paymentId: string;
  paidAmount: number;
  paidDate: string | null;
  notes?: string;
}

/**
 * Collect many payments in one round-trip.
 * Uses a Supabase upsert (single SQL statement) instead of a Firestore batch.
 * Client sends one POST; this writes everything and returns optimistic-update data.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const items: BulkCollectItem[] = Array.isArray(body?.payments) ? body.payments : [];

    if (items.length === 0) {
      return NextResponse.json({ error: 'payments array required' }, { status: 400 });
    }
    if (items.length > 500) {
      return NextResponse.json({ error: 'Max 500 payments per request' }, { status: 400 });
    }

    const today = localDateStr(new Date());

    const { updates, skipped, completedLoanIds } = await bulkCollectPayments(
      items.map(i => ({
        loanId:     i.loanId,
        paymentId:  i.paymentId,
        paidAmount: Math.max(0, Number(i.paidAmount) || 0),
        paidDate:   i.paidDate ?? (Number(i.paidAmount) > 0 ? today : null),
        notes:      i.notes,
      }))
    );

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No matching payments', skipped }, { status: 404 });
    }

    // WhatsApp notifications per loan — non-blocking
    const affectedLoanIds = [...new Set(updates.map(u => u.loanId))];
    for (const loanId of affectedLoanIds) {
      const loanUpdates = updates.filter(u => u.loanId === loanId);
      const totalPaidInBatch = loanUpdates.reduce((s, u) => s + u.paidAmount, 0);
      if (totalPaidInBatch <= 0) continue;

      const loan = await getLoanAdmin(loanId);
      if (!loan?.customerPhone) continue;

      const allPayments = await getPaymentsAdmin(loanId);
      const totalCollected = allPayments.reduce((s, p) => s + (p.paidAmount || 0), 0);
      const outstanding = Math.max(0, loan.principal - totalCollected);
      const remaining = allPayments.filter(p => p.status !== 'paid').length;

      sendWhatsAppPaymentReceived(loan, totalPaidInBatch, outstanding, remaining)
        .catch(console.error);
    }

    return NextResponse.json({ updated: updates.length, skipped, completedLoanIds, updates });
  } catch (e: any) {
    console.error('[bulk-collect] error:', e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Bulk collect failed: ${msg}` }, { status: 500 });
  }
}
