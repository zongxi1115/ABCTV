import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

// 重定向方案：直接重定向到原始视频 URL
function handleRedirect(videoUrl: string) {
  // 使用 Response 直接返回，避免缓存和 Next.js 自动后续处理
  return new Response(null, {
    status: 302,
    headers: {
      Location: videoUrl,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}

// 转发方案：服务端转发视频流
async function handleForward(videoUrl: string, request: Request) {
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
      if (upstreamResponse.status === 403 || upstreamResponse.status === 404) {
        // 如果源站报错且我们是转发模式，尝试降级到重定向
        return handleRedirect(videoUrl);
      }
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
      // 'cache-control', // 故意禁掉，避免浏览器缓存旧方案
    ];

    for (const name of passthroughHeaderNames) {
      const value = upstreamResponse.headers.get(name);
      if (value) headers.set(name, value);
    }

    headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');

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
    // 报错时兜底重定向
    return handleRedirect(videoUrl);
  }
}

// 视频代理：支持重定向和转发两种方案
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoUrl = searchParams.get('url');

  if (!videoUrl) {
    return NextResponse.json({ error: 'Missing video URL' }, { status: 400 });
  }

  // 1. 优先从环境变量获取模式
  const mode = (process.env.VIDEO_PROXY_MODE || 'redirect')
    .trim()
    .toLowerCase();

  // 2. 如果是重定向模式，直接返回 302
  if (mode === 'redirect') {
    return NextResponse.redirect(videoUrl, 302);
  }

  // 3. 转发模式下的安全检查
  if (!isAllowedVideoUrl(videoUrl)) {
    // 如果不满足安全域名，强制重定向兜底
    return NextResponse.redirect(videoUrl, 302);
  }

  // 4. 执行转发
  return handleForward(videoUrl, request);
}
