import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useBuyDerivContract,
  useClearDerivHistory,
  useDeleteDerivToken,
  useGetDerivAccounts,
  useGetDerivHistory,
  useGetDerivStatus,
  useGetDerivTokenStatus,
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
  Activity, Bot, ChevronDown, CircleDollarSign, Link2, Loader2,
  Pause, Play, Power, RefreshCw, RotateCcw, ShieldAlert, Trash2, Zap,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const markets = [
  ["R_10", "Volatility 10 Index"], ["R_25", "Volatility 25 Index"],
  ["R_50", "Volatility 50 Index"], ["R_75", "Volatility 75 Index"],
  ["R_100", "Volatility 100 Index"], ["1HZ10V", "Volatility 10 (1s)"],
  ["1HZ25V", "Volatility 25 (1s)"], ["1HZ50V", "Volatility 50 (1s)"],
  ["1HZ75V", "Volatility 75 (1s)"], ["1HZ100V", "Volatility 100 (1s)"],
  ["JD10", "Jump 10 Index"], ["JD25", "Jump 25 Index"], ["JD50", "Jump 50 Index"],
  ["JD75", "Jump 75 Index"], ["JD100", "Jump 100 Index"],
] as const;

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Request failed";

export default function XTraderPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const tokenStatus = useGetDerivTokenStatus({ query: { retry: false, queryKey: getGetDerivTokenStatusQueryKey() } });
  const connectedToken = Boolean(tokenStatus.data?.has_token);
  const accounts = useGetDerivAccounts({ query: { enabled: connectedToken, retry: false, refetchInterval: 10_000, queryKey: getGetDerivAccountsQueryKey() } });
  const status = useGetDerivStatus({ query: { enabled: connectedToken, retry: false, refetchInterval: 800, queryKey: getGetDerivStatusQueryKey() } });
  const history = useGetDerivHistory({ query: { enabled: connectedToken, retry: false, refetchInterval: 1_500, queryKey: getGetDerivHistoryQueryKey() } });
  const tokenMutation = useTestDerivToken();
  const connectionMutation = useTestDerivConnection();
  const deleteTokenMutation = useDeleteDerivToken();
  const accountMutation = useSelectDerivAccount();
  const symbolMutation = useSelectDerivSymbol();
  const buyMutation = useBuyDerivContract();
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
  const [running, setRunning] = useState(false);
  const [liveConfirmed, setLiveConfirmed] = useState(false);
  const [sessionPnl, setSessionPnl] = useState(0);
  const [sessionTrades, setSessionTrades] = useState(0);
  const [baselinePnl, setBaselinePnl] = useState(0);
  const runningRef = useRef(false);
  const configRef = useRef({ direction, barrier, duration, stake, strategy, martingale, bulk, symbol, liveConfirmed });

  const currentAccount = status.data?.account;
  const isReal = currentAccount?.type === "real";
  const isConnected = Boolean(status.data?.connected && status.data?.authorized);
  const rows = history.data ?? [];
  const settledPnl = rows.reduce((sum, trade) => sum + (trade.status === "open" ? 0 : trade.profit), 0);
  const streaks = status.data?.digit_streaks ?? [];
  const selectedStreak = streaks.find((item) => item.digit === barrier);
  const lastDigit = status.data?.last_digit;

  useEffect(() => {
    configRef.current = { direction, barrier, duration, stake, strategy, martingale, bulk, symbol, liveConfirmed };
  }, [direction, barrier, duration, stake, strategy, martingale, bulk, symbol, liveConfirmed]);

  useEffect(() => {
    if (!running) return;
    const pnl = settledPnl - baselinePnl;
    setSessionPnl(pnl);
    if (pnl >= takeProfit || pnl <= -stopLoss) {
      runningRef.current = false;
      setRunning(false);
      toast({
        title: pnl >= takeProfit ? "Take profit reached" : "Stop loss reached",
        description: `X Trader stopped at ${pnl.toFixed(2)} ${currentAccount?.currency ?? "USD"}.`,
      });
    }
  }, [settledPnl, baselinePnl, running, takeProfit, stopLoss, currentAccount?.currency, toast]);

  useEffect(() => () => { runningRef.current = false; }, []);

  const connectPat = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pat.trim()) return;
    try {
      await tokenMutation.mutateAsync({ data: { token: pat.trim() } });
      setPat("");
      await queryClient.invalidateQueries();
      await connectionMutation.mutateAsync();
      await queryClient.invalidateQueries();
      toast({ title: "Deriv connected", description: "Your PAT is encrypted and linked to this browser." });
    } catch (error) {
      toast({ variant: "destructive", title: "Connection failed", description: errorMessage(error) });
    }
  };

  const disconnect = async () => {
    runningRef.current = false;
    setRunning(false);
    await deleteTokenMutation.mutateAsync();
    queryClient.clear();
    void tokenStatus.refetch();
  };

  const chooseBestDigit = () => {
    if (!streaks.length) return;
    const candidates = streaks.flatMap((item) => [
      { direction: "DIGITOVER" as const, digit: item.digit, streak: item.over },
      { direction: "DIGITUNDER" as const, digit: item.digit, streak: item.under },
    ]);
    const best = candidates.sort((a, b) => b.streak - a.streak)[0];
    if (best) {
      setDirection(best.direction);
      setBarrier(best.digit);
      configRef.current = { ...configRef.current, direction: best.direction, barrier: best.digit };
    }
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
    for (let index = 0; index < config.bulk && runningRef.current; index += 1) {
      await buyMutation.mutateAsync({
        data: {
          amount,
          duration: config.duration,
          duration_unit: "t",
          contract_type: config.direction,
          barrier: config.barrier,
          symbol: config.symbol,
          confirm_live_trade: true,
        },
      });
      setSessionTrades((value) => value + 1);
      await queryClient.invalidateQueries();
      if (index < config.bulk - 1) await sleep(1_050);
    }
  };

  const runLoop = async () => {
    while (runningRef.current) {
      try {
        if (autoSwitch) chooseBestDigit();
        await executeBatch();
        // Give the contract time to settle before the next loop reads the
        // result. A single loss then affects exactly the following trade.
        if (runningRef.current) await sleep(Math.max(1_300, configRef.current.duration * 1_100));
      } catch (error) {
        runningRef.current = false;
        setRunning(false);
        toast({ variant: "destructive", title: "X Trader stopped", description: errorMessage(error) });
      }
    }
  };

  const start = () => {
    if (!isConnected) return;
    if (isReal && !liveConfirmed) {
      toast({ variant: "destructive", title: "Live confirmation required", description: "Confirm live-funds trading before starting." });
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

  const reset = () => {
    stop();
    setSessionPnl(0);
    setSessionTrades(0);
    setStake(1);
    setBarrier(5);
    setDuration(1);
  };

  const selectMarket = async (next: string) => {
    setSymbol(next);
    try {
      await symbolMutation.mutateAsync({ data: { symbol: next } });
      await queryClient.invalidateQueries();
    } catch (error) {
      toast({ variant: "destructive", title: "Market unavailable", description: errorMessage(error) });
    }
  };

  const clearHistory = async () => {
    await clearMutation.mutateAsync();
    await queryClient.invalidateQueries();
  };

  const accountOptions = accounts.data ?? [];
  const marketName = markets.find(([id]) => id === symbol)?.[1] ?? symbol;
  const statusText = isConnected ? "CONNECTED" : connectedToken ? "CONNECTING" : "DISCONNECTED";
  const activityText = running ? "X TRADER RUNNING" : "X TRADER STOPPED";
  const canRun = isConnected && !running && (!isReal || (status.data?.live_trading_enabled && liveConfirmed));

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
        <label className="xt-switch"><input type="checkbox" checked={connectedToken} readOnly /><span /></label>
      </section>

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
          {Array.from({ length: 9 }, (_, index) => streaks.find((item) => item.digit === index + 1) ?? { digit: index + 1, over: 0, under: 0 }).map((item) => <button key={item.digit} className={`${barrier === item.digit ? "active " : ""}${lastDigit === item.digit ? "market-digit" : ""}`} aria-label={lastDigit === item.digit ? `Current market last digit ${item.digit}` : `Digit ${item.digit}`} onClick={() => setBarrier(item.digit)} disabled={running}><b>{item.digit}</b><small><span>O {item.over}</span><span>U {item.under}</span></small></button>)}
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
          <label className="xt-auto-row"><span><small>AUTO-SELECT DIGIT</small><b>Use the longest current streak</b></span><span className="xt-switch"><input type="checkbox" checked={autoSwitch} onChange={(event) => setAutoSwitch(event.target.checked)} disabled={running} /><span /></span></label>
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
        {bulk > 1 && <p className="xt-batch-note"><Zap size={13} />Batch trades are triggered together but sent 1.05 seconds apart to preserve the server-side trade cooldown.</p>}
      </section>

      <section className="xt-history" onDoubleClick={() => void clearHistory()} title="Double-click to clear the local dashboard history">
        <div className="xt-history-head"><div><CircleDollarSign size={18} /><span><b>Recent Trades</b><small>Double-click this panel to clear dashboard rows</small></span></div><button onClick={() => void clearHistory()} disabled={clearMutation.isPending}><Trash2 size={15} />Clear</button></div>
        {!rows.length ? <div className="xt-empty"><RefreshCw size={20} />Trades will appear here after X Trader starts.</div> : rows.slice(0, 12).map((trade) => <div className="xt-trade" key={trade.contract_id}><span><b>{trade.contract_type.replace("DIGIT", "")}</b><small>{trade.symbol} · {trade.account_type}</small></span><span><small>BUY</small>{trade.buy_price.toFixed(2)}</span><span><small>STATUS</small>{trade.status}</span><strong className={trade.profit < 0 ? "loss" : ""}>{trade.profit >= 0 ? "+" : ""}{trade.profit.toFixed(2)}</strong></div>)}
      </section>
    </main>
  );
}