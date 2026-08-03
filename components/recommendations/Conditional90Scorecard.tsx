'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  ShieldCheck,
  Target,
} from 'lucide-react';
import { SystemFailurePanel } from '@/components/ui/SystemEvidencePanel';
import {
  toDisplayFailure,
  type DisplayFailure,
} from '@/components/ui/system-evidence';
import type { Conditional90Scorecard } from '@/lib/assurance/conditional-90';

/** Standard MTN API envelope for GET /api/assurance/conditional-90. */
export interface Conditional90ScorecardResponseV1 {
  data: Conditional90Scorecard;
  meta?: unknown;
}

interface RequestState {
  loading: boolean;
  data: Conditional90Scorecard | null;
  failure: DisplayFailure | null;
}

const MILESTONE_SCORES = [73, 85, 90] as const;
const VERIFIED_SCORES = [72, 73, 85, 90] as const;
const IMPLEMENTATION_BASELINE_AS_OF = '2026-08-03T00:00:00.000Z' as const;
const DOMAIN_MAX = {
  investment: 17,
  data: 13,
  strategy: 13,
  risk: 14,
  software: 10,
  operations: 8,
  security: 5,
  system_ui: 10,
} as const;
type MilestoneStatus = Conditional90Scorecard['milestones'][number]['status'];
type ActionEffort = Conditional90Scorecard['priorityActions'][number]['effort'];

const MILESTONE_VIEW: Record<MilestoneStatus, {
  label: string;
  icon: typeof CheckCircle2;
  tone: string;
}> = {
  PASS: {
    label: '달성',
    icon: CheckCircle2,
    tone: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  },
  WAITING: {
    label: '증거 축적 중',
    icon: Database,
    tone: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
  },
  BLOCKED: {
    label: '조건 미충족',
    icon: AlertTriangle,
    tone: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  },
};

const EFFORT_LABEL: Record<ActionEffort, string> = {
  LOW: '낮음',
  MEDIUM: '보통',
  HIGH: '높음',
  TIME_BOUND: '시간 경과 필수',
};

