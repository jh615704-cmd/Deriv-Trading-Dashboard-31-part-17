export const AI_SCANNER_MIN_SAMPLE = 20;

export type AiScannerMarketSignal = {
  symbol: string;
  sample_count: number;
  digit_even_percentage: number;
  digit_odd_percentage: number;
  digit_outcomes?: Array<{
    digit: number;
    over_percentage: number;
    under_percentage: number;
  }>;
};

export type BulkScannerCandidate = {
  symbol: string;
  contractType: "DIGITOVER" | "DIGITUNDER" | "DIGITDIFF";
  barrier: number;
  observedRate: number;
  sampleCount: number;
};

export type ParityScannerCandidate = {
  symbol: string;
  parity: "DIGITEVEN" | "DIGITODD";
  observedRate: number;
  sampleCount: number;
};

export type TradeXScannerCandidate = {
  symbol: string;
  digit: number;
  observedRate: number;
  sampleCount: number;
};

function eligibleSignals(
  signals: readonly AiScannerMarketSignal[],
  symbols: readonly string[],
  minimumSample: number,
) {
  const allowedSymbols = new Set(symbols);
  return signals.filter((signal) =>
    allowedSymbols.has(signal.symbol)
    && Number.isFinite(signal.sample_count)
    && signal.sample_count >= minimumSample,
  );
}

function strongest<T extends { observedRate: number; sampleCount: number; symbol: string }>(
  candidates: T[],
): T | null {
  candidates.sort((left, right) =>
    right.observedRate - left.observedRate
    || right.sampleCount - left.sampleCount
    || left.symbol.localeCompare(right.symbol)
    || ("digit" in left && "digit" in right ? Number(left.digit) - Number(right.digit) : 0),
  );
  return candidates[0] ?? null;
}

export function chooseBulkScannerCandidate(
  signals: readonly AiScannerMarketSignal[],
  symbols: readonly string[],
  type: "over-under" | "differs",
  prediction: number,
  minimumSample = AI_SCANNER_MIN_SAMPLE,
): BulkScannerCandidate | null {
  const candidates: BulkScannerCandidate[] = [];

  for (const signal of eligibleSignals(signals, symbols, minimumSample)) {
    const outcome = signal.digit_outcomes?.find((item) => item.digit === prediction);
    if (!outcome) continue;
    const overRate = Number(outcome.over_percentage);
    const underRate = Number(outcome.under_percentage);
    if (!Number.isFinite(overRate) || !Number.isFinite(underRate)) continue;

    if (type === "differs") {
      candidates.push({
        symbol: signal.symbol,
        contractType: "DIGITDIFF",
        barrier: prediction,
        observedRate: overRate + underRate,
        sampleCount: signal.sample_count,
      });
      continue;
    }

    if (prediction < 9) {
      candidates.push({
        symbol: signal.symbol,
        contractType: "DIGITOVER",
        barrier: prediction,
        observedRate: overRate,
        sampleCount: signal.sample_count,
      });
    }
    if (prediction > 0) {
      candidates.push({
        symbol: signal.symbol,
        contractType: "DIGITUNDER",
        barrier: prediction,
        observedRate: underRate,
        sampleCount: signal.sample_count,
      });
    }
  }

  return strongest(candidates);
}

export function chooseDigitFlipScannerCandidate(
  signals: readonly AiScannerMarketSignal[],
  symbols: readonly string[],
  minimumSample = AI_SCANNER_MIN_SAMPLE,
): ParityScannerCandidate | null {
  const candidates = eligibleSignals(signals, symbols, minimumSample).map((signal) => {
    const parity = signal.digit_even_percentage >= signal.digit_odd_percentage
      ? "DIGITEVEN" as const
      : "DIGITODD" as const;
    return {
      symbol: signal.symbol,
      parity,
      observedRate: Math.max(signal.digit_even_percentage, signal.digit_odd_percentage),
      sampleCount: signal.sample_count,
    };
  }).filter((candidate) => Number.isFinite(candidate.observedRate));

  return strongest(candidates);
}

export function chooseTradeXScannerCandidate(
  signals: readonly AiScannerMarketSignal[],
  symbols: readonly string[],
  minimumSample = AI_SCANNER_MIN_SAMPLE,
): TradeXScannerCandidate | null {
  const candidates: TradeXScannerCandidate[] = [];
  for (const signal of eligibleSignals(signals, symbols, minimumSample)) {
    for (const outcome of signal.digit_outcomes ?? []) {
      const overRate = Number(outcome.over_percentage);
      const underRate = Number(outcome.under_percentage);
      if (!Number.isFinite(overRate) || !Number.isFinite(underRate)) continue;
      candidates.push({
        symbol: signal.symbol,
        digit: outcome.digit,
        observedRate: overRate + underRate,
        sampleCount: signal.sample_count,
      });
    }
  }
  return strongest(candidates);
}