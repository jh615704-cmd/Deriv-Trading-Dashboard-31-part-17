import { useMemo } from "react";
import { Activity, BarChart3, Play, RefreshCw, Trash2 } from "lucide-react";

export type BulkTraderType = "over-under" | "differs";
export type BulkTraderPrediction = number;
export type BulkTraderContractType =
  | "DIGITOVER"
  | "DIGITUNDER"
  | "DIGITDIFF";

export type BulkTraderSymbol = {
  value: string;
  label: string;
  marketType: "volatility" | "jumps";
};

export type BulkTraderMarketSignal = {
  symbol: string;
  sampleCount: number;
  observedPercentage: number;
};

export type BulkTraderHistoryRow = {
  contract_id: string;
  contract_type: string;
  symbol: string;
  account_type: string;
  barrier?: number | null;
  buy_price: number;
  profit: number;
  status: string;
};

type Props = {
  symbol: string;
  symbols: readonly BulkTraderSymbol[];
  marketSignals: readonly BulkTraderMarketSignal[];
  marketLabel: string;
  quote?: number | null;
  lastDigit?: number | null;
  digitHistory: readonly number[];
  type: BulkTraderType;
  prediction: BulkTraderPrediction;
  duration: number;
  stake: number;
  tradeCount: number;
  analysisTickCount: number;
  autoSelectBest: boolean;
  recentTrades: readonly BulkTraderHistoryRow[];
  isConnected: boolean;
  isReal: boolean;
  liveConfirmed: boolean;
  isPlacingTrade: boolean;
  historyFading: boolean;
  clearArmed: boolean;
  onSymbolChange: (symbol: string) => void;
  onTypeChange: (type: BulkTraderType) => void;
  onPredictionChange: (prediction: BulkTraderPrediction) => void;
  onAutoSelectBestChange: (enabled: boolean) => void;
  onDurationChange: (duration: number) => void;
  onStakeChange: (stake: number) => void;
  onTradeCountChange: (count: number) => void;
  onLiveConfirmChange: (confirmed: boolean) => void;
  onTrade: (contractType: BulkTraderContractType, barrier?: number) => void;
  onRefreshAnalysis: () => void;
  onClearHistory: () => void;
};

const durationOptions = [1, 2, 3, 4, 5];
const countOptions = [1, 2, 3, 4, 5, 6];

const typeLabels: Record<BulkTraderType, string> = {
  "over-under": "Over / Under",
  differs: "Differs",
};

function displayPercentage(value: number) {
  return `${Math.max(0, Math.min(100, value)).toFixed(1)}%`;
}

