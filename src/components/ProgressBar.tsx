import { motion } from 'framer-motion';
import React, { useEffect, useRef, useState } from 'react';

interface ProgressBarProps {
  duration: number;
  currentTime: number;
  buffered: number;
  onSeek: (time: number) => void;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  duration,
  currentTime,
  buffered,
  onSeek,
}) => {
  const [isHovering, setIsHovering] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState(0);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPercent, setHoverPercent] = useState(0);
  const progressBarRef = useRef<HTMLDivElement>(null);

  // Calculate percentages
  // If dragging, display the dragTime, otherwise displayed the actual currentTime
  const activeTime = isDragging ? dragTime : currentTime;
  const progressPercent = duration ? (activeTime / duration) * 100 : 0;
  const bufferedPercent = duration ? (buffered / duration) * 100 : 0;
  const safeHoverPercent = Math.min(98, Math.max(2, hoverPercent));

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds) || seconds < 0) return '00:00';
    const date = new Date(seconds * 1000);
    const hh = date.getUTCHours();
    const mm = date.getUTCMinutes().toString().padStart(2, '0');
    const ss = date.getUTCSeconds().toString().padStart(2, '0');
    if (hh) return `${hh}:${mm}:${ss}`;
    return `${Number(mm)}:${ss}`.padStart(4, '0');
  };

  const calculateTime = (clientX: number) => {
    if (!progressBarRef.current || !duration) return 0;
    const rect = progressBarRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return pos * duration;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    const time = calculateTime(e.clientX);
    setDragTime(time);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const time = calculateTime(e.clientX);
    setHoverTime(time);
    setHoverPercent(duration ? (time / duration) * 100 : 0);
  };

  // Global event listeners for dragging
  useEffect(() => {
    if (isDragging) {
      const handleMouseMove = (e: MouseEvent) => {
        const time = calculateTime(e.clientX);
        setDragTime(time);
      };

      const handleMouseUp = (e: MouseEvent) => {
        setIsDragging(false);
        const time = calculateTime(e.clientX);
        onSeek(time);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, duration, onSeek]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className='group/progress relative w-full h-4 flex items-center cursor-pointer select-none'
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => {
        setIsHovering(false);
        setHoverTime(null);
      }}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      ref={progressBarRef}
    >
      {/* Hit Area (invisible expanded area for easier clicking) */}
      <div className='absolute inset-0 h-full' />

      {/* Track Background */}
      <div className='relative w-full h-1 bg-white/20 rounded-full overflow-hidden transition-all duration-300 group-hover/progress:h-1.5 backdrop-blur-sm'>
        {/* Buffer Bar */}
        <div
          className='absolute top-0 left-0 h-full bg-white/30 transition-all duration-300'
          style={{ width: `${bufferedPercent}%` }}
        />
        {/* Play Progress Bar */}
        <motion.div
          className='absolute top-0 left-0 h-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]'
          style={{ width: `${progressPercent}%` }}
          // Disable transition during drag for instant feedback, enable for clicks/playback
          transition={{ duration: isDragging ? 0 : 0.1, ease: 'linear' }}
        />
      </div>

      {/* Thumb / Scrubber */}
      <motion.div
        className='absolute top-1/2 -mt-[6px] w-3 h-3 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.8)] z-10 pointer-events-none'
        initial={false}
        animate={{
          scale: isHovering || isDragging ? 1.3 : 0,
          opacity: isHovering || isDragging ? 1 : 0,
          left: `calc(${progressPercent}% - 6px)`, // Center the thumb
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      />

      {/* Hover Dot + Tooltip (wide screen) */}
      {isHovering && !isDragging && hoverTime !== null && duration > 0 && (
        <>
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className='hidden sm:block absolute top-1/2 -mt-[4px] w-2 h-2 rounded-full bg-white/90 ring-2 ring-green-400/60 shadow-[0_0_10px_rgba(34,197,94,0.35)] z-20 pointer-events-none'
            style={{ left: `calc(${safeHoverPercent}% - 4px)` }}
          />
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className='hidden sm:block absolute bottom-full mb-2 z-30 pointer-events-none'
            style={{
              left: `${safeHoverPercent}%`,
              transform: 'translateX(-50%)',
            }}
          >
            <div className='px-3 py-1.5 rounded-xl bg-black/55 backdrop-blur-2xl border border-white/15 text-white text-xs font-medium shadow-2xl tabular-nums'>
              {formatTime(hoverTime)}
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
};
