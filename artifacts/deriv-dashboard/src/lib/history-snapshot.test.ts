import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readCachedHistorySnapshot } from "./history-snapshot.ts";

describe("readCachedHistorySnapshot", () => {
  it("uses newly loaded rows when history is available", async () => {
    const cachedRows = [{ contract_id: "cached" }];
    const latestRows = [{ contract_id: "latest" }];

    const snapshot = await readCachedHistorySnapshot(
      async () => latestRows,
      cachedRows,
    );

    assert.deepEqual(snapshot, { rows: latestRows, fresh: true });
  });

  it("returns cached rows as stale instead of failing when history is unavailable", async () => {
    const cachedRows = [{ contract_id: "cached" }];

    const snapshot = await readCachedHistorySnapshot(
      async () => {
        throw new Error("Unable to load Deriv history");
      },
      cachedRows,
    );

    assert.deepEqual(snapshot, { rows: cachedRows, fresh: false });
  });
});