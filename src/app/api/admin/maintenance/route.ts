/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

type Action =
  | 'clearAllHistory'
  | 'clearAllPlayRecords'
  | 'clearAllSearchHistory';

function parseAction(value: unknown): Action | null {
  if (value === 'clearAllHistory') return value;
  if (value === 'clearAllPlayRecords') return value;
  if (value === 'clearAllSearchHistory') return value;
  return null;
}

export async function POST(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json(
      { error: '不支持本地存储进行管理员操作' },
      { status: 400 }
    );
  }

  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo?.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const operator = authInfo.username;
  if (operator !== process.env.USERNAME) {
    return NextResponse.json({ error: '仅站长可执行此操作' }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: Action;
    };
    const action = parseAction(body.action);
    if (!action) {
      return NextResponse.json({ error: '参数格式错误' }, { status: 400 });
    }

    const config = await getConfig();
    const storageUsers = await db.getAllUsers();
    const all = new Set<string>([
      ...config.UserConfig.Users.map((u) => u.username),
      ...storageUsers,
      ...(process.env.USERNAME ? [process.env.USERNAME] : []),
    ]);

    let clearedPlay = 0;
    let clearedSearch = 0;

    const allUsers = Array.from(all);
    for (const uname of allUsers) {
      if (!uname) continue;

      if (action === 'clearAllHistory' || action === 'clearAllPlayRecords') {
        const records = await db.getAllPlayRecords(uname);
        for (const key of Object.keys(records)) {
          const [source, id] = key.split('+');
          if (!source || !id) continue;
          await db.deletePlayRecord(uname, source, id);
          clearedPlay += 1;
        }
      }

      if (action === 'clearAllHistory' || action === 'clearAllSearchHistory') {
        await db.deleteSearchHistory(uname);
        clearedSearch += 1;
      }
    }

    return NextResponse.json(
      {
        ok: true,
        users: all.size,
        clearedPlayRecords: clearedPlay,
        clearedSearchHistoryUsers: clearedSearch,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (e) {
    console.error('维护操作失败:', e);
    return NextResponse.json({ error: '维护操作失败' }, { status: 500 });
  }
}
