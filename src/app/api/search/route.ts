import { NextResponse } from 'next/server';

import { getCacheTime, getConfig } from '@/lib/config';
import { searchFromApi } from '@/lib/downstream';
import { yellowWords } from '@/lib/yellow';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('q') || '').trim();
  const stream = searchParams.get('stream') === '1';

  if (!query) {
    const cacheTime = await getCacheTime();
    return NextResponse.json(
      { results: [] },
      {
        headers: {
          'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
          'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        },
      }
    );
  }

  const config = await getConfig();
  const apiSites = config.SourceConfig.filter((site) => !site.disabled);
  const shouldFilterYellow = !config.SiteConfig.DisableYellowFilter;

  if (stream) {
    const encoder = new TextEncoder();
    let isClosed = false;
    let cancelCleanup: (() => void) | null = null;

    const sseStream = new ReadableStream<Uint8Array>({
      start(controller) {
        const localAbort = new AbortController();

        const safeClose = () => {
          if (isClosed) return;
          isClosed = true;
          controller.close();
        };

        const send = (event: string, data?: unknown) => {
          if (isClosed) return;
          const payload =
            data === undefined
              ? `event: ${event}\n\n`
              : `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        };

        const keepAlive = setInterval(() => {
          if (isClosed) return;
          controller.enqueue(encoder.encode(': ping\n\n'));
        }, 15000);

        const cleanup = () => {
          clearInterval(keepAlive);
          localAbort.abort();
        };
        cancelCleanup = cleanup;

        const onAbort = () => {
          try {
            send('abort');
          } finally {
            request.signal.removeEventListener('abort', onAbort);
            cleanup();
            safeClose();
          }
        };

        if (request.signal.aborted) {
          onAbort();
          return;
        }
        request.signal.addEventListener('abort', onAbort, { once: true });

        send('start', {
          query,
          sources: apiSites.map((s) => ({ key: s.key, name: s.name })),
        });

        const siteTasks = apiSites.map(async (site) => {
          const sourceKey = site.key;
          const sourceName = site.name;
          try {
            const results = await searchFromApi(site, query, {
              signal: localAbort.signal,
              onPage: (pageResults) => {
                let filtered = pageResults;
                if (shouldFilterYellow) {
                  filtered = pageResults.filter((result) => {
                    const typeName = result.type_name || '';
                    return !yellowWords.some((word: string) =>
                      typeName.includes(word)
                    );
                  });
                }
                if (filtered.length > 0) {
                  send('chunk', {
                    source: sourceKey,
                    source_name: sourceName,
                    results: filtered,
                  });
                }
              },
            });

            if (isClosed) return;
            send('siteDone', {
              source: sourceKey,
              count: shouldFilterYellow
                ? results.filter((result) => {
                    const typeName = result.type_name || '';
                    return !yellowWords.some((word: string) =>
                      typeName.includes(word)
                    );
                  }).length
                : results.length,
            });
          } catch (error) {
            send('siteError', { source: sourceKey });
          }
        });

        Promise.allSettled(siteTasks)
          .then(() => {
            send('done');
          })
          .catch(() => {
            send('error', { message: '搜索失败' });
          })
          .finally(() => {
            cleanup();
            safeClose();
          });
      },
      cancel() {
        // 尽最大努力中止下游请求
        isClosed = true;
        cancelCleanup?.();
      },
    });

    return new Response(sseStream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  }

  const searchPromises = apiSites.map((site) => searchFromApi(site, query));

  try {
    const results = await Promise.all(searchPromises);
    let flattenedResults = results.flat();
    if (shouldFilterYellow) {
      flattenedResults = flattenedResults.filter((result) => {
        const typeName = result.type_name || '';
        return !yellowWords.some((word: string) => typeName.includes(word));
      });
    }
    const cacheTime = await getCacheTime();

    return NextResponse.json(
      { results: flattenedResults },
      {
        headers: {
          'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
          'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        },
      }
    );
  } catch (error) {
    return NextResponse.json({ error: '搜索失败' }, { status: 500 });
  }
}
