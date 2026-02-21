/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

function parseLimit(value: string | null, fallback = 200) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(Math.floor(n), 500));
}

export async function GET(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json(
      { error: '不支持本地存储进行管理员查询' },
      { status: 400 }
    );
  }

  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo?.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const operator = authInfo.username;

  try {
    const { searchParams } = new URL(request.url);
    const targetUsername = (searchParams.get('username') || '').trim();
    const limit = parseLimit(searchParams.get('limit'), 200);
    if (!targetUsername) {
      return NextResponse.json(
        { error: '缺少 username 参数' },
        { status: 400 }
      );
    }

    const config = await getConfig();

    const operatorIsOwner = operator === process.env.USERNAME;
    const operatorEntry = config.UserConfig.Users.find(
      (u) => u.username === operator
    );
    const operatorIsAdmin = operatorEntry?.role === 'admin';
    if (!operatorIsOwner && !operatorIsAdmin) {
      return NextResponse.json({ error: '权限不足' }, { status: 401 });
    }

    // 管理员不允许查询站长
    if (!operatorIsOwner) {
      const targetEntry = config.UserConfig.Users.find(
        (u) => u.username === targetUsername
      );
      if (
        targetEntry?.role === 'owner' ||
        targetUsername === process.env.USERNAME
      ) {
        return NextResponse.json({ error: '权限不足' }, { status: 401 });
      }
    }

    const playRecordsObj = await db.getAllPlayRecords(targetUsername);
    const playRecords = Object.entries(playRecordsObj)
      .map(([key, record]) => ({
        key,
        ...record,
      }))
      .sort((a, b) => (Number(b.save_time) || 0) - (Number(a.save_time) || 0))
      .slice(0, limit);

    const searchHistory = await db.getSearchHistory(targetUsername);

    return NextResponse.json(
      {
        user: targetUsername,
        playRecords,
        searchHistory,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (e) {
    console.error('管理员查询历史失败:', e);
    return NextResponse.json({ error: '管理员查询历史失败' }, { status: 500 });
  }
}
