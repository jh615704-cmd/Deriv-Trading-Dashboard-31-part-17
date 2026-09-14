import {
  Activity,
  BookOpen,
  CircleStop,
  Play,
  RotateCcw,
  Trash2,
  Zap,
} from "lucide-react";
import "./digit-flip-panel.css";

export type DigitFlipParity = "DIGITEVEN" | "DIGITODD";
export type DigitFlipMarketType = "volatility" | "jumps";
export type DigitFlipDuration = 1 | 2 | 3 | 4 | 5;
export type DigitFlipStakeMode = "flat" | "martingale";

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
  onGuide: () => void;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export default function DigitFlipPanel({
  enabled,
  marketType,
  symbol,
  symbols,
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
  onGuide,
}: DigitFlipPanelProps) {
  const activeSymbols = symbols.filter((option) => option.marketType === marketType);
  const selectedRate = selectedParity === "DIGITEVEN" ? evenPercentage : oddPercentage;
  const marketLabel = symbols.find((option) => option.value === symbol)?.label ?? symbol;
  const parityLabel = selectedParity === "DIGITEVEN" ? "EVEN" : "ODD";

  return (
    <section className={`df-panel ${enabled ? "df-panel-active" : ""} ${disabled ? "df-panel-disabled" : ""}`} data-testid="digit-flip-panel">
      <header className="df-header">
        <div className="df-heading">
          <div className="df-mark" aria-hidden="true"><Zap size={17} /></div>
          <div>
            <div className="df-eyebrow"><span className="df-live-dot" /> EVEN / ODD LIVE SIGNAL</div>
            <h2>DigitFlip</h2>
            <p>Parity trading with visible sample evidence.</p>
          </div>
        </div>
        <div className="df-header-actions">
          <button type="button" className="df-guide-button" onClick={onGuide} disabled={disabled}><BookOpen size={14} />Guide</button>
          <span className={`df-state ${running ? "df-state-live" : ""}`}><i />{running ? "RUNNING" : "STANDBY"}</span>
        </div>
      </header>

      <div className="df-status-line">
        <span className={`df-status-led ${enabled ? "df-status-led-live" : ""}`} />
        <span>{enabled ? "DigitFlip ready" : "DigitFlip paused"}</span>
        <span className="df-status-divider" />
        <span>{marketLabel}</span>
        <span className="df-status-spacer" />
        <span>{sampleCount} ticks sampled</span>
      </div>

      <div className="df-body">
        <section className="df-section df-market">
          <div className="df-section-head"><div><span>01</span><div><h3>Market and quote</h3><p>Auto-selection starts with a live market and may change when its signal weakens.</p></div></div><Activity size={17} /></div>
          <div className="df-market-grid">
            <div className="df-field">
              <span>MARKET FAMILY</span>
              <div className="df-segments">
                <button type="button" className={marketType === "volatility" ? "selected" : ""} onClick={() => onMarketTypeChange("volatility")} disabled={disabled}>Volatility</button>
                <button type="button" className={marketType === "jumps" ? "selected" : ""} onClick={() => onMarketTypeChange("jumps")} disabled={disabled}>Jumps</button>
              </div>
            </div>
            <label className="df-field"><span>MARKET</span><select value={symbol} onChange={(event) => onSymbolChange(event.target.value)} disabled={disabled}>{activeSymbols.map((option) => <option value={option.value} key={option.value}>{option.label} · {option.value}</option>)}</select></label>
            <div className="df-quote"><span>LIVE QUOTE</span><strong>{quote == null ? "—" : quote.toFixed(4)}</strong><small>{lastDigit == null ? "Waiting for last digit" : `Last digit ${lastDigit}`}</small></div>
          </div>
        </section>

        <section className="df-section df-parity">
           <div className="df-section-head"><div><span>02</span><div><h3>Parity signal</h3><p>Recent parity percentages describe the selected market sample; they are not outcome guarantees.</p></div></div><strong className="df-estimate">{selectedRate.toFixed(1)}% observed</strong></div>
          <div className="df-parity-readout">
            <div className="df-parity-number even"><small>EVEN</small><strong>{evenPercentage.toFixed(1)}%</strong></div>
            <div className="df-parity-track"><i className="even-fill" style={{ width: `${clamp(evenPercentage, 0, 100)}%` }} /><i className="odd-fill" style={{ width: `${clamp(oddPercentage, 0, 100)}%` }} /></div>
            <div className="df-parity-number odd"><small>ODD</small><strong>{oddPercentage.toFixed(1)}%</strong></div>
          </div>
          <div className="df-parity-buttons">
            <button type="button" className={selectedParity === "DIGITEVEN" ? "even selected" : "even"} onClick={() => onParityChange("DIGITEVEN")} disabled={disabled}><b>EVEN</b><small>0 · 2 · 4 · 6 · 8</small></button>
            <button type="button" className={selectedParity === "DIGITODD" ? "odd selected" : "odd"} onClick={() => onParityChange("DIGITODD")} disabled={disabled}><b>ODD</b><small>1 · 3 · 5 · 7 · 9</small></button>
          </div>
          <div className="df-parity-foot"><span>LAST DIGIT <b>{lastDigit == null ? "—" : lastDigit}</b></span><span>SAMPLE <b>{sampleCount} ticks</b></span><span>NO GUARANTEE <b>descriptive only</b></span></div>
        </section>

        <section className="df-section df-controls">
          <div className="df-section-head"><div><span>03</span><div><h3>Trade controls</h3><p>Choose the stake mode and limits before Run.</p></div></div></div>
          <div className="df-control-grid">
            <div className="df-control"><span>DURATION / TICKS</span><div className="df-ticks">{([1, 2, 3, 4, 5] as const).map((tick) => <button type="button" className={duration === tick ? "selected" : ""} key={tick} onClick={() => onDurationChange(tick)} disabled={disabled || running}>{tick}</button>)}</div></div>
            <label className="df-control"><span>INITIAL STAKE</span><div className="df-money"><i>$</i><input type="number" min=".5" step=".01" value={stake} onChange={(event) => onStakeChange(Math.max(.5, Number(event.target.value) || .5))} disabled={disabled || running} /></div></label>
            <label className="df-control"><span>STAKE MODE</span><select value={stakeMode} onChange={(event) => onStakeModeChange(event.target.value as DigitFlipStakeMode)} disabled={disabled || running}><option value="flat">Flat stake</option><option value="martingale">Martingale after loss</option></select></label>
            <label className="df-control"><span>MULTIPLIER</span><input type="number" min="1" step=".1" value={multiplier} onChange={(event) => onMultiplierChange(Math.max(1, Number(event.target.value) || 1))} disabled={disabled || running || stakeMode === "flat"} /></label>
            <label className="df-control"><span>TAKE PROFIT</span><input type="number" min=".01" step=".01" value={takeProfit} onChange={(event) => onTakeProfitChange(Math.max(.01, Number(event.target.value) || .01))} disabled={disabled || running} /></label>
            <label className="df-control"><span>STOP LOSS</span><input type="number" min=".01" step=".01" value={stopLoss} onChange={(event) => onStopLossChange(Math.max(.01, Number(event.target.value) || .01))} disabled={disabled || running} /></label>
          </div>
        </section>

        <section className="df-session">
          <div><small>CURRENT STAKE</small><strong>{currentStake.toFixed(2)}</strong></div>
          <div><small>SESSION P/L</small><strong className={sessionPnl < 0 ? "loss" : ""}>{sessionPnl >= 0 ? "+" : ""}{sessionPnl.toFixed(2)}</strong></div>
          <div><small>TRADE COUNT</small><strong>{tradeCount}</strong></div>
          <div><small>ENTRY</small><strong>{parityLabel} · {duration}T</strong></div>
        </section>

        <div className="df-actions">
          <button type="button" className={running ? "df-stop" : "df-run"} onClick={onRunStop} disabled={disabled || isPlacingTrade}>{running ? <><CircleStop size={17} />Stop</> : <><Play size={17} fill="currentColor" />Run DigitFlip</>}</button>
          <button type="button" className="df-reset" onClick={onReset} disabled={disabled}><RotateCcw size={16} />Reset session</button>
        </div>

        <section className="df-recent">
          <div className="df-recent-head"><div><h3>Recent DigitFlip trades</h3><small>Dashboard rows only · Deriv records are not deleted</small></div><button type="button" onClick={onClearTrades} disabled={!recentTrades.length}><Trash2 size={14} />Clear</button></div>
           {!recentTrades.length ? <div className="df-empty">Even and Odd trades will appear here after a DigitFlip entry.</div> : recentTrades.slice(0, 10).map((trade) => {
             const settled = trade.status !== "open";
             return <div className="df-trade-row" key={trade.contract_id}><span><b>{trade.contract_type === "DIGITEVEN" ? "EVEN" : "ODD"}</b><small>{trade.symbol}</small></span><span><small>STAKE</small>{trade.buy_price.toFixed(2)}</span><span><small>STATUS</small>{trade.status}</span><strong className={settled && trade.profit < 0 ? "loss" : ""}>{settled ? `${trade.profit >= 0 ? "+" : ""}${trade.profit.toFixed(2)}` : "—"}</strong></div>;
           })}
        </section>
      </div>
    </section>
  );
}