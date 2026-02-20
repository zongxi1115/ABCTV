import { NextResponse } from 'next/server';

import { db } from '@/lib/db';

export const runtime = 'nodejs';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const MAX_KEYWORD_LEN = 60;

function getStorageType(): string {
  return process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
}

function parseLimit(raw: unknown): number {
  const n =
    typeof raw === 'string'
      ? Number.parseInt(raw, 10)
      : typeof raw === 'number'
      ? raw
      : DEFAULT_LIMIT;
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.min(Math.max(n, 1), MAX_LIMIT);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

/**
 * GET /api/searchrank?limit=10
 * 返回 SearchRankItem[]
 */
export async function GET(request: Request) {
  // localstorage 模式下服务端没有存储实现，直接返回空数组，避免 500
  if (getStorageType() === 'localstorage') {
    return NextResponse.json([], { status: 200 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = parseLimit(searchParams.get('limit'));
    const list = await db.getSearchRank(limit);
    return NextResponse.json(list, { status: 200 });
  } catch {
    return NextResponse.json({ error: '获取搜索排行榜失败' }, { status: 500 });
  }
}

/**
 * POST /api/searchrank
 * body: { keyword: string; limit?: number }
 * 返回最新 SearchRankItem[]
 */
export async function POST(request: Request) {
  // localstorage 模式下服务端没有存储实现，直接返回空数组，避免 500
  if (getStorageType() === 'localstorage') {
    return NextResponse.json([], { status: 200 });
  }

  try {
    const body: unknown = await request.json().catch(() => ({}));
    const obj = asRecord(body) || {};
    const keywordRaw = obj.keyword;
    const keyword = typeof keywordRaw === 'string' ? keywordRaw.trim() : '';
    const limit = parseLimit(obj.limit);

    if (!keyword) {
      return NextResponse.json(
        { error: 'Keyword is required' },
        { status: 400 }
      );
    }
    if (keyword.length > MAX_KEYWORD_LEN) {
      return NextResponse.json(
        { error: 'Keyword is too long' },
        { status: 400 }
      );
    }

    await db.incrementSearchRank(keyword);
    const list = await db.getSearchRank(limit);
    return NextResponse.json(list, { status: 200 });
  } catch {
    return NextResponse.json({ error: '更新搜索排行榜失败' }, { status: 500 });
  }
}
