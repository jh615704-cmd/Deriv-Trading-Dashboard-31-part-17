import {
  Activity,
  ChevronRight,
  Gauge,
  GitCompare,
  Layers3,
  Medal,
  Play,
  RefreshCw,
  Target,
  TimerReset,
} from "lucide-react";
import "./trade-x-panel.css";

export type TradeXMarketType = "volatility" | "jumps";
export type TradeXTradeType = "DIGITDIFF";
export type TradeXMomentum = "up" | "down" | "flat";
export type TradeXDuration = 1 | 2 | 3 | 4 | 5;
export type TradeXTradeCount = 1 | 2 | 3;

export interface TradeXSymbolOption {
  value: string;
  label: string;
  marketType: TradeXMarketType;
}

export interface TradeXDigitDistribution {
  digit: number;
  percentage: number;
  streak: number;
  momentum?: TradeXMomentum;
  sampleCount?: number;
}

export interface TradeXPanelProps {
  enabled: boolean;
  marketType: TradeXMarketType;
  symbol: string;
  tradeType: TradeXTradeType;
  stake: number;
  selectedDigit: number;
  duration: TradeXDuration;
  manualSelectMode: boolean;
  distribution?: readonly TradeXDigitDistribution[];
  rankedSafestDigits?: readonly number[];
  symbols?: readonly TradeXSymbolOption[];
  analysisTickCount?: number;
  analysisUpdatedAt?: string;
  lastDigit?: number | null;
  isPlacingTrade?: boolean;
  isRefreshingAnalysis?: boolean;
  disabled?: boolean;
  onMarketTypeChange: (marketType: TradeXMarketType) => void;
  onSymbolChange: (symbol: string) => void;
  onTradeTypeChange: (tradeType: TradeXTradeType) => void;
  onStakeChange: (stake: number) => void;
  onSelectedDigitChange: (digit: number) => void;
  onDurationChange: (duration: TradeXDuration) => void;
  onManualSelectModeChange: (enabled: boolean) => void;
  onTradeSelect: (digit: number) => void;
  onPlaceTrade: () => void;
  onRefreshAnalysis: () => void;
}

const defaultSymbols: readonly TradeXSymbolOption[] = [
  { value: "R_10", label: "Volatility 10", marketType: "volatility" },
  { value: "R_25", label: "Volatility 25", marketType: "volatility" },
  { value: "R_50", label: "Volatility 50", marketType: "volatility" },
  { value: "R_75", label: "Volatility 75", marketType: "volatility" },
  { value: "R_100", label: "Volatility 100", marketType: "volatility" },
  { value: "JD10", label: "Jump 10", marketType: "jumps" },
  { value: "JD25", label: "Jump 25", marketType: "jumps" },
  { value: "JD50", label: "Jump 50", marketType: "jumps" },
  { value: "JD75", label: "Jump 75", marketType: "jumps" },
  { value: "JD100", label: "Jump 100", marketType: "jumps" },
];

