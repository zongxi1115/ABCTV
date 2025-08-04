/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console, @next/next/no-img-element, @typescript-eslint/no-unused-vars */

'use client';

// import Artplayer from 'artplayer';
import { AnimatePresence, motion, Variants } from 'framer-motion';
import Hls from 'hls.js';
import {
  ArrowLeft,
  CheckCircle2,
  Heart,
  Layers,
  Layout,
  Loader2,
  Maximize,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

import {
  deleteFavorite,
  deletePlayRecord,
  deleteSkipConfig,
  generateStorageKey,
  getAllPlayRecords,
  getSkipConfig,
  isFavorited,
  saveFavorite,
  savePlayRecord,
  saveSkipConfig,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { SearchResult } from '@/lib/types';
import { getVideoResolutionFromM3u8, processImageUrl } from '@/lib/utils';

import EpisodeSelector from '@/components/EpisodeSelector';
import PageLayout from '@/components/PageLayout';
import { VideoPlayer } from '@/components/VideoPlayer';

// 扩展 HTMLVideoElement 类型以支持 hls 属性
declare global {
  interface HTMLVideoElement {
    hls?: any;
  }
}

// --- Animation Variants ---
const pageVariants: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      duration: 0.5,
      when: 'beforeChildren',
      staggerChildren: 0.1,
    },
  },
  exit: { opacity: 0, transition: { duration: 0.3 } },
};

const fadeInUp: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

