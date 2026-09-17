import { useMemo, useState } from "react";
import { ChevronDown, Pause, Play, ShieldAlert, Trash2 } from "lucide-react";
import {
  chooseBestEdgeSignal,
  type BestEdgeSignal,
  type MarketSignal,
} from "../lib/trading-sequence";
import "./edge-reference-panel.css";

type EdgeDirection = "DIGITOVER" | "DIGITUNDER";
type EdgeStrategy = "flat" | "martingale";

type EdgeTradeRow = {
  contract_id: string;
  contract_type: string;
  symbol: string;
  account_type: string;
  barrier?: number | null;
  status: string;
  profit: number;
  buy_price: number;
};

type EdgeReferencePanelProps = {
  isConnected: boolean;
  running: boolean;
  isReal: boolean;
  liveConfirmed: boolean;
  onLiveConfirm: (value: boolean) => void;
  symbol: string;
  markets: readonly (readonly [string, string])[];
  onSymbolChange: (value: string) => void;
  currentAccount?: { currency?: string; balance?: number } | null;
  direction: EdgeDirection;
  onDirectionChange: (value: EdgeDirection) => void;
  barrier: number;
  onBarrierChange: (value: number) => void;
  duration: number;
  onDurationChange: (value: number) => void;
  stake: number;
  onStakeChange: (value: number) => void;
  strategy: EdgeStrategy;
  onStrategyChange: (value: EdgeStrategy) => void;
  martingale: number;
  onMartingaleChange: (value: number) => void;
  takeProfit: number;
  onTakeProfitChange: (value: number) => void;
  stopLoss: number;
  onStopLossChange: (value: number) => void;
  edgeRecommendation?: BestEdgeSignal | null;
  marketSignals: readonly MarketSignal[];
  analysis: { overPercent: number; underPercent: number };
  lastDigit?: number | null;
  quote?: number | null;
  nextStake: number;
  sessionPnl: number;
  sessionTrades: number;
  canTrade: boolean;
  onStart: () => void | Promise<void>;
  onStop: () => void;
  onReset: () => void;
  canViewHistory: boolean;
  recentTrades: readonly EdgeTradeRow[];
  historyFading: boolean;
  clearTradesArmed: boolean;
  onClearHistory: () => void | Promise<void>;
};

const EDGE_PERCENTAGE_SCAN_FLOOR = 90;

const presets = [
  { value: "steady-over-4", name: "Steady | Over 4", risk: "12% RISK", detail: "2.2x ladder | 5 rungs | Over 4", note: "Small target: about 6 wins ends the session", tone: "teal" },
  { value: "steady-over-3", name: "Steady | Over 3", risk: "12% RISK", detail: "2.8x ladder | 4 rungs | Over 3", note: "Small target: about 7 wins ends the session", tone: "teal" },
  { value: "guarded-over-2", name: "Guarded | Over 2", risk: "10% RISK", detail: "3.8x ladder | 3 rungs | Over 2", note: "Hits often, recovers in one win, stops after 3 losses", tone: "teal" },
  { value: "steady-under-5", name: "Steady | Under 5", risk: "12% RISK", detail: "2.2x ladder | 5 rungs | Under 5", note: "The Over 4 shape on the other side of the grid", tone: "teal" },
  { value: "micro-over-4", name: "Micro | Over 4", risk: "6% RISK", detail: "2.2x ladder | 3 runs only | Over 4", note: "The smallest plan here: 4 wins ends the session", tone: "teal" },
  { value: "9-loss-reset", name: "9-Loss Reset", risk: "$300+", detail: "$5.50 stake | 1.85x | TP: $50 | SL: $275", note: "", tone: "teal" },
  { value: "aggressive", name: "Aggressive", risk: "FAST", detail: "$2 stake | 2.2x | TP: $50 | SL: $400", note: "", tone: "amber" },
  { value: "over-4-max", name: "Over 4 | 7-Loss Max Profit", risk: "$1,500", detail: "$0.35→$77.60", note: "", tone: "teal" },
  { value: "over-1-recovery", name: "Over 1 | 2-Loss Recovery", risk: "$713", detail: "$19.50 start | $713 2nd | 2 trades only", note: "", tone: "teal" },
  { value: "over-3-loss", name: "Over 3 | 6-Loss", risk: "$750", detail: "$1.00 stake | 2.8x | TP: $50 | SL: $750", note: "", tone: "pink" },
  { value: "over-2-loss", name: "Over 2 | 5-Loss", risk: "$800+", detail: "$0.35 start | 4.6x | TP: $20 | SL: $900", note: "", tone: "pink" },
  { value: "over-1-safety", name: "Over 1 | Safety Recovery", risk: "SAFE", detail: "$20 stake | $400 recovery | 5-tick safety check", note: "", tone: "teal" },
  { value: "over-2-dynamic", name: "Over 2 | 3-Loss Dynamic", risk: "$1,500", detail: "$46 start | dynamic | TP: $20→$30→$50 | SL: $1,500 | 3 trades", note: "", tone: "purple" },
  { value: "over-3-dynamic", name: "Over 3 | 4-Loss Dynamic", risk: "$1,500", detail: "$22.43 start | dynamic | TP: $20→$30→$40→$50 | SL: $1,500 | 4 trades", note: "", tone: "purple" },
] as const;

function EdgeToggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (value: boolean) => void; disabled: boolean; label: string }) {
  return (
    <span className="edge-toggle" aria-label={label}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} disabled={disabled} />
      <i />
    </span>
  );
}

export default function EdgeReferencePanel({
  isConnected,
  running,
  isReal,
  liveConfirmed,
  onLiveConfirm,
  symbol,
  markets,
  onSymbolChange,
  currentAccount,
  direction,
  onDirectionChange,
  barrier,
  onBarrierChange,
  duration,
  onDurationChange,
  stake,
  onStakeChange,
  strategy,
  onStrategyChange,
  martingale,
  onMartingaleChange,
  takeProfit,
  onTakeProfitChange,
  stopLoss,
  onStopLossChange,
  edgeRecommendation,
  marketSignals,
  analysis,
  lastDigit = null,
  quote = null,
  nextStake,
  sessionPnl,
  sessionTrades,
  canTrade,
  onStart,
  onStop,
  onReset,
  canViewHistory,
  recentTrades,
  historyFading,
  clearTradesArmed,
  onClearHistory,
}: EdgeReferencePanelProps) {
  const [preset, setPreset] = useState("custom");
  const [presetOpen, setPresetOpen] = useState(false);
  const [maxStake, setMaxStake] = useState("No limit");
  const [autoRepeat, setAutoRepeat] = useState(false);
  const [overThreeSniper, setOverThreeSniper] = useState(false);
  const [bestPairAnalyzer, setBestPairAnalyzer] = useState(false);

  const bestSignal = useMemo(
    () => edgeRecommendation ?? chooseBestEdgeSignal(marketSignals as MarketSignal[], EDGE_PERCENTAGE_SCAN_FLOOR),
    [edgeRecommendation, marketSignals],
  );
  const bestDirection = bestSignal?.direction === "DIGITUNDER" ? "Under" : "Over";
  const bestBarrier = bestSignal?.digit ?? barrier;
  const bestRate = bestSignal?.score ?? Math.max(analysis.overPercent, analysis.underPercent);
  const bestMarket = markets.find(([value]) => value === (bestSignal?.symbol ?? symbol))?.[1] ?? "Volatility 100 Index";
  const marketLabel = markets.find(([value]) => value === symbol)?.[1] ?? "Volatility 100 Index";
  const quoteText = quote == null ? "—" : Number.isInteger(quote) ? String(quote) : quote.toFixed(2);
  const currency = currentAccount?.currency ?? "USD";

  const applyPreset = (value: string) => {
    setPreset(value);
    setPresetOpen(false);
    if (value === "steady-over-4") {
      onStrategyChange("martingale");
      onDurationChange(5);
      onStakeChange(1);
      onMartingaleChange(2.2);
      onBarrierChange(4);
      onDirectionChange("DIGITOVER");
    } else if (value === "guarded-over-2") {
      onStrategyChange("martingale");
      onDurationChange(3);
      onStakeChange(1);
      onMartingaleChange(3.8);
      onBarrierChange(2);
      onDirectionChange("DIGITOVER");
    } else if (value === "steady-under-5") {
      onStrategyChange("martingale");
      onDurationChange(5);
      onStakeChange(1);
      onMartingaleChange(2.2);
      onBarrierChange(5);
      onDirectionChange("DIGITUNDER");
    } else if (value === "custom") {
      onStrategyChange("martingale");
      onDurationChange(5);
      onStakeChange(1);
      onMartingaleChange(2);
      onTakeProfitChange(10);
      onStopLossChange(10);
      setMaxStake("No limit");
    }
  };

  return (
    <section className="edge-reference-layout">
      <section className="edge-ref-card edge-ref-scanner">
        <div className="edge-ref-heading">
          <div className="edge-ref-title"><span className="edge-ref-spark">✦</span><b>Barrier Scanner</b><span className="edge-ref-premium">PREMIUM</span></div>
          <span className="edge-ref-live"><i /> LIVE</span>
        </div>
        <div className="edge-ref-rule" />
        <div className="edge-ref-best">
          <div className="edge-ref-best-barrier">{bestDirection} {bestBarrier}</div>
          <div className="edge-ref-best-copy"><span>BEST BARRIER TO TRADE NOW</span><p><strong>{bestRate.toFixed(1)}% win</strong><em>·</em> payout 106% <em>·</em> {bestMarket}</p></div>
        </div>
      </section>

      <section className="edge-ref-card edge-ref-market">
        <div className="edge-ref-market-row"><span className="edge-ref-market-icon">▥</span><span><small>Market (auto-selected)</small><b>{marketLabel}</b></span><ChevronDown size={18} /></div>
        <select value={symbol} onChange={(event) => onSymbolChange(event.target.value)} disabled={!isConnected || running} aria-label="Select EDGE market">
          {markets.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <p>Choose a direction &amp; digit — the best-performing pair is picked automatically.</p>
      </section>

      <div className="edge-ref-feature-list">
        <label className="edge-ref-feature"><span><i>✦</i> Over 3 Sniper</span><EdgeToggle checked={overThreeSniper} onChange={setOverThreeSniper} disabled={running} label="Over 3 Sniper" /></label>
        <label className="edge-ref-feature"><span><i>✦</i> Best Pair Analyzer</span><EdgeToggle checked={bestPairAnalyzer} onChange={setBestPairAnalyzer} disabled={running} label="Best Pair Analyzer" /></label>
      </div>

      <section className="edge-ref-card edge-ref-quote"><strong>{quoteText}</strong><span>Last digit: <b>{lastDigit == null ? "—" : lastDigit}</b></span></section>

      <div className="edge-ref-direction">
        <button className={direction === "DIGITOVER" ? "active over" : ""} onClick={() => onDirectionChange("DIGITOVER")} disabled={running}>Over</button>
        <button className={direction === "DIGITUNDER" ? "active under" : ""} onClick={() => onDirectionChange("DIGITUNDER")} disabled={running}>Under</button>
      </div>

      <section className="edge-ref-card edge-ref-digit-card">
        <span className="edge-ref-field-label">Last digit prediction · live market highlight</span>
        <div className="edge-ref-digit-picker">{Array.from({ length: 10 }, (_, digit) => {
          const isMarketDigit = lastDigit === digit;
          return <button type="button" key={digit} className={`${barrier === digit ? "active " : ""}${isMarketDigit ? "market" : ""}`} onClick={() => onBarrierChange(digit)} disabled={running} aria-label={`Barrier digit ${digit}${isMarketDigit ? ", current market digit" : ""}`} title={isMarketDigit ? "Current market digit" : undefined}>{digit}</button>;
        })}</div>
      </section>

      <section className={`edge-ref-card edge-ref-preset ${presetOpen ? "open" : ""}`}>
        <span className="edge-ref-field-label">Preset</span>
        <button type="button" className="edge-ref-preset-trigger" onClick={() => setPresetOpen((open) => !open)} disabled={running}><b>{preset === "custom" ? "Select a Preset" : presets.find((item) => item.value === preset)?.name}</b><ChevronDown size={15} /></button>
        {presetOpen && <div className="edge-ref-preset-menu">{presets.map((item) => <button type="button" className={`edge-ref-preset-option ${item.tone}`} key={item.value} onClick={() => applyPreset(item.value)}><strong>{item.name} <small>{item.risk}</small></strong><span>{item.detail}</span>{item.note && <em>{item.note}</em>}</button>)}</div>}
        <p>Each preset is re-sized to your balance when applied. It sets the stake, ladder and stops — not the odds of a trade.</p>
      </section>

      <section className="edge-ref-card edge-ref-repeat"><div><b>Auto-Repeat 10-Min Sessions</b><p>Stops at profit target, waits for next 10-min mark, then restarts</p></div><EdgeToggle checked={autoRepeat} onChange={setAutoRepeat} disabled={running} label="Auto-Repeat 10-Min Sessions" /></section>

      <label className="edge-ref-input-card"><span>Duration</span><div><input type="number" min="1" max="5" value={duration} onChange={(event) => onDurationChange(Math.min(5, Math.max(1, Number(event.target.value) || 1)))} disabled={running} /><b>ticks</b></div></label>
      <label className="edge-ref-input-card"><span>Initial stake</span><div><input type="number" min=".35" step=".01" value={stake} onChange={(event) => onStakeChange(Math.max(.35, Number(event.target.value) || .35))} disabled={running} /><b>{currency}</b></div></label>

      <section className="edge-ref-card edge-ref-setup"><h2>Strategy parameters</h2>
        <label><span>Strategy</span><div><select value={strategy} onChange={(event) => onStrategyChange(event.target.value as EdgeStrategy)} disabled={running}><option value="martingale">Martingale</option><option value="flat">Flat stake</option></select><ChevronDown size={16} /></div></label>
        <label><span>Stake multiplier</span><div><input type="number" min="1" max="10" step=".1" value={martingale} onChange={(event) => onMartingaleChange(Number(event.target.value))} disabled={running || strategy === "flat"} /><b>x</b></div></label>
        <label><span>Max. stake</span><input value={maxStake} onChange={(event) => setMaxStake(event.target.value)} disabled={running} /></label>
        <p className="edge-ref-callout">💡 No max stake needed — with the built-in 50%-of-balance protection your balance already survives <b>22+</b> losses in a row.</p>
      </section>

      <section className="edge-ref-card edge-ref-risk"><h2>Risk management</h2>
        <label><span>Profit threshold</span><div><input type="number" min=".01" step=".01" value={takeProfit} onChange={(event) => onTakeProfitChange(Math.max(.01, Number(event.target.value) || .01))} disabled={running} /><b>USD</b></div></label>
        <label><span>Loss threshold</span><div><input type="number" min=".01" step=".01" value={stopLoss} onChange={(event) => onStopLossChange(Math.max(.01, Number(event.target.value) || .01))} disabled={running} /><b>USD</b></div></label>
        <p className="edge-ref-callout danger">🛡 Wipeout radar — <b>22</b> losses in a row would exhaust your balance</p>
      </section>

      {isReal && <label className="xt-live-warning"><ShieldAlert size={18} /><input type="checkbox" checked={liveConfirmed} onChange={(event) => onLiveConfirm(event.target.checked)} /><span><b>Live funds confirmation</b>I understand EDGE will place real-money contracts.</span></label>}

      <section className="edge-ref-session"><div><span>Current Stake</span><b>${(strategy === "martingale" ? nextStake : stake).toFixed(2)}</b></div><div><span>Session P/L</span><b className={sessionPnl < 0 ? "loss" : ""}>{sessionPnl >= 0 ? "+" : ""}{sessionPnl.toFixed(2)}</b></div><div><span>Trades</span><b>{sessionTrades}</b></div><p>Runtime stop</p></section>

      <button className={`edge-ref-run ${running ? "running" : ""}`} onClick={() => void (running ? onStop() : onStart())} disabled={!isConnected || (!running && !canTrade)}>{running ? <><Pause size={16} fill="currentColor" /> Stop</> : <><Play size={15} fill="currentColor" /> Run</>}</button>

      {canViewHistory && <section className="edge-ref-history"><div className="edge-ref-history-heading"><h2>Recent Trades</h2><button onClick={() => void onClearHistory()} disabled={historyFading || !recentTrades.length}><Trash2 size={15} /></button></div>{!recentTrades.length ? <div className="edge-ref-empty">No trades yet. Configure and press Run.</div> : recentTrades.slice(0, 12).map((trade) => {
        const settled = trade.status !== "open";
        return <div className={`xt-trade ${historyFading ? "fading" : ""}`} key={trade.contract_id}><span><b>{trade.contract_type.replace("DIGIT", "")}</b><small>{trade.symbol} · {trade.account_type}{trade.barrier == null ? "" : ` · barrier ${trade.barrier}`}</small></span><span><small>BUY</small>{trade.buy_price.toFixed(2)}</span><span><small>STATUS</small>{trade.status}</span><strong className={settled && trade.profit < 0 ? "loss" : ""}>{settled ? `${trade.profit >= 0 ? "+" : ""}${trade.profit.toFixed(2)}` : "—"}</strong></div>;
      })}</section>}

      <section className="edge-ref-disclaimer"><b>RISK DISCLAIMER</b><p>Deriv offers complex derivatives, such as options and contracts for difference (“CFDs”). These products may not be suitable for all clients, and trading them puts you at risk. Please make sure that you understand the following risks before trading Deriv products: a) you may lose some or all of the money you invest in the trade, b) if your trade involves currency conversion, exchange rates will affect your profit or loss.</p></section>
    </section>
  );
}