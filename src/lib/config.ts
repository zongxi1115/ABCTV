/* eslint-disable @typescript-eslint/no-explicit-any, no-console, @typescript-eslint/no-non-null-assertion */

import { getStorage } from '@/lib/db';

import { AdminConfig } from './admin.types';
import runtimeConfig from './runtime';
import { IStorage } from './types';

async function ensureEnvAdminUser(
  storage: IStorage | null,
  adminConfig: AdminConfig
): Promise<void> {
  const adminUsername = (process.env.ADMIN_USERNAME || '').trim();
  const adminPassword = process.env.ADMIN_PASSWORD;
  const ownerUsername = (process.env.USERNAME || '').trim();

  if (!adminUsername || !adminPassword) return;
  if (adminUsername === ownerUsername) return;

  if (!adminConfig.UserConfig) {
    (adminConfig as any).UserConfig = { AllowRegister: false, Users: [] };
  }
  if (!Array.isArray(adminConfig.UserConfig.Users)) {
    (adminConfig.UserConfig as any).Users = [];
  }

  const existing = adminConfig.UserConfig.Users.find(
    (u) => u.username === adminUsername
  );
  if (existing) {
    if (existing.role !== 'owner') existing.role = 'admin';
  } else {
    adminConfig.UserConfig.Users.unshift({
      username: adminUsername,
      role: 'admin',
    });
  }

  // 确保账号在存储中存在（仅首次创建；不强制覆盖密码）
  if (!storage) return;
  const hasCheck = typeof (storage as any).checkUserExist === 'function';
  const hasRegister = typeof (storage as any).registerUser === 'function';
  if (!hasRegister) return;

  try {
    const exists = hasCheck
      ? await (storage as any).checkUserExist(adminUsername)
      : false;
    if (!exists) {
      await (storage as any).registerUser(adminUsername, adminPassword);
    }
  } catch (e) {
    console.error('创建管理员账号失败:', e);
  }
}

export interface ApiSite {
  key: string;
  api: string;
  name: string;
  detail?: string;
}

interface ConfigFileStruct {
  cache_time?: number;
  api_site: {
    [key: string]: ApiSite;
  };
  custom_category?: {
    name?: string;
    type: 'movie' | 'tv';
    query: string;
  }[];
}

export const API_CONFIG = {
  search: {
    path: '?ac=videolist&wd=',
    pagePath: '?ac=videolist&wd={query}&pg={page}',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'application/json',
    },
  },
  detail: {
    path: '?ac=videolist&ids=',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'application/json',
    },
  },
};

// 在模块加载时根据环境决定配置来源
let fileConfig: ConfigFileStruct;
let cachedConfig: AdminConfig;

