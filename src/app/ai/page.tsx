import { Suspense } from 'react';

import AiPageClient from './AiPageClient';

export default function AiPage() {
  return (
    <Suspense
      fallback={
        <div className='px-4 sm:px-10 py-6 text-sm text-gray-500 dark:text-gray-400'>
          加载中…
        </div>
      }
    >
      <AiPageClient />
    </Suspense>
  );
}
