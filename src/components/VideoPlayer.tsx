import { AnimatePresence, motion } from 'framer-motion';
import Hls from 'hls.js';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { VideoState } from '@/lib/types';

import { FastForwardOverlayIcon } from './Icons';
import { PlayerControls } from './PlayerControls';

interface VideoPlayerProps {
  src: string;
  className?: string;
  title?: string;
  currentEpisode?: number;
  totalEpisodes?: number;
  skipConfig?: {
    enable: boolean;
    intro_time: number;
    outro_time: number;
  };
  onNextEpisode?: () => void;
  onPlayProgress?: (time: number, duration: number) => void;
  onSetIntro?: (time: number) => void;
  onSetOutro?: (time: number) => void;
  onSkipIntro?: () => void;
  onSkipOutro?: () => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  src,
  className,
  title = 'Video',
  currentEpisode,
  totalEpisodes,
  skipConfig,
  onNextEpisode,
  onPlayProgress,
  onSetIntro,
  onSetOutro,
  onSkipIntro,
  onSkipOutro,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef<number | null>(null);
  const [isSpeeding, setIsSpeeding] = useState(false);
  const speedRef = useRef(1);
  const keyHoldTimeoutRef = useRef<number | null>(null);
  const isKeyDownRef = useRef(false);
  const lastSkipCheckRef = useRef<number>(0);
  const [skipNotification, setSkipNotification] = useState<{
    type: 'intro' | 'outro';
    time: number;
  } | null>(null);
  const skipNotificationTimeoutRef = useRef<number | null>(null);

  // 下一集提示
  const [nextEpisodeNotification, setNextEpisodeNotification] =
    useState<boolean>(false);
  const nextEpisodeNotificationTimeoutRef = useRef<number | null>(null);
  const hasShownNextEpisodeNotificationRef = useRef<boolean>(false);

  const [state, setState] = useState<VideoState>({
    playing: false,
    muted: false,
    volume: 1,
    currentTime: 0,
    duration: 0,
    buffered: 0,
    fullscreen: false,
    webFullscreen: false,
    loading: true,
    playbackRate: 1,
    introTime: undefined,
    outroTime: undefined,
  });

  // HLS & Video Source Setup
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setState((prev) => ({
      ...prev,
      loading: true,
      duration: 0,
      currentTime: 0,
      playing: false,
    }));
    hasShownNextEpisodeNotificationRef.current = false;

    // 先重置 video，避免切换源时残留
    video.pause();
    video.removeAttribute('src');
    video.load();

    const handleLoadedMetadata = () => {
      // video.duration 在 HLS 中可能是 Infinity（直播）或正常值（点播）
      const dur = isFinite(video.duration) ? video.duration : 0;
      setState((prev) => ({ ...prev, duration: dur, loading: false }));
    };

    // 时长可能在 durationchange 事件中才稳定（HLS 分片流）
    const handleDurationChange = () => {
      const dur = isFinite(video.duration) ? video.duration : 0;
      if (dur > 0) {
        setState((prev) => ({ ...prev, duration: dur }));
      }
    };

    let hls: Hls | null = null;

