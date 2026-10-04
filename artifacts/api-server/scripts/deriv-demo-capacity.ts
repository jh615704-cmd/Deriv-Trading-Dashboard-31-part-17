import WebSocket from "ws";
import { performance } from "node:perf_hooks";

const API_BASE = "https://api.derivws.com";
const appId = process.env.DERIV_APP_ID;
const demoPats = [
  process.env.DERIV_DEMO_TEST_PAT_1,
  process.env.DERIV_DEMO_TEST_PAT_2,
  process.env.DERIV_DEMO_TEST_PAT_3,
  process.env.DERIV_DEMO_TEST_PAT_4,
];
const stageTargets = [1, 2, 4];
const stageHoldMs = 10_000;
const symbols = [
  "R_10", "R_25", "R_50", "R_75", "R_100",
  "1HZ10V", "1HZ15V", "1HZ25V", "1HZ30V", "1HZ50V", "1HZ75V", "1HZ90V", "1HZ100V",
  "JD10", "JD25", "JD50", "JD75", "JD100",
];

type DerivMessage = Record<string, any>;
type DerivAccount = Record<string, any>;

function requireDemoTestConfig() {
  if (demoPats.some((value) => !value)) {
    throw new Error("Set the four dedicated DERIV_DEMO_TEST_PAT_1..4 secrets before running this probe.");
  }
  if (!appId) {
    throw new Error("Set DERIV_APP_ID before running this probe.");
  }
  if (new Set(demoPats).size !== demoPats.length) {
    throw new Error("Use four distinct demo PATs; the probe will not open multiple sessions for one PAT.");
  }
}

