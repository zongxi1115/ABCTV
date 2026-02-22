/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import styles from './ring.module.css';

import { checkForUpdates, CURRENT_VERSION, UpdateStatus } from '@/lib/version';

import { useSite } from '@/components/SiteProvider';
import { ThemeToggle } from '@/components/ThemeToggle';

// 版本显示组件
function VersionDisplay() {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const status = await checkForUpdates();
        setUpdateStatus(status);
      } catch (_) {
        // do nothing
      } finally {
        setIsChecking(false);
      }
    };

    checkUpdate();
  }, []);

  return (
    <button
      onClick={() =>
        window.open('https://github.com/zongxi1115/ABCTV', '_blank')
      }
      className='absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 transition-colors cursor-pointer'
    >
      <span className='font-mono'>v{CURRENT_VERSION}</span>
      {!isChecking && updateStatus !== UpdateStatus.FETCH_FAILED && (
        <div
          className={`flex items-center gap-1.5 ${
            updateStatus === UpdateStatus.HAS_UPDATE
              ? 'text-yellow-600 dark:text-yellow-400'
              : updateStatus === UpdateStatus.NO_UPDATE
              ? 'text-green-600 dark:text-green-400'
              : ''
          }`}
        >
          {updateStatus === UpdateStatus.HAS_UPDATE && (
            <>
              <AlertCircle className='w-3.5 h-3.5' />
              <span className='font-semibold text-xs'>有新版本</span>
            </>
          )}
          {updateStatus === UpdateStatus.NO_UPDATE && (
            <>
              <CheckCircle className='w-3.5 h-3.5' />
              <span className='font-semibold text-xs'>已是最新</span>
            </>
          )}
        </div>
      )}
    </button>
  );
}

function LoginPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<
    'idle' | 'loggingIn' | 'registering' | 'redirecting'
  >('idle');
  const [shouldAskUsername, setShouldAskUsername] = useState(false);
  const [enableRegister, setEnableRegister] = useState(false);
  const { siteName } = useSite();
  const [showPassword, setShowPassword] = useState(false);
  const brandName = 'zongxi TV';

  // 在客户端挂载后设置配置
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storageType = (window as any).RUNTIME_CONFIG?.STORAGE_TYPE;
      setShouldAskUsername(storageType && storageType !== 'localstorage');
      setEnableRegister(
        Boolean((window as any).RUNTIME_CONFIG?.ENABLE_REGISTER)
      );
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!password || (shouldAskUsername && !username)) return;

    setSubmitState('loggingIn');
    let finished = false;
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          ...(shouldAskUsername ? { username } : {}),
        }),
      });

      if (res.ok) {
        setSubmitState('redirecting');
        const redirect = searchParams.get('redirect') || '/';
        router.replace(redirect);
        finished = true;
        return;
      } else if (res.status === 401) {
        setError('密码错误');
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '服务器错误');
      }
    } catch (error) {
      setError('网络错误，请稍后重试');
    } finally {
      if (!finished) setSubmitState('idle');
    }
  };

  // 处理注册逻辑
  const handleRegister = async () => {
    setError(null);
    if (!password || !username) return;

    setSubmitState('registering');
    let finished = false;
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        setSubmitState('redirecting');
        const redirect = searchParams.get('redirect') || '/';
        router.replace(redirect);
        finished = true;
        return;
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '服务器错误');
      }
    } catch (error) {
      setError('网络错误，请稍后重试');
    } finally {
      if (!finished) setSubmitState('idle');
    }
  };

  const submitLabel =
    submitState === 'loggingIn'
      ? '正在登录…'
      : submitState === 'redirecting'
      ? '正在跳转…'
      : '登录';
  const isBusy = submitState !== 'idle';

  return (
    <div className={styles.page}>
      <div className={styles.bgGlow} />

      <div className='absolute top-4 right-4 z-20'>
        <ThemeToggle />
      </div>

      <div className={styles.ring}>
        <i style={{ ['--clr' as any]: '#00ff0a' }} />
        <i style={{ ['--clr' as any]: '#ff0057' }} />
        <i style={{ ['--clr' as any]: '#fffd44' }} />

        <div className={styles.login}>
          <div className={styles.brand}>
            <h2 className={styles.brandTitle}>登录</h2>
            <div className={styles.brandSub}>
              {brandName} · {siteName}
            </div>
          </div>

          <form onSubmit={handleSubmit} className='w-full' autoComplete='on'>
            <div className='flex flex-col gap-3'>
              {shouldAskUsername && (
                <div className={styles.inputBx}>
                  <input
                    type='text'
                    placeholder='用户名'
                    autoComplete='username'
                    className={styles.input}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={isBusy}
                  />
                </div>
              )}

              <div className={styles.inputBx}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder='访问密码'
                  autoComplete='current-password'
                  className={styles.input}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isBusy}
                />
                <button
                  type='button'
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  className={styles.togglePw}
                  disabled={isBusy}
                >
                  {showPassword ? (
                    <EyeOff className='w-4 h-4' />
                  ) : (
                    <Eye className='w-4 h-4' />
                  )}
                </button>
              </div>

              {error && <div className={styles.error}>{error}</div>}

              <button
                type='submit'
                disabled={
                  !password || isBusy || (shouldAskUsername && !username)
                }
                className={styles.submit}
              >
                {submitLabel}
              </button>
            </div>
          </form>

          <div className={styles.links}>
            <a
              href='#'
              className={styles.link}
              aria-disabled={isBusy}
              onClick={(e) => {
                e.preventDefault();
                if (isBusy) return;
                setError('暂不支持找回密码，请联系管理员');
              }}
            >
              忘记密码
            </a>

            {shouldAskUsername && enableRegister ? (
              <a
                href='#'
                className={styles.link}
                aria-disabled={isBusy}
                onClick={(e) => {
                  e.preventDefault();
                  if (isBusy) return;
                  handleRegister();
                }}
              >
                {submitState === 'registering'
                  ? '注册中…'
                  : submitState === 'redirecting'
                  ? '正在跳转…'
                  : '注册'}
              </a>
            ) : (
              <a
                href='/'
                className={styles.link}
                onClick={() => setError(null)}
              >
                返回首页
              </a>
            )}
          </div>
        </div>
      </div>

      {/* 版本信息显示 */}
      <VersionDisplay />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginPageClient />
    </Suspense>
  );
}
