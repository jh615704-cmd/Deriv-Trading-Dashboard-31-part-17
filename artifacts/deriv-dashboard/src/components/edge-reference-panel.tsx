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
  payoutPercent?: number | null;
  nextStake: number;
  sessionPnl: number;
  sessionTrades: number;
  overThreeSniper: boolean;
  bestPairAnalyzer: boolean;
  scannerMessage?: string | null;
  riskBalance: string;
  accountBalance: string;
  outcomeMultiplier: string;
  outcomeSynced: boolean;
  canTrade: boolean;
  onStart: () => void | Promise<void>;
  onStop: () => void;
  onReset: () => void;
  onOverThreeSniperChange: (value: boolean) => void;
  onBestPairAnalyzerChange: (value: boolean) => void;
  onRiskBalanceChange: (value: string) => void;
  onAccountBalanceChange: (value: string) => void;
  onOutcomeMultiplierChange: (value: string) => void;
  onOutcomeSyncedChange: (value: boolean) => void;
  canViewHistory: boolean;
  recentTrades: readonly EdgeTradeRow[];
  historyFading: boolean;
  clearTradesArmed: boolean;
  onClearHistory: () => void | Promise<void>;
};

const EDGE_PERCENTAGE_SCAN_FLOOR = 90;

function chooseBestOverThreeSignal(signals: MarketSignal[]): BestEdgeSignal | null {
  const candidates = signals
    .filter((signal) => signal.sample_count >= 5 && signal.quote != null)
    .map((signal) => {
      const outcome = signal.digit_outcomes?.find((item) => item.digit === 3);
      return outcome ? { signal, score: Number(outcome.over_percentage) } : null;
    })
    .filter((candidate): candidate is { signal: MarketSignal; score: number } => candidate !== null && Number.isFinite(candidate.score))
    .sort((left, right) => right.score - left.score || right.signal.sample_count - left.signal.sample_count);
  const best = candidates[0];
  return best ? {
    symbol: best.signal.symbol,
    direction: "DIGITOVER",
    digit: 3,
    score: best.score,
    sampleCount: best.signal.sample_count,
  } : null;
}

function chooseBestAnalyzerSignal(signals: MarketSignal[]): BestEdgeSignal | null {
  const candidates = signals.flatMap((signal) => (signal.digit_outcomes ?? []).filter((outcome) => outcome.digit > 0 && outcome.digit < 9).flatMap((outcome) => {
    const over = Number(outcome.over_percentage);
    const under = Number(outcome.under_percentage);
    if (!Number.isFinite(over) || !Number.isFinite(under)) return [];
    return [
      { symbol: signal.symbol, direction: "DIGITOVER" as const, digit: outcome.digit, score: over, sampleCount: signal.sample_count },
      { symbol: signal.symbol, direction: "DIGITUNDER" as const, digit: outcome.digit, score: under, sampleCount: signal.sample_count },
    ];
  })).filter((candidate) => candidate.sampleCount >= 5);
  return candidates.sort((left, right) => right.score - left.score || right.sampleCount - left.sampleCount || left.digit - right.digit)[0] ?? null;
}

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

