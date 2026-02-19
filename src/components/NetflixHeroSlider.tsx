/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Plus,
  Star,
  Volume2,
  VolumeX,
} from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { DoubanSubjectBrief, getDoubanSubjectBrief } from '@/lib/douban.client';

type SliderItemInput = {
  doubanId: string;
  typeHint?: 'movie' | 'tv';
};

type SliderItem = DoubanSubjectBrief & {
  typeHint?: 'movie' | 'tv';
};

// 动画配置：模拟高级物理阻尼感
const TRANSITION_EASE: [number, number, number, number] = [
  0.25, 0.46, 0.45, 0.94,
];
const AUTOPLAY_DURATION = 8000;

const textContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.3,
    },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.3 },
  },
};

const textItemVariants = {
  hidden: { y: 40, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { duration: 0.8, ease: TRANSITION_EASE },
  },
};

const buttonIconVariants = {
  hover: { scale: 1.2, rotate: 10 },
};

function parseSubtitle(subtitle: string) {
  if (!subtitle) return { meta: '', cast: '' };
  const parts = subtitle.split(' / ');
  const meta = parts.slice(0, 3).join('  •  ');
  const cast = parts.slice(3).join(', ');
  return { meta, cast };
}

function getYearFromBrief(item: SliderItem) {
  return (
    item.year ||
    item.card_subtitle?.match(/(\d{4})/)?.[1] ||
    item.pubdate?.[0]?.match(/(\d{4})/)?.[1] ||
    ''
  );
}

function getSearchType(item: SliderItem): 'movie' | 'tv' | '' {
  if (item.type === 'tv' || item.type === 'show') return 'tv';
  if (item.type === 'movie') return 'movie';
  return item.typeHint || '';
}

