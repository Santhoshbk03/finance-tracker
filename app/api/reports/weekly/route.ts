import { NextRequest } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { renderWeeklyReportPdf } from '@/lib/reports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return new Response('Unauthorized', { status: 401 });
  }

  const start = req.nextUrl.searchParams.get('start') || undefined;
  const end = req.nextUrl.searchParams.get('end') || undefined;

  const { buffer, weekStartStr, weekEndStr } = await renderWeeklyReportPdf({
    weekStart: start, weekEnd: end,
  });

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="weekly-report-${weekStartStr}-to-${weekEndStr}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
