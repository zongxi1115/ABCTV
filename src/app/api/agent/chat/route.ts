/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { API_CONFIG, ApiSite, getConfig } from '@/lib/config';
import { SearchResult } from '@/lib/types';
import { yellowWords } from '@/lib/yellow';

export const runtime = 'nodejs';

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(8000),
});

const requestSchema = z.object({
  messages: z.array(messageSchema).min(1).max(30),
});

type OpenAIChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content?: string | null; tool_calls?: any[] }
  | { role: 'tool'; tool_call_id: string; content: string };

type AgentItem = {
  title: string;
  href: string;
  year?: string;
  source_name?: string;
  reason?: string;
};

function normalizeBaseUrl(raw: string): string {
  const base = raw.trim().replace(/\/+$/, '');
  if (!base) return '';
  return base.endsWith('/v1') ? base : `${base}/v1`;
}

function buildSearchHref(item: Pick<SearchResult, 'title'>) {
  const params = new URLSearchParams({
    q: item.title,
  });
  return `/search?${params.toString()}`;
}

function sanitizeAgentItems(items: unknown): AgentItem[] {
  if (!Array.isArray(items)) return [];
  const result: AgentItem[] = [];
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const rec = it as Record<string, unknown>;
    const title = typeof rec.title === 'string' ? rec.title.trim() : '';
    if (!title) continue;
    const href = `/search?${new URLSearchParams({ q: title }).toString()}`;
    result.push({
      title,
      href,
      year: typeof rec.year === 'string' ? rec.year : undefined,
      source_name:
        typeof rec.source_name === 'string' ? rec.source_name : undefined,
      reason: typeof rec.reason === 'string' ? rec.reason : undefined,
    });
    if (result.length >= 20) break;
  }
  return result;
}

