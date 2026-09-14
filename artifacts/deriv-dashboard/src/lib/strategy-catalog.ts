export type StrategyFamily = "trade-x" | "edge" | "digit-flip";

export type StrategyDefinition = {
  id: string;
  label: string;
  summary: string;
  logic: string;
  minSample: number;
  maxRate: number;
  minStreak: number;
  requiresTouch?: boolean;
};

const tx = (
  id: string,
  label: string,
  summary: string,
  logic: string,
  minSample: number,
  maxRate: number,
  minStreak: number,
  requiresTouch = false,
): StrategyDefinition => ({ id, label, summary, logic, minSample, maxRate, minStreak, requiresTouch });

export const tradeXStrategies: readonly StrategyDefinition[] = [
  tx("tx-under-5-touch", "Under 5% + market touch", "Wait for a rare digit and its live touch.", "Frequency <= 5% and the selected digit is the latest tick.", 20, 5, 0, true),
  tx("tx-absence-reversion", "Absence reversion", "Use a long absence streak as a review signal.", "Frequency <= 8% with at least 5 ticks absent.", 30, 8, 5),
  tx("tx-low-frequency", "Low-frequency differs", "Prefer the least frequent observed digit.", "Frequency <= 8% after a meaningful sample.", 30, 8, 0),
  tx("tx-double-absence", "Double absence", "Require a sustained absence and a fresh sample.", "Frequency <= 9% and at least 7 ticks absent.", 40, 9, 7),
  tx("tx-cooling-digit", "Cooling digit", "Use a digit whose recent half is cooling.", "Frequency <= 9% with negative recent momentum.", 40, 9, 0),
  tx("tx-flat-reversion", "Flat reversion", "Look for low frequency without an accelerating trend.", "Frequency <= 9% and flat or cooling momentum.", 40, 9, 0),
  tx("tx-rank-one", "Rank-one differs", "Only use the current safest rank.", "Selected digit must be the lowest-frequency digit.", 30, 10, 0),
  tx("tx-rank-two", "Rank-two confirmation", "Use the second safest digit for a less concentrated entry.", "Selected digit must be in the top two safe ranks.", 35, 10, 0),
  tx("tx-touch-after-absence", "Touch after absence", "Require a touch after a visible gap.", "Latest digit matches after at least 3 absent ticks.", 30, 10, 3, true),
  tx("tx-low-rate-streak", "Low rate + streak", "Combine frequency and absence evidence.", "Frequency <= 10% and at least 4 absent ticks.", 35, 10, 4),
  tx("tx-sample-50", "50-tick sample", "Avoid acting on very small samples.", "Frequency <= 9% after 50 or more ticks.", 50, 9, 0),
  tx("tx-sample-75", "75-tick sample", "Use a longer observation window.", "Frequency <= 10% after 75 or more ticks.", 75, 10, 0),
  tx("tx-recent-half", "Recent-half reversal", "Compare recent frequency with the older half.", "The recent half must not be rising.", 40, 10, 0),
  tx("tx-market-touch", "Market touch filter", "Only enable a manual entry at a touch.", "Selected digit must equal the current last digit.", 20, 12, 0, true),
  tx("tx-coldest-third", "Coldest third", "Use one of the three lowest frequencies.", "Selected digit must be in the coldest third.", 30, 11, 0),
  tx("tx-streak-guard", "Streak guard", "Avoid the first tick of a weak signal.", "Require at least 2 absent ticks and frequency <= 10%.", 30, 10, 2),
  tx("tx-low-rate-steady", "Low rate steady", "Prefer stable low frequency.", "Frequency <= 9% with flat momentum.", 45, 9, 0),
  tx("tx-touch-low-rate", "Touch + low rate", "A stricter version of the touch filter.", "Frequency <= 7% and selected digit is latest tick.", 40, 7, 0, true),
  tx("tx-ranked-sample", "Ranked sample gate", "Require both ranking and sample depth.", "Top-three safe rank after 60 ticks.", 60, 11, 0),
  tx("tx-conservative-differs", "Conservative differs", "The strictest built-in differs filter.", "Frequency <= 6%, at least 50 ticks, and no rising momentum.", 50, 6, 0),
];