const DISPOSITION_LABEL: Record<Conditional90Scorecard['disposition'], string> = {
  RESEARCH_ONLY: '연구 전용',
  SMALL_PILOT_REVIEW: '소액 파일럿 검토 가능',
  ELIGIBLE_FOR_HUMAN_REVIEW: '사람의 자본 검토 자격',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function isNonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIsoDateValue(value: unknown) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isNullableIsoDateValue(value: unknown) {
  return value === null || isIsoDateValue(value);
}

function isConditional90ResponseV1(value: unknown): value is Conditional90ScorecardResponseV1 {
  if (!isRecord(value) || !isRecord(value.data)) return false;
  const data = value.data;
  if (
    !hasExactKeys(data, [
      'schemaVersion',
      'policyVersion',
      'evaluatedAt',
      'score',
      'disposition',
      'capitalApproval',
      'policy',
      'milestones',
      'domains',
      'blockers',
      'priorityActions',
      'evidence',
    ])
    || data.schemaVersion !== 'mtn-conditional-90-scorecard-v1'
    || data.policyVersion !== 'mtn-conditional-90-policy-2026.08-v1'
    || !isIsoDateValue(data.evaluatedAt)
    || !isRecord(data.score)
    || !hasExactKeys(data.score, ['verifiedScore', 'scaleMax', 'conditionalMaximum', 'nextMilestone'])
    || !VERIFIED_SCORES.includes(data.score.verifiedScore as (typeof VERIFIED_SCORES)[number])
    || data.score.scaleMax !== 100
    || data.score.conditionalMaximum !== 90
    || !(data.score.nextMilestone === 73 || data.score.nextMilestone === 85 || data.score.nextMilestone === 90 || data.score.nextMilestone === null)
    || !['RESEARCH_ONLY', 'SMALL_PILOT_REVIEW', 'ELIGIBLE_FOR_HUMAN_REVIEW'].includes(String(data.disposition))
    || data.capitalApproval !== 'NOT_GRANTED'
    || !isRecord(data.policy)
    || !hasExactKeys(data.policy, ['implementationBaseline', 'mfa', 'compensatingControls', 'assessmentOnly'])
    || !isRecord(data.policy.implementationBaseline)
    || !hasExactKeys(data.policy.implementationBaseline, ['score', 'kind', 'fixedAsOf', 'scope', 'evidenceBoundary'])
    || data.policy.implementationBaseline.score !== 72
    || data.policy.implementationBaseline.kind !== 'IMPLEMENTATION_VERIFICATION_BASELINE'
    || data.policy.implementationBaseline.fixedAsOf !== IMPLEMENTATION_BASELINE_AS_OF
    || !isNonEmptyString(data.policy.implementationBaseline.scope)
    || !isNonEmptyString(data.policy.implementationBaseline.evidenceBoundary)
    || !isRecord(data.policy.mfa)
    || !hasExactKeys(data.policy.mfa, ['required', 'status', 'rationale'])
    || data.policy.mfa.required !== false
    || data.policy.mfa.status !== 'OWNER_WAIVED'
    || !isNonEmptyString(data.policy.mfa.rationale)
    || !Array.isArray(data.policy.compensatingControls)
    || data.policy.compensatingControls.length === 0
    || !data.policy.compensatingControls.every(isNonEmptyString)
    || new Set(data.policy.compensatingControls).size !== data.policy.compensatingControls.length
    || data.policy.assessmentOnly !== true
    || !Array.isArray(data.milestones)
    || data.milestones.length !== MILESTONE_SCORES.length
    || !Array.isArray(data.domains)
    || !Array.isArray(data.blockers)
    || !Array.isArray(data.priorityActions)
    || !isRecord(data.evidence)
    || !hasExactKeys(data.evidence, ['oldestRequiredEvidenceAt', 'currentReleaseSha', 'publicationSpanDays'])
    || !isNullableIsoDateValue(data.evidence.oldestRequiredEvidenceAt)
    || !(data.evidence.currentReleaseSha === null
      || (typeof data.evidence.currentReleaseSha === 'string' && /^[a-f0-9]{40}$/.test(data.evidence.currentReleaseSha)))
    || !Number.isInteger(data.evidence.publicationSpanDays)
    || Number(data.evidence.publicationSpanDays) < 0
  ) return false;

  const validMilestones = data.milestones.filter((milestone) => {
    if (!isRecord(milestone)
      || !hasExactKeys(milestone, [
        'score',
        'status',
        'label',
        'passedRequirements',
        'totalRequirements',
        'evidenceAsOf',
        'requirements',
      ])
      || !MILESTONE_SCORES.includes(milestone.score as (typeof MILESTONE_SCORES)[number])
      || !['PASS', 'BLOCKED', 'WAITING'].includes(String(milestone.status))
      || !isNonEmptyString(milestone.label)
      || !Number.isInteger(milestone.passedRequirements)
      || !Number.isInteger(milestone.totalRequirements)
      || Number(milestone.passedRequirements) < 0
      || !isNullableIsoDateValue(milestone.evidenceAsOf)
      || !Array.isArray(milestone.requirements)) return false;
    const validRequirements = milestone.requirements.filter((requirement) => isRecord(requirement)
      && hasExactKeys(requirement, [
        'code',
        'label',
        'status',
        'measured',
        'target',
        'unit',
        'nextAction',
        'evidenceAsOf',
      ])
      && isNonEmptyString(requirement.code)
      && isNonEmptyString(requirement.label)
      && isNonEmptyString(requirement.measured)
      && isNonEmptyString(requirement.target)
      && isNonEmptyString(requirement.unit)
      && isNonEmptyString(requirement.nextAction)
      && isNullableIsoDateValue(requirement.evidenceAsOf)
      && ['PASS', 'BLOCKED', 'WAITING'].includes(String(requirement.status)));
    return validRequirements.length === milestone.requirements.length
      && new Set(validRequirements.map((requirement) => requirement.code)).size === validRequirements.length
      && milestone.totalRequirements === milestone.requirements.length
      && milestone.passedRequirements === validRequirements.filter((requirement) => requirement.status === 'PASS').length;
  });
  if (validMilestones.length !== data.milestones.length
    || validMilestones.length !== MILESTONE_SCORES.length) return false;
  const milestoneByScore = new Map(validMilestones.map((milestone) => [Number(milestone.score), milestone]));
  if (milestoneByScore.size !== MILESTONE_SCORES.length) return false;

  const verifiedScore = Number(data.score.verifiedScore) as (typeof VERIFIED_SCORES)[number];
  for (const milestoneScore of MILESTONE_SCORES) {
    const milestone = milestoneByScore.get(milestoneScore);
    if (!milestone || (milestone.status === 'PASS') !== (verifiedScore >= milestoneScore)) return false;
  }
  const expectedNextMilestone = verifiedScore === 72 ? 73 : verifiedScore === 73 ? 85 : verifiedScore === 85 ? 90 : null;
  const expectedDisposition = verifiedScore === 90
    ? 'ELIGIBLE_FOR_HUMAN_REVIEW'
    : verifiedScore === 85 ? 'SMALL_PILOT_REVIEW' : 'RESEARCH_ONLY';
  if (data.score.nextMilestone !== expectedNextMilestone || data.disposition !== expectedDisposition) return false;

  const validDomains = data.domains.filter((domain) => isRecord(domain)
    && hasExactKeys(domain, ['code', 'label', 'verified', 'max', 'status'])
    && typeof domain.code === 'string'
    && domain.code in DOMAIN_MAX
    && isNonEmptyString(domain.label)
    && Number.isInteger(domain.verified)
    && Number.isInteger(domain.max)
    && ['PASS', 'WAITING'].includes(String(domain.status))
    && Number(domain.verified) >= 0
    && Number(domain.max) === DOMAIN_MAX[domain.code as keyof typeof DOMAIN_MAX]
    && Number(domain.verified) <= Number(domain.max)
    && (domain.status === 'PASS') === (Number(domain.verified) === Number(domain.max)));
  const validBlockers = data.blockers.filter((blocker) => isRecord(blocker)
    && hasExactKeys(blocker, [
      'code',
      'scope',
      'severity',
      'label',
      'detail',
      'current',
      'target',
      'unit',
      'nextAction',
      'evidenceAsOf',
    ])
    && isNonEmptyString(blocker.code)
    && ['73', '85', '90'].includes(String(blocker.scope))
    && ['TIME_BOUND', 'ACTION_REQUIRED', 'STATISTICAL_FAILURE'].includes(String(blocker.severity))
    && isNonEmptyString(blocker.label)
    && isNonEmptyString(blocker.detail)
    && isNonEmptyString(blocker.current)
    && isNonEmptyString(blocker.target)
    && isNonEmptyString(blocker.unit)
    && isNonEmptyString(blocker.nextAction)
    && isNullableIsoDateValue(blocker.evidenceAsOf));
  const validPriorityActions = data.priorityActions.filter((action) => isRecord(action)
    && hasExactKeys(action, [
      'code',
      'label',
      'expectedPointGain',
      'effort',
      'minimumElapsedDays',
      'costTier',
      'nextAction',
    ])
    && isNonEmptyString(action.code)
    && isNonEmptyString(action.label)
    && Number.isInteger(action.expectedPointGain)
    && Number(action.expectedPointGain) >= 0
    && ['LOW', 'MEDIUM', 'HIGH', 'TIME_BOUND'].includes(String(action.effort))
    && Number.isInteger(action.minimumElapsedDays)
    && Number(action.minimumElapsedDays) >= 0
    && action.costTier === 'FREE'
    && isNonEmptyString(action.nextAction));
  return validDomains.length === data.domains.length
    && validDomains.length === 8
    && new Set(validDomains.map((domain) => domain.code)).size === validDomains.length
    && Object.keys(DOMAIN_MAX).every((code) => validDomains.some((domain) => domain.code === code))
    && validDomains.reduce((sum, domain) => sum + Number(domain.verified), 0) === verifiedScore
    && validDomains.reduce((sum, domain) => sum + Number(domain.max), 0) === 90
    && validBlockers.length === data.blockers.length
    && new Set(validBlockers.map((blocker) => blocker.code)).size === validBlockers.length
    && validPriorityActions.length === data.priorityActions.length
    && new Set(validPriorityActions.map((action) => action.code)).size === validPriorityActions.length;
}

function clamp(value: number, minimum = 0, maximum = 100) {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

function formatDateTime(value: string | null) {
  if (!value) return '축적된 증거 없음';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function LoadingScorecard() {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      aria-label="조건부 90점 검증 점수판 불러오는 중"
      className="rounded-xl border border-slate-800 bg-slate-950/55 p-4 sm:p-5"
    >
      <span className="sr-only">조건부 90점 검증 근거를 불러오는 중입니다.</span>
      <div aria-hidden="true" className="animate-pulse space-y-4">
        <div className="h-5 w-48 rounded bg-slate-800" />
        <div className="h-12 w-28 rounded bg-slate-800" />
        <div className="h-2 rounded-full bg-slate-800" />
        <div className="grid gap-3 sm:grid-cols-3">
          {MILESTONE_SCORES.map((score) => <div key={score} className="h-28 rounded-lg bg-slate-900" />)}
        </div>
      </div>
    </section>
  );
}

export default function Conditional90Scorecard() {
  const titleId = useId();
  const [reloadToken, setReloadToken] = useState(0);
  const lastSuccessfulAtRef = useRef<string | null>(null);
  const [state, setState] = useState<RequestState>({ loading: true, data: null, failure: null });

  const retry = useCallback(() => {
    setState((current) => ({ ...current, loading: true, failure: null }));
    setReloadToken((current) => current + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/assurance/conditional-90', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const failure = toDisplayFailure(payload, '조건부 90점 검증 근거를 불러오지 못했습니다.');
          setState({
            loading: false,
            data: null,
            failure: {
              ...failure,
              lastSuccessfulAt: failure.lastSuccessfulAt || lastSuccessfulAtRef.current,
            },
          });
          return;
        }
        if (!isConditional90ResponseV1(payload)) {
          setState({
            loading: false,
            data: null,
            failure: {
              rawMessage: '점수판 응답 형식이 v1 계약과 일치하지 않습니다.',
              code: 'INVALID_ASSURANCE_CONTRACT',
              recoverable: true,
              lastSuccessfulAt: lastSuccessfulAtRef.current,
            },
          });
          return;
        }
        lastSuccessfulAtRef.current = payload.data.evaluatedAt;
        setState({ loading: false, data: payload.data, failure: null });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({
          loading: false,
          data: null,
          failure: {
            rawMessage: error instanceof Error ? error.message : '조건부 90점 검증 근거를 불러오지 못했습니다.',
            code: 'ASSURANCE_REQUEST_FAILED',
            recoverable: true,
            lastSuccessfulAt: lastSuccessfulAtRef.current,
          },
        });
      });

    return () => controller.abort();
  }, [reloadToken]);

  if (state.loading) return <LoadingScorecard />;

  if (state.failure || !state.data) {
    return (
      <SystemFailurePanel
        title="조건부 90점 검증 점수판 장애"
        failure={state.failure || {
          rawMessage: '조건부 90점 검증 근거가 없습니다.',
          recoverable: true,
          lastSuccessfulAt: null,
        }}
        nextAction="기존 추천 성과 화면은 계속 사용할 수 있습니다. 이 점수판만 다시 불러오고, 복구 전에는 상위 점수 달성을 확정하지 마세요."
        onRetry={retry}
      />
    );
  }

  const data = state.data;
  const orderedMilestones = MILESTONE_SCORES.flatMap((score) => {
    const milestone = data.milestones.find((item) => item.score === score);
    return milestone ? [milestone] : [];
  });
  if (orderedMilestones.length !== MILESTONE_SCORES.length) {
    return (
      <SystemFailurePanel
        title="조건부 90점 검증 점수판 장애"
        failure={{
          rawMessage: '점수판 마일스톤 구성이 불완전합니다.',
          code: 'INVALID_ASSURANCE_CONTRACT',
          recoverable: true,
          lastSuccessfulAt: data.evaluatedAt,
        }}
        nextAction="기존 추천 성과 화면은 계속 사용할 수 있습니다. 점수판 응답 계약을 복구한 뒤 다시 시도하세요."
        onRetry={retry}
      />
    );
  }
  const baselineMilestone = orderedMilestones[0];
  const baselinePassed = baselineMilestone.status === 'PASS';

  return (
    <section
      aria-labelledby={titleId}
      data-a11y-text-resize-scope="conditional-90-scorecard"
      className="min-w-0 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/55"
    >
      <div className="border-b border-slate-800 p-4 sm:p-5">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-400">Conditional Assurance</p>
            <h2 id={titleId} className="mt-1 text-lg font-bold text-white">조건부 90점 검증 점수판</h2>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-400">
              무료 인프라에서 기술 통제와 누적 증거를 분리해 평가합니다. 아직 경과하지 않은 기간이나 없는 실계좌 증거는 통과로 추정하지 않습니다.
            </p>
            <p className="mt-2 max-w-3xl rounded-md border border-slate-700/70 bg-slate-900/60 px-3 py-2 text-xs leading-5 text-slate-300">
              72점은 {formatDateTime(data.policy.implementationBaseline.fixedAsOf)} 기준의 {data.policy.implementationBaseline.scope}입니다. {data.policy.implementationBaseline.evidenceBoundary}
            </p>
          </div>
          <div className={`shrink-0 self-start rounded-lg border px-4 py-3 text-right ${baselinePassed ? 'border-emerald-500/25 bg-emerald-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
            <p className={`text-xs font-semibold ${baselinePassed ? 'text-emerald-200/70' : 'text-amber-200/80'}`}>구현 기준선 포함 검증 점수</p>
            <p className={`mt-1 font-mono text-3xl font-black ${baselinePassed ? 'text-emerald-300' : 'text-amber-200'}`}>{data.score.verifiedScore}<span className="text-sm text-slate-400">/{data.score.scaleMax}</span></p>
            <p className={`mt-1 text-xs font-semibold ${baselinePassed ? 'text-emerald-100' : 'text-amber-100'}`}>{DISPOSITION_LABEL[data.disposition]}</p>
          </div>
        </div>

        <div className="mt-5">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={data.score.verifiedScore}
            aria-valuetext={`구현 검증 기준선 포함 현재 점수 ${data.score.verifiedScore}점, 무료 인프라 조건부 이론상 최대 ${data.score.conditionalMaximum}점`}
            aria-label="조건부 최대 점수 진행도"
            className="relative h-3 overflow-hidden rounded-full bg-slate-800"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-600 via-sky-500 to-violet-500 transition-[width] duration-700"
              style={{ width: `${clamp(data.score.verifiedScore)}%` }}
            />
            <span aria-hidden="true" className="absolute inset-y-0 left-[90%] w-px bg-white/80" />
          </div>
          <div aria-hidden="true" className="relative mt-2 h-4 text-xs font-semibold text-slate-500">
            {MILESTONE_SCORES.map((score) => (
              <span key={score} className="absolute -translate-x-1/2" style={{ left: `${score}%` }}>{score}</span>
            ))}
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            조건부 최대 {data.score.conditionalMaximum}점은 모든 증거 게이트 통과 시 도달 가능하며, 장기 관측기간은 코드 변경만으로 단축할 수 없습니다.
          </p>
        </div>
      </div>

      <div className="space-y-5 p-4 sm:p-5">
        <section aria-labelledby={`${titleId}-milestones`}>
          <h3 id={`${titleId}-milestones`} className="text-sm font-bold text-white">73 · 85 · 90점 마일스톤</h3>
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            {orderedMilestones.map((milestone) => {
              const score = milestone.score;
              const view = MILESTONE_VIEW[milestone.status];
              const StatusIcon = view.icon;
              const progressPct = milestone.totalRequirements > 0
                ? (milestone.passedRequirements / milestone.totalRequirements) * 100
                : 0;
              const nextRequirement = milestone.requirements.find((requirement) => requirement.status !== 'PASS');
              return (
                <article key={score} className="min-w-0 rounded-lg border border-slate-800 bg-slate-900/45 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-2xl font-black text-white">{score}점</p>
                      <h4 className="mt-1 text-xs font-bold text-slate-300">{milestone.label}</h4>
                    </div>
                    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-xs font-bold ${view.tone}`}>
                      <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      {view.label}
                    </span>
                  </div>
                  <p className="mt-3 break-words text-xs leading-5 text-slate-400">
                    {nextRequirement
                      ? `다음 조건: ${nextRequirement.label} · ${nextRequirement.measured} → ${nextRequirement.target} ${nextRequirement.unit}`
                      : '이 단계의 필수 요구조건을 모두 통과했습니다.'}
                  </p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${clamp(progressPct)}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    요구조건 {milestone.passedRequirements}/{milestone.totalRequirements} · 진행률 {Math.round(clamp(progressPct))}%
                    {milestone.evidenceAsOf ? ` · 근거 ${formatDateTime(milestone.evidenceAsOf)}` : ''}
                  </p>
                </article>
              );
            })}
          </div>
        </section>

        <section aria-labelledby={`${titleId}-security`} className="rounded-lg border border-sky-500/25 bg-sky-500/8 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 id={`${titleId}-security`} className="flex items-center gap-2 text-sm font-bold text-white">
                <ShieldCheck className="h-4 w-4 text-sky-300" aria-hidden="true" />
                MFA 비필수 · 보상통제 적용
              </h3>
              <p className="mt-2 text-xs leading-5 text-sky-100/75">{data.policy.mfa.rationale}</p>
            </div>
            <span className="shrink-0 self-start rounded-full border border-sky-400/30 px-2.5 py-1 text-xs font-bold text-sky-200">
              MFA 자체는 점수 차단 아님
            </span>
          </div>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {data.policy.compensatingControls.map((control) => {
              const ControlIcon = baselinePassed ? CheckCircle2 : AlertTriangle;
              return (
                <li key={control} className="min-w-0 rounded-md border border-sky-400/15 bg-black/10 p-3">
                  <div className="flex items-start gap-2">
                    <ControlIcon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${baselinePassed ? 'text-emerald-300' : 'text-amber-300'}`} aria-hidden="true" />
                    <p className="break-words text-xs font-bold text-slate-200">{control}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          {!baselinePassed && (
            <p className="mt-3 text-xs leading-5 text-amber-100">
              MFA 면제는 유지되지만 보상통제의 최신 증거가 없거나 실패하면 73점 기준선은 통과하지 않습니다.
            </p>
          )}
        </section>

        <section aria-labelledby={`${titleId}-blockers`}>
          <h3 id={`${titleId}-blockers`} className="text-sm font-bold text-white">현재 차단 사유</h3>
          {data.blockers.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {data.blockers.map((blocker) => (
                <li key={blocker.code} className="rounded-lg border border-amber-500/25 bg-amber-500/8 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-amber-500/30 px-2 py-0.5 text-xs font-bold text-amber-200">{blocker.scope}점 게이트</span>
                    <span className="text-xs font-bold text-white">{blocker.label}</span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-400">{blocker.detail}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    현재 {blocker.current} → 목표 {blocker.target} {blocker.unit}
                    {blocker.evidenceAsOf ? ` · 근거 ${formatDateTime(blocker.evidenceAsOf)}` : ' · 근거 미축적'}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-amber-100"><strong>해소 조치</strong> {blocker.nextAction}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-500/8 p-3 text-xs leading-5 text-emerald-100">
              현재 점수판에 남은 조건부 게이트 차단 사유가 없습니다.
            </p>
          )}
        </section>

        <section aria-labelledby={`${titleId}-actions`}>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <h3 id={`${titleId}-actions`} className="text-sm font-bold text-white">우선 개선 조치</h3>
            <p className="text-xs text-slate-500">점수효과·투입 노력·필수 기간·무료 여부 비교</p>
          </div>
          {data.priorityActions.length > 0 ? (
            <ol className="mt-3 grid gap-3 lg:grid-cols-2">
              {data.priorityActions.map((action, index) => (
                <li key={action.code} className="min-w-0 rounded-lg border border-slate-800 bg-slate-900/45 p-4">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-500/15 font-mono text-xs font-black text-violet-200">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="break-words text-xs font-bold text-white">{action.label}</p>
                      <p className="mt-1 break-words text-xs leading-5 text-slate-400">{action.nextAction}</p>
                    </div>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <div className="rounded-md bg-black/15 p-2">
                      <dt className="text-slate-500">점수효과</dt>
                      <dd className="mt-1 font-bold text-emerald-300">+{action.expectedPointGain}점</dd>
                    </div>
                    <div className="rounded-md bg-black/15 p-2">
                      <dt className="text-slate-500">투입 노력</dt>
                      <dd className="mt-1 font-bold text-slate-200">{EFFORT_LABEL[action.effort]}</dd>
                    </div>
                    <div className="rounded-md bg-black/15 p-2">
                      <dt className="text-slate-500">필수 기간</dt>
                      <dd className="mt-1 break-words font-bold text-slate-200">{action.minimumElapsedDays > 0 ? `${action.minimumElapsedDays}일` : '즉시 시작'}</dd>
                    </div>
                    <div className="rounded-md bg-black/15 p-2">
                      <dt className="text-slate-500">무료 인프라</dt>
                      <dd className="mt-1 font-bold text-emerald-300">{action.costTier === 'FREE' ? '가능' : action.costTier}</dd>
                    </div>
                  </dl>
                  <p className="mt-2 text-right text-xs font-semibold text-slate-500">
                    다음 목표 {data.score.nextMilestone ? `${data.score.nextMilestone}점` : '조건부 최대 유지'}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 rounded-lg border border-slate-800 bg-slate-900/45 p-3 text-xs text-slate-400">대기 중인 개선 조치가 없습니다.</p>
          )}
        </section>

        <aside aria-label="자본 승인 제한" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4">
          <div className="flex items-start gap-3">
            <Target className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" aria-hidden="true" />
            <div>
              <h3 className="text-sm font-black text-white">자동 실매매 승인 아님</h3>
              <p className="mt-1 text-xs leading-5 text-rose-100/80">
                90점 달성은 사람의 자본 배분 검토 자격을 뜻할 뿐입니다. 주문 실행·비중 확대·리스크 한도 변경은 별도의 사람 승인과 계좌별 검증을 거쳐야 합니다.
              </p>
            </div>
          </div>
        </aside>

        <dl className="grid gap-2 border-t border-slate-800 pt-4 text-xs text-slate-500 sm:grid-cols-2">
          <div><dt className="inline font-semibold">점수 계산시각 </dt><dd className="inline">{formatDateTime(data.evaluatedAt)}</dd></div>
          <div><dt className="inline font-semibold">최초 필수 근거시각 </dt><dd className="inline">{formatDateTime(data.evidence.oldestRequiredEvidenceAt)}</dd></div>
          <div><dt className="inline font-semibold">공식 발행 증거기간 </dt><dd className="inline">{data.evidence.publicationSpanDays}일</dd></div>
          <div><dt className="inline font-semibold">현재 release SHA </dt><dd className="inline break-all font-mono">{data.evidence.currentReleaseSha || '미측정'}</dd></div>
        </dl>
      </div>
    </section>
  );
}
