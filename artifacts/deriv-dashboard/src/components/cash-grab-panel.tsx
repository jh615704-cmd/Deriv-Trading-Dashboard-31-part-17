import { useState } from "react";
import {
  Activity,
  BookOpen,
  ChevronDown,
  Loader2,
  Play,
  ShieldAlert,
  Square,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import DerivHistory, { type DerivHistoryRow } from "./deriv-history";
import "./cash-grab-panel.css";

export type CashGrabContractFamily = "rise-fall";
export type CashGrabDirection = "CALL" | "PUT";
export type CashGrabDuration = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type CashGrabAiStatus = "off" | "ready" | "watching" | "quiet" | "blocked";
export type CashGrabStakeMode = "flat" | "multiply";

export interface CashGrabSymbolOption {
  value: string;
  label: string;
}

export interface CashGrabMarketSignal {
  symbol: string;
  risePercentage: number;
  fallPercentage: number;
  sampleCount: number;
}

export type CashGrabTrade = DerivHistoryRow & { account_type: string };

export interface CashGrabStartConfig {
  contractFamily: "rise-fall";
  direction: CashGrabDirection;
  symbol: string;
  stake: number;
  duration: CashGrabDuration;
  stakeMode: CashGrabStakeMode;
  multiplier: number;
  autoSelectBest: boolean;
  autoSwitchSafestPair: boolean;
}

export interface CashGrabPanelProps {
  direction: CashGrabDirection;
  symbol: string;
  bestSymbol?: string | null;
  autoSelectBest: boolean;
  symbols: readonly CashGrabSymbolOption[];
  marketSignals: readonly CashGrabMarketSignal[];
  quote?: number | null;
  stake: number;
  duration: CashGrabDuration;
  stakeMode: CashGrabStakeMode;
  currency?: string;
  multiplier: number;
  autoSwitchSafestPair: boolean;
  autoSwitchSafestPairStatus?: CashGrabAiStatus;
  autoSwitchSafestPairRecommendation?: {
    symbol: string;
    observedWinRate: number;
    sampleCount: number;
  } | null;
  running: boolean;
  stopping?: boolean;
  isConnected: boolean;
  isReal: boolean;
  liveConfirmed: boolean;
  isPlacingTrade: boolean;
  recentTrades: readonly CashGrabTrade[];
  clearArmed: boolean;
  historyFading: boolean;
  onDirectionChange: (direction: CashGrabDirection) => void;
  onSymbolChange: (symbol: string) => void;
  onAutoSelectBestChange: (enabled: boolean) => void;
  onAutoSwitchSafestPairChange: (enabled: boolean) => void;
  onStakeChange: (stake: number) => void;
  onDurationChange: (duration: CashGrabDuration) => void;
  onStakeModeChange: (mode: CashGrabStakeMode) => void;
  onMultiplierChange: (multiplier: number) => void;
  onLiveConfirmChange: (confirmed: boolean) => void;
  onMoneyStart: (config: CashGrabStartConfig) => void;
  onMoneyStop: () => void;
  onClearHistory: () => void;
  onOpenGuide: () => void;
}

const minimumStake = 0.35;
const durations: readonly CashGrabDuration[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const statusLabel = (status: CashGrabAiStatus = "off") => ({
  off: "OFF",
  ready: "READY",
  watching: "SCANNING",
  quiet: "WAITING",
  blocked: "PAUSED",
})[status];

export default function CashGrabPanel({
  direction,
  symbol,
  bestSymbol = null,
  autoSelectBest,
  symbols,
  marketSignals,
  quote = null,
  stake,
  duration,
  stakeMode,
  currency = "USD",
  multiplier,
  autoSwitchSafestPair,
  autoSwitchSafestPairStatus = "off",
  autoSwitchSafestPairRecommendation = null,
  running,
  stopping = false,
  isConnected,
  isReal,
  liveConfirmed,
  isPlacingTrade,
  recentTrades,
  clearArmed,
  historyFading,
  onDirectionChange,
  onSymbolChange,
  onAutoSelectBestChange,
  onAutoSwitchSafestPairChange,
  onStakeChange,
  onDurationChange,
  onStakeModeChange,
  onMultiplierChange,
  onLiveConfirmChange,
  onMoneyStart,
  onMoneyStop,
  onClearHistory,
  onOpenGuide,
}: CashGrabPanelProps) {
  const [marketMenuOpen, setMarketMenuOpen] = useState(false);
  const interactionDisabled = running || isPlacingTrade;
  const canStart = isConnected && (!isReal || liveConfirmed) && !isPlacingTrade && !stopping;
  const selectedSymbol = symbols.find((item) => item.value === symbol);
  const selectedSignal = marketSignals.find((item) => item.symbol === symbol);
  const liveRate = selectedSignal
    ? direction === "CALL" ? selectedSignal.risePercentage : selectedSignal.fallPercentage
    : 0;
  const riseRate = selectedSignal?.risePercentage ?? 0;
  const fallRate = selectedSignal?.fallPercentage ?? 0;
  const rateTotal = riseRate + fallRate;
  const riseWidth = rateTotal > 0 ? riseRate / rateTotal * 100 : 50;
  const bestMarketLabel = symbols.find((item) => item.value === bestSymbol)?.label ?? bestSymbol;

  const submitStart = () => {
    if (!canStart) return;
    onMoneyStart({
      contractFamily: "rise-fall",
      direction,
      symbol,
      stake: Math.max(minimumStake, stake),
      duration,
      stakeMode,
      multiplier: Math.max(0.01, multiplier),
      autoSelectBest,
      autoSwitchSafestPair,
    });
  };

  const chooseSymbol = (nextSymbol: string) => {
    onAutoSelectBestChange(false);
    onSymbolChange(nextSymbol);
    setMarketMenuOpen(false);
  };

  return (
    <section className="df-panel cash-grab-df-panel" aria-label="Cash Grab Rise/Fall trading panel" data-testid="cash-grab-panel">
      <header className="df-card df-scanner">
        <div className="df-card-heading">
          <div className="df-title">
            <span className="df-spark"><Activity size={15} /></span>
            <b>Cash Grab · Rise/Fall</b>
            <span className="df-premium">CALL / PUT ONLY</span>
          </div>
          <span className="df-live"><i />{running ? "RUNNING" : isConnected ? "CONNECTED" : "OFFLINE"}</span>
        </div>
        <div className="df-rule" />
        <div className="df-best-signal">
          <div className={`df-best-parity ${direction === "CALL" ? "rise" : "fall"}`}>
            {direction === "CALL" ? "RISE" : "FALL"}
            <span>{direction === "CALL" ? "↗" : "↘"}</span>
          </div>
          <div className="df-best-copy">
            <span>Selected direction · {selectedSymbol?.value ?? symbol}</span>
            <p>
              Observed rate <strong>{liveRate.toFixed(1)}%</strong>
              <em>·</em>
              {selectedSignal?.sampleCount ?? 0} sampled moves
              {bestSymbol ? <><em>·</em>best pair <strong>{bestSymbol}</strong></> : null}
            </p>
          </div>
        </div>
      </header>

      <div className={`df-card df-toggle-card df-pair-card ${autoSwitchSafestPair ? "active" : ""}`}>
        <div className="df-toggle-copy">
          <span className="df-section-label">AUTO-SWITCH SAFEGUARD</span>
          <p>Scan live Rise/Fall samples and switch markets only when the balance and sample checks pass.</p>
          {autoSwitchSafestPairRecommendation && (
            <p className="df-running-note">
              <i />
              {autoSwitchSafestPairRecommendation.symbol} · {autoSwitchSafestPairRecommendation.observedWinRate.toFixed(1)}% observed · {autoSwitchSafestPairRecommendation.sampleCount} sampled moves
            </p>
          )}
        </div>
        <label className="df-toggle-control">
          <span className="df-toggle-state">{statusLabel(autoSwitchSafestPairStatus)}</span>
          <span className="df-toggle">
            <input
              type="checkbox"
              checked={autoSwitchSafestPair}
              onChange={(event) => onAutoSwitchSafestPairChange(event.target.checked)}
              disabled={!isConnected || stopping}
              aria-label="Auto-switch Cash Grab to guarded Rise/Fall markets"
            />
            <i />
          </span>
        </label>
      </div>

      <section className={`df-card df-market-card ${marketMenuOpen ? "open" : ""}`}>
        <button
          type="button"
          className="df-market-trigger"
          onClick={() => setMarketMenuOpen((open) => !open)}
          disabled={!isConnected || interactionDisabled}
          aria-expanded={marketMenuOpen}
          aria-label="Select Cash Grab market"
        >
          <span className="df-market-icon">⌁</span>
          <span className="df-market-copy">
            <small>ACTIVE MARKET · {autoSelectBest ? "AUTO BEST" : "MANUAL"}</small>
            <b>{selectedSymbol?.label ?? symbol} · {symbol}</b>
          </span>
          <ChevronDown className="df-market-chevron" size={16} />
        </button>
        <p className="df-market-note">
          {autoSelectBest
            ? `Using the strongest observed ${direction === "CALL" ? "Rise" : "Fall"} rate${bestMarketLabel ? ` · ${bestMarketLabel}` : ""}.`
            : "Choose a supported Volatility or Jump market for this Rise/Fall entry."}
        </p>
        {marketMenuOpen && (
          <div className="df-market-menu" role="listbox" aria-label="Cash Grab markets">
            <button
              type="button"
              className={`df-market-option df-market-smart ${autoSelectBest ? "selected" : ""}`}
              onClick={() => { onAutoSelectBestChange(true); setMarketMenuOpen(false); }}
              disabled={!bestSymbol || autoSwitchSafestPair}
              aria-disabled={!bestSymbol || autoSwitchSafestPair}
            >
              <span><small>{autoSwitchSafestPair ? "AUTO-SWITCH ACTIVE" : "AUTO BEST"}</small><b>{bestMarketLabel ?? "Waiting for market samples"}</b></span>
              <strong>{autoSwitchSafestPair ? "ON" : bestSymbol ?? "—"}</strong>
            </button>
            {symbols.map((item) => {
              const signal = marketSignals.find((entry) => entry.symbol === item.value);
              const rate = direction === "CALL" ? signal?.risePercentage ?? 0 : signal?.fallPercentage ?? 0;
              return (
                <button
                  type="button"
                  key={item.value}
                  className={`df-market-option ${!autoSelectBest && symbol === item.value ? "selected" : ""}`}
                  onClick={() => chooseSymbol(item.value)}
                  role="option"
                  aria-selected={!autoSelectBest && symbol === item.value}
                >
                  <span><b>{item.label}</b><em>{item.value} · {signal?.sampleCount ?? 0} moves</em></span>
                  <strong>{rate.toFixed(1)}%</strong>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="df-card df-quote-card" aria-live="polite">
        <div className="df-quote-value">
          {quote == null ? "—" : quote.toLocaleString(undefined, { maximumFractionDigits: 4 })}
          <small>{currency}</small>
        </div>
        <div className="df-quote-run">
          {isConnected ? `${selectedSymbol?.label ?? symbol} · live quote` : "Connect Deriv to receive a live quote"}
        </div>
      </section>

      <div className="df-card df-parity-toggle" role="group" aria-label="Choose Rise or Fall">
        <button
          type="button"
          className={`rise ${direction === "CALL" ? "selected" : ""}`}
          onClick={() => onDirectionChange("CALL")}
          disabled={interactionDisabled}
          aria-pressed={direction === "CALL"}
          data-testid="button-cash-grab-rise"
        >
          <TrendingUp size={16} /> Rise
        </button>
        <button
          type="button"
          className={`fall ${direction === "PUT" ? "selected" : ""}`}
          onClick={() => onDirectionChange("PUT")}
          disabled={interactionDisabled}
          aria-pressed={direction === "PUT"}
          data-testid="button-cash-grab-fall"
        >
          <TrendingDown size={16} /> Fall
        </button>
      </div>

      <section className="df-card df-parity-card">
        <span className="df-section-label">LIVE DIRECTION SAMPLE · {selectedSymbol?.value ?? symbol}</span>
        <div className="df-parity-track" aria-label={`Rise ${riseRate.toFixed(1)} percent, Fall ${fallRate.toFixed(1)} percent`}>
          <i className="rise" style={{ width: `${riseWidth}%` }} />
          <i className="fall" style={{ width: `${100 - riseWidth}%` }} />
        </div>
        <div className="df-parity-labels">
          <span>RISE <b>{riseRate.toFixed(1)}%</b></span>
          <span>FALL <b>{fallRate.toFixed(1)}%</b></span>
        </div>
        <p className="df-market-note">{selectedSignal?.sampleCount ?? 0} observed moves. Rates describe the sample only; they do not predict expiry.</p>
      </section>

      <form className="df-card df-advanced-card" onSubmit={(event) => { event.preventDefault(); submitStart(); }}>
        <div className="df-advanced-head">
          <div><span className="df-section-label">RISE/FALL CONTRACT</span><h3>Trade setup</h3></div>
          <button type="button" className="df-refresh" onClick={onOpenGuide}><BookOpen size={13} /> Guide</button>
        </div>
        <div className="df-setup-grid">
          <label>
            <span>STAKE · MIN {minimumStake.toFixed(2)}</span>
            <input
              type="number"
              min={minimumStake}
              step="0.01"
              value={stake}
              onChange={(event) => onStakeChange(Math.max(minimumStake, Number(event.target.value) || minimumStake))}
              disabled={interactionDisabled}
              aria-label={`Cash Grab stake in ${currency}`}
              data-testid="input-cash-grab-stake"
            />
          </label>
          <label>
            <span>DURATION · TICKS</span>
            <select
              value={duration}
              onChange={(event) => onDurationChange(Number(event.target.value) as CashGrabDuration)}
              disabled={interactionDisabled}
              aria-label="Cash Grab duration in ticks"
            >
              {durations.map((ticks) => <option key={ticks} value={ticks}>{ticks} {ticks === 1 ? "tick" : "ticks"}</option>)}
            </select>
          </label>
          <label>
            <span>STAKE MODE</span>
            <select
              value={stakeMode}
              onChange={(event) => onStakeModeChange(event.target.value as CashGrabStakeMode)}
              disabled={interactionDisabled}
              aria-label="Cash Grab stake mode"
            >
              <option value="flat">Flat</option>
              <option value="multiply">Multiply after loss</option>
            </select>
          </label>
        </div>

        {stakeMode === "multiply" && (
          <label className="cash-grab-multiplier-field">
            <span>MULTIPLIER AFTER A LOSS</span>
            <input
              type="number"
              min="0.01"
              step="any"
              value={multiplier}
              onChange={(event) => onMultiplierChange(Math.max(0.01, Number(event.target.value) || 0.01))}
              disabled={interactionDisabled}
              aria-label="Cash Grab stake multiplier after a loss"
              data-testid="input-cash-grab-multiplier"
            />
            <small>Flat stake returns after a win. No maximum is set for the multiplier.</small>
          </label>
        )}

        {isReal && (
          <label className="cash-grab-live-confirm">
            <input type="checkbox" checked={liveConfirmed} onChange={(event) => onLiveConfirmChange(event.target.checked)} disabled={running || isPlacingTrade} aria-label="Confirm real money trading" />
            <span><b><ShieldAlert size={14} /> Confirm live funds</b><small>Trades use the selected real Deriv account.</small></span>
          </label>
        )}

        <div className="df-action-row">
          {running || stopping ? (
            <button type="button" className="df-stop" onClick={onMoneyStop} disabled={stopping} data-testid="button-cash-grab-stop">
              {stopping ? <Loader2 size={14} className="cash-grab-spin" /> : <Square size={13} fill="currentColor" />}
              {stopping ? "STOPPING…" : "STOP CASH GRAB"}
            </button>
          ) : (
            <button type="submit" className="df-run" disabled={!canStart || (isReal && !liveConfirmed)} data-testid="button-cash-grab-start">
              {isPlacingTrade ? <Loader2 size={14} className="cash-grab-spin" /> : <Play size={14} fill="currentColor" />}
              {isPlacingTrade ? "PLACING…" : "START CASH GRAB"}
            </button>
          )}
          <button type="button" className="df-guide" onClick={onOpenGuide}><BookOpen size={13} /> Guide</button>
        </div>
        {!isConnected && <p className="cash-grab-status-note">Connect Deriv to place a Rise/Fall contract.</p>}
        {isReal && !liveConfirmed && <p className="cash-grab-status-note">Confirm live funds before starting.</p>}
        <p className="cash-grab-status-note">Cash Grab runs one contract at a time until stopped. The account balance is checked before each entry.</p>
      </form>

      <div className="cash-grab-history df-card">
        <DerivHistory
          title="Cash Grab History"
          strategy="Cash Grab Rise/Fall"
          rows={recentTrades}
          currency={currency}
          hideSummary
          clearArmed={clearArmed}
          fading={historyFading}
          onClear={onClearHistory}
        />
      </div>
    </section>
  );
}