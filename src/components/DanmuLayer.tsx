import React, { useEffect, useMemo, useRef, useState } from 'react';

import { DanmuConfig, DanmuItem } from '@/lib/types';

const BASE_DURATION_MS = 12000;

type ActiveDanmu = {
  id: string;
  item: DanmuItem;
  topPx: number;
  lane: number;
  startTime: number; // video currentTime when emitted — used for lane cooldown
};

export function DanmuLayer({
  danmu,
  currentTime,
  paused,
  config,
}: {
  danmu: DanmuItem[];
  currentTime: number;
  paused?: boolean;
  config: DanmuConfig;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<ActiveDanmu[]>([]);
  // Mirror of active state accessible synchronously inside effects/callbacks
  const activeRef = useRef<ActiveDanmu[]>([]);
  const nextIndexRef = useRef(0);
  const prevTimeRef = useRef(0);
  const scrollLaneRef = useRef(0);

  // Setter that keeps activeRef in sync with state
  const setActiveSync = (
    updater: ActiveDanmu[] | ((prev: ActiveDanmu[]) => ActiveDanmu[])
  ) => {
    setActive((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      activeRef.current = next;
      return next;
    });
  };

  const sorted = useMemo(() => {
    const arr = [...(danmu || [])];
    arr.sort((a, b) => a.time - b.time);
    return arr;
  }, [danmu]);

  const clearAll = () => {
    setActiveSync([]);
    nextIndexRef.current = 0;
    scrollLaneRef.current = 0;
  };

  useEffect(() => {
    clearAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted]);

  // Clear when danmu disabled
  useEffect(() => {
    if (!config.enabled) clearAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.enabled]);

  useEffect(() => {
    if (!config.enabled) return;

    const prev = prevTimeRef.current;
    prevTimeRef.current = currentTime;

    // ── Seek backward: clear and rewind ──────────────────────────
    if (currentTime < prev - 1) {
      clearAll();
      while (
        nextIndexRef.current < sorted.length &&
        sorted[nextIndexRef.current].time < currentTime - 0.2
      ) {
        nextIndexRef.current += 1;
      }
      return;
    }

    // ── Seek forward (big jump): skip burst, clear screen ────────
    if (currentTime > prev + 1) {
      setActiveSync([]);
      scrollLaneRef.current = 0;
      while (
        nextIndexRef.current < sorted.length &&
        sorted[nextIndexRef.current].time < currentTime - 0.2
      ) {
        nextIndexRef.current += 1;
      }
      return;
    }

    const container = containerRef.current;
    const height = container?.clientHeight || 0;
    const paddingTop = 8;
    const rowHeight = Math.round(config.fontSize * 1.2);
    const usableHeight = Math.max(0, height * config.areaPercent - paddingTop);
    const laneCount = Math.max(1, Math.floor(usableHeight / rowHeight));

    // Min gap before re-using the same scroll lane (30% of full scroll duration).
    // Prevents two danmu in the same lane from visually colliding at the start.
    const durationSec = BASE_DURATION_MS / config.speedFactor / 1000;
    const laneCooldown = durationSec * 0.3;

    while (
      nextIndexRef.current < sorted.length &&
      sorted[nextIndexRef.current].time <= currentTime + 0.05
    ) {
      const item = sorted[nextIndexRef.current];
      nextIndexRef.current += 1;

      let lane: number;
      let topPx: number;
      const id = `${item.time}-${nextIndexRef.current}-${Math.random()
        .toString(16)
        .slice(2)}`;

      if (item.mode === 'top') {
        // ── Find an unoccupied lane for top-danmu ──────────────
        const usedLanes = new Set(
          activeRef.current
            .filter((a) => a.item.mode === 'top')
            .map((a) => a.lane)
        );
        lane = 0;
        while (usedLanes.has(lane) && lane < laneCount) lane++;
        if (lane >= laneCount) lane = 0; // all lanes full → cycle from top
        topPx = paddingTop + lane * rowHeight;
        setActiveSync((prev) => [
          ...prev,
          { id, item, topPx, lane, startTime: currentTime },
        ]);
      } else {
        // ── Scroll danmu: randomized lane assignment ───────────
        // Use pseudo-random (seeded by index & time) to avoid stacking
        // same-time danmu vertically. Falls back to cooldown check.
        const seed = nextIndexRef.current * 73 + Math.floor(item.time * 10);
        const randomLane = Math.abs(seed) % laneCount;

        // Check if the random lane has an active danmu or is in cooldown
        const hasActiveLane = activeRef.current.some(
          (a) => a.item.mode === 'scroll' && a.lane === randomLane
        );
        const latestInLane = activeRef.current
          .filter((a) => a.item.mode === 'scroll' && a.lane === randomLane)
          .reduce<number | null>(
            (max, a) => (max === null || a.startTime > max ? a.startTime : max),
            null
          );

        if (
          !hasActiveLane &&
          (latestInLane === null || currentTime - latestInLane >= laneCooldown)
        ) {
          lane = randomLane;
        } else {
          // Random lane occupied or in cooldown → find any available lane
          let found = -1;
          for (let i = 0; i < laneCount; i++) {
            const isOccupied = activeRef.current.some(
              (a) => a.item.mode === 'scroll' && a.lane === i
            );
            if (!isOccupied) {
              const latest = activeRef.current
                .filter((a) => a.item.mode === 'scroll' && a.lane === i)
                .reduce<number | null>(
                  (max, a) =>
                    max === null || a.startTime > max ? a.startTime : max,
                  null
                );
              if (latest === null || currentTime - latest >= laneCooldown) {
                found = i;
                break;
              }
            }
          }
          lane = found !== -1 ? found : randomLane;
        }
        topPx = paddingTop + lane * rowHeight;
        setActiveSync((prev) => [
          ...prev,
          { id, item, topPx, lane, startTime: currentTime },
        ]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime, sorted, config]);

  if (!sorted.length || !config.enabled) return null;

  const durationMs = Math.round(BASE_DURATION_MS / config.speedFactor);
  const playState = paused ? 'paused' : 'running';

  return (
    <div
      ref={containerRef}
      className='absolute inset-0 z-10 pointer-events-none overflow-hidden'
    >
      <style>{`
        @keyframes moontv-danmu-scroll {
          from { left: 100%; }
          to { left: -100%; }
        }
        @keyframes moontv-danmu-top {
          0%  { opacity: 0; transform: translate(-50%, 0); }
          8%  { opacity: 1; transform: translate(-50%, 0); }
          92% { opacity: 1; transform: translate(-50%, 0); }
          100%{ opacity: 0; transform: translate(-50%, 0); }
        }
      `}</style>

      {active.map(({ id, item, topPx }) => {
        const base: React.CSSProperties = {
          position: 'absolute',
          whiteSpace: 'nowrap',
          fontSize: `${config.fontSize}px`,
          fontWeight: 500,
          textShadow: '0 1px 4px rgba(0,0,0,0.85)',
          color: item.color,
          animationPlayState: playState,
        };

        if (item.mode === 'top') {
          return (
            <div
              key={id}
              onAnimationEnd={() =>
                setActiveSync((prev) => prev.filter((a) => a.id !== id))
              }
              style={{
                ...base,
                top: `${topPx}px`,
                left: '50%',
                animation: 'moontv-danmu-top 5s linear forwards',
                willChange: 'opacity, transform',
              }}
            >
              {item.text}
            </div>
          );
        }

        return (
          <div
            key={id}
            onAnimationEnd={() =>
              setActiveSync((prev) => prev.filter((a) => a.id !== id))
            }
            style={{
              ...base,
              top: `${topPx}px`,
              animation: `moontv-danmu-scroll ${durationMs}ms linear forwards`,
              willChange: 'left',
            }}
          >
            {item.text}
          </div>
        );
      })}
    </div>
  );
}
