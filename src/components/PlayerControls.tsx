import { AnimatePresence, motion } from 'framer-motion';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { DanmuConfig, VideoState } from '@/lib/types';

import {
  DanmuIcon,
  ExitWebFullscreenIcon,
  MaximizeIcon,
  MinimizeIcon,
  MoreIcon,
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
  danmuConfig: DanmuConfig;
  onDanmuConfigChange: (cfg: DanmuConfig) => void;
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

// Custom styled slider for danmu settings
const DanmuSlider: React.FC<{
  ariaLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}> = ({ ariaLabel, min, max, step, value, onChange }) => {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className='relative flex items-center w-full h-5'>
      <style>{`
        .danmu-range { -webkit-appearance: none; appearance: none; background: transparent; cursor: pointer; width: 100%; }
        .danmu-range::-webkit-slider-runnable-track { height: 4px; border-radius: 2px; }
        .danmu-range::-moz-range-track { height: 4px; border-radius: 2px; background: rgba(255,255,255,0.15); }
        .danmu-range::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%; background: #4ade80; margin-top: -5px; box-shadow: 0 0 0 2px rgba(74,222,128,0.3); transition: box-shadow 0.15s; cursor: pointer; }
        .danmu-range:hover::-webkit-slider-thumb { box-shadow: 0 0 0 4px rgba(74,222,128,0.25); }
        .danmu-range::-moz-range-thumb { width: 14px; height: 14px; border-radius: 50%; background: #4ade80; border: none; box-shadow: 0 0 0 2px rgba(74,222,128,0.3); cursor: pointer; }
      `}</style>
      <input
        aria-label={ariaLabel}
        type='range'
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className='danmu-range'
        style={{
          background: `linear-gradient(to right, #4ade80 0%, #4ade80 ${pct}%, rgba(255,255,255,0.15) ${pct}%, rgba(255,255,255,0.15) 100%)`,
          borderRadius: '2px',
          height: '4px',
        }}
      />
    </div>
  );
};

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
  danmuConfig,
  onDanmuConfigChange,
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const [showDanmuSettings, setShowDanmuSettings] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const danmuPanelRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Close danmu panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (
        showDanmuSettings &&
        danmuPanelRef.current &&
        !danmuPanelRef.current.contains(target) &&
        !target.closest('#danmu-btn')
      ) {
        setShowDanmuSettings(false);
      }
      if (
        showMoreMenu &&
        moreMenuRef.current &&
        !moreMenuRef.current.contains(target) &&
        !target.closest('#more-btn')
      ) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDanmuSettings, showMoreMenu]);

  return (
    <AnimatePresence>
      {(show || showSettings || showDanmuSettings || !state.playing) && (
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

          {/* Danmu Settings Popup */}
          <AnimatePresence>
            {showDanmuSettings && (
              <motion.div
                ref={danmuPanelRef}
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className='absolute bottom-20 right-16 w-64 bg-[#1a1a1a]/90 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl z-30 p-3 space-y-1 font-sans'
              >
                {/* Header */}
                <div className='px-2 pb-1 text-xs font-semibold text-white/40 uppercase tracking-widest'>
                  弹幕设置
                </div>

                {/* Toggle */}
                <div
                  className='flex items-center justify-between px-2 py-2 rounded-xl cursor-pointer hover:bg-white/10 transition-colors'
                  onClick={() =>
                    onDanmuConfigChange({
                      ...danmuConfig,
                      enabled: !danmuConfig.enabled,
                    })
                  }
                >
                  <span className='text-sm text-white/90 font-medium'>
                    弹幕开关
                  </span>
                  <div
                    className={`w-11 h-6 p-0.5 rounded-full relative transition-colors duration-300 ${
                      danmuConfig.enabled ? 'bg-green-500' : 'bg-white/20'
                    }`}
                  >
                    <motion.div
                      initial={false}
                      animate={{ x: danmuConfig.enabled ? 20 : 0 }}
                      className='w-5 h-5 bg-white rounded-full shadow-md'
                      transition={{
                        type: 'spring',
                        stiffness: 420,
                        damping: 30,
                      }}
                    />
                  </div>
                </div>

                {/* Font Size */}
                <div className='px-2 py-2 space-y-2.5'>
                  <div className='flex justify-between items-center'>
                    <span className='text-sm text-white/90 font-medium'>
                      字体大小
                    </span>
                    <span className='text-xs text-green-400 font-semibold tabular-nums'>
                      {danmuConfig.fontSize}px
                    </span>
                  </div>
                  <DanmuSlider
                    ariaLabel='弹幕字号'
                    min={16}
                    max={36}
                    step={1}
                    value={danmuConfig.fontSize}
                    onChange={(v) =>
                      onDanmuConfigChange({ ...danmuConfig, fontSize: v })
                    }
                  />
                  <div className='flex justify-between text-[10px] text-white/25 -mt-1'>
                    <span>小</span>
                    <span>大</span>
                  </div>
                </div>

                {/* Speed */}
                <div className='px-2 py-2 space-y-2.5'>
                  <div className='flex justify-between items-center'>
                    <span className='text-sm text-white/90 font-medium'>
                      弹幕速度
                    </span>
                    <span className='text-xs text-green-400 font-semibold tabular-nums'>
                      {danmuConfig.speedFactor.toFixed(1)}x
                    </span>
                  </div>
                  <DanmuSlider
                    ariaLabel='弹幕速度'
                    min={0.5}
                    max={3}
                    step={0.1}
                    value={danmuConfig.speedFactor}
                    onChange={(v) =>
                      onDanmuConfigChange({ ...danmuConfig, speedFactor: v })
                    }
                  />
                  <div className='flex justify-between text-[10px] text-white/25 -mt-1'>
                    <span>慢</span>
                    <span>快</span>
                  </div>
                </div>

                {/* Area */}
                <div className='px-2 py-2 space-y-1.5'>
                  <span className='text-sm text-white/90 font-medium'>
                    显示区域
                  </span>
                  <div className='flex gap-1.5 mt-1'>
                    {([0.25, 0.5, 0.75, 1.0] as const).map((pct) => (
                      <button
                        key={pct}
                        onClick={() =>
                          onDanmuConfigChange({
                            ...danmuConfig,
                            areaPercent: pct,
                          })
                        }
                        className={`flex-1 text-xs py-1 rounded-lg font-medium transition-colors ${
                          danmuConfig.areaPercent === pct
                            ? 'bg-green-500 text-white'
                            : 'bg-white/10 text-white/60 hover:bg-white/20'
                        }`}
                      >
                        {Math.round(pct * 100)}%
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Mobile "More" Menu */}
          <AnimatePresence>
            {showMoreMenu && (
              <motion.div
                ref={moreMenuRef}
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                className='absolute bottom-20 right-4 w-56 bg-[#1a1a1a]/90 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl z-30 p-2 font-sans sm:hidden'
              >
                <div className='px-2 py-1 text-[10px] font-semibold text-white/40 uppercase tracking-widest'>
                  更多
                </div>
                <div className='space-y-1'>
                  <button
                    onClick={() => {
                      setShowMoreMenu(false);
                      setShowDanmuSettings(true);
                      setShowSettings(false);
                    }}
                    className='w-full flex items-center justify-between px-2 py-2 rounded-xl hover:bg-white/10 transition-colors text-sm text-white/90'
                  >
                    <span className='flex items-center gap-2'>
                      <DanmuIcon className='w-4 h-4' /> 弹幕设置
                    </span>
                    <span className='text-xs text-white/40'>
                      {danmuConfig.enabled ? '开' : '关'}
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      setShowMoreMenu(false);
                      setShowSettings(true);
                      setShowDanmuSettings(false);
                    }}
                    className='w-full flex items-center justify-between px-2 py-2 rounded-xl hover:bg-white/10 transition-colors text-sm text-white/90'
                  >
                    <span className='flex items-center gap-2'>
                      <SettingsIcon className='w-4 h-4' /> 播放设置
                    </span>
                    <span className='text-xs text-white/40'>
                      {state.playbackRate.toFixed(1)}x
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      setShowMoreMenu(false);
                      onTogglePip();
                    }}
                    className='w-full flex items-center gap-2 px-2 py-2 rounded-xl hover:bg-white/10 transition-colors text-sm text-white/90'
                  >
                    <PipIcon className='w-4 h-4' /> 画中画
                  </button>

                  <button
                    onClick={() => {
                      setShowMoreMenu(false);
                      onToggleWebFullscreen();
                    }}
                    className='w-full flex items-center justify-between px-2 py-2 rounded-xl hover:bg-white/10 transition-colors text-sm text-white/90'
                  >
                    <span className='flex items-center gap-2'>
                      {state.webFullscreen ? (
                        <ExitWebFullscreenIcon className='w-4 h-4' />
                      ) : (
                        <WebFullscreenIcon className='w-4 h-4' />
                      )}
                      网页全屏
                    </span>
                    <span className='text-xs text-white/40'>
                      {state.webFullscreen ? '开' : '关'}
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      setShowMoreMenu(false);
                      onToggleFullscreen();
                    }}
                    className='w-full flex items-center justify-between px-2 py-2 rounded-xl hover:bg-white/10 transition-colors text-sm text-white/90'
                  >
                    <span className='flex items-center gap-2'>
                      {state.fullscreen ? (
                        <MinimizeIcon className='w-4 h-4' />
                      ) : (
                        <MaximizeIcon className='w-4 h-4' />
                      )}
                      全屏
                    </span>
                    <span className='text-xs text-white/40'>
                      {state.fullscreen ? '开' : '关'}
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      setShowMoreMenu(false);
                      onToggleMute();
                    }}
                    className='w-full flex items-center justify-between px-2 py-2 rounded-xl hover:bg-white/10 transition-colors text-sm text-white/90'
                  >
                    <span className='flex items-center gap-2'>
                      <VolumeIcon
                        level={state.muted ? 0 : state.volume}
                        className='w-4 h-4'
                      />
                      静音
                    </span>
                    <span className='text-xs text-white/40'>
                      {state.muted ? '开' : '关'}
                    </span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Glass Control Bar Container */}
          <div className='w-full relative bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-2.5 px-3 sm:p-3 sm:px-5 shadow-2xl overflow-visible group'>
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
            <div className='relative z-10 flex items-center justify-between h-9 sm:h-10 gap-2'>
              {/* Left Group (Play + Next + Volume + Time) */}
              <div className='flex items-center gap-2.5 sm:gap-3 min-w-0'>
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
                  <div className='hidden sm:flex w-0 overflow-hidden group-hover/vol:w-24 transition-all duration-300 ease-out items-center opacity-0 group-hover/vol:opacity-100'>
                    <VolumeSlider
                      volume={state.muted ? 0 : state.volume}
                      onChange={onVolumeChange}
                    />
                  </div>
                </div>

                <div className='hidden sm:block text-xs font-medium text-white/60 select-none tracking-wide shrink-0'>
                  <span className='text-white'>
                    {formatTime(state.currentTime)}
                  </span>
                  <span className='mx-1 opacity-50'>/</span>
                  <span>{formatTime(state.duration)}</span>
                </div>

                <div className='sm:hidden text-[10px] font-medium text-white/60 select-none tracking-wide tabular-nums shrink-0'>
                  <span className='text-white'>
                    {formatTime(state.currentTime)}
                  </span>
                  <span className='mx-1 opacity-50'>/</span>
                  <span>{formatTime(state.duration)}</span>
                </div>
              </div>

              {/* Right Group (Settings + PIP + Fullscreen) */}
              <div className='flex items-center gap-2.5 sm:gap-3 shrink-0'>
                <WithTooltip text='弹幕设置'>
                  <motion.button
                    aria-label='弹幕设置'
                    id='danmu-btn'
                    animate={{
                      scale: showDanmuSettings ? 1.15 : 1,
                      opacity: showDanmuSettings ? 1 : 0.8,
                    }}
                    transition={{ duration: 0.2 }}
                    onClick={() => {
                      setShowDanmuSettings(!showDanmuSettings);
                      setShowSettings(false);
                      setShowMoreMenu(false);
                    }}
                    className={`hidden sm:inline-flex hover:opacity-100 transition-opacity ${
                      showDanmuSettings
                        ? 'text-green-400'
                        : danmuConfig.enabled
                        ? 'text-white'
                        : 'text-white/40'
                    }`}
                  >
                    <DanmuIcon className='w-5 h-5' />
                  </motion.button>
                </WithTooltip>

                <WithTooltip text='设置'>
                  <motion.button
                    aria-label='播放器设置'
                    id='settings-btn'
                    animate={{
                      scale: showSettings ? 1.15 : 1,
                      opacity: showSettings ? 1 : 0.8,
                    }}
                    transition={{ duration: 0.2 }}
                    onClick={() => {
                      setShowSettings(!showSettings);
                      setShowDanmuSettings(false);
                      setShowMoreMenu(false);
                    }}
                    className={`hidden sm:inline-flex hover:opacity-100 transition-opacity ${
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
                    className='hidden sm:inline-flex text-white/80 hover:text-white transition-colors'
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
                    className={`hidden sm:inline-flex text-white/80 hover:text-white transition-colors ${
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

                <WithTooltip text='更多'>
                  <motion.button
                    aria-label='更多设置'
                    id='more-btn'
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => {
                      setShowMoreMenu((v) => !v);
                      setShowSettings(false);
                      setShowDanmuSettings(false);
                    }}
                    className={`sm:hidden text-white/80 hover:text-white transition-colors ${
                      showMoreMenu ? 'text-green-400' : ''
                    }`}
                  >
                    <MoreIcon className='w-5 h-5' />
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
