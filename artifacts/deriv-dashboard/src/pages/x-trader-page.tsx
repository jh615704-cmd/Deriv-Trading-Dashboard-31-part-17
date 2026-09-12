import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useClearDerivHistory,
  useDeleteDerivToken,
  useGetDerivAccounts,
  useGetDerivHistory,
  useGetDerivStatus,
  useGetDerivTokenStatus,
  useBulkBuyDerivContracts,
  getDerivHistory,
  useSelectDerivAccount,
  useSelectDerivSymbol,
  useTestDerivConnection,
  useTestDerivToken,
  getGetDerivTokenStatusQueryKey,
  getGetDerivAccountsQueryKey,
  getGetDerivStatusQueryKey,
  getGetDerivHistoryQueryKey,
} from "@workspace/api-client-react";
import {
  Activity, BookOpen, Bot, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign, Link2, Loader2,
  Pause, Play, Power, RefreshCw, RotateCcw, ShieldAlert, Trash2, X, Zap,
} from "lucide-react";

const markets = [
  ["R_10", "Volatility 10 Index"], ["R_25", "Volatility 25 Index"],
  ["R_50", "Volatility 50 Index"], ["R_75", "Volatility 75 Index"],
  ["R_100", "Volatility 100 Index"], ["1HZ10V", "Volatility 10 (1s)"],
  ["1HZ25V", "Volatility 25 (1s)"], ["1HZ50V", "Volatility 50 (1s)"],
  ["1HZ75V", "Volatility 75 (1s)"], ["1HZ100V", "Volatility 100 (1s)"],
  ["JD10", "Jump 10 Index"], ["JD25", "Jump 25 Index"], ["JD50", "Jump 50 Index"],
  ["JD75", "Jump 75 Index"], ["JD100", "Jump 100 Index"],
] as const;

