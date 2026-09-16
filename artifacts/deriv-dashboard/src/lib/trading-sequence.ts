export type DigitDirection = "DIGITOVER" | "DIGITUNDER";

export type DigitStreak = {
  digit: number;
  over: number;
  under: number;
};

export type MarketSignal = {
  symbol: string;
  quote: number | null;
  sample_count: number;
  digit_streaks: DigitStreak[];
  digit_outcomes?: DigitOutcome[];
};

export type DigitOutcome = {
  digit: number;
  over_percentage: number;
  under_percentage: number;
};

export type BestEdgeSignal = {
  symbol: string;
  direction: "DIGITOVER" | "DIGITUNDER" | "DUAL";
  digit: number;
  score: number;
  sampleCount: number;
};

export type BestDigitSignal = {
  symbol: string;
  direction: DigitDirection;
  digit: number;
  streak: number;
  sampleCount: number;
};

export type SettledTrade = {
  contract_id: string;
  status: string;
  profit: number;
};

export function rankDigitsByDistribution(counts: ReadonlyArray<number>): number[] {
  return Array.from({ length: 10 }, (_, digit) => ({
    digit,
    count: Number.isFinite(counts[digit]) ? counts[digit] : 0,
  }))
    .sort((left, right) => right.count - left.count || left.digit - right.digit)
    .map(({ digit }) => digit);
}

export function rankDigitsForDiffers(
  counts: ReadonlyArray<number>,
  absentStreaks: ReadonlyArray<number> = [],
): number[] {
  return Array.from({ length: 10 }, (_, digit) => ({
    digit,
    count: Number.isFinite(counts[digit]) ? counts[digit] : 0,
    absentStreak: Number.isFinite(absentStreaks[digit]) ? absentStreaks[digit] : 0,
  }))
    .sort(
      (left, right) =>
        left.count - right.count ||
        right.absentStreak - left.absentStreak ||
        left.digit - right.digit,
    )
    .map(({ digit }) => digit);
}

export function digitForTick(
  tickDuration: number,
  rankedDigits: ReadonlyArray<number>,
  fallbackDigit: number,
): number {
  const position = Math.min(5, Math.max(1, Math.trunc(tickDuration))) - 1;
  return rankedDigits[position] ?? fallbackDigit;
}

export function nextStakeAfterSettlement(
  profit: number,
  amount: number,
  normalStake: number,
  multiplier: number,
) {
  if (profit < 0) {
    return Number((amount * Math.max(1, multiplier)).toFixed(2));
  }
  return normalStake;
}

export function findNewlySettledTrade(
  rows: SettledTrade[],
  knownIds: ReadonlySet<string>,
) {
  return rows.find((trade) => !knownIds.has(trade.contract_id) && trade.status !== "open") ?? null;
}

function candidatesFromSignal(signal: MarketSignal): BestDigitSignal[] {
  return signal.digit_streaks.flatMap((item) => [
    {
      symbol: signal.symbol,
      direction: "DIGITOVER" as const,
      digit: item.digit,
      streak: item.over,
      sampleCount: signal.sample_count,
    },
    {
      symbol: signal.symbol,
      direction: "DIGITUNDER" as const,
      digit: item.digit,
      streak: item.under,
      sampleCount: signal.sample_count,
    },
  ]);
}

function bySignalStrength(left: BestDigitSignal, right: BestDigitSignal) {
  return (right.streak * 3 + Math.min(right.sampleCount, 100) / 100)
    - (left.streak * 3 + Math.min(left.sampleCount, 100) / 100);
}

export function chooseBestDigitSignal(
  signals: MarketSignal[],
  fallback: MarketSignal | null,
) {
  const candidates = signals
    .filter((signal) => signal.sample_count >= 5 && signal.quote != null)
    .flatMap(candidatesFromSignal)
    .sort(bySignalStrength);
  if (candidates[0]) return candidates[0];

  if (!fallback) return null;
  return candidatesFromSignal(fallback).sort((left, right) => right.streak - left.streak)[0] ?? null;
}

export function chooseBestEdgeSignal(
  signals: MarketSignal[],
  minimumScore: number,
): BestEdgeSignal | null {
  const candidates = signals.flatMap((signal) => {
    if (signal.sample_count < 5 || signal.quote == null || !signal.digit_outcomes?.length) return [];
    return signal.digit_outcomes.flatMap((outcome) => {
      const over = Number(outcome.over_percentage);
      const under = Number(outcome.under_percentage);
      if (!Number.isFinite(over) || !Number.isFinite(under)) return [];
      const dualCoverage = Math.min(100, over + under);
      const direction = dualCoverage >= minimumScore && over >= 10 && under >= 10
        ? "DUAL" as const
        : over >= under
          ? "DIGITOVER" as const
          : "DIGITUNDER" as const;
      const score = direction === "DUAL" ? dualCoverage : Math.max(over, under);
      return score >= minimumScore
        ? [{ symbol: signal.symbol, direction, digit: outcome.digit, score, sampleCount: signal.sample_count }]
        : [];
    });
  });
  return candidates.sort(
    (left, right) => right.score - left.score || right.sampleCount - left.sampleCount || left.digit - right.digit,
  )[0] ?? null;
}

export type StopReason = "take-profit" | "stop-loss";

export function sessionStopReason(
  pnl: number,
  takeProfit: number,
  stopLoss: number,
): StopReason | null {
  if (pnl >= takeProfit) return "take-profit";
  if (pnl <= -stopLoss) return "stop-loss";
  return null;
}