// --- Styled Components ---
const Badge = ({
  children,
  className = '',
  onClick,
}: {
  children?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) => (
  <span
    onClick={onClick}
    className={`px-2.5 py-1 rounded-md text-xs font-medium backdrop-blur-md bg-white/10 border border-white/10 dark:bg-white/5 dark:border-white/10 flex items-center gap-1 transition-colors ${
      onClick ? 'cursor-pointer hover:bg-white/20' : ''
    } ${className}`}
  >
    {children}
  </span>
);

const ChecklistItem = ({
  status,
  label,
}: {
  status: 'waiting' | 'loading' | 'done';
  label: string;
}) => {
  return (
    <motion.div
      className='flex items-center gap-4 py-3'
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
    >
      <div className='relative flex items-center justify-center w-6 h-6 shrink-0'>
        <AnimatePresence mode='popLayout'>
          {status === 'done' && (
            <motion.div
              key='done'
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            >
              <CheckCircle2 size={24} className='text-green-500' />
            </motion.div>
          )}
          {status === 'loading' && (
            <motion.div
              key='loading'
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
            >
              <Loader2 size={24} className='text-green-500 animate-spin' />
            </motion.div>
          )}
          {status === 'waiting' && (
            <motion.div
              key='waiting'
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className='w-5 h-5 rounded-full border-2 border-slate-700 dark:border-slate-700'
            />
          )}
        </AnimatePresence>
      </div>

      <div
        className={`flex-1 transition-all duration-300 ${
          status === 'waiting' ? 'text-slate-500' : 'text-slate-200'
        }`}
      >
        <span
          className={`text-lg font-medium transition-all duration-500 decoration-slate-500/50 ${
            status === 'done' ? 'line-through decoration-2 opacity-50' : ''
          }`}
        >
          {label}
        </span>
      </div>
    </motion.div>
  );
};

function PlayPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // -----------------------------------------------------------------------------
  // 状态变量（State）
  // -----------------------------------------------------------------------------
  const [loading, setLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState<
    'searching' | 'preferring' | 'fetching' | 'ready'
  >('searching');

  const [_, setLoadingMessage] = useState('正在搜索播放源...');
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<SearchResult | null>(null);

  // 收藏状态
  const [favorited, setFavorited] = useState(false);

  // 跳过片头片尾配置
  const [skipConfig, setSkipConfig] = useState<{
    enable: boolean;
    intro_time: number;
    outro_time: number;
  }>({
    enable: false,
    intro_time: 0,
    outro_time: 0,
  });
  const skipConfigRef = useRef(skipConfig);
  useEffect(() => {
    skipConfigRef.current = skipConfig;
  }, [
    skipConfig,
    skipConfig.enable,
    skipConfig.intro_time,
    skipConfig.outro_time,
  ]);

  // 跳过检查的时间间隔控制
  const _lastSkipCheckRef = useRef(0);

  // 去广告开关（从 localStorage 继承，默认 true）
  const [_blockAdEnabled, _setBlockAdEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const v = localStorage.getItem('enable_blockad');
      if (v !== null) return v === 'true';
    }
    return true;
  });
  const blockAdEnabledRef = useRef(_blockAdEnabled);
  useEffect(() => {
    blockAdEnabledRef.current = _blockAdEnabled;
  }, [_blockAdEnabled]);

  // 视频基本信息
  const [videoTitle, setVideoTitle] = useState(searchParams.get('title') || '');
  const [videoYear, setVideoYear] = useState(searchParams.get('year') || '');
  const [videoCover, setVideoCover] = useState('');
  // 当前源和ID
  const [currentSource, setCurrentSource] = useState(
    searchParams.get('source') || ''
  );
  const [currentId, setCurrentId] = useState(searchParams.get('id') || '');

  // 搜索所需信息
  const [searchTitle] = useState(searchParams.get('stitle') || '');
  const [searchType] = useState(searchParams.get('stype') || '');

  // 是否需要优选
  const [needPrefer, setNeedPrefer] = useState(
    searchParams.get('prefer') === 'true'
  );
  const needPreferRef = useRef(needPrefer);
  useEffect(() => {
    needPreferRef.current = needPrefer;
  }, [needPrefer]);
  // 集数相关
  const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState(0);

  const currentSourceRef = useRef(currentSource);
  const currentIdRef = useRef(currentId);
  const videoTitleRef = useRef(videoTitle);
  const videoYearRef = useRef(videoYear);
  const detailRef = useRef<SearchResult | null>(detail);
  const currentEpisodeIndexRef = useRef(currentEpisodeIndex);

  // 同步最新值到 refs
  useEffect(() => {
    currentSourceRef.current = currentSource;
    currentIdRef.current = currentId;
    detailRef.current = detail;
    currentEpisodeIndexRef.current = currentEpisodeIndex;
    videoTitleRef.current = videoTitle;
    videoYearRef.current = videoYear;
  }, [
    currentSource,
    currentId,
    detail,
    currentEpisodeIndex,
    videoTitle,
    videoYear,
  ]);

  // 视频播放地址
  const [videoUrl, setVideoUrl] = useState('');

  // 总集数
  const totalEpisodes = detail?.episodes?.length || 0;

  // 用于记录是否需要在播放器 ready 后跳转到指定进度
  const resumeTimeRef = useRef<number | null>(null);
  // 上次使用的音量，默认 0.7
  const _lastVolumeRef = useRef<number>(0.7);
  // 上次使用的播放速率，默认 1.0
  const _lastPlaybackRateRef = useRef<number>(1.0);

  // 换源相关状态
  const [availableSources, setAvailableSources] = useState<SearchResult[]>([]);
  const [sourceSearchLoading, setSourceSearchLoading] = useState(false);
  const [sourceSearchError, setSourceSearchError] = useState<string | null>(
    null
  );

  // 优选和测速开关
  const [optimizationEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('enableOptimization');
      if (saved !== null) {
        try {
          return JSON.parse(saved);
        } catch {
          /* ignore */
        }
      }
    }
    return true;
  });

  // 保存优选时的测速结果，避免EpisodeSelector重复测速
  const [precomputedVideoInfo, setPrecomputedVideoInfo] = useState<
    Map<string, { quality: string; loadSpeed: string; pingTime: number }>
  >(new Map());

  // 折叠状态（仅在 lg 及以上屏幕有效）
  const [isEpisodeSelectorCollapsed, setIsEpisodeSelectorCollapsed] =
    useState(false);

  // 换源加载状态
  const [isVideoLoading, setIsVideoLoading] = useState(true);
  const [videoLoadingStage, setVideoLoadingStage] = useState<
    'initing' | 'sourceChanging'
  >('initing');

  // 播放进度保存相关
  const saveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastSaveTimeRef = useRef<number>(0);
  const currentPlayTimeRef = useRef<number>(0);
  const currentDurationRef = useRef<number>(0);

  const artPlayerRef = useRef<any>(null);
  // const artRef = useRef<HTMLDivElement | null>(null);

  // -----------------------------------------------------------------------------
  // 工具函数（Utils）
  // -----------------------------------------------------------------------------

  // 播放源优选函数
  const preferBestSource = async (
    sources: SearchResult[]
  ): Promise<SearchResult> => {
    if (sources.length === 1) return sources[0];

    // 将播放源均分为两批，并发测速各批，避免一次性过多请求
    const batchSize = Math.ceil(sources.length / 2);
    const allResults: Array<{
      source: SearchResult;
      testResult: { quality: string; loadSpeed: string; pingTime: number };
    } | null> = [];

    for (let start = 0; start < sources.length; start += batchSize) {
      const batchSources = sources.slice(start, start + batchSize);
      const batchResults = await Promise.all(
        batchSources.map(async (source) => {
          try {
            // 检查是否有第一集的播放地址
            if (!source.episodes || source.episodes.length === 0) {
              console.warn(`播放源 ${source.source_name} 没有可用的播放地址`);
              return null;
            }

            const episodeUrl =
              source.episodes.length > 1
                ? source.episodes[1]
                : source.episodes[0];
            const testResult = await getVideoResolutionFromM3u8(episodeUrl);

            return {
              source,
              testResult,
            };
          } catch (error) {
            return null;
          }
        })
      );
      allResults.push(...batchResults);
    }

    // 等待所有测速完成，包含成功和失败的结果
    // 保存所有测速结果到 precomputedVideoInfo，供 EpisodeSelector 使用（包含错误结果）
    const newVideoInfoMap = new Map<
      string,
      {
        quality: string;
        loadSpeed: string;
        pingTime: number;
        hasError?: boolean;
      }
    >();
    allResults.forEach((result, index) => {
      const source = sources[index];
      const sourceKey = `${source.source}-${source.id}`;

      if (result) {
        // 成功的结果
        newVideoInfoMap.set(sourceKey, result.testResult);
      }
    });

    // 过滤出成功的结果用于优选计算
    const successfulResults = allResults.filter(Boolean) as Array<{
      source: SearchResult;
      testResult: { quality: string; loadSpeed: string; pingTime: number };
    }>;

    setPrecomputedVideoInfo(newVideoInfoMap);

    if (successfulResults.length === 0) {
      console.warn('所有播放源测速都失败，使用第一个播放源');
      return sources[0];
    }

    // 找出所有有效速度的最大值，用于线性映射
    const validSpeeds = successfulResults
      .map((result) => {
        const speedStr = result.testResult.loadSpeed;
        if (speedStr === '未知' || speedStr === '测量中...') return 0;

        const match = speedStr.match(/^([\d.]+)\s*(KB\/s|MB\/s)$/);
        if (!match) return 0;

        const value = parseFloat(match[1]);
        const unit = match[2];
        return unit === 'MB/s' ? value * 1024 : value; // 统一转换为 KB/s
      })
      .filter((speed) => speed > 0);

    const maxSpeed = validSpeeds.length > 0 ? Math.max(...validSpeeds) : 1024; // 默认1MB/s作为基准

    // 找出所有有效延迟的最小值和最大值，用于线性映射
    const validPings = successfulResults
      .map((result) => result.testResult.pingTime)
      .filter((ping) => ping > 0);

    const minPing = validPings.length > 0 ? Math.min(...validPings) : 50;
    const maxPing = validPings.length > 0 ? Math.max(...validPings) : 1000;

    // 计算每个结果的评分
    const resultsWithScore = successfulResults.map((result) => ({
      ...result,
      score: calculateSourceScore(
        result.testResult,
        maxSpeed,
        minPing,
        maxPing
      ),
    }));

    // 按综合评分排序，选择最佳播放源
    resultsWithScore.sort((a, b) => b.score - a.score);

    console.log('播放源评分排序结果:');
    resultsWithScore.forEach((result, index) => {
      console.log(
        `${index + 1}. ${
          result.source.source_name
        } - 评分: ${result.score.toFixed(2)} (${result.testResult.quality}, ${
          result.testResult.loadSpeed
        }, ${result.testResult.pingTime}ms)`
      );
    });

    return resultsWithScore[0].source;
  };

  // 计算播放源综合评分
  const calculateSourceScore = (
    testResult: {
      quality: string;
      loadSpeed: string;
      pingTime: number;
    },
    maxSpeed: number,
    minPing: number,
    maxPing: number
  ): number => {
    let score = 0;

    // 分辨率评分 (40% 权重)
    const qualityScore = (() => {
      switch (testResult.quality) {
        case '4K':
          return 100;
        case '2K':
          return 85;
        case '1080p':
          return 75;
        case '720p':
          return 60;
        case '480p':
          return 40;
        case 'SD':
          return 20;
        default:
          return 0;
      }
    })();
    score += qualityScore * 0.4;

    // 下载速度评分 (40% 权重) - 基于最大速度线性映射
    const speedScore = (() => {
      const speedStr = testResult.loadSpeed;
      if (speedStr === '未知' || speedStr === '测量中...') return 30;

      // 解析速度值
      const match = speedStr.match(/^([\d.]+)\s*(KB\/s|MB\/s)$/);
      if (!match) return 30;

      const value = parseFloat(match[1]);
      const unit = match[2];
      const speedKBps = unit === 'MB/s' ? value * 1024 : value;

      // 基于最大速度线性映射，最高100分
      const speedRatio = speedKBps / maxSpeed;
      return Math.min(100, Math.max(0, speedRatio * 100));
    })();
    score += speedScore * 0.4;

    // 网络延迟评分 (20% 权重) - 基于延迟范围线性映射
    const pingScore = (() => {
      const ping = testResult.pingTime;
      if (ping <= 0) return 0; // 无效延迟给默认分

      // 如果所有延迟都相同，给满分
      if (maxPing === minPing) return 100;

      // 线性映射：最低延迟=100分，最高延迟=0分
      const pingRatio = (maxPing - ping) / (maxPing - minPing);
      return Math.min(100, Math.max(0, pingRatio * 100));
    })();
    score += pingScore * 0.2;

    return Math.round(score * 100) / 100; // 保留两位小数
  };

  // 更新视频地址
  const updateVideoUrl = (
    detailData: SearchResult | null,
    episodeIndex: number
  ) => {
    if (
      !detailData ||
      !detailData.episodes ||
      episodeIndex >= detailData.episodes.length
    ) {
      setVideoUrl('');
      return;
    }
    const newUrl = detailData?.episodes[episodeIndex] || '';
    if (newUrl !== videoUrl) {
      setVideoUrl(newUrl);
    }
  };

  const _ensureVideoSource = (video: HTMLVideoElement | null, url: string) => {
    if (!video || !url) return;
    const sources = Array.from(video.getElementsByTagName('source'));
    const existed = sources.some((s) => s.src === url);
    if (!existed) {
      // 移除旧的 source，保持唯一
      sources.forEach((s) => s.remove());
      const sourceEl = document.createElement('source');
      sourceEl.src = url;
      video.appendChild(sourceEl);
    }

    // 始终允许远程播放（AirPlay / Cast）
    video.disableRemotePlayback = false;
    // 如果曾经有禁用属性，移除之
    if (video.hasAttribute('disableRemotePlayback')) {
      video.removeAttribute('disableRemotePlayback');
    }
  };

  // 去广告相关函数
  function filterAdsFromM3U8(m3u8Content: string): string {
    if (!m3u8Content) return '';

    // 按行分割M3U8内容
    const lines = m3u8Content.split('\n');
    const filteredLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 只过滤#EXT-X-DISCONTINUITY标识
      if (!line.includes('#EXT-X-DISCONTINUITY')) {
        filteredLines.push(line);
      }
    }

    return filteredLines.join('\n');
  }

  // 跳过片头片尾配置相关函数
  const _handleSkipConfigChange = async (newConfig: {
    enable: boolean;
    intro_time: number;
    outro_time: number;
  }) => {
    if (!currentSourceRef.current || !currentIdRef.current) return;

    try {
      setSkipConfig(newConfig);
      if (!newConfig.enable && !newConfig.intro_time && !newConfig.outro_time) {
        await deleteSkipConfig(currentSourceRef.current, currentIdRef.current);
        artPlayerRef.current.setting.update({
          name: '跳过片头片尾',
          html: '跳过片头片尾',
          switch: skipConfigRef.current.enable,
          onSwitch: function (item: any) {
            const newConfig = {
              ...skipConfigRef.current,
              enable: !item.switch,
            };
            _handleSkipConfigChange(newConfig);
            return !item.switch;
          },
        });
        artPlayerRef.current.setting.update({
          name: '设置片头',
          html: '设置片头',
          icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="12" r="2" fill="#ffffff"/><path d="M9 12L17 12" stroke="#ffffff" stroke-width="2"/><path d="M17 6L17 18" stroke="#ffffff" stroke-width="2"/></svg>',
          tooltip:
            skipConfigRef.current.intro_time === 0
              ? '设置片头时间'
              : `${formatTime(skipConfigRef.current.intro_time)}`,
          onClick: function () {
            const currentTime = artPlayerRef.current?.currentTime || 0;
            if (currentTime > 0) {
              const newConfig = {
                ...skipConfigRef.current,
                intro_time: currentTime,
              };
              _handleSkipConfigChange(newConfig);
              return `${formatTime(currentTime)}`;
            }
          },
        });
        artPlayerRef.current.setting.update({
          name: '设置片尾',
          html: '设置片尾',
          icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 6L7 18" stroke="#ffffff" stroke-width="2"/><path d="M7 12L15 12" stroke="#ffffff" stroke-width="2"/><circle cx="19" cy="12" r="2" fill="#ffffff"/></svg>',
          tooltip:
            skipConfigRef.current.outro_time >= 0
              ? '设置片尾时间'
              : `-${formatTime(-skipConfigRef.current.outro_time)}`,
          onClick: function () {
            const outroTime =
              -(
                artPlayerRef.current?.duration -
                artPlayerRef.current?.currentTime
              ) || 0;
            if (outroTime < 0) {
              const newConfig = {
                ...skipConfigRef.current,
                outro_time: outroTime,
              };
              _handleSkipConfigChange(newConfig);
              return `-${formatTime(-outroTime)}`;
            }
          },
        });
      } else {
        await saveSkipConfig(
          currentSourceRef.current,
          currentIdRef.current,
          newConfig
        );
      }
      console.log('跳过片头片尾配置已保存:', newConfig);
    } catch (err) {
      console.error('保存跳过片头片尾配置失败:', err);
    }
  };

  const formatTime = (seconds: number): string => {
    if (seconds === 0) return '00:00';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.round(seconds % 60);

    if (hours === 0) {
      // 不到一小时，格式为 00:00
      return `${minutes.toString().padStart(2, '0')}:${remainingSeconds
        .toString()
        .padStart(2, '0')}`;
    } else {
      // 超过一小时，格式为 00:00:00
      return `${hours.toString().padStart(2, '0')}:${minutes
        .toString()
        .padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
  };

  class _CustomHlsJsLoader extends Hls.DefaultConfig.loader {
    constructor(config: any) {
      super(config);
      const load = this.load.bind(this);
      this.load = function (context: any, config: any, callbacks: any) {
        // 拦截manifest和level请求
        if (
          (context as any).type === 'manifest' ||
          (context as any).type === 'level'
        ) {
          const onSuccess = callbacks.onSuccess;
          callbacks.onSuccess = function (
            response: any,
            stats: any,
            context: any
          ) {
            // 如果是m3u8文件，处理内容以移除广告分段
            if (response.data && typeof response.data === 'string') {
              // 过滤掉广告段 - 实现更精确的广告过滤逻辑
              response.data = filterAdsFromM3U8(response.data);
            }
            return onSuccess(response, stats, context, null);
          };
        }
        // 执行原始load方法
        load(context, config, callbacks);
      };
    }
  }

  // 当集数索引变化时自动更新视频地址
  useEffect(() => {
    updateVideoUrl(detail, currentEpisodeIndex);
  }, [detail, currentEpisodeIndex]);

  // 进入页面时直接获取全部源信息
  useEffect(() => {
    const fetchSourceDetail = async (
      source: string,
      id: string
    ): Promise<SearchResult[]> => {
      try {
        const detailResponse = await fetch(
          `/api/detail?source=${source}&id=${id}`
        );
        if (!detailResponse.ok) {
          throw new Error('获取视频详情失败');
        }
        const detailData = (await detailResponse.json()) as SearchResult;
        setAvailableSources([detailData]);
        return [detailData];
      } catch (err) {
        console.error('获取视频详情失败:', err);
        return [];
      } finally {
        setSourceSearchLoading(false);
      }
    };
    const fetchSourcesData = async (query: string): Promise<SearchResult[]> => {
      // 根据搜索词获取全部源信息
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(query.trim())}`
        );
        if (!response.ok) {
          throw new Error('搜索失败');
        }
        const data = await response.json();

        // 处理搜索结果，根据规则过滤
        const results = data.results.filter(
          (result: SearchResult) =>
            result.title.replaceAll(' ', '').toLowerCase() ===
              videoTitleRef.current.replaceAll(' ', '').toLowerCase() &&
            (videoYearRef.current
              ? result.year.toLowerCase() === videoYearRef.current.toLowerCase()
              : true) &&
            (searchType
              ? (searchType === 'tv' && result.episodes.length > 1) ||
                (searchType === 'movie' && result.episodes.length === 1)
              : true)
        );
        setAvailableSources(results);
        return results;
      } catch (err) {
        setSourceSearchError(err instanceof Error ? err.message : '搜索失败');
        setAvailableSources([]);
        return [];
      } finally {
        setSourceSearchLoading(false);
      }
    };

    const initAll = async () => {
      if (!currentSource && !currentId && !videoTitle && !searchTitle) {
        setError('缺少必要参数');
        setLoading(false);
        return;
      }
      setLoading(true);
      setLoadingStage(currentSource && currentId ? 'fetching' : 'searching');
      setLoadingMessage(
        currentSource && currentId
          ? '🎬 正在获取视频详情...'
          : '🔍 正在搜索播放源...'
      );

      let sourcesInfo = await fetchSourcesData(searchTitle || videoTitle);
      if (
        currentSource &&
        currentId &&
        !sourcesInfo.some(
          (source) => source.source === currentSource && source.id === currentId
        )
      ) {
        sourcesInfo = await fetchSourceDetail(currentSource, currentId);
      }
      if (sourcesInfo.length === 0) {
        setError('未找到匹配结果');
        setLoading(false);
        return;
      }

      let detailData: SearchResult = sourcesInfo[0];
      // 指定源和id且无需优选
      if (currentSource && currentId && !needPreferRef.current) {
        const target = sourcesInfo.find(
          (source) => source.source === currentSource && source.id === currentId
        );
        if (target) {
          detailData = target;
        } else {
          setError('未找到匹配结果');
          setLoading(false);
          return;
        }
      }

      // 未指定源和 id 或需要优选，且开启优选开关
      if (
        (!currentSource || !currentId || needPreferRef.current) &&
        optimizationEnabled
      ) {
        setLoadingStage('preferring');
        setLoadingMessage('⚡ 正在优选最佳播放源...');

        detailData = await preferBestSource(sourcesInfo);
      }

      console.log(detailData.source, detailData.id);

      setNeedPrefer(false);
      setCurrentSource(detailData.source);
      setCurrentId(detailData.id);
      setVideoYear(detailData.year);
      setVideoTitle(detailData.title || videoTitleRef.current);
      setVideoCover(detailData.poster);
      setDetail(detailData);
      if (currentEpisodeIndex >= detailData.episodes.length) {
        setCurrentEpisodeIndex(0);
      }

      // 规范URL参数
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('source', detailData.source);
      newUrl.searchParams.set('id', detailData.id);
      newUrl.searchParams.set('year', detailData.year);
      newUrl.searchParams.set('title', detailData.title);
      newUrl.searchParams.delete('prefer');
      window.history.replaceState({}, '', newUrl.toString());

      setLoadingStage('ready');
      setLoadingMessage('✨ 准备就绪，即将开始播放...');

      // 短暂延迟让用户看到完成状态
      setTimeout(() => {
        setLoading(false);
        setIsVideoLoading(false);
      }, 1000);
    };

    initAll();
  }, []);

  // 播放记录处理
  useEffect(() => {
    // 仅在初次挂载时检查播放记录
    const initFromHistory = async () => {
      if (!currentSource || !currentId) return;

      try {
        const allRecords = await getAllPlayRecords();
        const key = generateStorageKey(currentSource, currentId);
        const record = allRecords[key];

        if (record) {
          const targetIndex = record.index - 1;
          const targetTime = record.play_time;

          // 更新当前选集索引
          if (targetIndex !== currentEpisodeIndex) {
            setCurrentEpisodeIndex(targetIndex);
          }

          // 保存待恢复的播放进度，待播放器就绪后跳转
          resumeTimeRef.current = targetTime;
        }
      } catch (err) {
        console.error('读取播放记录失败:', err);
      }
    };

    initFromHistory();
  }, []);

  // 跳过片头片尾配置处理
  useEffect(() => {
    // 仅在初次挂载时检查跳过片头片尾配置
    const initSkipConfig = async () => {
      if (!currentSource || !currentId) return;

      try {
        const config = await getSkipConfig(currentSource, currentId);
        if (config) {
          setSkipConfig(config);
        }
      } catch (err) {
        console.error('读取跳过片头片尾配置失败:', err);
      }
    };

    initSkipConfig();
  }, []);

  // 处理换源
  const handleSourceChange = async (
    newSource: string,
    newId: string,
    newTitle: string
  ) => {
    try {
      // 显示换源加载状态
      setVideoLoadingStage('sourceChanging');
      setIsVideoLoading(true);

      // 记录当前播放进度（仅在同一集数切换时恢复）
      const currentPlayTime = artPlayerRef.current?.currentTime || 0;
      console.log('换源前当前播放时间:', currentPlayTime);

      // 清除前一个历史记录
      if (currentSourceRef.current && currentIdRef.current) {
        try {
          await deletePlayRecord(
            currentSourceRef.current,
            currentIdRef.current
          );
          console.log('已清除前一个播放记录');
        } catch (err) {
          console.error('清除播放记录失败:', err);
        }
      }

      // 清除并设置下一个跳过片头片尾配置
      if (currentSourceRef.current && currentIdRef.current) {
        try {
          await deleteSkipConfig(
            currentSourceRef.current,
            currentIdRef.current
          );
          await saveSkipConfig(newSource, newId, skipConfigRef.current);
        } catch (err) {
          console.error('清除跳过片头片尾配置失败:', err);
        }
      }

      const newDetail = availableSources.find(
        (source) => source.source === newSource && source.id === newId
      );
      if (!newDetail) {
        setError('未找到匹配结果');
        return;
      }

      // 尝试跳转到当前正在播放的集数
      let targetIndex = currentEpisodeIndex;

      // 如果当前集数超出新源的范围，则跳转到第一集
      if (!newDetail.episodes || targetIndex >= newDetail.episodes.length) {
        targetIndex = 0;
      }

      // 如果仍然是同一集数且播放进度有效，则在播放器就绪后恢复到原始进度
      if (targetIndex !== currentEpisodeIndex) {
        resumeTimeRef.current = 0;
      } else if (
        (!resumeTimeRef.current || resumeTimeRef.current === 0) &&
        currentPlayTime > 1
      ) {
        resumeTimeRef.current = currentPlayTime;
      }

      // 更新URL参数（不刷新页面）
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('source', newSource);
      newUrl.searchParams.set('id', newId);
      newUrl.searchParams.set('year', newDetail.year);
      window.history.replaceState({}, '', newUrl.toString());

      setVideoTitle(newDetail.title || newTitle);
      setVideoYear(newDetail.year);
      setVideoCover(newDetail.poster);
      setCurrentSource(newSource);
      setCurrentId(newId);
      setDetail(newDetail);
      setCurrentEpisodeIndex(targetIndex);

      // 切换源1秒后隐藏loading
      setTimeout(() => {
        setIsVideoLoading(false);
      }, 1000);
    } catch (err) {
      // 隐藏换源加载状态
      setIsVideoLoading(false);
      setError(err instanceof Error ? err.message : '换源失败');
    }
  };

  useEffect(() => {
    document.addEventListener('keydown', handleKeyboardShortcuts);
    return () => {
      document.removeEventListener('keydown', handleKeyboardShortcuts);
    };
  }, []);

  // 自动隐藏loading overlay
  useEffect(() => {
    if (videoUrl && isVideoLoading) {
      const timer = setTimeout(() => {
        setIsVideoLoading(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [videoUrl]);

  // ---------------------------------------------------------------------------
  // 集数切换
  // ---------------------------------------------------------------------------
  // 处理集数切换
  const handleEpisodeChange = (episodeNumber: number) => {
    if (episodeNumber >= 0 && episodeNumber < totalEpisodes) {
      // 在更换集数前保存当前播放进度
      saveCurrentPlayProgress(
        currentPlayTimeRef.current,
        currentDurationRef.current
      );
      setCurrentEpisodeIndex(episodeNumber);
    }
  };

  const handlePreviousEpisode = () => {
    const d = detailRef.current;
    const idx = currentEpisodeIndexRef.current;
    if (d && d.episodes && idx > 0) {
      // 保存当前集的播放进度
      saveCurrentPlayProgress(
        currentPlayTimeRef.current,
        currentDurationRef.current
      );
      setCurrentEpisodeIndex(idx - 1);
    }
  };

  const handleNextEpisode = () => {
    const d = detailRef.current;
    const idx = currentEpisodeIndexRef.current;
    if (d && d.episodes && idx < d.episodes.length - 1) {
      // 保存当前集的播放进度
      saveCurrentPlayProgress(
        currentPlayTimeRef.current,
        currentDurationRef.current
      );
      setCurrentEpisodeIndex(idx + 1);
    }
  };

  // ---------------------------------------------------------------------------
  // 键盘快捷键
  // ---------------------------------------------------------------------------
  // 处理全局快捷键
  const handleKeyboardShortcuts = (e: KeyboardEvent) => {
    // 忽略输入框中的按键事件
    if (
      (e.target as HTMLElement).tagName === 'INPUT' ||
      (e.target as HTMLElement).tagName === 'TEXTAREA'
    )
      return;

    // Alt + 左箭头 = 上一集
    if (e.altKey && e.key === 'ArrowLeft') {
      if (detailRef.current && currentEpisodeIndexRef.current > 0) {
        handlePreviousEpisode();
        e.preventDefault();
      }
    }

    // Alt + 右箭头 = 下一集
    if (e.altKey && e.key === 'ArrowRight') {
      const d = detailRef.current;
      const idx = currentEpisodeIndexRef.current;
      if (d && idx < d.episodes.length - 1) {
        handleNextEpisode();
        e.preventDefault();
      }
    }

    // 左箭头 = 快退
    if (!e.altKey && e.key === 'ArrowLeft') {
      if (artPlayerRef.current && artPlayerRef.current.currentTime > 5) {
        artPlayerRef.current.currentTime -= 10;
        e.preventDefault();
      }
    }

    // 右箭头 = 快进
    if (!e.altKey && e.key === 'ArrowRight') {
      if (
        artPlayerRef.current &&
        artPlayerRef.current.currentTime < artPlayerRef.current.duration - 5
      ) {
        artPlayerRef.current.currentTime += 10;
        e.preventDefault();
      }
    }

    // 上箭头 = 音量+
    if (e.key === 'ArrowUp') {
      if (artPlayerRef.current && artPlayerRef.current.volume < 1) {
        artPlayerRef.current.volume =
          Math.round((artPlayerRef.current.volume + 0.1) * 10) / 10;
        artPlayerRef.current.notice.show = `音量: ${Math.round(
          artPlayerRef.current.volume * 100
        )}`;
        e.preventDefault();
      }
    }

    // 下箭头 = 音量-
    if (e.key === 'ArrowDown') {
      if (artPlayerRef.current && artPlayerRef.current.volume > 0) {
        artPlayerRef.current.volume =
          Math.round((artPlayerRef.current.volume - 0.1) * 10) / 10;
        artPlayerRef.current.notice.show = `音量: ${Math.round(
          artPlayerRef.current.volume * 100
        )}`;
        e.preventDefault();
      }
    }

    // 空格 = 播放/暂停
    if (e.key === ' ') {
      if (artPlayerRef.current) {
        artPlayerRef.current.toggle();
        e.preventDefault();
      }
    }

    // f 键 = 切换全屏
    if (e.key === 'f' || e.key === 'F') {
      if (artPlayerRef.current) {
        artPlayerRef.current.fullscreen = !artPlayerRef.current.fullscreen;
        e.preventDefault();
      }
    }
  };

  // ---------------------------------------------------------------------------
  // 播放记录相关
  // ---------------------------------------------------------------------------
  // 保存播放进度
  const saveCurrentPlayProgress = async (
    currentTime?: number,
    duration?: number
  ) => {
    if (
      !currentSourceRef.current ||
      !currentIdRef.current ||
      !videoTitleRef.current ||
      !detailRef.current?.source_name
    ) {
      return;
    }

    const playTime =
      currentTime !== undefined ? currentTime : currentPlayTimeRef.current;
    const videoDuration =
      duration !== undefined ? duration : currentDurationRef.current;

    // 如果播放时间太短（少于1秒）或者视频时长无效，不保存
    if (playTime < 1 || !videoDuration) {
      return;
    }

    try {
      await savePlayRecord(currentSourceRef.current, currentIdRef.current, {
        title: videoTitleRef.current,
        source_name: detailRef.current?.source_name || '',
        year: detailRef.current?.year,
        cover: detailRef.current?.poster || '',
        index: currentEpisodeIndexRef.current + 1, // 转换为1基索引
        total_episodes: detailRef.current?.episodes.length || 1,
        play_time: Math.floor(playTime),
        total_time: Math.floor(videoDuration),
        save_time: Date.now(),
        search_title: searchTitle,
      });

      lastSaveTimeRef.current = Date.now();
      console.log('播放进度已保存:', {
        title: videoTitleRef.current,
        episode: currentEpisodeIndexRef.current + 1,
        year: detailRef.current?.year,
        progress: `${Math.floor(playTime)}/${Math.floor(videoDuration)}`,
      });
    } catch (err) {
      console.error('保存播放进度失败:', err);
    }
  };

  useEffect(() => {
    // 页面即将卸载时保存播放进度
    const handleBeforeUnload = () => {
      saveCurrentPlayProgress();
    };

    // 页面可见性变化时保存播放进度
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveCurrentPlayProgress();
      }
    };

    // 添加事件监听器
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      // 清理事件监听器
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentEpisodeIndex, detail, artPlayerRef.current]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // 收藏相关
  // ---------------------------------------------------------------------------
  // 每当 source 或 id 变化时检查收藏状态
  useEffect(() => {
    if (!currentSource || !currentId) return;
    (async () => {
      try {
        const fav = await isFavorited(currentSource, currentId);
        setFavorited(fav);
      } catch (err) {
        console.error('检查收藏状态失败:', err);
      }
    })();
  }, [currentSource, currentId]);

  // 监听收藏数据更新事件
  useEffect(() => {
    if (!currentSource || !currentId) return;

    const unsubscribe = subscribeToDataUpdates(
      'favoritesUpdated',
      (favorites: Record<string, any>) => {
        const key = generateStorageKey(currentSource, currentId);
        const isFav = !!favorites[key];
        setFavorited(isFav);
      }
    );

    return unsubscribe;
  }, [currentSource, currentId]);

  // 切换收藏
  const handleToggleFavorite = async () => {
    if (
      !videoTitleRef.current ||
      !detailRef.current ||
      !currentSourceRef.current ||
      !currentIdRef.current
    )
      return;

    try {
      if (favorited) {
        // 如果已收藏，删除收藏
        await deleteFavorite(currentSourceRef.current, currentIdRef.current);
        setFavorited(false);
      } else {
        // 如果未收藏，添加收藏
        await saveFavorite(currentSourceRef.current, currentIdRef.current, {
          title: videoTitleRef.current,
          source_name: detailRef.current?.source_name || '',
          year: detailRef.current?.year,
          cover: detailRef.current?.poster || '',
          total_episodes: detailRef.current?.episodes.length || 1,
          save_time: Date.now(),
          search_title: searchTitle,
        });
        setFavorited(true);
      }
    } catch (err) {
      console.error('切换收藏失败:', err);
    }
  };

  // Artplayer initialization moved - using VideoPlayer component instead
  // useEffect(() => {
  //   if (
  //     !Artplayer ||
  //     !Hls ||
  //     !videoUrl ||
  //     loading ||
  //     currentEpisodeIndex === null ||
  //     !artRef.current
  //   ) {
  //     return;
  //   }

  //   // OLD ARTPLAYER INITIALIZATION CODE - COMMENTED OUT
  //   // 确保选集索引有效
  //   if (
  //     !detail ||
  //     !detail.episodes ||
  //     currentEpisodeIndex >= detail.episodes.length ||
  //     currentEpisodeIndex < 0
  //   ) {
  //     setError(`选集索引无效，当前共 ${totalEpisodes} 集`);
  //     return;
  //   }
  //   // ... Artplayer initialization code removed ...
  //   // All Artplayer event listeners have been removed
  //   // New VideoPlayer component handles the video playback
  // }, []);

  // 当组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
    };
  }, []);

  if (loading) {
    // Determine status logic
    const getStatus = (target: string): 'waiting' | 'loading' | 'done' => {
      const stages = ['searching', 'preferring', 'fetching', 'ready'];
      const currentIdx = stages.indexOf(loadingStage);
      const targetIdx = stages.indexOf(target);

      if (target === 'preferring' && !optimizationEnabled) return 'done'; // Skipped

      if (currentIdx > targetIdx) return 'done';
      if (currentIdx === targetIdx) return 'loading';
      return 'waiting';
    };

    return (
      <PageLayout activePath='/play'>
        <div className='flex flex-col items-center justify-center min-h-[80vh]'>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className='w-full max-w-md bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden shadow-2xl p-8'
          >
            <div className='mb-8 flex items-center gap-3'>
              <div className='relative'>
                <div className='w-3 h-3 bg-green-500 rounded-full animate-ping absolute opacity-75' />
                <div className='w-3 h-3 bg-green-500 rounded-full relative' />
              </div>
              <h2 className='text-xl font-bold text-white'>正在准备播放资源</h2>
            </div>

            <div className='flex flex-col gap-2'>
              <ChecklistItem
                key='s1'
                label='全网资源搜索'
                status={getStatus('searching')}
              />
              {optimizationEnabled && (
                <ChecklistItem
                  key='s2'
                  label='线路智能优选'
                  status={getStatus('preferring')}
                />
              )}
              <ChecklistItem
                key='s3'
                label='获取视频详情'
                status={getStatus('fetching')}
              />
              <ChecklistItem
                key='s4'
                label='初始化播放器'
                status={
                  getStatus('ready') === 'loading' ||
                  getStatus('ready') === 'done'
                    ? 'loading'
                    : 'waiting'
                }
              />
            </div>
          </motion.div>
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout activePath='/play'>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className='flex flex-col items-center justify-center min-h-[70vh] px-4'
        >
          <div className='relative p-8 max-w-lg w-full bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden'>
            {/* Background Gradient */}
            <div className='absolute inset-0 bg-gradient-to-br from-red-500/10 via-transparent to-transparent pointer-events-none' />

            <div className='relative z-10 flex flex-col items-center text-center'>
              <motion.div
                className='w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6 ring-1 ring-red-500/20'
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                <div className='text-4xl'>😵</div>
              </motion.div>

              <h2 className='text-2xl font-bold text-white mb-2'>出错了</h2>

              <p className='text-slate-400 mb-8 max-w-sm mx-auto leading-relaxed'>
                {error}
              </p>

              <div className='flex gap-3 w-full'>
                <button
                  onClick={() => window.location.reload()}
                  className='flex-1 px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-all active:scale-95 border border-white/5'
                >
                  重试
                </button>
                <button
                  onClick={() =>
                    videoTitle
                      ? router.push(
                          `/search?q=${encodeURIComponent(videoTitle)}`
                        )
                      : router.back()
                  }
                  className='flex-1 px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-xl font-medium transition-all shadow-lg shadow-green-900/20 active:scale-95'
                >
                  {videoTitle ? '重新搜索' : '返回'}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </PageLayout>
    );
  }

  return (
    <PageLayout activePath='/play'>
      {/* Background Image with Blur */}
      <div className='fixed inset-0 z-0 pointer-events-none overflow-hidden'>
        <div className='absolute inset-0 bg-slate-950/90 mix-blend-multiply z-10' />
        <div className='absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/50 to-transparent z-10' />
        {videoCover && (
          <motion.img
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 0.4, scale: 1 }}
            transition={{ duration: 1.5 }}
            src={processImageUrl(videoCover)}
            alt='background'
            className='w-full h-full object-cover filter blur-[80px] opacity-30 transform scale-110'
          />
        )}
      </div>

      <motion.div
        variants={pageVariants}
        initial='initial'
        animate='animate'
        className='relative z-10 container mx-auto px-4 lg:px-8 py-4 lg:py-8 max-w-[1600px] flex flex-col gap-6 min-h-[calc(100vh-80px)]'
      >
        {/* Header Section */}
        <motion.div
          variants={fadeInUp}
          className='flex items-center justify-between gap-4'
        >
          <div className='flex items-center gap-3 overflow-hidden'>
            <button
              aria-label='返回上一页'
              onClick={() => router.back()}
              className='p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/80 hover:text-white transition-colors border border-white/5 backdrop-blur-sm'
            >
              <ArrowLeft size={20} />
            </button>
            <div className='flex flex-col min-w-0'>
              <h1 className='text-xl lg:text-2xl font-bold text-white truncate flex items-center gap-2'>
                {videoTitle || '影片标题'}
                {totalEpisodes > 1 && (
                  <span className='px-2 py-0.5 rounded text-sm bg-green-500/20 text-green-400 font-medium border border-green-500/20 whitespace-nowrap'>
                    第 {currentEpisodeIndex + 1} 集
                  </span>
                )}
              </h1>
              <div className='flex items-center gap-2 text-sm text-slate-400'>
                {detail?.type_name && <span>{detail.type_name}</span>}
                {detail?.year && (
                  <>
                    <span className='w-1 h-1 rounded-full bg-slate-600' />
                    <span>{detail.year}</span>
                  </>
                )}
                <span className='w-1 h-1 rounded-full bg-slate-600' />
                <span className='text-slate-300'>{detail?.source_name}</span>
              </div>
            </div>
          </div>

          <div className='flex items-center gap-2'>
            <button
              aria-label={favorited ? '取消收藏' : '收藏'}
              onClick={handleToggleFavorite}
              className={`p-2.5 rounded-full transition-all duration-300 flex items-center justify-center border backdrop-blur-md ${
                favorited
                  ? 'bg-red-500/10 border-red-500/30 text-red-500'
                  : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Heart
                size={20}
                fill={favorited ? 'currentColor' : 'none'}
                className={favorited ? 'animate-pulse-fast' : ''}
              />
            </button>

            {/* Mobile Only Episode List Toggle */}
            <button
              aria-label='查看选集'
              onClick={() => {
                const element = document.getElementById(
                  'episode-selector-container'
                );
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth' });
                }
              }}
              className='lg:hidden p-2.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/30 backdrop-blur-md'
            >
              <Layers size={20} />
            </button>
          </div>
        </motion.div>

        {/* Main Content Grid */}
        <div className='grid grid-cols-1 lg:grid-cols-4 gap-6 h-full'>
          {/* Left Column: Player (Span 3) */}
          <motion.div
            variants={fadeInUp}
            className={`flex flex-col gap-4 transition-all duration-500 ease-spring ${
              isEpisodeSelectorCollapsed ? 'lg:col-span-4' : 'lg:col-span-3'
            }`}
          >
            {/* Player Container */}
            <div className='aspect-video w-full bg-black/60 rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 relative group'>
              <VideoPlayer
                src={videoUrl}
                title={detail?.title || 'Video'}
                currentEpisode={currentEpisodeIndex}
                totalEpisodes={totalEpisodes}
                skipConfig={skipConfig}
                onNextEpisode={handleNextEpisode}
                onPlayProgress={(time, duration) => {
                  // 更新当前播放进度到 ref
                  currentPlayTimeRef.current = time;
                  currentDurationRef.current = duration;

                  // 定期保存播放进度
                  const now = Date.now();
                  const interval =
                    process.env.NEXT_PUBLIC_STORAGE_TYPE === 'd1'
                      ? 10000
                      : process.env.NEXT_PUBLIC_STORAGE_TYPE === 'upstash'
                      ? 20000
                      : 5000;
                  if (now - lastSaveTimeRef.current > interval) {
                    saveCurrentPlayProgress(time, duration);
                    lastSaveTimeRef.current = now;
                  }
                }}
                onSetIntro={(time) => {
                  _handleSkipConfigChange({
                    ...skipConfig,
                    intro_time: time,
                  });
                }}
                onSetOutro={(time) => {
                  _handleSkipConfigChange({
                    ...skipConfig,
                    outro_time: time,
                  });
                }}
                onSkipIntro={() => {
                  // 片头跳过通知
                  console.log(
                    `已跳过片头 (${formatTime(skipConfig.intro_time)})`
                  );
                }}
                onSkipOutro={() => {
                  // 片尾跳过通知
                  console.log(
                    `已跳过片尾 (${formatTime(-skipConfig.outro_time)})`
                  );
                }}
                className='w-full h-full'
              />

              {/* Loading Overlay */}
              <AnimatePresence>
                {isVideoLoading && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className='absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center'
                  >
                    <div className='relative w-16 h-16'>
                      <motion.div
                        className='absolute inset-0 border-4 border-t-green-500 border-r-transparent border-b-green-500/30 border-l-transparent rounded-full'
                        animate={{ rotate: 360 }}
                        transition={{
                          duration: 1,
                          repeat: Infinity,
                          ease: 'linear',
                        }}
                      />
                      <div className='absolute inset-0 flex items-center justify-center text-green-500 font-bold text-xs'>
                        HD
                      </div>
                    </div>
                    <p className='mt-4 text-green-400 font-medium animate-pulse'>
                      {videoLoadingStage === 'sourceChanging'
                        ? '正在切换源...'
                        : '即将播放...'}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Video Info Card (Below Player) */}
            <div className='bg-slate-900/40 backdrop-blur-md border border-white/5 rounded-2xl p-6 hidden lg:block'>
              <div className='flex items-start gap-6'>
                {/* Poster */}
                <div className='w-24 shrink-0 aspect-[2/3] rounded-lg overflow-hidden relative shadow-lg ring-1 ring-white/10'>
                  <img
                    src={processImageUrl(videoCover)}
                    alt={videoTitle}
                    className='w-full h-full object-cover'
                  />
                </div>

                {/* Info */}
                <div className='flex-1 space-y-4'>
                  <div className='flex flex-wrap gap-2'>
                    {detail?.class?.split(',').map((cls) => (
                      <Badge
                        key={cls}
                        className='bg-blue-500/10 text-blue-400 border-blue-500/20'
                      >
                        {cls}
                      </Badge>
                    ))}
                    {detail?.year && (
                      <Badge className='bg-yellow-500/10 text-yellow-400 border-yellow-500/20'>
                        {detail.year}
                      </Badge>
                    )}
                  </div>
                  <p className='text-slate-300 text-sm leading-relaxed line-clamp-3 hover:line-clamp-none transition-all cursor-pointer'>
                    {detail?.desc || '暂无简介...'}
                  </p>
                </div>

                <div className='flex flex-col gap-2 shrink-0'>
                  <button
                    onClick={handleToggleFavorite}
                    className='flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm font-medium text-slate-300'
                  >
                    <Heart
                      size={16}
                      className={favorited ? 'fill-red-500 text-red-500' : ''}
                    />
                    {favorited ? '已收藏' : '收藏'}
                  </button>
                  <button
                    onClick={() =>
                      setIsEpisodeSelectorCollapsed(!isEpisodeSelectorCollapsed)
                    }
                    className='flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm font-medium text-slate-300'
                  >
                    {isEpisodeSelectorCollapsed ? (
                      <Layout size={16} />
                    ) : (
                      <Maximize size={16} />
                    )}
                    {isEpisodeSelectorCollapsed ? '显示选集' : '宽屏模式'}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Right Column: Episodes (Span 1) */}
          <motion.div
            id='episode-selector-container'
            variants={fadeInUp}
            className={`flex flex-col gap-4 h-full min-h-[500px] lg:min-h-0 ${
              isEpisodeSelectorCollapsed ? 'hidden lg:hidden' : 'lg:col-span-1'
            }`}
          >
            <div className='bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden h-full flex flex-col shadow-xl'>
              <div className='p-4 border-b border-white/5 flex items-center justify-between bg-white/5'>
                <h3 className='font-semibold text-white flex items-center gap-2'>
                  <Layers size={18} className='text-green-400' />
                  选集列表
                </h3>
                <span className='text-xs text-slate-400 font-mono bg-white/5 px-2 py-0.5 rounded'>
                  {availableSources.length} 个源可用
                </span>
              </div>

              <div className='flex-1 overflow-hidden relative'>
                <div className='absolute inset-0 p-4 overflow-y-auto custom-scrollbar'>
                  <EpisodeSelector
                    totalEpisodes={totalEpisodes}
                    value={currentEpisodeIndex + 1}
                    onChange={handleEpisodeChange}
                    onSourceChange={handleSourceChange}
                    currentSource={currentSource}
                    currentId={currentId}
                    videoTitle={searchTitle || videoTitle}
                    availableSources={availableSources}
                    sourceSearchLoading={sourceSearchLoading}
                    sourceSearchError={sourceSearchError}
                    precomputedVideoInfo={precomputedVideoInfo}
                  />
                </div>
              </div>
            </div>
          </motion.div>

          {/* Mobile Details Text (Below everything on mobile) */}
          <div className='lg:hidden bg-slate-900/40 backdrop-blur-md border border-white/5 rounded-2xl p-4 mt-4'>
            <h2 className='text-lg font-bold text-white mb-2'>简介</h2>
            <p className='text-slate-300 text-sm leading-relaxed'>
              {detail?.desc || '暂无简介...'}
            </p>
          </div>
        </div>
      </motion.div>
    </PageLayout>
  );
}

export default function PlayPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PlayPageClient />
    </Suspense>
  );
}
