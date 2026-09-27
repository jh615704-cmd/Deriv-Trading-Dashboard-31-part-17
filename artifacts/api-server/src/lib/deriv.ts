import WebSocket from "ws";
import { AsyncLocalStorage } from "node:async_hooks";
import { logger } from "./logger";
import { assertTradingProtection, getTradingProtectionSettings } from "./trading-protection";

const API_BASE = "https://api.derivws.com";
const appId = process.env.DERIV_APP_ID;
const defaultSymbol = process.env.DERIV_SYMBOL ?? "R_75";
const defaultCurrency = process.env.DERIV_CURRENCY ?? "USD";
const configuredAccountId = process.env.DERIV_ACCOUNT_ID;
const liveTradingEnabled = process.env.DERIV_ALLOW_LIVE_TRADING === "true";
const proposalTimeoutMs = 8_000;
const proposalAttempts = 3;
const buyAckTimeoutMs = 12_000;
const supportedSymbols = new Set([
  "R_10", "R_25", "R_50", "R_75", "R_100",
  "1HZ10V", "1HZ15V", "1HZ25V", "1HZ30V", "1HZ50V", "1HZ75V", "1HZ90V", "1HZ100V",
  "JD10", "JD25", "JD50", "JD75", "JD100",
]);
type DigitContractType = "DIGITEVEN" | "DIGITODD" | "DIGITOVER" | "DIGITUNDER" | "DIGITDIFF" | "CALL" | "PUT" | "ACCU";

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

export type DerivBuy = {
  contract_id: string;
  buy_price: number;
  payout: number;
  start_time: number | null;
};

export type DerivContract = {
  contract_id: string;
  status: string;
  is_sold: boolean;
  profit: number;
  buy_price: number;
  payout: number;
  sell_price: number;
  entry_spot: number;
  current_spot: number;
  expiry_time: number | null;
};

export type DerivHistoryItem = {
  contract_id: string;
  account_id: string;
  account_type: "demo" | "real";
  contract_type: string;
  barrier: number | null;
  symbol: string;
  buy_price: number;
  current_value: number;
  payout: number;
  profit: number;
  status: string;
  buy_time: number | null;
  sell_time: number | null;
};

export type DerivStatus = {
  connected: boolean;
  authorized: boolean;
  account: DerivAccount | null;
  last_tick: DerivTick | null;
  last_proposal: DerivProposal | null;
  last_buy: DerivBuy | null;
  last_contract: DerivContract | null;
  bot_running: boolean;
  symbol: string;
  currency: string;
  max_trade_amount: number;
  live_trading_enabled: boolean;
  digit_even_percentage: number;
  digit_odd_percentage: number;
  digit_sample_count: number;
  last_digit: number | null;
  digit_history: number[];
  digit_streaks: Array<{ digit: number; over: number; under: number }>;
  market_signals: Array<{
    symbol: string;
    quote: number | null;
    last_digit: number | null;
    sample_count: number;
    digit_even_percentage: number;
    digit_odd_percentage: number;
    rise_percentage: number;
    fall_percentage: number;
    digit_streaks: Array<{ digit: number; over: number; under: number }>;
  }>;
};

type ProposalInput = {
  amount: number;
  duration: number;
  duration_unit: "t" | "s" | "m";
  contract_type: DigitContractType;
  barrier?: number;
  growth_rate?: number;
  symbol?: string;
};

type BuyInput = {
  amount: number;
  duration: number;
  duration_unit: "t";
  contract_type: DigitContractType;
  barrier?: number;
  growth_rate?: number;
  symbol?: string;
  confirm_live_trade: true;
};

export type SellResult = {
  contract_id: string;
  sold_for: number;
};

type DerivResponse = {
  data?: unknown;
  errors?: Array<{ message?: string }>;
  accounts?: unknown;
};

export class DerivCredentialError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "DerivCredentialError";
    this.status = status;
  }
}

function createState() {
return {
  socket: null as WebSocket | null,
  connecting: null as Promise<boolean> | null,
  reconnectTimer: null as NodeJS.Timeout | null,
  balanceRefreshAt: 0,
  balanceRefreshPromise: null as Promise<void> | null,
  account: null as DerivAccount | null,
  accounts: [] as DerivAccount[],
  lastTick: null as DerivTick | null,
  lastProposal: null as DerivProposal | null,
  proposalIds: new Set<string>(),
  lastBuy: null as DerivBuy | null,
  pendingBuyInputs: new Map<string, ProposalInput>(),
  buyWaiters: new Map<string, {
    resolve: (buy: DerivBuy) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }>(),
  sellSequence: 0,
  sellWaiters: new Map<number, {
    resolve: (result: SellResult) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }>(),
  lastContract: null as DerivContract | null,
  history: [] as DerivHistoryItem[],
  lastProposalContractType: "",
  lastProposalSymbol: defaultSymbol,
  lastProposalInput: null as ProposalInput | null,
  lastProposalRefreshAt: 0,
  proposalSequence: 0,
  buySequence: 0,
  proposalWaiters: new Map<number, { resolve: (proposal: DerivProposal) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>(),
  lastBuyAt: 0,
  contractInputs: new Map<string, ProposalInput>(),
  digitEvenCount: 0,
  digitOddCount: 0,
  digitHistory: [] as number[],
  marketHistory: new Map<string, {
    quote: number | null;
    epoch: number;
    digitHistory: number[];
    movementHistory: Array<"rise" | "fall" | "flat">;
  }>(),
  selectedSymbol: defaultSymbol,
  hiddenHistoryIds: new Set<string>(),
  selectedAccountId: configuredAccountId ?? null as string | null,
  botRunning: false,
  shuttingDown: false,
  pat: null as string | null,
  lastAccessAt: Date.now(),
  generation: 0,
};
}

const runtimes = new Map<string, ReturnType<typeof createState>>();
const operationTails = new Map<string, Promise<void>>();
const userContext = new AsyncLocalStorage<string>();
let generationSequence = 0;
const runtimeIdleTimeoutMs = 30 * 60 * 1000;
const runtimeReaper = setInterval(() => {
  const cutoff = Date.now() - runtimeIdleTimeoutMs;
  for (const [userId, runtime] of runtimes) {
    if (runtime.lastAccessAt < cutoff) {
      void withUserSerialized(userId, async () => {
        if (runtimes.get(userId) === runtime && runtime.lastAccessAt < cutoff) {
          disposeUser(userId);
        }
      });
    }
  }
}, 5 * 60 * 1000);
runtimeReaper.unref();

function getState(): any {
  const activeUser = userContext.getStore();
  if (!activeUser) throw new Error("Authenticated Deriv user is required");
  let runtime = runtimes.get(activeUser);
  if (!runtime) {
    runtime = createState();
    runtime.generation = ++generationSequence;
    runtimes.set(activeUser, runtime);
  }
  return runtime;
}

export async function withUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const runtime = runtimes.get(userId);
  if (runtime) runtime.lastAccessAt = Date.now();
  return userContext.run(userId, fn);
}

