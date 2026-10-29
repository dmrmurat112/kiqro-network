import { NextResponse, type NextRequest } from 'next/server';
import { advertiserConversions, conversionsCsv, getAdvertiserSession, type PublicStatus } from '@kiqro/network/advertiser';
import { db } from '@/lib/db';
import { ADV_COOKIE } from '@/lib/session';

const STATUSES: PublicStatus[] = ['billed', 'not_billed', 'in_review', 'refunded'];

/** CSV download of the conversion log (up to 10,000 most recent rows) for MMP reconciliation. */
export async function GET(req: NextRequest) {
  const session = await getAdvertiserSession(db, req.cookies.get(ADV_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const status = STATUSES.find((s) => s === req.nextUrl.searchParams.get('status'));
  const campaignId = req.nextUrl.searchParams.get('campaign') ?? undefined;
  // advertiserConversions filters by the session's organization, so a foreign campaign id yields no rows.
  const rows = await advertiserConversions(db, session.org.id, { status, campaignId, limit: 10_000 });
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(conversionsCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="kiqro-conversions-${date}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
