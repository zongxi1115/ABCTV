import { NextResponse } from 'next/server';

import { DanmuItem } from '@/lib/types';

export const runtime = 'nodejs';

type DanmuSearchEpisode = {
  episodeId: number;
  episodeTitle: string;
};

type DanmuSearchAnime = {
  animeId: number;
  animeTitle: string;
  type?: string;
  typeDescription?: string;
  episodes: DanmuSearchEpisode[];
};

type DanmuSearchResponse = {
  errorCode: number;
  success: boolean;
  errorMessage?: string;
  animes?: DanmuSearchAnime[];
};

type DanmuComment = {
  cid: number;
  p: string;
  m: string;
  t: number;
};

type DanmuCommentResponse = {
  count: number;
  comments: DanmuComment[];
};

function getDanmuBaseUrl(): string {
  const raw =
    process.env.DANMU_API ||
    // allow user-provided lowercase key
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((process.env as any).danmu_api as string | undefined) ||
    'danmu.062679.xyz';

  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return `https://${raw}`;
}

function normalizeTitle(input: string): string {
  return (input || '')
    .trim()
    .toLowerCase()
    .replaceAll(' ', '')
    .replaceAll(String.fromCharCode(0x200b), '')
    .replaceAll(String.fromCharCode(0x200c), '')
    .replaceAll(String.fromCharCode(0x200d), '')
    .replaceAll(String.fromCharCode(0xfeff), '')
    .replace(/[()（）【】「」_.·•:：,，!！?？]/g, '')
    .replaceAll('-', '')
    .replaceAll('[', '')
    .replaceAll(']', '');
}

function extractEpisodeNumber(title: string): number | null {
  const t = (title || '').replaceAll('\n', ' ').replaceAll('\r', ' ');

  // common patterns: 第12集 / 第01话 / 12集 / 12话
  const m1 = t.match(/第\s*0*(\d{1,4})\s*(集|话)/);
  if (m1) return Number(m1[1]);

  const m2 = t.match(/\b0*(\d{1,4})\b\s*(集|话)/);
  if (m2) return Number(m2[1]);

  return null;
}

function parseColorToCss(value: string): string {
  const v = (value || '').trim();
  if (!v) return '#ffffff';

  // hex string e.g. FFFFFF / 0xFFFFFF
  if (/^0x[0-9a-fA-F]+$/.test(v)) {
    const hex = v.slice(2).padStart(6, '0').slice(-6);
    return `#${hex.toLowerCase()}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(v)) {
    return `#${v.toLowerCase()}`;
  }

  // decimal like 16777215
  const dec = Number(v);
  if (Number.isFinite(dec) && dec >= 0) {
    const hex = Math.round(dec).toString(16).padStart(6, '0').slice(-6);
    return `#${hex.toLowerCase()}`;
  }

  return '#ffffff';
}

function parseDanmuComments(raw: DanmuCommentResponse): DanmuItem[] {
  const items: DanmuItem[] = [];
  for (const c of raw.comments || []) {
    const parts = (c.p || '').split(',');
    const time = Number(parts[0]);
    const position = Number(parts[1]);
    const color = parseColorToCss(parts[2] || '');
    const text = c.m ?? '';

    if (!Number.isFinite(time) || time < 0) continue;
    if (!text) continue;

    items.push({
      time,
      mode: position === 5 ? 'top' : 'scroll',
      color,
      text,
    });
  }

  items.sort((a, b) => a.time - b.time);
  return items;
}

function pickBestAnime(
  animes: DanmuSearchAnime[],
  queryTitle: string,
  targetEpisode: number,
  year?: string
): { anime: DanmuSearchAnime; episode: DanmuSearchEpisode } | null {
  const q = normalizeTitle(queryTitle);
  const y = (year || '').trim();

  let best:
    | {
        score: number;
        diff: number;
        anime: DanmuSearchAnime;
        episode: DanmuSearchEpisode;
      }
    | undefined;

  for (const anime of animes) {
    if (!anime.episodes || anime.episodes.length === 0) continue;

    let bestEpisode = anime.episodes[0];
    let bestDiff = Number.POSITIVE_INFINITY;

    for (const ep of anime.episodes) {
      const n = extractEpisodeNumber(ep.episodeTitle);
      if (n == null) continue;
      const d = Math.abs(n - targetEpisode);
      if (d < bestDiff) {
        bestDiff = d;
        bestEpisode = ep;
      }
      if (d === 0) break;
    }

    if (!Number.isFinite(bestDiff)) bestDiff = 9999;

    const titleNorm = normalizeTitle(anime.animeTitle);
    const titleScore = titleNorm.includes(q) || q.includes(titleNorm) ? 120 : 0;
    const yearScore = y && anime.animeTitle.includes(y) ? 20 : 0;
    const episodeScore = Math.max(0, 100 - bestDiff * 10);

    const score = titleScore + yearScore + episodeScore;
    if (
      !best ||
      score > best.score ||
      (score === best.score && bestDiff < best.diff)
    ) {
      best = { score, diff: bestDiff, anime, episode: bestEpisode };
    }
  }

  return best ? { anime: best.anime, episode: best.episode } : null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const anime = searchParams.get('anime') || '';
  const episodeStr = searchParams.get('episode') || '';
  const year = searchParams.get('year') || undefined;

  const episode = Number(episodeStr);
  if (!anime.trim() || !Number.isFinite(episode) || episode <= 0) {
    return NextResponse.json(
      { success: false, error: '缺少 anime 或 episode 参数', comments: [] },
      { status: 400 }
    );
  }

  const base = getDanmuBaseUrl();

  try {
    const searchUrl = `${base}/api/v2/search/episodes?anime=${encodeURIComponent(
      anime.trim()
    )}`;
    const searchRes = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'MoonTV/1.0',
      },
    });
    if (!searchRes.ok) {
      return NextResponse.json(
        { success: false, error: '弹幕搜索失败', comments: [] },
        { status: 502 }
      );
    }
    const searchJson = (await searchRes.json()) as DanmuSearchResponse;
    const animes = searchJson.animes || [];
    const picked = pickBestAnime(animes, anime, episode, year);
    if (!picked) {
      return NextResponse.json(
        { success: true, episodeId: null, comments: [] },
        {
          headers: {
            'Cache-Control': 'public, max-age=60, s-maxage=60',
          },
        }
      );
    }

    const { anime: pickedAnime, episode: pickedEpisode } = picked;
    const commentUrl = `${base}/api/v2/comment/${pickedEpisode.episodeId}?format=json`;
    const commentRes = await fetch(commentUrl, {
      headers: {
        'User-Agent': 'MoonTV/1.0',
      },
    });
    if (!commentRes.ok) {
      return NextResponse.json(
        {
          success: false,
          error: '弹幕获取失败',
          episodeId: pickedEpisode.episodeId,
          comments: [],
        },
        { status: 502 }
      );
    }
    const commentJson = (await commentRes.json()) as DanmuCommentResponse;
    const comments = parseDanmuComments(commentJson);

    return NextResponse.json(
      {
        success: true,
        animeId: pickedAnime.animeId,
        animeTitle: pickedAnime.animeTitle,
        episodeId: pickedEpisode.episodeId,
        episodeTitle: pickedEpisode.episodeTitle,
        comments,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=300, s-maxage=300',
        },
      }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: '弹幕服务异常', comments: [] },
      { status: 500 }
    );
  }
}
