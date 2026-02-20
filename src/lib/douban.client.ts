import { DoubanItem, DoubanResult } from './types';
import { getDoubanProxyUrl } from './utils';

interface DoubanCategoriesParams {
  kind: 'tv' | 'movie';
  category: string;
  type: string;
  pageLimit?: number;
  pageStart?: number;
}

interface DoubanCategoryApiResponse {
  total: number;
  items: Array<{
    id: string;
    title: string;
    card_subtitle: string;
    pic: {
      large: string;
      normal: string;
    };
    rating: {
      value: number;
    };
  }>;
}

/**
 * 带超时的 fetch 请求
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

  // 检查是否使用代理
  const proxyUrl = getDoubanProxyUrl();
  const finalUrl = proxyUrl ? `${proxyUrl}${encodeURIComponent(url)}` : url;

  const fetchOptions: RequestInit = {
    ...options,
    signal: controller.signal,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      Referer: 'https://movie.douban.com/',
      Accept: 'application/json, text/plain, */*',
      ...options.headers,
    },
  };

  try {
    const response = await fetch(finalUrl, fetchOptions);
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * 检查是否应该使用客户端获取豆瓣数据
 */
export function shouldUseDoubanClient(): boolean {
  return getDoubanProxyUrl() !== null;
}

/**
 * 浏览器端豆瓣分类数据获取函数
 */
export async function fetchDoubanCategories(
  params: DoubanCategoriesParams
): Promise<DoubanResult> {
  const { kind, category, type, pageLimit = 20, pageStart = 0 } = params;

  // 验证参数
  if (!['tv', 'movie'].includes(kind)) {
    throw new Error('kind 参数必须是 tv 或 movie');
  }

  if (!category || !type) {
    throw new Error('category 和 type 参数不能为空');
  }

  if (pageLimit < 1 || pageLimit > 100) {
    throw new Error('pageLimit 必须在 1-100 之间');
  }

  if (pageStart < 0) {
    throw new Error('pageStart 不能小于 0');
  }

  const target = `https://m.douban.com/rexxar/api/v2/subject/recent_hot/${kind}?start=${pageStart}&limit=${pageLimit}&category=${category}&type=${type}`;

  try {
    const response = await fetchWithTimeout(target);

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const doubanData: DoubanCategoryApiResponse = await response.json();

    // 转换数据格式
    const list: DoubanItem[] = doubanData.items.map((item) => ({
      id: item.id,
      title: item.title,
      subtitle: item.card_subtitle,
      poster: item.pic?.normal || item.pic?.large || '',
      rate: item.rating?.value ? item.rating.value.toFixed(1) : '',
      year: item.card_subtitle?.match(/(\d{4})/)?.[1] || '',
    }));

    return {
      code: 200,
      message: '获取成功',
      list: list,
    };
  } catch (error) {
    // 触发全局错误提示
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('globalError', {
          detail: { message: '获取豆瓣分类数据失败' },
        })
      );
    }
    throw new Error(`获取豆瓣分类数据失败: ${(error as Error).message}`);
  }
}

/**
 * 统一的豆瓣分类数据获取函数，根据代理设置选择使用服务端 API 或客户端代理获取
 */
export async function getDoubanCategories(
  params: DoubanCategoriesParams
): Promise<DoubanResult> {
  if (shouldUseDoubanClient()) {
    // 使用客户端代理获取（当设置了代理 URL 时）
    return fetchDoubanCategories(params);
  } else {
    // 使用服务端 API（当没有设置代理 URL 时）
    const { kind, category, type, pageLimit = 20, pageStart = 0 } = params;
    const response = await fetch(
      `/api/douban/categories?kind=${kind}&category=${category}&type=${type}&limit=${pageLimit}&start=${pageStart}`
    );

    if (!response.ok) {
      // 触发全局错误提示
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('globalError', {
            detail: { message: '获取豆瓣分类数据失败' },
          })
        );
      }
      throw new Error('获取豆瓣分类数据失败');
    }

    return response.json();
  }
}

