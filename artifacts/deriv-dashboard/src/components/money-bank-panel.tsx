import { useMemo, useState } from "react";
import { ChevronDown, Download, Info, Play, RefreshCw, RotateCcw, ShieldCheck, Square, TrendingUp } from "lucide-react";
import { estimateAccumulatorReturnRate } from "../lib/money-bank-math";
import DerivHistory, { type DerivHistoryRow } from "./deriv-history";
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

export type MoneyBankTrade = DerivHistoryRow & {
  account_type: string;
  current_value: number;
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
  closing?: boolean;
  marketSignals: readonly MoneyBankMarketSignal[];
  recentTrades: readonly MoneyBankTrade[];
  lastSettledProfit: number | null;
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
  const payout = estimateAccumulatorReturnRate(input.growthRate, input.takeProfitTicks);
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
  closing = false,
  marketSignals,
  recentTrades,
  lastSettledProfit,
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
  const estimatedReturn = estimateAccumulatorReturnRate(growthRate, takeProfitTicks) * 100;
  const recoveryStart = Math.max(5, Math.round(takeProfitTicks * 0.16));
  const selectedMarket = markets.find(([market]) => market === symbol)?.[1] ?? symbol;
  const totalCycleRisk = ladder.at(-1)?.cumulative ?? 0;
  const selectedStake = ladder[0]?.stake ?? 0;
  const projectedProfit = ladder[0]?.profit ?? 0;
  const profitBasis = lastSettledProfit != null && lastSettledProfit > 0 ? lastSettledProfit : projectedProfit;
  const reinvestedProfit = roundCents(profitBasis * reinvestPercent / 100);
  const retainedProfit = roundCents(Math.max(0, profitBasis - reinvestedProfit));
  const [capturedAt, setCapturedAt] = useState(() => new Date());
  const [historyHidden, setHistoryHidden] = useState<Set<string>>(new Set());
  const [historyClearArmed, setHistoryClearArmed] = useState(false);
  const [historyFading, setHistoryFading] = useState(false);
  const snapshot = useMemo(() => MONEY_BANK_AUTO_SYMBOLS.map((marketSymbol) => {
    const signal = marketSignals.find((entry) => entry.symbol === marketSymbol);
    return {
      symbol: marketSymbol,
      sampleCount: signal?.sample_count ?? 0,
      risePercentage: signal?.rise_percentage ?? null,
      fallPercentage: signal?.fall_percentage ?? null,
      quote: signal?.quote ?? null,
    };
  }), [marketSignals]);
  const visibleTrades = recentTrades.filter((trade) => !historyHidden.has(trade.contract_id));

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
      autoSwitch: false,
      reinvestProfit,
      reinvestPercent,
      profitTarget,
      lossLimit,
    });
  };

  const downloadHistory = () => {
    const header = ["contract_id", "contract_type", "symbol", "account_type", "barrier", "buy_price", "current_value", "payout", "profit", "status", "buy_time", "sell_time"];
    const rows = visibleTrades.map((trade) => [
      trade.contract_id,
      trade.contract_type,
      trade.symbol,
      trade.account_type,
      trade.barrier ?? "",
      trade.buy_price.toFixed(2),
      trade.current_value.toFixed(2),
      trade.payout == null ? "" : trade.payout.toFixed(2),
      trade.profit.toFixed(2),
      trade.status,
      trade.buy_time ?? "",
      trade.sell_time ?? "",
    ]);
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
                <label><span><b>Reinvest profit</b><small>{reinvestProfit ? `${reinvestPercent}% of each win goes into the next BASE` : "Keep wins in the next BASE"}</small></span><input type="checkbox" checked={reinvestProfit} onChange={(event) => onReinvestProfitChange(event.target.checked)} disabled={running} /><i /></label>
                {reinvestProfit && (
                  <div className="money-bank-reinvest-details">
                    <label><span>Profit to reinvest</span><select value={reinvestPercent} onChange={(event) => onReinvestPercentChange(Number(event.target.value))} disabled={running}>{[10, 25, 45, 50, 65, 75, 85, 95, 100].map((percent) => <option key={percent} value={percent}>{percent}%</option>)}</select></label>
                    <div><span><small>REINVESTED</small><b>{money(reinvestedProfit, currency)}</b></span><span><small>LEFT BACK</small><b>{money(retainedProfit, currency)}</b></span></div>
                    <p>Based on {lastSettledProfit != null && lastSettledProfit > 0 ? "your last settled win" : "the projected BASE win"} of {money(profitBasis, currency)}.</p>
                  </div>
                )}
            </div>
          </section>

        </aside>
      </div>

       <section className="money-bank-card money-bank-snapshot-card">
         <div className="money-bank-card-head">
            <div><small>LIVE MARKET SAMPLES</small><h3>Volatility pair context</h3></div>
            <div className="money-bank-snapshot-actions"><span>Updated {capturedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span><button type="button" onClick={() => setCapturedAt(new Date())} disabled={running}><RefreshCw size={13} />Refresh</button></div>
         </div>
          <p className="money-bank-helper"><Info size={14} /> These are live observed samples, not simulated sessions or trade predictions. This view does not change the selected market or open contracts.</p>
         <div className="money-bank-snapshot-grid">
           {snapshot.map((entry, index) => {
             const label = markets.find(([market]) => market === entry.symbol)?.[1]?.replace("Volatility ", "V") ?? entry.symbol;
              const rise = entry.risePercentage == null ? "—" : `${entry.risePercentage.toFixed(1)}%`;
              const fall = entry.fallPercentage == null ? "—" : `${entry.fallPercentage.toFixed(1)}%`;
              return <div className={`money-bank-snapshot-row ${entry.symbol === symbol ? "best" : ""}`} key={entry.symbol}><b>{index + 1}</b><span>{label}</span><strong>{entry.sampleCount.toLocaleString()} ticks</strong><em>Rise {rise} · Fall {fall}</em></div>;
           })}
         </div>
          <p className="money-bank-safest-copy">Selected market: <b>{selectedMarket}</b>{quote != null && <> · latest quote {quote.toFixed(2)}</>}</p>
       </section>

        <DerivHistory
          title="Money Bank History"
          strategy="Money Bank Strategy"
          rows={visibleTrades}
          currency={currency}
          clearArmed={historyClearArmed}
          fading={historyFading}
          onClear={clearHistory}
          actions={<button type="button" onClick={downloadHistory} disabled={!visibleTrades.length}><Download size={13} />Download</button>}
        />

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