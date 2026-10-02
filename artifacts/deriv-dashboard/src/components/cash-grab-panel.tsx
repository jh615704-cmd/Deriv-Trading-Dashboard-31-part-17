import { useState } from "react";
import {
  Activity,
  BookOpen,
  ChevronDown,
  Loader2,
  Play,
  ShieldAlert,
  ShieldCheck,
  Square,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import DerivHistory, { type DerivHistoryRow } from "./deriv-history";
import "./cash-grab-panel.css";

export type CashGrabContractFamily = "rise-fall";
export type CashGrabDirection = "CALL" | "PUT";
export type CashGrabDuration = 1 | 2 | 3 | 4 | 5;
export type CashGrabAiStatus = "off" | "ready" | "watching" | "quiet" | "blocked";

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
  tradeLimit: number;
  duration: CashGrabDuration;
  syncBalance: boolean;
  balancePercentage: number;
  multiplier: number | null;
  autoSelectBest: boolean;
  autoSwitchSafestPair: boolean;
  jdyAi2: boolean;
  jdyAi3: boolean;
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
  tradeLimit: number;
  duration: CashGrabDuration;
  syncBalance: boolean;
  accountBalance?: number | null;
  currency?: string;
  balancePercentage: number;
  multiplier: number | null;
  jdyAi2: boolean;
  jdyAi2Status?: CashGrabAiStatus;
  jdyAi3: boolean;
  jdyAi3Available: boolean;
  jdyAi3Status?: CashGrabAiStatus;
  autoSwitchSafestPair: boolean;
  autoSwitchSafestPairStatus?: CashGrabAiStatus;
  autoSwitchSafestPairRecommendation?: {
    symbol: string;
    multiplier: number;
    observedWinRate: number;
    nextStake: number;
  } | null;
  running: boolean;
  stopping?: boolean;
  isConnected: boolean;
  isReal: boolean;
  liveConfirmed: boolean;
  isPlacingTrade: boolean;
  recentTrades: readonly CashGrabTrade[];
  sessionPnl: number;
  tradeCount: number;
  clearArmed: boolean;
  historyFading: boolean;
  onDirectionChange: (direction: CashGrabDirection) => void;
  onSymbolChange: (symbol: string) => void;
  onAutoSelectBestChange: (enabled: boolean) => void;
  onAutoSwitchSafestPairChange: (enabled: boolean) => void;
  onStakeChange: (stake: number) => void;
  onTradeLimitChange: (count: number) => void;
  onDurationChange: (duration: CashGrabDuration) => void;
  onSyncBalanceChange: (enabled: boolean) => void;
  onBalancePercentageChange: (percentage: number) => void;
  onMultiplierChange: (multiplier: number | null) => void;
  onJdyAi2Change: (enabled: boolean) => void;
  onJdyAi3Change: (enabled: boolean) => void;
  onLiveConfirmChange: (confirmed: boolean) => void;
  onMoneyStart: (config: CashGrabStartConfig) => void;
  onMoneyStop: () => void;
  onClearHistory: () => void;
  onOpenGuide: () => void;
}

const minimumStake = 0.35;
const durations: readonly CashGrabDuration[] = [1, 2, 3, 4, 5];
const contractCounts = [1, 2, 3, 4, 5, 6];

