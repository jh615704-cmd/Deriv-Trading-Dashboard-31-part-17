import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseBulkScannerCandidate,
  chooseDigitFlipScannerCandidate,
  chooseTradeXScannerCandidate,
  type AiScannerMarketSignal,
} from "./ai-market-scanner.ts";

function signal(
  symbol: string,
  sampleCount: number,
  outcomes: Array<{ digit: number; over_percentage: number; under_percentage: number }>,
  even = 50,
  odd = 50,
): AiScannerMarketSignal {
  return {
    symbol,
    sample_count: sampleCount,
    digit_even_percentage: even,
    digit_odd_percentage: odd,
    digit_outcomes: outcomes,
  };
}

test("Bulk Trader scans all eligible pairs using the selected Over/Under barrier", () => {
  const candidate = chooseBulkScannerCandidate([
    signal("R_10", 50, [{ digit: 4, over_percentage: 48, under_percentage: 42 }]),
    signal("JD25", 80, [{ digit: 4, over_percentage: 68, under_percentage: 25 }]),
  ], ["R_10", "JD25"], "over-under", 4);

  assert.deepEqual(candidate, {
    symbol: "JD25",
    contractType: "DIGITOVER",
    barrier: 4,
    observedRate: 68,
    sampleCount: 80,
  });
});

test("Bulk Trader picks the observed Differs rate and the valid side of edge barriers", () => {
  const differs = chooseBulkScannerCandidate([
    signal("R_10", 40, [{ digit: 5, over_percentage: 41, under_percentage: 48 }]),
    signal("JD25", 40, [{ digit: 5, over_percentage: 45, under_percentage: 50 }]),
  ], ["R_10", "JD25"], "differs", 5);
  const edgeBarrier = chooseBulkScannerCandidate([
    signal("R_10", 40, [{ digit: 9, over_percentage: 0, under_percentage: 92 }]),
  ], ["R_10"], "over-under", 9);

  assert.equal(differs?.symbol, "JD25");
  assert.equal(differs?.contractType, "DIGITDIFF");
  assert.equal(differs?.barrier, 5);
  assert.equal(edgeBarrier?.contractType, "DIGITUNDER");
  assert.equal(edgeBarrier?.barrier, 9);
});

test("DigitFlip selects the strongest eligible observed parity without inventing a threshold", () => {
  const candidate = chooseDigitFlipScannerCandidate([
    signal("R_10", 30, [], 58, 42),
    signal("JD25", 80, [], 47, 53),
  ], ["R_10", "JD25"]);

  assert.equal(candidate?.symbol, "R_10");
  assert.equal(candidate?.parity, "DIGITEVEN");
  assert.equal(candidate?.observedRate, 58);
});

test("Trade X ranks the least frequent observed digit across eligible markets", () => {
  const candidate = chooseTradeXScannerCandidate([
    signal("R_10", 30, [{ digit: 2, over_percentage: 80, under_percentage: 12 }]),
    signal("JD25", 80, [{ digit: 7, over_percentage: 44, under_percentage: 52 }]),
  ], ["R_10", "JD25"]);

  assert.equal(candidate?.symbol, "JD25");
  assert.equal(candidate?.digit, 7);
  assert.equal(candidate?.observedRate, 96);
});

test("all scanners ignore undersampled or unsupported markets", () => {
  const candidate = chooseDigitFlipScannerCandidate([
    signal("R_10", 19, [], 99, 1),
    signal("JD25", 100, [], 98, 2),
  ], ["R_10"]);

  assert.equal(candidate, null);
});