import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  chooseBestDigitSignal,
  chooseBestEdgeSignal,
  digitForTick,
  findNewlySettledTrade,
  rankDigitsForDiffers,
  nextStakeAfterSettlement,
  rankDigitsByDistribution,
  sessionStopReason,
  type MarketSignal,
} from "./trading-sequence.ts";

const market = (
  symbol: string,
  quote: number | null,
  sample_count: number,
  over: number,
  under: number,
  digit = 5,
): MarketSignal => ({
  symbol,
  quote,
  sample_count,
  digit_streaks: [{ digit, over, under }],
});

describe("digit-distribution tick selection", () => {
  it("ranks digits from the live distribution with deterministic tie ordering", () => {
    assert.deepEqual(
      rankDigitsByDistribution([2, 8, 3, 8, 0, 1, 3, 0, 0, 1]),
      [1, 3, 2, 6, 0, 5, 9, 4, 7, 8],
    );
  });

  it("maps tick duration to the matching ranked digit position", () => {
    const rankedDigits = [7, 2, 9, 1, 4, 0, 3, 5, 6, 8];
    assert.equal(digitForTick(1, rankedDigits, 5), 7);
    assert.equal(digitForTick(2, rankedDigits, 5), 2);
    assert.equal(digitForTick(3, rankedDigits, 5), 9);
    assert.equal(digitForTick(4, rankedDigits, 5), 1);
    assert.equal(digitForTick(5, rankedDigits, 5), 4);
  });

  it("keeps the configured digit until a live ranking is available", () => {
    assert.equal(digitForTick(1, [], 5), 5);
  });

  it("ranks low-frequency digits first for Digit Differs safe entries", () => {
    assert.deepEqual(
      rankDigitsForDiffers([4, 1, 3, 1, 0, 5, 2, 0, 2, 1], [0, 2, 0, 5, 8, 0, 1, 7, 3, 4]).slice(0, 3),
      [4, 7, 3],
    );
  });
});

describe("martingale settlement sequencing", () => {
  it("multiplies the next stake after a loss", () => {
    assert.equal(nextStakeAfterSettlement(-1.25, 1.25, 1.25, 2.5), 3.13);
  });

  it("resets the next stake to the normal amount after a win", () => {
    assert.equal(nextStakeAfterSettlement(2.5, 3.13, 1.25, 2.5), 1.25);
  });

  it("ignores open and already-known rows when finding a settlement", () => {
    const knownIds = new Set(["old"]);
    assert.deepEqual(
      findNewlySettledTrade(
        [
          { contract_id: "open", status: "open", profit: -1.25 },
          { contract_id: "old", status: "won", profit: 2.5 },
          { contract_id: "new", status: "lost", profit: -1.25 },
        ],
        knownIds,
      ),
      { contract_id: "new", status: "lost", profit: -1.25 },
    );
  });
});

describe("Auto Best Digit selection", () => {
  it("selects the strongest current market, direction, and barrier", () => {
    assert.deepEqual(
      chooseBestDigitSignal(
        [
          market("R_10", 100.1, 20, 2, 1, 3),
          market("R_75", 75.5, 30, 1, 8, 7),
        ],
        market("R_25", 25.2, 40, 9, 1, 2),
      ),
      {
        symbol: "R_75",
        direction: "DIGITUNDER",
        digit: 7,
        streak: 8,
        sampleCount: 30,
      },
    );
  });

  it("uses the latest selected market as a fallback when no market is ready", () => {
    assert.deepEqual(
      chooseBestDigitSignal([], market("R_75", 75.5, 4, 2, 5, 4)),
      {
        symbol: "R_75",
        direction: "DIGITUNDER",
        digit: 4,
        streak: 5,
        sampleCount: 4,
      },
    );
  });
});

describe("Percentage evidence selection", () => {
  it("recommends Dual from combined observed coverage", () => {
    assert.deepEqual(
      chooseBestEdgeSignal(
        [{
          symbol: "R_75",
          quote: 75.5,
          sample_count: 20,
          digit_streaks: [],
          digit_outcomes: [
            { digit: 5, over_percentage: 48, under_percentage: 47 },
            { digit: 1, over_percentage: 95, under_percentage: 5 },
          ],
        }],
        90,
      ),
      {
        symbol: "R_75",
        direction: "DUAL",
        digit: 5,
        score: 95,
        sampleCount: 20,
      },
    );
  });

  it("does not recommend when no observed outcome reaches the floor", () => {
    assert.equal(
      chooseBestEdgeSignal(
        [{
          symbol: "R_75",
          quote: 75.5,
          sample_count: 20,
          digit_streaks: [],
          digit_outcomes: [{ digit: 5, over_percentage: 44, under_percentage: 44 }],
        }],
        90,
      ),
      null,
    );
  });
});

describe("session stop conditions", () => {
  it("stops at take profit or stop loss and keeps running between limits", () => {
    assert.equal(sessionStopReason(10, 10, 10), "take-profit");
    assert.equal(sessionStopReason(-10, 10, 10), "stop-loss");
    assert.equal(sessionStopReason(9.99, 10, 10), null);
  });
});