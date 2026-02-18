import { AnimatePresence, motion } from 'framer-motion';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { VideoState } from '@/lib/types';

import {
  ExitWebFullscreenIcon,
  MaximizeIcon,
  MinimizeIcon,
  NextIcon,
  PauseIcon,
  PipIcon,
  PlayIcon,
  SettingsIcon,
  VolumeIcon,
  WebFullscreenIcon,
} from './Icons';
import { ProgressBar } from './ProgressBar';
import { SettingsMenu } from './SettingsMenu';

interface PlayerControlsProps {
  state: VideoState;
  onPlayPause: () => void;
  onNextEpisode?: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onToggleWebFullscreen: () => void;
  onTogglePip: () => void;
  onPlaybackRateChange: (rate: number) => void;
  skipEnabled: boolean;
  onSkipEnabledChange: (enabled: boolean) => void;
  onSetIntro: (time: number) => void;
  onSetOutro: (time: number) => void;
  onClearConfig: () => void;
  show: boolean;
}

const formatTime = (seconds: number) => {
  if (isNaN(seconds)) return '00:00';
  const date = new Date(seconds * 1000);
  const hh = date.getUTCHours();
  const mm = date.getUTCMinutes();
  const ss = date.getUTCSeconds().toString().padStart(2, '0');
  if (hh) {
    return `${hh}:${mm.toString().padStart(2, '0')}:${ss}`;
  }
  return `${mm}:${ss}`;
};

// Tooltip Wrapper Component
const WithTooltip = ({
  text,
  children,
}: {
  text: string;
  children: React.ReactNode;
}) => (
  <div className='relative flex items-center justify-center group/tooltip'>
    {children}
    <div className='absolute bottom-full mb-3 opacity-0 translate-y-2 group-hover/tooltip:opacity-100 group-hover/tooltip:translate-y-0 transition-all duration-200 ease-out pointer-events-none z-50'>
      <div className='bg-black/80 backdrop-blur-md text-white text-[11px] px-2.5 py-1.5 rounded-lg border border-white/10 shadow-xl font-medium tracking-wide whitespace-nowrap'>
        {text}
      </div>
    </div>
  </div>
);

// Custom Volume Slider Component
const VolumeSlider: React.FC<{
  volume: number;
  onChange: (vol: number) => void;
}> = ({ volume, onChange }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleInteraction = useCallback(
    (clientX: number) => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const percent = Math.max(
        0,
        Math.min(1, (clientX - rect.left) / rect.width)
      );
      onChange(percent);
    },
    [onChange]
  );

  useEffect(() => {
    if (isDragging) {
      const onMove = (e: MouseEvent) => handleInteraction(e.clientX);
      const onUp = () => setIsDragging(false);
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      return () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
    }
  }, [isDragging, handleInteraction]);

  return (
    <div
      ref={ref}
      className='w-20 h-8 flex items-center cursor-pointer group/slider relative'
      onMouseDown={(e) => {
        setIsDragging(true);
        handleInteraction(e.clientX);
      }}
    >
      <div className='w-full h-1 bg-white/20 rounded-full overflow-hidden'>
        <motion.div
          className='h-full bg-white'
          style={{ width: `${volume * 100}%` }}
          transition={{ duration: isDragging ? 0 : 0.1 }}
        />
      </div>
      <motion.div
        className='absolute w-3 h-3 bg-white rounded-full shadow-md'
        style={{ left: `calc(${volume * 100}% - 6px)` }}
        animate={{ scale: isDragging ? 1.2 : 0, opacity: isDragging ? 1 : 0 }}
        whileHover={{ scale: 1.2, opacity: 1 }}
      />
    </div>
  );
};

