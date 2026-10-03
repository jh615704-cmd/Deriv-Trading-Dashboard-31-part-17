import { EventEmitter } from "node:events";
import { performance } from "node:perf_hooks";
import { after, before, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";

process.env.DERIV_APP_ID = "test-app";
process.env.DERIV_SYMBOL = "R_75";
process.env.DERIV_CURRENCY = "USD";

type SocketMessage = Record<string, any>;
type BuyBehavior = "ack" | "reject" | "disconnect";

let buyBehavior: BuyBehavior = "ack";
let proposalNumber = 0;
let proposalPayoutOverride: number | null = null;
let buyPayoutOverride: number | null = null;
const sockets: FakeWebSocket[] = [];
const testUserIds = new Set<string>();
let mockPortfolioContracts: SocketMessage[] = [];
const buySendCountsAtAck: number[] = [];

class FakeWebSocket extends EventEmitter {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly url: string;
  readonly sent: SocketMessage[] = [];
  readyState = FakeWebSocket.CONNECTING;

  constructor(url: string) {
    super();
    this.url = url;
    sockets.push(this);
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.OPEN;
      this.emit("open");
    });
  }

  send(raw: string) {
    const message = JSON.parse(raw) as SocketMessage;
    this.sent.push(message);
    queueMicrotask(() => handleClientMessage(this, message));
  }

  close() {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSING;
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.CLOSED;
      this.emit("close");
    });
  }
}

mock.module("ws", {
  defaultExport: FakeWebSocket,
});

const deriv = await import("./deriv.ts");

function emitMessage(socket: FakeWebSocket, message: SocketMessage) {
  socket.emit("message", Buffer.from(JSON.stringify(message)));
}

function handleClientMessage(socket: FakeWebSocket, message: SocketMessage) {
  if (message.portfolio) {
    emitMessage(socket, {
      msg_type: "portfolio",
      portfolio: { contracts: mockPortfolioContracts },
    });
    return;
  }

  if (message.proposal) {
    proposalNumber += 1;
    const proposalId = `proposal-${proposalNumber}`;
    if (proposalNumber === 1) {
      emitMessage(socket, {
        msg_type: "proposal",
        proposal: {
          id: "stale-proposal",
          ask_price: 99,
          payout: 999,
          spot: 1,
        },
      });
    }
    emitMessage(socket, {
      msg_type: "proposal",
      req_id: message.req_id,
      proposal: {
        id: proposalId,
        ask_price: 1.25 + proposalNumber,
        payout: proposalPayoutOverride ?? 2.5 + proposalNumber,
        spot: 75.5,
        longcode: `proposal ${proposalNumber}`,
      },
    });
    return;
  }

  if (!message.buy) return;
  if (buyBehavior === "reject") {
    emitMessage(socket, {
      error: { code: "ContractBuyFailure", message: "buy rejected by Deriv" },
      echo_req: { buy: message.buy },
    });
    return;
  }
  if (buyBehavior === "disconnect") {
    socket.close();
    return;
  }

  buySendCountsAtAck.push(socket.sent.filter((sent) => sent.buy).length);
  emitMessage(socket, {
    msg_type: "buy",
    ...(message.req_id == null ? {} : { req_id: message.req_id }),
    echo_req: {
      buy: message.buy,
      ...(message.req_id == null ? {} : { req_id: message.req_id }),
    },
    buy: {
      contract_id: `contract-${message.buy === "1" ? message.req_id ?? message.buy : message.buy}`,
      buy_price: message.price,
      payout: buyPayoutOverride ?? 4.5,
      start_time: 1_700_000_000,
    },
  });
}

function mockDerivRest() {
  mock.method(globalThis, "fetch", async (input: URL | string | Request) => {
    const url = String(input);
    if (url.endsWith("/trading/v1/options/accounts")) {
      return Response.json({
        data: [
          {
            account_id: "DOT123",
            account_type: "demo",
            currency: "USD",
            balance: 100,
            status: "active",
          },
          {
            account_id: "CR123",
            account_type: "real",
            currency: "EUR",
            balance: 250,
            status: "active",
          },
        ],
      });
    }
    if (url.endsWith("/trading/v1/options/accounts/DOT123/otp") || url.endsWith("/trading/v1/options/accounts/CR123/otp")) {
      return Response.json({ data: { url: "wss://fake.deriv.test/options" } });
    }
    throw new Error(`Unexpected REST request: ${url}`);
  });
}