    if (src.includes('.m3u8')) {
      if (Hls.isSupported()) {
        hls = new Hls({
          capLevelToPlayerSize: true,
          autoStartLoad: true,
          // 加大缓冲，避免只播一点就停
          maxBufferLength: 60,
          maxMaxBufferLength: 600,
          maxBufferSize: 60 * 1000 * 1000,
          // 允许跳转到任意位置
          startFragPrefetch: true,
        });
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          // manifest 解析完毕后，video.duration 才可用
          const dur = isFinite(video.duration) ? video.duration : 0;
          setState((prev) => ({ ...prev, loading: false, duration: dur }));
        });
        hls.on(Hls.Events.LEVEL_LOADED, (_event, data) => {
          // VOD 流在 level 加载后才有准确时长
          const dur = data.details?.totalduration;
          if (dur && isFinite(dur) && dur > 0) {
            setState((prev) => ({ ...prev, duration: dur }));
          }
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                hls?.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls?.recoverMediaError();
                break;
              default:
                hls?.destroy();
                break;
            }
          }
        });
        video.addEventListener('loadedmetadata', handleLoadedMetadata);
        video.addEventListener('durationchange', handleDurationChange);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari 原生支持 HLS
        video.src = src;
        video.addEventListener('loadedmetadata', handleLoadedMetadata);
        video.addEventListener('durationchange', handleDurationChange);
      }
    } else {
      video.src = src;
      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.addEventListener('durationchange', handleDurationChange);
    }

    return () => {
      if (hls) {
        hls.destroy();
      }
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('durationchange', handleDurationChange);
    };
  }, [src]);

  // Video Event Listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setState((prev) => ({ ...prev, playing: true }));
    const onPause = () => setState((prev) => ({ ...prev, playing: false }));
    const onTimeUpdate = () => {
      setState((prev) => ({ ...prev, currentTime: video.currentTime }));

      // 处理播放进度上报
      if (onPlayProgress) {
        onPlayProgress(video.currentTime, video.duration);
      }

      // 检查是否快要结束（剩余3秒），显示下一集提示
      if (
        currentEpisode !== undefined &&
        totalEpisodes &&
        currentEpisode < totalEpisodes - 1 &&
        video.duration > 0 &&
        !hasShownNextEpisodeNotificationRef.current &&
        video.currentTime > video.duration - 3
      ) {
        hasShownNextEpisodeNotificationRef.current = true;
        setNextEpisodeNotification(true);
      }

      // 片头片尾跳过逻辑
      if (skipConfig?.enable) {
        const currentTime = video.currentTime;
        const duration = video.duration;
        const now = Date.now();

        // 限制跳过检查频率为1.5秒一次
        if (now - lastSkipCheckRef.current < 1500) return;
        lastSkipCheckRef.current = now;

        // 跳过片头
        if (
          skipConfig.intro_time > 0 &&
          currentTime < skipConfig.intro_time &&
          currentTime > 0
        ) {
          video.currentTime = skipConfig.intro_time;
          onSkipIntro?.();
          setSkipNotification({ type: 'intro', time: skipConfig.intro_time });
          if (skipNotificationTimeoutRef.current)
            clearTimeout(skipNotificationTimeoutRef.current);
          skipNotificationTimeoutRef.current = window.setTimeout(() => {
            setSkipNotification(null);
          }, 3000);
        }

        // 跳过片尾
        if (
          skipConfig.outro_time < 0 &&
          duration > 0 &&
          currentTime > duration + skipConfig.outro_time
        ) {
          onSkipOutro?.();
          setSkipNotification({ type: 'outro', time: -skipConfig.outro_time });
          if (skipNotificationTimeoutRef.current)
            clearTimeout(skipNotificationTimeoutRef.current);
          skipNotificationTimeoutRef.current = window.setTimeout(() => {
            setSkipNotification(null);
          }, 3000);
        }
      }
    };
    const onProgress = () => {
      if (video.buffered.length > 0) {
        setState((prev) => ({
          ...prev,
          buffered: video.buffered.end(video.buffered.length - 1),
        }));
      }
    };
    const onVolumeChange = () =>
      setState((prev) => ({
        ...prev,
        volume: video.volume,
        muted: video.muted,
      }));
    const onRateChange = () =>
      setState((prev) => ({ ...prev, playbackRate: video.playbackRate }));
    const onWaiting = () => setState((prev) => ({ ...prev, loading: true }));
    const onCanPlay = () => setState((prev) => ({ ...prev, loading: false }));
    const onEnded = () => {
      // 视频播放结束，自动播放下一集
      if (
        currentEpisode !== undefined &&
        totalEpisodes &&
        currentEpisode < totalEpisodes - 1
      ) {
        // 显示下一集提示弹窗
        setNextEpisodeNotification(true);
        if (nextEpisodeNotificationTimeoutRef.current) {
          clearTimeout(nextEpisodeNotificationTimeoutRef.current);
        }
        // 2秒后自动切换到下一集
        nextEpisodeNotificationTimeoutRef.current = window.setTimeout(() => {
          setNextEpisodeNotification(false);
          onNextEpisode?.();
        }, 2000);
      }
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('progress', onProgress);
    video.addEventListener('volumechange', onVolumeChange);
    video.addEventListener('ratechange', onRateChange);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('ended', onEnded);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('progress', onProgress);
      video.removeEventListener('volumechange', onVolumeChange);
      video.removeEventListener('ratechange', onRateChange);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('ended', onEnded);
      if (skipNotificationTimeoutRef.current)
        clearTimeout(skipNotificationTimeoutRef.current);
      if (nextEpisodeNotificationTimeoutRef.current)
        clearTimeout(nextEpisodeNotificationTimeoutRef.current);
    };
  }, [
    skipConfig,
    onPlayProgress,
    onSkipIntro,
    onSkipOutro,
    onNextEpisode,
    currentEpisode,
    totalEpisodes,
  ]);

  // 清理下一集提示
  useEffect(() => {
    return () => {
      if (nextEpisodeNotificationTimeoutRef.current) {
        clearTimeout(nextEpisodeNotificationTimeoutRef.current);
      }
    };
  }, []);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 忽略输入框中的按键事件
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const video = videoRef.current;
      if (!video) return;

      switch (e.code) {
        // 空格 / K：暂停/播放
        case 'Space':
        case 'KeyK':
          e.preventDefault();
          video.paused ? video.play() : video.pause();
          break;

        // 左箭头：后退5秒
        case 'ArrowLeft':
          if (!e.altKey) {
            e.preventDefault();
            video.currentTime = Math.max(0, video.currentTime - 5);
          }
          break;

        // 右箭头：快进5秒（短按），长按3x速
        case 'ArrowRight':
          if (!e.altKey && !isKeyDownRef.current) {
            isKeyDownRef.current = true;
            keyHoldTimeoutRef.current = window.setTimeout(() => {
              if (videoRef.current && isKeyDownRef.current) {
                speedRef.current = videoRef.current.playbackRate;
                videoRef.current.playbackRate = 3.0;
                setIsSpeeding(true);
              }
            }, 300);
          }
          break;

        // M：静音切换
        case 'KeyM':
          e.preventDefault();
          video.muted = !video.muted;
          break;

        // F：全屏切换
        case 'KeyF':
          e.preventDefault();
          if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen().catch(() => {
              // Ignore fullscreen request errors
            });
          } else {
            document.exitFullscreen();
          }
          break;

        default:
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ArrowRight') {
        isKeyDownRef.current = false;

        if (keyHoldTimeoutRef.current) {
          clearTimeout(keyHoldTimeoutRef.current);
          keyHoldTimeoutRef.current = null;
        }

        if (isSpeeding) {
          if (videoRef.current) {
            videoRef.current.playbackRate = speedRef.current;
          }
          setIsSpeeding(false);
        } else {
          // 短按才快进
          if (videoRef.current && !e.altKey) {
            videoRef.current.currentTime = Math.min(
              videoRef.current.duration,
              videoRef.current.currentTime + 5
            );
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isSpeeding]);

  // Controls Visibility
  const resetControlsTimeout = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      window.clearTimeout(controlsTimeoutRef.current);
    }
    if (state.playing) {
      controlsTimeoutRef.current = window.setTimeout(() => {
        setShowControls(false);
      }, 2000);
    }
  }, [state.playing]);

  const handleMouseMove = useCallback(() => {
    resetControlsTimeout();
  }, [resetControlsTimeout]);

  useEffect(() => {
    if (!state.playing) {
      setShowControls(true);
      if (controlsTimeoutRef.current)
        window.clearTimeout(controlsTimeoutRef.current);
    } else {
      resetControlsTimeout();
    }
  }, [state.playing, resetControlsTimeout]);

  // Actions
  const togglePlay = () => {
    if (videoRef.current) {
      state.playing ? videoRef.current.pause() : videoRef.current.play();
    }
  };

  const seek = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const changeVolume = (vol: number) => {
    if (videoRef.current) {
      videoRef.current.volume = vol;
      videoRef.current.muted = vol === 0;
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
    }
  };

  const changePlaybackRate = (rate: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
      // Update our reference if the user changes it manually via menu
      if (!isSpeeding) {
        speedRef.current = rate;
      }
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {
        // Ignore fullscreen request errors
      });
    } else {
      document.exitFullscreen();
    }
  };

  const toggleWebFullscreen = () => {
    setState((prev) => ({ ...prev, webFullscreen: !prev.webFullscreen }));
  };

  const togglePip = async () => {
    if (videoRef.current && document.pictureInPictureEnabled) {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await videoRef.current.requestPictureInPicture();
      }
    }
  };

  const handleSetIntro = (time: number) => {
    setState((prev) => ({ ...prev, introTime: time }));
    onSetIntro?.(time);
  };

  const handleSetOutro = (time: number) => {
    setState((prev) => ({ ...prev, outroTime: time }));
    onSetOutro?.(time);
  };

  const handleClearConfig = () => {
    setState((prev) => ({
      ...prev,
      introTime: undefined,
      outroTime: undefined,
    }));
  };

  // Sync fullscreen state
  useEffect(() => {
    const handleFsChange = () => {
      setState((prev) => ({
        ...prev,
        fullscreen: !!document.fullscreenElement,
      }));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () =>
      document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => state.playing && setShowControls(false)}
      className={`
        bg-black group overflow-hidden select-none transition-all duration-500 ease-in-out 
        ${
          state.webFullscreen
            ? 'fixed inset-0 w-screen h-screen z-50'
            : `relative w-full h-full ${className || ''}`
        }
      `}
    >
      <video
        ref={videoRef}
        className='w-full h-full object-contain cursor-pointer'
        onClick={togglePlay}
        playsInline
      />

      {/* Skip Notification */}
      <AnimatePresence>
        {skipNotification && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.3 }}
            className='absolute bottom-24 left-1/2 -translate-x-1/2 z-40 pointer-events-none'
          >
            <div className='bg-green-500/90 backdrop-blur-md text-white px-4 py-2 rounded-lg whitespace-nowrap text-sm font-medium shadow-lg'>
              {skipNotification.type === 'intro' ? '已跳过片头' : '已跳过片尾'}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Next Episode Notification */}
      <AnimatePresence>
        {nextEpisodeNotification && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{
              duration: 0.4,
              type: 'spring',
              stiffness: 300,
              damping: 25,
            }}
            className='absolute bottom-1/2 left-1/2 -translate-x-1/2 translate-y-1/2 z-40 pointer-events-none'
          >
            <div className='bg-gradient-to-r from-blue-500/90 to-purple-500/90 backdrop-blur-md text-white px-6 py-3 rounded-xl whitespace-nowrap text-base font-semibold shadow-2xl border border-white/20'>
              即将播放下一集...
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3x Speed Overlay */}
      <AnimatePresence>
        {isSpeeding && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className='absolute top-12 left-0 right-0 mx-auto w-fit z-30'
          >
            <div className='flex items-center gap-2 bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 text-white shadow-lg'>
              <motion.div
                animate={{ x: [0, 5, 0] }}
                transition={{ repeat: Infinity, duration: 1 }}
              >
                <FastForwardOverlayIcon className='w-5 h-5 fill-current text-green-400' />
              </motion.div>
              <span className='font-medium text-sm'>3.0x 倍速播放中</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading Spinner */}
      <AnimatePresence>
        {state.loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className='absolute inset-0 flex items-center justify-center pointer-events-none z-0'
          >
            <div className='w-12 h-12 border-4 border-white/20 border-t-green-500 rounded-full animate-spin' />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Play/Pause Center Animation */}
      <AnimatePresence>
        {!state.playing && !state.loading && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.2, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className='absolute inset-0 flex items-center justify-center pointer-events-none z-10'
          >
            <div className='bg-black/30 backdrop-blur-md p-6 rounded-full border border-white/10 shadow-2xl'>
              <svg
                viewBox='0 0 24 24'
                className='w-10 h-10 fill-white'
                xmlns='http://www.w3.org/2000/svg'
              >
                <path d='M8 5v14l11-7z' />
              </svg>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Controls UI */}
      <PlayerControls
        state={state}
        show={showControls}
        onPlayPause={togglePlay}
        onNextEpisode={onNextEpisode}
        onSeek={seek}
        onVolumeChange={changeVolume}
        onToggleMute={toggleMute}
        onToggleFullscreen={toggleFullscreen}
        onToggleWebFullscreen={toggleWebFullscreen}
        onTogglePip={togglePip}
        onPlaybackRateChange={changePlaybackRate}
        onSetIntro={handleSetIntro}
        onSetOutro={handleSetOutro}
        onClearConfig={handleClearConfig}
      />

      {/* Top Gradient */}
      <motion.div
        animate={{ opacity: showControls ? 1 : 0 }}
        className='absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-black/60 to-transparent pointer-events-none'
      />
      <motion.div
        animate={{ opacity: showControls ? 1 : 0 }}
        className='absolute top-6 left-6 pointer-events-none z-20'
      >
        <h1 className='text-white/90 font-medium text-lg drop-shadow-md tracking-tight'>
          {title}
          {currentEpisode !== undefined && totalEpisodes
            ? ` · 第 ${currentEpisode + 1} 集`
            : ''}
        </h1>
      </motion.div>
    </div>
  );
};