async function localSearchOnce(query: string, limit: number) {
  const config = await getConfig();
  const enabledSites = (config.SourceConfig || [])
    .filter((s) => !s.disabled)
    .slice(0, 4)
    .map((s) => ({
      key: s.key,
      name: s.name,
      api: s.api,
      detail: s.detail,
    })) as ApiSite[];

  const shouldFilterYellow = !config.SiteConfig.DisableYellowFilter;

  const fetchFirstPage = async (site: ApiSite): Promise<SearchResult[]> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const apiUrl =
        site.api + API_CONFIG.search.path + encodeURIComponent(query);
      const resp = await fetch(apiUrl, {
        headers: API_CONFIG.search.headers,
        signal: controller.signal,
      });
      if (!resp.ok) return [];
      const data = (await resp.json()) as any;
      if (!data?.list || !Array.isArray(data.list) || data.list.length === 0)
        return [];
      return data.list.map((item: any) => ({
        id: String(item.vod_id ?? ''),
        title: String(item.vod_name || '')
          .trim()
          .replace(/\s+/g, ' '),
        poster: String(item.vod_pic || ''),
        episodes: [],
        source: site.key,
        source_name: site.name,
        class: item.vod_class,
        year: item.vod_year
          ? String(item.vod_year).match(/\d{4}/)?.[0] || ''
          : 'unknown',
        desc: '',
        type_name: item.type_name,
        douban_id: item.vod_douban_id,
      })) as SearchResult[];
    } catch {
      return [];
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const tasks = enabledSites.map((site) => fetchFirstPage(site));

  const all = (await Promise.all(tasks)).flat();
  let filtered = all;
  if (shouldFilterYellow) {
    filtered = all.filter((result) => {
      const typeName = result.type_name || '';
      return !yellowWords.some((word: string) => typeName.includes(word));
    });
  }

  const seen = new Set<string>();
  const items = [];
  for (const result of filtered) {
    const key = `${result.title}@@${result.year}@@${result.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      id: result.id,
      source: result.source,
      source_name: result.source_name,
      title: result.title,
      year: result.year,
      episodesCount: Array.isArray(result.episodes)
        ? result.episodes.length
        : 0,
      href: buildSearchHref(result),
    });
    if (items.length >= limit) break;
  }

  return { query, results: items };
}

async function callChatCompletions(args: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: OpenAIChatMessage[];
  tools?: any[];
  tool_choice?: any;
}) {
  const url = `${normalizeBaseUrl(args.baseUrl)}/chat/completions`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (args.apiKey) {
    headers.Authorization = `Bearer ${args.apiKey}`;
    headers['api-key'] = args.apiKey;
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: args.model,
      messages: args.messages,
      temperature: 0.2,
      tools: args.tools,
      tool_choice: args.tool_choice,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`AI 请求失败: ${resp.status} ${text}`.slice(0, 300));
  }
  return (await resp.json()) as any;
}

function extractJsonObject(text: string): any | null {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;

  // ```json ... ```
  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      // fall through
    }
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {
      return null;
    }
  }
  return null;
}

async function streamChatCompletions(args: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: OpenAIChatMessage[];
  tools?: any[];
  tool_choice?: any;
  onDelta?: (text: string) => void;
  onToolCallDelta?: () => void;
}) {
  const url = `${normalizeBaseUrl(args.baseUrl)}/chat/completions`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (args.apiKey) {
    headers.Authorization = `Bearer ${args.apiKey}`;
    headers['api-key'] = args.apiKey;
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: args.model,
      messages: args.messages,
      temperature: 0.2,
      tools: args.tools,
      tool_choice: args.tool_choice,
      stream: true,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`AI 请求失败: ${resp.status} ${text}`.slice(0, 300));
  }

  const reader = resp.body?.getReader();
  if (!reader) throw new Error('AI 响应为空');

  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';

  const toolCalls: Array<{
    id?: string;
    function?: { name?: string; arguments?: string };
  }> = [];

  const mergeToolCalls = (deltas: any[]) => {
    for (const d of deltas) {
      const idx = Number(d?.index ?? 0);
      if (!toolCalls[idx]) toolCalls[idx] = {};
      const current = toolCalls[idx];
      if (typeof d?.id === 'string') current.id = d.id;
      if (d?.function) {
        if (!current.function) current.function = {};
        if (typeof d.function.name === 'string')
          current.function.name = d.function.name;
        if (typeof d.function.arguments === 'string') {
          current.function.arguments =
            (current.function.arguments || '') + d.function.arguments;
        }
      }
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice('data:'.length).trim();
      if (!payload) continue;
      if (payload === '[DONE]') {
        buffer = '';
        break;
      }

      let obj: any;
      try {
        obj = JSON.parse(payload);
      } catch {
        continue;
      }

      const delta = obj?.choices?.[0]?.delta;
      const deltaText = typeof delta?.content === 'string' ? delta.content : '';
      if (deltaText) {
        content += deltaText;
        args.onDelta?.(deltaText);
      }
      const deltaToolCalls = Array.isArray(delta?.tool_calls)
        ? delta.tool_calls
        : [];
      if (deltaToolCalls.length > 0) {
        args.onToolCallDelta?.();
        mergeToolCalls(deltaToolCalls);
      }
    }
  }

  return { content, toolCalls };
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const stream = searchParams.get('stream') === '1';

  if (stream) {
    const encoder = new TextEncoder();
    let isClosed = false;

    const sseStream = new ReadableStream<Uint8Array>({
      async start(controller) {
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

        const cleanup = () => clearInterval(keepAlive);

        const safeClose = () => {
          if (isClosed) return;
          isClosed = true;
          cleanup();
          controller.close();
        };

        const onAbort = () => {
          send('abort');
          safeClose();
        };

        if (request.signal.aborted) {
          onAbort();
          return;
        }
        request.signal.addEventListener('abort', onAbort, { once: true });

        try {
          const body = requestSchema.parse(await request.json());

          const config = await getConfig();
          const agent = config.AgentConfig;
          const enabled = Boolean(agent?.Enabled);
          if (!enabled) {
            send('error', { error: 'AI 找剧未开启（ENABLE_AGENT=false）' });
            safeClose();
            return;
          }

          const baseUrl = String(agent?.BaseUrl || '').trim();
          const apiKey = String(agent?.ApiKey || '').trim();
          const model = String(agent?.ModelName || '').trim();
          const allowSearch = Boolean(agent?.AllowSearch);

          if (!baseUrl || !apiKey || !model) {
            send('error', {
              error:
                'AI 配置不完整，请在 .env.local 或后台配置 AI_BASE_URL/AI_API_KEY/AI_MODEL_NAME',
            });
            safeClose();
            return;
          }

          const systemPrompt = [
            '你是 zongxiTV 的“AI找剧”助手。',
            '你不能进行联网搜索，也不能编造不存在的影片信息。',
            allowSearch
              ? '你可以使用一次工具 search_shows 来查询站内影视聚合搜索结果（最多仅允许调用一次）。'
              : '你不能调用任何搜索工具，只能基于用户提供的信息回答。',
            '',
            '输出必须是严格 JSON（不要 Markdown），格式如下（必须先输出 reply，再输出 items）：',
            '{ "reply": string, "items": [{ "title": string, "href": string, "year": string, "source_name": string, "reason": string }] }',
            '要求：items 里的 href 必须指向站内搜索页（/search?q=片名），并且必须提供 reason（推荐理由）。',
          ].join('\n');

          const messages: OpenAIChatMessage[] = [
            { role: 'system', content: systemPrompt },
            ...body.messages.map((m) => ({ role: m.role, content: m.content })),
          ];

          const tools = allowSearch
            ? [
                {
                  type: 'function',
                  function: {
                    name: 'search_shows',
                    description:
                      '在 zongxiTV 的聚合源内搜索影视条目（不是联网搜索引擎）。最多调用一次。',
                    parameters: {
                      type: 'object',
                      properties: {
                        query: { type: 'string', description: '搜索关键词' },
                        limit: {
                          type: 'number',
                          description: '返回数量（1~20）',
                        },
                      },
                      required: ['query'],
                    },
                  },
                },
              ]
            : undefined;

          let sawToolCall = false;
          let buffered = '';

          send('start');

          const first = await streamChatCompletions({
            baseUrl,
            apiKey,
            model,
            messages,
            tools,
            onDelta: (t) => {
              if (sawToolCall) return;
              buffered += t;
              send('delta', { text: t });
            },
            onToolCallDelta: () => {
              if (sawToolCall) return;
              sawToolCall = true;
              buffered = '';
              send('reset', { reason: 'tool_call' });
            },
          });

          const toolCalls = (first.toolCalls || []).filter(Boolean);
          let finalContent = first.content || buffered;

          if (toolCalls.length > 0) {
            if (!allowSearch) {
              send('error', {
                error: 'AI 不允许调用搜索工具（AI_ALLOW_SEARCH=false）',
              });
              safeClose();
              return;
            }
            if (toolCalls.length !== 1) {
              send('error', { error: '最多仅允许一次搜索调用' });
              safeClose();
              return;
            }

            const call = toolCalls[0] as any;
            const fnName = call?.function?.name;
            if (fnName !== 'search_shows') {
              send('error', {
                error: `不支持的工具调用: ${String(fnName || '')}`,
              });
              safeClose();
              return;
            }

            let args: any = {};
            try {
              args = JSON.parse(String(call?.function?.arguments || '{}'));
            } catch {
              args = {};
            }
            const query = String(args?.query || '').trim();
            const limit = Math.max(1, Math.min(20, Number(args?.limit || 12)));
            if (!query) {
              send('error', { error: '搜索关键词不能为空' });
              safeClose();
              return;
            }

            send('status', { stage: 'search', query });
            const toolResult = await localSearchOnce(query, limit);

            const secondMessages: OpenAIChatMessage[] = [
              ...messages,
              {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: String(call?.id || ''),
                    type: 'function',
                    function: {
                      name: 'search_shows',
                      arguments: String(call?.function?.arguments || ''),
                    },
                  },
                ],
              },
              {
                role: 'tool',
                tool_call_id: String(call?.id || ''),
                content: JSON.stringify(toolResult),
              },
              {
                role: 'system',
                content:
                  '你已经使用过一次 search_shows 工具，后续不得再次调用工具。请直接按 JSON 格式输出最终答案。',
              },
            ];

            const second = await streamChatCompletions({
              baseUrl,
              apiKey,
              model,
              messages: secondMessages,
              tools,
              tool_choice: 'none',
              onDelta: (t) => {
                finalContent += t;
                send('delta', { text: t });
              },
            });

            if ((second.toolCalls || []).filter(Boolean).length > 0) {
              send('error', { error: '最多仅允许一次搜索调用' });
              safeClose();
              return;
            }
            finalContent = second.content;
          }

          const parsed = extractJsonObject(finalContent);
          const reply =
            typeof parsed?.reply === 'string'
              ? parsed.reply
              : finalContent || '';
          const items = sanitizeAgentItems(parsed?.items);

          send('final', { reply, items, raw: finalContent });
          send('done');
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Unknown error';
          send('error', { error: '请求失败', details: msg });
        } finally {
          safeClose();
        }
      },
      cancel() {
        isClosed = true;
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

  try {
    const body = requestSchema.parse(await request.json());

    const config = await getConfig();
    const agent = config.AgentConfig;
    const enabled = Boolean(agent?.Enabled);
    if (!enabled) {
      return NextResponse.json(
        { error: 'AI 找剧未开启（ENABLE_AGENT=false）' },
        { status: 403 }
      );
    }

    const baseUrl = String(agent?.BaseUrl || '').trim();
    const apiKey = String(agent?.ApiKey || '').trim();
    const model = String(agent?.ModelName || '').trim();
    const allowSearch = Boolean(agent?.AllowSearch);

    if (!baseUrl || !apiKey || !model) {
      return NextResponse.json(
        {
          error:
            'AI 配置不完整，请在 .env.local 或后台配置 AI_BASE_URL/AI_API_KEY/AI_MODEL_NAME',
        },
        { status: 400 }
      );
    }

    const systemPrompt = [
      '你是 zongxiTV 的“AI找剧”助手。',
      '你不能进行联网搜索，也不能编造不存在的影片信息。',
      allowSearch
        ? '你可以使用一次工具 search_shows 来查询站内影视聚合搜索结果（最多仅允许调用一次）。'
        : '你不能调用任何搜索工具，只能基于用户提供的信息回答。',
      '',
      '输出必须是严格 JSON（不要 Markdown），格式如下（必须先输出 reply，再输出 items）：',
      '{ "reply": string, "items": [{ "title": string, "href": string, "year": string, "source_name": string, "reason": string }] }',
      '要求：推荐的剧名必须放在 items 数组里，前端会把 title 渲染成可点击链接（href），并且必须提供 reason（推荐理由）。',
      '如果无法给出推荐，items 为空数组，并在 reply 里说明原因与建议用户如何描述需求。',
    ].join('\n');

    const messages: OpenAIChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...body.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const tools = allowSearch
      ? [
          {
            type: 'function',
            function: {
              name: 'search_shows',
              description:
                '在 zongxiTV 的聚合源内搜索影视条目（不是联网搜索引擎）。最多调用一次。',
              parameters: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: '搜索关键词' },
                  limit: {
                    type: 'number',
                    description: '返回数量（1~20）',
                  },
                },
                required: ['query'],
              },
            },
          },
        ]
      : undefined;

    const first = await callChatCompletions({
      baseUrl,
      apiKey,
      model,
      messages,
      tools,
    });

    const firstMsg = first?.choices?.[0]?.message;
    const toolCalls = Array.isArray(firstMsg?.tool_calls)
      ? firstMsg.tool_calls
      : [];

    let finalContent: string = String(firstMsg?.content || '').trim();

    if (toolCalls.length > 0) {
      if (!allowSearch) {
        return NextResponse.json(
          { error: 'AI 不允许调用搜索工具（AI_ALLOW_SEARCH=false）' },
          { status: 400 }
        );
      }
      if (toolCalls.length !== 1) {
        return NextResponse.json(
          { error: '最多仅允许一次搜索调用' },
          { status: 400 }
        );
      }

      const call = toolCalls[0];
      const fnName = call?.function?.name;
      if (fnName !== 'search_shows') {
        return NextResponse.json(
          { error: `不支持的工具调用: ${String(fnName || '')}` },
          { status: 400 }
        );
      }

      let args: any = {};
      try {
        args = JSON.parse(String(call?.function?.arguments || '{}'));
      } catch {
        args = {};
      }
      const query = String(args?.query || '').trim();
      const limit = Math.max(1, Math.min(20, Number(args?.limit || 12)));
      if (!query) {
        return NextResponse.json(
          { error: '搜索关键词不能为空' },
          { status: 400 }
        );
      }

      const toolResult = await localSearchOnce(query, limit);

      const secondMessages: OpenAIChatMessage[] = [
        ...messages,
        {
          role: 'assistant',
          content: firstMsg?.content ?? null,
          tool_calls: toolCalls,
        },
        {
          role: 'tool',
          tool_call_id: String(call?.id || ''),
          content: JSON.stringify(toolResult),
        },
        {
          role: 'system',
          content:
            '你已经使用过一次 search_shows 工具，后续不得再次调用工具。请直接按 JSON 格式输出最终答案。',
        },
      ];

      const second = await callChatCompletions({
        baseUrl,
        apiKey,
        model,
        messages: secondMessages,
        tools,
        tool_choice: 'none',
      });

      const secondMsg = second?.choices?.[0]?.message;
      if (Array.isArray(secondMsg?.tool_calls) && secondMsg.tool_calls.length) {
        return NextResponse.json(
          { error: '最多仅允许一次搜索调用' },
          { status: 400 }
        );
      }
      finalContent = String(secondMsg?.content || '').trim();
    }

    const parsed = extractJsonObject(finalContent);
    const reply =
      typeof parsed?.reply === 'string' ? parsed.reply : finalContent || '';
    const items = sanitizeAgentItems(parsed?.items);

    return NextResponse.json(
      {
        reply,
        items,
        raw: finalContent,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: '请求失败', details: msg },
      { status: 500 }
    );
  }
}