export default function NetflixHeroSlider({
  items,
}: {
  items: SliderItemInput[];
}) {
  const router = useRouter();

  const normalizedInputs = useMemo(() => {
    const seen = new Set<string>();
    return items
      .map((x) => ({
        doubanId: String(x.doubanId || '').trim(),
        typeHint: x.typeHint,
      }))
      .filter((x) => /^[0-9]+$/.test(x.doubanId))
      .filter((x) => {
        if (seen.has(x.doubanId)) return false;
        seen.add(x.doubanId);
        return true;
      });
  }, [items]);

  const [slides, setSlides] = useState<SliderItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [isAutoPlayPaused, setIsAutoPlayPaused] = useState(false);
  const [forceCover, setForceCover] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (normalizedInputs.length === 0) {
        setSlides([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const results = await Promise.allSettled(
          normalizedInputs.map(async (x) => {
            const brief = await getDoubanSubjectBrief(x.doubanId);
            return { ...brief, typeHint: x.typeHint } as SliderItem;
          })
        );

        const ok = results
          .filter(
            (r): r is PromiseFulfilledResult<SliderItem> =>
              r.status === 'fulfilled'
          )
          .map((r) => r.value)
          .filter((x) => x.id && x.title);

        if (!cancelled) {
          setSlides(ok);
          setCurrentIndex(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [normalizedInputs]);

  const currentMovie = slides[currentIndex];

  useEffect(() => {
    // 切换条目时重置视频失败状态
    setForceCover(false);
  }, [currentMovie?.id]);

  useEffect(() => {
    if (!slides.length) return;
    if (isAutoPlayPaused) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % slides.length);
    }, AUTOPLAY_DURATION);

    return () => clearInterval(interval);
  }, [slides.length, currentIndex, isAutoPlayPaused]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted, currentIndex]);

  const handleNext = () => {
    if (!slides.length) return;
    setCurrentIndex((prev) => (prev + 1) % slides.length);
  };

  const handlePrev = () => {
    if (!slides.length) return;
    setCurrentIndex((prev) => (prev - 1 + slides.length) % slides.length);
  };

  const toggleMute = () => {
    setIsMuted((prev) => !prev);
  };

  const handlePlay = (item: SliderItem, opts?: { prefer?: boolean }) => {
    const year = getYearFromBrief(item);
    const stype = getSearchType(item);

    router.push(
      `/play?title=${encodeURIComponent(item.title.trim())}` +
        (year ? `&year=${encodeURIComponent(year)}` : '') +
        (stype ? `&stype=${encodeURIComponent(stype)}` : '') +
        (opts?.prefer ? '&prefer=true' : '')
    );
  };

  const { meta, cast } = useMemo(() => {
    if (!currentMovie) return { meta: '', cast: '' };
    return parseSubtitle(currentMovie.card_subtitle);
  }, [currentMovie]);

  if (loading) {
    return (
      <div className='relative w-full h-screen overflow-hidden bg-black text-white'>
        <div className='absolute inset-0 bg-gray-900/50 animate-pulse' />
        <div className='absolute inset-0 z-10 pointer-events-none bg-gradient-to-r from-black via-black/60 to-transparent' />
      </div>
    );
  }

  if (!currentMovie) return null;

  const primaryDate = currentMovie.pubdate?.[0]
    ? currentMovie.pubdate[0].split('(')[0]
    : '';

  return (
    <div
      className='relative w-full h-screen overflow-hidden bg-black text-white group/container'
      onMouseEnter={() => setIsAutoPlayPaused(true)}
      onMouseLeave={() => setIsAutoPlayPaused(false)}
    >
      {/* ---------------- 背景视频/封面层 ---------------- */}
      <AnimatePresence mode='wait'>
        <motion.div
          key={currentMovie.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1 }}
          className='absolute inset-0 w-full h-full'
        >
          {currentMovie.video_url && !forceCover ? (
            <video
              ref={videoRef}
              src={`/api/video-proxy?url=${encodeURIComponent(
                currentMovie.video_url
              )}`}
              className='w-full h-full object-cover'
              autoPlay
              loop
              muted={isMuted}
              playsInline
              preload='metadata'
              poster={currentMovie.cover_url || undefined}
              onError={() => {
                // 常见：豆瓣视频 CDN 防盗链/Range 失败，降级到封面
                setForceCover(true);
              }}
            />
          ) : currentMovie.cover_url ? (
            <Image
              src={currentMovie.cover_url}
              alt={currentMovie.title}
              fill
              priority
              className='object-cover'
            />
          ) : (
            <div className='w-full h-full bg-gray-900' />
          )}
        </motion.div>
      </AnimatePresence>

      {/* ---------------- RGBA 渐变遮罩层 ---------------- */}
      <div className='absolute inset-0 z-10 pointer-events-none bg-[linear-gradient(90deg,rgba(0,0,0,0.95)_0%,rgba(0,0,0,0.7)_30%,rgba(0,0,0,0.3)_60%,rgba(0,0,0,0)_100%)]' />
      <div className='absolute inset-0 z-10 pointer-events-none bg-[linear-gradient(180deg,rgba(0,0,0,0)_70%,rgba(0,0,0,0.6)_90%,rgba(0,0,0,1)_100%)]' />

      {/* ---------------- 内容区域 ---------------- */}
      <div className='absolute inset-0 z-20 flex items-center px-4 md:px-16 lg:px-20'>
        <div className='w-full max-w-2xl mt-10 md:mt-0'>
          <AnimatePresence mode='wait'>
            <motion.div
              key={`text-${currentMovie.id}`}
              variants={textContainerVariants}
              initial='hidden'
              animate='visible'
              exit='exit'
              className='space-y-6'
            >
              <motion.h1
                variants={textItemVariants}
                className='text-5xl md:text-7xl lg:text-8xl font-black text-white drop-shadow-2xl leading-tight'
              >
                {currentMovie.title}
              </motion.h1>

              <motion.div
                variants={textItemVariants}
                className='flex flex-wrap items-center gap-4 text-sm md:text-base font-medium'
              >
                {currentMovie.rating > 0 && (
                  <div className='flex items-center text-green-400 font-bold text-lg'>
                    <Star size={18} className='mr-1 fill-current' />
                    {Number(currentMovie.rating).toFixed(1)}
                  </div>
                )}
                {primaryDate && (
                  <span className='text-gray-300'>{primaryDate}</span>
                )}
                <span className='bg-gray-800/80 px-2 py-0.5 rounded text-xs border border-gray-600/50'>
                  HD
                </span>
                {meta && (
                  <span className='text-gray-300 font-light hidden md:inline-block border-l border-gray-600 pl-4 ml-2'>
                    {meta}
                  </span>
                )}
              </motion.div>

              <motion.p
                variants={textItemVariants}
                className='text-gray-200 text-sm md:text-lg leading-relaxed line-clamp-3 md:line-clamp-4 max-w-xl drop-shadow-md'
              >
                {currentMovie.intro}
              </motion.p>

              {cast && (
                <motion.div
                  variants={textItemVariants}
                  className='text-xs md:text-sm text-gray-400 line-clamp-1 max-w-lg'
                >
                  <span className='text-gray-500 mr-2'>主演:</span>
                  {cast}
                </motion.div>
              )}

              <motion.div
                variants={textItemVariants}
                className='flex items-center gap-4 pt-4'
              >
                <motion.button
                  whileHover='hover'
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handlePlay(currentMovie)}
                  className='flex items-center gap-3 bg-white text-black px-8 py-3 rounded hover:bg-white/90 transition-colors font-bold text-lg shadow-[0_0_20px_rgba(255,255,255,0.3)]'
                >
                  <motion.div variants={buttonIconVariants}>
                    <Play size={26} fill='currentColor' />
                  </motion.div>
                  <span>播放</span>
                </motion.button>

                <motion.button
                  whileHover={{
                    scale: 1.05,
                    backgroundColor: 'rgba(107, 114, 128, 0.5)',
                  }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handlePlay(currentMovie, { prefer: true })}
                  className='flex items-center gap-3 bg-gray-500/30 backdrop-blur-md text-white px-8 py-3 rounded transition-all font-bold text-lg border border-white/10 hover:border-white/30'
                >
                  <Plus size={26} />
                  <span>加入片单</span>
                </motion.button>
              </motion.div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* ---------------- 控制器区域 ---------------- */}
      <div className='absolute right-8 md:right-16 bottom-32 z-30'>
        <button
          onClick={toggleMute}
          className='p-3 rounded-full border border-white/20 bg-black/20 backdrop-blur-sm text-white hover:bg-white hover:text-black hover:border-white transition-all duration-300'
          aria-label={isMuted ? '取消静音' : '静音'}
        >
          {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
        </button>
      </div>

      <div className='absolute bottom-10 right-8 md:right-16 z-30 flex gap-3 items-center'>
        <button
          onClick={handlePrev}
          className='p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors'
          aria-label='上一张'
        >
          <ChevronLeft size={24} />
        </button>

        <div className='flex gap-2.5'>
          {slides.map((item, idx) => (
            <div
              key={item.id}
              onClick={() => setCurrentIndex(idx)}
              className='relative w-12 h-1 bg-gray-700/50 rounded-full overflow-hidden cursor-pointer group'
              role='button'
              aria-label={`切换到第 ${idx + 1} 张`}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setCurrentIndex(idx);
              }}
            >
              <motion.div
                initial={{ width: '0%' }}
                animate={{ width: currentIndex === idx ? '100%' : '0%' }}
                transition={{
                  duration:
                    currentIndex === idx ? AUTOPLAY_DURATION / 1000 : 0.3,
                  ease: 'linear',
                  repeat: 0,
                }}
                className={`absolute top-0 left-0 h-full ${
                  currentIndex === idx ? 'bg-white' : 'group-hover:bg-gray-400'
                }`}
              />
            </div>
          ))}
        </div>

        <button
          onClick={handleNext}
          className='p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors'
          aria-label='下一张'
        >
          <ChevronRight size={24} />
        </button>
      </div>
    </div>
  );
}
