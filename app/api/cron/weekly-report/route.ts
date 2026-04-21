/**
 * Cron: Sunday night at 20:00 IST (14:30 UTC).
 * Builds the weekly report (last 7 days), uploads, WhatsApps to admin.
 */
import { NextRequest } from 'next/server';
import { renderWeeklyReportPdf } from '@/lib/reports';
import { uploadReportPdf } from '@/lib/storage';
import { sendWhatsAppDocument } from '@/lib/whatsapp';

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

  const adminPhone = process.env.ADMIN_WHATSAPP_NUMBER;
  if (!adminPhone) {
    return Response.json({ ok: false, error: 'ADMIN_WHATSAPP_NUMBER not set' }, { status: 500 });
  }

  try {
    const { buffer, weekStartStr, weekEndStr, data } = await renderWeeklyReportPdf();
    const filename = `weekly-report-${weekStartStr}-to-${weekEndStr}.pdf`;
    const upload = await uploadReportPdf(buffer, filename);

    const rate = data.weekTotal.expected > 0
      ? Math.round((data.weekTotal.collected / data.weekTotal.expected) * 100)
      : 0;
    const caption =
      `📈 Weekly report — ${weekStartStr} to ${weekEndStr}\n\n` +
      `Collected: ₹${data.weekTotal.collected.toLocaleString('en-IN')} (${data.weekTotal.count})\n` +
      `Expected: ₹${data.weekTotal.expected.toLocaleString('en-IN')}\n` +
      `Rate: ${rate}%\n` +
      `New loans: ${data.newLoans.length}\n` +
      `Completed: ${data.completedLoans.length}\n` +
      `Overdue: ${data.overdueSnapshot.count} (₹${data.overdueSnapshot.amount.toLocaleString('en-IN')})`;

    const send = await sendWhatsAppDocument(adminPhone, upload.url, filename, caption);
    return Response.json({
      ok: send.ok ?? false,
      weekStartStr, weekEndStr,
      reason: send.reason,
      url: upload.url,
    });
  } catch (e) {
    console.error('weekly-report cron failed:', e);
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export const POST = GET;