async function inUser<T>(userId: string, operation: () => Promise<T>) {
  testUserIds.add(userId);
  deriv.setUserPat(userId, "test-pat");
  return deriv.withUser(userId, operation);
}

async function withSelectedAccount<T>(userId: string, operation: () => Promise<T>) {
  return inUser(userId, async () => {
    if (!deriv.getStatus().account) await deriv.selectAccount("DOT123");
    return operation();
  });
}

function latestSocket() {
  const socket = sockets.at(-1);
  assert.ok(socket, "expected an authenticated WebSocket");
  return socket;
}

before(() => {
  mockDerivRest();
});

beforeEach(() => {
  for (const userId of testUserIds) deriv.disposeUser(userId);
  testUserIds.clear();
  buyBehavior = "ack";
  proposalNumber = 0;
  proposalPayoutOverride = null;
  buyPayoutOverride = null;
  mockPortfolioContracts = [];
  buySendCountsAtAck.length = 0;
  sockets.length = 0;
});

after(() => {
  deriv.stopDeriv();
});

describe("Deriv per-process session capacity", { concurrency: false }, () => {
  test("supports staged 1, 2, and 4 mock sessions and rejects a fifth without trading", async () => {
    const baselineRss = process.memoryUsage().rss;
    const stages: Array<{
      sessions: number;
      elapsedMs: number;
      rssMiB: number;
      openSockets: number;
    }> = [];
    const openedUsers: string[] = [];

    for (const target of [1, 2, 4]) {
      const pendingUsers = Array.from(
        { length: target - openedUsers.length },
        (_, index) => `capacity-load-${target}-${index}`,
      );
      const startedAt = performance.now();
      await Promise.all(
        pendingUsers.map(async (userId) => {
          await inUser(userId, () => deriv.selectAccount("DOT123"));
          openedUsers.push(userId);
        }),
      );
      const memory = process.memoryUsage();
      const openSockets = sockets.filter(
        (socket) => socket.readyState === FakeWebSocket.OPEN,
      ).length;

      assert.equal(openSockets, target);
      stages.push({
        sessions: target,
        elapsedMs: Math.round(performance.now() - startedAt),
        rssMiB: Math.round((memory.rss / 1024 / 1024) * 10) / 10,
        openSockets,
      });
    }

    assert.throws(
      () => deriv.setUserPat("capacity-load-overflow", "test-pat"),
      (error: unknown) => error instanceof deriv.DerivCapacityError,
    );
    assert.equal(
      sockets.filter((socket) => socket.readyState === FakeWebSocket.OPEN).length,
      4,
    );
    assert.equal(
      sockets.some((socket) =>
        socket.sent.some((message) => message.buy || message.sell),
      ),
      false,
      "the capacity test must not submit trade messages",
    );

    console.log(JSON.stringify({
      test: "mocked_deriv_session_capacity",
      baselineRssMiB: Math.round((baselineRss / 1024 / 1024) * 10) / 10,
      stages,
      fifthSessionRejected: true,
      tradeMessagesSent: 0,
    }));
  });
});

describe("Deriv market subscriptions", { concurrency: false }, () => {
  test("selecting an already-subscribed market does not send a duplicate subscription", async () => {
    await withSelectedAccount("market-subscription-user", async () => {
      const socket = latestSocket();
      const countSubscriptionsFor = (symbol: string) =>
        socket.sent.filter(
          (message) => message.ticks === symbol && message.subscribe === 1,
        ).length;

      assert.equal(countSubscriptionsFor("R_50"), 1);
      const status = await deriv.selectSymbol("R_50");

      assert.equal(status.symbol, "R_50");
      assert.equal(countSubscriptionsFor("R_50"), 1);
    });
  });
});