export async function withUserSerialized<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const previous = operationTails.get(userId) ?? Promise.resolve();
  let release!: () => void;
  const turn = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.then(() => turn);
  operationTails.set(userId, tail);
  await previous;
  try {
    return await userContext.run(userId, fn);
  } finally {
    release();
    if (operationTails.get(userId) === tail) operationTails.delete(userId);
  }
}

export function setUserPat(userId: string, pat: string) {
  const current = runtimes.get(userId);
  if (current && current.pat === pat && !current.shuttingDown) {
    current.lastAccessAt = Date.now();
    return;
  }
  if (current) disposeUser(userId);
  const runtime = createState();
  runtime.pat = pat;
  runtime.shuttingDown = false;
  runtime.lastAccessAt = Date.now();
  runtime.generation = ++generationSequence;
  runtimes.set(userId, runtime);
}

export function disposeUser(userId: string) {
  const runtime = runtimes.get(userId);
  if (!runtime) return;
  runtime.shuttingDown = true;
  for (const waiter of runtime.proposalWaiters.values()) {
    clearTimeout(waiter.timer);
    waiter.reject(new Error("Deriv runtime disposed"));
  }
  runtime.proposalWaiters.clear();
  for (const waiter of runtime.buyWaiters.values()) {
    clearTimeout(waiter.timer);
    waiter.reject(new Error("Deriv runtime disposed"));
  }
  runtime.buyWaiters.clear();
  for (const waiter of runtime.sellWaiters.values()) {
    clearTimeout(waiter.timer);
    waiter.reject(new Error("Deriv runtime disposed"));
  }
  runtime.sellWaiters.clear();
  if (runtime.reconnectTimer) clearTimeout(runtime.reconnectTimer);
  runtime.socket?.close();
  runtimes.delete(userId);
}

function rejectProposalWaiters(message: string) {
  for (const waiter of getState().proposalWaiters.values()) {
    clearTimeout(waiter.timer);
    waiter.reject(new Error(message));
  }
  getState().proposalWaiters.clear();
}

function rejectBuyWaiters(message: string) {
  for (const waiter of getState().buyWaiters.values()) {
    clearTimeout(waiter.timer);
    waiter.reject(new Error(message));
  }
  getState().buyWaiters.clear();
  getState().pendingBuyInputs.clear();
}

function rejectSellWaiters(message: string) {
  for (const waiter of getState().sellWaiters.values()) {
    clearTimeout(waiter.timer);
    waiter.reject(new Error(message));
  }
  getState().sellWaiters.clear();
}

function hasActiveContract() {
  const runtime = getState();
  return runtime.pendingBuyInputs.size > 0
    || runtime.history.some((item: DerivHistoryItem) => item.status === "open")
    || Boolean(runtime.lastContract && !runtime.lastContract.is_sold && runtime.lastContract.status === "open");
}

function assertNoActiveContract() {
  if (hasActiveContract()) {
    throw new Error("The previous contract is still settling. Wait for it to finish before sending another trade.");
  }
}