const formatMoney = (value: number, currency: string) =>
  `${currency === "USD" ? "$" : `${currency} `}${value.toFixed(2)}`;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

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
  tradeLimit,
  duration,
  syncBalance,
  accountBalance = null,
  currency = "USD",
  balancePercentage,
  multiplier,
  jdyAi2,
  jdyAi2Status = "off",
  jdyAi3,
  jdyAi3Available,
  jdyAi3Status = "off",
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
  sessionPnl,
  tradeCount,
  clearArmed,
  historyFading,
  onDirectionChange,
  onSymbolChange,
  onAutoSelectBestChange,
  onAutoSwitchSafestPairChange,
  onStakeChange,
  onTradeLimitChange,
  onDurationChange,
  onSyncBalanceChange,
  onBalancePercentageChange,
  onMultiplierChange,
  onJdyAi2Change,
  onJdyAi3Change,
  onLiveConfirmChange,
  onMoneyStart,
  onMoneyStop,
  onClearHistory,
  onOpenGuide,
}: CashGrabPanelProps) {
  const [marketMenuOpen, setMarketMenuOpen] = useState(false);
  const interactionDisabled = running || isPlacingTrade;
  const canStart = isConnected && (!isReal || liveConfirmed) && !isPlacingTrade && !stopping;
  const visibleBalancePercentage = Math.max(0.5, balancePercentage);
  const syncedStake = accountBalance == null
    ? null
    : Math.max(minimumStake, accountBalance * visibleBalancePercentage / 100);
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
  const startStake = syncBalance && syncedStake != null
    ? syncedStake
    : Math.max(minimumStake, stake);

  const submitStart = () => {
    if (!canStart) return;
    onMoneyStart({
      contractFamily: "rise-fall",
      direction,
      symbol,
      stake: startStake,
      tradeLimit: clamp(Math.trunc(tradeLimit), 1, 6),
      duration,
      syncBalance,
      balancePercentage: visibleBalancePercentage,
      multiplier: multiplier == null ? null : Math.max(0.5, multiplier),
      autoSelectBest,
      autoSwitchSafestPair,
      jdyAi2,
      jdyAi3: jdyAi3Available && jdyAi3,
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
              {autoSwitchSafestPairRecommendation.symbol} · {autoSwitchSafestPairRecommendation.observedWinRate.toFixed(1)}% observed · {autoSwitchSafestPairRecommendation.multiplier}× · {formatMoney(autoSwitchSafestPairRecommendation.nextStake, currency)}
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
              disabled={interactionDisabled || syncBalance}
              aria-label={`Cash Grab stake in ${currency}`}
              data-testid="input-cash-grab-stake"
            />
          </label>
          <label>
            <span>CONTRACT LIMIT · 1–6</span>
            <select
              value={tradeLimit}
              onChange={(event) => onTradeLimitChange(clamp(Number(event.target.value), 1, 6))}
              disabled={interactionDisabled}
              aria-label="Cash Grab contract limit for this run"
              data-testid="input-cash-grab-count"
            >
              {contractCounts.map((count) => <option key={count} value={count}>{count} {count === 1 ? "contract" : "contracts"}</option>)}
            </select>
            <small className="cash-grab-input-note">One Rise/Fall contract at a time; limit applies to manual runs.</small>
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
        </div>

        <div className="cash-grab-balance-row">
          <label className="df-toggle-control">
            <span className="df-toggle-state">{syncBalance ? "SYNCED" : "FIXED"}</span>
            <span className="df-toggle">
              <input
                type="checkbox"
                checked={syncBalance}
                onChange={(event) => onSyncBalanceChange(event.target.checked)}
                disabled={interactionDisabled}
                aria-label="Sync Cash Grab stake to account balance"
              />
              <i />
            </span>
            <span>SYNC BALANCE</span>
          </label>
          {syncBalance ? (
            <label className="cash-grab-percent-field">
              <span>Balance %</span>
              <input
                type="number"
                min="0.5"
                max="100"
                step="0.5"
                value={visibleBalancePercentage}
                onChange={(event) => onBalancePercentageChange(clamp(Number(event.target.value) || 0.5, 0.5, 100))}
                disabled={interactionDisabled}
                aria-label="Percentage of balance for Cash Grab stake"
              />
              <b>{syncedStake == null ? "Balance unavailable" : `${formatMoney(syncedStake, currency)} per contract`}</b>
            </label>
          ) : (
            <label className="cash-grab-multiplier-field">
              <span>Loss multiplier · optional</span>
              <input
                type="number"
                min="0.5"
                step="0.1"
                value={multiplier ?? ""}
                placeholder="Flat stake"
                onChange={(event) => onMultiplierChange(event.target.value === "" ? null : Math.max(0.5, Number(event.target.value) || 0.5))}
                disabled={interactionDisabled}
                aria-label="Cash Grab stake multiplier after a loss"
                data-testid="input-cash-grab-multiplier"
              />
            </label>
          )}
        </div>

        <div className="df-session-strip">
          <span><small>ACCOUNT BALANCE</small><b>{accountBalance == null ? "—" : formatMoney(accountBalance, currency)}</b></span>
          <span><small>SESSION P/L</small><b className={sessionPnl < 0 ? "loss" : ""}>{formatMoney(sessionPnl, currency)}</b></span>
          <span><small>CONTRACTS SENT</small><b>{tradeCount}</b></span>
        </div>

        <div className="cash-grab-guard-grid">
          <label className={`df-toggle-card cash-grab-guard ${jdyAi2 ? "active" : ""}`}>
            <span className="df-toggle-copy"><span className="df-section-label"><ShieldCheck size={12} /> SHADOWS 2 · {statusLabel(jdyAi2Status)}</span><p>Hold entries that fail the current sample and direction check.</p></span>
            <span className="df-toggle"><input type="checkbox" checked={jdyAi2} onChange={(event) => onJdyAi2Change(event.target.checked)} disabled={!isConnected || interactionDisabled} aria-label="Enable Shadows 2 safety gate" /><i /></span>
          </label>
          {jdyAi3Available && (
            <label className={`df-toggle-card cash-grab-guard ${jdyAi3 ? "active" : ""}`}>
              <span className="df-toggle-copy"><span className="df-section-label"><ShieldAlert size={12} /> SHADOWS 3 · {statusLabel(jdyAi3Status)}</span><p>Use the additional pre-entry gate for this Rise/Fall setup.</p></span>
              <span className="df-toggle"><input type="checkbox" checked={jdyAi3} onChange={(event) => onJdyAi3Change(event.target.checked)} disabled={!isConnected || interactionDisabled} aria-label="Enable Shadows 3 safety gate" /><i /></span>
            </label>
          )}
        </div>

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
              {isPlacingTrade ? "PLACING…" : "RUN CASH GRAB"}
            </button>
          )}
          <button type="button" className="df-guide" onClick={onOpenGuide}><BookOpen size={13} /> Guide</button>
        </div>
        {!isConnected && <p className="cash-grab-status-note">Connect Deriv to place a Rise/Fall contract.</p>}
        {isReal && !liveConfirmed && <p className="cash-grab-status-note">Confirm live funds before starting.</p>}
      </form>

      <div className="cash-grab-history df-card">
        <DerivHistory
          title="Cash Grab History"
          strategy="Cash Grab Rise/Fall"
          rows={recentTrades}
          currency={currency}
          sessionPnl={sessionPnl}
          sessionTradeCount={tradeCount}
          clearArmed={clearArmed}
          fading={historyFading}
          onClear={onClearHistory}
        />
      </div>
    </section>
  );
}