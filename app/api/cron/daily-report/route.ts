/**
 * Cron: nightly at 21:00 IST (15:30 UTC).
 * Builds "today's collection sheet" + "daily report",
 * uploads both PDFs to Firebase Storage, and WhatsApps them to the admin.
 *
 * Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`.
 */
import { NextRequest } from 'next/server';
import { renderTodayCollectionPdf, renderDailyReportPdf } from '@/lib/reports';
import { uploadReportPdf } from '@/lib/storage';
import { sendWhatsAppDocument } from '@/lib/whatsapp';
import { localDateStr } from '@/lib/calculations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function unauthorized(req: NextRequest) {
  const token = req.headers.get('authorization');
  const expected = process.env.CRON_SECRET;
  // Vercel Cron sends `Bearer <CRON_SECRET>`; allow explicit header match too.
  return !expected || (token !== `Bearer ${expected}` && req.headers.get('x-cron-secret') !== expected);
}

export async function GET(req: NextRequest) {
  if (unauthorized(req)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const adminPhone = process.env.ADMIN_WHATSAPP_NUMBER;
  if (!adminPhone) {
    return Response.json({ ok: false, error: 'ADMIN_WHATSAPP_NUMBER not set' }, { status: 500 });
  }

  const dateStr = localDateStr(new Date());
  const deliveries: Array<{ type: string; ok: boolean; reason?: string; url?: string }> = [];

  try {
    // 1. Today's collection sheet (for tomorrow morning's collection)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = localDateStr(tomorrow);
    const { buffer: sheetBuf, rowCount } = await renderTodayCollectionPdf(tomorrowStr);
    const sheetFile = `collection-sheet-${tomorrowStr}.pdf`;
    const sheetUpload = await uploadReportPdf(sheetBuf, sheetFile);
    const sheetSend = await sendWhatsAppDocument(
      adminPhone,
      sheetUpload.url,
      sheetFile,
      `📋 Collection sheet for tomorrow (${tomorrowStr})\n${rowCount} customer${rowCount === 1 ? '' : 's'} to collect from.`,
    );
    deliveries.push({ type: 'today-sheet', ok: sheetSend.ok ?? false, reason: sheetSend.reason, url: sheetUpload.url });

    // 2. Daily report for today
    const { buffer: dailyBuf, data } = await renderDailyReportPdf(dateStr);
    const dailyFile = `daily-report-${dateStr}.pdf`;
    const dailyUpload = await uploadReportPdf(dailyBuf, dailyFile);
    const rate = data.expectedToday.amount > 0
      ? Math.round((data.collectedToday.amount / data.expectedToday.amount) * 100)
      : 0;
    const caption =
      `📊 Daily report — ${dateStr}\n\n` +
      `Collected: ₹${data.collectedToday.amount.toLocaleString('en-IN')} (${data.collectedToday.count})\n` +
      `Expected: ₹${data.expectedToday.amount.toLocaleString('en-IN')} (${data.expectedToday.count})\n` +
      `Rate: ${rate}%\n` +
      `Overdue: ${data.overdue.length}`;
    const dailySend = await sendWhatsAppDocument(adminPhone, dailyUpload.url, dailyFile, caption);
    deliveries.push({ type: 'daily-report', ok: dailySend.ok ?? false, reason: dailySend.reason, url: dailyUpload.url });

    return Response.json({ ok: true, dateStr, deliveries });
  } catch (e) {
    console.error('daily-report cron failed:', e);
    return Response.json({ ok: false, error: String(e), deliveries }, { status: 500 });
  }
}

// Also allow POST so you can trigger manually via a button
export const POST = GET;
