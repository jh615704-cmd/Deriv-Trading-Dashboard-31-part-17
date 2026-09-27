import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Download, Info, Play, RefreshCw, RotateCcw, ShieldCheck, Square, TrendingUp, Trash2 } from "lucide-react";
import "./money-bank-panel.css";

export type MoneyBankStrategy = "budget" | "manual";

export type MoneyBankLadderLevel = {
  name: string;
  stake: number;
  cumulative: number;
  profit: number;
};

export type MoneyBankStartConfig = {
  symbol: string;
  growthRate: number;
  takeProfitTicks: number;
  strategy: MoneyBankStrategy;
  ladder: MoneyBankLadderLevel[];
  autoSwitch: boolean;
  reinvestProfit: boolean;
  reinvestPercent: number;
  profitTarget: number | null;
  lossLimit: number | null;
};

export type MoneyBankMarketSignal = {
  symbol: string;
  sample_count: number;
  quote?: number | null;
  rise_percentage?: number;
  fall_percentage?: number;
};

export type MoneyBankTrade = {
  contract_id: string;
  contract_type: string;
  symbol: string;
  account_type: string;
  buy_price: number;
  current_value: number;
  profit: number;
  status: string;
  sell_time?: number | null;
};

export type MoneyBankScannerRecommendation = {
  symbol: string;
  growthRate: number;
  takeProfitTicks: number;
  score: number;
  sampleCount: number;
  observedBalance: number;
  estimatedLosses: number;
};

export type MoneyBankJdyDecision = MoneyBankScannerRecommendation & {
  safe: boolean;
  stake: number;
  predictedWinRate: number;
  estimatedLossStreak: number;
  suggestedSymbol: string | null;
  suggestedGrowthRate: number | null;
  suggestedTakeProfitTicks: number | null;
  suggestedStake: number | null;
};

type MoneyBankPanelProps = {
  isConnected: boolean;
  running: boolean;
  isReal: boolean;
  liveConfirmed: boolean;
  onLiveConfirm: (confirmed: boolean) => void;
  symbol: string;
  markets: readonly (readonly [string, string])[];
  onSymbolChange: (symbol: string) => void;
  accountBalance?: number;
  currency?: string;
  quote?: number | null;
  growthRate: number;
  onGrowthRateChange: (value: number) => void;
  takeProfitTicks: number;
  onTakeProfitTicksChange: (value: number) => void;
  strategy: MoneyBankStrategy;
  onStrategyChange: (strategy: MoneyBankStrategy) => void;
  budget: number;
  onBudgetChange: (value: number) => void;
  manualBase: number;
  onManualBaseChange: (value: number) => void;
  autoSwitch: boolean;
  onAutoSwitchChange: (value: boolean) => void;
  reinvestProfit: boolean;
  onReinvestProfitChange: (value: boolean) => void;
  reinvestPercent: number;
  onReinvestPercentChange: (value: number) => void;
  profitTarget: number | null;
  onProfitTargetChange: (value: number | null) => void;
  lossLimit: number | null;
  onLossLimitChange: (value: number | null) => void;
  scannerEnabled: boolean;
  scannerCountdown: number;
  scannerBusy: boolean;
  scannerRecommendation: MoneyBankScannerRecommendation | null;
  onScannerChange: (value: boolean) => void;
  onAdaptScannerSettings: () => void;
  jdyEnabled: boolean;
  onJdyChange: (value: boolean) => void;
  jdyState: "idle" | "scanning" | "safe" | "not-good";
  jdyDecision: MoneyBankJdyDecision | null;
  onApplyJdyRecommendation: () => void;
  closing?: boolean;
  marketSignals: readonly MoneyBankMarketSignal[];
  recentTrades: readonly MoneyBankTrade[];
  sessionWins: number;
  currentStreak: number;
  peakStreak: number;
  nextStake: number;
  lastSettledProfit: number | null;
  onSafestPairChange?: (symbol: string) => void;
  onStart: (config: MoneyBankStartConfig) => void;
  onStop: () => void;
  sessionPnl: number;
  tradeCount: number;
};

const LEVEL_NAMES = ["BASE", "L1", "L2", "L3", "L4", "L5", "L6"];
const GROWTH_RATES = [1, 2, 3, 4, 5];
export const MONEY_BANK_AUTO_SYMBOLS = ["1HZ10V", "1HZ15V", "1HZ25V", "1HZ30V", "1HZ50V", "1HZ75V", "1HZ90V", "1HZ100V"] as const;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const ACCUMULATOR_MIN_STAKE = 1;
const roundCents = (value: number) => Number((Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2));

