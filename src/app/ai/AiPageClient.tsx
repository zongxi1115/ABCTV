'use client';

import { Loader2, PlayCircle, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import PageLayout from '@/components/PageLayout';

type AgentItem = {
  title: string;
  href: string;
  year?: string;
  source_name?: string;
  reason?: string;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  items?: AgentItem[];
  raw?: string;
  isStreaming?: boolean;
};

type RuntimeConfig = {
  AGENT_ENABLED?: boolean;
};

function clamp(num: number, min: number, max: number) {
  return Math.min(max, Math.max(min, num));
}

function getRuntimeConfig(): RuntimeConfig | null {
  try {
    const w = window as unknown as { RUNTIME_CONFIG?: RuntimeConfig };
    return w.RUNTIME_CONFIG || null;
  } catch {
    return null;
  }
}

function getAgentEnabled(): boolean {
  return Boolean(getRuntimeConfig()?.AGENT_ENABLED);
}

function extractPartialReply(jsonString: string): string {
  try {
    const parsed = JSON.parse(jsonString);
    if (parsed && typeof parsed.reply === 'string') {
      return parsed.reply;
    }
  } catch {
    // ignore
  }

  const match = jsonString.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)/);
  if (match) {
    const rawContent = match[1];
    try {
      return JSON.parse(`"${rawContent}"`);
    } catch {
      return rawContent
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }
  }

  return '';
}

const StreamingText = ({ content }: { content: string }) => {
  const [chunks, setChunks] = useState<{ text: string; id: string }[]>([]);
  const prevContentRef = useRef('');

  useEffect(() => {
    if (content === prevContentRef.current) return;

    if (
      content.length > prevContentRef.current.length &&
      content.startsWith(prevContentRef.current)
    ) {
      const newText = content.slice(prevContentRef.current.length);
      setChunks((prev) => [
        ...prev,
        { text: newText, id: crypto.randomUUID() },
      ]);
    } else {
      setChunks([{ text: content, id: crypto.randomUUID() }]);
    }
    prevContentRef.current = content;
  }, [content]);

  return (
    <>
      {chunks.map((chunk) => (
        <span key={chunk.id} className='animate-fade-in'>
          {chunk.text}
        </span>
      ))}
    </>
  );
};

function DesktopHoverLink({
  item,
  scrollContainerRef,
}: {
  item: AgentItem;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const triggerRef = useRef<HTMLAnchorElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const update = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const left = clamp(rect.left + rect.width / 2, 16, vw - 16);
    const top = rect.top;
    setPos({ left, top });
  };

  useEffect(() => {
    if (!open) return;
    update();

    const onResize = () => update();
    const onWindowScroll = () => update();
    const onContainerScroll = () => update();

    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onWindowScroll, { passive: true });
    const sc = scrollContainerRef.current;
    sc?.addEventListener('scroll', onContainerScroll, { passive: true });

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onWindowScroll);
      sc?.removeEventListener('scroll', onContainerScroll);
    };
  }, [open, scrollContainerRef]);

  const card =
    open && pos && typeof document !== 'undefined'
      ? createPortal(
          <div
            className={`fixed z-[9999] pointer-events-none transition-all duration-200 ${
              open ? 'opacity-100 visible' : 'opacity-0 invisible'
            }`}
            style={{
              left: pos.left,
              top: pos.top - 8,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <div className='bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-black/10 dark:border-white/10 p-4 text-sm w-72'>
              <div className='flex items-center justify-between mb-2 gap-2'>
                <span className='font-bold text-gray-900 dark:text-gray-100 truncate'>
                  {item.title}
                </span>
                <span className='text-xs text-gray-500 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded shrink-0'>
                  {item.year}
                </span>
              </div>
              {item.reason && (
                <p className='text-gray-600 dark:text-gray-300 text-xs mb-3 leading-relaxed'>
                  {item.reason}
                </p>
              )}
              <div className='flex items-center justify-between pt-2 border-t border-black/5 dark:border-white/5'>
                <span className='text-xs text-gray-500'>
                  {item.source_name}
                </span>
              </div>
            </div>
            <div className='absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white dark:bg-gray-800 border-b border-r border-black/10 dark:border-white/10 rotate-45 transform'></div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <Link
        ref={triggerRef}
        href={item.href}
        onMouseEnter={() => {
          setOpen(true);
          update();
        }}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => {
          setOpen(true);
          update();
        }}
        onBlur={() => setOpen(false)}
        className='inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors p-1'
      >
        <PlayCircle className='w-4 h-4' />
        {item.title}
      </Link>
      {card}
    </>
  );
}