const presetSettings: Record<string, {
  strategy: EdgeStrategy;
  duration: number;
  stake: number;
  martingale: number;
  barrier: number;
  direction: EdgeDirection;
  takeProfit: number;
  stopLoss: number;
  maxStake: string;
}> = {
  "steady-over-4": { strategy: "martingale", duration: 5, stake: 1, martingale: 2.2, barrier: 4, direction: "DIGITOVER", takeProfit: 10, stopLoss: 10, maxStake: "No limit" },
  "steady-over-3": { strategy: "martingale", duration: 5, stake: 1, martingale: 2.8, barrier: 3, direction: "DIGITOVER", takeProfit: 10, stopLoss: 10, maxStake: "No limit" },
  "guarded-over-2": { strategy: "martingale", duration: 3, stake: 1, martingale: 3.8, barrier: 2, direction: "DIGITOVER", takeProfit: 10, stopLoss: 10, maxStake: "No limit" },
  "steady-under-5": { strategy: "martingale", duration: 5, stake: 1, martingale: 2.2, barrier: 5, direction: "DIGITUNDER", takeProfit: 10, stopLoss: 10, maxStake: "No limit" },
  "micro-over-4": { strategy: "martingale", duration: 3, stake: .5, martingale: 2.2, barrier: 4, direction: "DIGITOVER", takeProfit: 5, stopLoss: 5, maxStake: "No limit" },
  "9-loss-reset": { strategy: "martingale", duration: 1, stake: 5.5, martingale: 1.85, barrier: 4, direction: "DIGITOVER", takeProfit: 50, stopLoss: 275, maxStake: "No limit" },
  aggressive: { strategy: "martingale", duration: 1, stake: 2, martingale: 2.2, barrier: 4, direction: "DIGITOVER", takeProfit: 50, stopLoss: 400, maxStake: "No limit" },
  "over-4-max": { strategy: "martingale", duration: 1, stake: .35, martingale: 4.6, barrier: 4, direction: "DIGITOVER", takeProfit: 50, stopLoss: 1500, maxStake: "77.60" },
  "over-1-recovery": { strategy: "martingale", duration: 1, stake: 19.5, martingale: 2, barrier: 1, direction: "DIGITOVER", takeProfit: 50, stopLoss: 713, maxStake: "713" },
  "over-3-loss": { strategy: "martingale", duration: 1, stake: 1, martingale: 2.8, barrier: 3, direction: "DIGITOVER", takeProfit: 50, stopLoss: 750, maxStake: "750" },
  "over-2-loss": { strategy: "martingale", duration: 1, stake: .35, martingale: 4.6, barrier: 2, direction: "DIGITOVER", takeProfit: 20, stopLoss: 900, maxStake: "900" },
  "over-1-safety": { strategy: "martingale", duration: 5, stake: 20, martingale: 20, barrier: 1, direction: "DIGITOVER", takeProfit: 50, stopLoss: 400, maxStake: "400" },
  "over-2-dynamic": { strategy: "martingale", duration: 1, stake: 46, martingale: 1.6, barrier: 2, direction: "DIGITOVER", takeProfit: 20, stopLoss: 1500, maxStake: "1500" },
  "over-3-dynamic": { strategy: "martingale", duration: 1, stake: 22.43, martingale: 1.6, barrier: 3, direction: "DIGITOVER", takeProfit: 20, stopLoss: 1500, maxStake: "1500" },
};

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
  payoutPercent = null,
  nextStake,
  sessionPnl,
  sessionTrades,
  overThreeSniper,
  bestPairAnalyzer,
  scannerMessage = null,
  riskBalance,
  accountBalance,
  outcomeMultiplier,
  outcomeSynced,
  canTrade,
  onStart,
  onStop,
  onReset,
  onOverThreeSniperChange,
  onBestPairAnalyzerChange,
  onRiskBalanceChange,
  onAccountBalanceChange,
  onOutcomeMultiplierChange,
  onOutcomeSyncedChange,
  canViewHistory,
  recentTrades,
  historyFading,
  clearTradesArmed,
  onClearHistory,
}: EdgeReferencePanelProps) {
  const [preset, setPreset] = useState("custom");
  const [presetOpen, setPresetOpen] = useState(false);
  const [marketPickerOpen, setMarketPickerOpen] = useState(false);
  const [maxStake, setMaxStake] = useState("No limit");
  const [multipleBalanceOpen, setMultipleBalanceOpen] = useState(false);

  const liveSignals = marketSignals as MarketSignal[];
  const liveAutomationSignal = useMemo(
    () => overThreeSniper
      ? chooseBestOverThreeSignal(liveSignals)
      : bestPairAnalyzer
        ? chooseBestAnalyzerSignal(liveSignals)
        : null,
    [bestPairAnalyzer, liveSignals, overThreeSniper],
  );
  const bestSignal = useMemo(
    () => liveAutomationSignal ?? edgeRecommendation ?? chooseBestEdgeSignal(liveSignals, EDGE_PERCENTAGE_SCAN_FLOOR),
    [edgeRecommendation, liveAutomationSignal, liveSignals],
  );
  const bestDirection = bestSignal?.direction === "DIGITUNDER" ? "Under" : "Over";
  const bestBarrier = bestSignal?.digit ?? barrier;
  const bestRate = bestSignal?.score ?? Math.max(analysis.overPercent, analysis.underPercent);
  const bestMarket = markets.find(([value]) => value === (bestSignal?.symbol ?? symbol))?.[1] ?? "Volatility 100 Index";
  const autoMarketEnabled = overThreeSniper || bestPairAnalyzer;
  const displayedSymbol = autoMarketEnabled ? (bestSignal?.symbol ?? symbol) : symbol;
  const marketLabel = markets.find(([value]) => value === displayedSymbol)?.[1] ?? "Volatility 100 Index";
  const rankedMarkets = useMemo(() => {
    const signalMap = new Map(marketSignals.map((signal) => [signal.symbol, signal]));
    return markets.map(([value, label]) => {
      const signal = signalMap.get(value);
      const outcomes = signal?.digit_outcomes?.filter((outcome) => outcome.digit > 0 && outcome.digit < 9) ?? [];
      const score = signal
        ? overThreeSniper
          ? Number(outcomes.find((outcome) => outcome.digit === 3)?.over_percentage ?? 0)
          : Math.max(...outcomes.flatMap((outcome) => [
            Number(outcome.over_percentage),
            Number(outcome.under_percentage),
          ]), 0)
        : 0;
      return { value, label, score };
    }).sort((left, right) => right.score - left.score || left.label.localeCompare(right.label));
  }, [bestPairAnalyzer, marketSignals, markets, overThreeSniper]);
  const quoteText = quote == null ? "—" : Number.isInteger(quote) ? String(quote) : quote.toFixed(2);
  const payoutText = payoutPercent == null || !Number.isFinite(payoutPercent) ? "waiting" : `${payoutPercent.toFixed(1)}%`;
  const currency = currentAccount?.currency ?? "USD";

  const applyPreset = (value: string) => {
    setPreset(value);
    setPresetOpen(false);
    const settings = presetSettings[value];
    if (!settings) return;
    onStrategyChange(settings.strategy);
    onDurationChange(settings.duration);
    onStakeChange(settings.stake);
    onMartingaleChange(settings.martingale);
    onBarrierChange(settings.barrier);
    onDirectionChange(settings.direction);
    onTakeProfitChange(settings.takeProfit);
    onStopLossChange(settings.stopLoss);
    setMaxStake(settings.maxStake);
  };

  return (
    <section className="edge-reference-layout">
      <section className="edge-ref-card edge-ref-scanner">
        <div className="edge-ref-heading">
          <div className="edge-ref-title"><span className="edge-ref-spark" aria-hidden="true" /><b>Barrier Scanner</b><span className="edge-ref-premium">PREMIUM</span></div>
          <span className="edge-ref-live"><i /> LIVE</span>
        </div>
        <div className="edge-ref-rule" />
        <div className="edge-ref-best">
          <div className="edge-ref-best-barrier">{bestDirection} {bestBarrier}</div>
          <div className="edge-ref-best-copy"><span>BEST BARRIER TO TRADE NOW</span><p><strong>{bestRate.toFixed(1)}% win</strong><em>·</em> payout {payoutText} <em>·</em> {bestMarket}</p></div>
        </div>
      </section>

      <section className={`edge-ref-card edge-ref-market ${marketPickerOpen ? "open" : ""}`}>
        <button type="button" className="edge-ref-market-trigger" onClick={() => setMarketPickerOpen((open) => !open)} aria-expanded={marketPickerOpen} disabled={!isConnected}>
          <span className="edge-ref-market-icon" aria-hidden="true" />
          <span className="edge-ref-market-copy"><small>Market {autoMarketEnabled ? "(auto-selected)" : "(manual)"}</small><b>{marketLabel}</b></span>
          <ChevronDown size={18} className="edge-ref-market-chevron" />
        </button>
        <p>{marketPickerOpen ? "Choose a market or let the scanner pick the strongest pair." : "Choose Over or Under — the best-performing pair is picked automatically."}</p>
        {marketPickerOpen && (
          <div className="edge-ref-market-menu">
            <button type="button" className={`edge-ref-market-option edge-ref-market-smart ${autoMarketEnabled ? "selected" : ""}`} onClick={() => setMarketPickerOpen(false)}>
              <span>ϟ Auto-select best (smart)</span><b>{autoMarketEnabled ? "✓" : ""}</b>
            </button>
            {rankedMarkets.map((option, index) => (
              <button type="button" className={`edge-ref-market-option ${!autoMarketEnabled && symbol === option.value ? "selected" : ""}`} key={option.value} onClick={() => { if (autoMarketEnabled) return; onSymbolChange(option.value); setMarketPickerOpen(false); }} disabled={running || autoMarketEnabled}>
                <span><b>{option.label}</b>{index === 0 && <small>BEST</small>}<em>observed {option.score ? `${option.score.toFixed(0)}%` : "waiting"} · {option.value}</em></span>
                <strong>{option.score ? `${option.score.toFixed(1)}%` : "—"}</strong>
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="edge-ref-feature-list">
          <div className={`edge-ref-feature ${overThreeSniper ? "active" : ""}`}>
          <div className="edge-ref-feature-main"><span><i aria-hidden="true" /> Over 3 Sniper</span><EdgeToggle checked={overThreeSniper} onChange={onOverThreeSniperChange} disabled={false} label="Over 3 Sniper" /></div>
          {overThreeSniper && <small className="edge-ref-feature-status">{scannerMessage ?? "Hunting all Volatility and Jump pairs for the best observed Over 3 signal…"}</small>}
        </div>
        <div className={`edge-ref-feature ${bestPairAnalyzer ? "active" : ""}`}>
          <div className="edge-ref-feature-main"><span><i aria-hidden="true" /> Best Pair Analyzer</span><EdgeToggle checked={bestPairAnalyzer} onChange={onBestPairAnalyzerChange} disabled={false} label="Best Pair Analyzer" /></div>
          {bestPairAnalyzer && <small className="edge-ref-feature-status">{scannerMessage ?? "Hunting all Volatility and Jump pairs for the best observed Over or Under digit…"}</small>}
        </div>
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

      <section className={`edge-ref-card edge-ref-outcome ${outcomeSynced ? "active" : ""}`}>
        <div className="edge-ref-advanced-head"><div><span className="edge-ref-field-label">Expected outcome</span><h2>Balance target</h2></div><span className={`edge-ref-sync-badge ${outcomeSynced ? "synced" : ""}`}>{outcomeSynced ? "SYNCED" : "NOT SYNCED"}</span></div>
        <div className="edge-ref-outcome-grid">
          <label><span>RISK BALANCE</span><input type="number" min="0" step=".01" value={riskBalance} onChange={(event) => onRiskBalanceChange(event.target.value)} placeholder="0.00" disabled={running} /></label>
          <label><span>ACCOUNT BALANCE</span><input type="number" min="0" step=".01" value={accountBalance} onChange={(event) => onAccountBalanceChange(event.target.value)} placeholder="0.00" disabled={running} /></label>
          <div className="edge-ref-multiple-balance">
            <button type="button" className={`edge-ref-multiple-button ${multipleBalanceOpen ? "selected" : ""}`} onClick={() => setMultipleBalanceOpen((open) => !open)} disabled={running}>Multiple balance</button>
            {multipleBalanceOpen && <label><span>MULTIPLIER</span><input type="number" min="1" step=".1" value={outcomeMultiplier} onChange={(event) => onOutcomeMultiplierChange(event.target.value)} placeholder="1.0" disabled={running} /></label>}
          </div>
        </div>
        <div className="edge-ref-outcome-actions">
          <button type="button" className={`edge-ref-sync-button ${outcomeSynced ? "selected" : ""}`} onClick={() => onOutcomeSyncedChange(!outcomeSynced)} disabled={running || !riskBalance || !accountBalance || !outcomeMultiplier || Number(outcomeMultiplier) < 1}>{outcomeSynced ? "Unsync balances" : "Sync balances"}</button>
          <span>{outcomeSynced && riskBalance && outcomeMultiplier ? `Target: ${(Number(riskBalance) * Number(outcomeMultiplier)).toFixed(2)} · entries stay within the risk balance.` : "Enter both balances before starting an EDGE session."}</span>
        </div>
      </section>

      <label className="edge-ref-input-card"><span>Duration</span><div><input type="number" min="1" max="5" value={duration} onChange={(event) => onDurationChange(Math.min(5, Math.max(1, Number(event.target.value) || 1)))} disabled={running} /><b>ticks</b></div></label>
      <label className="edge-ref-input-card"><span>Initial stake</span><div><input type="number" min=".35" step=".01" value={stake} onChange={(event) => onStakeChange(Math.max(.35, Number(event.target.value) || .35))} disabled={running} /><b>{currency}</b></div></label>

      <section className="edge-ref-card edge-ref-setup"><h2>Strategy parameters</h2>
        <label><span>Strategy</span><div><select value={strategy} onChange={(event) => onStrategyChange(event.target.value as EdgeStrategy)} disabled={running}><option value="martingale">Martingale</option><option value="flat">Flat stake</option></select><ChevronDown size={16} /></div></label>
        <label><span>Stake multiplier</span><div><input type="number" min="1" max="10" step=".1" value={martingale} onChange={(event) => onMartingaleChange(Number(event.target.value))} disabled={running || strategy === "flat"} /><b>x</b></div></label>
        <label><span>Max. stake</span><input value={maxStake} onChange={(event) => setMaxStake(event.target.value)} disabled={running} /></label>
        <p className="edge-ref-callout"><b>Balance guard</b> — no max stake needed. Built-in 50%-of-balance protection keeps the plan resilient through <b>22+</b> losses in a row.</p>
      </section>

      <section className="edge-ref-card edge-ref-risk"><h2>Risk management</h2>
        <label><span>Profit threshold</span><div><input type="number" min=".01" step=".01" value={takeProfit} onChange={(event) => onTakeProfitChange(Math.max(.01, Number(event.target.value) || .01))} disabled={running} /><b>USD</b></div></label>
        <label><span>Loss threshold</span><div><input type="number" min=".01" step=".01" value={stopLoss} onChange={(event) => onStopLossChange(Math.max(.01, Number(event.target.value) || .01))} disabled={running} /><b>USD</b></div></label>
        <p className="edge-ref-callout danger"><b>Wipeout radar</b> — <b>22</b> losses in a row would exhaust your balance.</p>
      </section>

      {isReal && <label className="xt-live-warning"><ShieldAlert size={18} /><input type="checkbox" checked={liveConfirmed} onChange={(event) => onLiveConfirm(event.target.checked)} /><span><b>Live funds confirmation</b>I understand EDGE will place real-money contracts.</span></label>}

      <section className="edge-ref-session"><div><span>Current Stake</span><b>${(strategy === "martingale" ? nextStake : stake).toFixed(2)}</b></div><div><span>Session P/L</span><b className={sessionPnl < 0 ? "loss" : ""}>{sessionPnl >= 0 ? "+" : ""}{sessionPnl.toFixed(2)}</b></div><div><span>Trades</span><b>{sessionTrades}</b></div><p>Runtime stop</p></section>

      <div className="edge-ref-run-row"><button className={`edge-ref-run ${running ? "running" : ""}`} onClick={() => void (running ? onStop() : onStart())} disabled={!isConnected || (!running && !canTrade)}>{running ? <><Pause size={16} fill="currentColor" /> Stop</> : <><Play size={15} fill="currentColor" /> Run</>}</button><button type="button" className="edge-ref-session-reset" onClick={onReset} aria-label="Reset session P/L, trades, and stake to base" title="Reset session"><span aria-hidden="true" /></button></div>

      {canViewHistory && <section className="edge-ref-history"><div className="edge-ref-history-heading"><h2>Recent Trades</h2><button onClick={() => void onClearHistory()} disabled={historyFading || !recentTrades.length}><Trash2 size={15} /></button></div>{!recentTrades.length ? <div className="edge-ref-empty">No trades yet. Configure and press Run.</div> : recentTrades.slice(0, 12).map((trade) => {
        const settled = trade.status !== "open";
        return <div className={`xt-trade ${historyFading ? "fading" : ""}`} key={trade.contract_id}><span><b>{trade.contract_type.replace("DIGIT", "")}</b><small>{trade.symbol} · {trade.account_type}{trade.barrier == null ? "" : ` · barrier ${trade.barrier}`}</small></span><span><small>BUY</small>{trade.buy_price.toFixed(2)}</span><span><small>STATUS</small>{trade.status}</span><strong className={settled && trade.profit < 0 ? "loss" : ""}>{settled ? `${trade.profit >= 0 ? "+" : ""}${trade.profit.toFixed(2)}` : "—"}</strong></div>;
      })}</section>}

      <section className="edge-ref-disclaimer"><b>RISK DISCLAIMER</b><p>Deriv offers complex derivatives, such as options and contracts for difference (“CFDs”). These products may not be suitable for all clients, and trading them puts you at risk. Please make sure that you understand the following risks before trading Deriv products: a) you may lose some or all of the money you invest in the trade, b) if your trade involves currency conversion, exchange rates will affect your profit or loss.</p></section>
    </section>
  );
}