async function derivRequest(pat: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Deriv-App-ID": appId!,
      Authorization: `Bearer ${pat}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({})) as DerivMessage;
  if (!response.ok) {
    throw new Error(`Deriv read-only request failed with HTTP ${response.status}.`);
  }
  return body;
}

function getAccounts(body: DerivMessage): DerivAccount[] {
  if (Array.isArray(body.data)) return body.data;
  if (body.data && Array.isArray(body.data.accounts)) return body.data.accounts;
  if (Array.isArray(body.accounts)) return body.accounts;
  return [];
}

async function getDemoAccounts(pat: string) {
  const response = await derivRequest(pat, "/trading/v1/options/accounts");
  const accountIds = getAccounts(response).flatMap((account) => {
    const id = String(account.account_id ?? account.accountId ?? account.loginid ?? account.id ?? "");
    const isDemo = String(account.account_type ?? account.type ?? "").toLowerCase() === "demo"
      || id.toUpperCase().startsWith("DOT");
    return isDemo && id ? [id] : [];
  });
  const uniqueAccountIds = [...new Set(accountIds)];
  if (uniqueAccountIds.length === 0) {
    throw new Error("The supplied PAT has no identifiable demo Options account; no connection was opened.");
  }
  return uniqueAccountIds;
}

function assignDistinctDemoAccounts(accountOptions: string[][]): string[] | null {
  const assignment: Array<string | undefined> = new Array(accountOptions.length);
  const order = accountOptions
    .map((options, index) => ({ index, options }))
    .sort((left, right) => left.options.length - right.options.length)
    .map(({ index }) => index);
  const assignedIds = new Set<string>();

  function assign(position: number): boolean {
    if (position === order.length) return true;
    const patIndex = order[position];
    for (const accountId of accountOptions[patIndex]) {
      if (assignedIds.has(accountId)) continue;
      assignedIds.add(accountId);
      assignment[patIndex] = accountId;
      if (assign(position + 1)) return true;
      assignedIds.delete(accountId);
      assignment[patIndex] = undefined;
    }
    return false;
  }

  if (!assign(0)) return null;
  return assignment as string[];
}

async function getOtpUrl(pat: string, accountId: string) {
  const response = await derivRequest(
    pat,
    `/trading/v1/options/accounts/${encodeURIComponent(accountId)}/otp`,
    { method: "POST" },
  );
  const url = response.data?.url;
  if (typeof url !== "string" || !url.startsWith("wss://")) {
    throw new Error("Deriv did not return a valid authenticated WebSocket URL.");
  }
  return url as string;
}

function parseMessage(raw: WebSocket.RawData): DerivMessage | null {
  try {
    return JSON.parse(raw.toString()) as DerivMessage;
  } catch {
    return null;
  }
}

function waitForOpen(socket: WebSocket, timeoutMs = 12_000) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Demo WebSocket did not open before timeout."));
    }, timeoutMs);
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Demo WebSocket connection failed."));
    };
    const cleanup = () => {
      clearTimeout(timer);
      socket.off("open", onOpen);
      socket.off("error", onError);
    };
    socket.once("open", onOpen);
    socket.once("error", onError);
  });
}

function waitForMessage(
  socket: WebSocket,
  predicate: (message: DerivMessage) => boolean,
  send: () => void,
  timeoutMs = 12_000,
) {
  return new Promise<DerivMessage>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Deriv did not return the expected read-only response."));
    }, timeoutMs);
    const onMessage = (raw: WebSocket.RawData) => {
      const message = parseMessage(raw);
      if (!message) return;
      if (message.error) {
        cleanup();
        reject(new Error("Deriv rejected a read-only demo request."));
        return;
      }
      if (predicate(message)) {
        cleanup();
        resolve(message);
      }
    };
    const cleanup = () => {
      clearTimeout(timer);
      socket.off("message", onMessage);
    };
    socket.on("message", onMessage);
    send();
  });
}

function hasOpenContract(portfolio: DerivMessage) {
  const contracts = Array.isArray(portfolio.portfolio?.contracts)
    ? portfolio.portfolio.contracts as DerivMessage[]
    : [];
  return contracts.some((contract) =>
    String(contract.status ?? "").toLowerCase() === "open"
    && contract.is_sold !== 1
    && contract.is_sold !== true,
  );
}

type DemoSession = {
  socket: WebSocket;
  tickCount: number;
  latencyMs: number;
};

async function openReadOnlySession(pat: string, accountId: string): Promise<DemoSession> {
  const startedAt = performance.now();
  const url = await getOtpUrl(pat, accountId);
  const socket = new WebSocket(url, { handshakeTimeout: 12_000 });
  try {
    await waitForOpen(socket);
    const session: DemoSession = { socket, tickCount: 0, latencyMs: 0 };
    socket.on("message", (raw) => {
      const message = parseMessage(raw);
      if (message?.msg_type === "tick") session.tickCount += 1;
    });

    const portfolio = await waitForMessage(
      socket,
      (message) => message.msg_type === "portfolio",
      () => socket.send(JSON.stringify({ portfolio: 1, req_id: 101 })),
    );
    if (hasOpenContract(portfolio)) {
      throw new Error("A dedicated demo account has open positions; the probe stopped without changing them.");
    }

    await waitForMessage(
      socket,
      (message) => message.msg_type === "profit_table",
      () => socket.send(JSON.stringify({
        profit_table: 1,
        limit: 50,
        description: 1,
        sort: "DESC",
        req_id: 102,
      })),
    );
    socket.send(JSON.stringify({ balance: 1, subscribe: 1, req_id: 103 }));

    await waitForMessage(
      socket,
      (message) => message.msg_type === "tick" && message.tick?.symbol === "R_75",
      () => socket.send(JSON.stringify({ ticks: "R_75", subscribe: 1, req_id: 104 })),
    );
    for (const symbol of symbols) {
      if (symbol === "R_75") continue;
      socket.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
    }
    session.latencyMs = Math.round(performance.now() - startedAt);
    return session;
  } catch (error) {
    socket.close();
    throw error;
  }
}

function closeSessions(sessions: DemoSession[]) {
  for (const session of sessions) {
    if (
      session.socket.readyState === WebSocket.OPEN
      || session.socket.readyState === WebSocket.CONNECTING
    ) {
      session.socket.close();
    }
  }
}

function roundMiB(bytes: number) {
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

async function run() {
  requireDemoTestConfig();
  const pats = demoPats as string[];
  const accountOptions = await Promise.all(pats.map((pat) => getDemoAccounts(pat)));
  const accountIds = assignDistinctDemoAccounts(accountOptions);
  if (!accountIds) {
    const uniqueAccountCount = new Set(accountOptions.flat()).size;
    throw new Error(
      `The four PATs expose only ${uniqueAccountCount} distinct demo account(s); no WebSocket sessions were opened.`,
    );
  }
  const sessions: DemoSession[] = [];
  const report: Array<Record<string, number>> = [];
  const baseline = process.memoryUsage();

  try {
    for (const target of stageTargets) {
      const batchSize = target - sessions.length;
      const firstNewSessionIndex = sessions.length;
      const stageSessions: DemoSession[] = [];
      const startedAt = performance.now();
      await Promise.all(
        Array.from({ length: batchSize }, (_, offset) => firstNewSessionIndex + offset)
          .map(async (index) => {
            const session = await openReadOnlySession(pats[index], accountIds[index]);
            stageSessions.push(session);
            sessions.push(session);
          }),
      );
      await new Promise((resolve) => setTimeout(resolve, stageHoldMs));
      const memory = process.memoryUsage();
      report.push({
        sessions: target,
        stageConnectMs: Math.round(performance.now() - startedAt),
        meanSessionReadyMs: Math.round(
          stageSessions.reduce((sum, session) => sum + session.latencyMs, 0) / stageSessions.length,
        ),
        ticksReceived: sessions.reduce((sum, session) => sum + session.tickCount, 0),
        rssMiB: roundMiB(memory.rss),
        heapUsedMiB: roundMiB(memory.heapUsed),
      });
    }

    console.log(JSON.stringify({
      test: "deriv_demo_read_only_connection_capacity",
      stages: report,
      baselineRssMiB: roundMiB(baseline.rss),
      tradeMessagesSent: 0,
      accountIdsLogged: false,
      credentialsLogged: false,
    }));
  } finally {
    closeSessions(sessions);
  }
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Demo capacity probe failed.";
  console.error(message);
  process.exitCode = 1;
});