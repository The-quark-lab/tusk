import { NextRequest, NextResponse } from 'next/server';

const AIRTABLE_API = 'https://api.airtable.com/v0/meta/bases';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const baseId = searchParams.get('baseId');
  const userPat = req.headers.get('x-airtable-pat');

  if (!baseId) {
    return NextResponse.json({ error: 'Missing baseId query parameter.' }, { status: 400 });
  }
  if (!userPat) {
    return NextResponse.json({ error: 'Missing x-airtable-pat header.' }, { status: 400 });
  }

  const airtableRes = await fetch(`${AIRTABLE_API}/${baseId}/tables`, {
    headers: {
      Authorization: `Bearer ${userPat}`,
    },
  });

  const data = await airtableRes.json();

  if (!airtableRes.ok) {
    return NextResponse.json({ error: data }, { status: airtableRes.status });
  }

  return NextResponse.json(data);
}
