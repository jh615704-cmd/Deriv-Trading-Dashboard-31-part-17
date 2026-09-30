const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function estimateAccumulatorReturnRate(growthRatePercent: number, ticks: number) {
  const growth = clamp(growthRatePercent, 1, 5) / 100;
  const duration = clamp(ticks, 5, 50);
  return Math.pow(1 + growth, duration) - 1;
}