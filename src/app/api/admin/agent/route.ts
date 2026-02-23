/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { getStorage } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json(
      {
        error: '不支持本地存储进行管理员配置',
      },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();

    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const username = authInfo.username;

    const { Enabled, BaseUrl, ModelName, AllowSearch, ApiKey } = body as {
      Enabled: boolean;
      BaseUrl: string;
      ModelName: string;
      AllowSearch: boolean;
      ApiKey?: string;
    };

    if (
      typeof Enabled !== 'boolean' ||
      typeof BaseUrl !== 'string' ||
      typeof ModelName !== 'string' ||
      typeof AllowSearch !== 'boolean' ||
      (ApiKey !== undefined && typeof ApiKey !== 'string')
    ) {
      return NextResponse.json({ error: '参数格式错误' }, { status: 400 });
    }

    const adminConfig = await getConfig();
    const storage = getStorage();

    if (username !== process.env.USERNAME) {
      const user = adminConfig.UserConfig.Users.find(
        (u) => u.username === username
      );
      if (!user || user.role !== 'admin') {
        return NextResponse.json({ error: '权限不足' }, { status: 401 });
      }
    }

    if (!adminConfig.AgentConfig) {
      adminConfig.AgentConfig = {
        Enabled: false,
        BaseUrl: '',
        ApiKey: '',
        ModelName: '',
        AllowSearch: false,
      };
    }

    adminConfig.AgentConfig.Enabled = Enabled;
    adminConfig.AgentConfig.BaseUrl = BaseUrl.trim();
    adminConfig.AgentConfig.ModelName = ModelName.trim();
    adminConfig.AgentConfig.AllowSearch = AllowSearch;
    if (typeof ApiKey === 'string' && ApiKey.trim()) {
      adminConfig.AgentConfig.ApiKey = ApiKey.trim();
    }

    if (storage && typeof (storage as any).setAdminConfig === 'function') {
      await (storage as any).setAdminConfig(adminConfig);
    }

    return NextResponse.json(
      { ok: true },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('更新 AI 配置失败:', error);
    return NextResponse.json(
      {
        error: '更新 AI 配置失败',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
