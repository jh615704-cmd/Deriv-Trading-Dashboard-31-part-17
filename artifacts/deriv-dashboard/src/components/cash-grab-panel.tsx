import {
  Activity,
  ChevronDown,
  CircleCheck,
  Info,
  Play,
  ShieldCheck,
  Square,
  Trash2,
  Wallet,
  Wifi,
} from "lucide-react";
import "./cash-grab-panel.css";

export type CashGrabContractFamily = "even-odd" | "rise-fall" | "differs" | "accumulator";
export type CashGrabDuration = 1 | 2 | 3 | 4 | 5;
export type CashGrabAiStatus = "off" | "ready" | "watching" | "quiet" | "blocked";
export type CashGrabDirection = "DIGITEVEN" | "DIGITODD" | "CALL" | "PUT";

export interface CashGrabSymbolOption {
  value: string;
  label: string;
}

export interface CashGrabDigitObservation {
  digit: number;
  overallPercentage: number;
  marketPercentage: number;
}

export interface CashGrabTrade {
  contract_id: string;
  contract_type: string;
  symbol: string;
  account_type: string;
  buy_price: number;
  profit: number;
  status: string;
  current_value?: number | null;
}

export interface CashGrabStartConfig {
  contractFamily: CashGrabContractFamily;
  direction: CashGrabDirection;
  symbol: string;
  selectedDigit: number;
  stake: number;
  bulkCount: number;
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
  contractFamily: CashGrabContractFamily;
  direction: CashGrabDirection;
  symbol: string;
  bestSymbol?: string | null;
  autoSelectBest: boolean;
  symbols: readonly CashGrabSymbolOption[];
  selectedDigit: number;
  lastDigit?: number | null;
  digitObservations: readonly CashGrabDigitObservation[];
  stake: number;
  bulkCount: number;
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
  isConnected: boolean;
  isReal: boolean;
  liveConfirmed: boolean;
  isPlacingTrade: boolean;
  recentTrades: readonly CashGrabTrade[];
  sessionPnl: number;
  tradeCount: number;
  clearArmed: boolean;
  historyFading: boolean;
  onContractFamilyChange: (family: CashGrabContractFamily) => void;
  onDirectionChange: (direction: CashGrabDirection) => void;
  onSymbolChange: (symbol: string) => void;
  onAutoSelectBestChange: (enabled: boolean) => void;
  onAutoSwitchSafestPairChange: (enabled: boolean) => void;
  onSelectedDigitChange: (digit: number) => void;
  onStakeChange: (stake: number) => void;
  onBulkCountChange: (count: number) => void;
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
}

const contractFamilies: readonly { value: CashGrabContractFamily; label: string; note: string }[] = [
  { value: "even-odd", label: "Even / Odd", note: "digit parity" },
  { value: "rise-fall", label: "Rise / Fall", note: "quote direction" },
  { value: "differs", label: "Differs", note: "digit barrier" },
  { value: "accumulator", label: "Accumulator", note: "steady growth" },
];

const durations: readonly CashGrabDuration[] = [1, 2, 3, 4, 5];
const counts = [1, 2, 3, 4, 5, 6];

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const formatMoney = (value: number, currency: string) =>
  `${currency === "USD" ? "$" : `${currency} `}${value.toFixed(2)}`;

const statusLabel = (status: CashGrabAiStatus, enabled: boolean) => {
  if (!enabled || status === "off") return "OFF";
  if (status === "ready") return "READY";
  if (status === "watching") return "SCANNING";
  if (status === "quiet") return "HOLD";
  if (status === "blocked") return "STOPPED";
  return "ON";
};

const statusDescription = (status: CashGrabAiStatus, enabled: boolean) => {
  if (!enabled || status === "off") return "Parent-controlled gate is off";
  if (status === "ready") return "Idle until MONEY START";
  if (status === "watching") return "Reading the selected market";
  if (status === "quiet") return "Waiting for a calmer entry";
  if (status === "blocked") return "Entry held by the parent guard";
  return "Ready for the next parent decision";
};

function outcomeForTrade(trade: CashGrabTrade) {
  const open = trade.status.toLowerCase() === "open";
  if (open) return { label: "OPEN", tone: "open" };
  if (trade.profit > 0) return { label: "WON", tone: "positive" };
  if (trade.profit < 0) return { label: "LOST", tone: "negative" };
  return { label: "CLOSED", tone: "neutral" };
}

