import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { estimateAccumulatorReturnRate } from "./money-bank-math.ts";

describe("Money Bank Accumulator return estimates", () => {
  it("uses the selected growth and tick count without imposing an 8% payout floor", () => {
    assert.equal(estimateAccumulatorReturnRate(1, 5), Math.pow(1.01, 5) - 1);
  });

  it("keeps the full theoretical return at the highest supported settings", () => {
    assert.equal(estimateAccumulatorReturnRate(5, 50), Math.pow(1.05, 50) - 1);
  });
});