async function initConfig() {
  if (cachedConfig) {
    return;
  }

  if (process.env.DOCKER_ENV === 'true') {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const _require = eval('require') as NodeRequire;
    const fs = _require('fs') as typeof import('fs');
    const path = _require('path') as typeof import('path');

    const configPath = path.join(process.cwd(), 'config.json');
    const raw = fs.readFileSync(configPath, 'utf-8');
    fileConfig = JSON.parse(raw) as ConfigFileStruct;
    console.log('load dynamic config success');
  } else {
    // 默认使用编译时生成的配置
    fileConfig = runtimeConfig as unknown as ConfigFileStruct;
  }
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType !== 'localstorage') {
    // 数据库存储，读取并补全管理员配置
    const storage = getStorage();

    try {
      // 尝试从数据库获取管理员配置
      let adminConfig: AdminConfig | null = null;
      if (storage && typeof (storage as any).getAdminConfig === 'function') {
        adminConfig = await (storage as any).getAdminConfig();
      }

      // 获取所有用户名，用于补全 Users
      let userNames: string[] = [];
      if (storage && typeof (storage as any).getAllUsers === 'function') {
        try {
          userNames = await (storage as any).getAllUsers();
        } catch (e) {
          console.error('获取用户列表失败:', e);
        }
      }

      // 从文件中获取源信息，用于补全源
      const apiSiteEntries = Object.entries(fileConfig.api_site);
      const customCategories = fileConfig.custom_category || [];

      if (adminConfig) {
        // 补全 SourceConfig
        const sourceConfigMap = new Map(
          (adminConfig.SourceConfig || []).map((s) => [s.key, s])
        );

        apiSiteEntries.forEach(([key, site]) => {
          sourceConfigMap.set(key, {
            key,
            name: site.name,
            api: site.api,
            detail: site.detail,
            from: 'config',
            disabled: false,
          });
        });

        // 将 Map 转换回数组
        adminConfig.SourceConfig = Array.from(sourceConfigMap.values());

        // 检查现有源是否在 fileConfig.api_site 中，如果不在则标记为 custom
        const apiSiteKeys = new Set(apiSiteEntries.map(([key]) => key));
        adminConfig.SourceConfig.forEach((source) => {
          if (!apiSiteKeys.has(source.key)) {
            source.from = 'custom';
          }
        });

        // 确保 CustomCategories 被初始化
        if (!adminConfig.CustomCategories) {
          adminConfig.CustomCategories = [];
        }

        // 补全 CustomCategories
        const customCategoriesMap = new Map(
          adminConfig.CustomCategories.map((c) => [c.query + c.type, c])
        );

        customCategories.forEach((category) => {
          customCategoriesMap.set(category.query + category.type, {
            name: category.name,
            type: category.type,
            query: category.query,
            from: 'config',
            disabled: false,
          });
        });

        // 检查现有 CustomCategories 是否在 fileConfig.custom_category 中，如果不在则标记为 custom
        const customCategoriesKeys = new Set(
          customCategories.map((c) => c.query + c.type)
        );
        customCategoriesMap.forEach((category) => {
          if (!customCategoriesKeys.has(category.query + category.type)) {
            category.from = 'custom';
          }
        });

        // 将 Map 转换回数组
        adminConfig.CustomCategories = Array.from(customCategoriesMap.values());

        const existedUsers = new Set(
          (adminConfig.UserConfig.Users || []).map((u) => u.username)
        );
        userNames.forEach((uname) => {
          if (!existedUsers.has(uname)) {
            adminConfig!.UserConfig.Users.push({
              username: uname,
              role: 'user',
            });
          }
        });
        // 站长
        const ownerUser = process.env.USERNAME;
        if (ownerUser) {
          adminConfig!.UserConfig.Users = adminConfig!.UserConfig.Users.filter(
            (u) => u.username !== ownerUser
          );
          adminConfig!.UserConfig.Users.unshift({
            username: ownerUser,
            role: 'owner',
          });
        }

        await ensureEnvAdminUser(storage as any, adminConfig);
      } else {
        // 数据库中没有配置，创建新的管理员配置
        let allUsers = userNames.map((uname) => ({
          username: uname,
          role: 'user',
        }));
        const ownerUser = process.env.USERNAME;
        if (ownerUser) {
          allUsers = allUsers.filter((u) => u.username !== ownerUser);
          allUsers.unshift({
            username: ownerUser,
            role: 'owner',
          });
        }
        adminConfig = {
          SiteConfig: {
            SiteName: process.env.SITE_NAME || 'MoonTV',
            Announcement:
              process.env.ANNOUNCEMENT ||
              '本网站仅提供影视信息搜索服务，所有内容均来自第三方网站。本站不存储任何视频资源，不对任何内容的准确性、合法性、完整性负责。',
            SearchDownstreamMaxPage:
              Number(process.env.NEXT_PUBLIC_SEARCH_MAX_PAGE) || 5,
            SiteInterfaceCacheTime: fileConfig.cache_time || 7200,
            MaxDevice: Number(process.env.MAX_DEVICE || 0) || 0,
            ImageProxy: process.env.NEXT_PUBLIC_IMAGE_PROXY || '',
            DoubanProxy: process.env.NEXT_PUBLIC_DOUBAN_PROXY || '',
            DisableYellowFilter:
              process.env.NEXT_PUBLIC_DISABLE_YELLOW_FILTER === 'true',
          },
          UserConfig: {
            AllowRegister: process.env.NEXT_PUBLIC_ENABLE_REGISTER === 'true',
            Users: allUsers as any,
          },
          SourceConfig: apiSiteEntries.map(([key, site]) => ({
            key,
            name: site.name,
            api: site.api,
            detail: site.detail,
            from: 'config',
            disabled: false,
          })),
          CustomCategories: customCategories.map((category) => ({
            name: category.name,
            type: category.type,
            query: category.query,
            from: 'config',
            disabled: false,
          })),
        };

        await ensureEnvAdminUser(storage as any, adminConfig);
      }

      // 写回数据库（更新/创建）
      if (storage && typeof (storage as any).setAdminConfig === 'function') {
        await (storage as any).setAdminConfig(adminConfig);
      }

      // 更新缓存
      cachedConfig = adminConfig;
    } catch (err) {
      console.error('加载管理员配置失败:', err);
    }
  } else {
    // 本地存储直接使用文件配置
    cachedConfig = {
      SiteConfig: {
        SiteName: process.env.SITE_NAME || 'MoonTV',
        Announcement:
          process.env.ANNOUNCEMENT ||
          '本网站仅提供影视信息搜索服务，所有内容均来自第三方网站。本站不存储任何视频资源，不对任何内容的准确性、合法性、完整性负责。',
        SearchDownstreamMaxPage:
          Number(process.env.NEXT_PUBLIC_SEARCH_MAX_PAGE) || 5,
        SiteInterfaceCacheTime: fileConfig.cache_time || 7200,
        MaxDevice: Number(process.env.MAX_DEVICE || 0) || 0,
        ImageProxy: process.env.NEXT_PUBLIC_IMAGE_PROXY || '',
        DoubanProxy: process.env.NEXT_PUBLIC_DOUBAN_PROXY || '',
        DisableYellowFilter:
          process.env.NEXT_PUBLIC_DISABLE_YELLOW_FILTER === 'true',
      },
      UserConfig: {
        AllowRegister: process.env.NEXT_PUBLIC_ENABLE_REGISTER === 'true',
        Users: [],
      },
      SourceConfig: Object.entries(fileConfig.api_site).map(([key, site]) => ({
        key,
        name: site.name,
        api: site.api,
        detail: site.detail,
        from: 'config',
        disabled: false,
      })),
      CustomCategories:
        fileConfig.custom_category?.map((category) => ({
          name: category.name,
          type: category.type,
          query: category.query,
          from: 'config',
          disabled: false,
        })) || [],
    } as AdminConfig;
  }
}