describe("Deriv buy acknowledgement safety", { concurrency: false }, () => {
  test("omits expiry fields and forwards decimal growth for Accumulator contracts", async () => {
    const result = await withSelectedAccount("accumulator-user", () => deriv.buyContract({
      amount: 1,
      duration: 5,
      duration_unit: "t",
      contract_type: "ACCU",
      growth_rate: 0.04,
      symbol: "1HZ90V",
      confirm_live_trade: true,
    }));

    assert.equal(result.buy.contract_id, "contract-proposal-1");
    const socket = latestSocket();
    const proposalRequest = socket.sent.find((message) => message.proposal);
    assert.ok(proposalRequest);
    assert.equal(proposalRequest.contract_type, "ACCU");
    assert.equal(proposalRequest.growth_rate, 0.04);
    assert.equal(proposalRequest.duration, undefined);
    assert.equal(proposalRequest.duration_unit, undefined);
    assert.equal(proposalRequest.date_expiry, undefined);
    assert.deepEqual(proposalRequest.limit_order, { take_profit: 0.22 });
  });

  test("keeps the requested tick count out of the ACCU proposal payload", async () => {
    const result = await withSelectedAccount("accumulator-duration-fallback-user", () => deriv.buyContract({
      amount: 1,
      duration: 5,
      duration_unit: "t",
      contract_type: "ACCU",
      growth_rate: 0.04,
      symbol: "1HZ90V",
      confirm_live_trade: true,
    }));

    assert.equal(result.buy.contract_id, "contract-proposal-1");
    const socket = latestSocket();
    const proposalRequests = socket.sent.filter((message) => message.proposal);
    assert.equal(proposalRequests.length, 1);
    assert.equal(proposalRequests[0].duration, undefined);
    assert.equal(proposalRequests[0].duration_unit, undefined);
    assert.equal(proposalRequests[0].date_expiry, undefined);
    assert.deepEqual(proposalRequests[0].limit_order, { take_profit: 0.22 });
    assert.equal(proposalRequests[0].growth_rate, 0.04);
  });

  test("rounds Accumulator stakes before Deriv receives the proposal", async () => {
    await withSelectedAccount("accumulator-rounding-user", () => deriv.buyContract({
      amount: 1.239,
      duration: 5,
      duration_unit: "t",
      contract_type: "ACCU",
      growth_rate: 0.04,
      symbol: "1HZ90V",
      confirm_live_trade: true,
    }));

    const proposalRequest = latestSocket().sent.find((message) => message.proposal);
    assert.ok(proposalRequest);
    assert.equal(proposalRequest.amount, 1.24);
    assert.deepEqual(proposalRequest.limit_order, { take_profit: 0.27 });
  });

  test("uses the same ACCU parameters for bulk direct buys", async () => {
    const result = await withSelectedAccount("accumulator-bulk-user", () => deriv.bulkBuyContracts({
      amount: 1,
      duration: 5,
      duration_unit: "t",
      contract_type: "ACCU",
      growth_rate: 0.04,
      symbol: "1HZ90V",
      count: 1,
      confirm_live_trade: true,
    }));

    assert.equal(result.count, 1);
    const socket = latestSocket();
    const proposalRequest = socket.sent.find((message) => message.proposal);
    const buyRequest = socket.sent.find((message) => message.buy === "1");
    assert.ok(proposalRequest);
    assert.ok(buyRequest);
    assert.equal(buyRequest.parameters.growth_rate, 0.04);
    assert.equal(buyRequest.parameters.contract_type, "ACCU");
    assert.equal(buyRequest.parameters.date_expiry, undefined);
    assert.equal(buyRequest.parameters.duration, undefined);
    assert.equal(buyRequest.parameters.duration_unit, undefined);
    assert.deepEqual(buyRequest.parameters.limit_order, { take_profit: 0.22 });
  });

  test("allows 10-tick Rise/Fall bulk contracts and rejects longer digit contracts", async () => {
    const result = await withSelectedAccount("rise-fall-ten-tick-user", () => deriv.bulkBuyContracts({
      amount: 1,
      duration: 10,
      duration_unit: "t",
      contract_type: "CALL",
      symbol: "R_75",
      count: 1,
      confirm_live_trade: true,
    }));

    assert.equal(result.count, 1);
    const proposalRequest = latestSocket().sent.find((message) => message.proposal);
    const buyRequest = latestSocket().sent.find((message) => message.buy === "1");
    assert.equal(proposalRequest?.duration, 10);
    assert.equal(buyRequest?.parameters.duration, 10);

    await assert.rejects(
      () => withSelectedAccount("digit-ten-tick-user", () => deriv.bulkBuyContracts({
        amount: 1,
        duration: 10,
        duration_unit: "t",
        contract_type: "DIGITDIFF",
        barrier: 5,
        symbol: "R_75",
        count: 1,
        confirm_live_trade: true,
      })),
      /Tick durations above 5 are only supported for Rise\/Fall contracts/,
    );
  });

  test("correlates proposal and buy acknowledgements and tracks open history before settlement", async () => {
    const result = await withSelectedAccount("correlation-user", () => deriv.buyContract({
      amount: 1,
      duration: 1,
      duration_unit: "t",
      contract_type: "DIGITDIFF",
      barrier: 5,
      symbol: "R_75",
      confirm_live_trade: true,
    }));

    assert.equal(result.proposal.id, "proposal-1");
    assert.equal(result.buy.contract_id, "contract-proposal-1");
    const socket = latestSocket();
    const buyRequest = socket.sent.find((message) => message.buy);
    assert.deepEqual(buyRequest, { buy: "proposal-1", price: 2.25 });

    await inUser("correlation-user", async () => {
      assert.deepEqual(deriv.getHistory(), [{
        contract_id: "contract-proposal-1",
        account_id: "DOT123",
        account_type: "demo",
        currency: "USD",
        contract_type: "DIGITDIFF",
        barrier: 5,
        symbol: "R_75",
        buy_price: 2.25,
         current_value: 2.25,
        payout: 4.5,
        profit: 0,
        status: "open",
        buy_time: 1_700_000_000,
        sell_time: null,
      }]);

       emitMessage(socket, {
         msg_type: "proposal_open_contract",
         proposal_open_contract: {
           contract_id: "contract-proposal-1",
           status: "open",
           is_sold: false,
           buy_price: 2.25,
           bid_price: 2.8,
           payout: 4.5,
           profit: 0.55,
         },
       });

       assert.equal(deriv.getHistory()[0].status, "open");
       assert.equal(deriv.getHistory()[0].current_value, 2.8);
       assert.equal(deriv.getHistory()[0].profit, 0.55);

      emitMessage(socket, {
        msg_type: "proposal_open_contract",
        proposal_open_contract: {
          contract_id: "contract-proposal-1",
          status: "won",
          is_sold: true,
          buy_price: 2.25,
          payout: 4.5,
          sell_price: 4.5,
          profit: 2.25,
          entry_spot: 75.5,
          current_spot: 75.6,
          expiry_time: 1_700_000_001,
          sell_time: 1_700_000_001,
        },
      });

      assert.equal(deriv.getHistory()[0].status, "won");
      assert.equal(deriv.getHistory()[0].profit, 2.25);
       assert.equal(deriv.getHistory()[0].current_value, 4.5);
      assert.equal(deriv.getHistory()[0].sell_time, 1_700_000_001);
    });
  });

  test("preserves the complete Deriv payout in quote, buy, and history responses", async () => {
    const fullPayout = 125_000.75;
    proposalPayoutOverride = fullPayout;
    buyPayoutOverride = fullPayout;

    const result = await withSelectedAccount("full-payout-user", () => deriv.buyContract({
      amount: 1,
      duration: 1,
      duration_unit: "t",
      contract_type: "DIGITEVEN",
      symbol: "R_75",
      confirm_live_trade: true,
    }));

    assert.equal(result.proposal.payout, fullPayout);
    assert.equal(result.buy.payout, fullPayout);
    await inUser("full-payout-user", async () => {
      assert.equal(deriv.getHistory()[0]?.payout, fullPayout);
    });
  });

  test("keeps complete trade history isolated and retained per account", async () => {
    const demoRow = {
      contract_id: "shared-contract-id",
      contract_type: "DIGITDIFF",
      underlying_symbol: "R_75",
      buy_price: 2,
      payout: 4,
      profit: 2,
      status: "won",
      purchase_time: 1_700_000_001,
      sell_time: 1_700_000_002,
      barrier: 5,
    };
    const realRow = {
      ...demoRow,
      contract_type: "DIGITEVEN",
      buy_price: 3,
      payout: 5,
      profit: -3,
      status: "lost",
    };

    await withSelectedAccount("account-history-user", async () => {
      emitMessage(latestSocket(), {
        msg_type: "profit_table",
        profit_table: { transactions: [demoRow] },
      });
      const demoHistory = deriv.getHistory();
      assert.equal(demoHistory.length, 1);
      assert.equal(demoHistory[0].account_id, "DOT123");
      assert.equal(demoHistory[0].account_type, "demo");
      assert.equal(demoHistory[0].currency, "USD");
      assert.equal(demoHistory[0].contract_id, "shared-contract-id");
      assert.equal(demoHistory[0].sell_time, 1_700_000_002);

      await deriv.selectAccount("CR123");
      assert.deepEqual(deriv.getHistory(), []);
      emitMessage(latestSocket(), {
        msg_type: "profit_table",
        profit_table: { transactions: [realRow] },
      });
      const realHistory = deriv.getHistory();
      assert.equal(realHistory.length, 1);
      assert.equal(realHistory[0].account_id, "CR123");
      assert.equal(realHistory[0].account_type, "real");
      assert.equal(realHistory[0].currency, "EUR");
      assert.equal(realHistory[0].contract_type, "DIGITEVEN");
      assert.equal(realHistory[0].profit, -3);

      deriv.clearHistory();
      assert.deepEqual(deriv.getHistory(), []);
      await deriv.selectAccount("DOT123");
      assert.deepEqual(deriv.getHistory(), demoHistory);
    });
  });

  test("rejects a buy and clears pending state", async () => {
    buyBehavior = "reject";
    await assert.rejects(
      withSelectedAccount("rejected-buy-user", () => deriv.buyContract({
        amount: 1,
        duration: 1,
        duration_unit: "t",
        contract_type: "DIGITEVEN",
        symbol: "R_75",
        confirm_live_trade: true,
      })),
      /buy rejected by Deriv/,
    );

    buyBehavior = "ack";
    const result = await withSelectedAccount("rejected-buy-user", () => deriv.bulkBuyContracts({
      amount: 1,
      duration: 1,
      duration_unit: "t",
      contract_type: "DIGITEVEN",
      symbol: "R_75",
      count: 1,
      confirm_live_trade: true,
    }));
    assert.equal(result.count, 1);
  });

  test("rejects a buy on socket disconnect and clears pending state", async () => {
    buyBehavior = "disconnect";
    await assert.rejects(
      withSelectedAccount("disconnected-buy-user", () => deriv.buyContract({
        amount: 1,
        duration: 1,
        duration_unit: "t",
        contract_type: "DIGITODD",
        symbol: "R_75",
        confirm_live_trade: true,
      })),
      /WebSocket disconnected before the contract purchase was acknowledged/,
    );

    buyBehavior = "ack";
    const result = await withSelectedAccount("disconnected-buy-user", () => deriv.bulkBuyContracts({
      amount: 1,
      duration: 1,
      duration_unit: "t",
      contract_type: "DIGITODD",
      symbol: "R_75",
      count: 1,
      confirm_live_trade: true,
    }));
    assert.equal(result.count, 1);
  });

  test("bulk buys return after buy acknowledgements without waiting for settlement", async () => {
    const result = await withSelectedAccount("bulk-buy-user", () => deriv.bulkBuyContracts({
      amount: 1,
      duration: 1,
      duration_unit: "t",
      contract_type: "DIGITOVER",
      barrier: 3,
      symbol: "R_75",
      count: 2,
      confirm_live_trade: true,
    }));

    assert.equal(result.count, 2);
    assert.deepEqual(buySendCountsAtAck, [2, 2], "all batch buy requests must be sent before the first acknowledgement");
    await inUser("bulk-buy-user", async () => {
      assert.equal(deriv.getHistory().length, 2);
      assert.ok(deriv.getHistory().every((trade: { status: string }) => trade.status === "open"));
      assert.equal(deriv.getStatus().active_contract_count, 2);
      deriv.clearHistory();
      assert.equal(deriv.getHistory().length, 0);
      assert.equal(deriv.getStatus().active_contract_count, 2, "clearing visible history must not clear the active-contract guard");
      await assert.rejects(
        deriv.bulkBuyContracts({
          amount: 1,
          duration: 1,
          duration_unit: "t",
          contract_type: "DIGITOVER",
          barrier: 3,
          symbol: "R_75",
          count: 1,
          confirm_live_trade: true,
        }),
        /previous contract is still settling/,
      );
    });
  });

  test("Deriv sale flags release a stale open status without treating zero as sold", async () => {
    const result = await withSelectedAccount("sale-flag-settlement-user", () => deriv.bulkBuyContracts({
      amount: 1,
      duration: 1,
      duration_unit: "t",
      contract_type: "DIGITODD",
      symbol: "R_75",
      count: 1,
      confirm_live_trade: true,
    }));
    const contractId = result.buys[0].contract_id;

    await inUser("sale-flag-settlement-user", async () => {
      const socket = latestSocket();
      emitMessage(socket, {
        msg_type: "proposal_open_contract",
        proposal_open_contract: {
          contract_id: contractId,
          status: "open",
          is_sold: "0",
          buy_price: 1,
          payout: 4.5,
          bid_price: 1,
          profit: 0,
        },
      });
      assert.equal(deriv.getStatus().active_contract_count, 1, "string zero is not a sold flag");

      emitMessage(socket, {
        msg_type: "proposal_open_contract",
        proposal_open_contract: {
          contract_id: contractId,
          status: "open",
          is_sold: 1,
          buy_price: 1,
          payout: 4.5,
          sell_price: 1.25,
          profit: 0.25,
          sell_time: 1_700_000_001,
        },
      });
      assert.equal(deriv.getStatus().active_contract_count, 0);
      assert.equal(deriv.getHistory()[0].status, "closed");
      assert.equal(deriv.getStatus().last_contract?.is_sold, true);

      const nextBatch = await deriv.bulkBuyContracts({
        amount: 1,
        duration: 1,
        duration_unit: "t",
        contract_type: "DIGITODD",
        symbol: "R_75",
        count: 1,
        confirm_live_trade: true,
      });
      assert.equal(nextBatch.count, 1, "a new entry is allowed after the prior contract is confirmed sold");
      assert.equal(deriv.getStatus().active_contract_count, 1);
    });
  });

  test("reconnect restores subscriptions for open contracts and fetches stale settlements", async () => {
    let contractId = "";
    await withSelectedAccount("reconnect-open-contract-user", async () => {
      const result = await deriv.bulkBuyContracts({
        amount: 1,
        duration: 1,
        duration_unit: "t",
        contract_type: "DIGITODD",
        symbol: "R_75",
        count: 1,
        confirm_live_trade: true,
      });
      contractId = result.buys[0].contract_id;
      mockPortfolioContracts = [{
        contract_id: contractId,
        account_id: "DOT123",
        buy_price: result.buys[0].buy_price,
        payout: result.buys[0].payout,
        purchase_time: result.buys[0].start_time,
        contract_type: "DIGITODD",
        underlying_symbol: "R_75",
        status: "open",
      }];
      latestSocket().close();
    });

    await new Promise((resolve) => setImmediate(resolve));
    await withSelectedAccount("reconnect-open-contract-user", async () => {
      const socket = latestSocket();
      assert.ok(
        socket.sent.some((message) =>
          message.proposal_open_contract === 1
          && message.contract_id === contractId
          && message.subscribe === 1,
        ),
        "the reconnect must resubscribe to every still-open contract",
      );
      assert.equal(deriv.getStatus().open_contracts_ready, true);
      assert.equal(deriv.getStatus().active_contract_count, 1);

      emitMessage(socket, {
        msg_type: "proposal_open_contract",
        proposal_open_contract: {
          contract_id: contractId,
          account_id: "DOT123",
          buy_price: 1,
          payout: 4.5,
          sell_price: 4.5,
          profit: 3.5,
          status: "won",
          is_sold: 1,
          contract_type: "DIGITODD",
          underlying: "R_75",
          sell_time: 1_700_000_001,
        },
      });
      assert.equal(deriv.getStatus().active_contract_count, 0);
    });
  });

  test("dual buys return after both buy acknowledgements without waiting for settlement", async () => {
    const result = await withSelectedAccount("dual-buy-user", () => deriv.dualBuyContracts({
      amount: 1,
      duration: 1,
      duration_unit: "t",
      barrier: 3,
      symbol: "R_75",
      confirm_live_trade: true,
    }));

    assert.equal(result.count, 2);
    await inUser("dual-buy-user", async () => {
      assert.equal(deriv.getHistory().length, 2);
      assert.deepEqual(
        deriv.getHistory().map((trade: { contract_type: string }) => trade.contract_type).sort(),
        ["DIGITOVER", "DIGITUNDER"],
      );
      assert.ok(deriv.getHistory().every((trade: { status: string }) => trade.status === "open"));
    });
  });
});