export const edgeStrategies: readonly StrategyDefinition[] = [
  tx("edge-streak-break", "Streak break", "Wait for a mature Over/Under streak before reviewing.", "Direction rate <= 45% with a 4-tick opposing streak.", 30, 45, 4),
  tx("edge-two-three-follow", "Two/three follow-through", "Observe two or three matching digits before reviewing.", "At least 2 recent digits support the selected direction.", 25, 48, 2),
  tx("edge-underrepresented", "Underrepresented side", "Prefer the less represented side of the barrier.", "Selected direction rate must be <= 45%.", 25, 45, 0),
  tx("edge-touch-confirmation", "Barrier touch confirmation", "Require a current barrier touch before review.", "Latest digit equals the selected barrier.", 20, 48, 0, true),
  tx("edge-over-cooling", "Over cooling", "Review Over after a cooling above-barrier sample.", "Over rate <= 48% and recent Over momentum is not rising.", 35, 48, 0),
  tx("edge-under-cooling", "Under cooling", "Review Under after a cooling below-barrier sample.", "Under rate <= 48% and recent Under momentum is not rising.", 35, 48, 0),
  tx("edge-four-streak", "Four-tick streak", "Use a four-tick directional streak as context.", "At least 4 recent ticks support the selected direction.", 35, 55, 4),
  tx("edge-five-streak", "Five-tick streak", "Use a deeper streak with a larger sample.", "At least 5 recent ticks support the selected direction.", 45, 55, 5),
  tx("edge-sample-50", "50-tick balance", "Avoid small-sample direction calls.", "At least 50 ticks and direction rate <= 47%.", 50, 47, 0),
  tx("edge-sample-75", "75-tick balance", "Use a longer direction window.", "At least 75 ticks and direction rate <= 49%.", 75, 49, 0),
  tx("edge-reversion", "Barrier reversion", "Review the side that has recently cooled.", "Selected side is below 48% after a non-rising recent half.", 40, 48, 0),
  tx("edge-low-side", "Low-side filter", "Use the side with the lower observed share.", "Selected direction must be the lower of Over and Under.", 30, 50, 0),
  tx("edge-touch-streak", "Touch + streak", "Combine a touch with a mature streak.", "Barrier touch plus at least 2 supporting ticks.", 35, 52, 2, true),
  tx("edge-two-step", "Two-step confirmation", "Wait for two independent signal checks.", "Direction rate <= 46% and at least 30 ticks.", 30, 46, 0),
  tx("edge-three-step", "Three-step confirmation", "Use a stricter sample gate.", "Direction rate <= 45% after 60 ticks.", 60, 45, 0),
  tx("edge-quiet-side", "Quiet side", "Prefer a quieter side of the barrier.", "Selected direction rate <= 44% after 40 ticks.", 40, 44, 0),
  tx("edge-range-guard", "Range guard", "Avoid extreme, tiny samples.", "Direction rate between 35% and 48% after 40 ticks.", 40, 48, 0),
  tx("edge-last-digit", "Last-digit context", "Use the last digit as context, not certainty.", "Barrier touch or direction rate <= 45%.", 25, 45, 0, true),
  tx("edge-ranked-signal", "Ranked signal", "Use the strongest available streak with a sample floor.", "At least 50 ticks and a 3-tick directional streak.", 50, 52, 3),
  tx("edge-conservative", "Conservative Over/Under", "The strictest built-in EDGE review filter.", "At least 75 ticks, direction rate <= 44%, and 3-tick support.", 75, 44, 3),
];