export function calculateRecoveryLadder(input: {
  strategy: MoneyBankStrategy;
  budget: number;
  manualBase: number;
  growthRate: number;
  takeProfitTicks: number;
}): MoneyBankLadderLevel[] {
  const growth = clamp(input.growthRate, 1, 5) / 100;
  const ticks = clamp(input.takeProfitTicks, 5, 50);
  const payout = Math.max(0.08, Math.pow(1 + growth, ticks) - 1);
  const ratio = clamp(1.12 + (0.08 / (payout + 0.16)), 1.14, 1.42);
  const factors = LEVEL_NAMES.map((_, index) => Math.pow(ratio, index));
  const requestedBase = input.strategy === "budget"
    ? Math.max(ACCUMULATOR_MIN_STAKE, input.budget) / factors.reduce((sum, factor) => sum + factor, 0)
    : Math.max(ACCUMULATOR_MIN_STAKE, input.manualBase);
  const base = roundCents(Math.max(ACCUMULATOR_MIN_STAKE, requestedBase));

  return LEVEL_NAMES.map((name, index) => {
    const stake = roundCents(Math.max(ACCUMULATOR_MIN_STAKE, base * factors[index]));
    const cumulative = LEVEL_NAMES.slice(0, index + 1)
      .reduce((sum, _, levelIndex) => roundCents(sum + roundCents(Math.max(ACCUMULATOR_MIN_STAKE, base * factors[levelIndex]))), 0);
    return {
      name,
      stake,
      cumulative,
      profit: roundCents(stake * payout),
    };
  });
}

const money = (value: number, currency = "USD") =>
  `${currency === "USD" ? "$" : `${currency} `}${value.toFixed(2)}`;

function tradeOutcome(trade: Pick<MoneyBankTrade, "status" | "profit">) {
  const status = trade.status.toLowerCase();
  if (status === "open") {
    if (trade.profit > 0) return { label: "WINNING", tone: "positive" };
    if (trade.profit < 0) return { label: "LOSING", tone: "negative" };
    return { label: "OPEN", tone: "neutral" };
  }
  if (status.includes("won") || trade.profit > 0) return { label: "WON", tone: "positive" };
  if (status.includes("lost") || trade.profit < 0) return { label: "LOST", tone: "negative" };
  return { label: "CLOSED", tone: "neutral" };
}