const guidePages = [
  { title: "Welcome to X Trader", body: "X Trader is a digit-contract workspace for testing Over and Under ideas with a controlled stake, a selected market, and visible session results.", points: ["Use demo accounts while learning.", "Every trade uses the selected duration, stake, market, and barrier.", "The guide explains the controls before you start."] },
  { title: "Connect and choose an account", body: "Connect a Deriv PAT with read and trade permissions, then select the account you want to use. The active balance is refreshed from Deriv.", points: ["Demo accounts are the safest place to validate a strategy.", "Real accounts require live-trading confirmation.", "Account changes clear the active market session state."] },
  { title: "Markets and live ticks", body: "Each supported market streams live quotes. The final digit of each quote becomes the digit signal used by the streak display.", points: ["Switch markets from the Market selector.", "The last tick shows the current quote and final digit.", "Past ticks describe history; they do not control the next tick."] },
  { title: "What Over means", body: "An Over contract wins when the last digit at expiry is above the selected barrier. For example, Over 1 wins on digits 2 through 9.", points: ["Choose a barrier from the digit row.", "The button label always shows the current barrier.", "The result is decided by the contract expiry, not by the entry quote."] },
  { title: "What Under means", body: "An Under contract wins when the last digit at expiry is below the selected barrier. For example, Under 1 wins only on digit 0.", points: ["Over and Under have different winning ranges.", "Changing the barrier changes the winning range.", "Do not treat a visible streak as a promise about the next result."] },
  { title: "Choosing a digit barrier", body: "The digit row shows recent Over and Under streak lengths for each barrier. Selecting a digit changes both the contract label and the configuration summary.", points: ["A larger barrier gives Over more possible winning digits.", "A smaller barrier gives Under more possible winning digits.", "Compare the streaks with the payout and your risk limit."] },
  { title: "Duration in ticks", body: "Duration controls how many ticks the contract observes before settlement. Short durations resolve quickly and can also change rapidly.", points: ["Use 1 tick for fast experiments.", "Use longer durations only when your strategy is designed for them.", "Duration does not improve the probability by itself."] },
  { title: "Stake and balance", body: "Stake is the amount risked on each contract. Bulk actions check that the requested total stake fits inside the current account balance before sending.", points: ["Total bulk stake equals stake multiplied by trade count.", "Keep a reserve instead of risking the full balance.", "A valid balance check cannot prevent market losses."] },
  { title: "Flat stake strategy", body: "Flat staking uses the same stake on every trade. It is the simplest baseline and makes session results easier to compare.", points: ["Use it to measure a signal without changing risk size.", "Set Take Profit and Stop Loss before starting.", "A losing trade does not automatically justify a larger next stake."] },
  { title: "Martingale after loss", body: "Martingale increases the next stake after a loss by the configured multiplier. It can grow exposure quickly and may exhaust a balance after a short losing run.", points: ["Set a low multiplier and a hard stop if you test it.", "The strategy is not a recovery guarantee.", "Demo testing is strongly recommended before any live use."] },
  { title: "Auto Best Digit", body: "Auto Best Digit ranks the live signals from all supported markets using available tick history, current sample size, and the strongest recent Over or Under streak. It selects a market, direction, and barrier for the next batch.", points: ["The score favors fresh markets with enough observations.", "It is a signal-selection aid, not a prediction engine.", "No market logic can guarantee a win rate or remove risk."] },
  { title: "How the signal score works", body: "The built-in score compares recent consecutive digits above and below each candidate barrier across every subscribed market. Stronger, better-sampled signals rank higher.", points: ["Signals with no recent ticks are ignored.", "The selected market can change when a stronger signal appears.", "Recent streak length is descriptive, not proof of future probability."] },
  { title: "Bulk Over and Under", body: "Choose the number of trades per batch, then use the Over or Under button below Run X Trader. The selected barrier is shown directly on each button.", points: ["Bulk sends 1 to 5 contracts together with no UI cooldown.", "The server checks the total requested stake against the balance.", "A rejected batch is reported instead of silently sending fewer trades."] },
  { title: "Run X Trader", body: "Run X Trader starts the repeating loop using the current direction, barrier, duration, stake, strategy, and batch size. Stop ends the loop after the active request completes.", points: ["Use the immediate Over and Under buttons for a single batch.", "Use Run X Trader only after reviewing the full configuration.", "Turning off X Trader stops the loop and hides its controls."] },
  { title: "Take Profit", body: "Take Profit stops the repeating loop after the session reaches the configured positive P/L. It applies to the local session total, not to your entire Deriv account history.", points: ["Choose an amount you can accept as a session target.", "The target is checked as results settle.", "Take Profit does not close a contract early."] },
  { title: "Stop Loss", body: "Stop Loss stops the repeating loop after the session reaches the configured negative P/L. It is a guardrail, not a guarantee that losses cannot exceed the target.", points: ["Use a smaller loss limit while testing.", "Bulk trades can settle after the loop is stopped.", "Review the trade history before starting another session."] },
  { title: "Live-money protection", body: "Real accounts require an explicit live-funds confirmation before Run X Trader or an immediate bulk action can send contracts.", points: ["Read the confirmation carefully.", "The server also enforces its live-trading configuration.", "If you are learning, switch back to a demo account."] },
  { title: "Reading session results", body: "Session P/L and Trades Sent show only activity since the last Reset. Recent Trades contains the dashboard rows received from the Deriv stream.", points: ["Reset clears only Session P/L and Trades Sent.", "Reset does not change stake, duration, barrier, or strategy.", "Clear Recent Trades removes dashboard rows without deleting Deriv records."] },
  { title: "A safe pre-trade checklist", body: "Before sending anything, confirm the account, market, direction, barrier, duration, stake, batch size, and risk limits.", points: ["Start with a demo account.", "Confirm the total bulk stake is affordable.", "Never rely on a claimed guaranteed win rate."] },
  { title: "Let's start trading", body: "You now know how the market selector, Over and Under contracts, bulk actions, strategies, auto signal selection, and risk controls work.", points: ["Start with one small demo batch.", "Watch the settlement and confirm the history updates.", "Keep the guide available whenever you change strategy."] },
] as const;

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Request failed";

