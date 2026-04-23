'use client';

import React from 'react';

const breakdown = [
  { label: 'SPY 추세', score: 20, weight: 25, desc: '50일선 상회' },
  { label: 'HYG/IEF 크레딧', score: 18, weight: 20, desc: 'Risk-ON' },
  { label: 'VIX 레벨', score: 14, weight: 15, desc: '16.4 정상' },
  { label: '달러·금리', score: 10, weight: 15, desc: '중립' },
  { label: '구리/금', score: 9, weight: 12, desc: '구리 소폭 우위' },
  { label: '시장 폭', score: 11, weight: 13, desc: '균형 상승' },
];

const assets = [
  { sym: 'SPY', price: '$521.4', chg: '+0.82%', up: true, desc: 'S&P 500이 50일선 상회' },
  { sym: 'QQQ', price: '$446.2', chg: '+1.24%', up: true, desc: '기술주 강세 지속' },
  { sym: 'HYG', price: '$79.2', chg: '+0.31%', up: true, desc: 'Risk-ON 신호' },
  { sym: 'IEF', price: '$95.1', chg: '-0.18%', up: false, desc: '안전채권 약세' },
  { sym: 'TLT', price: '$88.4', chg: '-0.42%', up: false, desc: '장기국채 하락' },
  { sym: 'GLD', price: '$315.0', chg: '+0.55%', up: true, desc: '금 소폭 상승' },
  { sym: 'VIX', price: '16.4', chg: '-4.2%', up: false, desc: '공포지수 완화' },
  { sym: 'BTC', price: '$94,821', chg: '+1.4%', up: true, desc: '위험선호 확대' },
];

const ratios = [
  { label: 'QQQ/SPY', sub: '기술주 쏠림', detail: 'QQQ +1.24% vs SPY +0.82%', desc: '빅테크 주도 장세', color: 'text-emerald-500', border: 'border-emerald-500/20' },
  { label: 'IWM/SPY', sub: '중소형 순환매', detail: 'IWM +0.41% vs SPY +0.82%', desc: '대형주 집중, 소형주 약세', color: 'text-amber-500', border: 'border-amber-500/20' },
  { label: 'HYG/IEF', sub: '신용 스프레드', detail: 'HYG +0.31% vs IEF -0.18%', desc: 'Risk-ON 확연', color: 'text-emerald-500', border: 'border-emerald-500/20' },
];

export default function MacroView() {
  const score = breakdown.reduce((a, b) => a + b.score, 0);

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* Left: Macro Regime Score */}
      <div className="flex flex-col gap-6 lg:w-[320px] xl:w-[360px] shrink-0">
        <div className="rounded-[24px] border border-[var(--border)] bg-[var(--surface-strong)] p-6 shadow-[var(--panel-shadow)]">
          <div className="text-center mb-6">
            <div className="text-[10px] font-bold tracking-[0.1em] text-[var(--text-tertiary)] mb-2">MACRO REGIME</div>
            <div className="font-mono font-extrabold text-[52px] leading-none tracking-[-0.03em] text-emerald-500 drop-shadow-lg">{score}</div>
            <div className="text-[11px] text-[var(--text-secondary)] mt-2">
              /100 · <span className="font-bold text-emerald-500">RISK-ON</span>
            </div>
          </div>
          
          <div className="mb-4">
            <div className="h-2 bg-[var(--surface-soft)] rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full" 
                style={{ width: `${score}%` }} 
              />
            </div>
            <div className="flex justify-between mt-2 text-[9px] text-[var(--text-tertiary)]">
              <span>Risk-OFF</span>
              <span>Neutral 45–69</span>
              <span>Risk-ON ≥70</span>
            </div>
          </div>

          {breakdown.map((b) => {
            const ratio = b.score / b.weight;
            const barColor = ratio > 0.7 ? 'bg-emerald-500' : ratio > 0.4 ? 'bg-amber-500' : 'bg-rose-500';
            const textColor = ratio > 0.7 ? 'text-emerald-500' : ratio > 0.4 ? 'text-amber-500' : 'text-rose-500';

            return (
              <div key={b.label} className="mb-3">
                <div className="flex justify-between text-[10px] text-[var(--text-secondary)] mb-1">
                  <span>
                    {b.label} <span className="text-[var(--text-tertiary)]">{b.desc}</span>
                  </span>
                  <span className={`font-mono ${textColor}`}>
                    {b.score}/{b.weight}
                  </span>
                </div>
                <div className="h-[3px] bg-[var(--surface-soft)] rounded-full overflow-hidden">
                  <div className={`h-full ${barColor} rounded-full`} style={{ width: `${ratio * 100}%` }} />
                </div>
              </div>
            );
          })}

          <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[11px] leading-[1.6] text-emerald-300">
            S&P 500이 50일선 위에 위치하고 하이일드 채권으로 자금이 유입 중입니다. VCP 돌파 성공률이 높은 환경입니다.
          </div>
        </div>
      </div>

      {/* Right: Assets Grid */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {assets.map((asset) => (
            <div key={asset.sym} className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-4 shadow-sm">
              <div className="flex justify-between items-center mb-2">
                <span className="font-mono text-[11px] font-bold text-[var(--text-secondary)]">{asset.sym}</span>
                <span className={`font-mono text-[10px] font-bold ${asset.up ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {asset.chg}
                </span>
              </div>
              <div className="font-mono font-bold text-[15px] text-[var(--text-primary)] mb-2">{asset.price}</div>
              <div className={`inline-block rounded-[4px] border px-1.5 py-0.5 text-[9px] ${
                asset.up ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/20 bg-rose-500/10 text-rose-300'
              }`}>
                {asset.desc}
              </div>
            </div>
          ))}
        </div>

        {/* Ratios */}
        <div className="rounded-[16px] border border-[var(--border)] bg-[var(--surface-strong)] p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {ratios.map((ratio) => (
              <div key={ratio.label} className={`rounded-xl border ${ratio.border} bg-[var(--surface-soft)] p-3`}>
                <div className="flex justify-between mb-1">
                  <span className={`text-[11px] font-bold ${ratio.color}`}>{ratio.label}</span>
                  <span className="text-[10px] text-[var(--text-tertiary)]">{ratio.sub}</span>
                </div>
                <div className="font-mono text-[10px] text-[var(--text-secondary)] mb-1">{ratio.detail}</div>
                <div className="text-[10px] text-[var(--text-secondary)]">{ratio.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