export async function getConfig(): Promise<AdminConfig> {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (process.env.DOCKER_ENV === 'true' || storageType === 'localstorage') {
    await initConfig();
    return cachedConfig;
  }
  // 非 docker 环境且 DB 存储，直接读 db 配置
  const storage = getStorage();
  let adminConfig: AdminConfig | null = null;
  if (storage && typeof (storage as any).getAdminConfig === 'function') {
    adminConfig = await (storage as any).getAdminConfig();
  }
  if (adminConfig) {
    // 确保 CustomCategories 被初始化
    if (!adminConfig.CustomCategories) {
      adminConfig.CustomCategories = [];
    }
    // 确保 SiteConfig / UserConfig 被初始化（兼容老数据）
    if (!adminConfig.SiteConfig) {
      (adminConfig as any).SiteConfig = {
        SiteName: '',
        Announcement: '',
        SearchDownstreamMaxPage:
          Number(process.env.NEXT_PUBLIC_SEARCH_MAX_PAGE) || 5,
        SiteInterfaceCacheTime: 7200,
        MaxDevice: 0,
        ImageProxy: '',
        DoubanProxy: '',
        DisableYellowFilter: false,
      };
    }
    if (!adminConfig.UserConfig) {
      (adminConfig as any).UserConfig = { AllowRegister: false, Users: [] };
    }
    if (!Array.isArray(adminConfig.UserConfig.Users)) {
      (adminConfig.UserConfig as any).Users = [];
    }

    // 环境变量仅作为兜底默认值（避免 serverless 环境下覆盖已存储配置，导致后台修改无效）
    const envSiteName = process.env.SITE_NAME || 'MoonTV';
    const envAnnouncement =
      process.env.ANNOUNCEMENT ||
      '本网站仅提供影视信息搜索服务，所有内容均来自第三方网站。本站不存储任何视频资源，不对任何内容的准确性、合法性、完整性负责。';
    const envAllowRegister = process.env.NEXT_PUBLIC_ENABLE_REGISTER === 'true';
    const envMaxDevice = Number(process.env.MAX_DEVICE || 0) || 0;
    const envImageProxy = process.env.NEXT_PUBLIC_IMAGE_PROXY || '';
    const envDoubanProxy = process.env.NEXT_PUBLIC_DOUBAN_PROXY || '';
    const envDisableYellowFilter =
      process.env.NEXT_PUBLIC_DISABLE_YELLOW_FILTER === 'true';

    if (
      typeof adminConfig.SiteConfig.SiteName !== 'string' ||
      !adminConfig.SiteConfig.SiteName.trim()
    ) {
      adminConfig.SiteConfig.SiteName = envSiteName;
    }
    if (
      typeof adminConfig.SiteConfig.Announcement !== 'string' ||
      !adminConfig.SiteConfig.Announcement.trim()
    ) {
      adminConfig.SiteConfig.Announcement = envAnnouncement;
    }
    if (typeof adminConfig.UserConfig.AllowRegister !== 'boolean') {
      adminConfig.UserConfig.AllowRegister = envAllowRegister;
    }
    if (typeof (adminConfig.SiteConfig as any).MaxDevice !== 'number') {
      (adminConfig.SiteConfig as any).MaxDevice = envMaxDevice;
    }
    if (typeof adminConfig.SiteConfig.ImageProxy !== 'string') {
      adminConfig.SiteConfig.ImageProxy = envImageProxy;
    }
    if (typeof adminConfig.SiteConfig.DoubanProxy !== 'string') {
      adminConfig.SiteConfig.DoubanProxy = envDoubanProxy;
    }
    if (typeof adminConfig.SiteConfig.DisableYellowFilter !== 'boolean') {
      adminConfig.SiteConfig.DisableYellowFilter = envDisableYellowFilter;
    }

    // 合并文件中的源信息
    fileConfig = runtimeConfig as unknown as ConfigFileStruct;
    const apiSiteEntries = Object.entries(fileConfig.api_site);
    const sourceConfigMap = new Map(
      (adminConfig.SourceConfig || []).map((s) => [s.key, s])
    );

    apiSiteEntries.forEach(([key, site]) => {
      const existingSource = sourceConfigMap.get(key);
      if (existingSource) {
        // 如果已存在，只覆盖 name、api、detail 和 from
        existingSource.name = site.name;
        existingSource.api = site.api;
        existingSource.detail = site.detail;
        existingSource.from = 'config';
      } else {
        // 如果不存在，创建新条目
        sourceConfigMap.set(key, {
          key,
          name: site.name,
          api: site.api,
          detail: site.detail,
          from: 'config',
          disabled: false,
        });
      }
    });

    // 检查现有源是否在 fileConfig.api_site 中，如果不在则标记为 custom
    const apiSiteKeys = new Set(apiSiteEntries.map(([key]) => key));
    sourceConfigMap.forEach((source) => {
      if (!apiSiteKeys.has(source.key)) {
        source.from = 'custom';
      }
    });

    // 将 Map 转换回数组
    adminConfig.SourceConfig = Array.from(sourceConfigMap.values());

    // 合并 CustomCategories：以配置文件为基线补全，但保留后台自定义项
    const customCategories = fileConfig.custom_category || [];
    const customCategoriesMap = new Map(
      adminConfig.CustomCategories.map((c) => [c.query + c.type, c])
    );
    customCategories.forEach((category) => {
      customCategoriesMap.set(category.query + category.type, {
        name: category.name,
        type: category.type,
        query: category.query,
        from: 'config',
        disabled: false,
      });
    });
    const customCategoriesKeys = new Set(
      customCategories.map((c) => c.query + c.type)
    );
    customCategoriesMap.forEach((category) => {
      if (!customCategoriesKeys.has(category.query + category.type)) {
        category.from = 'custom';
      }
    });
    adminConfig.CustomCategories = Array.from(customCategoriesMap.values());

    const ownerUser = process.env.USERNAME || '';
    // 检查配置中的站长用户是否和 USERNAME 匹配，如果不匹配则降级为普通用户
    let containOwner = false;
    adminConfig.UserConfig.Users.forEach((user) => {
      if (user.username !== ownerUser && user.role === 'owner') {
        user.role = 'user';
      }
      if (user.username === ownerUser) {
        containOwner = true;
        user.role = 'owner';
      }
    });

    // 如果不在则添加
    if (!containOwner) {
      adminConfig.UserConfig.Users.unshift({
        username: ownerUser,
        role: 'owner',
      });
    }

    await ensureEnvAdminUser(storage as any, adminConfig);
    cachedConfig = adminConfig;
  } else {
    // DB 无配置，执行一次初始化
    await initConfig();
  }
  return cachedConfig;
}

