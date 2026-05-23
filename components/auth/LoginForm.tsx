'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Shield } from 'lucide-react';
import Button from '@/components/ui/Button';

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message || '로그인에 실패했습니다.');
      }

      const nextPath = searchParams.get('next') || '/';
      router.replace(nextPath.startsWith('/') && !nextPath.startsWith('//') ? nextPath : '/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-5 rounded-lg border border-[var(--border)] bg-white/[0.03] p-6 shadow-2xl">
      <div className="space-y-2 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
          <Shield className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold text-white">MTN 로그인</h1>
        <p className="text-sm text-slate-400">Mantori&apos;s Trading Navigator 접근 권한을 확인합니다.</p>
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-slate-300">아이디</span>
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-500"
          required
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-slate-300">비밀번호</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-500"
          required
        />
      </label>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </div>
      )}

      <Button type="submit" fullWidth disabled={isSubmitting}>
        {isSubmitting ? '확인 중...' : '로그인'}
      </Button>
    </form>
  );
}
