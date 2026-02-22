import { AnimatePresence, motion } from 'framer-motion';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import {
  AdIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  DeleteIcon,
  MarkerIcon,
  SkipIcon,
  SpeedIcon,
} from './Icons';

interface SettingsMenuProps {
  isOpen: boolean;
  onClose: () => void;
  presentation?: 'auto' | 'popover' | 'modal';
  playbackRate: number;
  onPlaybackRateChange: (rate: number) => void;
  skipEnabled: boolean;
  onSkipEnabledChange: (enabled: boolean) => void;
  introTime?: number;
  outroTime?: number;
  currentTime: number;
  duration: number;
  onSetIntro: (time: number) => void;
  onSetOutro: (time: number) => void;
  onClearConfig: () => void;
}

const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];

const formatTimeShort = (seconds: number) => {
  if (seconds === undefined || seconds === null) return '设置当前时间';
  const date = new Date(seconds * 1000);
  const mm = date.getUTCMinutes().toString().padStart(2, '0');
  const ss = date.getUTCSeconds().toString().padStart(2, '0');
  return `${mm}:${ss}`;
};

export const SettingsMenu: React.FC<SettingsMenuProps> = ({
  isOpen,
  onClose,
  presentation = 'auto',
  playbackRate,
  onPlaybackRateChange,
  skipEnabled,
  onSkipEnabledChange,
  introTime,
  outroTime,
  currentTime,
  duration,
  onSetIntro,
  onSetOutro,
  onClearConfig,
}) => {
  const [currentView, setCurrentView] = useState<'main' | 'speed'>('main');
  const [adEnabled, setAdEnabled] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  useEffect(() => {
    if (presentation !== 'auto') return;
    const mql = window.matchMedia('(max-width: 639px)');
    const onChange = (e: MediaQueryListEvent) => setIsSmallScreen(e.matches);
    setIsSmallScreen(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [presentation]);

  const mode = useMemo(() => {
    if (presentation === 'auto') return isSmallScreen ? 'modal' : 'popover';
    return presentation;
  }, [presentation, isSmallScreen]);

  // Close when clicking outside
  useEffect(() => {
    if (mode !== 'popover') return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // Check if click is outside menu AND not on the settings toggle button (using closest to catch icon clicks)
      if (
        isOpen &&
        menuRef.current &&
        !menuRef.current.contains(target) &&
        !target.closest('#settings-btn')
      ) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose, mode]);

  // Reset view when closed
  useEffect(() => {
    if (!isOpen) setCurrentView('main');
  }, [isOpen]);

  // Helper for menu item row
  const MenuItem = ({
    icon,
    label,
    rightContent,
    onClick,
    danger = false,
    iconAnimation = 'none',
  }: {
    icon: React.ReactNode;
    label: string;
    rightContent?: React.ReactNode;
    onClick?: () => void;
    danger?: boolean;
    iconAnimation?:
      | 'none'
      | 'speed'
      | 'ad'
      | 'skip'
      | 'delete'
      | 'intro'
      | 'outro';
  }) =>
    (() => {
      const iconHoverClass =
        iconAnimation === 'speed'
          ? 'group-hover/menuitem:scale-[1.08] group-hover/menuitem:opacity-95'
          : iconAnimation === 'skip'
          ? 'group-hover/menuitem:scale-[1.06]'
          : iconAnimation === 'ad'
          ? 'group-hover/menuitem:scale-105 group-hover/menuitem:opacity-90'
          : iconAnimation === 'delete'
          ? 'group-hover/menuitem:scale-105'
          : iconAnimation === 'intro'
          ? 'group-hover/menuitem:scale-105'
          : iconAnimation === 'outro'
          ? 'group-hover/menuitem:scale-105'
          : '';

      return (
        <motion.div
          whileHover={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
          whileTap={{ scale: 0.98 }}
          onClick={onClick}
          className={`group/menuitem flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${
            danger ? 'text-red-400 hover:text-red-300' : 'text-white/90'
          }`}
        >
          <div className='flex items-center gap-3'>
            <div
              className={`text-white/80 transition-transform duration-200 ease-out ${iconHoverClass}`}
            >
              {icon}
            </div>
            <span className='text-sm font-medium'>{label}</span>
          </div>
          <div className='text-white/50 text-xs flex items-center gap-2'>
            {rightContent}
          </div>
        </motion.div>
      );
    })();

  // Toggle Switch Component
  const Toggle = ({ checked }: { checked: boolean }) => (
    <div
      className={`w-11 h-6 p-0.5 rounded-full relative transition-colors duration-300 ${
        checked ? 'bg-green-500' : 'bg-white/20'
      }`}
    >
      <motion.div
        initial={false}
        animate={{ x: checked ? 20 : 0 }}
        className='w-5 h-5 bg-white rounded-full shadow-md'
        transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      />
    </div>
  );

  const content = (
    <div className='relative overflow-hidden'>
      <AnimatePresence mode='wait' initial={false}>
        {currentView === 'main' ? (
          <motion.div
            key='main'
            initial={{ x: -50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -50, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className='p-2 space-y-1'
          >
            <MenuItem
              icon={<SpeedIcon width={20} height={20} />}
              label='播放速度'
              iconAnimation='speed'
              rightContent={
                <>
                  <span className='text-white/70'>
                    {playbackRate === 1 ? '正常' : `${playbackRate}x`}
                  </span>
                  <ArrowRightIcon width={16} height={16} />
                </>
              }
              onClick={() => setCurrentView('speed')}
            />

            <MenuItem
              icon={<AdIcon width={20} height={20} enabled={adEnabled} />}
              label='去广告'
              iconAnimation='ad'
              rightContent={
                <span className='text-white/50 text-xs mr-1'>
                  {adEnabled ? '已开启' : '已关闭'}
                </span>
              }
              onClick={() => setAdEnabled(!adEnabled)}
            />

            <MenuItem
              icon={<SkipIcon width={20} height={20} />}
              label='跳过片头片尾'
              iconAnimation='skip'
              rightContent={<Toggle checked={skipEnabled} />}
              onClick={() => onSkipEnabledChange(!skipEnabled)}
            />

            <div className='h-px bg-white/10 mx-2 my-1' />

            <MenuItem
              icon={<DeleteIcon width={20} height={20} />}
              label='删除跳过配置'
              iconAnimation='delete'
              danger={true}
              onClick={onClearConfig}
            />

            <MenuItem
              icon={<MarkerIcon width={20} height={20} />}
              label='设置片头'
              iconAnimation='intro'
              rightContent={
                <span className='text-white/30 hover:text-white/80 transition-colors'>
                  {introTime ? formatTimeShort(introTime) : '设置当前时间'}
                </span>
              }
              onClick={() => onSetIntro(currentTime)}
            />

            <MenuItem
              icon={<MarkerIcon width={20} height={20} />}
              label='设置片尾'
              iconAnimation='outro'
              rightContent={
                <span className='text-white/30 hover:text-white/80 transition-colors'>
                  {outroTime ? formatTimeShort(outroTime) : '设置当前时间'}
                </span>
              }
              onClick={() => onSetOutro(currentTime - duration)}
            />
          </motion.div>
        ) : (
          <motion.div
            key='speed'
            initial={{ x: 50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 50, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className='p-2 h-full'
          >
            <div className='flex items-center gap-2 p-3 border-b border-white/10 mb-2'>
              <button
                aria-label='返回设置菜单'
                onClick={() => setCurrentView('main')}
                className='hover:bg-white/10 p-1 rounded-full transition-colors'
              >
                <ArrowLeftIcon width={18} height={18} />
              </button>
              <span className='font-medium text-white/90'>播放速度</span>
            </div>
            <div className='space-y-1 max-h-60 overflow-y-auto no-scrollbar'>
              {speeds.map((speed) => (
                <motion.button
                  key={speed}
                  whileHover={{
                    backgroundColor: 'rgba(255,255,255,0.1)',
                  }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    onPlaybackRateChange(speed);
                    setCurrentView('main');
                  }}
                  className='w-full flex items-center justify-between p-3 rounded-xl text-sm'
                >
                  <span
                    className={
                      playbackRate === speed
                        ? 'text-green-500 font-bold'
                        : 'text-white/80'
                    }
                  >
                    {speed === 1 ? '正常' : `${speed}x`}
                  </span>
                  {playbackRate === speed && (
                    <motion.div
                      layoutId='check'
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{
                        type: 'spring',
                        stiffness: 400,
                        damping: 25,
                      }}
                    >
                      <svg
                        width='16'
                        height='16'
                        viewBox='0 0 16 16'
                        fill='none'
                        xmlns='http://www.w3.org/2000/svg'
                      >
                        <path
                          d='M3 8L6.5 11.5L13 5'
                          stroke='#22c55e'
                          strokeWidth='2'
                          strokeLinecap='round'
                          strokeLinejoin='round'
                        />
                      </svg>
                    </motion.div>
                  )}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <AnimatePresence>
      {isOpen &&
        (mode === 'modal' ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className='fixed inset-0 z-[700] flex items-end justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-xl'
            onClick={onClose}
          >
            <motion.div
              ref={menuRef}
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              className='w-full max-w-md bg-[#1a1a1a]/90 border border-white/10 rounded-2xl shadow-2xl overflow-hidden font-sans'
              onClick={(e) => e.stopPropagation()}
            >
              <div className='flex items-center justify-between px-4 py-3 border-b border-white/10'>
                <div className='text-white/90 font-semibold'>播放设置</div>
                <button
                  onClick={onClose}
                  className='text-white/60 hover:text-white transition-colors text-sm'
                >
                  关闭
                </button>
              </div>
              <div className='max-h-[70vh] overflow-y-auto no-scrollbar'>
                {content}
              </div>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className='absolute bottom-20 right-4 w-72 bg-[#1a1a1a]/90 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-30 font-sans'
          >
            {content}
          </motion.div>
        ))}
    </AnimatePresence>
  );
};
