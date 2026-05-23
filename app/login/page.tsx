import { Suspense } from 'react';
import LoginForm from '@/components/auth/LoginForm';

export default function LoginPage() {
  return (
    <section className="flex min-h-screen items-center justify-center px-4 py-12">
      <Suspense fallback={<div className="text-sm text-slate-400">로그인 화면을 준비하고 있습니다.</div>}>
        <LoginForm />
      </Suspense>
    </section>
  );
}
