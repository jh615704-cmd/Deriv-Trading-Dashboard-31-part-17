import {
  Activity,
  Bot,
  Play,
  RefreshCw,
  ShieldCheck,
  Zap,
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
  smartAutoEnabled: boolean;
  smartConfidence: number;
  smartTradeCount: TradeXTradeCount;
  smartAiTicks: number;
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
  onSmartAutoChange: (enabled: boolean) => void;
  onSmartConfidenceChange: (confidence: number) => void;
  onSmartTradeCountChange: (count: TradeXTradeCount) => void;
  onSmartAiTicksChange: (ticks: number) => void;
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

const defaultDistribution: readonly TradeXDigitDistribution[] = [
  { digit: 0, percentage: 8.8, streak: 2, momentum: "flat", sampleCount: 48 },
  { digit: 1, percentage: 11.6, streak: 4, momentum: "up", sampleCount: 48 },
  { digit: 2, percentage: 9.4, streak: 1, momentum: "down", sampleCount: 48 },
  { digit: 3, percentage: 12.1, streak: 3, momentum: "up", sampleCount: 48 },
  { digit: 4, percentage: 7.9, streak: 2, momentum: "flat", sampleCount: 48 },
  { digit: 5, percentage: 13.7, streak: 5, momentum: "up", sampleCount: 48 },
  { digit: 6, percentage: 8.2, streak: 1, momentum: "down", sampleCount: 48 },
  { digit: 7, percentage: 10.3, streak: 3, momentum: "flat", sampleCount: 48 },
  { digit: 8, percentage: 9.8, streak: 2, momentum: "up", sampleCount: 48 },
  { digit: 9, percentage: 8.2, streak: 1, momentum: "down", sampleCount: 48 },
];

const durations: readonly TradeXDuration[] = [1, 2, 3, 4, 5];

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const momentumLabel = (momentum: TradeXMomentum | undefined) => {
  if (momentum === "up") return "rising";
  if (momentum === "down") return "cooling";
  return "steady";
};

export default function TradeXPanel({
  enabled,
  marketType,
  symbol,
  tradeType,
  stake,
  selectedDigit,
  duration,
  manualSelectMode,
  smartAutoEnabled,
  smartConfidence,
  smartTradeCount,
  smartAiTicks,
  distribution = defaultDistribution,
  rankedSafestDigits,
  symbols = defaultSymbols,
  analysisTickCount = 48,
  analysisUpdatedAt = "live stream",
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
  onSmartAutoChange,
  onSmartConfidenceChange,
  onSmartTradeCountChange,
  onSmartAiTicksChange,
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
    : [...digitData].sort((left, right) => left.percentage - right.percentage || right.streak - left.streak).map((item) => item.digit)
  ).slice(0, 3);
  const selectedData = digitData[selectedDigit] ?? digitData[0];
  const confidence = clamp(smartConfidence, 80, 100);
  const safeEntry = analysisTickCount > 0
    && selectedData.percentage < 7
    && selectedData.streak >= 1
    && (lastDigit == null || lastDigit !== selectedDigit);
  const currentSymbolLabel = symbols.find((option) => option.value === symbol)?.label ?? symbol;

  const selectMarketType = (nextMarketType: TradeXMarketType) => {
    onMarketTypeChange(nextMarketType);
    const nextSymbols = symbols.filter((option) => option.marketType === nextMarketType);
    const nextSymbol = nextSymbols[0];
    if (nextSymbol && !nextSymbols.some((option) => option.value === symbol)) {
      onSymbolChange(nextSymbol.value);
    }
  };

  const leastFrequentDigit = ranking[0] ?? selectedDigit;
  const aiProgress = Math.min(100, Math.round((analysisTickCount / 25) * 100));
  const signalState = safeEntry ? "SAFE" : selectedData.percentage >= 10 ? "AVOID" : "RISKY";

  return (
    <section className={`tx-panel ${enabled ? "tx-panel-active" : "tx-panel-paused"} ${disabled ? "tx-panel-disabled" : ""}`} data-testid="trade-x-panel">
      <section className="tx-ai-card">
        <div className="tx-ai-head">
          <div><Bot size={14} /><b>Intelligent DIFFERS</b></div>
          <button
            type="button"
            className={`tx-ai-toggle ${smartAutoEnabled ? "is-on" : ""}`}
            role="switch"
            aria-checked={smartAutoEnabled}
            aria-label="Enable Intelligent Differs"
            onClick={() => onSmartAutoChange(!smartAutoEnabled)}
            disabled={disabled || !enabled}
            data-testid="switch-smart-auto-trade"
          >
            {smartAutoEnabled ? "ON" : "OFF"}
          </button>
        </div>
        {smartAutoEnabled ? (
          <div className="tx-ai-live">
            <div className="tx-ai-live-line"><span>Recent Ticks (Analyzing {analysisTickCount} total):</span><b>{analysisUpdatedAt}</b></div>
            <div className="tx-ai-progress-label"><span>WAIT FOR 25 TICKS ({Math.min(25, analysisTickCount)}/25)</span><strong>{confidence}% signal</strong></div>
            <div className="tx-ai-progress"><i style={{ width: `${aiProgress}%` }} /></div>
            <p>Rank {Math.min(3, smartTradeCount)} candidate · {smartAiTicks} AI tick{smartAiTicks === 1 ? "" : "s"} · live sample</p>
          </div>
        ) : (
          <div className="tx-ai-idle">
            <span>Least Frequent Digit</span>
            <strong>{leastFrequentDigit}</strong>
            <small><Zap size={11} /> Best digit to trade DIFFERS</small>
          </div>
        )}
      </section>

      <section className="tx-distribution-card">
        <div className="tx-mobile-section-head">
          <div><b>Digit Distribution &amp; Safe Entry</b><span className="tx-symbol-badge">{symbol}</span></div>
          <div className="tx-mobile-meta"><span>{analysisTickCount} ticks</span><span>Last: {lastDigit == null ? "—" : lastDigit}</span><button type="button" onClick={onRefreshAnalysis} disabled={disabled || isRefreshingAnalysis} aria-label="Refresh digit analysis"><RefreshCw size={12} className={isRefreshingAnalysis ? "tx-spin" : ""} /></button></div>
        </div>
        <div className="tx-digit-grid" role="group" aria-label="Select a digit">
          {digitData.map((item) => {
            const isSelected = selectedDigit === item.digit;
            const isRanked = ranking.includes(item.digit);
            const isMarketDigit = lastDigit != null && Number(lastDigit) === item.digit;
            return (
              <button
                type="button"
                key={item.digit}
                className={`tx-digit ${isSelected ? "tx-digit-selected" : ""} ${isRanked ? "tx-digit-ranked" : ""} ${isMarketDigit ? "tx-digit-market" : ""}`}
                onClick={() => onSelectedDigitChange(item.digit)}
                disabled={disabled}
                aria-pressed={isSelected}
                aria-label={`Digit ${item.digit}, ${item.percentage.toFixed(1)} percent frequency, ${item.streak} tick absence streak`}
                data-testid={`button-trade-x-digit-${item.digit}`}
              >
                <span className="tx-digit-number">{item.digit}</span>
                <span className="tx-digit-percent">{item.percentage.toFixed(1)}%</span>
                <small>• {item.streak}x</small>
              </button>
            );
          })}
        </div>
        <div className="tx-signal-detail">
          <div className="tx-signal-detail-head">
            <div><b>DIFFERS {selectedDigit}</b><span className={safeEntry ? "tx-safe-label" : "tx-risk-label"}>{signalState}</span></div>
            <strong>{clamp(100 - selectedData.percentage, 0, 100).toFixed(0)}%</strong>
          </div>
          <div className="tx-signal-metrics">
            <span>Frequency <b>{selectedData.percentage.toFixed(1)}% <small>(avg 10%)</small></b></span>
            <span>Absence streak <b>{selectedData.streak} ticks without appearing</b></span>
            <span>Occurrences <b>{Math.round((selectedData.sampleCount ?? analysisTickCount) * selectedData.percentage / 100)} / {selectedData.sampleCount ?? analysisTickCount}</b></span>
          </div>
          <div className={`tx-signal-progress ${safeEntry ? "tx-signal-progress-safe" : ""}`}><i style={{ width: `${clamp(selectedData.percentage * 10, 2, 100)}%` }} /></div>
          <p>{safeEntry ? `Avoiding the observed ${selectedDigit} digit is currently the cleanest differs filter. This is descriptive market data, not a guarantee.` : `Avoid — digit ${selectedDigit} is not currently below the preferred observed frequency filter.`}</p>
        </div>
        <div className="tx-legend"><span><i className="tx-legend-safe" />75 Safe</span><span><i className="tx-legend-mid" />50-74 Moderate</span><span><i className="tx-legend-risk" />25-49 Risky</span><span><i className="tx-legend-avoid" />25 Avoid</span><span>× absence streak</span></div>
      </section>

      <section className="tx-safe-panel">
        <div className="tx-safe-title"><div><ShieldCheck size={13} /><b>Top 3 Safest DIFFERS Digits</b></div><span>Lowest observed rates</span></div>
        <div className="tx-ranking-list">
          {ranking.map((digit, index) => {
            const item = digitData[digit] ?? { digit, percentage: 0, streak: 0, momentum: "flat" as const };
            return (
              <div className={`tx-rank-row ${selectedDigit === digit ? "tx-rank-row-selected" : ""}`} key={`${digit}-${index}`} aria-label={`Rank ${index + 1}, digit ${digit}`} data-testid={`button-trade-x-ranked-digit-${digit}`}>
                <button type="button" className="tx-rank-select" onClick={() => onSelectedDigitChange(digit)} disabled={disabled} aria-label={`Select digit ${digit}`}>
                  <span className="tx-rank-medal">0{index + 1}</span><b>{digit}</b>
                </button>
                <strong>{clamp(100 - item.percentage, 0, 100).toFixed(0)}%</strong>
                <small>{item.percentage.toFixed(1)}% freq · {item.streak}x absent</small>
                <button type="button" className="tx-tap-trade" onClick={() => onTradeSelect(digit)} disabled={disabled || isPlacingTrade || !enabled} data-testid={`button-trade-x-tap-${digit}`}>TAP TO TRADE</button>
              </div>
            );
          })}
        </div>
      </section>

      <div className="tx-quick-actions">
        <button type="button" className="tx-quick tx-quick-orange" onClick={onPlaceTrade} disabled={disabled || isPlacingTrade || !enabled}><Play size={12} fill="currentColor" />5x Sequential DIFFERS</button>
        <button type="button" className="tx-quick tx-quick-blue" onClick={onPlaceTrade} disabled={disabled || isPlacingTrade || !enabled}><Activity size={12} />15x Sequential DIFFERS</button>
        <button type="button" className="tx-quick tx-quick-blue" onClick={onPlaceTrade} disabled={disabled || isPlacingTrade || !enabled}><Zap size={12} />Place TradeX Trade</button>
        <button type="button" className="tx-quick tx-quick-blue" onClick={() => onTradeSelect(ranking[0] ?? selectedDigit)} disabled={disabled || isPlacingTrade || !enabled}><Zap size={12} />Random Differ</button>
        <small>Auto-trades every 6 seconds · {duration} tick entry · live market {currentSymbolLabel}</small>
        <button type="button" className="tx-quick tx-quick-amber" onClick={onPlaceTrade} disabled={disabled || isPlacingTrade || !enabled}><Zap size={13} />Ace (0.4s)</button>
        <button type="button" className="tx-quick tx-quick-red" onClick={onPlaceTrade} disabled={disabled || isPlacingTrade || !enabled}><Zap size={13} />INSTANT 5</button>
      </div>

      <details className="tx-settings-drawer">
        <summary>Trade settings <span>{currentSymbolLabel} · ${stake.toFixed(2)} · {duration} tick</span></summary>
        <div className="tx-settings-grid">
          <div className="tx-settings-field tx-settings-wide">
            <span>MARKET FAMILY</span>
            <div className="tx-settings-segments">
              <button type="button" className={marketType === "volatility" ? "selected" : ""} onClick={() => selectMarketType("volatility")} disabled={disabled}>Volatility</button>
              <button type="button" className={marketType === "jumps" ? "selected" : ""} onClick={() => selectMarketType("jumps")} disabled={disabled}>Jumps</button>
            </div>
          </div>
          <label className="tx-settings-field"><span>SYMBOL</span><select value={symbol} onChange={(event) => onSymbolChange(event.target.value)} disabled={disabled}>{activeSymbols.map((option) => <option key={option.value} value={option.value}>{option.label} · {option.value}</option>)}</select></label>
          <label className="tx-settings-field"><span>STAKE</span><input type="number" min=".01" step=".01" value={stake} onChange={(event) => onStakeChange(Number(event.target.value))} disabled={disabled} /></label>
          <label className="tx-settings-field"><span>TRADE TYPE</span><select value={tradeType} onChange={(event) => onTradeTypeChange(event.target.value as TradeXTradeType)} disabled={disabled}><option value="DIGITDIFF">Digit Differs</option></select></label>
          <div className="tx-settings-field tx-settings-wide"><span>DURATION / TICKS</span><div className="tx-duration-list">{durations.map((value) => <button type="button" key={value} className={duration === value ? "selected" : ""} onClick={() => onDurationChange(value)} disabled={disabled}>{value}</button>)}</div></div>
          <button type="button" className={`tx-manual-mode ${manualSelectMode ? "selected" : ""}`} onClick={() => onManualSelectModeChange(!manualSelectMode)} disabled={disabled}><span>Manual digit selection</span><b>{manualSelectMode ? "ON" : "OFF"}</b></button>
          <label className="tx-settings-field"><span>MIN SCORE · {confidence}%</span><input type="range" min="80" max="100" value={confidence} onChange={(event) => onSmartConfidenceChange(Number(event.target.value))} disabled={disabled} /></label>
          <label className="tx-settings-field"><span>AUTO TRADES</span><select value={smartTradeCount} onChange={(event) => onSmartTradeCountChange(Number(event.target.value) as TradeXTradeCount)} disabled={disabled}><option value={1}>1 trade</option><option value={2}>2 trades</option><option value={3}>3 trades</option></select></label>
          <label className="tx-settings-field"><span>AI TICKS</span><select value={smartAiTicks} onChange={(event) => onSmartAiTicksChange(Number(event.target.value))} disabled={disabled}>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} tick{value === 1 ? "" : "s"}</option>)}</select></label>
        </div>
      </details>
    </section>
  );
}