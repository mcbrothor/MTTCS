'use client';

import React, { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BarChart3, 
  ScanSearch, 
  Trophy, 
  ShieldAlert, 
  Activity, 
  History,
  Info
} from 'lucide-react';

const STEPS = [
  { 
    name: '시장 분석', 
    path: '/dashboard', 
    icon: BarChart3,
    desc: '시장 전체의 흐름과 기관 매도일(Distribution Day)을 확인하여 공격/수비 태세를 결정합니다.'
  },
  { 
    name: '종목 발굴', 
    path: '/scanner', // canslim 포함
    icon: ScanSearch,
    desc: '미너비니 VCP 및 오닐 CANSLIM 조건을 만족하는 주도주 후보군을 필터링합니다.'
  },
  { 
    name: '미인 대회', 
    path: '/contest', 
    icon: Trophy,
    desc: '필터링된 종목 중 가장 시각적으로 아름답고 탄력적인 차트를 가진 "최종 후보"를 선정합니다.'
  },
  { 
    name: '계획 수립', 
    path: '/plan', 
    icon: ShieldAlert,
    desc: '선정된 종목의 피벗 타점과 손절선을 정의하고, 원칙(체크리스트) 준수 여부를 최종 검증합니다.'
  },
  { 
    name: '실행/관리', 
    path: '/portfolio', 
    icon: Activity,
    desc: '실제 체결된 포지션의 리스크 노출도를 실시간으로 모니터링하고 피라미딩/부분 익절을 관리합니다.'
  },
  { 
    name: '매매 복기', 
    path: '/history', 
    icon: History,
    desc: '종료된 매매의 일지를 작성하고, "테니스공"이었는지 "계란"이었는지 분석하여 원칙을 개선합니다.'
  },
];

export default function AppStepper() {
  const pathname = usePathname();
  const MotionDiv = motion.div as any;
  
  const currentIdx = useMemo(() => {
    if (pathname === '/' || pathname === '/dashboard') return 0;
    if (pathname.includes('/scanner') || pathname.includes('/canslim')) return 1;
    if (pathname.includes('/contest')) return 2;
    if (pathname.includes('/plan')) return 3;
    if (pathname.includes('/portfolio')) return 4;
    if (pathname.includes('/history')) return 5;
    return -1;
  }, [pathname]);

  const currentStep = STEPS[currentIdx];

  return (
    <div className="w-full bg-slate-950/80 border-b border-slate-800/50 backdrop-blur-xl sticky top-0 z-[60] shadow-2xl shadow-slate-950/50">
      <div className="max-w-6xl mx-auto px-6 py-4">
        {/* Step Icons & Progress Line */}
        <div className="flex items-center justify-between mb-2">
          {STEPS.map((step, idx) => {
            const isActive = idx === currentIdx;
            const isCompleted = idx < currentIdx;
            const Icon = step.icon;

            return (
              <React.Fragment key={step.name}>
                <div className="flex flex-col items-center gap-1.5 group relative">
                  <div 
                    className={`
                      relative flex h-10 w-10 items-center justify-center rounded-xl border-2 transition-all duration-500
                      ${isActive ? 'border-rose-500 bg-rose-500/10 text-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.4)] scale-110 z-10' : 
                        isCompleted ? 'border-emerald-500 bg-emerald-500/10 text-emerald-500' : 
                        'border-slate-800 bg-slate-900 text-slate-500 group-hover:border-slate-700'}
                    `}
                  >
                    <Icon className={`h-5 w-5 ${isActive ? 'animate-pulse' : ''}`} />
                    {isCompleted && (
                      <MotionDiv 
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] text-white font-bold"
                      >
                        ✓
                      </MotionDiv>
                    )}
                  </div>
                  <span className={`text-[10px] font-black uppercase tracking-tighter transition-colors ${isActive ? 'text-rose-400' : isCompleted ? 'text-emerald-400' : 'text-slate-600'}`}>
                    {step.name}
                  </span>
                </div>
                
                {/* Connector Line */}
                {idx < STEPS.length - 1 && (
                  <div className="flex-1 h-[1.5px] mx-4 bg-slate-800/50 relative overflow-hidden">
                    <div 
                      className={`absolute inset-0 bg-emerald-500/60 transition-all duration-1000 ${isCompleted ? 'translate-x-0' : '-translate-x-full'}`}
                    />
                    {isActive && (
                      <motion.div 
                        animate={{ x: ['-100%', '100%'] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        className="absolute inset-0 bg-gradient-to-r from-transparent via-rose-500/50 to-transparent"
                      />
                    )}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Context Guide (Phase 2) */}
        <AnimatePresence mode="wait">
          {currentStep && (
            <MotionDiv
              key={currentStep.name}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="mt-3 flex items-center gap-3 rounded-xl bg-slate-900/40 border border-slate-800/50 px-4 py-2.5"
            >
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-500/20 text-rose-400">
                <Info className="h-3 w-3" />
              </div>
              <p className="text-[11px] leading-relaxed text-slate-400 font-medium tracking-tight">
                <strong className="text-slate-200 mr-2">{currentStep.name}:</strong>
                {currentStep.desc}
              </p>
            </MotionDiv>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
