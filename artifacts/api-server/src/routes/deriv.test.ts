import express from "express";
import { createServer } from "node:http";
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { GetDerivStatusResponse } from "@workspace/api-zod";

process.env.DERIV_API_TOKEN = "workspace-secret-fallback";

type Credential = {
  clerkUserId: string;
  encryptedPat: string;
  expiresAt: string | null;
  lastVerifiedAt: Date | null;
};

type QueryCondition = { value: string };

const credentials = new Map<string, Credential>();
const userPats = new Map<string, string>();
const observedPats: string[] = [];
const historyRows: unknown[] = [];
const sessionId = "admin-access-session";

const db = {
  select() {
    return {
      from() {
        return {
          where(condition: QueryCondition) {
            return {
              async limit() {
                const credential = credentials.get(condition.value);
                return credential ? [credential] : [];
              },
            };
          },
        };
      },
    };
  },
  delete() {
    return {
      async where(condition: QueryCondition) {
        credentials.delete(condition.value);
      },
    };
  },
};

mock.module("@workspace/db", {
  namedExports: {
    db,
    derivCredentialsTable: { clerkUserId: "clerkUserId" },
  },
});

mock.module("drizzle-orm", {
  namedExports: {
    eq: (_column: unknown, value: string): QueryCondition => ({ value }),
  },
});

function observePat() {
  const pat = userPats.get(sessionId);
  assert.ok(pat, "the route operation should have an authenticated PAT");
  observedPats.push(pat);
}

const status = {
  connected: true,
  authorized: true,
  account: {
    id: "DOT123",
    type: "demo" as const,
    currency: "USD",
    balance: 100,
    status: "active",
  },
  bot_running: false,
  symbol: "R_75",
  currency: "USD",
  max_trade_amount: 10,
  market_signals: [],
};
const statusParse = GetDerivStatusResponse.safeParse(status);
assert.equal(statusParse.success, true, JSON.stringify(statusParse));

mock.module("../lib/deriv", {
  namedExports: {
    DerivCredentialError: class DerivCredentialError extends Error {},
    getAccounts: async () => {
      observePat();
      return [status.account];
    },
    getStatus: async () => {
      observePat();
      return status;
    },
    getLiveStatus: async () => {
      observePat();
      return status;
    },
    getHistory: async () => {
      observePat();
      return historyRows;
    },
    clearHistory: async () => {
      observePat();
      return { success: true };
    },
    requestProposal: async () => {
      observePat();
      return { ok: true, message: "proposal requested" };
    },
    buyContract: async () => {
      observePat();
      return { ok: true, message: "contract bought", proposal: null, buy: null };
    },
    sellContract: async () => {
      observePat();
      return { ok: true, contract_id: "contract-1", sold_for: 1 };
    },
    bulkBuyContracts: async () => {
      observePat();
      return { ok: true, message: "contracts bought", count: 1, results: [] };
    },
    dualBuyContracts: async () => {
      observePat();
      return { ok: true, message: "contracts bought", count: 2, results: [] };
    },
    selectAccount: async () => {
      observePat();
      return status;
    },
    selectSymbol: async () => {
      observePat();
      return status;
    },
    testConnection: async () => {
      observePat();
      return { ok: true, message: "connected", accounts: [status.account], status };
    },
    withUser: async (_userId: string, operation: () => Promise<unknown>) => operation(),
    withUserSerialized: async (_userId: string, operation: () => Promise<unknown>) => operation(),
    setUserPat: (userId: string, pat: string) => {
      userPats.set(userId, pat);
    },
    disposeUser: (userId: string) => {
      userPats.delete(userId);
    },
  },
});

const { encryptPat } = await import("../lib/pat-crypto.ts");
const { default: derivRouter } = await import("./deriv.ts");
const { default: tokenRouter } = await import("./token.ts");

const app = express();
app.use(express.json());
app.use((_req, res, next) => {
  res.locals.userId = sessionId;
  next();
});
app.use(derivRouter);
app.use(tokenRouter);

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

test("admin Deriv routes require the session PAT and forget it on disconnect", async () => {
  userPats.set(sessionId, "prior-session-pat");
  observedPats.length = 0;
  credentials.clear();

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const missingCredentialResponse = await fetch(`${baseUrl}/deriv/accounts`);
    assert.equal(missingCredentialResponse.status, 401);
    assert.deepEqual(await readJson(missingCredentialResponse), { error: "Connect a Deriv token first" });
    assert.deepEqual(observedPats, []);

    const enteredPat = "explicitly-entered-pat";
    credentials.set(sessionId, {
      clerkUserId: sessionId,
      encryptedPat: encryptPat(enteredPat),
      expiresAt: null,
      lastVerifiedAt: new Date(),
    });

    const accountsResponse = await fetch(`${baseUrl}/deriv/accounts`);
    assert.equal(accountsResponse.status, 200);

    const statusResponse = await fetch(`${baseUrl}/deriv/status`);
    assert.equal(statusResponse.status, 200, JSON.stringify(await readJson(statusResponse)));

    const proposalResponse = await fetch(`${baseUrl}/deriv/proposals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: 1,
        duration: 1,
        duration_unit: "t",
        contract_type: "DIGITDIFF",
        barrier: 5,
        symbol: "R_75",
      }),
    });
    assert.equal(proposalResponse.status, 202);

    const buyResponse = await fetch(`${baseUrl}/deriv/buy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: 1,
        duration: 1,
        duration_unit: "t",
        contract_type: "DIGITDIFF",
        barrier: 5,
        symbol: "R_75",
        confirm_live_trade: true,
      }),
    });
    assert.equal(buyResponse.status, 202);
    assert.deepEqual(observedPats, [enteredPat, enteredPat, enteredPat, enteredPat]);

    const disconnectResponse = await fetch(`${baseUrl}/token`, { method: "DELETE" });
    assert.equal(disconnectResponse.status, 200);
    assert.equal(userPats.has(sessionId), false);
    assert.equal(credentials.has(sessionId), false);

    const afterDisconnectResponse = await fetch(`${baseUrl}/deriv/accounts`);
    assert.equal(afterDisconnectResponse.status, 401);
    assert.deepEqual(await readJson(afterDisconnectResponse), { error: "Connect a Deriv token first" });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("history route accepts decimal Rise/Fall price barriers outside the digit range", async () => {
  const enteredPat = "history-route-test-pat";
  observedPats.length = 0;
  credentials.clear();
  userPats.delete(sessionId);
  historyRows.splice(0, historyRows.length, {
    contract_id: "rise-contract-1",
    account_id: "DOT123",
    account_type: "demo",
    currency: "USD",
    contract_type: "CALL",
    barrier: 12_345.678,
    symbol: "R_75",
    buy_price: 1,
    current_value: 1.25,
    payout: 1.95,
    profit: 0.25,
    status: "open",
  });
  credentials.set(sessionId, {
    clerkUserId: sessionId,
    encryptedPat: encryptPat(enteredPat),
    expiresAt: null,
    lastVerifiedAt: new Date(),
  });

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/deriv/history`);
    assert.equal(response.status, 200);
    const history = await response.json() as Array<{ barrier: number | null }>;
    assert.equal(history[0]?.barrier, 12_345.678);
    assert.deepEqual(observedPats, [enteredPat]);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    historyRows.length = 0;
    credentials.clear();
    userPats.delete(sessionId);
  }
});