export const PlayerControls: React.FC<PlayerControlsProps> = ({
  state,
  onPlayPause,
  onNextEpisode,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onToggleFullscreen,
  onToggleWebFullscreen,
  onTogglePip,
  onPlaybackRateChange,
  skipEnabled,
  onSkipEnabledChange,
  onSetIntro,
  onSetOutro,
  onClearConfig,
  show,
}) => {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <AnimatePresence>
      {(show || showSettings || !state.playing) && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className='absolute bottom-6 left-4 right-4 mx-auto max-w-4xl z-20 flex justify-center'
        >
          {/* Settings Menu Popup */}
          <SettingsMenu
            isOpen={showSettings}
            onClose={() => setShowSettings(false)}
            playbackRate={state.playbackRate}
            onPlaybackRateChange={onPlaybackRateChange}
            skipEnabled={skipEnabled}
            onSkipEnabledChange={onSkipEnabledChange}
            introTime={state.introTime}
            outroTime={state.outroTime}
            currentTime={state.currentTime}
            duration={state.duration}
            onSetIntro={onSetIntro}
            onSetOutro={onSetOutro}
            onClearConfig={onClearConfig}
          />

          {/* Glass Control Bar Container */}
          <div className='w-full relative bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-3 px-5 shadow-2xl overflow-visible group'>
            {/* Progress Bar Row */}
            <div className='relative z-10 mb-1'>
              <ProgressBar
                duration={state.duration}
                currentTime={state.currentTime}
                buffered={state.buffered}
                onSeek={onSeek}
              />
            </div>

            {/* Controls Row */}
            <div className='relative z-10 flex items-center justify-between h-10'>
              {/* Left Group (Play + Next + Volume + Time) */}
              <div className='flex items-center gap-3'>
                <WithTooltip text={state.playing ? '暂停' : '播放'}>
                  <button
                    onClick={onPlayPause}
                    className='w-8 h-8 flex items-center justify-center text-white hover:text-green-400 transition-colors relative'
                  >
                    <AnimatePresence>
                      {state.playing ? (
                        <motion.div
                          key='pause'
                          className='absolute inset-0 flex items-center justify-center'
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.5 }}
                          transition={{ duration: 0.2 }}
                        >
                          <PauseIcon className='w-6 h-6 fill-current' />
                        </motion.div>
                      ) : (
                        <motion.div
                          key='play'
                          className='absolute inset-0 flex items-center justify-center'
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.5 }}
                          transition={{ duration: 0.2 }}
                        >
                          <PlayIcon className='w-6 h-6 fill-current' />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </button>
                </WithTooltip>

                {/* Next Button */}
                {onNextEpisode && (
                  <WithTooltip text='下一集'>
                    <motion.button
                      aria-label='播放下一集'
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={onNextEpisode}
                      className='w-8 h-8 flex items-center justify-center text-white/80 hover:text-white transition-colors'
                    >
                      <NextIcon className='w-5 h-5 fill-current' />
                    </motion.button>
                  </WithTooltip>
                )}

                <div className='group/vol flex items-center gap-2 relative ml-1'>
                  <button
                    aria-label='切换静音'
                    onClick={onToggleMute}
                    className='text-white/80 hover:text-white transition-colors'
                  >
                    <VolumeIcon
                      level={state.muted ? 0 : state.volume}
                      className='w-6 h-6'
                    />
                  </button>
                  {/* Expandable Volume Slider */}
                  <div className='w-0 overflow-hidden group-hover/vol:w-24 transition-all duration-300 ease-out flex items-center opacity-0 group-hover/vol:opacity-100'>
                    <VolumeSlider
                      volume={state.muted ? 0 : state.volume}
                      onChange={onVolumeChange}
                    />
                  </div>
                </div>

                <div className='text-xs font-medium text-white/60 select-none tracking-wide'>
                  <span className='text-white'>
                    {formatTime(state.currentTime)}
                  </span>
                  <span className='mx-1 opacity-50'>/</span>
                  <span>{formatTime(state.duration)}</span>
                </div>
              </div>

              {/* Right Group (Settings + PIP + Fullscreen) */}
              <div className='flex items-center gap-3'>
                <WithTooltip text='设置'>
                  <motion.button
                    aria-label='播放器设置'
                    id='settings-btn'
                    animate={{
                      scale: showSettings ? 1.15 : 1,
                      opacity: showSettings ? 1 : 0.8,
                    }}
                    transition={{ duration: 0.2 }}
                    onClick={() => setShowSettings(!showSettings)}
                    className={`hover:opacity-100 transition-opacity ${
                      showSettings ? 'text-green-400' : 'text-white'
                    }`}
                  >
                    <SettingsIcon className='w-5 h-5' />
                  </motion.button>
                </WithTooltip>

                <WithTooltip text='画中画'>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={onTogglePip}
                    className='text-white/80 hover:text-white transition-colors'
                  >
                    <PipIcon className='w-5 h-5' />
                  </motion.button>
                </WithTooltip>

                <WithTooltip
                  text={state.webFullscreen ? '退出网页全屏' : '网页全屏'}
                >
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={onToggleWebFullscreen}
                    className={`text-white/80 hover:text-white transition-colors ${
                      state.webFullscreen ? 'text-green-500' : ''
                    }`}
                  >
                    {state.webFullscreen ? (
                      <ExitWebFullscreenIcon className='w-5 h-5' />
                    ) : (
                      <WebFullscreenIcon className='w-5 h-5' />
                    )}
                  </motion.button>
                </WithTooltip>

                <WithTooltip text={state.fullscreen ? '退出全屏' : '全屏'}>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={onToggleFullscreen}
                    className='text-white/80 hover:text-white transition-colors'
                  >
                    {state.fullscreen ? (
                      <MinimizeIcon className='w-5 h-5' />
                    ) : (
                      <MaximizeIcon className='w-5 h-5' />
                    )}
                  </motion.button>
                </WithTooltip>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