interface DoubanListParams {
  tag: string;
  type: string;
  pageLimit?: number;
  pageStart?: number;
}

export interface DoubanSubjectBrief {
  id: string;
  title: string;
  intro: string;
  pubdate: string[];
  card_subtitle: string;
  rating: number;
  year: string;
  type: 'tv' | 'movie' | string;
  cover_url: string;
  video_url: string;
}

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

async function fetchDoubanSubject(id: string): Promise<DoubanSubjectBrief> {
  if (!/^[0-9]+$/.test(id)) {
    throw new Error('doubanId 参数非法');
  }

  // 使用你提供的可用镜像域名（字段更完整，且通常带 trailers）
  const target = `https://m.douban.cmliussss.net/rexxar/api/v2/subject/${id}`;
  const response = await fetchWithTimeout(target);

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }

  const data: DoubanSubjectApiResponse = await response.json();
  return mapDoubanSubjectToBrief(data);
}

/**
 * 获取豆瓣条目详情（为首页轮播提供简化字段）
 */
export async function getDoubanSubjectBrief(
  doubanId: string
): Promise<DoubanSubjectBrief> {
  if (shouldUseDoubanClient()) {
    return fetchDoubanSubject(doubanId);
  }

  const response = await fetch(`/api/douban/subject?id=${doubanId}`);
  if (!response.ok) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('globalError', {
          detail: { message: '获取豆瓣详情失败' },
        })
      );
    }
    throw new Error('获取豆瓣详情失败');
  }

  return response.json();
}

export async function getDoubanList(
  params: DoubanListParams
): Promise<DoubanResult> {
  const { tag, type, pageLimit = 20, pageStart = 0 } = params;
  if (shouldUseDoubanClient()) {
    // 使用客户端代理获取（当设置了代理 URL 时）
    return fetchDoubanList(params);
  } else {
    const response = await fetch(
      `/api/douban?tag=${tag}&type=${type}&pageSize=${pageLimit}&pageStart=${pageStart}`
    );

    if (!response.ok) {
      // 触发全局错误提示
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('globalError', {
            detail: { message: '获取豆瓣列表数据失败' },
          })
        );
      }
      throw new Error('获取豆瓣列表数据失败');
    }

    return response.json();
  }
}

export async function fetchDoubanList(
  params: DoubanListParams
): Promise<DoubanResult> {
  const { tag, type, pageLimit = 20, pageStart = 0 } = params;

  // 验证参数
  if (!tag || !type) {
    throw new Error('tag 和 type 参数不能为空');
  }

  if (!['tv', 'movie'].includes(type)) {
    throw new Error('type 参数必须是 tv 或 movie');
  }

  if (pageLimit < 1 || pageLimit > 100) {
    throw new Error('pageLimit 必须在 1-100 之间');
  }

  if (pageStart < 0) {
    throw new Error('pageStart 不能小于 0');
  }

  const target = `https://movie.douban.com/j/search_subjects?type=${type}&tag=${tag}&sort=recommend&page_limit=${pageLimit}&page_start=${pageStart}`;

  try {
    const response = await fetchWithTimeout(target);

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const doubanData: DoubanCategoryApiResponse = await response.json();

    // 转换数据格式
    const list: DoubanItem[] = doubanData.items.map((item) => ({
      id: item.id,
      title: item.title,
      poster: item.pic?.normal || item.pic?.large || '',
      rate: item.rating?.value ? item.rating.value.toFixed(1) : '',
      year: item.card_subtitle?.match(/(\d{4})/)?.[1] || '',
    }));

    return {
      code: 200,
      message: '获取成功',
      list: list,
    };
  } catch (error) {
    // 触发全局错误提示
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('globalError', {
          detail: { message: '获取豆瓣列表数据失败' },
        })
      );
    }
    throw new Error(`获取豆瓣分类数据失败: ${(error as Error).message}`);
  }
}