export default function AiPageClient() {
  const searchParams = useSearchParams();
  const initialQ = (searchParams.get('q') || '').trim();

  const [enabled, setEnabled] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    initialQ
      ? [
          {
            id: crypto.randomUUID(),
            role: 'user',
            content: `帮我找一部类似「${initialQ}」的剧/电影，给我 3-5 个备选并说明理由。`,
          },
        ]
      : []
  );
  const [draft, setDraft] = useState(initialQ);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setEnabled(getAgentEnabled());
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  const apiMessages = useMemo(
    () => messages.map((m) => ({ role: m.role, content: m.raw || m.content })),
    [messages]
  );

  const send = async () => {
    const content = draft.trim();
    if (!content || sending) return;

    setError(null);
    setSending(true);

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
    };
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      userMsg,
      {
        id: assistantId,
        role: 'assistant',
        content: '',
        items: [],
        isStreaming: true,
      },
    ]);
    setDraft('');

    try {
      const resp = await fetch('/api/agent/chat?stream=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...apiMessages, { role: 'user', content }],
        }),
      });

      if (!resp.ok) {
        const dataUnknown: unknown = await resp.json().catch(() => ({}));
        const data =
          dataUnknown && typeof dataUnknown === 'object'
            ? (dataUnknown as Record<string, unknown>)
            : ({} as Record<string, unknown>);
        const errText =
          (typeof data.error === 'string' && data.error) ||
          (typeof data.details === 'string' && data.details) ||
          `请求失败: ${resp.status}`;
        throw new Error(errText);
      }

      const reader = resp.body?.getReader();
      if (!reader) throw new Error('响应为空');

      const decoder = new TextDecoder();
      let buffer = '';
      let raw = '';

      const updateAssistant = (patch: Partial<ChatMessage>) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, ...patch } : m))
        );
      };

      const handleEvent = (event: string, dataText: string) => {
        if (event === 'delta') {
          const parsedReply = extractPartialReply(raw + dataText);
          raw += dataText;
          updateAssistant({ content: parsedReply || raw });
          return;
        }

        if (event === 'reset') {
          raw = '';
          updateAssistant({ content: '' });
          return;
        }

        if (event === 'final') {
          const parsedUnknown: unknown = (() => {
            try {
              return JSON.parse(dataText);
            } catch {
              return null;
            }
          })();
          const data =
            parsedUnknown && typeof parsedUnknown === 'object'
              ? (parsedUnknown as Record<string, unknown>)
              : null;

          const reply =
            data && typeof data.reply === 'string' ? data.reply : '';
          const items =
            data && Array.isArray(data.items)
              ? (data.items as AgentItem[])
              : [];
          const rawFinal = data && typeof data.raw === 'string' ? data.raw : '';
          updateAssistant({
            content: reply,
            items,
            raw: rawFinal,
            isStreaming: false,
          });
          return;
        }

        if (event === 'error') {
          const parsedUnknown: unknown = (() => {
            try {
              return JSON.parse(dataText);
            } catch {
              return null;
            }
          })();
          const data =
            parsedUnknown && typeof parsedUnknown === 'object'
              ? (parsedUnknown as Record<string, unknown>)
              : null;
          const errText =
            (data && typeof data.error === 'string' && data.error) ||
            (data && typeof data.details === 'string' && data.details) ||
            '请求失败';
          throw new Error(errText);
        }
      };

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        for (;;) {
          const idx = buffer.indexOf('\n\n');
          if (idx < 0) break;
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);

          const lines = chunk
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
            .filter((l) => !l.startsWith(':'));
          if (lines.length === 0) continue;

          let event = 'message';
          const dataLines: string[] = [];
          for (const line of lines) {
            if (line.startsWith('event:')) {
              event = line.slice('event:'.length).trim();
            } else if (line.startsWith('data:')) {
              dataLines.push(line.slice('data:'.length).trim());
            }
          }
          const dataText = dataLines.join('\n');
          if (event === 'done' || event === 'abort') return;
          if (!dataText && event !== 'start') continue;
          handleEvent(event, dataText);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '发送失败');
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setSending(false);
    }
  };

  return (
    <PageLayout activePath='/ai'>
      <div className='h-[calc(100vh-4rem)] flex flex-col px-4 sm:px-8 py-4'>
        <div className='max-w-5xl w-full mx-auto flex-1 flex flex-col min-h-0 space-y-4'>
          <div className='flex items-center gap-2 shrink-0'>
            <Sparkles className='h-5 w-5 text-green-600' />
            <h1 className='text-xl font-semibold text-gray-900 dark:text-gray-100'>
              AI 找剧
            </h1>
          </div>

          {!enabled && (
            <div className='shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-200'>
              当前未开启 AI 找剧。请在 `.env.local` 设置
              `ENABLE_AGENT=true`，或在后台新增的 “AI 找剧”栏目中启用。
            </div>
          )}

          <div className='flex-1 flex flex-col min-h-0 rounded-2xl border border-black/10 bg-white/70 backdrop-blur-xl shadow-sm dark:border-white/10 dark:bg-white/5'>
            <div
              ref={scrollContainerRef}
              className='flex-1 overflow-y-auto p-4 space-y-4'
            >
              {messages.length === 0 ? (
                <div className='text-sm text-gray-500 dark:text-gray-400'>
                  说说你想看什么类型、年代、国家/地区、节奏、是否偏喜剧/悬疑/恋爱等。
                  <div className='mt-2'>
                    <Link
                      href='/search'
                      className='text-green-700 hover:underline dark:text-green-400'
                    >
                      先去搜索页看看 →
                    </Link>
                  </div>
                </div>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-xl px-3 py-2 text-sm whitespace-pre-wrap break-words w-fit ${
                      m.role === 'user'
                        ? 'bg-green-600 text-white ml-auto max-w-[80%]'
                        : 'bg-black/5 text-gray-900 dark:bg-white/10 dark:text-gray-100 mr-auto max-w-[90%]'
                    }`}
                  >
                    <div>
                      {m.isStreaming ? (
                        <StreamingText content={m.content} />
                      ) : (
                        m.content
                      )}
                    </div>

                    {m.role === 'assistant' &&
                      Array.isArray(m.items) &&
                      m.items.length > 0 && (
                        <div className='mt-3'>
                          <div className='hidden md:flex flex-wrap gap-3'>
                            {m.items.map((it, idx) => (
                              <DesktopHoverLink
                                key={`desktop:${it.href}:${idx}`}
                                item={it}
                                scrollContainerRef={scrollContainerRef}
                              />
                            ))}
                          </div>

                          <div className='md:hidden flex flex-col gap-2'>
                            {m.items.map((it, idx) => (
                              <Link
                                key={`mobile:${it.href}:${idx}`}
                                href={it.href}
                                className='flex flex-col gap-1 p-3 rounded-xl bg-white/50 dark:bg-white/5 border border-black/5 dark:border-white/5 active:scale-[0.98] transition-transform'
                              >
                                <div className='flex items-center justify-between'>
                                  <div className='flex items-center gap-2 font-medium text-blue-600 dark:text-blue-400'>
                                    <PlayCircle className='w-4 h-4' />
                                    {it.title}
                                  </div>
                                  <span className='text-xs text-gray-500 bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded'>
                                    {it.year}
                                  </span>
                                </div>
                                {it.reason && (
                                  <p className='text-sm text-gray-700 dark:text-gray-300 mt-1'>
                                    {it.reason}
                                  </p>
                                )}
                                <div className='text-xs text-gray-400 mt-1 flex items-center justify-between'>
                                  <span>{it.source_name}</span>
                                  <span className='flex items-center gap-1'>
                                    打开观看 →
                                  </span>
                                </div>
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>
                ))
              )}
              <div ref={bottomRef} />
            </div>

            <div className='border-t border-black/10 dark:border-white/10 p-3'>
              {error && (
                <div className='mb-2 text-xs text-red-600 dark:text-red-400'>
                  {error}
                </div>
              )}
              <div className='flex items-end gap-2'>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  rows={2}
                  placeholder='描述一下你想看的类型/关键词…（Enter 发送，Shift+Enter 换行）'
                  className='flex-1 resize-none rounded-xl border border-black/10 bg-white/70 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-green-400 dark:border-white/10 dark:bg-white/5 dark:text-gray-100'
                />
                <button
                  type='button'
                  onClick={send}
                  disabled={sending}
                  className='inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed'
                >
                  {sending && <Loader2 className='h-4 w-4 animate-spin' />}
                  发送
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
