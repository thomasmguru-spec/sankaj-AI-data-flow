import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl.searchParams.get('url');
    if (!url) {
      return new NextResponse('Missing URL', { status: 400 });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    const headers: Record<string, string> = {};
    if (accountSid && authToken) {
      const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }

    // Fetch the image from Twilio (or any origin) with Auth headers
    const twilioRes = await fetch(url, { headers });

    if (!twilioRes.ok) {
      return new NextResponse(`Failed to fetch media: ${twilioRes.statusText}`, { status: twilioRes.status });
    }

    // Pass the image content type and buffer back to the browser
    const buffer = await twilioRes.arrayBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': twilioRes.headers.get('content-type') || 'image/jpeg',
        // Cache the image heavily since twilio URLs don't change content
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err) {
    console.error('Twilio Media Proxy Error:', err);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
