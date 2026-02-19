import { motion, SVGMotionProps } from 'framer-motion';
import React from 'react';

// Base props
const iconProps = {
  xmlns: 'http://www.w3.org/2000/svg',
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'currentColor',
  stroke: 'none',
};

const strokeIconProps = {
  ...iconProps,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

// --- Basic Controls ---

export const PlayIcon: React.FC<SVGMotionProps<SVGSVGElement>> = (props) => (
  <motion.svg {...iconProps} fill='currentColor' {...props}>
    <path d='M8 5v14l11-7z' />
  </motion.svg>
);

export const PauseIcon: React.FC<SVGMotionProps<SVGSVGElement>> = (props) => (
  <motion.svg {...iconProps} fill='currentColor' {...props}>
    <path d='M6 19h4V5H6v14zm8-14v14h4V5h-4z' />
  </motion.svg>
);

export const NextIcon: React.FC<SVGMotionProps<SVGSVGElement>> = (props) => (
  <motion.svg {...iconProps} fill='currentColor' {...props}>
    <path d='M5 18l10-6-10-6v12zM17 6v12h2V6h-2z' />
  </motion.svg>
);

export const VolumeIcon: React.FC<
  { level: number } & SVGMotionProps<SVGSVGElement>
> = ({ level, ...props }) => {
  return (
    <motion.svg {...strokeIconProps} {...props}>
      <path d='M11 5L6 9H2v6h4l5 4V5z' />
      <motion.path
        animate={{ opacity: level > 0 ? 1 : 0, pathLength: level > 0 ? 1 : 0 }}
        d='M15.54 8.46a5 5 0 0 1 0 7.07'
      />
      <motion.path
        animate={{
          opacity: level > 0.5 ? 1 : 0,
          pathLength: level > 0.5 ? 1 : 0,
        }}
        d='M19.07 4.93a10 10 0 0 1 0 14.14'
      />
      {level === 0 && (
        <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <line x1='23' y1='9' x2='17' y2='15' />
          <line x1='17' y1='9' x2='23' y2='15' />
        </motion.g>
      )}
    </motion.svg>
  );
};

// --- Window Controls ---

export const SettingsIcon: React.FC<SVGMotionProps<SVGSVGElement>> = (
  props
) => (
  <motion.svg {...strokeIconProps} {...props}>
    <motion.path d='M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.47a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.39a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z' />
    <motion.circle cx='12' cy='12' r='3' />
  </motion.svg>
);

export const MaximizeIcon: React.FC<SVGMotionProps<SVGSVGElement>> = (
  props
) => (
  <motion.svg {...strokeIconProps} {...props}>
    <path d='M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3' />
  </motion.svg>
);

export const MinimizeIcon: React.FC<SVGMotionProps<SVGSVGElement>> = (
  props
) => (
  <motion.svg {...strokeIconProps} {...props}>
    <path d='M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3' />
  </motion.svg>
);

export const PipIcon: React.FC<SVGMotionProps<SVGSVGElement>> = (props) => (
  <motion.svg {...strokeIconProps} {...props}>
    <rect x='2' y='5' width='20' height='14' rx='2' ry='2' />
    <rect
      x='12'
      y='11'
      width='7'
      height='5'
      rx='1'
      fill='currentColor'
      fillOpacity='0.3'
      stroke='none'
    />
  </motion.svg>
);

export const WebFullscreenIcon: React.FC<SVGMotionProps<SVGSVGElement>> = (
  props
) => (
  <motion.svg {...strokeIconProps} {...props}>
    <rect x='2' y='3' width='20' height='14' rx='2' ry='2' />
    <path d='M8 21h8' />
    <path d='M12 17v4' />
  </motion.svg>
);

export const ExitWebFullscreenIcon: React.FC<SVGMotionProps<SVGSVGElement>> = (
  props
) => (
  <motion.svg {...strokeIconProps} {...props}>
    <rect x='4' y='5' width='16' height='10' rx='2' ry='2' />
    <path d='M8 21h8' />
    <path d='M12 17v4' />
  </motion.svg>
);

export const ArrowRightIcon: React.FC<SVGMotionProps<SVGSVGElement>> = (
  props
) => (
  <motion.svg {...strokeIconProps} {...props}>
    <polyline points='9 18 15 12 9 6' />
  </motion.svg>
);

export const ArrowLeftIcon: React.FC<SVGMotionProps<SVGSVGElement>> = (
  props
) => (
  <motion.svg {...strokeIconProps} {...props}>
    <polyline points='15 18 9 12 15 6' />
  </motion.svg>
);

// --- Settings Menu Icons (With Animations) ---

export const SpeedIcon: React.FC<SVGMotionProps<SVGSVGElement>> = (props) => {
  return (
    <motion.svg {...strokeIconProps} {...props}>
      <circle cx='12' cy='12' r='10' />
      <polygon
        points='10 8 16 12 10 16 10 8'
        fill='currentColor'
        stroke='none'
      />
      <path d='M6 12h2' opacity='0.45' />
    </motion.svg>
  );
};

export const SkipIcon: React.FC<SVGMotionProps<SVGSVGElement>> = (props) => {
  return (
    <motion.svg {...strokeIconProps} {...props}>
      <path d='M4 12v6h2v-6h-2zm4 0v6h2v-6h-2z' fill='none' stroke='none' />
      <path d='M5 17h14' strokeOpacity='0.3' />
      <path d='M5 7h14' strokeOpacity='0.3' />

      <path d='M7 12h10' />
      <path d='M17 12l-3-3m3 3l-3 3' />
      <rect
        x='4'
        y='4'
        width='2'
        height='16'
        fill='currentColor'
        stroke='none'
      />
      <rect
        x='18'
        y='4'
        width='2'
        height='16'
        fill='currentColor'
        stroke='none'
      />
    </motion.svg>
  );
};

export const MarkerIcon: React.FC<SVGMotionProps<SVGSVGElement>> = (props) => (
  <motion.svg {...strokeIconProps} {...props}>
    <path d='M21 21H3' />
    <path d='M12 3v14' />
    <path d='M12 17l-4-4h8l-4 4z' fill='currentColor' stroke='none' />
  </motion.svg>
);

export const DeleteIcon: React.FC<SVGMotionProps<SVGSVGElement>> = (props) => {
  return (
    <motion.svg {...strokeIconProps} {...props}>
      <g>
        <path d='M3 6h18' />
        <path d='M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' />
      </g>
      {/* Bin */}
      <path d='M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' />
      <line x1='10' y1='11' x2='10' y2='17' />
      <line x1='14' y1='11' x2='14' y2='17' />
    </motion.svg>
  );
};

export const AdIcon: React.FC<
  { enabled: boolean } & SVGMotionProps<SVGSVGElement>
> = ({ enabled, ...props }) => (
  <motion.svg {...strokeIconProps} {...props}>
    {/* Box */}
    <rect
      x='2'
      y='5'
      width='20'
      height='14'
      rx='2'
      stroke='currentColor'
      fill='none'
      strokeWidth={1.5}
    />

    {/* 'A' Letter */}
    <path
      d='M7 15l2-6 2 6'
      stroke='currentColor'
      strokeWidth={1.5}
      strokeLinecap='round'
      strokeLinejoin='round'
    />
    <path d='M8 13h2' stroke='currentColor' strokeWidth={1.5} />

    {/* 'D' Letter */}
    <path
      d='M14 9h2a3 3 0 0 1 0 6h-2v-6z'
      stroke='currentColor'
      strokeWidth={1.5}
      strokeLinejoin='round'
    />

    {/* Diagonal strike */}
    <motion.path
      d='M4 19L20 5'
      initial={false}
      animate={{ pathLength: enabled ? 1 : 0, opacity: enabled ? 1 : 0 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      stroke='currentColor'
      strokeWidth={2}
    />
  </motion.svg>
);

// --- Overlay Icons ---

export const FastForwardOverlayIcon: React.FC<SVGMotionProps<SVGSVGElement>> = (
  props
) => (
  <motion.svg {...iconProps} fill='currentColor' {...props}>
    <path d='M13 6v12l8.5-6L13 6zM4 18l8.5-6L4 6v12z' />
  </motion.svg>
);

export const DanmuIcon: React.FC<SVGMotionProps<SVGSVGElement>> = (props) => (
  <motion.svg {...iconProps} fill='currentColor' {...props}>
    <path d='M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12zM7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z' />
  </motion.svg>
);
