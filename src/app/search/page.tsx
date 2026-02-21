/* eslint-disable react-hooks/exhaustive-deps, @typescript-eslint/no-explicit-any */
'use client';

import { AnimatePresence, LayoutGroup, motion, Variants } from 'framer-motion';
import {
  Calendar,
  ChevronRight,
  ChevronUp,
  Film,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Star,
  TrendingUp,
  X,
} from 'lucide-react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';

import {
  addSearchHistory,
  clearSearchHistory,
  deleteSearchHistory,
  getSearchHistory,
  getSearchRank,
  recordSearchRank,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { SearchRankItem, SearchResult } from '@/lib/types';
import { yellowWords } from '@/lib/yellow';

import PageLayout from '@/components/PageLayout';
import ScrollableRow from '@/components/ScrollableRow';

// --- Animation Variants ---
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const itemVariants: Variants = {
  hidden: { y: 20, opacity: 0, scale: 0.95, filter: 'blur(10px)' },
  show: {
    y: 0,
    opacity: 1,
    scale: 1,
    filter: 'blur(0px)',
    transition: { type: 'spring', stiffness: 50, damping: 15 },
  },
  exit: {
    opacity: 0,
    scale: 0.9,
    filter: 'blur(10px)',
    transition: { duration: 0.2 },
  },
};

// --- Sub Components ---
const Badge = ({
  children,
  className = '',
}: {
  children?: React.ReactNode;
  className?: string;
}) => (
  <span
    className={`px-2 py-1 rounded-md text-xs font-medium backdrop-blur-md bg-black/5 border border-black/10 text-slate-700 dark:bg-white/5 dark:border-white/10 dark:text-slate-200 ${className}`}
  >
    {children}
  </span>
);

const ScrollingTitle = ({
  title,
  isHovered,
}: {
  title: string;
  isHovered: boolean;
}) => {
  const isLong = title.length > 8;

  return (
    <div className='overflow-hidden w-full relative h-8 flex items-center'>
      {isLong && isHovered ? (
        <motion.div
          className='whitespace-nowrap flex gap-4 absolute'
          initial={{ x: 0 }}
          animate={{ x: '-50%' }}
          transition={{
            repeat: Infinity,
            duration: Math.max(5, title.length * 0.3),
            ease: 'linear',
          }}
        >
          <span className='text-lg font-bold text-white dark:text-white leading-tight'>
            {title}
          </span>
          <span className='text-lg font-bold text-white dark:text-white leading-tight'>
            {title}
          </span>
        </motion.div>
      ) : (
        <motion.h3
          layout='position'
          className='text-lg font-bold text-white dark:text-white leading-tight truncate w-full'
        >
          {title}
        </motion.h3>
      )}
    </div>
  );
};

const NewMovieCard: React.FC<{
  item: SearchResult;
  onClick: (item: SearchResult) => void;
}> = ({ item, onClick }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.div
      layout
      variants={itemVariants}
      initial='hidden'
      animate='show'
      exit='exit'
      className='group relative bg-white/40 dark:bg-slate-900/60 rounded-xl overflow-hidden border border-black/10 dark:border-white/10 hover:border-green-400/50 cursor-pointer flex flex-col h-full shadow-lg aspect-[2/3] hover:shadow-xl transition-shadow duration-300'
      onClick={() => onClick(item)}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
    >
      {/* Background Image with Blur Effect & Shared Element Transition */}
      <div className='absolute inset-0 overflow-hidden'>
        <motion.img
          layoutId={`poster-${item.id}-${item.source}`}
          src={item.poster}
          alt={item.title}
          className='w-full h-full object-cover'
          animate={{
            scale: isHovered ? 1.1 : 1,
            filter: isHovered
              ? 'blur(4px) brightness(0.6)'
              : 'blur(0px) brightness(1)',
          }}
          transition={{ duration: 0.4 }}
          loading='lazy'
        />
        <div className='absolute inset-0 bg-gradient-to-t from-black/95 via-black/20 to-transparent pointer-events-none' />
      </div>

      {/* Play Icon Centered */}
      <div className='absolute inset-0 flex items-center justify-center pointer-events-none'>
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{
            opacity: isHovered ? 1 : 0,
            scale: isHovered ? 1 : 0.8,
          }}
          transition={{ duration: 0.2 }}
          className='bg-white/10 backdrop-blur-md border border-white/20 rounded-full p-4 shadow-2xl'
        >
          <Play className='w-8 h-8 text-white fill-current opacity-90' />
        </motion.div>
      </div>

      {/* Content Section */}
      <div className='absolute bottom-0 left-0 right-0 p-4 flex flex-col z-10'>
        <div className='flex justify-between items-end mb-1'>
          <div className='flex gap-1'>
            <Badge className='bg-black/40 text-yellow-400 border-yellow-400/30 flex items-center gap-1'>
              <Star size={10} fill='currentColor' /> {item.year || 'N/A'}
            </Badge>
          </div>
        </div>

        <ScrollingTitle title={item.title} isHovered={isHovered} />

        <motion.div
          layout
          className='flex flex-wrap gap-2 mt-2 items-center justify-between'
        >
          <span className='text-xs text-slate-300 flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded dark:text-slate-300'>
            <Layers size={10} /> {item.type_name}
          </span>
          <span className='text-xs font-medium text-green-400 flex items-center gap-1'>
            {item.episodes.length} 集
          </span>
        </motion.div>

        {/* Expandable Description Section */}
        <motion.div
          initial={false}
          animate={{
            height: isHovered ? 'auto' : 0,
            opacity: isHovered ? 1 : 0,
            marginTop: isHovered ? 12 : 0,
          }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          className='overflow-hidden'
        >
          <p className='text-sm text-slate-300 line-clamp-4 leading-relaxed drop-shadow-md'>
            {item.desc || '暂无描述信息'}
          </p>

          <div className='pt-3 border-t border-white/20 flex items-center justify-between mt-3'>
            <span className='text-xs text-slate-400'>{item.source_name}</span>
            <ChevronRight size={12} className='text-green-400' />
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};

const RankCard: React.FC<{
  item: SearchRankItem;
  index: number;
  onClick: (keyword: string) => void;
}> = ({ item, index, onClick }) => {
  const isTop3 = index < 3;

  // 这里的颜色方案要更加“鲜明”
  const rankColors = [
    'text-red-500 shadow-red-500/50',
    'text-orange-400 shadow-orange-400/50',
    'text-yellow-300 shadow-yellow-300/50',
    'text-slate-400 shadow-slate-400/30',
  ];
  const rankColorClass = index < 3 ? rankColors[index] : rankColors[3];

  const gradients = [
    'from-red-900/80 to-black',
    'from-orange-900/80 to-black',
    'from-amber-900/80 to-black',
    'from-slate-900/80 to-black',
  ];
  const bgGradient = index < 3 ? gradients[index] : gradients[3];

  return (
    <motion.div
      whileHover={{ scale: 1.05, y: -5 }}
      whileTap={{ scale: 0.95 }}
      onClick={() => onClick(item.keyword)}
      className='relative flex-shrink-0 w-36 h-24 cursor-pointer group'
    >
      {/* Ranking Number - 更色彩鲜明且带阴影 */}
      <div className='absolute -left-6 -bottom-3 z-0 pointer-events-none select-none overflow-hidden'>
        <span
          className={`text-[100px] font-black leading-none transition-all duration-300 group-hover:scale-110 ${
            rankColorClass.split(' ')[0]
          } drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]`}
          style={{
            opacity: isTop3 ? 0.8 : 0.4,
            filter: isTop3 ? 'brightness(1.2)' : 'brightness(0.8)',
          }}
        >
          {index + 1}
        </span>
      </div>

      {/* Main Card Content - 背景更花里胡哨 */}
      <div
        className={`relative z-10 w-full h-full p-3 rounded-xl border border-white/10 backdrop-blur-md bg-gradient-to-br ${bgGradient} overflow-hidden shadow-2xl transition-all duration-300 group-hover:border-white/30`}
      >
        {/* Fancy background elements - 各种光斑和杂色 */}
        <div className='absolute -right-2 -top-2 w-16 h-16 bg-gradient-to-br from-white/10 to-transparent rounded-full blur-xl' />
        <div
          className={`absolute -left-4 -bottom-4 w-12 h-12 rounded-full blur-lg opacity-30 ${
            isTop3 ? 'bg-red-500' : 'bg-blue-500'
          }`}
        />
        <div className='absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(255,255,255,0.05),transparent)]' />

        {/* Glow effect on hover */}
        <div className='absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300' />

        <div className='flex flex-col h-full justify-between relative z-20'>
          <div className='flex justify-between items-start'>
            <span className='text-[9px] font-black uppercase tracking-widest text-white/40'>
              TOP {index + 1}
            </span>
            {isTop3 && (
              <div className='p-1 rounded bg-white/10'>
                <TrendingUp size={10} className='text-white animate-pulse' />
              </div>
            )}
          </div>

          <div className='space-y-0.5'>
            <h3 className='text-sm font-bold text-white line-clamp-2 leading-tight drop-shadow-sm group-hover:text-green-400 transition-colors'>
              {item.keyword}
            </h3>
            <div className='flex items-center gap-1.5'>
              <div className='h-1 flex-1 bg-white/10 rounded-full overflow-hidden'>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{
                    width: `${Math.min(100, (item.count / 100) * 100)}%`,
                  }}
                  className={`h-full ${
                    isTop3 ? 'bg-green-500' : 'bg-slate-500'
                  }`}
                />
              </div>
              <span className='text-[8px] text-white/50 font-medium tabular-nums'>
                {item.count > 999
                  ? `${(item.count / 1000).toFixed(1)}k`
                  : item.count}
              </span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const DetailModal = ({
  item,
  onClose,
}: {
  item: SearchResult;
  onClose: () => void;
}) => {
  const router = useRouter();
  const [countdown, setCountdown] = useState(5);
  const [isAutoRedirecting, setIsAutoRedirecting] = useState(true);

  // 自动倒计时逻辑
  useEffect(() => {
    if (!isAutoRedirecting || !item) return;

    if (countdown <= 0) {
      handlePlayNow();
      return;
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown, isAutoRedirecting, item]);

  const handlePlayNow = () => {
    if (!item) return;
    onClose();
    // 构造跳转 URL：携带必要的参数，默认播放第一集
    const url = `/play?source=${item.source}&id=${
      item.id
    }&title=${encodeURIComponent(item.title)}&year=${item.year || ''}`;
    router.push(url);
  };

  const handleCancelAutoRedirect = () => {
    setIsAutoRedirecting(false);
  };

  if (!item) return null;

  return (
    <motion.div
      className='fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6'
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div
        className='absolute inset-0 bg-black/60 backdrop-blur-md'
        onClick={onClose}
      />
      <motion.div
        className='relative w-full max-w-5xl bg-white/90 dark:bg-slate-900/90 rounded-2xl overflow-hidden border border-black/10 dark:border-white/10 shadow-2xl flex flex-col max-h-[90vh] backdrop-blur-xl'
        initial={{ opacity: 0, scale: 0.9, y: 50 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 50 }}
        transition={{ type: 'spring', stiffness: 100, damping: 20 }}
      >
        <button
          onClick={onClose}
          className='absolute top-4 right-4 z-10 p-2 rounded-full bg-black/5 hover:bg-black/10 text-gray-700 transition-colors dark:bg-black/30 dark:hover:bg-white/10 dark:text-white'
          aria-label='关闭'
        >
          <X size={24} />
        </button>

        <div className='flex flex-col md:flex-row h-full overflow-hidden'>
          {/* Poster Section (Left/Top) */}
          <div className='relative h-64 md:h-auto md:w-1/3 shrink-0 bg-gray-200 dark:bg-black'>
            <motion.img
              layoutId={`poster-${item.id}-${item.source}`}
              src={item.poster}
              alt={item.title}
              className='w-full h-full object-cover'
            />
            <div className='absolute inset-0 bg-gradient-to-t from-white/90 dark:from-slate-900 to-transparent md:bg-gradient-to-r' />
          </div>

          {/* Content Section (Right/Bottom) */}
          <div className='flex-1 p-6 md:p-8 overflow-y-auto'>
            <div className='mb-6'>
              <div className='flex items-center gap-3 mb-2'>
                <Badge className='text-green-400 border-green-400/30 bg-green-400/10'>
                  {item.type_name}
                </Badge>
                <span className='text-slate-600 dark:text-slate-400 text-sm flex items-center gap-1'>
                  <Calendar size={14} /> {item.year || 'N/A'}
                </span>
              </div>
              <h2 className='text-3xl font-bold text-gray-900 dark:text-white mb-4'>
                {item.title}
              </h2>

              <div className='flex flex-wrap gap-2 mb-4'>
                {item.class &&
                  item.class.split(',').map((c) => (
                    <span
                      key={c}
                      className='text-sm text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full'
                    >
                      {c.trim()}
                    </span>
                  ))}
              </div>

              <p className='text-slate-700 dark:text-slate-300 leading-relaxed text-sm md:text-base'>
                {item.desc || '暂无描述信息'}
              </p>
            </div>

            <div className='border-t border-gray-200 dark:border-white/10 pt-6'>
              {isAutoRedirecting ? (
                // 倒计时界面
                <div className='flex flex-col items-center justify-center py-8 space-y-6'>
                  <div className='flex flex-col items-center gap-2'>
                    <p className='text-slate-600 dark:text-slate-400 text-sm'>
                      即将为您播放
                    </p>

                    <div className='flex items-end gap-1 overflow-hidden h-16'>
                      <AnimatePresence mode='popLayout'>
                        <motion.span
                          key={countdown}
                          initial={{ y: 40, opacity: 0, filter: 'blur(10px)' }}
                          animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
                          exit={{ y: -40, opacity: 0, filter: 'blur(10px)' }}
                          transition={{
                            type: 'spring',
                            stiffness: 300,
                            damping: 30,
                          }}
                          className='text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-br from-green-400 to-emerald-600 font-mono leading-none'
                        >
                          {countdown}
                        </motion.span>
                      </AnimatePresence>
                      <span className='text-lg font-medium text-slate-500 mb-2 ml-1'>
                        秒后跳转
                      </span>
                    </div>
                  </div>

                  <div className='flex items-center gap-4 w-full max-w-xs'>
                    <button
                      onClick={handlePlayNow}
                      className='flex-1 px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-xl font-medium transition-all shadow-lg shadow-green-900/20 active:scale-95 flex items-center justify-center gap-2'
                    >
                      <Play size={18} fill='currentColor' />
                      立即播放
                    </button>
                    <button
                      onClick={handleCancelAutoRedirect}
                      className='flex-1 px-4 py-3 bg-black/5 hover:bg-black/10 text-slate-700 hover:text-slate-900 rounded-xl font-medium transition-all active:scale-95 border border-black/10 dark:bg-white/5 dark:hover:bg-white/10 dark:text-slate-300 dark:hover:text-white dark:border-white/5'
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                // 选集列表界面
                <>
                  <div className='flex items-center justify-between mb-4'>
                    <h3 className='text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2'>
                      <Film size={20} className='text-green-400' />
                      选集播放
                      <span className='text-sm font-normal text-slate-500 ml-2'>
                        ({item.episodes.length} 集)
                      </span>
                    </h3>
                  </div>

                  <div className='grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 max-h-64 overflow-y-auto'>
                    {item.episodes.map((ep, idx) => {
                      return (
                        <motion.button // Changed from 'a' to 'button' for better handling, or keep 'a' if simply linking. Play page requires params.
                          key={idx}
                          onClick={() => {
                            onClose();
                            // 构造跳转 URL，这里假设播放地址需要通过 play 页面解析或直接播放
                            // 注意：通常播放页需要 source 和 id，而 ep 是具体某集的 url
                            // 这里我们需要传递 source 和 id，并让 play 页面根据集数播放
                            // 由于 EpisodeSelector logic uses episode index, we can just pass params.
                            // But play page needs to map episode index.
                            // Actually, if we just go to play page with source/id, it defaults to ep 1.
                            // If we want specific episode, we might need 'ep' query param (play page supports 'id', 'source', 'title', 'year').
                            // PlayPage logic: searches by source/id. Then plays default.
                            // To play specific episode? PlayPage logic: `const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState(0);`
                            // It doesn't seem to read 'ep' index from url.
                            // Let's stick to base play page for now or just navigate to play page.
                            const url = `/play?source=${item.source}&id=${
                              item.id
                            }&title=${encodeURIComponent(item.title)}&year=${
                              item.year || ''
                            }`;
                            router.push(url);
                          }}
                          className='block p-3 text-center rounded-lg bg-slate-100 text-slate-700 hover:bg-green-500 hover:text-white transition-all text-sm font-medium border border-black/5 truncate dark:bg-slate-800 dark:text-slate-200 dark:border-white/5 cursor-pointer'
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          第 {idx + 1} 集
                        </motion.button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

function SearchPageClient() {
  // 搜索历史
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  // 搜索排行榜
  const [searchRank, setSearchRank] = useState<SearchRankItem[]>([]);
  // 返回顶部按钮显示状态
  const [showBackToTop, setShowBackToTop] = useState(false);
  // 详情modal选中项
  const [selectedItem, setSelectedItem] = useState<SearchResult | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const searchEventSourceRef = useRef<EventSource | null>(null);
  const activeSearchIdRef = useRef(0);

  // 前端筛选（不影响后端请求）
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [genreFilter, setGenreFilter] = useState<string>('all');
  const [episodesFilter, setEpisodesFilter] = useState<string>('all');

  // 搜索建议
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);

  // 获取默认聚合设置：只读取用户本地设置，默认为 true
  const getDefaultAggregate = () => {
    if (typeof window !== 'undefined') {
      const userSetting = localStorage.getItem('defaultAggregateSearch');
      if (userSetting !== null) {
        return JSON.parse(userSetting);
      }
    }
    return true; // 默认启用聚合
  };

  const [viewMode, setViewMode] = useState<'agg' | 'all'>(() => {
    return getDefaultAggregate() ? 'agg' : 'all';
  });

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    searchResults.forEach((r) => years.add(r.year || 'unknown'));
    return Array.from(years).sort((a, b) => {
      if (a === 'unknown' && b === 'unknown') return 0;
      if (a === 'unknown') return 1;
      if (b === 'unknown') return -1;
      return parseInt(b) - parseInt(a);
    });
  }, [searchResults]);

  const availableSources = useMemo(() => {
    const map = new Map<string, string>();
    searchResults.forEach((r) => {
      if (!map.has(r.source)) map.set(r.source, r.source_name || r.source);
    });
    return Array.from(map.entries()).map(([key, name]) => ({ key, name }));
  }, [searchResults]);

  const availableGenres = useMemo(() => {
    const genres = new Set<string>();
    searchResults.forEach((r) => {
      if (r.class) {
        r.class.split(',').forEach((c) => {
          const trimmed = c.trim();
          if (trimmed) genres.add(trimmed);
        });
      }
      if (r.type_name) {
        genres.add(r.type_name);
      }
    });
    return Array.from(genres).sort();
  }, [searchResults]);

  const filteredSearchResults = useMemo(() => {
    return searchResults.filter((r) => {
      if (yearFilter !== 'all' && (r.year || 'unknown') !== yearFilter)
        return false;
      if (sourceFilter !== 'all' && r.source !== sourceFilter) return false;

      if (genreFilter !== 'all') {
        const classes = r.class ? r.class.split(',').map((c) => c.trim()) : [];
        const types = r.type_name ? [r.type_name] : [];
        if (!classes.includes(genreFilter) && !types.includes(genreFilter))
          return false;
      }

      if (episodesFilter !== 'all') {
        const count = r.episodes.length;
        if (episodesFilter === '1' && count !== 1) return false;
        if (episodesFilter === 'short' && (count < 2 || count > 12))
          return false;
        if (episodesFilter === 'medium' && (count < 13 || count > 30))
          return false;
        if (episodesFilter === 'long' && count <= 30) return false;
      }

      return true;
    });
  }, [searchResults, sourceFilter, yearFilter, genreFilter, episodesFilter]);

  // 聚合后的结果（按标题和年份分组）
  const aggregatedResults = useMemo(() => {
    const map = new Map<string, SearchResult[]>();
    filteredSearchResults.forEach((item) => {
      // 使用 title + year + type 作为键，year 必然存在，但依然兜底 'unknown'
      const key = `${item.title.replaceAll(' ', '')}-${
        item.year || 'unknown'
      }-${item.episodes.length === 1 ? 'movie' : 'tv'}`;
      const arr = map.get(key) || [];
      arr.push(item);
      map.set(key, arr);
    });
    return Array.from(map.entries()).sort((a, b) => {
      // 优先排序：标题与搜索词完全一致的排在前面
      const aExactMatch = a[1][0].title
        .replaceAll(' ', '')
        .includes(searchQuery.trim().replaceAll(' ', ''));
      const bExactMatch = b[1][0].title
        .replaceAll(' ', '')
        .includes(searchQuery.trim().replaceAll(' ', ''));

      if (aExactMatch && !bExactMatch) return -1;
      if (!aExactMatch && bExactMatch) return 1;

      // 年份排序
      if (a[1][0].year === b[1][0].year) {
        return a[0].localeCompare(b[0]);
      } else {
        // 处理 unknown 的情况
        const aYear = a[1][0].year;
        const bYear = b[1][0].year;

        if (aYear === 'unknown' && bYear === 'unknown') {
          return 0;
        } else if (aYear === 'unknown') {
          return 1; // a 排在后面
        } else if (bYear === 'unknown') {
          return -1; // b 排在后面
        } else {
          // 都是数字年份，按数字大小排序（大的在前面）
          return aYear > bYear ? -1 : 1;
        }
      }
    });
  }, [filteredSearchResults, searchQuery]);

  // 搜索建议防抖
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed || trimmed === searchParams.get('q')) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsFetchingSuggestions(true);
      try {
        const res = await fetch(
          `https://m.douban.cmliussss.net/rexxar/api/v2/search?q=${encodeURIComponent(
            trimmed
          )}`
        );
        const data = await res.json();
        if (data.subjects && data.subjects.items) {
          setSuggestions(data.subjects.items);
          if (
            document.activeElement === document.getElementById('searchInput')
          ) {
            setShowSuggestions(true);
          }
        } else {
          setSuggestions([]);
        }
      } catch (error) {
        setSuggestions([]);
      } finally {
        setIsFetchingSuggestions(false);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [searchQuery, searchParams]);

  useEffect(() => {
    // 无搜索参数时聚焦搜索框
    !searchParams.get('q') && document.getElementById('searchInput')?.focus();

    // 初始加载搜索历史
    getSearchHistory().then(setSearchHistory);
    // 初始加载搜索排行榜
    getSearchRank().then(setSearchRank);

    // 监听搜索历史更新事件
    const unsubscribe = subscribeToDataUpdates(
      'searchHistoryUpdated',
      (newHistory: string[]) => {
        setSearchHistory(newHistory);
      }
    );

    // 获取滚动位置的函数 - 专门针对 body 滚动
    const getScrollTop = () => {
      return document.body.scrollTop || 0;
    };

    // 使用 requestAnimationFrame 持续检测滚动位置
    let isRunning = false;
    const checkScrollPosition = () => {
      if (!isRunning) return;

      const scrollTop = getScrollTop();
      const shouldShow = scrollTop > 300;
      setShowBackToTop(shouldShow);

      requestAnimationFrame(checkScrollPosition);
    };

    // 启动持续检测
    isRunning = true;
    checkScrollPosition();

    // 监听 body 元素的滚动事件
    const handleScroll = () => {
      const scrollTop = getScrollTop();
      setShowBackToTop(scrollTop > 300);
    };

    document.body.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      unsubscribe();
      isRunning = false; // 停止 requestAnimationFrame 循环

      // 移除 body 滚动事件监听器
      document.body.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    return () => {
      searchEventSourceRef.current?.close();
      searchEventSourceRef.current = null;
    };
  }, []);

  useEffect(() => {
    // 当搜索参数变化时更新搜索状态
    const query = searchParams.get('q');
    if (query) {
      setSearchQuery(query);
      fetchSearchResults(query);

      // 保存到搜索历史 (事件监听会自动更新界面)
      addSearchHistory(query);

      // 记录排行榜并刷新榜单
      recordSearchRank(query).then(setSearchRank);
    } else {
      setShowResults(false);
    }
  }, [searchParams]);

  const fetchSearchResults = async (query: string) => {
    const trimmedQuery = query.trim();
    activeSearchIdRef.current += 1;
    const searchId = activeSearchIdRef.current;
    let stopLoadingInFinally = true;

    const closeActiveStream = () => {
      searchEventSourceRef.current?.close();
      searchEventSourceRef.current = null;
    };

    const sortResults = (results: SearchResult[]) => {
      return [...results].sort((a: SearchResult, b: SearchResult) => {
        // 优先排序：标题与搜索词完全一致的排在前面
        const aExactMatch = a.title === trimmedQuery;
        const bExactMatch = b.title === trimmedQuery;

        if (aExactMatch && !bExactMatch) return -1;
        if (!aExactMatch && bExactMatch) return 1;

        // 如果都匹配或都不匹配，则按原来的逻辑排序
        if (a.year === b.year) {
          return a.title.localeCompare(b.title);
        } else {
          // 处理 unknown 的情况
          if (a.year === 'unknown' && b.year === 'unknown') {
            return 0;
          } else if (a.year === 'unknown') {
            return 1; // a 排在后面
          } else if (b.year === 'unknown') {
            return -1; // b 排在后面
          } else {
            // 都是数字年份，按数字大小排序（大的在前面）
            return parseInt(a.year) > parseInt(b.year) ? -1 : 1;
          }
        }
      });
    };

    const applyYellowFilterIfNeeded = (results: SearchResult[]) => {
      if (
        typeof window !== 'undefined' &&
        !(window as any).RUNTIME_CONFIG?.DISABLE_YELLOW_FILTER
      ) {
        return results.filter((result: SearchResult) => {
          const typeName = result.type_name || '';
          return !yellowWords.some((word: string) => typeName.includes(word));
        });
      }
      return results;
    };

    const fetchJsonFallback = async () => {
      const response = await fetch(
        `/api/search?q=${encodeURIComponent(trimmedQuery)}`
      );
      if (!response.ok) throw new Error('搜索失败');
      const data = await response.json();
      let results = data.results as SearchResult[];
      results = applyYellowFilterIfNeeded(results);
      setSearchResults(sortResults(results));
      setShowResults(true);
    };

    try {
      setIsLoading(true);
      closeActiveStream();
      setSearchResults([]);
      setShowResults(true);
      setYearFilter('all');
      setSourceFilter('all');
      setGenreFilter('all');
      setEpisodesFilter('all');

      if (typeof EventSource === 'undefined') {
        await fetchJsonFallback();
        return;
      }

      let receivedAny = false;
      const mergedKey = (r: SearchResult) => `${r.source}:${r.id}`;

      const es = new EventSource(
        `/api/search?q=${encodeURIComponent(trimmedQuery)}&stream=1`
      );
      searchEventSourceRef.current = es;
      stopLoadingInFinally = false;
      let finished = false;

      const onChunk = (event: MessageEvent) => {
        if (activeSearchIdRef.current !== searchId) return;
        receivedAny = true;
        const payload = JSON.parse(event.data) as {
          results: SearchResult[];
        };
        const incoming = applyYellowFilterIfNeeded(payload.results || []);
        if (incoming.length === 0) return;

        setSearchResults((prev) => {
          const map = new Map<string, SearchResult>();
          prev.forEach((r) => map.set(mergedKey(r), r));
          incoming.forEach((r) => map.set(mergedKey(r), r));
          return sortResults(Array.from(map.values()));
        });
      };

      const onDone = () => {
        if (activeSearchIdRef.current !== searchId) return;
        if (finished) return;
        finished = true;
        es.close();
        if (searchEventSourceRef.current === es) {
          searchEventSourceRef.current = null;
        }
        setIsLoading(false);
      };

      const onError = async () => {
        if (activeSearchIdRef.current !== searchId) return;
        if (finished) return;
        finished = true;
        es.close();
        if (searchEventSourceRef.current === es) {
          searchEventSourceRef.current = null;
        }
        try {
          if (!receivedAny) {
            await fetchJsonFallback();
          }
        } catch (e) {
          setSearchResults([]);
        } finally {
          setIsLoading(false);
        }
      };

      es.addEventListener('chunk', onChunk as unknown as EventListener);
      es.addEventListener('done', onDone as unknown as EventListener);
      es.addEventListener('abort', onError as unknown as EventListener);
      es.onerror = onError;
    } catch (error) {
      setSearchResults([]);
      if (activeSearchIdRef.current === searchId) setIsLoading(false);
    } finally {
      if (stopLoadingInFinally && activeSearchIdRef.current === searchId) {
        setIsLoading(false);
      }
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim().replace(/\s+/g, ' ');
    if (!trimmed) return;

    // 回显搜索框
    setSearchQuery(trimmed);
    setIsLoading(true);
    setShowResults(true);
    setShowSuggestions(false);

    // 如果搜索词与当前 URL 一致，router.push 不会触发 searchParams 变化，手动执行一次
    if ((searchParams.get('q') || '').trim() === trimmed) {
      fetchSearchResults(trimmed);
      addSearchHistory(trimmed);
      recordSearchRank(trimmed).then(setSearchRank);
      return;
    }

    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  // 返回顶部功能
  const scrollToTop = () => {
    try {
      // 根据调试结果，真正的滚动容器是 document.body
      document.body.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    } catch (error) {
      // 如果平滑滚动完全失败，使用立即滚动
      document.body.scrollTop = 0;
    }
  };

  return (
    <PageLayout activePath='/search'>
      <div className='px-4 sm:px-10 py-4 sm:py-8 overflow-visible mb-10'>
        {/* 搜索框 */}
        <div className='mb-8 relative'>
          <form onSubmit={handleSearch} className='max-w-2xl mx-auto relative'>
            <div className='relative'>
              <Search className='absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 dark:text-gray-500' />
              <input
                id='searchInput'
                type='text'
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => {
                  if (suggestions.length > 0) setShowSuggestions(true);
                }}
                onBlur={() => {
                  setTimeout(() => setShowSuggestions(false), 200);
                }}
                placeholder='搜索电影、电视剧...'
                className='w-full h-12 rounded-lg bg-gray-50/80 py-3 pl-10 pr-4 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-400 focus:bg-white border border-gray-200/50 shadow-sm dark:bg-gray-800 dark:text-gray-300 dark:placeholder-gray-500 dark:focus:bg-gray-700 dark:border-gray-700'
              />
            </div>

            {/* 搜索建议下拉框 */}
            <AnimatePresence>
              {showSuggestions && searchQuery.trim() !== '' && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className='absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900/95 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 max-h-[60vh] overflow-y-auto'
                >
                  {isFetchingSuggestions ? (
                    <div className='flex justify-center items-center p-8'>
                      <Loader2
                        className='animate-spin text-green-500'
                        size={24}
                      />
                    </div>
                  ) : suggestions.length > 0 ? (
                    <div className='flex flex-col'>
                      {suggestions.map((item: any, idx: number) => {
                        if (item.layout !== 'subject') return null;
                        const target = item.target;
                        return (
                          <div
                            key={idx}
                            onClick={() => {
                              setSearchQuery(target.title);
                              setShowSuggestions(false);
                              router.push(
                                `/search?q=${encodeURIComponent(target.title)}`
                              );
                            }}
                            className='flex items-center gap-4 p-3 hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer transition-colors border-b border-gray-100 dark:border-white/5 last:border-0'
                          >
                            <Image
                              src={
                                process.env.NEXT_PUBLIC_IMAGE_PROXY +
                                target.cover_url
                              }
                              alt={target.title}
                              width={48}
                              height={64}
                              className='w-12 h-16 object-cover rounded-md'
                            />
                            <div className='flex-1 min-w-0'>
                              <div className='flex items-center justify-between mb-1'>
                                <h4 className='text-gray-900 dark:text-white font-medium truncate'>
                                  {target.title}
                                </h4>
                                {target.rating?.value > 0 && (
                                  <span className='text-yellow-500 dark:text-yellow-400 text-sm font-bold flex items-center gap-1'>
                                    <Star size={12} fill='currentColor' />
                                    {target.rating.value.toFixed(1)}
                                  </span>
                                )}
                              </div>
                              <div className='text-xs text-gray-500 dark:text-slate-400 truncate mb-1'>
                                {target.year} | {target.card_subtitle}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className='p-4 text-center text-gray-500 dark:text-slate-400 text-sm'>
                      没有找到相关建议
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </form>
        </div>

        {/* 搜索结果或搜索历史 */}
        <div className='max-w-full mx-auto mt-12 overflow-visible'>
          {showResults ? (
            <section className='mb-12'>
              {/* 标题 & 聚合开关 */}
              <div className='flex items-center justify-between mb-6'>
                <h2 className='text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2'>
                  <span className='w-1.5 h-8 bg-gradient-to-b from-green-400 to-green-600 rounded-full block'></span>
                  搜索结果
                  <span className='hidden sm:flex text-sm font-normal text-slate-600 dark:text-slate-400 ml-2 bg-black/5 dark:bg-slate-900/50 px-3 py-1 rounded-full border border-black/10 dark:border-white/10 items-center gap-2'>
                    {filteredSearchResults.length !== searchResults.length
                      ? `${filteredSearchResults.length} / ${searchResults.length}`
                      : searchResults.length}{' '}
                    个资源
                    {isLoading && (
                      <Loader2
                        className='animate-spin text-green-500'
                        size={14}
                      />
                    )}
                  </span>
                </h2>

                <div className='flex items-center gap-4'>
                  <label className='flex items-center gap-2 cursor-pointer select-none bg-black/5 dark:bg-white/5 px-3 py-1.5 rounded-full border border-black/5 dark:border-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors'>
                    <span className='text-xs sm:text-sm text-gray-700 dark:text-gray-300 font-medium'>
                      聚合展示
                    </span>
                    <div className='relative'>
                      <input
                        type='checkbox'
                        className='sr-only peer'
                        checked={viewMode === 'agg'}
                        onChange={() => {
                          setViewMode(viewMode === 'agg' ? 'all' : 'agg');
                          if (typeof window !== 'undefined') {
                            localStorage.setItem(
                              'defaultAggregateSearch',
                              JSON.stringify(viewMode === 'all')
                            );
                          }
                        }}
                      />
                      <div className='w-9 h-5 bg-gray-200 dark:bg-gray-600 rounded-full peer-checked:bg-green-500 transition-colors'></div>
                      <div className='absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4'></div>
                    </div>
                  </label>

                  {(yearFilter !== 'all' ||
                    sourceFilter !== 'all' ||
                    genreFilter !== 'all' ||
                    episodesFilter !== 'all') && (
                    <button
                      onClick={() => {
                        setYearFilter('all');
                        setSourceFilter('all');
                        setGenreFilter('all');
                        setEpisodesFilter('all');
                      }}
                      className='text-xs sm:text-sm text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 font-medium px-2'
                    >
                      重置筛选
                    </button>
                  )}
                </div>
              </div>

              {/* 新版筛选区 - 类似 Chips 风格 */}
              <div className='mb-8 bg-white/50 dark:bg-slate-900/50 rounded-xl border border-black/5 dark:border-white/5 backdrop-blur-sm p-4 flex flex-col gap-4'>
                {/* 1. 年份筛选 */}
                <div className='flex items-center gap-3 overflow-hidden'>
                  <span className='text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider shrink-0 w-12'>
                    年份
                  </span>
                  <div className='flex gap-2 overflow-x-auto pb-1 scrollbar-hide'>
                    <button
                      onClick={() => setYearFilter('all')}
                      className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                        yearFilter === 'all'
                          ? 'bg-green-500 text-white shadow-md shadow-green-500/20'
                          : 'bg-black/5 text-slate-600 hover:bg-black/10 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white'
                      }`}
                    >
                      全部
                    </button>
                    {availableYears.map((y) => (
                      <button
                        key={y}
                        onClick={() => setYearFilter(y)}
                        className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                          yearFilter === y
                            ? 'bg-green-500 text-white shadow-md shadow-green-500/20'
                            : 'bg-black/5 text-slate-600 hover:bg-black/10 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white'
                        }`}
                      >
                        {y === 'unknown' ? '未知' : y}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. 题材筛选 */}
                {availableGenres.length > 0 && (
                  <div className='flex items-center gap-3 overflow-hidden'>
                    <span className='text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider shrink-0 w-12'>
                      题材
                    </span>
                    <div className='flex gap-2 overflow-x-auto pb-1 scrollbar-hide'>
                      <button
                        onClick={() => setGenreFilter('all')}
                        className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                          genreFilter === 'all'
                            ? 'bg-green-500 text-white shadow-md shadow-green-500/20'
                            : 'bg-black/5 text-slate-600 hover:bg-black/10 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white'
                        }`}
                      >
                        全部
                      </button>
                      {availableGenres.map((g) => (
                        <button
                          key={g}
                          onClick={() => setGenreFilter(g)}
                          className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                            genreFilter === g
                              ? 'bg-green-500 text-white shadow-md shadow-green-500/20'
                              : 'bg-black/5 text-slate-600 hover:bg-black/10 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white'
                          }`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. 集数区间 */}
                <div className='flex items-center gap-3 overflow-hidden'>
                  <span className='text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider shrink-0 w-12'>
                    片长
                  </span>
                  <div className='flex gap-2 overflow-x-auto pb-1 scrollbar-hide'>
                    {[
                      { label: '全部', value: 'all' },
                      { label: '电影/单集', value: '1' },
                      { label: '短剧 (2-12)', value: 'short' },
                      { label: '中长篇 (13-30)', value: 'medium' },
                      { label: '长篇剧集 (30+)', value: 'long' },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setEpisodesFilter(opt.value)}
                        className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                          episodesFilter === opt.value
                            ? 'bg-green-500 text-white shadow-md shadow-green-500/20'
                            : 'bg-black/5 text-slate-600 hover:bg-black/10 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 4. 来源筛选 */}
                <div className='flex items-center gap-3 overflow-hidden'>
                  <span className='text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider shrink-0 w-12'>
                    来源
                  </span>
                  <div className='flex gap-2 overflow-x-auto pb-1 scrollbar-hide'>
                    <button
                      onClick={() => setSourceFilter('all')}
                      className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                        sourceFilter === 'all'
                          ? 'bg-green-500 text-white shadow-md shadow-green-500/20'
                          : 'bg-black/5 text-slate-600 hover:bg-black/10 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white'
                      }`}
                    >
                      全部
                    </button>
                    {availableSources.map((s) => (
                      <button
                        key={s.key}
                        onClick={() => setSourceFilter(s.key)}
                        className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                          sourceFilter === s.key
                            ? 'bg-green-500 text-white shadow-md shadow-green-500/20'
                            : 'bg-black/5 text-slate-600 hover:bg-black/10 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white'
                        }`}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Results Grid with Animation */}
              <LayoutGroup>
                <motion.div
                  layout
                  variants={containerVariants}
                  initial='hidden'
                  animate='show'
                  className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-3 gap-y-6 px-0 dark:bg-transparent'
                >
                  <AnimatePresence mode='popLayout'>
                    {viewMode === 'agg' ? (
                      aggregatedResults.length > 0 ? (
                        aggregatedResults.map(([mapKey, group]) => (
                          <NewMovieCard
                            key={`agg-${mapKey}`}
                            item={group[0]}
                            onClick={(item) => setSelectedItem(item)}
                          />
                        ))
                      ) : (
                        <motion.div
                          layout
                          initial={{ opacity: 0, filter: 'blur(10px)' }}
                          animate={{ opacity: 1, filter: 'blur(0px)' }}
                          exit={{ opacity: 0, filter: 'blur(10px)' }}
                          className='col-span-full flex flex-col items-center justify-center py-32 text-slate-600'
                        >
                          {isLoading ? (
                            <>
                              <Loader2
                                className='animate-spin text-green-500 mb-4'
                                size={48}
                              />
                              <p className='text-sm mt-2 text-slate-500 dark:text-slate-400'>
                                正在搜索中…有结果会立刻显示
                              </p>
                            </>
                          ) : (
                            <>
                              <Search
                                size={64}
                                strokeWidth={1}
                                className='mb-4 opacity-50'
                              />
                              <p className='text-xl font-medium text-gray-900 dark:text-white'>
                                没有找到相关资源
                              </p>
                              <p className='text-sm mt-2 text-slate-500 dark:text-slate-400'>
                                换个关键词试试看吧
                              </p>
                            </>
                          )}
                        </motion.div>
                      )
                    ) : filteredSearchResults.length > 0 ? (
                      filteredSearchResults.map((item) => (
                        <NewMovieCard
                          key={`all-${item.source}-${item.id}`}
                          item={item}
                          onClick={(item) => setSelectedItem(item)}
                        />
                      ))
                    ) : (
                      <motion.div
                        layout
                        initial={{ opacity: 0, filter: 'blur(10px)' }}
                        animate={{ opacity: 1, filter: 'blur(0px)' }}
                        exit={{ opacity: 0, filter: 'blur(10px)' }}
                        className='col-span-full flex flex-col items-center justify-center py-32 text-slate-600'
                      >
                        {isLoading ? (
                          <>
                            <Loader2
                              className='animate-spin text-green-500 mb-4'
                              size={48}
                            />
                            <p className='text-sm mt-2 text-slate-500 dark:text-slate-400'>
                              正在搜索中…有结果会立刻显示
                            </p>
                          </>
                        ) : (
                          <>
                            <Search
                              size={64}
                              strokeWidth={1}
                              className='mb-4 opacity-50'
                            />
                            <p className='text-xl font-medium text-gray-900 dark:text-white'>
                              没有找到相关资源
                            </p>
                            <p className='text-sm mt-2 text-slate-500 dark:text-slate-400'>
                              换个关键词试试看吧
                            </p>
                          </>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </LayoutGroup>
            </section>
          ) : searchRank.length > 0 || searchHistory.length > 0 ? (
            <>
              {/* 搜索排行榜 */}
              {searchRank.length > 0 && (
                <section className='mb-14'>
                  <div className='flex items-center justify-between mb-6'>
                    <h2 className='text-3xl font-extrabold text-gray-900 dark:text-white flex items-center gap-3'>
                      <span className='w-2 h-9 bg-red-600 rounded-sm block shadow-[0_0_15px_rgba(220,38,38,0.5)]'></span>
                      今日 Top 排行
                      <span className='text-xs font-medium text-slate-600 dark:text-slate-500 uppercase tracking-tighter ml-2 bg-black/5 dark:bg-white/5 px-2 py-1 rounded border border-black/10 dark:border-white/5'>
                        Trending Today
                      </span>
                    </h2>
                    <button
                      onClick={() => getSearchRank().then(setSearchRank)}
                      className='flex items-center gap-2 p-2 rounded-lg bg-black/5 hover:bg-black/10 text-slate-600 hover:text-slate-900 transition-all text-sm group dark:bg-white/5 dark:hover:bg-white/10 dark:text-slate-400 dark:hover:text-white'
                    >
                      <RefreshCw
                        size={14}
                        className='group-hover:rotate-180 transition-transform duration-500 text-green-500'
                      />
                      刷新
                    </button>
                  </div>

                  <ScrollableRow scrollDistance={400}>
                    <div className='flex gap-6 pb-6 pt-4 px-4'>
                      {searchRank.map((item, idx) => (
                        <RankCard
                          key={`${item.keyword}-${idx}`}
                          item={item}
                          index={idx}
                          onClick={(keyword) => {
                            setSearchQuery(keyword);
                            router.push(
                              `/search?q=${encodeURIComponent(keyword.trim())}`
                            );
                          }}
                        />
                      ))}
                    </div>
                  </ScrollableRow>
                </section>
              )}

              {/* 搜索历史 */}
              {searchHistory.length > 0 && (
                <section className='mb-12'>
                  <h2 className='mb-4 text-xl font-bold text-gray-800 text-left dark:text-gray-200'>
                    搜索历史
                    <button
                      onClick={() => {
                        clearSearchHistory(); // 事件监听会自动更新界面
                      }}
                      className='ml-3 text-sm text-gray-500 hover:text-red-500 transition-colors dark:text-gray-400 dark:hover:text-red-500'
                    >
                      清空
                    </button>
                  </h2>
                  <div className='flex flex-wrap gap-2'>
                    {searchHistory.map((item) => (
                      <div key={item} className='relative group'>
                        <button
                          onClick={() => {
                            setSearchQuery(item);
                            router.push(
                              `/search?q=${encodeURIComponent(item.trim())}`
                            );
                          }}
                          className='px-4 py-2 bg-gray-500/10 hover:bg-gray-300 rounded-full text-sm text-gray-700 transition-colors duration-200 dark:bg-gray-700/50 dark:hover:bg-gray-600 dark:text-gray-300'
                        >
                          {item}
                        </button>
                        {/* 删除按钮 */}
                        <button
                          aria-label='删除搜索历史'
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            deleteSearchHistory(item); // 事件监听会自动更新界面
                          }}
                          className='absolute -top-1 -right-1 w-4 h-4 opacity-0 group-hover:opacity-100 bg-gray-400 hover:bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] transition-colors'
                        >
                          <X className='w-3 h-3' />
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          ) : null}
        </div>
      </div>

      {/* 返回顶部悬浮按钮 */}
      <button
        onClick={scrollToTop}
        className={`fixed bottom-20 md:bottom-6 right-6 z-[500] w-12 h-12 bg-green-500/90 hover:bg-green-500 text-white rounded-full shadow-lg backdrop-blur-sm transition-all duration-300 ease-in-out flex items-center justify-center group ${
          showBackToTop
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
        aria-label='返回顶部'
      >
        <ChevronUp className='w-6 h-6 transition-transform group-hover:scale-110' />
      </button>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedItem && (
          <DetailModal
            item={selectedItem}
            onClose={() => setSelectedItem(null)}
          />
        )}
      </AnimatePresence>
    </PageLayout>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchPageClient />
    </Suspense>
  );
}
