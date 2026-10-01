import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getAccountBalance } from "./account-balance.ts";

describe("getAccountBalance", () => {
  it("safely handles missing accounts and missing balances", () => {
    assert.equal(getAccountBalance(undefined), undefined);
    assert.equal(getAccountBalance(null), undefined);
    assert.equal(getAccountBalance({}), undefined);
  });

  it("accepts finite non-negative account balances", () => {
    assert.equal(getAccountBalance({ balance: 0 }), 0);
    assert.equal(getAccountBalance({ balance: 12.5 }), 12.5);
  });

  it("rejects invalid balances", () => {
    assert.equal(getAccountBalance({ balance: Number.NaN }), undefined);
    assert.equal(getAccountBalance({ balance: Number.POSITIVE_INFINITY }), undefined);
    assert.equal(getAccountBalance({ balance: -1 }), undefined);
    assert.equal(getAccountBalance({ balance: "12.5" }), undefined);
  });
});