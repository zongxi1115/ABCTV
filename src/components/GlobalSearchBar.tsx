'use client';

import { Search as SearchIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function GlobalSearchBar({
  className = '',
}: {
  className?: string;
}) {
  const pathname = usePathname();

  if (pathname.startsWith('/search')) return null;

  return (
    <Link
      href='/search'
      aria-label='打开搜索'
      className={`group flex items-center gap-2 rounded-xl border border-black/10 bg-white/70 px-3 py-2 text-sm text-slate-600 shadow-sm backdrop-blur-xl hover:bg-white hover:text-slate-900 hover:shadow-md transition-all dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white ${className}`}
    >
      <SearchIcon className='h-4 w-4 opacity-70 group-hover:opacity-100' />
      <span className='truncate'>搜索电影、电视剧…</span>
    </Link>
  );
}