export default function CashGrabPanel({
  contractFamily,
  direction,
  symbol,
  bestSymbol = null,
  autoSelectBest,
  symbols,
  selectedDigit,
  lastDigit = null,
  digitObservations,
  stake,
  bulkCount,
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
  isConnected,
  isReal,
  liveConfirmed,
  isPlacingTrade,
  recentTrades,
  sessionPnl,
  tradeCount,
  clearArmed,
  historyFading,
  onContractFamilyChange,
  onDirectionChange,
  onSymbolChange,
  onAutoSelectBestChange,
  onAutoSwitchSafestPairChange,
  onSelectedDigitChange,
  onStakeChange,
  onBulkCountChange,
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
}: CashGrabPanelProps) {
  const currentDigit = lastDigit == null ? null : clamp(Math.trunc(lastDigit), 0, 9);
  const selectedObservation = digitObservations.find((item) => item.digit === selectedDigit);
  const selectedMarketPercentage = selectedObservation?.marketPercentage ?? 0;
  const selectedOverallPercentage = selectedObservation?.overallPercentage ?? 0;
  const selectedSymbolLabel = symbols.find((item) => item.value === symbol)?.label ?? symbol;
  const visibleBalancePercentage = Math.max(0.5, balancePercentage);
  const syncedStake = accountBalance == null ? null : accountBalance * (visibleBalancePercentage / 100);
  const displayedSessionPnl = sessionPnl >= 0 ? `+${formatMoney(sessionPnl, currency)}` : formatMoney(sessionPnl, currency);
  const canStart = isConnected && (!isReal || liveConfirmed) && !isPlacingTrade;
  const interactionDisabled = running || isPlacingTrade;

  const submitStart = () => {
    if (!canStart) return;
    onMoneyStart({
      contractFamily,
      direction,
      symbol,
      selectedDigit: clamp(Math.trunc(selectedDigit), 0, 9),
      stake: Math.max(0.35, stake),
      bulkCount: Math.max(1, Math.trunc(bulkCount)),
      duration,
      syncBalance,
      balancePercentage: visibleBalancePercentage,
      multiplier: multiplier == null ? null : Math.max(0.5, multiplier),
      autoSelectBest,
      autoSwitchSafestPair,
      jdyAi2,
      jdyAi3,
    });
  };

  return (
    <section className="cash-grab-panel" aria-label="Cash Grab trading panel" data-testid="cash-grab-panel">
      <header className="cash-grab-header">
        <div className="cash-grab-brand">
          <div className="cash-grab-mark" aria-hidden="true"><Activity size={18} /></div>
          <div>
            <div className="cash-grab-title-line">
              <h2>Cash Grab</h2>
              <span>controlled digit entry</span>
            </div>
            <p>AI MONEY PRINTING MACHINE</p>
          </div>
        </div>
        <div className="cash-grab-header-status">
          <span className={`cash-grab-state ${running ? "active" : ""}`}><i />{running ? "RUNNING" : "READY"}</span>
          <span className={`cash-grab-connection ${isConnected ? "connected" : ""}`}><Wifi size={13} />{isConnected ? "CONNECTED" : "OFFLINE"}</span>
        </div>
      </header>

      <form className="cash-grab-form" onSubmit={(event) => { event.preventDefault(); submitStart(); }}>
        <div className="cash-grab-form-heading">
          <div>
            <span className="cash-grab-overline">ONE FAMILY · ONE MARKET · CONTROLLED BATCH</span>
            <h3>Set the contract before sending</h3>
          </div>
          <span className={`cash-grab-account-pill ${isReal ? "real" : ""}`}>{isReal ? "REAL ACCOUNT" : "PRACTICE ACCOUNT"}</span>
        </div>

        <div className="cash-grab-layout">
          <div className="cash-grab-configuration">
            <section className="cash-grab-card cash-grab-market-card">
              <div className="cash-grab-card-heading">
                <div><span className="cash-grab-overline">01 · MARKET</span><h4>Choose the live symbol</h4></div>
                <span className="cash-grab-live-readout"><i />{currentDigit == null ? "waiting" : `last digit ${currentDigit}`}</span>
              </div>
              <label className="cash-grab-select-label">
                <span className="cash-grab-field-label">SYMBOL</span>
                <span className="cash-grab-select-wrap">
                   <select
                     value={autoSelectBest ? "__auto__" : symbol}
                     onChange={(event) => event.target.value === "__auto__"
                       ? onAutoSelectBestChange(true)
                       : (onAutoSelectBestChange(false), onSymbolChange(event.target.value))}
                    disabled={!isConnected || interactionDisabled}
                    aria-label="Select Cash Grab market symbol"
                    data-testid="select-cash-grab-symbol"
                  >
                     <option value="__auto__">{`Auto best · ${bestSymbol ?? "scanning all Volatility and Jump pairs"}`}</option>
                     {!symbols.length && <option value={symbol}>{symbol || "No symbols available"}</option>}
                    {symbols.map((item) => <option value={item.value} key={item.value}>{item.label} · {item.value}</option>)}
                  </select>
                  <ChevronDown size={15} aria-hidden="true" />
                </span>
              </label>
              <div className="cash-grab-market-foot">
                <span>{selectedSymbolLabel}</span>
                <span className={isConnected ? "live" : ""}><i />{isConnected ? "streaming market digits" : "connect Deriv to stream"}</span>
              </div>
            </section>

            <section className="cash-grab-card cash-grab-family-card">
              <div className="cash-grab-card-heading">
                <div><span className="cash-grab-overline">02 · CONTRACT FAMILY</span><h4>Keep the entry explicit</h4></div>
                <ShieldCheck size={17} aria-hidden="true" />
              </div>
              <div className="cash-grab-family-grid" role="group" aria-label="Select contract family">
                {contractFamilies.map((family) => (
                  <button
                    type="button"
                    key={family.value}
                    className={contractFamily === family.value ? "selected" : ""}
                    onClick={() => onContractFamilyChange(family.value)}
                    disabled={interactionDisabled}
                    aria-pressed={contractFamily === family.value}
                    data-testid={`button-cash-grab-family-${family.value}`}
                  >
                    <b>{family.label}</b><small>{family.note}</small>
                  </button>
                ))}
              </div>
              <p className="cash-grab-note"><Info size={14} /> Select one Deriv contract family. Cash Grab does not infer a family or promise an outcome.</p>
               {(contractFamily === "even-odd" || contractFamily === "rise-fall") && (
                 <div className="cash-grab-direction-block">
                   <span className="cash-grab-field-label">{contractFamily === "even-odd" ? "PARITY" : "DIRECTION"}</span>
                   <div className="cash-grab-direction-grid" role="group" aria-label={contractFamily === "even-odd" ? "Select Even or Odd" : "Select Rise or Fall"}>
                     {(contractFamily === "even-odd"
                       ? [{ value: "DIGITEVEN" as const, label: "Even" }, { value: "DIGITODD" as const, label: "Odd" }]
                       : [{ value: "CALL" as const, label: "Rise" }, { value: "PUT" as const, label: "Fall" }]
                     ).map((option) => (
                       <button type="button" key={option.value} className={direction === option.value ? "selected" : ""} onClick={() => onDirectionChange(option.value)} disabled={interactionDisabled} aria-pressed={direction === option.value}>{option.label}</button>
                     ))}
                   </div>
                 </div>
               )}
            </section>

            <section className="cash-grab-card cash-grab-digit-card">
              <div className="cash-grab-card-heading">
                <div><span className="cash-grab-overline">03 · LIVE DIGIT</span><h4>Choose the digit to watch</h4></div>
                <span className="cash-grab-digit-summary"><b>{selectedDigit}</b><small>selected</small></span>
              </div>
              <div className="cash-grab-digit-grid" role="group" aria-label="Select a digit from zero to nine">
                {Array.from({ length: 10 }, (_, digit) => {
                  const observation = digitObservations.find((item) => item.digit === digit);
                  const overall = observation?.overallPercentage ?? 0;
                  const market = observation?.marketPercentage ?? 0;
                  const isCurrent = currentDigit === digit;
                  const isSelected = selectedDigit === digit;
                  return (
                    <button
                      type="button"
                      key={digit}
                      className={`cash-grab-digit ${isSelected ? "selected" : ""} ${isCurrent ? "current" : ""}`}
                      onClick={() => onSelectedDigitChange(digit)}
                      disabled={interactionDisabled}
                      aria-pressed={isSelected}
                      aria-label={`Digit ${digit}; ${overall.toFixed(1)} percent overall and ${market.toFixed(1)} percent for ${selectedSymbolLabel}${isCurrent ? ", current market digit" : ""}`}
                      data-testid={`button-cash-grab-digit-${digit}`}
                    >
                       <span className="cash-grab-marker" aria-hidden={!isCurrent}>{isCurrent ? "LIVE" : ""}</span>
                      <b>{digit}</b>
                      <small><span>O</span>{overall.toFixed(1)}%</small>
                      <small><span>M</span>{market.toFixed(1)}%</small>
                    </button>
                  );
                })}
              </div>
              <div className="cash-grab-digit-legend">
                <span><i className="overall" />overall observation</span>
                <span><i className="market" />selected market</span>
                <span className="cash-grab-live-legend"><i />current live digit</span>
              </div>
              <div className="cash-grab-observation">
                <span><small>SELECTED DIGIT</small><b>{selectedDigit}</b></span>
                <span><small>OVERALL</small><b>{selectedOverallPercentage.toFixed(1)}%</b></span>
                <span><small>{selectedSymbolLabel.toUpperCase()} MARKET</small><b>{selectedMarketPercentage.toFixed(1)}%</b></span>
              </div>
              <p className="cash-grab-note"><Info size={14} /> Percentages describe observed samples only. They are not predictions or guaranteed results.</p>
            </section>
          </div>

          <aside className="cash-grab-execution">
            <section className="cash-grab-card cash-grab-execution-card">
              <div className="cash-grab-card-heading">
                <div><span className="cash-grab-overline">04 · EXECUTION</span><h4>Send a controlled batch</h4></div>
                <span className={`cash-grab-place-state ${isPlacingTrade ? "placing" : ""}`}><i />{isPlacingTrade ? "PLACING" : "QUOTED"}</span>
              </div>
              <div className="cash-grab-field-grid">
                <label>
                  <span className="cash-grab-field-label">STAKE · MIN 0.35</span>
                  <span className="cash-grab-money-input"><b>{currency}</b><input type="number" min="0.35" step="0.01" value={stake} onChange={(event) => onStakeChange(Math.max(0.35, Number(event.target.value) || 0.35))} disabled={interactionDisabled || syncBalance} aria-label={`Stake in ${currency}`} data-testid="input-cash-grab-stake" /></span>
                  <small>Per contract</small>
                </label>
                 <label>
                   <span className="cash-grab-field-label">LOSS MULTIPLIER</span>
                   <span className="cash-grab-money-input"><b>×</b><input type="number" min="0.5" step="0.1" value={multiplier ?? ""} placeholder="Optional" onChange={(event) => onMultiplierChange(event.target.value === "" ? null : Math.max(0.5, Number(event.target.value) || 0.5))} disabled={interactionDisabled} aria-label="Multiplier after a loss" data-testid="input-cash-grab-multiplier" /></span>
                   <small>Blank keeps the stake flat · minimum 0.5 · no maximum</small>
                 </label>
                <label>
                  <span className="cash-grab-field-label">BULK COUNT · MIN 1</span>
                  <input className="cash-grab-number-input" type="number" min="1" step="1" value={bulkCount} onChange={(event) => onBulkCountChange(Math.max(1, Math.trunc(Number(event.target.value) || 1)))} disabled={interactionDisabled} aria-label="Number of contracts to send" data-testid="input-cash-grab-count" />
                   <small>Contracts run one at a time</small>
                </label>
              </div>
              <div className="cash-grab-choice-block">
                <span className="cash-grab-field-label">DURATION · TICKS</span>
                <div className="cash-grab-duration-grid" role="group" aria-label="Contract duration in ticks">
                  {durations.map((option) => (
                    <button type="button" key={option} className={duration === option ? "selected" : ""} onClick={() => onDurationChange(option)} disabled={interactionDisabled} aria-pressed={duration === option} data-testid={`button-cash-grab-duration-${option}`}>
                      <b>{option}</b><small>{option === 1 ? "tick" : "ticks"}</small>
                    </button>
                  ))}
                </div>
              </div>
              <div className="cash-grab-choice-block">
                <span className="cash-grab-field-label">CONTRACTS TO SEND</span>
                <div className="cash-grab-count-grid" role="group" aria-label="Bulk contract count">
                  {counts.map((option) => <button type="button" key={option} className={bulkCount === option ? "selected" : ""} onClick={() => onBulkCountChange(option)} disabled={interactionDisabled} aria-pressed={bulkCount === option} data-testid={`button-cash-grab-count-${option}`}>{option}</button>)}
                </div>
              </div>
              <p className="cash-grab-execution-summary"><span>{contractFamilies.find((item) => item.value === contractFamily)?.label}</span><b>{selectedSymbolLabel} · digit {selectedDigit}</b><em>{bulkCount} contract{bulkCount === 1 ? "" : "s"} · {duration} {duration === 1 ? "tick" : "ticks"}</em></p>
            </section>

            <section className="cash-grab-card cash-grab-balance-card">
              <div className="cash-grab-card-heading">
                <div><span className="cash-grab-overline">05 · BALANCE CONTROL</span><h4>Keep funds visible</h4></div>
                <span className="cash-grab-balance-badge"><Wallet size={13} />{accountBalance == null ? "—" : formatMoney(accountBalance, currency)}</span>
              </div>
              <label className="cash-grab-toggle-row">
                <span className="cash-grab-toggle-copy"><b>SYNC BALANCE</b><small>{syncBalance ? `Stake follows ${visibleBalancePercentage.toFixed(1)}% of balance` : "Use the manual stake above"}</small></span>
                <input type="checkbox" checked={syncBalance} onChange={(event) => onSyncBalanceChange(event.target.checked)} disabled={interactionDisabled || accountBalance == null} aria-label="Sync stake to account balance" />
                <i aria-hidden="true" />
              </label>
              <div className={`cash-grab-sync-detail ${syncBalance ? "enabled" : ""}`}>
                <div className="cash-grab-sync-title"><span>DOUBLE SYNC</span><small>Selected balance percentage</small></div>
                <label className="cash-grab-percent-input">
                  <input type="number" min="0.5" step="0.1" value={visibleBalancePercentage} onChange={(event) => onBalancePercentageChange(Math.max(0.5, Number(event.target.value) || 0.5))} disabled={interactionDisabled || !syncBalance} aria-label="Selected balance percentage" />
                  <b>%</b>
                </label>
                <p>{syncBalance && syncedStake != null ? `Current synced stake: ${formatMoney(Math.max(0.35, syncedStake), currency)} per contract.` : "Sync is optional. The parent retains final balance guards."}</p>
              </div>
            </section>

            <section className="cash-grab-card cash-grab-ai-card">
              <div className="cash-grab-card-heading">
                <div><span className="cash-grab-overline">06 · GATE STATUS</span><h4>Quiet decision surfaces</h4></div>
                <span className="cash-grab-ai-disclaimer">OBSERVATION ONLY</span>
              </div>
              <label className="cash-grab-toggle-row">
                <span className="cash-grab-toggle-copy"><b>JDY AI 2</b><small>{statusDescription(jdyAi2Status, jdyAi2)}</small></span>
                <input type="checkbox" checked={jdyAi2} onChange={(event) => onJdyAi2Change(event.target.checked)} disabled={interactionDisabled || !isConnected} aria-label="Enable JDY AI 2" />
                <i aria-hidden="true" />
                <strong className={`cash-grab-ai-status ${jdyAi2 ? jdyAi2Status : "off"}`}>{statusLabel(jdyAi2Status, jdyAi2)}</strong>
              </label>
              <label className="cash-grab-toggle-row">
                <span className="cash-grab-toggle-copy"><b>JDY AI 3</b><small>{statusDescription(jdyAi3Status, jdyAi3)}</small></span>
                 <input type="checkbox" checked={jdyAi3} onChange={(event) => onJdyAi3Change(event.target.checked)} disabled={!jdyAi3Available || isPlacingTrade || !isConnected} aria-label="Enable JDY AI 3" />
                <i aria-hidden="true" />
                <strong className={`cash-grab-ai-status ${jdyAi3 ? jdyAi3Status : "off"}`}>{statusLabel(jdyAi3Status, jdyAi3)}</strong>
              </label>
              <label className="cash-grab-toggle-row">
                <span className="cash-grab-toggle-copy">
                  <b>AUTO-SWITCH SAFEST PAIR</b>
                  <small>{autoSwitchSafestPair
                    ? autoSwitchSafestPairRecommendation
                      ? `ON · ${autoSwitchSafestPairRecommendation.symbol} · ${autoSwitchSafestPairRecommendation.observedWinRate.toFixed(1)}% observed · ${autoSwitchSafestPairRecommendation.multiplier}x · next ${autoSwitchSafestPairRecommendation.nextStake.toFixed(2)}`
                      : "ON · scanning every 20 seconds for a guarded setup"
                    : "OFF · turn on to scan markets, balance, losses, and recovery settings"}
                  </small>
                </span>
                <input
                  type="checkbox"
                  checked={autoSwitchSafestPair}
                  onChange={(event) => onAutoSwitchSafestPairChange(event.target.checked)}
                  disabled={isPlacingTrade || !isConnected}
                  aria-label="Enable Auto-switch safest pair"
                />
                <i aria-hidden="true" />
                <strong className={`cash-grab-ai-status ${autoSwitchSafestPair ? autoSwitchSafestPairStatus : "off"}`}>
                  {statusLabel(autoSwitchSafestPairStatus, autoSwitchSafestPair)}
                </strong>
              </label>
               <p className="cash-grab-note"><Info size={14} /> This scanner is independent from JDY AI 3. It checks the best balance-feasible pair every 20 seconds and can be stopped immediately with MONEY STOP.</p>
            </section>
          </aside>
        </div>

        <div className="cash-grab-submit-row">
          {isReal && (
            <label className="cash-grab-live-confirm">
              <input type="checkbox" checked={liveConfirmed} onChange={(event) => onLiveConfirmChange(event.target.checked)} disabled={running || isPlacingTrade} aria-label="Confirm real money trading" />
              <span><b><CircleCheck size={14} /> Confirm live funds</b><small>Real-money contracts use the selected Deriv account.</small></span>
            </label>
          )}
          <div className="cash-grab-submit-status">
            <span className={isConnected ? "ok" : "warn"}><i />{isConnected ? "Deriv connection ready" : "Waiting for Deriv connection"}</span>
            {isReal && !liveConfirmed && <small>Confirm live funds before sending.</small>}
          </div>
          {running ? (
             <button type="button" className="cash-grab-primary stop" onClick={onMoneyStop} data-testid="button-cash-grab-stop"><Square size={14} fill="currentColor" /> MONEY STOP</button>
          ) : (
            <button type="submit" className="cash-grab-primary" disabled={!canStart || (isReal && !liveConfirmed)} data-testid="button-cash-grab-start">{isPlacingTrade ? <span className="cash-grab-button-loading" /> : <Play size={14} fill="currentColor" />} {isPlacingTrade ? "PLACING…" : "MONEY START"}</button>
          )}
        </div>
      </form>

      <footer className="cash-grab-history-footer">
        <div className="cash-grab-history-heading">
          <div><span className="cash-grab-overline">SESSION FOOTER</span><h3>Recent Cash Grab trades</h3></div>
          <div className="cash-grab-session-metrics"><span><small>SESSION P/L</small><b className={sessionPnl < 0 ? "negative" : "positive"}>{displayedSessionPnl}</b></span><span><small>TRADE COUNT</small><b>{tradeCount}</b></span></div>
          <button type="button" className="cash-grab-clear" onClick={onClearHistory} disabled={!recentTrades.length || historyFading} aria-label={clearArmed ? "Tap again to clear Cash Grab history" : "Clear Cash Grab history"} data-testid="button-clear-cash-grab-history"><Trash2 size={13} />{clearArmed ? "Tap again" : "Clear history"}</button>
        </div>
        <div className={`cash-grab-history-list ${historyFading ? "fading" : ""}`}>
          {!recentTrades.length ? (
            <div className="cash-grab-empty-history"><Activity size={17} /><span><b>No Cash Grab trades yet</b><small>Settled and open contracts will appear here after MONEY START.</small></span></div>
          ) : recentTrades.map((trade) => {
            const outcome = outcomeForTrade(trade);
            return (
              <div className="cash-grab-history-row" key={trade.contract_id} data-testid={`row-cash-grab-trade-${trade.contract_id}`}>
                <span><b>{trade.contract_type}</b><small>{trade.symbol} · {trade.account_type}</small></span>
                <span><small>STAKE</small>{formatMoney(trade.buy_price, currency)}</span>
                <span><small>RESULT</small><strong className={outcome.tone}>{trade.status.toLowerCase() === "open" ? "—" : `${trade.profit >= 0 ? "+" : ""}${formatMoney(trade.profit, currency)}`}</strong></span>
                <span className={`cash-grab-outcome ${outcome.tone}`}><small>STATUS</small><b>{outcome.label}</b></span>
              </div>
            );
          })}
        </div>
        <div className="cash-grab-history-note"><ShieldCheck size={14} /> <span>History is a record of returned contracts. Observed percentages and AI gate statuses are not guarantees of settlement.</span></div>
      </footer>
    </section>
  );
}