const durations: readonly TradeXDuration[] = [1, 2, 3, 4, 5];

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export default function TradeXPanel({
  enabled,
  marketType,
  symbol,
  tradeType,
  stake,
  selectedDigit,
  duration,
  manualSelectMode,
  distribution = [],
  rankedSafestDigits,
  symbols = defaultSymbols,
  analysisTickCount = 0,
  analysisUpdatedAt = "waiting for ticks",
  lastDigit = null,
  isPlacingTrade = false,
  isRefreshingAnalysis = false,
  disabled = false,
  onMarketTypeChange,
  onSymbolChange,
  onTradeTypeChange,
  onStakeChange,
  onSelectedDigitChange,
  onDurationChange,
  onManualSelectModeChange,
  onTradeSelect,
  onPlaceTrade,
  onRefreshAnalysis,
}: TradeXPanelProps) {
  const activeSymbols = symbols.filter((option) => option.marketType === marketType);
  const digitData = Array.from({ length: 10 }, (_, digit) => {
    return distribution.find((item) => item.digit === digit) ?? {
      digit,
      percentage: 0,
      streak: 0,
      momentum: "flat" as const,
    };
  });
  const ranking = (rankedSafestDigits?.length
    ? rankedSafestDigits
    : analysisTickCount > 0 ? [...digitData].sort((left, right) => left.percentage - right.percentage || right.streak - left.streak).map((item) => item.digit) : []
  ).slice(0, 3);
  const selectedData = digitData[selectedDigit] ?? digitData[0];
  const currentSymbolLabel = symbols.find((option) => option.value === symbol)?.label ?? symbol;

  const selectMarketType = (nextMarketType: TradeXMarketType) => {
    onMarketTypeChange(nextMarketType);
    const nextSymbols = symbols.filter((option) => option.marketType === nextMarketType);
    const nextSymbol = nextSymbols[0];
    if (nextSymbol && !nextSymbols.some((option) => option.value === symbol)) {
      onSymbolChange(nextSymbol.value);
    }
  };

  return (
    <section className={`tx-panel ${enabled ? "tx-panel-active" : "tx-panel-paused"} ${disabled ? "tx-panel-disabled" : ""}`} data-testid="trade-x-panel">
      <header className="tx-header">
        <div className="tx-heading">
          <div className="tx-mark" aria-hidden="true">
            <GitCompare size={17} strokeWidth={2.5} />
          </div>
          <div>
            <div className="tx-eyebrow">
              <span className="tx-signal-dot" />
              LIVE DIGIT DIFFERENCE
            </div>
            <h2 data-testid="text-trade-x-title">Trade X</h2>
            <p>Surface the cleanest differ signal before you decide.</p>
          </div>
        </div>
        <div className="tx-header-actions">
          <span className={`tx-header-state ${enabled ? "tx-header-state-live" : ""}`}>
            <span />{enabled ? "LIVE" : "PAUSED"}
          </span>
        </div>
      </header>

      <div className="tx-status-line" data-testid="status-trade-x">
        <span className={`tx-status-led ${enabled ? "tx-status-led-live" : ""}`} />
        <span>{enabled ? "Trade X ready" : "Trade X paused"}</span>
        <span className="tx-status-divider" />
        <span className="tx-status-muted">{currentSymbolLabel}</span>
        <span className="tx-status-spacer" />
        <span className="tx-status-muted">{analysisTickCount} ticks sampled</span>
        <span className="tx-status-muted">{analysisUpdatedAt}</span>
      </div>

      <div className="tx-body">
        <section className="tx-settings tx-section">
          <div className="tx-section-heading">
            <div>
              <span className="tx-index">01</span>
              <div>
                <h3>Market setup</h3>
                <p>Keep the instrument and contract type explicit.</p>
              </div>
            </div>
            <Gauge size={18} />
          </div>
          <div className="tx-market-layout">
            <div className="tx-field tx-field-market">
              <span className="tx-field-label">MARKET FAMILY</span>
              <div className="tx-segmented" role="group" aria-label="Market family">
                <button
                  type="button"
                  className={marketType === "volatility" ? "tx-segment tx-segment-selected" : "tx-segment"}
                  onClick={() => selectMarketType("volatility")}
                  disabled={disabled}
                  data-testid="button-market-type-volatility"
                >
                  Volatility
                </button>
                <button
                  type="button"
                  className={marketType === "jumps" ? "tx-segment tx-segment-selected" : "tx-segment"}
                  onClick={() => selectMarketType("jumps")}
                  disabled={disabled}
                  data-testid="button-market-type-jumps"
                >
                  Jumps
                </button>
              </div>
            </div>
            <label className="tx-field">
              <span className="tx-field-label">SYMBOL</span>
              <select value={symbol} onChange={(event) => onSymbolChange(event.target.value)} disabled={disabled} data-testid="select-trade-x-symbol">
                {activeSymbols.map((option) => (
                  <option value={option.value} key={option.value}>{option.label} · {option.value}</option>
                ))}
              </select>
            </label>
            <label className="tx-field">
              <span className="tx-field-label">TRADE TYPE</span>
              <select value={tradeType} onChange={(event) => onTradeTypeChange(event.target.value as TradeXTradeType)} disabled={disabled} data-testid="select-trade-x-type">
                <option value="DIGITDIFF">Digit Differs</option>
              </select>
            </label>
            <label className="tx-field tx-field-stake">
              <span className="tx-field-label">STAKE</span>
              <span className="tx-input-prefix">
                <span>$</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={stake}
                  onChange={(event) => onStakeChange(Number(event.target.value))}
                  disabled={disabled}
                  aria-label="Stake amount"
                  data-testid="input-trade-x-stake"
                />
              </span>
            </label>
          </div>
        </section>

        <div className="tx-main-grid">
          <section className="tx-distribution tx-section">
            <div className="tx-section-heading">
              <div>
                <span className="tx-index">02</span>
                <div>
                    <h3>Digit Distribution</h3>
                   <p>Recent frequency and live market touch.</p>
                </div>
              </div>
              <div className="tx-distribution-actions">
                 <span className="tx-header-badge tx-header-badge-symbol">{symbol}</span>
                <span className="tx-header-badge">{analysisTickCount} ticks</span>
                {lastDigit != null && <span className="tx-header-badge tx-header-badge-last">Last: {lastDigit}</span>}
                <button type="button" className="tx-icon-button" onClick={onRefreshAnalysis} disabled={disabled || isRefreshingAnalysis} aria-label="Refresh digit analysis" data-testid="button-refresh-trade-x-analysis">
                  <RefreshCw size={15} className={isRefreshingAnalysis ? "tx-spin" : ""} />
                </button>
              </div>
            </div>
            <div className="tx-distribution-readout">
              <div>
                <span className="tx-micro-label">SIGNAL SAMPLE</span>
                <strong data-testid="text-trade-x-sample-count">{analysisTickCount} <small>ticks</small></strong>
              </div>
              <div className="tx-readout-divider" />
              <div>
                <span className="tx-micro-label">SELECTED DIGIT</span>
                 <strong data-testid="text-trade-x-selected-digit">{selectedDigit}<small>{manualSelectMode ? "manual entry" : "ranked entry"}</small></strong>
              </div>
               <div className="tx-distribution-state"><Activity size={14} />LIVE TICKS</div>
            </div>
            <div className="tx-digit-grid" role="group" aria-label="Select a digit">
              {digitData.map((item) => {
                const isSelected = selectedDigit === item.digit;
                const isRanked = ranking.includes(item.digit);
                const normalizedLastDigit = lastDigit == null ? null : Number(lastDigit);
                const isMarketDigit = normalizedLastDigit === item.digit;
                return (
                  <button
                    type="button"
                    key={item.digit}
                     className={`tx-digit ${isSelected ? "tx-digit-selected" : ""} ${isRanked ? "tx-digit-ranked" : ""} ${isMarketDigit ? "tx-digit-market" : ""} ${item.percentage >= 15 ? "tx-digit-high" : ""}`}
                    onClick={() => onSelectedDigitChange(item.digit)}
                    disabled={disabled}
                    aria-pressed={isSelected}
                      aria-label={`Digit ${item.digit}, ${analysisTickCount ? `${item.percentage.toFixed(1)} percent frequency` : "waiting for frequency sample"}${isMarketDigit ? ", current market digit" : ""}`}
                    data-testid={`button-trade-x-digit-${item.digit}`}
                  >
                    <span className={`tx-market-touch ${isMarketDigit ? "is-live" : ""}`} aria-hidden="true">{isMarketDigit ? "LIVE" : ""}</span>
                     <span className="tx-digit-number">{item.digit}</span>
                      <span className="tx-digit-percent">{analysisTickCount ? `${item.percentage.toFixed(1)}%` : "—"}</span>
                       <span className={`tx-digit-meta tx-digit-meta-${item.momentum ?? "flat"}`}>{analysisTickCount ? `${item.streak} absent` : "waiting"}</span>
                  </button>
                );
              })}
            </div>
             <div className="tx-signal-detail">
              <div className="tx-signal-detail-head">
                  <div><b>DIFFERS {selectedDigit}</b><span className="tx-risk-label">MARKET CONTEXT</span></div>
                  <strong>{analysisTickCount ? clamp(100 - selectedData.percentage * 4 + Math.min(selectedData.streak, 10) * 2, 0, 100).toFixed(1) : "—"}</strong>
              </div>
               <div className="tx-signal-metrics">
                 <span>Safety score <b>{analysisTickCount ? "heuristic only" : "waiting for samples"}</b></span>
                 <span>Frequency <b>{analysisTickCount ? `${selectedData.percentage.toFixed(1)}%` : "—"} {analysisTickCount > 0 && <small>(avg 10%)</small>}</b></span>
                  <span>Absence streak <b>{analysisTickCount ? `${selectedData.streak} ticks` : "—"}</b></span>
                  <span>Sample <b>{analysisTickCount ? `${selectedData.sampleCount ?? analysisTickCount} ticks observed` : "waiting"}</b></span>
                  <span>Occurrences <b>{analysisTickCount ? `${Math.round((selectedData.sampleCount ?? analysisTickCount) * selectedData.percentage / 100)} / ${selectedData.sampleCount ?? analysisTickCount}` : "—"}</b></span>
              </div>
                <div className="tx-signal-progress"><i style={{ width: `${clamp(selectedData.percentage * 10, 2, 100)}%` }} /></div>
                   <p>The current selection is available for manual trading at any time.</p>
            </div>
            <div className="tx-distribution-foot">
               <span><i className="tx-key tx-key-ranked" /> ranked differ candidate</span>
              <span><i className="tx-key tx-key-selected" /> current selection</span>
              <span className="tx-foot-note">Descriptive signal, not a guarantee.</span>
            </div>
          </section>

          <section className="tx-safe-panel tx-section">
            <div className="tx-section-heading tx-safe-heading">
              <div>
                <span className="tx-index">03</span>
                <div>
                    <h3>Top 3 DIFFERS Digits</h3>
                   <p>Lowest observed frequency in the current window.</p>
                </div>
              </div>
               <Target size={18} />
            </div>
            <div className="tx-ranking-list">
              {ranking.length ? ranking.map((digit, index) => {
                const item = digitData[digit] ?? { digit, percentage: 0, streak: 0, momentum: "flat" as const };
                const safetyScore = clamp(100 - item.percentage * 4 + Math.min(item.streak, 10) * 2, 0, 100);
                const safetyBand = safetyScore >= 75 ? "safe" : safetyScore >= 50 ? "moderate" : safetyScore >= 26 ? "risky" : "avoid";
                const safetyLabel = safetyBand === "safe" ? "SAFE" : safetyBand === "moderate" ? "MODERATE" : safetyBand === "risky" ? "RISKY" : "AVOID";
                return (
                  <div
                    className={`tx-rank-row tx-rank-${safetyBand} ${selectedDigit === digit ? "tx-rank-row-selected" : ""}`}
                    key={`${digit}-${index}`}
                    aria-label={`Rank ${index + 1}, digit ${digit}`}
                    data-testid={`button-trade-x-ranked-digit-${digit}`}
                  >
                     <button type="button" className="tx-rank-select" onClick={() => onSelectedDigitChange(digit)} disabled={disabled} aria-label={`Select digit ${digit}`}>
                        <span className={`tx-rank-medal medal-${index + 1}`} aria-hidden="true"><Medal size={18} /></span>
                       <span className="tx-rank-digit">{digit}</span>
                     </button>
                      <span className="tx-rank-metrics"><b>{safetyScore.toFixed(1)} <small>score · {safetyLabel}</small></b><small>{item.percentage.toFixed(1)}% freq · {item.streak} absent</small></span>
                    <button type="button" className="tx-tap-trade" onClick={() => onTradeSelect(digit)} disabled={disabled || isPlacingTrade || !enabled} data-testid={`button-trade-x-tap-${digit}`}>TAP TO TRADE</button>
                  </div>
                );
              }) : <div className="tx-rank-empty">Collecting live ticks. Ranked safety scores appear after the first observations.</div>}
            </div>
            <div className="tx-tick-hint">
              <Layers3 size={16} />
               <span><b>Safety score is a heuristic, not win probability or a guarantee.</b> Manual selection sends the exact digit you choose.</span>
            </div>
            <div className="tx-selection-line">
               <span>ACTIVE BARRIER</span>
              <strong>Digit {selectedDigit}</strong>
              <span className="tx-selection-separator">/</span>
              <span>{selectedData.percentage.toFixed(1)}% observed</span>
            </div>
          </section>
        </div>

        <section className="tx-execution tx-section">
          <div className="tx-section-heading">
            <div>
              <span className="tx-index">04</span>
              <div>
                <h3>Execution rail</h3>
                <p>Deriv settles this contract on the next selected number of live market ticks.</p>
              </div>
            </div>
            <TimerReset size={18} />
          </div>
          <div className="tx-execution-grid">
            <div className="tx-duration">
              <span className="tx-field-label">DURATION / TICKS</span>
              <div className="tx-duration-list" role="group" aria-label="Trade duration">
                {durations.map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={`tx-duration-button ${duration === value ? "tx-duration-selected" : ""}`}
                    onClick={() => onDurationChange(value)}
                    disabled={disabled}
                    aria-pressed={duration === value}
                    data-testid={`button-trade-x-duration-${value}`}
                  >
                    <b>{value}</b><span>{value === 1 ? "tick" : "ticks"}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="tx-mode-actions">
              <button
                type="button"
                className={`tx-mode-button ${manualSelectMode ? "tx-mode-button-active" : ""}`}
                onClick={() => onManualSelectModeChange(!manualSelectMode)}
                disabled={disabled}
                aria-pressed={manualSelectMode}
                data-testid="button-trade-x-manual-mode"
              >
                <Target size={15} />
                <span><b>Manual select</b><small>{manualSelectMode ? "select a digit before trade" : "ranked entry mode"}</small></span>
                <span className="tx-mini-toggle"><i /></span>
              </button>
            </div>
          </div>
          <div className="tx-action-grid">
            <button type="button" className="tx-action tx-action-primary" onClick={onPlaceTrade} disabled={disabled || isPlacingTrade || !enabled} data-testid="button-place-trade-x">
              <span className="tx-action-icon">{isPlacingTrade ? <RefreshCw size={17} className="tx-spin" /> : <Play size={17} fill="currentColor" />}</span>
              <span><b>{isPlacingTrade ? "Sending Trade X…" : "Place Trade X Trade"}</b><small>Digit {selectedDigit} · {duration} {duration === 1 ? "tick" : "ticks"} · ${stake.toFixed(2)}</small></span>
              <ChevronRight size={17} />
            </button>
          </div>
        </section>

      </div>
    </section>
  );
}