'use client';

import { Sparkles } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

type RuntimeConfig = {
  AGENT_ENABLED?: boolean;
};

function getRuntimeConfig(): RuntimeConfig | null {
  try {
    const w = window as unknown as { RUNTIME_CONFIG?: RuntimeConfig };
    return w.RUNTIME_CONFIG || null;
  } catch {
    return null;
  }
}

export default function AiEntryButton({
  className = '',
}: {
  className?: string;
}) {
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    setEnabled(Boolean(getRuntimeConfig()?.AGENT_ENABLED));
  }, []);

  if (pathname.startsWith('/ai')) return null;

  return (
    <Link
      href='/ai'
      title={enabled ? 'AI 找剧' : 'AI 找剧未开启'}
      aria-label='打开 AI 找剧'
      className={`group inline-flex items-center gap-2 rounded-xl border border-black/10 bg-green-600 px-3 py-2 text-sm text-white shadow-sm backdrop-blur-xl hover:bg-green-700 hover:shadow-md transition-all dark:border-white/10 ${
        enabled ? '' : 'opacity-70'
      } ${className}`}
    >
      <Sparkles className='h-4 w-4 opacity-90 group-hover:opacity-100' />
      <span className='hidden lg:inline'>AI找剧</span>
    </Link>
  );
}
