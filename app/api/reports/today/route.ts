import { NextRequest } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { renderTodayCollectionPdf } from '@/lib/reports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return new Response('Unauthorized', { status: 401 });
  }

  const date = req.nextUrl.searchParams.get('date') || undefined;
  const { buffer, dateStr } = await renderTodayCollectionPdf(date);

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="collection-sheet-${dateStr}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
