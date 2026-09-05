import { createHash } from 'node:crypto';
import { telegramAllowedChatIds, telegramBotToken } from '@/lib/env';
import { chunkTelegramMessage } from '@/lib/telegram';
import { closingExplanation } from '@/components/closing-bet/view-model';
import { CLOSING_EXIT_RULE, CLOSING_LABELS, CLOSING_POLICY } from './config';
import { ClosingRepository } from './repository';
import type { ClosingCandidate, ClosingEvaluation, ClosingSnapshot } from './types';

const price = (value: number | null) => value === null ? '미확인' : `${Math.round(value).toLocaleString('ko-KR')}원`;
const percent = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%` : '미확인';
const openingLine = (evaluation: ClosingEvaluation) => {
  const opening = evaluation.opening;
  if (!opening) return `익일 결과: ${evaluation.status}`;
  if (evaluation.status === 'PENDING') return '익일 결과: 다음 거래일 시초 가격 대기';
  return `익일 결과: NXT 08:05 ${price(opening.nxt.price)} ${percent(opening.nxt.returnPct)} / KRX 09:05 ${price(opening.krx.price)} ${percent(opening.krx.returnPct)}`;
};
const flow = (candidate: ClosingCandidate) => candidate.flow.kind === 'MISSING' ? '장중 수급 미확인'
  : `${candidate.flow.kind === 'ESTIMATE' ? '가집계' : '전일 확정'} ${candidate.flow.asOf ? new Date(candidate.flow.asOf).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : ''} · 외국인 ${candidate.flow.foreignNet?.toLocaleString('ko-KR') ?? '미확인'} / 기관 ${candidate.flow.institutionNet?.toLocaleString('ko-KR') ?? '미확인'} ${candidate.flow.unit === 'SHARES' ? '주' : '원'}`;

export function formatClosingTelegram(snapshot: ClosingSnapshot, evaluations: ClosingEvaluation[] = []) {
  const replay = snapshot.mode === 'REPLAY';
  const rows = replay ? snapshot.reviewCandidates : snapshot.picks;
  const title = replay ? '과거 재현 · 검토용 / 현재 매수 추천 아님' : '종가베팅 · 조건부 추천';
  const lines = [
    `[MTN ${title}]`, `${snapshot.tradeDate} · ${CLOSING_LABELS[snapshot.market]} TOP5`,
    `풀: 기존 ${snapshot.market} ${snapshot.universe.count}종목 | KRX`,
    `기준 ${new Date(snapshot.asOf).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false })} · 수집 ${snapshot.coverage.collected}/${snapshot.coverage.total} · ${snapshot.regime}`,
    replay ? '분봉·일봉 재현 순위입니다. 당시 호가·장중 가집계·종목 상태 및 편입 변경을 검증할 수 없어 실전 추천과 분리합니다.' : `적격 ${rows.length}/5 · 미선정 자리는 기준을 완화해 채우지 않습니다.`, '',
  ];
  rows.forEach((candidate, index) => {
    const m = candidate.metrics;
    lines.push(`${index + 1}. ${candidate.name} (${candidate.ticker}) · ${candidate.score}/100 · ${candidate.status === 'EXCLUDED' ? '조건 미달' : replay ? '검토 후보' : '조건부'}`,
      `기준가 ${price(m.price)} · 거래대금 ${m.turnover === null ? '미확인' : `${Math.round(m.turnover / 100_000_000).toLocaleString('ko-KR')}억`}`,
      `가격위치 ${m.rangePosition === null ? '미확인' : `${Math.round(m.rangePosition * 100)}%`} · 후반 ${m.lateReturnPct === null ? '미확인' : `${m.lateReturnPct.toFixed(2)}%`} · 상대거래량 ${m.rvol === null ? '미확인' : `${m.rvol.toFixed(2)}배`}`,
      `진입 ${price(candidate.plan.entryLow)}~${price(candidate.plan.entryMax)} / 무효화 ${price(candidate.plan.invalidation)}`,
      `목표 ${price(candidate.plan.target)} · ${CLOSING_EXIT_RULE}`, flow(candidate));
    if (candidate.exclusions.length) lines.push(`제외 조건: ${candidate.exclusions.map(closingExplanation).join(', ')}`);
    const evaluation = evaluations.find((row) => row.ticker === candidate.ticker);
    if (evaluation) lines.push(openingLine(evaluation));
    lines.push('');
  });
  if (!rows.length) lines.push('선정 종목 없음. 데이터 부족 또는 선정 조건 미충족.');
  lines.push(`점수는 확률이 아닙니다. 비용 가정 왕복 ${CLOSING_POLICY.costBps}bp. 종가 체결·손절가 체결은 보장되지 않습니다.`,
    replay ? '검토 의견: 날짜·시장·종목과 함께 거래대금 기준, 추격 상한, 제외 사유에 대한 의견을 Codex 작업에 남겨주세요.' : 'KRX 종가 단일가 참여 전 가격·거래 상태를 확인하세요. 조건 이탈 시 진입 보류.',
    `${(process.env.MTN_BASE_URL || 'https://mttcs.vercel.app').replace(/\/$/, '')}/strategies/kr-closing-bet?date=${snapshot.tradeDate}&mode=${snapshot.mode}`);
  return lines.join('\n');
}

export async function deliverClosingText(repo: ClosingRepository, snapshot: ClosingSnapshot, text: string, kind: string, dryRun = true) {
  const chunks = chunkTelegramMessage(text);
  const totals = { sent: 0, skipped: 0, failed: 0 };
  if (dryRun) return { ...totals, preview: text };
  const chats = telegramAllowedChatIds();
  if (!chats.length) throw new Error('텔레그램 수신처가 설정되지 않았습니다.');
  const token = telegramBotToken();
  for (const chatId of chats) {
    const chatHash = createHash('sha256').update(chatId).digest('hex');
    for (let chunk = 0; chunk < chunks.length; chunk++) {
      const key = { snapshot_id: snapshot.id, chat_hash: chatHash, kind, chunk };
      const claim = await repo.client.from('closing_bet_deliveries').insert({ ...key, status: 'CLAIMED' });
      if (claim.error?.code === '23505') {
        const retry = await repo.client.from('closing_bet_deliveries').update({ status: 'CLAIMED', updated_at: new Date().toISOString() })
          .match(key).eq('status', 'FAILED').select('snapshot_id');
        if (retry.error) throw new Error(`발송 재시도 잠금 실패: ${retry.error.code}`);
        if (!retry.data?.length) {
          const confirmed = await repo.client.from('closing_bet_deliveries').update({ updated_at: new Date().toISOString() })
            .match(key).eq('status', 'SENT').select('snapshot_id');
          if (confirmed.error) throw new Error(`발송 상태 확인 실패: ${confirmed.error.code}`);
          if (confirmed.data?.length) { totals.skipped++; continue; }
          totals.failed++; break;
        }
      } else if (claim.error) throw new Error(`발송 영수증 생성 실패: ${claim.error.code}`);
      let accepted = false;
      let definitiveFailure = false;
      try {
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: chunks[chunk], disable_web_page_preview: true }),
          signal: AbortSignal.timeout(25_000),
        });
        const body = await response.json() as { ok?: boolean; result?: { message_id?: number }; error_code?: number };
        if (!response.ok || !body.ok || !body.result?.message_id) {
          definitiveFailure = body.ok === false;
          throw new Error(`텔레그램 응답 실패 (${body.error_code ?? response.status})`);
        }
        accepted = true;
        const receipt = await repo.client.from('closing_bet_deliveries').update({ status: 'SENT', message_id: body.result.message_id, error: null, updated_at: new Date().toISOString() }).match(key);
        if (receipt.error) throw new Error('전송 성공 후 영수증 저장 실패');
        totals.sent++;
      } catch {
        const uncertain = accepted || !definitiveFailure;
        const saved = await repo.client.from('closing_bet_deliveries').update({ status: uncertain ? 'UNCERTAIN' : 'FAILED', error: uncertain ? '전송 결과 불확실: 자동 재발송 중단' : '텔레그램이 발송 실패를 반환함', updated_at: new Date().toISOString() }).match(key);
        if (saved.error) console.error('[Closing bet] Failed to record delivery failure:', saved.error.code);
        totals.failed++;
        break;
      }
    }
  }
  return totals;
}

export async function sendClosingSnapshot(repo: ClosingRepository, snapshot: ClosingSnapshot, evaluations: ClosingEvaluation[] = [], dryRun = true) {
  if (snapshot.phase !== 'FINAL') throw new Error('관찰 후보는 정식 추천으로 전송하지 않습니다.');
  const closeAt = new Date(`${snapshot.tradeDate}T${snapshot.session?.close || CLOSING_POLICY.close}+09:00`).getTime();
  if (snapshot.mode === 'LIVE' && Date.now() >= closeAt - 10 * 60_000) {
    throw new Error('유효시간을 지난 실전 추천은 재발송하지 않습니다.');
  }
  return deliverClosingText(repo, snapshot, formatClosingTelegram(snapshot, evaluations), snapshot.mode === 'REPLAY' ? 'REVIEW' : 'FINAL', dryRun);
}
