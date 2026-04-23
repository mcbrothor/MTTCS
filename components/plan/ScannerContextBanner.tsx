'use client';

import { TrendingUp } from 'lucide-react';
import Link from 'next/link';

/**
 * 스캐너에서 계획서로 넘어올 때 표시되는 정보 배너.
 * URL searchParams에서 스캐너 데이터를 읽어 계획 수립에 참고하도록 보여준다.
 *
 * 왜 별도 컴포넌트로 분리했나:
 * - plan/page.tsx는 Suspense 내부에서 useSearchParams를 써야 하는 구조
 * - 스캐너 데이터 표시 로직을 page.tsx에 인라인으로 넣으면 가독성이 떨어짐
 */

interface ScannerContextBannerProps {
  ticker: string;
  pivot: string | null;
  entry: string | null;
  rs: string | null;
  vcpScore: string | null;
  vcpGrade: string | null;
  rsNewHigh: string | null;
  pivotDist: string | null;
}

export default function ScannerContextBanner({
  pivot, entry, rs, vcpScore, vcpGrade, rsNewHigh, pivotDist,
}: ScannerContextBannerProps) {
  // 스캐너 데이터가 하나도 없으면 배너를 렌더링하지 않음
  if (!pivot && !rs && !vcpScore) return null;

  const gradeLabel: Record<string, string> = {
    strong: '강한 형성',
    forming: '형성 중',
    weak: '약함',
    none: '없음',
  };

  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-emerald-400">
          <TrendingUp className="h-4 w-4 shrink-0" />
          <p className="text-xs font-bold uppercase tracking-wide">스캐너에서 가져온 데이터</p>
        </div>
        <Link
          href="/scanner"
          className="shrink-0 text-[10px] text-slate-500 underline hover:text-slate-300"
        >
          스캐너로 돌아가기
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
        {pivot && (
          <DataItem label="피벗가" value={Number(pivot).toLocaleString()} />
        )}
        {entry && (
          <DataItem label="권장 진입가" value={Number(entry).toLocaleString()} />
        )}
        {pivotDist && (
          <DataItem
            label="피벗 이격"
            value={`${Number(pivotDist) > 0 ? '+' : ''}${pivotDist}%`}
            highlight={Math.abs(Number(pivotDist)) <= 3}
          />
        )}
        {rs && (
          <DataItem
            label="RS Rating"
            value={rs}
            highlight={Number(rs) >= 85}
          />
        )}
        {vcpScore && (
          <DataItem
            label="VCP 점수"
            value={`${vcpScore}${vcpGrade ? ` (${gradeLabel[vcpGrade] ?? vcpGrade})` : ''}`}
            highlight={Number(vcpScore) >= 70}
          />
        )}
        {rsNewHigh === '1' && (
          <DataItem label="RS Line" value="✦ 신고가" highlight />
        )}
      </div>

      <p className="mt-3 text-[11px] text-slate-500">
        위 데이터는 스캐너 분석 기준입니다. 아래 분석 실행 시 최신 시장 데이터로 다시 계산됩니다.
      </p>
    </div>
  );
}

function DataItem({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-0.5 font-mono text-sm font-bold ${highlight ? 'text-emerald-400' : 'text-slate-200'}`}>
        {value}
      </p>
    </div>
  );
}
