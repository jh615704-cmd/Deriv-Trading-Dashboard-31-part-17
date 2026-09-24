import { EventEmitter } from "node:events";
import { after, before, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";

process.env.DERIV_APP_ID = "test-app";
process.env.DERIV_SYMBOL = "R_75";
process.env.DERIV_CURRENCY = "USD";

type SocketMessage = Record<string, any>;
type BuyBehavior = "ack" | "reject" | "disconnect";

let buyBehavior: BuyBehavior = "ack";
let proposalNumber = 0;
const sockets: FakeWebSocket[] = [];

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
        payout: 2.5 + proposalNumber,
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
      payout: 4.5,
      start_time: 1_700_000_000,
    },
  });
}

function mockDerivRest() {
  mock.method(globalThis, "fetch", async (input: URL | string | Request) => {
    const url = String(input);
    if (url.endsWith("/trading/v1/options/accounts")) {
      return Response.json({
        data: [{
          account_id: "DOT123",
          account_type: "demo",
          currency: "USD",
          balance: 100,
          status: "active",
        }],
      });
    }
    if (url.endsWith("/trading/v1/options/accounts/DOT123/otp")) {
      return Response.json({ data: { url: "wss://fake.deriv.test/options" } });
    }
    throw new Error(`Unexpected REST request: ${url}`);
  });
}

async function inUser<T>(userId: string, operation: () => Promise<T>) {
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
  buyBehavior = "ack";
  proposalNumber = 0;
  sockets.length = 0;
});

after(() => {
  deriv.stopDeriv();
});

describe("Deriv buy acknowledgement safety", { concurrency: false }, () => {
  test("uses a future expiry and forwards decimal growth for Accumulator contracts", async () => {
    const result = await withSelectedAccount("accumulator-user", () => deriv.buyContract({
      amount: 0.5,
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
    assert.ok(Number.isInteger(proposalRequest.date_expiry));
    assert.ok(proposalRequest.date_expiry > Math.floor(Date.now() / 1000));
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
        contract_type: "DIGITDIFF",
        barrier: 5,
        symbol: "R_75",
        buy_price: 2.25,
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
      assert.equal(deriv.getHistory()[0].sell_time, 1_700_000_001);
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
    await inUser("bulk-buy-user", async () => {
      assert.equal(deriv.getHistory().length, 2);
      assert.ok(deriv.getHistory().every((trade: { status: string }) => trade.status === "open"));
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