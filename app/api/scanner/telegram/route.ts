import { NextResponse } from 'next/server';
import { sendTelegramMessage } from '@/lib/telegram';
import { parseContestSource } from '@/lib/contest-sources';
import { formatScannerTelegramMessage, type ScannerTelegramCandidate } from '@/lib/scanner-telegram';

export const dynamic = 'force-dynamic';

function cleanCandidates(value: unknown): ScannerTelegramCandidate[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => item && typeof item === 'object' ? item as Record<string, unknown> : null)
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({
      ticker: String(item.ticker || '').trim().toUpperCase(),
      name: typeof item.name === 'string' ? item.name : null,
      exchange: typeof item.exchange === 'string' ? item.exchange : null,
      recommendationTier: typeof item.recommendationTier === 'string' ? item.recommendationTier : null,
      recommendationReason: typeof item.recommendationReason === 'string' ? item.recommendationReason : null,
      dualTier: typeof item.dualTier === 'string' ? item.dualTier : null,
      pass: typeof item.pass === 'boolean' ? item.pass : null,
      rsRating: typeof item.rsRating === 'number' ? item.rsRating : null,
      vcpScore: typeof item.vcpScore === 'number' ? item.vcpScore : null,
      vcpGrade: typeof item.vcpGrade === 'string' ? item.vcpGrade : null,
      sepaStatus: typeof item.sepaStatus === 'string' ? item.sepaStatus : null,
      confidence: typeof item.confidence === 'string' ? item.confidence : null,
      pivotPrice: typeof item.pivotPrice === 'number' ? item.pivotPrice : null,
      distanceToPivotPct: typeof item.distanceToPivotPct === 'number' ? item.distanceToPivotPct : null,
      currentPrice: typeof item.currentPrice === 'number' ? item.currentPrice : null,
    }))
    .filter((item) => item.ticker);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const source = parseContestSource(body.source) || 'minervini';
    const universe = String(body.universe || 'UNKNOWN');
    const candidates = cleanCandidates(body.candidates).slice(0, 30);
    const message = formatScannerTelegramMessage({ source, universe, candidates });
    const result = await sendTelegramMessage(message);

    if (result.skipped) {
      return NextResponse.json({
        success: false,
        message: 'Telegram bot token or allowed chat id is not configured.',
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `Sent screening summary to ${result.sent} Telegram chat(s).`,
      sent: result.sent,
      candidate_count: candidates.length,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to send Telegram message.',
    }, { status: 500 });
  }
}