export function MoneyBankPanel({
  isConnected,
  running,
  isReal,
  liveConfirmed,
  onLiveConfirm,
  symbol,
  markets,
  onSymbolChange,
  accountBalance,
  currency = "USD",
  quote,
  growthRate,
  onGrowthRateChange,
  takeProfitTicks,
  onTakeProfitTicksChange,
  strategy,
  onStrategyChange,
  budget,
  onBudgetChange,
  manualBase,
  onManualBaseChange,
  autoSwitch,
  onAutoSwitchChange,
  reinvestProfit,
  onReinvestProfitChange,
  reinvestPercent,
  onReinvestPercentChange,
  profitTarget,
  onProfitTargetChange,
  lossLimit,
  onLossLimitChange,
  scannerEnabled,
  scannerCountdown,
  scannerBusy,
  scannerRecommendation,
  onScannerChange,
  onAdaptScannerSettings,
  jdyEnabled,
  onJdyChange,
  jdyState,
  jdyDecision,
  onApplyJdyRecommendation,
  closing = false,
  marketSignals,
  recentTrades,
  sessionWins,
  currentStreak,
  peakStreak,
  nextStake,
  lastSettledProfit,
  onSafestPairChange,
  onStart,
  onStop,
  sessionPnl,
  tradeCount,
}: MoneyBankPanelProps) {
  const ladder = calculateRecoveryLadder({
    strategy,
    budget,
    manualBase,
    growthRate,
    takeProfitTicks,
  });
  const estimatedReturn = (Math.pow(1 + growthRate / 100, takeProfitTicks) - 1) * 100;
  const recoveryStart = Math.max(5, Math.round(takeProfitTicks * 0.16));
  const selectedMarket = markets.find(([market]) => market === symbol)?.[1] ?? symbol;
  const totalCycleRisk = ladder.at(-1)?.cumulative ?? 0;
  const selectedStake = ladder[0]?.stake ?? 0;
  const projectedProfit = ladder[0]?.profit ?? 0;
  const profitBasis = lastSettledProfit != null && lastSettledProfit > 0 ? lastSettledProfit : projectedProfit;
  const reinvestedProfit = roundCents(profitBasis * reinvestPercent / 100);
  const retainedProfit = roundCents(Math.max(0, profitBasis - reinvestedProfit));
  const [snapshotVersion, setSnapshotVersion] = useState(0);
  const [capturedAt, setCapturedAt] = useState(() => new Date());
  const [historyHidden, setHistoryHidden] = useState<Set<string>>(new Set());
  const [historyClearArmed, setHistoryClearArmed] = useState(false);
  const [historyFading, setHistoryFading] = useState(false);
  const snapshot = useMemo(() => MONEY_BANK_AUTO_SYMBOLS.map((marketSymbol) => {
    const signal = marketSignals.find((entry) => entry.symbol === marketSymbol);
     const balance = signal ? Math.max(signal.rise_percentage ?? 50, signal.fall_percentage ?? 50) : 0;
     const estimate = signal
       ? clamp(balance - (takeProfitTicks * .8) - (growthRate * 1.5), 2, 98)
       : 0;
    const total = signal?.sample_count ? 100 : 0;
    const wins = total ? Math.round(total * estimate / 100) : 0;
    return { symbol: marketSymbol, wins, total, winRate: total ? (wins / total) * 100 : 0 };
  }), [growthRate, marketSignals, snapshotVersion, takeProfitTicks]);
  const safestPair = snapshot.reduce((best, entry) => entry.winRate > best.winRate ? entry : best, snapshot[0]);
  const visibleTrades = recentTrades.filter((trade) => !historyHidden.has(trade.contract_id));
  const historyPnl = visibleTrades.reduce((sum, trade) => sum + (trade.status === "open" ? 0 : trade.profit), 0);

  useEffect(() => {
    if (safestPair?.symbol) onSafestPairChange?.(safestPair.symbol);
  }, [onSafestPairChange, safestPair?.symbol, snapshotVersion]);

  const submitStart = () => {
    if (running) {
      onStop();
      return;
    }
    onStart({
      symbol,
      growthRate,
      takeProfitTicks,
      strategy,
      ladder,
      autoSwitch,
      reinvestProfit,
      reinvestPercent,
      profitTarget,
      lossLimit,
    });
  };

  const downloadHistory = () => {
    const header = ["contract_id", "symbol", "status", "buy_price", "profit", "account_type"];
    const rows = visibleTrades.map((trade) => [trade.contract_id, trade.symbol, trade.status, trade.buy_price.toFixed(2), trade.profit.toFixed(2), trade.account_type]);
    const csv = [header, ...rows].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `money-bank-trades-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const clearHistory = () => {
    if (!historyClearArmed) {
      setHistoryClearArmed(true);
      window.setTimeout(() => setHistoryClearArmed(false), 3000);
      return;
    }
    setHistoryFading(true);
    window.setTimeout(() => {
      setHistoryHidden(new Set(recentTrades.map((trade) => trade.contract_id)));
      setHistoryFading(false);
      setHistoryClearArmed(false);
    }, 350);
  };

  return (
    <section className="money-bank-panel" aria-label="Money Bank Accumulator">
      <header className="money-bank-header">
        <div className="money-bank-brand">
          <div className="money-bank-mark"><TrendingUp size={18} /></div>
          <div>
            <div className="money-bank-title-row">
              <h2>Money Bank</h2>
              <span>Accumulator</span>
            </div>
            <p>Structured growth with controlled recovery</p>
          </div>
        </div>
        <div className={`money-bank-live-state ${running ? "running" : ""}`}>
          <i />
          {running ? "BOT ACTIVE" : "READY"}
        </div>
      </header>

      <div className="money-bank-body">
        <div className="money-bank-main">
          <section className="money-bank-card money-bank-market-card">
            <div className="money-bank-card-head">
              <div>
                <small>MARKET</small>
                <h3>Choose a Volatility pair</h3>
              </div>
              <span className="money-bank-filter-badge">VOLATILITY ONLY</span>
            </div>
            <label className="money-bank-select-wrap">
              <span>{selectedMarket}</span>
              <ChevronDown size={16} />
              <select
                value={symbol}
                onChange={(event) => onSymbolChange(event.target.value)}
                disabled={running || !isConnected}
                aria-label="Select a Volatility market"
              >
                {markets.map(([market, label]) => (
                  <option key={market} value={market}>{label}</option>
                ))}
              </select>
            </label>
            <div className="money-bank-market-meta">
              <span><i /> {isConnected ? "Live market available" : "Connect Deriv to stream quotes"}</span>
              {quote != null && <strong>{quote.toFixed(2)}</strong>}
            </div>
          </section>

          <section className="money-bank-card">
            <div className="money-bank-card-head">
              <div>
                <small>ACCUMULATOR SETTINGS</small>
                <h3>Growth rate</h3>
              </div>
              <strong className="money-bank-value-chip">{growthRate}%</strong>
            </div>
            <div className="money-bank-rate-grid">
              {GROWTH_RATES.map((rate) => (
                <button
                  key={rate}
                  type="button"
                  className={growthRate === rate ? "active" : ""}
                  onClick={() => onGrowthRateChange(rate)}
                  disabled={running}
                >
                  {rate}%
                </button>
              ))}
            </div>
             <p className="money-bank-helper"><Info size={14} /> Higher growth increases theoretical payout but tightens risk. <b>4% is a common balance setting.</b></p>
          </section>

          <section className="money-bank-card money-bank-ticks-card">
            <div className="money-bank-card-head">
              <div>
                <small>TAKE PROFIT</small>
                <h3>Contract ticks</h3>
              </div>
              <div className="money-bank-ticks-box">{takeProfitTicks}</div>
            </div>
            <input
              className="money-bank-range"
              type="range"
               min="5"
              max="50"
              step="1"
              value={takeProfitTicks}
              onChange={(event) => onTakeProfitTicksChange(Number(event.target.value))}
              disabled={running}
              aria-label="Take Profit ticks"
            />
            <div className="money-bank-range-track-label">Take profit target updates the return and every recovery level.</div>
          </section>

          <section className="money-bank-card money-bank-strategy-card">
            <div className="money-bank-card-head">
              <div>
                <small>BASE STRATEGY</small>
                <h3>How should BASE be set?</h3>
              </div>
              <ShieldCheck size={18} />
            </div>
            <div className="money-bank-segmented">
              <button type="button" className={strategy === "budget" ? "active" : ""} onClick={() => onStrategyChange("budget")} disabled={running}>
                <b>Auto (Budget)</b><small>Keep the cycle inside budget</small>
              </button>
              <button type="button" className={strategy === "manual" ? "active" : ""} onClick={() => onStrategyChange("manual")} disabled={running}>
                <b>Manual base</b><small>Choose BASE yourself</small>
              </button>
            </div>
            <div className="money-bank-input-grid">
              <label>
                <span>{strategy === "budget" ? "Budget" : "Manual BASE"}</span>
                <div className="money-bank-input-wrap">
                  <b>$</b>
                  <input
                    type="number"
                     min={ACCUMULATOR_MIN_STAKE}
                    step="0.01"
                    value={strategy === "budget" ? budget : manualBase}
                     onChange={(event) => (strategy === "budget" ? onBudgetChange : onManualBaseChange)(Math.max(ACCUMULATOR_MIN_STAKE, Number(event.target.value) || ACCUMULATOR_MIN_STAKE))}
                    disabled={running}
                  />
                </div>
              </label>
              <div className="money-bank-calculated-base">
                <span>Calculated BASE</span>
                <strong>{money(selectedStake, currency)}</strong>
              </div>
            </div>
             <p className="money-bank-helper"><Info size={14} /> BASE is the first stake. Accumulator contracts require at least {money(ACCUMULATOR_MIN_STAKE, currency)}. A loss advances one level; a win recovers prior losses plus the target profit.</p>
          </section>
        </div>

        <aside className="money-bank-side">
          <section className="money-bank-return-card">
            <div className="money-bank-return-top">
              <span>ESTIMATED RETURN</span>
              <span className="money-bank-return-icon"><TrendingUp size={16} /></span>
            </div>
            <strong>+{estimatedReturn.toFixed(1)}%</strong>
            <p>Recovery {recoveryStart}–{takeProfitTicks} ticks @ {growthRate}%</p>
            <div className="money-bank-return-bar"><i style={{ width: `${clamp(estimatedReturn / 5, 8, 100)}%` }} /></div>
          </section>

          <section className="money-bank-card money-bank-ladder-card">
            <div className="money-bank-card-head">
              <div>
                <small>RECOVERY LADDER</small>
                <h3>BASE → L6</h3>
              </div>
              <span className="money-bank-risk-pill">{money(totalCycleRisk, currency)} cycle</span>
            </div>
            <div className="money-bank-ladder">
              {ladder.map((level, index) => (
                <div className={`money-bank-level ${index === 0 ? "base" : ""}`} key={level.name}>
                  <span><b>{level.name}</b>{index === 0 ? "First stake" : `After ${index} loss${index === 1 ? "" : "es"}`}</span>
                  <strong>{money(level.stake, currency)}</strong>
                  <small>win +{money(level.profit, currency)}</small>
                </div>
              ))}
            </div>
             <p className="money-bank-helper"><Info size={14} /> The ladder has seven bounded levels. A win resets to BASE unless Reinvest Profit is enabled.</p>
          </section>

          <section className="money-bank-card money-bank-risk-card">
            <div className="money-bank-card-head">
              <div>
                <small>RISK & SESSION</small>
                <h3>Protect the session</h3>
              </div>
              <span className="money-bank-account-balance">{accountBalance != null ? money(accountBalance, currency) : "—"}</span>
            </div>
             <div className="money-bank-risk-grid">
               <label><span>Profit Target ($)</span><div className="money-bank-input-wrap"><b>$</b><input type="number" min="0" step="1" placeholder="Optional" value={profitTarget ?? ""} onChange={(event) => onProfitTargetChange(event.target.value === "" ? null : Math.max(0, Number(event.target.value) || 0))} disabled={running} /></div></label>
               <label><span>Loss Limit ($)</span><div className="money-bank-input-wrap"><b>$</b><input type="number" min="0" step="1" placeholder="Optional" value={lossLimit ?? ""} onChange={(event) => onLossLimitChange(event.target.value === "" ? null : Math.max(0, Number(event.target.value) || 0))} disabled={running} /></div></label>
            </div>
            <div className="money-bank-toggle-list">
                <label>
                  <span><b>AI SCANNER</b><small>{scannerEnabled ? scannerBusy ? "Scanning supported markets and growth rates…" : scannerCountdown > 0 ? `Next scan in ${scannerCountdown}s` : "Refreshing every minute" : "Off"}</small></span>
                  <input type="checkbox" checked={scannerEnabled} onChange={(event) => onScannerChange(event.target.checked)} disabled={running || !isConnected} /><i />
                </label>
                {scannerEnabled && (
                  <div className="money-bank-scanner-result">
                    {scannerRecommendation ? (
                      <>
                        <span><small>BEST CURRENT SETUP</small><b>{scannerRecommendation.symbol} · {scannerRecommendation.growthRate}% · {scannerRecommendation.takeProfitTicks} ticks</b><em>{scannerRecommendation.observedBalance.toFixed(1)}% observed balance · {scannerRecommendation.sampleCount} ticks sampled</em></span>
                        <button type="button" onClick={onAdaptScannerSettings} disabled={running}>Adapt settings</button>
                      </>
                    ) : (
                      <span><small>SCANNER STATUS</small><b>{scannerBusy ? "Scanning all supported setups…" : "Collecting enough live samples…"}</b></span>
                    )}
                  </div>
                )}
                <label><span><b>JDY AI</b><small>Scan the next setup before entry and refresh after every settlement</small></span><input type="checkbox" checked={jdyEnabled} onChange={(event) => onJdyChange(event.target.checked)} disabled={running || !isConnected} /><i /></label>
                {jdyEnabled && jdyState !== "idle" && (
                  <div className={`money-bank-jdy-status ${jdyState}`}>
                    <div className="money-bank-jdy-state"><i />{jdyState === "scanning" ? "CALCULATING" : jdyState === "safe" ? "SAFE TO TRADE" : "NOT A GOOD TRADE"}</div>
                    <small>{jdyState === "scanning" ? "Predicting the selected trade and checking for a 3–4 loss streak…" : jdyState === "not-good" ? "No contract was opened. Change the suggested settings and select Start Accumulator to try again." : "The selected setup passed the loss-streak check and is ready for entry."}</small>
                    {jdyDecision && (
                      <>
                        <b>{jdyDecision.symbol} · {jdyDecision.growthRate}% · {jdyDecision.takeProfitTicks} ticks · stake {money(jdyDecision.stake, currency)} · predicted win rate: {jdyDecision.predictedWinRate.toFixed(1)}%</b>
                        <span className="money-bank-jdy-risk">Estimated loss streak: {jdyDecision.estimatedLossStreak} · sampled {jdyDecision.sampleCount} ticks</span>
                        {!jdyDecision.safe && (
                          <div className="money-bank-jdy-suggestions">
                            <small>TRY CHANGING</small>
                            <span>Market: <b>{jdyDecision.suggestedSymbol ?? "wait for more samples"}</b></span>
                            <span>Growth: <b>{jdyDecision.suggestedGrowthRate != null ? `${jdyDecision.suggestedGrowthRate}%` : "wait for more samples"}</b> · Ticks: <b>{jdyDecision.suggestedTakeProfitTicks ?? "wait"}</b> · Stake: <b>{jdyDecision.suggestedStake != null ? money(jdyDecision.suggestedStake, currency) : "lower amount"}</b></span>
                            {jdyDecision.suggestedSymbol && <button type="button" onClick={onApplyJdyRecommendation} disabled={running}>Use safer setup</button>}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
                <label><span><b>Reinvest profit</b><small>{reinvestProfit ? `${reinvestPercent}% of each win goes into the next BASE` : "Keep wins in the next BASE"}</small></span><input type="checkbox" checked={reinvestProfit} onChange={(event) => onReinvestProfitChange(event.target.checked)} disabled={running} /><i /></label>
                {reinvestProfit && (
                  <div className="money-bank-reinvest-details">
                    <label><span>Profit to reinvest</span><select value={reinvestPercent} onChange={(event) => onReinvestPercentChange(Number(event.target.value))} disabled={running}>{[10, 25, 45, 50, 65, 75, 85, 95, 100].map((percent) => <option key={percent} value={percent}>{percent}%</option>)}</select></label>
                    <div><span><small>REINVESTED</small><b>{money(reinvestedProfit, currency)}</b></span><span><small>LEFT BACK</small><b>{money(retainedProfit, currency)}</b></span></div>
                    <p>Based on {lastSettledProfit != null && lastSettledProfit > 0 ? "your last settled win" : "the projected BASE win"} of {money(profitBasis, currency)}.</p>
                  </div>
                )}
               <label><span><b>Auto-switch safest pair</b><small>Use the highest current snapshot win rate</small></span><input type="checkbox" checked={autoSwitch} onChange={(event) => onAutoSwitchChange(event.target.checked)} disabled={running} /><i /></label>
            </div>
          </section>

           <section className="money-bank-card money-bank-stats-card">
             <div className="money-bank-card-head">
               <div><small>ACCOUNT & SESSION</small><h3>Balance snapshot</h3></div>
               <span className="money-bank-account-balance">{accountBalance != null ? money(accountBalance, currency) : "—"}</span>
             </div>
             <div className="money-bank-stat-grid">
               <span><small>SESSION P/L</small><b className={sessionPnl < 0 ? "negative" : "positive"}>{sessionPnl >= 0 ? "+" : ""}{money(sessionPnl, currency)}</b></span>
               <span><small>WIN RATE</small><b>{tradeCount ? `${((sessionWins / tradeCount) * 100).toFixed(0)}%` : "0%"}</b></span>
               <span><small>COMPLETED</small><b>{tradeCount}</b></span>
               <span><small>STREAK</small><b>{currentStreak}</b></span>
               <span><small>PEAK STREAK</small><b>{peakStreak}</b></span>
               <span><small>NEXT STAKE</small><b>{money(nextStake, currency)}</b></span>
             </div>
           </section>
        </aside>
      </div>

       <section className="money-bank-card money-bank-snapshot-card">
         <div className="money-bank-card-head">
           <div><small>STATS SNAPSHOT · VIRTUAL SESSIONS</small><h3>Safest pair analysis</h3></div>
           <div className="money-bank-snapshot-actions"><span>Captured {capturedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span><button type="button" onClick={() => { setSnapshotVersion((version) => version + 1); setCapturedAt(new Date()); }} disabled={running}><RefreshCw size={13} />Refresh</button></div>
         </div>
         <p className="money-bank-helper"><Info size={14} /> Background analysis models 100 finished sessions from the live Volatility sample using {growthRate}% growth and {takeProfitTicks} ticks. It does not open contracts.</p>
         <div className="money-bank-snapshot-grid">
           {snapshot.map((entry, index) => {
             const label = markets.find(([market]) => market === entry.symbol)?.[1]?.replace("Volatility ", "V") ?? entry.symbol;
             return <div className={`money-bank-snapshot-row ${entry.symbol === safestPair?.symbol ? "best" : ""}`} key={entry.symbol}><b>#{index + 1}</b><span>{label}</span><strong>{entry.wins}/{entry.total || 100}</strong><em>{entry.total ? `${entry.winRate.toFixed(0)}% win rate` : "collecting sample"}</em></div>;
           })}
         </div>
         <p className="money-bank-safest-copy">Safest current pair: <b>{markets.find(([market]) => market === safestPair?.symbol)?.[1] ?? safestPair?.symbol ?? "Waiting for live samples"}</b></p>
       </section>

       <section className="money-bank-card money-bank-history-card">
         <div className="money-bank-card-head">
           <div><small>TRADE HISTORY</small><h3>Money Bank trades</h3></div>
           <div className="money-bank-history-actions"><button type="button" onClick={downloadHistory} disabled={!visibleTrades.length}><Download size={13} />Download</button><button type="button" onClick={clearHistory} disabled={!recentTrades.length || historyFading}><Trash2 size={13} />{historyClearArmed ? "Tap again to reset" : "Reset"}</button></div>
         </div>
         <div className={historyFading ? "money-bank-history-rows fading" : "money-bank-history-rows"}>
            {!visibleTrades.length ? <p className="money-bank-empty-history">Trades will appear here after the first Accumulator contract.</p> : visibleTrades.map((trade) => {
              const outcome = tradeOutcome(trade);
              return <div className={`money-bank-history-row ${trade.status === "open" ? "live" : ""}`} key={trade.contract_id}>
                <span><b>{trade.contract_type}</b><small>{trade.symbol} · {trade.account_type}</small></span>
                <span><small>STAKE</small>{money(trade.buy_price, currency)}</span>
                <span><small>VALUE NOW</small>{money(trade.current_value, currency)}</span>
                <span className={outcome.tone}><small>{trade.status === "open" ? "LIVE P/L" : "RESULT"}</small>{trade.profit >= 0 ? "+" : ""}{money(trade.profit, currency)}</span>
                <span className={`money-bank-history-outcome ${outcome.tone}`}><small>STATUS</small><b>{outcome.label}</b></span>
              </div>;
            })}
         </div>
         <p className="money-bank-history-total">Visible history P/L <b className={historyPnl < 0 ? "negative" : "positive"}>{historyPnl >= 0 ? "+" : ""}{money(historyPnl, currency)}</b></p>
       </section>

      <footer className="money-bank-footer">
        <div className="money-bank-safety-copy">
          <ShieldCheck size={17} />
           <span><b>Accumulator is bounded</b><small>It stops at L6, optional session limits, or Stop Accumulator.</small></span>
        </div>
        <div className="money-bank-session-stats">
          <span><small>SESSION P/L</small><b className={sessionPnl >= 0 ? "positive" : "negative"}>{sessionPnl >= 0 ? "+" : ""}{money(sessionPnl, currency)}</b></span>
          <span><small>TRADES</small><b>{tradeCount}</b></span>
        </div>
        {isReal && !liveConfirmed && (
          <label className="money-bank-live-confirm"><input type="checkbox" checked={liveConfirmed} onChange={(event) => onLiveConfirm(event.target.checked)} /><span>Confirm live funds</span></label>
        )}
        <button type="button" className={`money-bank-start ${running ? "stop" : ""}`} onClick={submitStart} disabled={!isConnected || (isReal && !liveConfirmed)}>
           {closing ? <><RefreshCw size={15} className="money-bank-spin" /> Closing contracts…</> : running ? <><Square size={15} /> Stop Accumulator</> : <><Play size={15} /> Start Accumulator</>}
        </button>
        <button type="button" className="money-bank-reset" onClick={() => { onGrowthRateChange(4); onTakeProfitTicksChange(5); onStrategyChange("budget"); }} disabled={running} title="Reset core settings">
          <RotateCcw size={15} />
        </button>
      </footer>
    </section>
  );
}