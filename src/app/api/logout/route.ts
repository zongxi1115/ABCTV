import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (authInfo?.username && authInfo.sid) {
      await db.deleteSession(authInfo.username, authInfo.sid);
    }
  } catch {
    // ignore
  }
  const response = NextResponse.json({ ok: true });

  // 清除认证cookie
  response.cookies.set('auth', '', {
    path: '/',
    expires: new Date(0),
    sameSite: 'lax', // 改为 lax 以支持 PWA
    httpOnly: false, // PWA 需要客户端可访问
    secure: false, // 根据协议自动设置
  });

  return response;
}
