import { useMemo, useState } from "react";
import {
  ChevronDown,
  CircleStop,
  Play,
  RefreshCw,
  RotateCcw,
  Trash2,
  Zap,
} from "lucide-react";
import "./digit-flip-panel.css";

export type DigitFlipParity = "DIGITEVEN" | "DIGITODD";
export type DigitFlipMarketType = "auto" | "volatility" | "jumps";
export type DigitFlipDuration = 1 | 2 | 3 | 4 | 5;
export type DigitFlipStakeMode = "flat" | "martingale";

export type DigitFlipMarketSignal = {
  symbol: string;
  evenPercentage: number;
  oddPercentage: number;
  sampleCount: number;
};

export type DigitFlipTradeRow = {
  contract_id: string;
  contract_type: string;
  symbol: string;
  status: string;
  profit: number;
  buy_price: number;
};

export type DigitFlipPanelProps = {
  enabled: boolean;
  marketType: DigitFlipMarketType;
  symbol: string;
  symbols: readonly { value: string; label: string; marketType: DigitFlipMarketType }[];
  marketSignals: readonly DigitFlipMarketSignal[];
  quote?: number | null;
  lastDigit?: number | null;
  evenPercentage: number;
  oddPercentage: number;
  sampleCount: number;
  selectedParity: DigitFlipParity;
  duration: DigitFlipDuration;
  stake: number;
  stakeMode: DigitFlipStakeMode;
  multiplier: number;
  takeProfit: number;
  stopLoss: number;
  running: boolean;
  currentStake: number;
  sessionPnl: number;
  tradeCount: number;
  recentTrades: readonly DigitFlipTradeRow[];
  assaultEnabled: boolean;
  magicEnabled: boolean;
  clearTradesArmed: boolean;
  historyFading: boolean;
  riskBalance: string;
  accountBalance: string;
  outcomeMultiplier: string;
  outcomeSynced: boolean;
  isPlacingTrade?: boolean;
  disabled?: boolean;
  onMarketTypeChange: (value: DigitFlipMarketType) => void;
  onSymbolChange: (value: string) => void;
  onParityChange: (value: DigitFlipParity) => void;
  onDurationChange: (value: DigitFlipDuration) => void;
  onStakeChange: (value: number) => void;
  onStakeModeChange: (value: DigitFlipStakeMode) => void;
  onMultiplierChange: (value: number) => void;
  onTakeProfitChange: (value: number) => void;
  onStopLossChange: (value: number) => void;
  onRunStop: () => void;
  onReset: () => void;
  onClearTrades: () => void;
  onRefreshSample: () => void;
  onAssaultChange: (value: boolean) => void;
  onMagicChange: (value: boolean) => void;
  onRiskBalanceChange: (value: string) => void;
  onAccountBalanceChange: (value: string) => void;
  onOutcomeMultiplierChange: (value: string) => void;
  onOutcomeSyncedChange: (value: boolean) => void;
  onGuide: () => void;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const digitFlipPresets = [
  {
    value: "quick",
    name: "Quick demo",
    detail: "0.50 stake · 1 tick · flat stake",
    note: "Smallest practical test with a tight session guard.",
    stake: 0.5,
    duration: 1 as DigitFlipDuration,
    stakeMode: "flat" as DigitFlipStakeMode,
    multiplier: 1,
    takeProfit: 2,
    stopLoss: 2,
  },
  {
    value: "steady",
    name: "Steady",
    detail: "1.00 stake · 3 ticks · flat stake",
    note: "A measured baseline for a fresh sample.",
    stake: 1,
    duration: 3 as DigitFlipDuration,
    stakeMode: "flat" as DigitFlipStakeMode,
    multiplier: 1,
    takeProfit: 5,
    stopLoss: 5,
  },
  {
    value: "recovery",
    name: "Recovery",
    detail: "0.50 stake · 1 tick · 1.8x after loss",
    note: "Higher exposure after a loss; use only with a defined risk balance.",
    stake: 0.5,
    duration: 1 as DigitFlipDuration,
    stakeMode: "martingale" as DigitFlipStakeMode,
    multiplier: 1.8,
    takeProfit: 5,
    stopLoss: 2.5,
  },
] as const;

function PremiumPill() {
  return <span className="df-premium">PREMIUM</span>;
}

function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <label className="df-toggle" aria-label={label}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
      />
      <i />
    </label>
  );
}