export const digitFlipStrategies: readonly StrategyDefinition[] = [
  tx("flip-balanced", "Balanced parity", "Review near-balanced parity samples.", "Even or Odd rate between 45% and 55%.", 30, 55, 0),
  tx("flip-even-low", "Even low-rate", "Review Even when its observed share is low.", "Even rate <= 45% after a meaningful sample.", 30, 45, 0),
  tx("flip-odd-low", "Odd low-rate", "Review Odd when its observed share is low.", "Odd rate <= 45% after a meaningful sample.", 30, 45, 0),
  tx("flip-two-follow", "Two parity follow-through", "Require two recent matching parity digits.", "At least 2 recent digits match the selected parity.", 25, 55, 2),
  tx("flip-three-follow", "Three parity follow-through", "Require three recent matching parity digits.", "At least 3 recent digits match the selected parity.", 35, 55, 3),
  tx("flip-four-follow", "Four parity follow-through", "Use a deeper parity run as context.", "At least 4 recent digits match the selected parity.", 45, 55, 4),
  tx("flip-even-streak", "Even streak", "Review Even after an observed Even run.", "Even is selected with a 3-digit recent streak.", 30, 60, 3),
  tx("flip-odd-streak", "Odd streak", "Review Odd after an observed Odd run.", "Odd is selected with a 3-digit recent streak.", 30, 60, 3),
  tx("flip-absence", "Parity absence", "Review a parity that has been absent briefly.", "Selected parity has at least 3 ticks absent.", 25, 55, 3),
  tx("flip-touch", "Parity touch", "Require the latest digit to match selected parity.", "Latest digit matches Even or Odd selection.", 20, 55, 0, true),
  tx("flip-sample-50", "50-tick parity", "Avoid shallow parity samples.", "At least 50 ticks and selected rate <= 52%.", 50, 52, 0),
  tx("flip-sample-75", "75-tick parity", "Use a longer parity sample.", "At least 75 ticks and selected rate <= 54%.", 75, 54, 0),
  tx("flip-recent-balance", "Recent balance", "Compare the recent half with the full sample.", "Recent parity share is not accelerating.", 40, 55, 0),
  tx("flip-alternation", "Alternation context", "Use alternating parity as descriptive context.", "The last 4 ticks contain both parities.", 25, 55, 0),
  tx("flip-run-break", "Run-break review", "Review after a run changes parity.", "A 3+ run has just ended.", 30, 55, 3),
  tx("flip-low-side", "Lower-share parity", "Select the lower observed parity share.", "Selected parity must be the lower side.", 30, 50, 0),
  tx("flip-market-touch", "Market touch parity", "Use the current digit as a final confirmation.", "Latest tick matches selected parity and rate <= 55%.", 30, 55, 0, true),
  tx("flip-steady", "Steady parity", "Prefer parity without a rising recent trend.", "Selected rate <= 55% and recent share is steady.", 40, 55, 0),
  tx("flip-ranked", "Ranked parity", "Use a lower-share parity with sample depth.", "Lower-share parity after at least 60 ticks.", 60, 52, 0),
  tx("flip-conservative", "Conservative DigitFlip", "The strictest built-in parity review filter.", "At least 75 ticks, selected rate <= 52%, and recent support.", 75, 52, 2),
];

export function strategiesFor(family: StrategyFamily) {
  if (family === "trade-x") return tradeXStrategies;
  if (family === "edge") return edgeStrategies;
  return digitFlipStrategies;
}

export function evaluateStrategy(
  strategy: StrategyDefinition,
  context: {
    sample: number;
    rate: number;
    streak: number;
    recentSupport: number;
    marketTouch: boolean;
  },
) {
  const sampleReady = context.sample >= strategy.minSample;
  const rateReady = context.rate <= strategy.maxRate;
  const streakReady = context.streak >= strategy.minStreak;
  const touchReady = !strategy.requiresTouch || context.marketTouch;
  const confidence = Math.max(
    0,
    Math.min(99, Math.round(100 - context.rate + Math.min(context.streak, 10) * 1.5)),
  );
  return {
    eligible: sampleReady && rateReady && streakReady && touchReady,
    confidence,
    reason: !sampleReady
      ? `Collect ${strategy.minSample - context.sample} more ticks`
      : !rateReady
        ? `Rate must be ${strategy.maxRate}% or lower`
        : !streakReady
          ? `Need ${strategy.minStreak} supporting ticks`
          : !touchReady
            ? "Waiting for the live market touch"
            : "Strategy conditions met",
  };
}