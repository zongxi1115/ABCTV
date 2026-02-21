/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

let cachedMaxDevice: { value: number; ts: number } | null = null;
async function getEffectiveMaxDevice(): Promise<number> {
  const now = Date.now();
  if (cachedMaxDevice && now - cachedMaxDevice.ts < 10_000) {
    return cachedMaxDevice.value;
  }

  const envRaw = Number(process.env.MAX_DEVICE || 0);
  let value = Number.isFinite(envRaw)
    ? Math.max(0, Math.min(Math.floor(envRaw), 50))
    : 0;

  try {
    const cfg = await getConfig();
    const v = Number(cfg.SiteConfig.MaxDevice || 0);
    if (Number.isFinite(v)) {
      value = Math.max(0, Math.min(Math.floor(v), 50));
    }
  } catch {
    // ignore and fallback to env
  }

  cachedMaxDevice = { value, ts: now };
  return value;
}

async function verifySignature(
  data: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(data);

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signatureBuffer = new Uint8Array(
      signature.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
    );

    return await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBuffer,
      messageData
    );
  } catch (error) {
    console.error('签名验证失败:', error);
    return false;
  }
}

export async function GET(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  const maxDevices = await getEffectiveMaxDevice();

  // localstorage 不支持多账号会话；未启用 MAX_DEVICE 时直接放行
  if (storageType === 'localstorage' || maxDevices <= 0) {
    return NextResponse.json({ ok: true });
  }

  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo?.username || !authInfo.signature || !authInfo.sid) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const secret = process.env.PASSWORD || '';
  const payload = `${authInfo.username}:${authInfo.sid}`;
  const okSig =
    (await verifySignature(payload, authInfo.signature, secret)) ||
    (await verifySignature(authInfo.username, authInfo.signature, secret)); // 兼容旧 cookie

  if (!okSig) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const okSession = await db.validateSession(authInfo.username, authInfo.sid);
    if (!okSession) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  } catch (e) {
    // 会话存储异常时降级放行，避免全站不可用
    console.error('会话校验异常，已降级放行:', e);
  }

  return NextResponse.json(
    { ok: true },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