export default function DigitFlipPanel({
  enabled,
  marketType,
  symbol,
  symbols,
  marketSignals,
  quote = null,
  lastDigit = null,
  evenPercentage,
  oddPercentage,
  sampleCount,
  selectedParity,
  duration,
  stake,
  stakeMode,
  multiplier,
  takeProfit,
  stopLoss,
  running,
  currentStake,
  sessionPnl,
  tradeCount,
  recentTrades,
  assaultEnabled,
  magicEnabled,
  clearTradesArmed,
  historyFading,
  riskBalance,
  accountBalance,
  outcomeMultiplier,
  outcomeSynced,
  isPlacingTrade = false,
  disabled = false,
  onMarketTypeChange,
  onSymbolChange,
  onParityChange,
  onDurationChange,
  onStakeChange,
  onStakeModeChange,
  onMultiplierChange,
  onTakeProfitChange,
  onStopLossChange,
  onRunStop,
  onReset,
  onClearTrades,
  onRefreshSample,
  onAssaultChange,
  onMagicChange,
  onRiskBalanceChange,
  onAccountBalanceChange,
  onOutcomeMultiplierChange,
  onOutcomeSyncedChange,
  onGuide,
}: DigitFlipPanelProps) {
  const [marketPickerOpen, setMarketPickerOpen] = useState(false);
  const [preset, setPreset] = useState("custom");
  const [presetOpen, setPresetOpen] = useState(false);
  const [multipleBalanceOpen, setMultipleBalanceOpen] = useState(false);

  const activeSymbols = marketType === "auto"
    ? symbols
    : symbols.filter((option) => option.marketType === marketType);

  const rankedSignals = useMemo(() => {
    const bySymbol = new Map(marketSignals.map((signal) => [signal.symbol, signal]));
    return activeSymbols
      .map((option) => ({ option, signal: bySymbol.get(option.value) }))
      .sort((left, right) => {
        const leftRate = Math.max(left.signal?.evenPercentage ?? 0, left.signal?.oddPercentage ?? 0);
        const rightRate = Math.max(right.signal?.evenPercentage ?? 0, right.signal?.oddPercentage ?? 0);
        return rightRate - leftRate;
      })
      .slice(0, 4);
  }, [activeSymbols, marketSignals]);

  const bestSignal = useMemo(() => {
    const eligibleSignals = marketSignals.filter((signal) => activeSymbols.some((option) => option.value === signal.symbol));
    if (!eligibleSignals.length) return undefined;
    return eligibleSignals.reduce((best, candidate) => {
      const bestRate = Math.max(best.evenPercentage, best.oddPercentage);
      const candidateRate = Math.max(candidate.evenPercentage, candidate.oddPercentage);
      return candidateRate > bestRate ? candidate : best;
    });
  }, [activeSymbols, marketSignals]);

  const bestParity: DigitFlipParity = bestSignal && bestSignal.oddPercentage > bestSignal.evenPercentage
    ? "DIGITODD"
    : "DIGITEVEN";
  const bestRate = bestSignal
    ? Math.max(bestSignal.evenPercentage, bestSignal.oddPercentage)
    : Math.max(evenPercentage, oddPercentage);
  const lastParity = lastDigit == null ? null : lastDigit % 2 === 0 ? "Even" : "Odd";
  const currentQuote = quote == null ? "—" : quote.toFixed(2);
  const runText = lastParity ? `Run: ${lastParity.toLowerCase()} · latest tick: ${lastDigit}` : "Waiting for live digit sample";
  const displayedSymbol = marketType === "auto" ? bestSignal?.symbol ?? symbol : symbol;
  const marketLabel = symbols.find((option) => option.value === displayedSymbol)?.label ?? displayedSymbol;
  const bestLabel = symbols.find((option) => option.value === bestSignal?.symbol)?.label
    ?? marketLabel
    ?? "Volatility 100 Index";
  const selectedPreset = digitFlipPresets.find((item) => item.value === preset);

  const selectPreset = (value: string) => {
    setPreset(value);
    setPresetOpen(false);
    const selected = digitFlipPresets.find((item) => item.value === value);
    if (!selected) return;
    onStakeChange(selected.stake);
    onDurationChange(selected.duration);
    onStakeModeChange(selected.stakeMode);
    onMultiplierChange(selected.multiplier);
    onTakeProfitChange(selected.takeProfit);
    onStopLossChange(selected.stopLoss);
  };

  const renderMarketRate = (signal?: DigitFlipMarketSignal) => {
    if (!signal) return "—";
    const rate = selectedParity === "DIGITEVEN" ? signal.evenPercentage : signal.oddPercentage;
    return `${rate.toFixed(1)}%`;
  };

  return (
    <section className={`df-panel ${enabled ? "df-panel-active" : ""} ${disabled ? "df-panel-disabled" : ""}`} data-testid="digit-flip-panel">
      <section className="df-card df-scanner">
        <div className="df-card-heading">
          <div className="df-title">
            <span className="df-spark" aria-hidden="true"><Zap size={14} fill="currentColor" /></span>
            <b>Parity Scanner</b>
            <PremiumPill />
          </div>
          <span className="df-live"><i /> LIVE</span>
        </div>
        <div className="df-rule" />
        <div className="df-best-signal">
          <div className={`df-best-parity ${bestParity === "DIGITODD" ? "odd" : "even"}`}>
            {bestParity === "DIGITODD" ? "Odd" : "Even"} <span>{bestParity === "DIGITODD" ? "o" : "•"}</span>
          </div>
          <div className="df-best-copy">
            <span>BEST PARITY TO TRADE NOW</span>
            <p><strong>{bestRate.toFixed(1)}% score</strong><em>·</em> payout 185% <em>·</em> {bestLabel}</p>
          </div>
        </div>
      </section>

      <section className={`df-card df-market-card ${marketPickerOpen ? "open" : ""}`}>
        <button
          type="button"
          className="df-market-trigger"
          onClick={() => setMarketPickerOpen((value) => !value)}
          aria-expanded={marketPickerOpen}
          disabled={disabled}
        >
          <span className="df-market-icon" aria-hidden="true">▥</span>
          <span className="df-market-copy">
            <small>Market {marketType === "auto" ? "(auto-selected)" : "(manual)"}</small>
            <b>{marketLabel || "Volatility 100 Index"}</b>
          </span>
          <ChevronDown size={18} className="df-market-chevron" />
        </button>
        <p className="df-market-note">
          {marketPickerOpen ? "Choose a market or let the scanner pick the strongest pair." : "Choose Even or Odd — the best-performing pair is picked automatically."}
        </p>
        {marketPickerOpen && (
          <div className="df-market-menu">
            <button
              type="button"
              className={`df-market-option df-market-smart ${marketType === "auto" ? "selected" : ""}`}
              onClick={() => {
                onMarketTypeChange("auto");
                setMarketPickerOpen(false);
              }}
              disabled={disabled}
            >
              <span>ϟ Auto-select best (smart)</span>
              <b>✓</b>
            </button>
            {rankedSignals.map(({ option, signal }, index) => {
              const rate = selectedParity === "DIGITEVEN" ? signal?.evenPercentage ?? 50 : signal?.oddPercentage ?? 50;
              return (
                <button
                  type="button"
                   className={`df-market-option ${(marketType === "auto" ? displayedSymbol : symbol) === option.value ? "selected" : ""}`}
                  key={option.value}
                  onClick={() => {
                    onMarketTypeChange(option.marketType);
                    onSymbolChange(option.value);
                    setMarketPickerOpen(false);
                  }}
                  disabled={disabled}
                >
                  <span>
                    <b>{option.label}</b>
                    {index === 0 && <small>BEST</small>}
                    <em>recent {rate.toFixed(0)}% · payout 185% · 200 ticks</em>
                  </span>
                  <strong>{renderMarketRate(signal)}</strong>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="df-card df-toggle-card">
        <div className="df-toggle-copy">
          <div className="df-title"><span className="df-spark" aria-hidden="true"><Zap size={14} fill="currentColor" /></span><b>Flip Switch</b><PremiumPill /></div>
          {assaultEnabled && <p className="df-running-note"><i /> Reading live digits &amp; trading the leading parity…</p>}
        </div>
        <Switch checked={assaultEnabled} onChange={onAssaultChange} disabled={disabled} label="Flip Switch" />
      </section>

      <section className={`df-card df-toggle-card df-pair-card ${magicEnabled ? "active" : ""}`}>
        <div className="df-toggle-copy">
          <div className="df-title"><span className="df-spark" aria-hidden="true"><Zap size={14} fill="currentColor" /></span><b>Auto Switch Best Pair</b><PremiumPill /></div>
          <p>ON: hop to the best-paying pair between trades. OFF: lock one pair to target — the Ramping way.</p>
          {magicEnabled && <p className="df-running-note"><i /> Hunting the best pair between trades — never mid-trade…</p>}
        </div>
        <Switch checked={magicEnabled} onChange={onMagicChange} disabled={disabled} label="Auto Switch Best Pair" />
      </section>

      <section className="df-card df-quote-card">
        <div className="df-quote-value">{currentQuote} <small>{lastDigit == null ? "" : lastDigit}</small></div>
        <div className="df-quote-last">Last digit: <b className={lastParity === "Odd" ? "odd" : "even"}>{lastParity ?? "Waiting"} {lastParity ? (lastParity === "Odd" ? "o" : "•") : ""}</b></div>
        <div className="df-quote-run">{runText}</div>
      </section>

      <section className="df-card df-parity-toggle">
        <button
          type="button"
          className={selectedParity === "DIGITEVEN" ? "selected even" : "even"}
          onClick={() => onParityChange("DIGITEVEN")}
          disabled={disabled}
        >
          Even <span>•</span>
        </button>
        <button
          type="button"
          className={selectedParity === "DIGITODD" ? "selected odd" : "odd"}
          onClick={() => onParityChange("DIGITODD")}
          disabled={disabled}
        >
          Odd <span>o</span>
        </button>
      </section>

      <section className="df-card df-parity-card">
        <div className="df-section-label">Live parity — recent digits</div>
        <div className="df-parity-track" role="img" aria-label={`${evenPercentage.toFixed(0)} percent Even and ${oddPercentage.toFixed(0)} percent Odd`}>
          <i className="even" style={{ width: `${clamp(evenPercentage, 0, 100)}%` }} />
          <i className="odd" style={{ width: `${clamp(oddPercentage, 0, 100)}%` }} />
        </div>
        <div className="df-parity-labels">
          <span>• Even <b>{evenPercentage.toFixed(0)}%</b></span>
          <span>o Odd <b>{oddPercentage.toFixed(0)}%</b></span>
        </div>
      </section>

      <section className="df-card df-preset-card">
        <div className="df-section-label">Preset</div>
        <button type="button" className="df-preset-trigger" onClick={() => setPresetOpen((open) => !open)} disabled={disabled || running} aria-expanded={presetOpen}>
          <b>{selectedPreset?.name ?? "Select a Preset"}</b>
          <ChevronDown size={15} />
        </button>
        {presetOpen && (
          <div className="df-preset-menu">
            {digitFlipPresets.map((item) => (
              <button type="button" key={item.value} className={`df-preset-option ${preset === item.value ? "selected" : ""}`} onClick={() => selectPreset(item.value)} disabled={disabled || running}>
                <strong>{item.name}</strong>
                <span>{item.detail}</span>
                <em>{item.note}</em>
              </button>
            ))}
          </div>
        )}
        <p>Presets apply every DigitFlip setting together: stake, duration, staking mode, multiplier, take profit, and stop loss.</p>
      </section>

      <section className={`df-card df-outcome-card ${outcomeSynced ? "active" : ""}`}>
        <div className="df-advanced-head">
          <div>
            <div className="df-section-label">Expected outcome</div>
            <h3>Balance target</h3>
          </div>
          <span className={`df-sync-badge ${outcomeSynced ? "synced" : ""}`}>{outcomeSynced ? "SYNCED" : "NOT SYNCED"}</span>
        </div>
        <div className="df-outcome-grid">
          <label><span>RISK BALANCE</span><input type="number" min="0" step=".01" value={riskBalance} onChange={(event) => onRiskBalanceChange(event.target.value)} placeholder="0.00" disabled={disabled || running} /></label>
          <label><span>ACCOUNT BALANCE</span><input type="number" min="0" step=".01" value={accountBalance} onChange={(event) => onAccountBalanceChange(event.target.value)} placeholder="0.00" disabled={disabled || running} /></label>
          <div className="df-multiple-balance">
            <button type="button" className={`df-multiple-button ${multipleBalanceOpen ? "selected" : ""}`} onClick={() => setMultipleBalanceOpen((open) => !open)} disabled={disabled || running}>Multiple balance</button>
            {multipleBalanceOpen && <label><span>MULTIPLIER</span><input type="number" min="1" step=".1" value={outcomeMultiplier} onChange={(event) => onOutcomeMultiplierChange(event.target.value)} placeholder="1.0" disabled={disabled || running} /></label>}
          </div>
        </div>
        <div className="df-outcome-actions">
          <button type="button" className={`df-sync-button ${outcomeSynced ? "selected" : ""}`} onClick={() => onOutcomeSyncedChange(!outcomeSynced)} disabled={disabled || running || !riskBalance || !accountBalance || !outcomeMultiplier || Number(outcomeMultiplier) < 1}>{outcomeSynced ? "Unsync balances" : "Sync balances"}</button>
          <span>{outcomeSynced && riskBalance && outcomeMultiplier ? `Target: ${(Number(riskBalance) * Number(outcomeMultiplier)).toFixed(2)} · entries stay within the risk balance.` : "Enter both balances before starting a session."}</span>
        </div>
      </section>

      <section className="df-card df-advanced-card">
        <div className="df-advanced-head">
          <div>
            <div className="df-section-label">Trade setup</div>
            <h3>Stake and session limits</h3>
          </div>
          <button type="button" className="df-refresh" onClick={onRefreshSample} disabled={disabled}><RefreshCw size={13} /> Refresh</button>
        </div>
        <div className="df-setup-grid">
          <label><span>STAKE</span><input type="number" min=".5" step=".01" value={stake} onChange={(event) => onStakeChange(Math.max(.5, Number(event.target.value) || .5))} disabled={disabled || running} /></label>
          <label><span>DURATION</span><select value={duration} onChange={(event) => onDurationChange(Number(event.target.value) as DigitFlipDuration)} disabled={disabled || running}>{[1, 2, 3, 4, 5].map((tick) => <option value={tick} key={tick}>{tick} tick{tick > 1 ? "s" : ""}</option>)}</select></label>
          <label><span>STAKE MODE</span><select value={stakeMode} onChange={(event) => onStakeModeChange(event.target.value as DigitFlipStakeMode)} disabled={disabled || running}><option value="flat">Flat stake</option><option value="martingale">Martingale</option></select></label>
          <label><span>MULTIPLIER</span><input type="number" min="1" step=".1" value={multiplier} onChange={(event) => onMultiplierChange(Math.max(1, Number(event.target.value) || 1))} disabled={disabled || running || stakeMode === "flat"} /></label>
          <label><span>TAKE PROFIT</span><input type="number" min=".01" step=".01" value={takeProfit} onChange={(event) => onTakeProfitChange(Math.max(.01, Number(event.target.value) || .01))} disabled={disabled || running} /></label>
          <label><span>STOP LOSS</span><input type="number" min=".01" step=".01" value={stopLoss} onChange={(event) => onStopLossChange(Math.max(.01, Number(event.target.value) || .01))} disabled={disabled || running} /></label>
        </div>
        <div className="df-session-strip">
          <span><small>STAKE</small><b>{currentStake.toFixed(2)}</b></span>
          <span><small>SESSION P/L</small><b className={sessionPnl < 0 ? "loss" : ""}>{sessionPnl >= 0 ? "+" : ""}{sessionPnl.toFixed(2)}</b></span>
          <span><small>TRADES</small><b>{tradeCount}</b></span>
        </div>
        <div className="df-action-row">
          <button type="button" className={running ? "df-stop" : "df-run"} onClick={onRunStop} disabled={disabled || isPlacingTrade}>{running ? <><CircleStop size={16} /> Stop DigitFlip</> : <><Play size={16} fill="currentColor" /> Run DigitFlip</>}</button>
          <button type="button" className="df-reset" onClick={onReset} disabled={disabled}><RotateCcw size={15} /> Reset</button>
          <button type="button" className="df-guide" onClick={onGuide} disabled={disabled}>Guide</button>
        </div>
      </section>

      <section className="df-card df-recent">
        <div className="df-recent-heading">
          <div><div className="df-section-label">Activity</div><h3>Recent DigitFlip trades</h3></div>
          <button type="button" onClick={onClearTrades} disabled={!recentTrades.length}><Trash2 size={13} />{clearTradesArmed ? "Tap again" : "Clear"}</button>
        </div>
        {!recentTrades.length ? (
          <p className="df-empty">Even and Odd trades will appear here after a DigitFlip entry.</p>
        ) : recentTrades.slice(0, 10).map((trade) => {
          const settled = trade.status !== "open";
          return (
            <div className={`df-trade-row ${historyFading ? "fading" : ""}`} key={trade.contract_id}>
              <span><b>{trade.contract_type === "DIGITEVEN" ? "EVEN" : "ODD"}</b><small>{trade.symbol}</small></span>
              <span><small>STAKE</small>{trade.buy_price.toFixed(2)}</span>
              <span><small>STATUS</small>{trade.status}</span>
              <strong className={settled && trade.profit < 0 ? "loss" : ""}>{settled ? `${trade.profit >= 0 ? "+" : ""}${trade.profit.toFixed(2)}` : "—"}</strong>
            </div>
          );
        })}
      </section>
    </section>
  );
}