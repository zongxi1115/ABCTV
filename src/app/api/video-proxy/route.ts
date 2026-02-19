import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function isAllowedVideoUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:') return false;

    // 只允许豆瓣相关 CDN，避免 SSRF
    const host = url.hostname.toLowerCase();
    if (host === 'doubanio.com' || host.endsWith('.doubanio.com')) return true;

    return false;
  } catch {
    return false;
  }
}

// 同源视频代理：解决跨站防盗链/Range 问题
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoUrl = searchParams.get('url');

  if (!videoUrl) {
    return NextResponse.json({ error: 'Missing video URL' }, { status: 400 });
  }

  if (!isAllowedVideoUrl(videoUrl)) {
    return NextResponse.json({ error: 'Invalid video URL' }, { status: 400 });
  }

  const range = request.headers.get('range') || undefined;

  try {
    const upstreamResponse = await fetch(videoUrl, {
      headers: {
        ...(range ? { Range: range } : {}),
        Referer: 'https://movie.douban.com/',
        Origin: 'https://movie.douban.com',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        Accept: '*/*',
      },
    });

    if (!upstreamResponse.ok && upstreamResponse.status !== 206) {
      return NextResponse.json(
        { error: upstreamResponse.statusText },
        { status: upstreamResponse.status }
      );
    }

    if (!upstreamResponse.body) {
      return NextResponse.json(
        { error: 'Video response has no body' },
        { status: 500 }
      );
    }

    const headers = new Headers();

    const passthroughHeaderNames = [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
      'etag',
      'last-modified',
      'cache-control',
    ];

    for (const name of passthroughHeaderNames) {
      const value = upstreamResponse.headers.get(name);
      if (value) headers.set(name, value);
    }

    // 强制允许 Range（部分 CDN 会丢）
    if (!headers.get('accept-ranges')) {
      headers.set('accept-ranges', 'bytes');
    }

    // 同源即可，不需要 CORS；但加上也不影响播放/调试
    headers.set('Access-Control-Allow-Origin', '*');

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers,
    });
  } catch {
    return NextResponse.json(
      { error: 'Error fetching video' },
      { status: 500 }
    );
  }
}
