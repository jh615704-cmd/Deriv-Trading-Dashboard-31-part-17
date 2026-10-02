import assert from "node:assert/strict";
import test from "node:test";
import { buildCashGrabBulkBuyPayload } from "./cash-grab-order.ts";

test("Cash Grab Rise maps to a Deriv CALL payload", () => {
  assert.deepEqual(
    buildCashGrabBulkBuyPayload({
      amount: 0.35,
      duration: 2,
      direction: "CALL",
      symbol: "R_75",
      count: 2,
    }),
    {
      amount: 0.35,
      duration: 2,
      duration_unit: "t",
      contract_type: "CALL",
      symbol: "R_75",
      count: 2,
      confirm_live_trade: true,
    },
  );
});

test("Cash Grab Fall maps to a Deriv PUT payload", () => {
  assert.deepEqual(
    buildCashGrabBulkBuyPayload({
      amount: 1.25,
      duration: 5,
      direction: "PUT",
      symbol: "JD75",
      count: 1,
    }),
    {
      amount: 1.25,
      duration: 5,
      duration_unit: "t",
      contract_type: "PUT",
      symbol: "JD75",
      count: 1,
      confirm_live_trade: true,
    },
  );
});

test("Cash Grab rejects non-Rise/Fall contract types at runtime", () => {
  const invalidInput = {
    amount: 0.35,
    duration: 1,
    direction: "DIGITEVEN",
    symbol: "R_75",
    count: 1,
  };
  assert.throws(
    () => buildCashGrabBulkBuyPayload(invalidInput as never),
    /Cash Grab supports Rise\/Fall contracts only/,
  );
});