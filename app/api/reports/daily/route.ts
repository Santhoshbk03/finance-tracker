import { NextRequest } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { renderDailyReportPdf } from '@/lib/reports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return new Response('Unauthorized', { status: 401 });
  }

  const date = req.nextUrl.searchParams.get('date') || undefined;
  const { buffer, dateStr } = await renderDailyReportPdf(date);

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="daily-report-${dateStr}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
