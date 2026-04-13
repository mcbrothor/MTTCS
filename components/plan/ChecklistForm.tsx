import { useState } from 'react';
import { Check, Lock } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import type { AssessmentStatus } from '@/types';

interface ChecklistFormProps {
  onComplete: (checklist: {
    chk_sepa: boolean;
    chk_risk: boolean;
    chk_entry: boolean;
    chk_stoploss: boolean;
    chk_exit: boolean;
    chk_psychology: boolean;
  }) => void;
  sepaStatus: AssessmentStatus;
}

const STEPS = [
  {
    id: 'sepa',
    title: 'SEPA',
    label: '1. SEPA 통과 확인',
    desc: '시스템이 제시한 SEPA 판정과 정보 항목을 읽었고, 실패 조건이 없는 경우에만 계획을 저장합니다.',
  },
  {
    id: 'risk',
    title: 'Risk',
    label: '2. 리스크 동의',
    desc: '내가 입력한 허용 손실 한도 안에서만 수량을 산출하며, 계산된 수량을 초과하지 않습니다.',
  },
  {
    id: 'entry',
    title: 'Entry',
    label: '3. 진입 규율',
    desc: '20일 고점 돌파 가격에 도달하기 전에 예측 진입하지 않습니다.',
  },
  {
    id: 'stoploss',
    title: 'Stop',
    label: '4. 손절 규율',
    desc: '정해진 손절가에 도달하면 즉시 청산하고 손실을 확대하지 않습니다.',
  },
  {
    id: 'exit',
    title: 'Exit',
    label: '5. 청산 규율',
    desc: '추세가 유지되는 동안 조기 청산하지 않고, 사전에 정한 추적 기준을 따릅니다.',
  },
  {
    id: 'psychology',
    title: 'Mind',
    label: '6. 심리 점검',
    desc: '복수심, 조급함, 손실 만회 욕구가 아닌 차분한 상태에서만 실행합니다.',
  },
];

export default function ChecklistForm({ onComplete, sepaStatus }: ChecklistFormProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const isSepaBlocked = sepaStatus === 'fail';

  const handleAgree = () => {
    if (isSepaBlocked && STEPS[currentStep].id === 'sepa') return;

    const newAnswers = { ...answers, [STEPS[currentStep].id]: true };
    setAnswers(newAnswers);

    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete({
        chk_sepa: !!newAnswers.sepa,
        chk_risk: !!newAnswers.risk,
        chk_entry: !!newAnswers.entry,
        chk_stoploss: !!newAnswers.stoploss,
        chk_exit: !!newAnswers.exit,
        chk_psychology: !!newAnswers.psychology,
      });
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  return (
    <Card>
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">4. Centaur 체크리스트</p>
        <h2 className="mt-1 text-xl font-bold text-white">기계적 실행을 위한 최종 확인</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          SEPA가 Fail이면 체크리스트 첫 단계와 저장 버튼을 잠급니다.
        </p>
      </div>

      {isSepaBlocked && (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <p>SEPA 실패 조건이 있어 매매 계획을 저장할 수 없습니다. 실패한 조건을 먼저 해소하세요.</p>
        </div>
      )}

      <div className="relative mb-8 flex items-center justify-between">
        <div className="absolute left-0 top-1/2 -z-10 h-1 w-full -translate-y-1/2 bg-slate-700" />
        <div
          className="absolute left-0 top-1/2 -z-10 h-1 -translate-y-1/2 bg-emerald-500 transition-all duration-300"
          style={{ width: `${(currentStep / (STEPS.length - 1)) * 100}%` }}
        />
        {STEPS.map((step, index) => {
          const isCompleted = answers[step.id];
          const isCurrent = index === currentStep;
          return (
            <div key={step.id} className="flex flex-col items-center gap-2 bg-[var(--background)] px-1">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${isCompleted ? 'bg-emerald-500 text-white' : isCurrent ? 'bg-emerald-500 text-white ring-4 ring-emerald-500/20' : 'bg-slate-700 text-slate-400'}`}>
                {isCompleted ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </div>
              <span className={`hidden text-[10px] font-semibold uppercase sm:block ${isCurrent ? 'text-emerald-300' : 'text-slate-500'}`}>
                {step.title}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mb-6 flex min-h-[140px] flex-col justify-center rounded-lg border border-slate-800 bg-slate-900/50 p-6">
        <h4 className="mb-2 text-base font-semibold text-white">{STEPS[currentStep].label}</h4>
        <p className="mb-4 text-sm leading-6 text-slate-300">{STEPS[currentStep].desc}</p>

        {answers[STEPS[currentStep].id] && (
          <div className="flex items-center gap-1 text-sm font-bold text-emerald-400">
            <Check className="h-4 w-4" /> 확인 완료
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={handlePrev} disabled={currentStep === 0}>
          이전
        </Button>
        <Button
          variant="primary"
          onClick={handleAgree}
          disabled={isSepaBlocked && STEPS[currentStep].id === 'sepa'}
          className={currentStep === STEPS.length - 1 ? 'bg-amber-500 hover:bg-amber-600 focus:ring-amber-500' : ''}
        >
          {currentStep === STEPS.length - 1 ? '동의하고 완료' : '동의하고 다음'}
        </Button>
      </div>
    </Card>
  );
}