export default function XTraderPage() {
  const queryClient = useQueryClient();
  const tokenStatus = useGetDerivTokenStatus({ query: { retry: false, queryKey: getGetDerivTokenStatusQueryKey() } });
  const connectedToken = Boolean(tokenStatus.data?.has_token);
  const accounts = useGetDerivAccounts({ query: { enabled: connectedToken, retry: false, refetchInterval: 10_000, queryKey: getGetDerivAccountsQueryKey() } });
  const status = useGetDerivStatus({ query: { enabled: connectedToken, retry: false, refetchInterval: 250, queryKey: getGetDerivStatusQueryKey() } });
  const history = useGetDerivHistory({ query: { enabled: connectedToken, retry: false, refetchInterval: 500, queryKey: getGetDerivHistoryQueryKey() } });
  const tokenMutation = useTestDerivToken();
  const connectionMutation = useTestDerivConnection();
  const deleteTokenMutation = useDeleteDerivToken();
  const accountMutation = useSelectDerivAccount();
  const symbolMutation = useSelectDerivSymbol();
  const bulkBuyMutation = useBulkBuyDerivContracts();
  const clearMutation = useClearDerivHistory();

  const [pat, setPat] = useState("");
  const [symbol, setSymbol] = useState("R_75");
  const [direction, setDirection] = useState<"DIGITOVER" | "DIGITUNDER">("DIGITOVER");
  const [barrier, setBarrier] = useState(5);
  const [duration, setDuration] = useState(1);
  const [stake, setStake] = useState(1);
  const [strategy, setStrategy] = useState<"flat" | "martingale">("flat");
  const [martingale, setMartingale] = useState(2);
  const [takeProfit, setTakeProfit] = useState(10);
  const [stopLoss, setStopLoss] = useState(10);
  const [bulk, setBulk] = useState(1);
  const [autoSwitch, setAutoSwitch] = useState(false);
  const [xTraderEnabled, setXTraderEnabled] = useState(true);
  const [running, setRunning] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guidePage, setGuidePage] = useState(0);
  const [clearHistoryArmed, setClearHistoryArmed] = useState(false);
  const [historyFading, setHistoryFading] = useState(false);
  const [liveConfirmed, setLiveConfirmed] = useState(false);
  const [sessionPnl, setSessionPnl] = useState(0);
  const [sessionTrades, setSessionTrades] = useState(0);
  const [baselinePnl, setBaselinePnl] = useState(0);
  const [indicatorDigit, setIndicatorDigit] = useState(5);
  const [connectionMessage, setConnectionMessage] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const runningRef = useRef(false);
  const configRef = useRef({ direction, barrier, duration, stake, strategy, martingale, bulk, symbol, liveConfirmed });

  const currentAccount = status.data?.account;
  const isReal = currentAccount?.type === "real";
  const isConnected = Boolean(status.data?.connected && status.data?.authorized);
  const rows = history.data ?? [];
  const settledPnl = rows.reduce((sum, trade) => sum + (trade.status === "open" ? 0 : trade.profit), 0);
  const liveContract = status.data?.last_contract;
  const liveContractRow = liveContract
    ? rows.find((trade) => trade.contract_id === liveContract.contract_id)
    : undefined;
  const liveUnsettledPnl = liveContract && (!liveContractRow || liveContractRow.status === "open")
    ? liveContract.profit
    : 0;
  const fastSessionPnl = settledPnl - baselinePnl + liveUnsettledPnl;
  const streaks = status.data?.digit_streaks ?? [];
  const selectedStreak = streaks.find((item) => item.digit === barrier);
  const lastDigit = status.data?.last_digit;

  useEffect(() => {
    configRef.current = { direction, barrier, duration, stake, strategy, martingale, bulk, symbol, liveConfirmed };
  }, [direction, barrier, duration, stake, strategy, martingale, bulk, symbol, liveConfirmed]);

  useEffect(() => {
    if (lastDigit != null && lastDigit >= 1 && lastDigit <= 9) setIndicatorDigit(lastDigit);
  }, [lastDigit]);

  useEffect(() => {
    const pnl = fastSessionPnl;
    setSessionPnl(pnl);
    if (!running) return;
    if (pnl >= takeProfit || pnl <= -stopLoss) {
      runningRef.current = false;
      setRunning(false);
      setConnectionMessage({
        kind: "info",
        text: `${pnl >= takeProfit ? "Take profit" : "Stop loss"} reached at ${pnl.toFixed(2)} ${currentAccount?.currency ?? "USD"}.`,
      });
    }
  }, [fastSessionPnl, running, takeProfit, stopLoss, currentAccount?.currency]);

  useEffect(() => () => { runningRef.current = false; }, []);

  const connectPat = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pat.trim()) return;
    setConnectionMessage({ kind: "info", text: "Validating PAT and opening the Deriv connection…" });
    try {
      const tokenResult = await tokenMutation.mutateAsync({ data: { token: pat.trim() } });
      setPat("");
      queryClient.setQueryData(getGetDerivAccountsQueryKey(), tokenResult.accounts);
      await queryClient.invalidateQueries({ queryKey: getGetDerivTokenStatusQueryKey() });
      await connectionMutation.mutateAsync();
      await queryClient.invalidateQueries({ queryKey: getGetDerivAccountsQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetDerivStatusQueryKey() });
      setConnectionMessage({ kind: "info", text: "Deriv connected. Your PAT is encrypted and saved." });
    } catch (error) {
      setConnectionMessage({ kind: "error", text: errorMessage(error) });
    }
  };

  const disconnect = async () => {
    runningRef.current = false;
    setRunning(false);
    await deleteTokenMutation.mutateAsync();
    queryClient.clear();
    void tokenStatus.refetch();
  };

  const chooseBestDigit = async () => {
    const signals = status.data?.market_signals ?? [];
    const candidates = signals
      .filter((signal) => signal.sample_count >= 5 && signal.quote != null)
      .flatMap((signal) => signal.digit_streaks.flatMap((item) => [
        {
          symbol: signal.symbol,
          direction: "DIGITOVER" as const,
          digit: item.digit,
          streak: item.over,
          sampleCount: signal.sample_count,
        },
        {
          symbol: signal.symbol,
          direction: "DIGITUNDER" as const,
          digit: item.digit,
          streak: item.under,
          sampleCount: signal.sample_count,
        },
      ]))
      .sort((left, right) => (right.streak * 3 + Math.min(right.sampleCount, 100) / 100)
        - (left.streak * 3 + Math.min(left.sampleCount, 100) / 100));
    const fallback = streaks.flatMap((item) => [
      { symbol, direction: "DIGITOVER" as const, digit: item.digit, streak: item.over, sampleCount: status.data?.digit_sample_count ?? 0 },
      { symbol, direction: "DIGITUNDER" as const, digit: item.digit, streak: item.under, sampleCount: status.data?.digit_sample_count ?? 0 },
    ]).sort((left, right) => right.streak - left.streak)[0];
    const best = candidates[0] ?? fallback;
    if (!best) return;
    if (best.symbol !== symbol) await selectMarket(best.symbol);
    setDirection(best.direction);
    setBarrier(best.digit);
    configRef.current = { ...configRef.current, direction: best.direction, barrier: best.digit, symbol: best.symbol };
  };

  const executeBatch = async () => {
    const config = configRef.current;
    let amount = config.stake;
    // Do not decide the next stake from an older settled result while the
    // immediately preceding contract is still open.
    let latestRows = await getDerivHistory();
    for (let attempt = 0; latestRows.some((trade) => trade.status === "open") && attempt < 20; attempt += 1) {
      await sleep(500);
      latestRows = await getDerivHistory();
    }
    if (latestRows.some((trade) => trade.status === "open")) {
      throw new Error("The previous contract is still settling. X Trader stopped without sending another trade.");
    }
    queryClient.setQueryData(getGetDerivHistoryQueryKey(), latestRows);
    const lastSettled = latestRows.find((trade) => trade.status !== "open");
    if (config.strategy === "martingale" && lastSettled && lastSettled.profit < 0) {
      amount = Number((config.stake * config.martingale).toFixed(2));
    }
    if (!runningRef.current) return;
    await bulkBuyMutation.mutateAsync({
      data: {
        amount,
        duration: config.duration,
        duration_unit: "t",
        contract_type: config.direction,
        barrier: config.barrier,
        symbol: config.symbol,
        count: config.bulk,
        confirm_live_trade: true,
      },
    });
    setSessionTrades((value) => value + config.bulk);
    await queryClient.invalidateQueries();
  };

  const runLoop = async () => {
    while (runningRef.current) {
      try {
        if (autoSwitch) await chooseBestDigit();
        await executeBatch();
        // Give the contract time to settle before the next loop reads the
        // result. A single loss then affects exactly the following trade.
        if (runningRef.current) await sleep(Math.max(1_300, configRef.current.duration * 1_100));
      } catch (error) {
        runningRef.current = false;
        setRunning(false);
        setConnectionMessage({ kind: "error", text: errorMessage(error) });
      }
    }
  };

  const start = () => {
    if (!isConnected) return;
    if (isReal && !liveConfirmed) {
      setConnectionMessage({ kind: "error", text: "Confirm live-funds trading before starting." });
      return;
    }
    setBaselinePnl(settledPnl);
    setSessionPnl(0);
    setSessionTrades(0);
    runningRef.current = true;
    setRunning(true);
    void runLoop();
  };

  const stop = () => {
    runningRef.current = false;
    setRunning(false);
  };

  const toggleXTrader = (enabled: boolean) => {
    setXTraderEnabled(enabled);
    if (!enabled) stop();
  };

  const reset = () => {
    setSessionPnl(0);
    setSessionTrades(0);
    setBaselinePnl(settledPnl);
  };

  const selectMarket = async (next: string) => {
    setSymbol(next);
    try {
      await symbolMutation.mutateAsync({ data: { symbol: next } });
      await queryClient.invalidateQueries();
    } catch (error) {
      setConnectionMessage({ kind: "error", text: errorMessage(error) });
    }
  };

  const fireBulk = async (contractType: "DIGITOVER" | "DIGITUNDER") => {
    if (!isConnected) return;
    if (isReal && !liveConfirmed) {
      setConnectionMessage({ kind: "error", text: "Confirm live-funds trading before sending a bulk." });
      return;
    }
    if (currentAccount && stake * bulk > currentAccount.balance) {
      setConnectionMessage({ kind: "error", text: "Lower the stake or reduce the number of trades so the batch fits the balance." });
      return;
    }
    try {
      await bulkBuyMutation.mutateAsync({
        data: {
          amount: stake,
          duration,
          duration_unit: "t",
          contract_type: contractType,
          barrier,
          symbol,
          count: bulk,
          confirm_live_trade: true,
        },
      });
      setDirection(contractType);
      setSessionTrades((value) => value + bulk);
      await queryClient.invalidateQueries();
      setConnectionMessage({ kind: "info", text: `${bulk} ${contractType === "DIGITOVER" ? "Over" : "Under"} ${barrier} request${bulk === 1 ? "" : "s"} sent.` });
    } catch (error) {
      setConnectionMessage({ kind: "error", text: errorMessage(error) });
    }
  };

  const clearHistory = async () => {
    if (!clearHistoryArmed) {
      setClearHistoryArmed(true);
      window.setTimeout(() => setClearHistoryArmed(false), 2_500);
      return;
    }
    setClearHistoryArmed(false);
    setHistoryFading(true);
    await sleep(260);
    try {
      await clearMutation.mutateAsync();
      await queryClient.invalidateQueries();
    } finally {
      setHistoryFading(false);
    }
  };

  const accountOptions = accounts.data ?? [];
  const marketName = markets.find(([id]) => id === symbol)?.[1] ?? symbol;
  const statusText = isConnected ? "CONNECTED" : connectedToken ? "CONNECTING" : "DISCONNECTED";
  const activityText = running ? "X TRADER RUNNING" : "X TRADER STOPPED";
  const canRun = isConnected && !running && (!isReal || (status.data?.live_trading_enabled && liveConfirmed));
  const canBulk = isConnected && !running && !bulkBuyMutation.isPending && (!isReal || (status.data?.live_trading_enabled && liveConfirmed))
    && Boolean(currentAccount) && stake * bulk <= (currentAccount?.balance ?? 0);

  return (
    <main className="xt-app">
      <header className="xt-header">
        <div className="xt-brand"><span>J</span><div><strong>JDY AI</strong><small>DERIV DIGIT TRADER</small></div></div>
        <div className={`xt-connection ${isConnected ? "online" : ""}`}><i />{statusText}</div>
      </header>

      <section className="xt-connect-card">
        <div className="xt-section-title"><Link2 size={17} /><div><b>Deriv API Connection</b><small>Enter a Personal Access Token with trade and read scopes.</small></div></div>
        {!connectedToken ? (
          <form onSubmit={connectPat} className="xt-pat-form">
            <input type="password" value={pat} onChange={(event) => setPat(event.target.value)} placeholder="Paste your Deriv PAT token" autoComplete="off" />
            <button disabled={!pat.trim() || tokenMutation.isPending}>{tokenMutation.isPending ? <Loader2 className="spin" size={16} /> : <Power size={16} />}Connect</button>
          </form>
        ) : (
          <div className="xt-connected-row">
            <span><i />Token encrypted and saved for this browser</span>
            <button onClick={() => void disconnect()} disabled={deleteTokenMutation.isPending}>Disconnect</button>
          </div>
        )}
        {connectionMessage && <p className={`xt-inline-message ${connectionMessage.kind}`}>{connectionMessage.text}</p>}
      </section>

      <section className="xt-account-grid">
        <div className="xt-balance-card">
          <small>ACTIVE BALANCE</small>
          <strong><span>{currentAccount?.currency ?? "USD"}</span>{(currentAccount?.balance ?? 0).toFixed(2)}</strong>
          <div>{currentAccount?.id ?? "No account connected"} <b className={isReal ? "real" : ""}>{currentAccount?.type ?? "—"}</b></div>
        </div>
        <label className="xt-select-card"><small>TRADING ACCOUNT</small><div><select value={currentAccount?.id ?? ""} onChange={(event) => accountMutation.mutate({ data: { account_id: event.target.value } }, { onSuccess: () => void queryClient.invalidateQueries() })} disabled={!accountOptions.length || running}>
          {!accountOptions.length && <option value="">Connect PAT first</option>}
          {accountOptions.map((account) => <option key={account.id} value={account.id}>{account.id} · {account.type.toUpperCase()} · {account.currency} {account.balance.toFixed(2)}</option>)}
        </select><ChevronDown size={15} /></div></label>
      </section>

      <section className="xt-feature-card">
        <div><Bot size={18} /><span><b>X Trader</b><small>Over / Under digit automation</small></span></div>
        <div className="xt-feature-actions">
          <button className="xt-guide-button" type="button" onClick={() => { setGuidePage(0); setGuideOpen(true); }}>
            <BookOpen size={14} />Guide
          </button>
          <label className="xt-switch">
            <input
              type="checkbox"
              checked={xTraderEnabled}
              onChange={(event) => toggleXTrader(event.target.checked)}
              aria-label="Toggle X Trader"
            />
            <span />
          </label>
        </div>
      </section>

      {xTraderEnabled && (
        <>
          <section className="xt-cockpit">
            <div className="xt-cockpit-head">
              <div><Activity size={18} /><span><b>X Trader Cockpit</b><small>Live tick analysis · historical streaks do not guarantee outcomes</small></span></div>
              <em className={running ? "running" : ""}><i />{activityText}</em>
            </div>

            <div className="xt-market-row">
              <label><small>MARKET</small><select value={symbol} onChange={(event) => void selectMarket(event.target.value)} disabled={!isConnected || running}>{markets.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
              <div className="xt-last-tick"><small>LAST TICK · {marketName}</small><strong>{status.data?.last_tick?.quote?.toFixed(3) ?? "—"}<span>{lastDigit ?? "—"}</span></strong></div>
            </div>

            <div className="xt-direction">
              <button className={direction === "DIGITOVER" ? "active over" : ""} onClick={() => setDirection("DIGITOVER")} disabled={running}><b>OVER</b><small>Last digit above barrier</small></button>
              <button className={direction === "DIGITUNDER" ? "active under" : ""} onClick={() => setDirection("DIGITUNDER")} disabled={running}><b>UNDER</b><small>Last digit below barrier</small></button>
            </div>

            <div className="xt-digits">
              <span
                className="xt-market-hover"
                style={{
                  left: `calc(${((indicatorDigit - 1) * 100) / 9}% + ${((indicatorDigit - 1) * 2) / 3}px)`,
                  opacity: lastDigit != null && lastDigit >= 1 && lastDigit <= 9 ? 1 : 0,
                }}
                aria-hidden="true"
              />
              {Array.from({ length: 9 }, (_, index) => streaks.find((item) => item.digit === index + 1) ?? { digit: index + 1, over: 0, under: 0 }).map((item) => <button key={item.digit} className={barrier === item.digit ? "active" : ""} aria-label={lastDigit === item.digit ? `Current market last digit ${item.digit}` : `Digit ${item.digit}`} onClick={() => setBarrier(item.digit)} disabled={running}><b>{item.digit}</b><small><span>O {item.over}</span><span>U {item.under}</span></small></button>)}
            </div>
            <p className="xt-streak-note">Current consecutive streak at digit {barrier}: <b>Over {selectedStreak?.over ?? 0}</b> · <b>Under {selectedStreak?.under ?? 0}</b>. Based on the most recent {status.data?.digit_sample_count ?? 0} observed ticks.</p>

            <div className="xt-form-grid">
              <label><small>DURATION</small><div className="xt-ticks">{[1,2,3,4,5].map((tick) => <button key={tick} className={duration === tick ? "active" : ""} onClick={() => setDuration(tick)} disabled={running}>{tick}</button>)}</div></label>
              <label><small>STAKE</small><div className="xt-money"><span>{currentAccount?.currency ?? "USD"}</span><input type="number" min=".35" step=".01" value={stake} onChange={(event) => setStake(Number(event.target.value))} disabled={running} /></div></label>
              <label><small>STRATEGY</small><select value={strategy} onChange={(event) => setStrategy(event.target.value as "flat" | "martingale")} disabled={running}><option value="flat">Flat stake</option><option value="martingale">Martingale after loss</option></select></label>
              <label><small>MARTINGALE MULTIPLIER</small><input type="number" min="1" max="10" step=".1" value={martingale} onChange={(event) => setMartingale(Number(event.target.value))} disabled={running || strategy === "flat"} /></label>
              <label><small>TAKE PROFIT</small><input type="number" min=".01" step=".01" value={takeProfit} onChange={(event) => setTakeProfit(Number(event.target.value))} disabled={running} /></label>
              <label><small>STOP LOSS</small><input type="number" min=".01" step=".01" value={stopLoss} onChange={(event) => setStopLoss(Number(event.target.value))} disabled={running} /></label>
              <label><small>TRADES PER BATCH</small><select value={bulk} onChange={(event) => setBulk(Number(event.target.value))} disabled={running}>{[1,2,3,4,5].map((count) => <option key={count} value={count}>{count} trade{count > 1 ? "s" : ""}</option>)}</select></label>
              <label className="xt-auto-row"><span><small>AUTO BEST DIGIT</small><b>Scan supported markets and rank signals</b></span><span className="xt-switch"><input type="checkbox" checked={autoSwitch} onChange={(event) => { setAutoSwitch(event.target.checked); if (event.target.checked) void chooseBestDigit(); }} disabled={running} /><span /></span></label>
            </div>

            {isReal && <label className="xt-live-warning"><ShieldAlert size={18} /><input type="checkbox" checked={liveConfirmed} onChange={(event) => setLiveConfirmed(event.target.checked)} /><span><b>Live funds confirmation</b>I understand X Trader will place real-money contracts.</span></label>}

            <div className="xt-session">
              <div><small>SESSION P/L</small><strong className={sessionPnl < 0 ? "loss" : ""}>{sessionPnl >= 0 ? "+" : ""}{sessionPnl.toFixed(2)}</strong></div>
              <div><small>TRADES SENT</small><strong>{sessionTrades}</strong></div>
              <div><small>CONFIGURATION</small><strong>{direction === "DIGITOVER" ? "OVER" : "UNDER"} {barrier} · {duration}T</strong></div>
            </div>

            <div className="xt-controls">
              {!running ? <button className="run" onClick={start} disabled={!canRun}><Play size={18} fill="currentColor" />RUN X TRADER</button> : <button className="stop" onClick={stop}><Pause size={18} fill="currentColor" />STOP</button>}
              <button className="reset" onClick={reset}><RotateCcw size={18} />RESET</button>
            </div>
            <div className="xt-bulk-controls">
              <button className="xt-bulk-over" onClick={() => void fireBulk("DIGITOVER")} disabled={!canBulk}>
                <span><Play size={14} fill="currentColor" />OVER {barrier}</span>
                <small>Send {bulk} together</small>
              </button>
              <button className="xt-bulk-under" onClick={() => void fireBulk("DIGITUNDER")} disabled={!canBulk}>
                <span><Play size={14} fill="currentColor" />UNDER {barrier}</span>
                <small>Send {bulk} together</small>
              </button>
            </div>
            <p className="xt-batch-note"><Zap size={13} />Immediate bulk buttons send the selected number of trades together when the total stake fits the balance.</p>
          </section>

          <section className="xt-history" title="Recent dashboard trade history">
            <div className="xt-history-head"><div><CircleDollarSign size={18} /><span><b>Recent Trades</b><small>Dashboard rows only · Deriv records are not deleted</small></span></div><button onClick={() => void clearHistory()} disabled={clearMutation.isPending || historyFading}><Trash2 size={15} />{clearHistoryArmed ? "Tap again" : "Clear"}</button></div>
            {!rows.length ? <div className="xt-empty"><RefreshCw size={20} />Trades will appear here after X Trader starts.</div> : rows.slice(0, 12).map((trade) => <div className={`xt-trade ${historyFading ? "fading" : ""}`} key={trade.contract_id}><span><b>{trade.contract_type.replace("DIGIT", "")}</b><small>{trade.symbol} · {trade.account_type}</small></span><span><small>BUY</small>{trade.buy_price.toFixed(2)}</span><span><small>STATUS</small>{trade.status}</span><strong className={trade.profit < 0 ? "loss" : ""}>{trade.profit >= 0 ? "+" : ""}{trade.profit.toFixed(2)}</strong></div>)}
          </section>
        </>
      )}

      {guideOpen && (
        <div className="xt-guide-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setGuideOpen(false); }}>
          <section className="xt-guide" role="dialog" aria-modal="true" aria-labelledby="xt-guide-title">
            <header className="xt-guide-header">
              <div><BookOpen size={18} /><span><b> X Trader Guide</b><small>Page {guidePage + 1} of {guidePages.length}</small></span></div>
              <button type="button" aria-label="Close guide" onClick={() => setGuideOpen(false)}><X size={17} /></button>
            </header>
            <div className="xt-guide-progress"><span style={{ width: `${((guidePage + 1) / guidePages.length) * 100}%` }} /></div>
            <article className="xt-guide-page">
              <small className="xt-guide-kicker">X TRADER FIELD GUIDE</small>
              <h2 id="xt-guide-title">{guidePages[guidePage].title}</h2>
              <p>{guidePages[guidePage].body}</p>
              <ul>{guidePages[guidePage].points.map((point) => <li key={point}>{point}</li>)}</ul>
            </article>
            <footer className="xt-guide-footer">
              <button type="button" className="xt-guide-nav" onClick={() => setGuidePage((page) => Math.max(0, page - 1))} disabled={guidePage === 0}><ChevronLeft size={15} />Back</button>
              <span>{guidePage + 1} / {guidePages.length}</span>
              {guidePage === guidePages.length - 1 ? (
                <button type="button" className="xt-guide-start" onClick={() => { setGuideOpen(false); setXTraderEnabled(true); }}>Let's start trading</button>
              ) : (
                <button type="button" className="xt-guide-nav next" onClick={() => setGuidePage((page) => Math.min(guidePages.length - 1, page + 1))}>Next<ChevronRight size={15} /></button>
              )}
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}