export async function resetConfig() {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  const storage = getStorage();
  // 获取所有用户名，用于补全 Users
  let userNames: string[] = [];
  if (storage && typeof (storage as any).getAllUsers === 'function') {
    try {
      userNames = await (storage as any).getAllUsers();
    } catch (e) {
      console.error('获取用户列表失败:', e);
    }
  }

  if (process.env.DOCKER_ENV === 'true') {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const _require = eval('require') as NodeRequire;
    const fs = _require('fs') as typeof import('fs');
    const path = _require('path') as typeof import('path');

    const configPath = path.join(process.cwd(), 'config.json');
    const raw = fs.readFileSync(configPath, 'utf-8');
    fileConfig = JSON.parse(raw) as ConfigFileStruct;
    console.log('load dynamic config success');
  } else {
    // 默认使用编译时生成的配置
    fileConfig = runtimeConfig as unknown as ConfigFileStruct;
  }

  const apiSiteEntries = Object.entries(fileConfig.api_site);
  const customCategories = fileConfig.custom_category || [];
  let allUsers = userNames.map((uname) => ({
    username: uname,
    role: 'user',
  }));
  const ownerUser = process.env.USERNAME;
  if (ownerUser) {
    allUsers = allUsers.filter((u) => u.username !== ownerUser);
    allUsers.unshift({
      username: ownerUser,
      role: 'owner',
    });
  }

  const adminUsername = (process.env.ADMIN_USERNAME || '').trim();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminUsername && adminPassword && adminUsername !== ownerUser) {
    allUsers = allUsers.filter((u) => u.username !== adminUsername);
    allUsers.unshift({
      username: adminUsername,
      role: 'admin',
    });

    if (storage && typeof (storage as any).registerUser === 'function') {
      try {
        const exists =
          typeof (storage as any).checkUserExist === 'function'
            ? await (storage as any).checkUserExist(adminUsername)
            : false;
        if (!exists) {
          await (storage as any).registerUser(adminUsername, adminPassword);
        }
      } catch (e) {
        console.error('创建管理员账号失败:', e);
      }
    }
  }
  const adminConfig = {
    SiteConfig: {
      SiteName: process.env.SITE_NAME || 'MoonTV',
      Announcement:
        process.env.ANNOUNCEMENT ||
        '本网站仅提供影视信息搜索服务，所有内容均来自第三方网站。本站不存储任何视频资源，不对任何内容的准确性、合法性、完整性负责。',
      SearchDownstreamMaxPage:
        Number(process.env.NEXT_PUBLIC_SEARCH_MAX_PAGE) || 5,
      SiteInterfaceCacheTime: fileConfig.cache_time || 7200,
      MaxDevice: Number(process.env.MAX_DEVICE || 0) || 0,
      ImageProxy: process.env.NEXT_PUBLIC_IMAGE_PROXY || '',
      DoubanProxy: process.env.NEXT_PUBLIC_DOUBAN_PROXY || '',
      DisableYellowFilter:
        process.env.NEXT_PUBLIC_DISABLE_YELLOW_FILTER === 'true',
    },
    UserConfig: {
      AllowRegister: process.env.NEXT_PUBLIC_ENABLE_REGISTER === 'true',
      Users: allUsers as any,
    },
    SourceConfig: apiSiteEntries.map(([key, site]) => ({
      key,
      name: site.name,
      api: site.api,
      detail: site.detail,
      from: 'config',
      disabled: false,
    })),
    CustomCategories:
      storageType === 'redis'
        ? customCategories?.map((category) => ({
            name: category.name,
            type: category.type,
            query: category.query,
            from: 'config',
            disabled: false,
          })) || []
        : [],
  } as AdminConfig;

  if (storage && typeof (storage as any).setAdminConfig === 'function') {
    await (storage as any).setAdminConfig(adminConfig);
  }
  if (cachedConfig == null) {
    // serverless 环境，直接使用 adminConfig
    cachedConfig = adminConfig;
  }
  cachedConfig.SiteConfig = adminConfig.SiteConfig;
  cachedConfig.UserConfig = adminConfig.UserConfig;
  cachedConfig.SourceConfig = adminConfig.SourceConfig;
  cachedConfig.CustomCategories = adminConfig.CustomCategories;
}

export async function getCacheTime(): Promise<number> {
  const config = await getConfig();
  return config.SiteConfig.SiteInterfaceCacheTime || 7200;
}

export async function getAvailableApiSites(): Promise<ApiSite[]> {
  const config = await getConfig();
  return config.SourceConfig.filter((s) => !s.disabled).map((s) => ({
    key: s.key,
    name: s.name,
    api: s.api,
    detail: s.detail,
  }));
}
