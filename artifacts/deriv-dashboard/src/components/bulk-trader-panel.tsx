import { useMemo, useState } from "react";
import { Activity, Play, RefreshCw, Trash2 } from "lucide-react";

export type BulkTraderType = "over-under" | "even-odd" | "rise-fall" | "differs";
export type BulkTraderPrediction = number | "even" | "odd" | "dual" | "rise" | "fall";
export type BulkTraderContractType =
  | "DIGITOVER"
  | "DIGITUNDER"
  | "DIGITEVEN"
  | "DIGITODD"
  | "DIGITDIFF"
  | "CALL"
  | "PUT";

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
  sampleTicks: number;
  duration: number;
  stake: number;
  tradeCount: number;
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
  onSampleTicksChange: (ticks: number) => void;
  onDurationChange: (duration: number) => void;
  onStakeChange: (stake: number) => void;
  onTradeCountChange: (count: number) => void;
  onLiveConfirmChange: (confirmed: boolean) => void;
  onTrade: (contractType: BulkTraderContractType, barrier?: number) => void;
  onClearHistory: () => void;
};

const sampleOptions = [100, 300, 500, 800, 1000];
const durationOptions = [1, 2, 3, 4, 5];
const countOptions = [1, 2, 3, 4, 5, 6];

const typeLabels: Record<BulkTraderType, string> = {
  "over-under": "Over / Under",
  "even-odd": "Even / Odd",
  "rise-fall": "Rise / Fall",
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
  sampleTicks,
  duration,
  stake,
  tradeCount,
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
  onSampleTicksChange,
  onDurationChange,
  onStakeChange,
  onTradeCountChange,
  onLiveConfirmChange,
  onTrade,
  onClearHistory,
}: Props) {
  const [marketFilter, setMarketFilter] = useState<"all" | "volatility" | "jumps">("all");
  const visibleDigits = useMemo(() => digitHistory.slice(-sampleTicks), [digitHistory, sampleTicks]);
  const filteredSymbols = useMemo(
    () => symbols.filter((item) => marketFilter === "all" || item.marketType === marketFilter),
    [marketFilter, symbols],
  );
  const counts = useMemo(
    () => Array.from({ length: 10 }, (_, digit) => visibleDigits.filter((value) => value === digit).length),
    [visibleDigits],
  );
  const maxCount = Math.max(1, ...counts);
  const currentSignal = marketSignals.find((signal) => signal.symbol === symbol);
  const observedRate = currentSignal?.observedPercentage ?? 50;
  const previousDigit = visibleDigits.length > 1 ? visibleDigits[visibleDigits.length - 2] : null;
  const movement = lastDigit == null || previousDigit == null ? "—" : lastDigit > previousDigit ? "R" : lastDigit < previousDigit ? "F" : "=";
  const evenRate = visibleDigits.length
    ? (visibleDigits.filter((digit) => digit % 2 === 0).length / visibleDigits.length) * 100
    : 50;
  const oddRate = 100 - evenRate;
  const overRate = typeof prediction === "number" && visibleDigits.length
    ? (visibleDigits.filter((digit) => digit > prediction).length / visibleDigits.length) * 100
    : 50;
  const underRate = typeof prediction === "number" && visibleDigits.length ? 100 - overRate : 50;
  const selectedDigit = typeof prediction === "number" ? prediction : null;
  const signalReady = type === "differs"
    ? selectedDigit != null && counts[selectedDigit] <= Math.max(1, Math.floor(visibleDigits.length * 0.07))
    : observedRate >= 88;

  const predictionOptions = type === "over-under" || type === "differs"
    ? Array.from({ length: type === "over-under" ? 9 : 10 }, (_, digit) => type === "over-under" ? digit + 1 : digit)
    : type === "even-odd" ? ["even", "odd", "dual"] as const : ["rise", "fall", "dual"] as const;

  const actionButtons = type === "over-under"
    ? [
      { label: `Over ${selectedDigit ?? 1}`, type: "DIGITOVER" as const, percentage: overRate },
      { label: `Under ${selectedDigit ?? 1}`, type: "DIGITUNDER" as const, percentage: underRate },
    ]
    : type === "even-odd"
      ? [
        { label: "Even", type: "DIGITEVEN" as const, percentage: evenRate },
        { label: "Odd", type: "DIGITODD" as const, percentage: oddRate },
        { label: "Dual", type: "DIGITEVEN" as const, percentage: 100 },
      ]
      : type === "rise-fall"
        ? [
          { label: "Rise", type: "CALL" as const, percentage: movement === "R" ? observedRate : 100 - observedRate },
          { label: "Fall", type: "PUT" as const, percentage: movement === "F" ? observedRate : 100 - observedRate },
          { label: "Dual", type: "CALL" as const, percentage: 100 },
        ]
        : [{ label: `Differs ${selectedDigit ?? 0}`, type: "DIGITDIFF" as const, percentage: selectedDigit == null ? 50 : 100 - ((counts[selectedDigit] + 1) / (visibleDigits.length + 10)) * 100 }];

  const fireAction = (contractType: BulkTraderContractType) => {
    if (type === "over-under" || type === "differs") onTrade(contractType, selectedDigit ?? 0);
    else onTrade(contractType);
  };

  return (
    <section className="bulk-trader-panel">
      <header className="bulk-trader-head">
        <div><Activity size={18} /><span><b>Bulk Trader</b><small>1–6 contracts · live observed market signals</small></span></div>
        <div className="bulk-trader-live"><i />{isConnected ? "LIVE" : "WAITING"}<strong>{quote == null ? "—" : quote.toFixed(3)}</strong></div>
      </header>

      <div className="bulk-trader-grid">
        <div className="bulk-trader-main">
          <div className="bulk-trader-market">
            <div className="bulk-trader-label"><small>MARKET · {marketLabel}</small><b>{currentSignal ? `${currentSignal.sampleCount} observed ticks` : "Waiting for sample"}</b></div>
            <div className="bulk-trader-filter">
              {(["all", "volatility", "jumps"] as const).map((filter) => (
                <button type="button" key={filter} className={marketFilter === filter ? "active" : ""} onClick={() => setMarketFilter(filter)}>{filter}</button>
              ))}
            </div>
            <select value={symbol} onChange={(event) => onSymbolChange(event.target.value)} disabled={!isConnected || isPlacingTrade}>
              {filteredSymbols.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <div className="bulk-trader-market-list" aria-label="Live market observations">
              {filteredSymbols.map((item) => {
                const signal = marketSignals.find((entry) => entry.symbol === item.value);
                return <button type="button" key={item.value} className={item.value === symbol ? "selected" : ""} onClick={() => onSymbolChange(item.value)}>
                  <span>{item.label}</span><strong>{signal ? displayPercentage(signal.observedPercentage) : "—"}</strong>
                </button>;
              })}
            </div>
          </div>

          <div className="bulk-trader-type">
            <small>TRADE TYPE</small>
            <div>{(Object.keys(typeLabels) as BulkTraderType[]).map((option) => <button type="button" key={option} className={type === option ? "active" : ""} onClick={() => onTypeChange(option)}>{typeLabels[option]}</button>)}</div>
          </div>

          <div className="bulk-trader-tick-card">
            <div className="bulk-trader-tick-head"><span><small>CURRENT TICK</small><strong>{lastDigit == null ? "—" : lastDigit}</strong></span><span><small>MARKET SIGNAL</small><strong className={signalReady ? "ready" : ""}>{signalReady ? "READY" : displayPercentage(observedRate)}</strong></span></div>
            <div className="bulk-trader-digit-row">
              {counts.map((count, digit) => {
                const absent = visibleDigits.length;
                let marker = "";
                if (type === "over-under" && selectedDigit != null) marker = digit > selectedDigit ? "O" : digit < selectedDigit ? "U" : "=";
                if (type === "even-odd") marker = digit % 2 === 0 ? "E" : "O";
                if (type === "rise-fall") marker = movement;
                if (type === "differs" && selectedDigit === digit) marker = "=";
                return <button type="button" key={digit} className={`bulk-digit ${selectedDigit === digit ? "selected" : ""} ${lastDigit === digit ? "current" : ""}`} onClick={() => (type === "over-under" || type === "differs") && onPredictionChange(digit)}>
                  <span className="bulk-digit-marker">{marker || "·"}</span><b>{digit}</b><small>{displayPercentage(absent ? (count / absent) * 100 : 0)}</small><i style={{ height: `${Math.max(8, (count / maxCount) * 54)}%` }} />
                  {lastDigit === digit && <em aria-label="current digit" />}
                </button>;
              })}
            </div>
            <div className="bulk-trader-trail">
              {visibleDigits.slice(-28).map((digit, index) => <span key={`${digit}-${index}`} className={digit === lastDigit ? "current" : ""}>{digit}</span>)}
              {!visibleDigits.length && <small>Live digits appear after the selected market connects.</small>}
            </div>
            <p>Observed percentages, streaks, and absence cues describe this sample. They are not guaranteed outcomes.</p>
          </div>
        </div>

        <aside className="bulk-trader-controls">
          <label><small>PREDICTION</small><div className="bulk-prediction-grid">{predictionOptions.map((option) => <button type="button" key={String(option)} className={prediction === option ? "active" : ""} onClick={() => onPredictionChange(option)}>{typeof option === "number" ? option : option.toUpperCase()}</button>)}</div></label>
          <label><small>ANALYSIS TICKS</small><div className="bulk-choice-row">{sampleOptions.map((option) => <button type="button" key={option} className={sampleTicks === option ? "active" : ""} onClick={() => onSampleTicksChange(option)}>{option}</button>)}</div></label>
          <label><small>EXECUTION DURATION</small><div className="bulk-choice-row">{durationOptions.map((option) => <button type="button" key={option} className={duration === option ? "active" : ""} onClick={() => onDurationChange(option)}>{option}T</button>)}</div></label>
          <label><small>STAKE · MIN 0.35</small><div className="bulk-money"><span>USD</span><input type="number" min=".35" step=".01" value={stake} onChange={(event) => onStakeChange(Math.max(.35, Number(event.target.value) || .35))} /></div><b>No artificial maximum</b></label>
          <label><small>BULK TRADES</small><div className="bulk-choice-row">{countOptions.map((option) => <button type="button" key={option} className={tradeCount === option ? "active" : ""} onClick={() => onTradeCountChange(option)}>{option}</button>)}</div><b>Contracts sent immediately and tracked separately</b></label>
          {isReal && <label className="bulk-live-confirm"><input type="checkbox" checked={liveConfirmed} onChange={(event) => onLiveConfirmChange(event.target.checked)} /><span><b>Confirm live funds</b>Real-money contracts will be sent from the selected account.</span></label>}
          <div className="bulk-trader-actions">
            {actionButtons.map((action) => <button type="button" key={action.label} disabled={!isConnected || isPlacingTrade || (isReal && !liveConfirmed)} onClick={() => fireAction(action.type)}><span><Play size={13} fill="currentColor" />{action.label}</span><small>{displayPercentage(action.percentage)} observed</small></button>)}
          </div>
          {isPlacingTrade && <div className="bulk-sending"><RefreshCw size={14} className="spin" />Sending contracts to Deriv…</div>}
        </aside>
      </div>

      <section className="bulk-trader-history">
        <div className="xt-history-head"><div><Activity size={17} /><span><b>Bulk Trade History</b><small>Each returned contract is listed separately</small></span></div><button type="button" onClick={onClearHistory} disabled={!recentTrades.length || historyFading}><Trash2 size={14} />{clearArmed ? "Tap again" : "Clear"}</button></div>
        {!recentTrades.length ? <div className="xt-empty"><RefreshCw size={18} />Bulk contracts will appear here after the first action.</div> : recentTrades.slice(0, 18).map((trade) => {
          const settled = trade.status !== "open";
          return <div className={`xt-trade ${historyFading ? "fading" : ""}`} key={trade.contract_id}><span><b>{trade.contract_type.replace("DIGIT", "")}</b><small>{trade.symbol} · {trade.account_type}{trade.barrier == null ? "" : ` · barrier ${trade.barrier}`}</small></span><span><small>BUY</small>{trade.buy_price.toFixed(2)}</span><span><small>STATUS</small>{trade.status}</span><strong className={settled && trade.profit < 0 ? "loss" : ""}>{settled ? `${trade.profit >= 0 ? "+" : ""}${trade.profit.toFixed(2)}` : "—"}</strong></div>;
        })}
      </section>
    </section>
  );
}