export default function BulkTraderPanel({
  symbol,
  symbols,
  marketSignals,
  marketLabel,
  quote,
  lastDigit,
  digitHistory,
  type,
  prediction,
  duration,
  stake,
  tradeCount,
  analysisTickCount,
  autoSelectBest,
  recentTrades,
  isConnected,
  isReal,
  liveConfirmed,
  isPlacingTrade,
  historyFading,
  clearArmed,
  onSymbolChange,
  onTypeChange,
  onPredictionChange,
  onAutoSelectBestChange,
  onDurationChange,
  onStakeChange,
  onTradeCountChange,
  onLiveConfirmChange,
  onTrade,
  onRefreshAnalysis,
  onClearHistory,
}: Props) {
  const visibleDigits = useMemo(() => digitHistory.slice(-1000), [digitHistory]);
  const rankedSymbols = useMemo(
    () => [...symbols].sort((left, right) => {
      const leftSignal = marketSignals.find((signal) => signal.symbol === left.value);
      const rightSignal = marketSignals.find((signal) => signal.symbol === right.value);
      return (rightSignal?.observedPercentage ?? -1) - (leftSignal?.observedPercentage ?? -1)
        || (rightSignal?.sampleCount ?? 0) - (leftSignal?.sampleCount ?? 0)
        || left.label.localeCompare(right.label);
    }),
    [marketSignals, symbols],
  );
  const counts = useMemo(
    () => Array.from({ length: 10 }, (_, digit) => visibleDigits.filter((value) => value === digit).length),
    [visibleDigits],
  );
  const maxCount = Math.max(1, ...counts);
  const currentSignal = marketSignals.find((signal) => signal.symbol === symbol);
  const observedRate = currentSignal?.observedPercentage ?? 50;
  const previousDigit = visibleDigits.length > 1 ? visibleDigits[visibleDigits.length - 2] : null;
  const overRate = typeof prediction === "number" && visibleDigits.length
    ? (visibleDigits.filter((digit) => digit > prediction).length / visibleDigits.length) * 100
    : 50;
  const underRate = typeof prediction === "number" && visibleDigits.length ? 100 - overRate : 50;
  const selectedDigit = typeof prediction === "number" ? prediction : null;
  const selectedRate = selectedDigit == null || !visibleDigits.length ? 0 : (counts[selectedDigit] / visibleDigits.length) * 100;
  const lowDigitSignal = selectedDigit != null && selectedRate < 7 && lastDigit === selectedDigit;
  const recommendedDirection = selectedDigit != null && selectedDigit <= 4 ? "OVER" : "UNDER";
  const signalReady = type === "differs" ? lowDigitSignal : lowDigitSignal;
  const overUnavailable = selectedDigit === 9;
  const underUnavailable = selectedDigit === 0;

  const predictionOptions = Array.from({ length: 10 }, (_, digit) => digit);

  const actionButtons = type === "over-under"
    ? [
      { label: `Over ${selectedDigit ?? 0}${signalReady && recommendedDirection === "OVER" ? " · signal" : ""}`, type: "DIGITOVER" as const, percentage: overRate, disabled: overUnavailable },
      { label: `Under ${selectedDigit ?? 0}${signalReady && recommendedDirection === "UNDER" ? " · signal" : ""}`, type: "DIGITUNDER" as const, percentage: underRate, disabled: underUnavailable },
    ]
    : [{ label: `Differs ${selectedDigit ?? 0}${signalReady ? " · signal" : ""}`, type: "DIGITDIFF" as const, percentage: selectedDigit == null ? 50 : 100 - ((counts[selectedDigit] + 1) / (visibleDigits.length + 10)) * 100 }];

  const fireAction = (contractType: BulkTraderContractType) => {
    onTrade(contractType, selectedDigit ?? 0);
  };

  const predictionTitle = type === "over-under" ? "DIGIT THRESHOLD" : "DIGIT TO AVOID";

  return (
    <section className="bulk-trader-panel" data-testid="panel-bulk-trader">
      <header className="bulk-trader-head">
        <div className="bulk-trader-identity">
          <span className="bulk-trader-mark"><Activity size={18} /></span>
          <span><small className="bulk-trader-kicker">LIVE EXECUTION / BULK MODE</small><b>Bulk Trader</b><small>1–6 contracts · observed market signals</small></span>
        </div>
        <div className="bulk-trader-live" data-testid="status-bulk-connection"><i />{isConnected ? "LIVE" : "WAITING"}<strong>{quote == null ? "—" : quote.toFixed(3)}</strong></div>
      </header>

      <div className="bulk-trader-grid">
        <div className="bulk-trader-main">
          <div className="bulk-trader-market">
            <div className="bulk-trader-label"><small>MARKET SCAN · {marketLabel}</small><b>{analysisTickCount} ticks · {currentSignal ? `${currentSignal.sampleCount} observed` : "Waiting for sample"}</b></div>
            <select data-testid="select-bulk-market" value={autoSelectBest ? "__auto__" : symbol} onChange={(event) => event.target.value === "__auto__" ? onAutoSelectBestChange(true) : (onAutoSelectBestChange(false), onSymbolChange(event.target.value))} disabled={!isConnected || isPlacingTrade}>
              <option value="__auto__">{`Auto best · #1 ${rankedSymbols[0]?.label ?? "waiting for sample"}`}</option>
              {symbols.map((item) => {
                const signal = marketSignals.find((entry) => entry.symbol === item.value);
                const rank = rankedSymbols.findIndex((entry) => entry.value === item.value) + 1;
                return <option key={item.value} value={item.value}>{rank > 0 ? `#${rank} ` : ""}{item.label} · {signal ? displayPercentage(signal.observedPercentage) : "waiting"}</option>;
              })}
            </select>
            <div className="bulk-market-ranking" aria-label="Live market ranking">
              {rankedSymbols.slice(0, 3).map((item, index) => {
                const signal = marketSignals.find((entry) => entry.symbol === item.value);
                return <button type="button" key={item.value} className={item.value === symbol ? "selected" : ""} onClick={() => onSymbolChange(item.value)} disabled={!isConnected || isPlacingTrade}><b>{index + 1}</b><span>{item.label.replace(" Index", "")}</span><strong>{signal ? displayPercentage(signal.observedPercentage) : "—"}</strong></button>;
              })}
            </div>
          </div>

          <div className="bulk-trader-type">
            <small>TRADE TYPE</small>
            <div>{(Object.keys(typeLabels) as BulkTraderType[]).map((option) => <button type="button" data-testid={`button-type-${option}`} key={option} className={type === option ? "active" : ""} onClick={() => onTypeChange(option)}>{typeLabels[option]}</button>)}</div>
          </div>

          <div className="bulk-trader-tick-card">
            <div className="bulk-trader-tick-head">
              <span><small>CURRENT TICK</small><strong className="bulk-current-digit">{lastDigit == null ? "—" : lastDigit}</strong><em>{isConnected ? "streaming now" : "offline"}</em></span>
              <span><small>MARKET SIGNAL</small><strong className={signalReady ? "ready" : ""}>{signalReady ? "READY" : displayPercentage(observedRate)}</strong><em>{currentSignal ? `${currentSignal.sampleCount} tick sample` : "No sample yet"}</em></span>
              <button type="button" className="bulk-analysis-badge" onClick={onRefreshAnalysis} disabled={!isConnected || isPlacingTrade} title="Restart live tick analysis" aria-label="Restart live tick analysis" data-testid="button-refresh-bulk-analysis"><BarChart3 size={13} /><small>ANALYSIS</small><b>{analysisTickCount}T</b><RefreshCw size={12} /></button>
            </div>
            <div className="bulk-trader-digit-row" aria-label="Current digit distribution">
              {counts.map((count, digit) => {
                const sampleSize = visibleDigits.length;
                const absent = count === 0;
                let marker = "";
                if (type === "over-under" && selectedDigit != null) marker = digit > selectedDigit ? "O" : digit < selectedDigit ? "U" : "=";
                return <button type="button" data-testid={`button-digit-${digit}`} key={digit} className={`bulk-digit ${selectedDigit === digit ? "selected" : ""} ${lastDigit === digit ? "current" : ""} ${absent ? "absent" : ""}`} onClick={() => onPredictionChange(digit)}>
                  <span className="bulk-digit-marker">{marker || "·"}</span><b>{digit}</b><small>{displayPercentage(sampleSize ? (count / sampleSize) * 100 : 0)}</small><i style={{ height: `${Math.max(absent ? 5 : 8, (count / maxCount) * 54)}%` }} />
                  {lastDigit === digit && <em aria-label="current digit" />}
                </button>;
              })}
            </div>
            <div className="bulk-trader-trail">
              {visibleDigits.slice(-28).map((digit, index) => <span key={`${digit}-${index}`} className={digit === lastDigit ? "current" : ""}>{digit}</span>)}
              {!visibleDigits.length && <small>Live digits appear after the selected market connects.</small>}
            </div>
            <p>Observed percentages describe this sample only. They are not guaranteed outcomes.</p>
          </div>
        </div>

        <aside className="bulk-trader-controls">
          <div className="bulk-controls-heading"><div><small>{predictionTitle}</small><b>Choose an entry signal</b></div><span>{typeLabels[type]}</span></div>
          <label><div className="bulk-field-label"><small>PREDICTION</small><span>required</span></div><div className={`bulk-prediction-grid ${predictionOptions.length > 9 ? "wide" : ""}`}>{predictionOptions.map((option) => <button type="button" data-testid={`button-prediction-${String(option)}`} key={String(option)} className={prediction === option ? "active" : ""} onClick={() => onPredictionChange(option)}>{option}</button>)}</div></label>
          <label><small>EXECUTION DURATION</small><div className="bulk-choice-row duration">{durationOptions.map((option) => <button type="button" data-testid={`button-duration-${option}`} key={option} className={duration === option ? "active" : ""} onClick={() => onDurationChange(option)}>{option}T</button>)}</div></label>
          <label><small>STAKE · MIN 0.35</small><div className="bulk-money"><span>USD</span><input data-testid="input-bulk-stake" type="number" min=".35" step=".01" value={stake} onChange={(event) => onStakeChange(Math.max(.35, Number(event.target.value) || .35))} /></div><b>No artificial maximum</b></label>
           <label><small>BULK TRADES</small><div className="bulk-choice-row bulk-count-row">{countOptions.map((option) => <button type="button" data-testid={`button-count-${option}`} key={option} className={tradeCount === option ? "active" : ""} onClick={() => onTradeCountChange(option)}>{option}</button>)}</div><b>Contracts are quoted first, then sent together and tracked separately</b></label>
          {isReal && <label className="bulk-live-confirm"><input data-testid="input-confirm-live-funds" type="checkbox" checked={liveConfirmed} onChange={(event) => onLiveConfirmChange(event.target.checked)} /><span><b>Confirm live funds</b>Real-money contracts will be sent from the selected account.</span></label>}
          <div className={`bulk-trader-actions action-count-${actionButtons.length}`}>
             {actionButtons.map((action) => <button type="button" data-testid={`button-trade-${action.type.toLowerCase()}`} key={action.label} disabled={!isConnected || isPlacingTrade || (isReal && !liveConfirmed) || Boolean("disabled" in action && action.disabled)} onClick={() => fireAction(action.type)}><span><Play size={13} fill="currentColor" />{action.label}</span><small>{Boolean("disabled" in action && action.disabled) ? "Unavailable at this barrier" : `${displayPercentage(action.percentage)} observed`}</small></button>)}
          </div>
          {type === "over-under" && (overUnavailable || underUnavailable) && <p className="bulk-contract-warning">Over 9 and Under 0 have no possible winning digit, so Deriv does not offer a return. Choose the other direction or another barrier.</p>}
          {isPlacingTrade && <div className="bulk-sending"><RefreshCw size={14} className="spin" />Sending contracts to Deriv…</div>}
        </aside>
      </div>

      <section className="bulk-trader-history">
        <div className="xt-history-head"><div><Activity size={17} /><span><b>Bulk Trade History</b><small>Each returned contract is listed separately</small></span><strong className="bulk-session-pnl">Session P/L {recentTrades.reduce((sum, trade) => sum + (trade.status === "open" ? 0 : trade.profit), 0) >= 0 ? "+" : ""}{recentTrades.reduce((sum, trade) => sum + (trade.status === "open" ? 0 : trade.profit), 0).toFixed(2)}</strong></div><button type="button" data-testid="button-clear-bulk-history" onClick={onClearHistory} disabled={!recentTrades.length || historyFading}><Trash2 size={14} />{clearArmed ? "Tap again" : "Clear"}</button></div>
        {!recentTrades.length ? <div className="xt-empty"><RefreshCw size={18} />Bulk contracts will appear here after the first action.</div> : recentTrades.map((trade) => {
          const settled = trade.status !== "open";
          return <div className={`xt-trade ${historyFading ? "fading" : ""}`} data-testid={`row-bulk-trade-${trade.contract_id}`} key={trade.contract_id}><span><b>{trade.contract_type.replace("DIGIT", "")}</b><small>{trade.symbol} · {trade.account_type}{trade.barrier == null ? "" : ` · barrier ${trade.barrier}`}</small></span><span><small>BUY</small>{trade.buy_price.toFixed(2)}</span><span><small>STATUS</small>{trade.status}</span><strong className={settled && trade.profit < 0 ? "loss" : ""}>{settled ? `${trade.profit >= 0 ? "+" : ""}${trade.profit.toFixed(2)}` : "—"}</strong></div>;
        })}
      </section>
    </section>
  );
}