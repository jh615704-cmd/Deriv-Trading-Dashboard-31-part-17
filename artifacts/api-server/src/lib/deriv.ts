import WebSocket from "ws";
import { logger } from "./logger";

const API_BASE = "https://api.derivws.com";
const appId = process.env.DERIV_APP_ID;
const token = process.env.DERIV_API_TOKEN;
const defaultSymbol = process.env.DERIV_SYMBOL ?? "R_75";
const defaultCurrency = process.env.DERIV_CURRENCY ?? "USD";
const maxTradeAmount = Number(process.env.MAX_TRADE_AMOUNT ?? "100");
const configuredAccountId = process.env.DERIV_ACCOUNT_ID;

export type DerivAccount = {
  id: string;
  type: "demo" | "real";
  currency: string;
  balance: number;
  status: string;
};

export type DerivTick = {
  symbol: string;
  quote: number;
  epoch: number;
};

export type DerivProposal = {
  id: string;
  ask_price: number;
  payout: number;
  spot: number;
  longcode: string | null;
};

export type DerivStatus = {
  connected: boolean;
  authorized: boolean;
  account: DerivAccount | null;
  last_tick: DerivTick | null;
  last_proposal: DerivProposal | null;
  bot_running: boolean;
  symbol: string;
  currency: string;
  max_trade_amount: number;
};

type ProposalInput = {
  amount: number;
  duration: number;
  duration_unit: "t" | "s" | "m";
  contract_type: "CALL" | "PUT";
  symbol?: string;
};

type DerivResponse = {
  data?: unknown;
  errors?: Array<{ message?: string }>;
  accounts?: unknown;
};

const state = {
  socket: null as WebSocket | null,
  connecting: null as Promise<boolean> | null,
  reconnectTimer: null as NodeJS.Timeout | null,
  account: null as DerivAccount | null,
  accounts: [] as DerivAccount[],
  lastTick: null as DerivTick | null,
  lastProposal: null as DerivProposal | null,
  botRunning: false,
  shuttingDown: false,
};

function assertConfigured() {
  if (!appId || !token) {
    throw new Error("Deriv credentials are not configured");
  }
}

function normalizeAccount(raw: unknown): DerivAccount | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const id = record.account_id ?? record.accountId ?? record.loginid ?? record.id;
  if (typeof id !== "string" || !id) return null;

  const type =
    record.account_type === "demo" ||
    record.type === "demo" ||
    id.startsWith("DOT")
      ? "demo"
      : "real";

  return {
    id,
    type,
    currency: typeof record.currency === "string" ? record.currency : defaultCurrency,
    balance: Number(record.balance ?? 0),
    status: typeof record.status === "string" ? record.status : "unknown",
  };
}

function extractAccounts(body: DerivResponse): DerivAccount[] {
  const data = body.data;
  const candidates = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { accounts?: unknown }).accounts)
      ? (data as { accounts: unknown[] }).accounts
      : Array.isArray(body.accounts)
        ? body.accounts
        : data
          ? [data]
          : [];

  return candidates.map(normalizeAccount).filter((account): account is DerivAccount => Boolean(account));
}

