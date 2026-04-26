/**
 * Cron: daily morning at 09:00 IST (03:30 UTC).
 * WhatsApps each customer whose payment is due today.
 */
import { NextRequest } from 'next/server';
import { getAllActiveLoansWithPayments } from '@/lib/db/loans';
import { sendWhatsAppReminder } from '@/lib/whatsapp';
import { localDateStr } from '@/lib/calculations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function unauthorized(req: NextRequest) {
  const token = req.headers.get('authorization');
  const expected = process.env.CRON_SECRET;
  return !expected || (token !== `Bearer ${expected}` && req.headers.get('x-cron-secret') !== expected);
}

export async function GET(req: NextRequest) {
  if (unauthorized(req)) return new Response('Unauthorized', { status: 401 });

  const today = localDateStr(new Date());
  const lps = await getAllActiveLoansWithPayments();
  const results: Array<{ customer: string; ok: boolean; reason?: string }> = [];

  for (const { loan, payments } of lps) {
    const totalPaid = payments.reduce((s, p) => s + (p.paidAmount || 0), 0);
    const outstanding = Math.max(0, loan.principal - totalPaid);

    for (const p of payments) {
      if (p.dueDate === today && (p.paidAmount || 0) < (p.expectedAmount || 0)) {
        if (!loan.customerPhone) {
          results.push({ customer: loan.customerName, ok: false, reason: 'no-phone' });
          continue;
        }
        try {
          await sendWhatsAppReminder(
            loan.customerPhone,
            (p.expectedAmount || 0) - (p.paidAmount || 0),
            p.dueDate,
            p.periodNumber,
            loan.planType,
            outstanding,
          );
          results.push({ customer: loan.customerName, ok: true });
        } catch (e) {
          results.push({ customer: loan.customerName, ok: false, reason: String(e) });
        }
      }
    }
  }

  return Response.json({ ok: true, date: today, sent: results.filter(r => r.ok).length, results });
}

export const POST = GET;
