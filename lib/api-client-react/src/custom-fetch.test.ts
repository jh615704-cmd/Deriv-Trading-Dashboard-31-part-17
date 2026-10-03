import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { ApiTransportError, customFetch } from "./custom-fetch.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("customFetch transport recovery", () => {
  it("retries a safe read once with the same request reference", async () => {
    let calls = 0;
    const requestIds: string[] = [];
    globalThis.fetch = (async (_input, init) => {
      calls += 1;
      requestIds.push(new Headers(init?.headers).get("x-client-request-id") ?? "");
      if (calls === 1) throw new TypeError("Failed to fetch");
      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const response = await customFetch<{ status: string }>("/api/healthz");

    assert.deepEqual(response, { status: "ok" });
    assert.equal(calls, 2);
    assert.ok(requestIds[0]);
    assert.equal(requestIds[0], requestIds[1]);
  });

  it("does not replay an interrupted trade and explains how to verify its outcome", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;

    await assert.rejects(
      customFetch("/api/deriv/bulk-buy", {
        method: "POST",
        body: JSON.stringify({ amount: 1 }),
      }),
      (error: unknown) => {
        assert.ok(error instanceof ApiTransportError);
        assert.equal(error.tradeOutcomeUncertain, true);
        assert.match(error.message, /contract may already be open/i);
        assert.match(error.message, /Refresh Deriv history before sending it again/i);
        assert.doesNotMatch(error.message, /^Failed to fetch$/);
        assert.ok(error.requestId);
        return true;
      },
    );

    assert.equal(calls, 1);
  });
});