async function derivRequest(pathname: string, init: RequestInit = {}) {
  assertConfigured();
  const response = await fetch(`${API_BASE}${pathname}`, {
    ...init,
    headers: {
      "Deriv-App-ID": appId!,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as DerivResponse;
  if (!response.ok) {
    throw new Error(body.errors?.[0]?.message ?? `Deriv REST request failed (${response.status})`);
  }
  return body;
}

async function loadAccountsFromDeriv() {
  const response = await derivRequest("/trading/v1/options/accounts");
  const accounts = extractAccounts(response);
  if (!accounts.length) throw new Error("Deriv returned no Options accounts");
  state.accounts = accounts;
  return accounts;
}

async function getOtpUrl(accountId: string) {
  const response = await derivRequest(
    `/trading/v1/options/accounts/${encodeURIComponent(accountId)}/otp`,
    { method: "POST" },
  );
  const url = (response.data as { url?: unknown } | undefined)?.url;
  if (typeof url !== "string" || !url.startsWith("wss://")) {
    throw new Error("Deriv returned an invalid authenticated WebSocket URL");
  }
  return url;
}

function preferredAccount(accounts: DerivAccount[]) {
  if (configuredAccountId) {
    const configured = accounts.find((account) => account.id === configuredAccountId);
    if (!configured) throw new Error("DERIV_ACCOUNT_ID was not found in the account list");
    return configured;
  }
  return accounts.find((account) => account.type === "demo") ?? accounts[0];
}

function send(message: Record<string, unknown>) {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return false;
  state.socket.send(JSON.stringify(message));
  return true;
}

function scheduleReconnect() {
  if (state.shuttingDown || state.reconnectTimer) return;
  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    void connect();
  }, 5000);
}

async function connectInternal() {
  const accounts = await loadAccountsFromDeriv();
  const account = preferredAccount(accounts);
  const url = await getOtpUrl(account.id);

  return await new Promise<boolean>((resolve, reject) => {
    const socket = new WebSocket(url);
    state.socket = socket;
    state.account = account;

    socket.once("open", () => {
      logger.info({ accountId: account.id }, "Deriv WebSocket connected");
      send({ balance: 1, subscribe: 1 });
      send({ ticks: defaultSymbol, subscribe: 1 });
      resolve(true);
    });

    socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString()) as Record<string, any>;
      if (message.error) {
        logger.warn({ code: message.error.code }, "Deriv WebSocket returned an error");
        return;
      }

      if (message.msg_type === "balance") {
        state.account = {
          ...(state.account ?? account),
          balance: Number(message.balance?.balance ?? 0),
          currency: message.balance?.currency ?? account.currency,
        };
      } else if (message.msg_type === "tick") {
        state.lastTick = {
          symbol: String(message.tick?.symbol ?? defaultSymbol),
          quote: Number(message.tick?.quote ?? 0),
          epoch: Number(message.tick?.epoch ?? 0),
        };
      } else if (message.msg_type === "proposal") {
        state.lastProposal = {
          id: String(message.proposal?.id ?? ""),
          ask_price: Number(message.proposal?.ask_price ?? 0),
          payout: Number(message.proposal?.payout ?? 0),
          spot: Number(message.proposal?.spot ?? 0),
          longcode: message.proposal?.longcode ?? null,
        };
      }
    });

    socket.on("close", () => {
      if (state.socket !== socket) return;
      state.socket = null;
      state.account = null;
      logger.warn("Deriv WebSocket closed");
      scheduleReconnect();
    });

    socket.once("error", (error) => {
      logger.error({ err: error }, "Deriv WebSocket connection failed");
      reject(error);
    });
  });
}

async function connect() {
  if (state.shuttingDown) return false;
  if (state.socket?.readyState === WebSocket.OPEN) return true;
  if (state.connecting) return state.connecting;

  state.connecting = connectInternal()
    .catch((error) => {
      logger.error({ err: error }, "Deriv connection attempt failed");
      scheduleReconnect();
      return false;
    })
    .finally(() => {
      state.connecting = null;
    });

  return state.connecting;
}

export function getStatus(): DerivStatus {
  return {
    connected: state.socket?.readyState === WebSocket.OPEN,
    authorized: state.socket?.readyState === WebSocket.OPEN,
    account: state.account,
    last_tick: state.lastTick,
    last_proposal: state.lastProposal,
    bot_running: state.botRunning,
    symbol: defaultSymbol,
    currency: defaultCurrency,
    max_trade_amount: maxTradeAmount,
  };
}

export async function getAccounts() {
  return loadAccountsFromDeriv();
}

export async function testConnection() {
  const accounts = await loadAccountsFromDeriv();
  const connected = await connect();
  return {
    ok: connected,
    message: connected
      ? "Deriv REST and WebSocket connection are healthy"
      : "Deriv accounts loaded, but the WebSocket is still reconnecting",
    accounts,
    status: getStatus(),
  };
}

export async function requestProposal(input: ProposalInput) {
  const connected = await connect();
  if (!connected || !send({
    proposal: 1,
    amount: input.amount,
    basis: "stake",
    contract_type: input.contract_type,
    currency: defaultCurrency,
    duration: input.duration,
    duration_unit: input.duration_unit,
    underlying_symbol: input.symbol ?? defaultSymbol,
    subscribe: 1,
  })) {
    throw new Error("Deriv WebSocket is not ready");
  }
  return {
    ok: true,
    message: "Proposal requested. Review the returned quote before any trade action.",
  };
}

export function startDeriv() {
  void connect();
}

export function stopDeriv() {
  state.shuttingDown = true;
  if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
  state.socket?.close();
}