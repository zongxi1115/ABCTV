import { NextResponse } from 'next/server';

import { getCacheTime } from '@/lib/config';
import type { DoubanSubjectBrief } from '@/lib/douban.client';

interface DoubanSubjectApiResponse {
  id: string;
  title: string;
  intro?: string;
  pubdate?: string[];
  card_subtitle?: string;
  year?: string;
  type?: string;
  rating?: {
    value?: number;
  };
  pic?: {
    large?: string;
    normal?: string;
  };
  cover_url?: string;
  trailers?: Array<{
    video_url?: string;
    cover_url?: string;
  }>;
}

function mapDoubanSubjectToBrief(
  data: DoubanSubjectApiResponse
): DoubanSubjectBrief {
  const videoUrl =
    data.trailers?.find((t) => typeof t.video_url === 'string' && t.video_url)
      ?.video_url || '';

  const coverUrl =
    data.cover_url ||
    data.pic?.large ||
    data.pic?.normal ||
    data.trailers?.find((t) => typeof t.cover_url === 'string' && t.cover_url)
      ?.cover_url ||
    '';

  return {
    id: String(data.id || ''),
    title: data.title || '',
    intro: data.intro || '',
    pubdate: Array.isArray(data.pubdate) ? data.pubdate : [],
    card_subtitle: data.card_subtitle || '',
    rating: typeof data.rating?.value === 'number' ? data.rating.value : 0,
    year: data.year || '',
    type: data.type || '',
    cover_url: coverUrl,
    video_url: videoUrl,
  };
}

async function fetchDoubanSubjectData(
  id: string
): Promise<DoubanSubjectApiResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const fetchOptions = {
    signal: controller.signal,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      Referer: 'https://movie.douban.com/',
      Accept: 'application/json, text/plain, */*',
      Origin: 'https://movie.douban.com',
    },
  };

  try {
    const target = `https://m.douban.cmliussss.net/rexxar/api/v2/subject/${id}`;
    const response = await fetch(target, fetchOptions);
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id || !/^[0-9]+$/.test(id)) {
    return NextResponse.json({ error: '缺少必要参数: id' }, { status: 400 });
  }

  try {
    const doubanData = await fetchDoubanSubjectData(id);
    const brief = mapDoubanSubjectToBrief(doubanData);

    const cacheTime = await getCacheTime();
    return NextResponse.json(brief, {
      headers: {
        'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
        'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: '获取豆瓣详情失败', details: (error as Error).message },
      { status: 500 }
    );
  }
}
