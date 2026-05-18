import { NextRequest, NextResponse } from 'next/server';

const AGGREGATOR_URL = process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR_URL || 'https://aggregator.walrus-testnet.walrus.space';
const PUBLISHER_URL = process.env.NEXT_PUBLIC_WALRUS_PUBLISHER_URL || 'https://publisher.walrus-testnet.walrus.space';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const blobId = searchParams.get('blobId');

  if (!blobId) {
    return NextResponse.json({ error: 'Missing blobId parameter.' }, { status: 400 });
  }

  try {
    const response = await fetch(`${AGGREGATOR_URL}/v1/blobs/${blobId}`);

    if (!response.ok) {
      return NextResponse.json({ error: `Aggregator failed with status ${response.status}` }, { status: response.status });
    }

    const contentType = response.headers.get('Content-Type') || 'application/json';
    const data = await response.text();

    return new NextResponse(data, {
      headers: {
        'Content-Type': contentType,
      },
    });
  } catch (err) {
    console.error('Walrus aggregator proxy failed:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const epochs = searchParams.get('epochs') || '53';

  try {
    const blob = await req.blob();

    const response = await fetch(`${PUBLISHER_URL}/v1/blobs?epochs=${epochs}`, {
      method: 'PUT',
      body: blob,
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json({ error: data }, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('Walrus publisher proxy failed:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