function assertConfigured() {
  if (!appId || !getState().pat) {
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

function upsertHistory(item: DerivHistoryItem) {
  if (getState().hiddenHistoryIds.has(item.contract_id)) return;
  const existing = getState().history.findIndex((entry: DerivHistoryItem) => entry.contract_id === item.contract_id);
  if (existing >= 0) {
    getState().history[existing] = { ...getState().history[existing], ...item };
  } else {
    getState().history.push(item);
  }
  getState().history.sort((left: DerivHistoryItem, right: DerivHistoryItem) => (right.buy_time ?? 0) - (left.buy_time ?? 0));
  getState().history = getState().history.slice(0, 100);
}

function digitStreaksFor(history: number[]) {
  return Array.from({ length: 10 }, (_, digit) => {
    let over = 0;
    let under = 0;
    for (let cursor = history.length - 1; cursor >= 0 && history[cursor] > digit; cursor -= 1) over += 1;
    for (let cursor = history.length - 1; cursor >= 0 && history[cursor] < digit; cursor -= 1) under += 1;
    return { digit, over, under };
  });
}

function recordMarketTick(symbol: string, quote: unknown, epoch: number, pipSize: unknown) {
  const runtime = getState();
  // Deriv sends quotes as JSON numbers, so a trailing decimal zero is lost
  // before it reaches this process. Use the pip size reported with the tick
  // instead of guessing a fixed precision: a wrong precision turns every
  // quote into a synthetic trailing zero.
  const reportedPrecision = Number(pipSize);
  const precision = Number.isInteger(reportedPrecision) && reportedPrecision >= 0 && reportedPrecision <= 8
    ? reportedPrecision
    : null;
  const rawQuote = typeof quote === "string"
    ? quote
    : Number.isFinite(Number(quote))
      ? precision == null ? String(quote) : Number(quote).toFixed(precision)
      : "";
  const digits = rawQuote.replace(/\D/g, "");
  const lastDigit = digits.at(-1);
  const market = runtime.marketHistory.get(symbol) ?? { quote: null, epoch: 0, digitHistory: [], movementHistory: [] };
  const nextQuote = Number(quote ?? 0);
  if (market.quote != null && Number.isFinite(market.quote) && Number.isFinite(nextQuote)) {
    market.movementHistory.push(nextQuote > market.quote ? "rise" : nextQuote < market.quote ? "fall" : "flat");
    market.movementHistory = market.movementHistory.slice(-1000);
  }
  market.quote = nextQuote;
  market.epoch = epoch;
  if (lastDigit !== undefined) market.digitHistory.push(Number(lastDigit));
  market.digitHistory = market.digitHistory.slice(-1000);
  runtime.marketHistory.set(symbol, market);
  if (symbol === runtime.selectedSymbol) {
    runtime.lastTick = { symbol, quote: market.quote, epoch };
    runtime.digitHistory = [...market.digitHistory];
    runtime.digitEvenCount = runtime.digitHistory.filter((digit: number) => digit % 2 === 0).length;
    runtime.digitOddCount = runtime.digitHistory.length - runtime.digitEvenCount;
  }
}

function getDigitStreaks() {
  return digitStreaksFor(getState().digitHistory as number[]);
}

function getMarketSignals() {
  return Array.from(supportedSymbols, (symbol) => {
    const market = getState().marketHistory.get(symbol);
    const digits = (market?.digitHistory ?? []).slice(-100);
    const evenCount = digits.filter((digit: number) => digit % 2 === 0).length;
    const sampleCount = digits.length;
    const movementHistory = (market?.movementHistory ?? []).slice(-100);
    const riseCount = movementHistory.filter((movement: "rise" | "fall" | "flat") => movement === "rise").length;
    const movementSampleCount = movementHistory.length;
    return {
      symbol,
      quote: market?.quote ?? null,
      last_digit: digits.at(-1) ?? null,
      sample_count: sampleCount,
      digit_even_percentage: sampleCount ? Number(((evenCount / sampleCount) * 100).toFixed(1)) : 50,
      digit_odd_percentage: sampleCount ? Number((((sampleCount - evenCount) / sampleCount) * 100).toFixed(1)) : 50,
      rise_percentage: movementSampleCount ? Number(((riseCount / movementSampleCount) * 100).toFixed(1)) : 50,
      fall_percentage: movementSampleCount
        ? Number((((movementSampleCount - riseCount - movementHistory.filter((movement: "rise" | "fall" | "flat") => movement === "flat").length) / movementSampleCount) * 100).toFixed(1))
        : 50,
      digit_streaks: digitStreaksFor(digits),
      digit_outcomes: Array.from({ length: 10 }, (_, digit) => {
        const overCount = digits.filter((value: number) => value > digit).length;
        const underCount = digits.filter((value: number) => value < digit).length;
        return {
          digit,
          over_percentage: sampleCount ? Number(((overCount / sampleCount) * 100).toFixed(1)) : 50,
          under_percentage: sampleCount ? Number(((underCount / sampleCount) * 100).toFixed(1)) : 50,
        };
      }),
    };
  });
}

function getDigitPercentages() {
  const total = getState().digitEvenCount + getState().digitOddCount;
  if (!total) return { even: 50, odd: 50 };
  return {
    even: Number(((getState().digitEvenCount / total) * 100).toFixed(1)),
    odd: Number(((getState().digitOddCount / total) * 100).toFixed(1)),
  };
}

function normalizeHistory(raw: unknown, fallbackStatus = "closed"): DerivHistoryItem | null {
  if (!raw || typeof raw !== "object" || !getState().account) return null;
  const record = raw as Record<string, unknown>;
  const contractId = record.contract_id ?? record.id;
  if (typeof contractId !== "string" || !contractId) return null;

  const buyPrice = Number(record.buy_price ?? record.purchase_price ?? 0);
  const profit = Number(record.profit ?? 0);
  const reportedCurrentValue = record.bid_price
    ?? record.current_value
    ?? (record.is_sold ? record.sell_price : undefined);
  const currentValue = reportedCurrentValue == null
    ? buyPrice + profit
    : Number(reportedCurrentValue);

  return {
    contract_id: contractId,
    account_id: getState().account.id,
    account_type: getState().account.type,
    contract_type: String((record.contract_type ?? getState().lastProposalContractType) || "unknown"),
    barrier: record.barrier == null
      ? (getState().contractInputs.get(contractId)?.barrier ?? null)
      : Number(record.barrier),
    symbol: String(record.underlying_symbol ?? record.symbol ?? getState().lastProposalSymbol),
    buy_price: buyPrice,
    current_value: Number.isFinite(currentValue) ? currentValue : buyPrice + profit,
    payout: Number(record.payout ?? 0),
    profit,
    status: String(record.status ?? (record.is_sold ? "closed" : fallbackStatus)),
    buy_time: record.purchase_time == null && record.buy_time == null
      ? null
      : Number(record.purchase_time ?? record.buy_time),
    sell_time: record.sell_time == null ? null : Number(record.sell_time),
  };
}

async function derivRequest(pathname: string, init: RequestInit = {}) {
  assertConfigured();
  const response = await fetch(`${API_BASE}${pathname}`, {
    ...init,
    headers: {
      "Deriv-App-ID": appId!,
      Authorization: `Bearer ${getState().pat}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as DerivResponse;
  if (!response.ok) {
    const message = body.errors?.[0]?.message ?? `Deriv REST request failed (${response.status})`;
    if (response.status === 401 || response.status === 403) {
      throw new DerivCredentialError(
        "Deriv rejected this PAT or its permissions. Connect a PAT with Options read and trade scopes.",
        response.status,
      );
    }
    throw new Error(message);
  }
  return body;
}

async function loadAccountsFromDeriv() {
  const response = await derivRequest("/trading/v1/options/accounts");
  const accounts = extractAccounts(response);
  if (!accounts.length) throw new Error("Deriv returned no Options accounts");
  getState().accounts = accounts;
  const selected = getState().account && accounts.find((account) => account.id === getState().account?.id);
  if (selected && getState().account) {
    getState().account = {
      ...getState().account,
      balance: selected.balance,
      currency: selected.currency,
      status: selected.status,
    };
  }
  return getState().accounts;
}

async function refreshSelectedBalance() {
  if (!getState().account) return;
  const now = Date.now();
  if (now - getState().balanceRefreshAt < 2000) return;
  if (getState().balanceRefreshPromise) return getState().balanceRefreshPromise;

  getState().balanceRefreshAt = now;
  getState().balanceRefreshPromise = loadAccountsFromDeriv()
    .then(() => undefined)
    .catch((error) => {
      logger.warn({ err: error }, "Deriv REST balance refresh failed");
    })
    .finally(() => {
      getState().balanceRefreshPromise = null;
    });
  return getState().balanceRefreshPromise;
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
  if (getState().selectedAccountId) {
    const selected = accounts.find((account) => account.id === getState().selectedAccountId);
    if (!selected) throw new Error("Selected account was not found in the account list");
    return selected;
  }
  if (configuredAccountId) {
    const configured = accounts.find((account) => account.id === configuredAccountId);
    if (!configured) throw new Error("DERIV_ACCOUNT_ID was not found in the account list");
    return configured;
  }
  return accounts.find((account) => account.type === "demo") ?? accounts[0];
}

function send(message: Record<string, unknown>) {
  if (!getState().socket || getState().socket.readyState !== WebSocket.OPEN) return false;
  getState().socket.send(JSON.stringify(message));
  return true;
}

function contractParameters(input: ProposalInput) {
  const isAccumulator = input.contract_type === "ACCU";
  const amount = roundCents(input.amount);
  const expiryOrTakeProfit = isAccumulator
    ? {
        limit_order: {
          take_profit: Math.max(
            0.01,
            roundCents(amount * (Math.pow(1 + (input.growth_rate ?? 0), input.duration) - 1)),
          ),
        },
      }
    : { duration: input.duration, duration_unit: input.duration_unit };

  return {
    amount,
    basis: "stake" as const,
    contract_type: input.contract_type,
    currency: defaultCurrency,
    ...expiryOrTakeProfit,
    underlying_symbol: input.symbol ?? defaultSymbol,
    ...(input.barrier == null ? {} : { barrier: String(input.barrier) }),
    ...(input.growth_rate == null ? {} : { growth_rate: input.growth_rate }),
  };
}

function roundCents(value: number) {
  return Number((Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2));
}

function sendStakeProposal(input: ProposalInput, reqId: number) {
  // Deriv owns the payout quote. Every feature must request a stake-based
  // proposal, buy at the exact returned ask price, and pass the returned
  // payout through unchanged. Do not apply an app-level payout cap, fee, or
  // percentage reduction here or in any future feature that uses this path.
  return send({
    proposal: 1,
    ...contractParameters(input),
    req_id: reqId,
  });
}

function sendProposalRequest(input: ProposalInput) {
  const reqId = ++getState().proposalSequence;
  const sent = sendStakeProposal(input, reqId);
  return sent ? reqId : null;
}

async function sendProposalBuy(proposal: DerivProposal, input: ProposalInput): Promise<DerivBuy> {
  const requestKey = proposal.id;
  return new Promise<DerivBuy>((resolve, reject) => {
    const timer = setTimeout(() => {
      getState().buyWaiters.delete(requestKey);
      getState().pendingBuyInputs.delete(requestKey);
      reject(new Error("Deriv did not confirm the contract purchase in time"));
    }, buyAckTimeoutMs);
    getState().pendingBuyInputs.set(requestKey, input);
    getState().buyWaiters.set(requestKey, { resolve, reject, timer });
    if (!send({ buy: proposal.id, price: proposal.ask_price })) {
      clearTimeout(timer);
      getState().buyWaiters.delete(requestKey);
      getState().pendingBuyInputs.delete(requestKey);
      reject(new Error("Deriv WebSocket is not ready"));
    }
  });
}

async function sendDirectBuy(proposal: DerivProposal, input: ProposalInput): Promise<DerivBuy> {
  const reqId = ++getState().buySequence;
  const requestKey = `req:${reqId}`;
  return new Promise<DerivBuy>((resolve, reject) => {
    const timer = setTimeout(() => {
      getState().buyWaiters.delete(requestKey);
      getState().pendingBuyInputs.delete(requestKey);
      reject(new Error("Deriv did not confirm the contract purchase in time"));
    }, buyAckTimeoutMs);
    getState().pendingBuyInputs.set(requestKey, input);
    getState().buyWaiters.set(requestKey, { resolve, reject, timer });
    const sent = send({
      buy: "1",
      parameters: {
        ...contractParameters(input),
      },
      price: proposal.ask_price,
      req_id: reqId,
    });
    if (!sent) {
      clearTimeout(timer);
      getState().buyWaiters.delete(requestKey);
      getState().pendingBuyInputs.delete(requestKey);
      reject(new Error("Deriv WebSocket is not ready"));
    }
  });
}

async function sendSell(contractId: string): Promise<SellResult> {
  const reqId = ++getState().sellSequence;
  return new Promise<SellResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      getState().sellWaiters.delete(reqId);
      reject(new Error("Deriv did not confirm the contract close in time"));
    }, buyAckTimeoutMs);
    getState().sellWaiters.set(reqId, { resolve, reject, timer });
    if (!send({ sell: contractId, price: 0, req_id: reqId })) {
      clearTimeout(timer);
      getState().sellWaiters.delete(reqId);
      reject(new Error("Deriv WebSocket is not ready"));
    }
  });
}

function proposalFromMessage(raw: unknown): DerivProposal | null {
  if (!raw || typeof raw !== "object") return null;
  const proposal = raw as Record<string, unknown>;
  const id = String(proposal.id ?? "");
  if (!id) return null;
  return {
    id,
    ask_price: Number(proposal.ask_price ?? 0),
    payout: Number(proposal.payout ?? 0),
    spot: Number(proposal.spot ?? 0),
    longcode: typeof proposal.longcode === "string" ? proposal.longcode : null,
  };
}

function scheduleReconnect() {
  const ownerId = userContext.getStore();
  const runtime = getState();
  if (!ownerId || runtime.shuttingDown || runtime.reconnectTimer) return;
  runtime.reconnectTimer = setTimeout(() => {
    if (runtimes.get(ownerId) !== runtime || runtime.shuttingDown) return;
    runtime.reconnectTimer = null;
    void withUserSerialized(ownerId, async () => {
      if (runtimes.get(ownerId) !== runtime || runtime.shuttingDown) return;
      await connect();
    });
  }, 5000);
}

async function connectInternal() {
  const ownerId = userContext.getStore();
  const ownerRuntime = getState();
  const isRuntimeCurrent = () => Boolean(ownerId && runtimes.get(ownerId) === ownerRuntime && !ownerRuntime.shuttingDown);
  const accounts = await loadAccountsFromDeriv();
  if (!isRuntimeCurrent()) return false;
  const account = preferredAccount(accounts);
  const url = await getOtpUrl(account.id);
  if (!isRuntimeCurrent()) return false;

  return await new Promise<boolean>((resolve, reject) => {
    const socket = new WebSocket(url);
    ownerRuntime.socket = socket;
    ownerRuntime.account = account;
    const isCurrentSocket = () => isRuntimeCurrent() && ownerRuntime.socket === socket;
    let settled = false;
    const resolveOnce = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const rejectOnce = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    socket.once("open", () => {
      if (!isCurrentSocket()) {
        resolveOnce(false);
        socket.close();
        return;
      }
      logger.info({ accountId: account.id }, "Deriv WebSocket connected");
      send({ balance: 1, subscribe: 1 });
      for (const symbol of supportedSymbols) send({ ticks: symbol, subscribe: 1 });
      send({ portfolio: 1 });
      send({ profit_table: 1, limit: 50, description: 1, sort: "DESC" });
      resolveOnce(true);
    });

    socket.on("message", (raw) => {
      if (!isCurrentSocket()) return;
      const message = JSON.parse(raw.toString()) as Record<string, any>;
      if (message.error) {
        const errorMessage = String(message.error.message ?? message.error.code ?? "Deriv rejected the request");
        const reqId = Number(message.req_id ?? message.echo_req?.req_id);
        const proposalWaiter = getState().proposalWaiters.get(reqId);
        if (proposalWaiter) {
          clearTimeout(proposalWaiter.timer);
          getState().proposalWaiters.delete(reqId);
          proposalWaiter.reject(new Error(errorMessage));
        }
        const echoedBuyRequestId = Number(message.req_id ?? message.echo_req?.req_id);
        const rejectedProposalId = typeof message.echo_req?.buy === "string" && message.echo_req.buy !== "1"
          ? message.echo_req.buy
          : null;
        const rejectedBuyKey = echoedBuyRequestId > 0 ? `req:${echoedBuyRequestId}` : rejectedProposalId;
        if (rejectedBuyKey) {
          getState().pendingBuyInputs.delete(rejectedBuyKey);
          const buyWaiter = getState().buyWaiters.get(rejectedBuyKey);
          if (buyWaiter) {
            clearTimeout(buyWaiter.timer);
            getState().buyWaiters.delete(rejectedBuyKey);
            buyWaiter.reject(new Error(errorMessage));
          }
        }
        logger.warn({ code: message.error.code }, "Deriv WebSocket returned an error");
        return;
      }

      if (message.msg_type === "balance") {
        getState().account = {
          ...(getState().account ?? account),
          balance: Number(message.balance?.balance ?? 0),
          currency: message.balance?.currency ?? account.currency,
        };
      } else if (message.msg_type === "tick") {
        recordMarketTick(
          String(message.tick?.symbol ?? getState().selectedSymbol),
          message.tick?.quote,
          Number(message.tick?.epoch ?? 0),
          message.tick?.pip_size,
        );
        if (getState().lastProposalInput && Date.now() - getState().lastProposalRefreshAt >= 1000) {
          getState().lastProposalRefreshAt = Date.now();
          sendProposalRequest(getState().lastProposalInput);
        }
      } else if (message.msg_type === "proposal") {
        const proposal = proposalFromMessage(message.proposal);
        if (proposal) {
          getState().lastProposal = proposal;
          getState().proposalIds.add(proposal.id);
          const reqId = Number(message.req_id ?? message.echo_req?.req_id);
          const waiter = getState().proposalWaiters.get(reqId);
          if (waiter) {
            clearTimeout(waiter.timer);
            getState().proposalWaiters.delete(reqId);
            waiter.resolve(proposal);
          }
        }
      } else if (message.msg_type === "buy") {
          const echoedProposalId = typeof message.echo_req?.buy === "string" && message.echo_req.buy !== "1"
          ? message.echo_req.buy
          : null;
          const buyRequestId = Number(message.req_id ?? message.echo_req?.req_id);
          const buyKey = buyRequestId > 0 ? `req:${buyRequestId}` : echoedProposalId;
          const buyInput = buyKey ? getState().pendingBuyInputs.get(buyKey) : undefined;
          if (buyKey) getState().pendingBuyInputs.delete(buyKey);
        getState().lastBuy = {
          contract_id: String(message.buy?.contract_id ?? ""),
          buy_price: Number(message.buy?.buy_price ?? 0),
          payout: Number(message.buy?.payout ?? 0),
          start_time: message.buy?.start_time == null ? null : Number(message.buy.start_time),
        };
        if (getState().lastBuy.contract_id && buyInput) {
          getState().contractInputs.set(getState().lastBuy.contract_id, buyInput);
        }
        const historyItem = normalizeHistory({
          contract_id: getState().lastBuy.contract_id,
          buy_price: getState().lastBuy.buy_price,
          payout: getState().lastBuy.payout,
          purchase_time: getState().lastBuy.start_time,
          contract_type: buyInput?.contract_type ?? "unknown",
          underlying_symbol: buyInput?.symbol ?? defaultSymbol,
          status: "open",
        }, "open");
        if (historyItem) upsertHistory(historyItem);
        if (getState().lastBuy.contract_id) {
          send({ balance: 1 });
          send({
            proposal_open_contract: 1,
            contract_id: getState().lastBuy.contract_id,
            subscribe: 1,
          });
        }
        if (buyKey) {
          const buyWaiter = getState().buyWaiters.get(buyKey);
          if (buyWaiter) {
            clearTimeout(buyWaiter.timer);
            getState().buyWaiters.delete(buyKey);
            buyWaiter.resolve(getState().lastBuy);
          }
        }
      } else if (message.msg_type === "sell") {
        const reqId = Number(message.req_id ?? message.echo_req?.req_id);
        const waiter = getState().sellWaiters.get(reqId);
        if (waiter) {
          clearTimeout(waiter.timer);
          getState().sellWaiters.delete(reqId);
          waiter.resolve({
            contract_id: String(message.sell?.contract_id ?? message.echo_req?.sell ?? ""),
            sold_for: Number(message.sell?.sold_for ?? 0),
          });
        }
      } else if (message.msg_type === "proposal_open_contract") {
        const contract = message.proposal_open_contract;
        if (contract) {
          getState().lastContract = {
            contract_id: String(contract.contract_id ?? ""),
            status: String(contract.status ?? "open"),
            is_sold: Boolean(contract.is_sold),
            profit: Number(contract.profit ?? 0),
            buy_price: Number(contract.buy_price ?? getState().lastBuy?.buy_price ?? 0),
            payout: Number(contract.payout ?? getState().lastBuy?.payout ?? 0),
            sell_price: Number(contract.sell_price ?? 0),
            entry_spot: Number(contract.entry_spot ?? 0),
            current_spot: Number(contract.current_spot ?? 0),
            expiry_time: contract.expiry_time == null ? null : Number(contract.expiry_time),
          };
          const historyItem = normalizeHistory({
            ...contract,
            buy_price: getState().lastContract.buy_price,
            payout: getState().lastContract.payout,
            contract_id: getState().lastContract.contract_id,
            status: getState().lastContract.status,
            sell_time: contract.sell_time,
            contract_type: getState().contractInputs.get(getState().lastContract.contract_id)?.contract_type ?? getState().lastProposalContractType,
            underlying_symbol: getState().contractInputs.get(getState().lastContract.contract_id)?.symbol ?? getState().lastProposalSymbol,
          }, getState().lastContract.is_sold ? "closed" : "open");
          if (historyItem) upsertHistory(historyItem);
        }
      } else if (message.msg_type === "profit_table") {
        const transactions = Array.isArray(message.profit_table?.transactions)
          ? message.profit_table.transactions
          : [];
        for (const transaction of transactions) {
          const historyItem = normalizeHistory(transaction);
          if (historyItem) upsertHistory(historyItem);
        }
      } else if (message.msg_type === "portfolio") {
        const contracts = Array.isArray(message.portfolio?.contracts)
          ? message.portfolio.contracts
          : [];
        for (const contract of contracts) {
          const historyItem = normalizeHistory(contract, "open");
          if (historyItem) upsertHistory(historyItem);
        }
      }
    });

    socket.on("close", () => {
      if (!isCurrentSocket()) {
        resolveOnce(false);
        return;
      }
      getState().socket = null;
      getState().account = null;
      rejectBuyWaiters("Deriv WebSocket disconnected before the contract purchase was acknowledged");
      rejectSellWaiters("Deriv WebSocket disconnected before the contract could be sold");
      logger.warn("Deriv WebSocket closed");
      resolveOnce(false);
      if (isRuntimeCurrent()) scheduleReconnect();
    });

    socket.once("error", (error) => {
      if (!isCurrentSocket()) {
        resolveOnce(false);
        return;
      }
      logger.error({ err: error }, "Deriv WebSocket connection failed");
      rejectOnce(error);
    });
  });
}

async function connect() {
  const ownerId = userContext.getStore();
  const runtime = getState();
  if (!ownerId || runtime.shuttingDown) return false;
  if (runtime.socket?.readyState === WebSocket.OPEN) return true;
  if (runtime.connecting) return runtime.connecting;

  runtime.connecting = connectInternal()
    .catch((error) => {
      logger.error({ err: error }, "Deriv connection attempt failed");
      if (runtimes.get(ownerId) === runtime && !runtime.shuttingDown) {
        scheduleReconnect();
      }
      return false;
    })
    .finally(() => {
      runtime.connecting = null;
    });

  return runtime.connecting;
}

export function getStatus(): DerivStatus {
  const digitPercentages = getDigitPercentages();
  return {
    connected: getState().socket?.readyState === WebSocket.OPEN,
    authorized: getState().socket?.readyState === WebSocket.OPEN,
    account: getState().account,
    last_tick: getState().lastTick,
    last_proposal: getState().lastProposal,
    last_buy: getState().lastBuy,
    last_contract: getState().lastContract,
    bot_running: getState().botRunning,
    symbol: getState().selectedSymbol,
    currency: defaultCurrency,
    // There is intentionally no application-level stake ceiling. Deriv and
    // the selected account balance are the source of truth for affordability.
    max_trade_amount: 0,
    live_trading_enabled: liveTradingEnabled,
    digit_even_percentage: digitPercentages.even,
    digit_odd_percentage: digitPercentages.odd,
    digit_sample_count: getState().digitEvenCount + getState().digitOddCount,
    last_digit: getState().digitHistory.at(-1) ?? null,
    digit_history: getState().digitHistory.slice(-50),
    digit_streaks: getDigitStreaks(),
    market_signals: getMarketSignals(),
  };
}

export async function getLiveStatus() {
  await refreshSelectedBalance();
  if (getState().socket?.readyState !== WebSocket.OPEN) {
    await connect();
  }
  return getStatus();
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
    status: await getLiveStatus(),
  };
}

export async function requestProposal(input: ProposalInput) {
  validateAccumulatorInput(input);
  getState().lastProposalContractType = input.contract_type;
  getState().lastProposalSymbol = input.symbol ?? defaultSymbol;
  getState().lastProposalInput = input;
  const connected = await connect();
  if (!connected || !sendProposalRequest(input)) {
    throw new Error("Deriv WebSocket is not ready");
  }
  return {
    ok: true,
    message: "Proposal requested. Review the returned quote before any trade action.",
  };
}

async function requestFreshProposal(input: ProposalInput) {
  getState().lastProposalContractType = input.contract_type;
  getState().lastProposalSymbol = input.symbol ?? defaultSymbol;
  getState().lastProposalInput = input;
  let lastError = "Deriv WebSocket is not ready";

  for (let attempt = 1; attempt <= proposalAttempts; attempt += 1) {
    const connected = await connect();
    if (!connected) {
      lastError = "Deriv WebSocket is not ready";
    } else {
      try {
        const proposal = await new Promise<DerivProposal>((resolve, reject) => {
          const reqId = ++getState().proposalSequence;
          const timer = setTimeout(() => {
            getState().proposalWaiters.delete(reqId);
            reject(new Error("Deriv did not return a proposal in time"));
          }, proposalTimeoutMs);
          getState().proposalWaiters.set(reqId, { resolve, reject, timer });
          const sent = sendStakeProposal(input, reqId);
          if (!sent) {
            clearTimeout(timer);
            getState().proposalWaiters.delete(reqId);
            reject(new Error("Deriv WebSocket is not ready"));
          }
        });
        return proposal;
      } catch (error) {
        lastError = error instanceof Error ? error.message : "Deriv proposal request failed";
        logger.warn({ attempt, err: error }, "Deriv proposal attempt failed");
      }
    }

    if (attempt < proposalAttempts) {
      // A stale authenticated socket can stay open while no longer delivering
      // replies. Force a clean reconnect before the next correlated request.
      getState().socket?.close();
      getState().socket = null;
      await new Promise((resolve) => setTimeout(resolve, 350 * attempt));
    }
  }

  throw new Error(
    lastError === "Deriv did not return a proposal in time"
      ? "Deriv did not return a proposal after 3 attempts. The connection was refreshed; please try again."
      : lastError,
  );
}

export async function selectAccount(accountId: string) {
  const accounts = getState().accounts.length ? getState().accounts : await loadAccountsFromDeriv();
  const account = accounts.find((item: DerivAccount) => item.id === accountId);
  if (!account) throw new Error("That account is not available");
  if (account.type === "real" && !liveTradingEnabled) {
    throw new Error("Live trading is disabled on this server");
  }

  getState().selectedAccountId = account.id;
  rejectProposalWaiters("Deriv account changed before proposal completed");
  getState().socket?.close();
  getState().socket = null;
  getState().account = null;
  getState().lastProposal = null;
  getState().lastBuy = null;
  getState().lastContract = null;
  rejectBuyWaiters("Deriv account changed before the contract purchase was acknowledged");
  getState().lastProposalContractType = "";
  getState().lastProposalSymbol = defaultSymbol;
  getState().lastProposalInput = null;
  getState().lastProposalRefreshAt = 0;
  getState().digitEvenCount = 0;
  getState().digitOddCount = 0;
  getState().digitHistory = [];
  getState().marketHistory.clear();
  await connect();
  return getStatus();
}

export async function selectSymbol(symbol: string) {
  if (!supportedSymbols.has(symbol)) throw new Error("That market is not supported");
  if (getState().selectedSymbol === symbol) return getStatus();
  getState().selectedSymbol = symbol;
  const market = getState().marketHistory.get(symbol);
  getState().lastTick = market?.quote == null
    ? null
    : { symbol, quote: market.quote, epoch: market.epoch };
  getState().digitHistory = [...(market?.digitHistory ?? [])];
  getState().digitEvenCount = getState().digitHistory.filter((digit: number) => digit % 2 === 0).length;
  getState().digitOddCount = getState().digitHistory.length - getState().digitEvenCount;
  getState().lastProposal = null;
  getState().lastProposalInput = null;
  send({ ticks: symbol, subscribe: 1 });
  return getStatus();
}

export async function buyContract(input: BuyInput) {
  const normalizedInput = { ...input, amount: roundCents(input.amount) };
  if (!getState().account) throw new Error("Select an account before buying a contract");
  if (getState().account.type === "real" && !liveTradingEnabled) {
    throw new Error("Live trading is disabled on this server");
  }
  if (getState().account.type === "real" && !input.confirm_live_trade) {
    throw new Error("Explicit live-trade confirmation is required");
  }
  if (normalizedInput.amount > getState().account.balance) {
    throw new Error("The selected stake exceeds the current account balance");
  }
  validateContractBarrier(normalizedInput);
  validateAccumulatorInput(normalizedInput);
  assertTradingProtection(await getTradingProtectionSettings(), getStatus(), normalizedInput);
  assertNoActiveContract();
  const remainingCooldown = 1000 - (Date.now() - getState().lastBuyAt);
  if (remainingCooldown > 0) {
    throw new Error(`Buy cooldown active. Wait ${Math.ceil(remainingCooldown / 1000)} second.`);
  }
  getState().lastBuyAt = Date.now();
  const proposal = await requestFreshProposal({
    amount: normalizedInput.amount,
    duration: normalizedInput.duration,
    duration_unit: normalizedInput.duration_unit,
    contract_type: normalizedInput.contract_type,
    barrier: normalizedInput.barrier,
    growth_rate: normalizedInput.growth_rate,
    symbol: normalizedInput.symbol,
  });
  const connected = await connect();
  if (!connected) {
    throw new Error("Deriv WebSocket is not ready");
  }
  const buy = await sendProposalBuy(proposal, normalizedInput);
  return {
    ok: true,
    message: getState().account.type === "real"
      ? "Live buy request sent. Contract and balance updates will appear here."
      : "Demo buy request sent to Deriv. Contract and balance updates will appear here.",
    proposal,
    buy,
  };
}

export async function sellContract(contractId: string) {
  if (!contractId.trim()) throw new Error("A contract id is required to close a contract");
  const connected = await connect();
  if (!connected) throw new Error("Deriv WebSocket is not ready");
  const result = await sendSell(contractId.trim());
  const matching = getState().history.find((trade: DerivHistoryItem) => trade.contract_id === contractId.trim());
  if (matching) {
    upsertHistory({
      ...matching,
      status: "closed",
      sell_time: Math.floor(Date.now() / 1000),
      profit: result.sold_for - matching.buy_price,
    });
  }
  return { ok: true, ...result };
}

export async function bulkBuyContracts(input: {
  amount: number;
  duration: number;
  duration_unit: "t";
  contract_type: DigitContractType;
  barrier?: number;
  symbol?: string;
  growth_rate?: number;
  count: number;
  confirm_live_trade: true;
}) {
  const amount = roundCents(input.amount);
  if (!getState().account) throw new Error("Select an account before buying contracts");
  if (getState().account.type === "real" && !liveTradingEnabled) {
    throw new Error("Live trading is disabled on this server");
  }
  if (getState().account.type === "real" && !input.confirm_live_trade) {
    throw new Error("Explicit live-trade confirmation is required");
  }
  if (amount * input.count > getState().account.balance) {
    throw new Error("The selected bulk stake exceeds the current account balance");
  }
  validateContractBarrier(input);
  validateAccumulatorInput(input);
  assertTradingProtection(await getTradingProtectionSettings(), getStatus(), input);

  const proposalInput = {
    amount,
    duration: input.duration,
    duration_unit: input.duration_unit,
    contract_type: input.contract_type,
    barrier: input.barrier,
    growth_rate: input.growth_rate,
    symbol: input.symbol,
  } satisfies ProposalInput;

  // Quote the complete batch before buying anything. This prevents a
  // partially-started batch when one contract is unavailable, and lets the
  // buys leave the socket together instead of serializing them.
  const proposals = await Promise.all(
    Array.from({ length: input.count }, () => requestFreshProposal(proposalInput)),
  );
  const connected = await connect();
  if (!connected) throw new Error("Deriv WebSocket is not ready");

  // Direct parameter buys use the fresh quote as the maximum price and avoid
  // holding temporary proposal IDs until the whole batch is ready. Deriv can
  // invalidate those IDs between the proposal response and a later buy.
  await Promise.all(proposals.map((proposal) => sendDirectBuy(proposal, proposalInput)));

  return {
    ok: true,
    count: proposals.length,
    message: getState().account.type === "real"
      ? `${proposals.length} live buy requests sent together.`
      : `${proposals.length} demo buy requests sent together.`,
    proposals,
  };
}

function validateContractBarrier(input: { contract_type: DigitContractType; barrier?: number }) {
  const requiresBarrier = input.contract_type === "DIGITDIFF"
    || input.contract_type === "DIGITOVER"
    || input.contract_type === "DIGITUNDER";
  const barrier = input.barrier;
  if (requiresBarrier && (typeof barrier !== "number" || !Number.isInteger(barrier) || barrier < 0 || barrier > 9)) {
    throw new Error(`A digit barrier from 0 to 9 is required for ${input.contract_type}.`);
  }
  if (input.contract_type === "DIGITOVER" && barrier === 9) {
    throw new Error("DIGITOVER barrier 9 offers no return. Choose a barrier from 0 to 8.");
  }
  if (input.contract_type === "DIGITUNDER" && barrier === 0) {
    throw new Error("DIGITUNDER barrier 0 offers no return. Choose a barrier from 1 to 9.");
  }
}

function validateAccumulatorInput(input: {
  contract_type: DigitContractType;
  amount: number;
  growth_rate?: number;
}) {
  if (input.contract_type !== "ACCU") return;
  if (input.amount < 1) {
    throw new Error("Accumulator stakes must be at least 1.00.");
  }
  if (
    input.growth_rate == null
    || !Number.isFinite(input.growth_rate)
    || input.growth_rate < 0.01
    || input.growth_rate > 0.05
  ) {
    throw new Error("Accumulator growth rate must be between 0.01 and 0.05.");
  }
}

export async function dualBuyContracts(input: {
  amount: number;
  duration: number;
  duration_unit: "t";
  barrier: number;
  symbol?: string;
  confirm_live_trade: true;
}) {
  if (!getState().account) throw new Error("Select an account before buying contracts");
  if (getState().account.type === "real" && !liveTradingEnabled) {
    throw new Error("Live trading is disabled on this server");
  }
  if (getState().account.type === "real" && !input.confirm_live_trade) {
    throw new Error("Explicit live-trade confirmation is required");
  }
  if (input.amount * 2 > getState().account.balance) {
    throw new Error("The selected dual stake exceeds the current account balance");
  }
  const protection = await getTradingProtectionSettings();
  assertTradingProtection(protection, getStatus(), { ...input, contract_type: "DIGITOVER" });
  assertNoActiveContract();

  const proposals: Array<{ proposal: DerivProposal; contract_type: "DIGITOVER" | "DIGITUNDER" }> = [];
  for (const contract_type of ["DIGITOVER", "DIGITUNDER"] as const) {
    const proposal = await requestFreshProposal({
      amount: input.amount,
      duration: input.duration,
      duration_unit: input.duration_unit,
      contract_type,
      barrier: input.barrier,
      symbol: input.symbol,
    });
    const connected = await connect();
    if (!connected) throw new Error("Deriv WebSocket is not ready");
    const buyInput = {
      amount: input.amount,
      duration: input.duration,
      duration_unit: input.duration_unit,
      contract_type,
      barrier: input.barrier,
      symbol: input.symbol,
    } satisfies ProposalInput;
    await sendProposalBuy(proposal, buyInput);
    proposals.push({ proposal, contract_type });
  }

  return {
    ok: true,
    count: proposals.length,
    message: getState().account.type === "real"
      ? "Dual Mode sent one live Over and one live Under request."
      : "Dual Mode sent one demo Over and one demo Under request.",
    proposals: proposals.map(({ proposal }) => proposal),
  };
}

export function getHistory() {
  return getState().history;
}

export function clearHistory() {
  for (const item of getState().history) getState().hiddenHistoryIds.add(item.contract_id);
  getState().history = [];
  return { ok: true, message: "Recent dashboard trade rows cleared. Deriv records were not deleted." };
}

export function startDeriv() {
}

export function stopDeriv() {
  clearInterval(runtimeReaper);
  for (const userId of runtimes.keys()) disposeUser(userId);
}