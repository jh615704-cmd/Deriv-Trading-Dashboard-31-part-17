import { ChevronDown, Info, Play, RotateCcw, ShieldCheck, Square, TrendingUp } from "lucide-react";
import "./money-bank-panel.css";

export type MoneyBankStrategy = "budget" | "manual";

export type MoneyBankLadderLevel = {
  name: string;
  stake: number;
  cumulative: number;
  profit: number;
};

export type MoneyBankStartConfig = {
  symbol: string;
  growthRate: number;
  takeProfitTicks: number;
  ladder: MoneyBankLadderLevel[];
  maxStake: number;
  autoCycle: boolean;
  reinvestProfit: boolean;
  profitTarget: number;
  lossLimit: number;
  cooldown: boolean;
};

type MoneyBankPanelProps = {
  isConnected: boolean;
  running: boolean;
  isReal: boolean;
  liveConfirmed: boolean;
  onLiveConfirm: (confirmed: boolean) => void;
  symbol: string;
  markets: readonly (readonly [string, string])[];
  onSymbolChange: (symbol: string) => void;
  accountBalance?: number;
  currency?: string;
  quote?: number | null;
  growthRate: number;
  onGrowthRateChange: (value: number) => void;
  takeProfitTicks: number;
  onTakeProfitTicksChange: (value: number) => void;
  strategy: MoneyBankStrategy;
  onStrategyChange: (strategy: MoneyBankStrategy) => void;
  budget: number;
  onBudgetChange: (value: number) => void;
  manualBase: number;
  onManualBaseChange: (value: number) => void;
  maxStake: number;
  onMaxStakeChange: (value: number) => void;
  autoCycle: boolean;
  onAutoCycleChange: (value: boolean) => void;
  reinvestProfit: boolean;
  onReinvestProfitChange: (value: boolean) => void;
  profitTarget: number;
  onProfitTargetChange: (value: number) => void;
  lossLimit: number;
  onLossLimitChange: (value: number) => void;
  cooldown: boolean;
  onCooldownChange: (value: boolean) => void;
  onStart: (config: MoneyBankStartConfig) => void;
  onStop: () => void;
  sessionPnl: number;
  tradeCount: number;
};

const LEVEL_NAMES = ["BASE", "L1", "L2", "L3", "L4", "L5", "L6"];
const GROWTH_RATES = [1, 2, 3, 4, 5];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function calculateRecoveryLadder(input: {
  strategy: MoneyBankStrategy;
  budget: number;
  manualBase: number;
  maxStake: number;
  growthRate: number;
  takeProfitTicks: number;
}): MoneyBankLadderLevel[] {
  const growth = clamp(input.growthRate, 1, 5) / 100;
  const ticks = clamp(input.takeProfitTicks, 3, 50);
  const payout = Math.max(0.08, Math.pow(1 + growth, ticks) - 1);
  const ratio = clamp(1.12 + (0.08 / (payout + 0.16)), 1.14, 1.42);
  const factors = LEVEL_NAMES.map((_, index) => Math.pow(ratio, index));
  const requestedBase = input.strategy === "budget"
    ? Math.max(0.01, input.budget) / factors.reduce((sum, factor) => sum + factor, 0)
    : Math.max(0.01, input.manualBase);
  const base = Math.min(Math.max(0.01, requestedBase), Math.max(0.01, input.maxStake));
  const maxStake = Math.max(0.01, input.maxStake);

  return LEVEL_NAMES.map((name, index) => {
    const stake = Math.min(maxStake, Math.max(0.01, base * factors[index]));
    const cumulative = LEVEL_NAMES.slice(0, index + 1)
      .reduce((sum, _, levelIndex) => sum + Math.min(maxStake, Math.max(0.01, base * factors[levelIndex])), 0);
    return {
      name,
      stake,
      cumulative,
      profit: stake * payout,
    };
  });
}

const money = (value: number, currency = "USD") =>
  `${currency === "USD" ? "$" : `${currency} `}${value.toFixed(2)}`;

export function MoneyBankPanel({
  isConnected,
  running,
  isReal,
  liveConfirmed,
  onLiveConfirm,
  symbol,
  markets,
  onSymbolChange,
  accountBalance,
  currency = "USD",
  quote,
  growthRate,
  onGrowthRateChange,
  takeProfitTicks,
  onTakeProfitTicksChange,
  strategy,
  onStrategyChange,
  budget,
  onBudgetChange,
  manualBase,
  onManualBaseChange,
  maxStake,
  onMaxStakeChange,
  autoCycle,
  onAutoCycleChange,
  reinvestProfit,
  onReinvestProfitChange,
  profitTarget,
  onProfitTargetChange,
  lossLimit,
  onLossLimitChange,
  cooldown,
  onCooldownChange,
  onStart,
  onStop,
  sessionPnl,
  tradeCount,
}: MoneyBankPanelProps) {
  const ladder = calculateRecoveryLadder({
    strategy,
    budget,
    manualBase,
    maxStake,
    growthRate,
    takeProfitTicks,
  });
  const estimatedReturn = (Math.pow(1 + growthRate / 100, takeProfitTicks) - 1) * 100;
  const recoveryStart = Math.max(3, Math.round(takeProfitTicks * 0.16));
  const selectedMarket = markets.find(([market]) => market === symbol)?.[1] ?? symbol;
  const totalCycleRisk = ladder.at(-1)?.cumulative ?? 0;
  const selectedStake = ladder[0]?.stake ?? 0;

  const submitStart = () => {
    if (running) {
      onStop();
      return;
    }
    onStart({
      symbol,
      growthRate,
      takeProfitTicks,
      ladder,
      maxStake,
      autoCycle,
      reinvestProfit,
      profitTarget,
      lossLimit,
      cooldown,
    });
  };

  return (
    <section className="money-bank-panel" aria-label="Money Bank Accumulator">
      <header className="money-bank-header">
        <div className="money-bank-brand">
          <div className="money-bank-mark"><TrendingUp size={18} /></div>
          <div>
            <div className="money-bank-title-row">
              <h2>Money Bank</h2>
              <span>Accumulator</span>
            </div>
            <p>Structured growth with controlled recovery</p>
          </div>
        </div>
        <div className={`money-bank-live-state ${running ? "running" : ""}`}>
          <i />
          {running ? "BOT ACTIVE" : "READY"}
        </div>
      </header>

      <div className="money-bank-body">
        <div className="money-bank-main">
          <section className="money-bank-card money-bank-market-card">
            <div className="money-bank-card-head">
              <div>
                <small>MARKET</small>
                <h3>Choose a Volatility pair</h3>
              </div>
              <span className="money-bank-filter-badge">VOLATILITY ONLY</span>
            </div>
            <label className="money-bank-select-wrap">
              <span>{selectedMarket}</span>
              <ChevronDown size={16} />
              <select
                value={symbol}
                onChange={(event) => onSymbolChange(event.target.value)}
                disabled={running || !isConnected}
                aria-label="Select a Volatility market"
              >
                {markets.map(([market, label]) => (
                  <option key={market} value={market}>{label}</option>
                ))}
              </select>
            </label>
            <div className="money-bank-market-meta">
              <span><i /> {isConnected ? "Live market available" : "Connect Deriv to stream quotes"}</span>
              {quote != null && <strong>{quote.toFixed(2)}</strong>}
            </div>
          </section>

          <section className="money-bank-card">
            <div className="money-bank-card-head">
              <div>
                <small>ACCUMULATOR SETTINGS</small>
                <h3>Growth rate</h3>
              </div>
              <strong className="money-bank-value-chip">{growthRate}%</strong>
            </div>
            <div className="money-bank-rate-grid">
              {GROWTH_RATES.map((rate) => (
                <button
                  key={rate}
                  type="button"
                  className={growthRate === rate ? "active" : ""}
                  onClick={() => onGrowthRateChange(rate)}
                  disabled={running}
                >
                  {rate}%
                </button>
              ))}
            </div>
            <p className="money-bank-helper"><Info size={14} /> Higher growth increases theoretical payout but tightens risk. <b>4% is the common balance setting.</b></p>
          </section>

          <section className="money-bank-card money-bank-ticks-card">
            <div className="money-bank-card-head">
              <div>
                <small>TAKE PROFIT</small>
                <h3>Contract ticks</h3>
              </div>
              <div className="money-bank-ticks-box">{takeProfitTicks}</div>
            </div>
            <input
              className="money-bank-range"
              type="range"
              min="3"
              max="50"
              step="1"
              value={takeProfitTicks}
              onChange={(event) => onTakeProfitTicksChange(Number(event.target.value))}
              disabled={running}
              aria-label="Take Profit ticks"
            />
            <div className="money-bank-range-track-label">Take profit target updates the return and every recovery level.</div>
          </section>

          <section className="money-bank-card money-bank-strategy-card">
            <div className="money-bank-card-head">
              <div>
                <small>BASE STRATEGY</small>
                <h3>How should BASE be set?</h3>
              </div>
              <ShieldCheck size={18} />
            </div>
            <div className="money-bank-segmented">
              <button type="button" className={strategy === "budget" ? "active" : ""} onClick={() => onStrategyChange("budget")} disabled={running}>
                <b>Auto (Budget)</b><small>Keep the cycle inside budget</small>
              </button>
              <button type="button" className={strategy === "manual" ? "active" : ""} onClick={() => onStrategyChange("manual")} disabled={running}>
                <b>Manual base</b><small>Choose BASE yourself</small>
              </button>
            </div>
            <div className="money-bank-input-grid">
              <label>
                <span>{strategy === "budget" ? "Budget" : "Manual BASE"}</span>
                <div className="money-bank-input-wrap">
                  <b>$</b>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={strategy === "budget" ? budget : manualBase}
                    onChange={(event) => (strategy === "budget" ? onBudgetChange : onManualBaseChange)(Math.max(0.01, Number(event.target.value) || 0.01))}
                    disabled={running}
                  />
                </div>
              </label>
              <div className="money-bank-calculated-base">
                <span>Calculated BASE</span>
                <strong>{money(selectedStake, currency)}</strong>
              </div>
            </div>
            <p className="money-bank-helper"><Info size={14} /> BASE is the first stake. A loss advances one level; a win recovers prior losses plus the target profit.</p>
          </section>
        </div>

        <aside className="money-bank-side">
          <section className="money-bank-return-card">
            <div className="money-bank-return-top">
              <span>ESTIMATED RETURN</span>
              <span className="money-bank-return-icon"><TrendingUp size={16} /></span>
            </div>
            <strong>+{estimatedReturn.toFixed(1)}%</strong>
            <p>Recovery {recoveryStart}–{takeProfitTicks} ticks @ {growthRate}%</p>
            <div className="money-bank-return-bar"><i style={{ width: `${clamp(estimatedReturn / 5, 8, 100)}%` }} /></div>
          </section>

          <section className="money-bank-card money-bank-ladder-card">
            <div className="money-bank-card-head">
              <div>
                <small>RECOVERY LADDER</small>
                <h3>BASE → L6</h3>
              </div>
              <span className="money-bank-risk-pill">{money(totalCycleRisk, currency)} cycle</span>
            </div>
            <div className="money-bank-ladder">
              {ladder.map((level, index) => (
                <div className={`money-bank-level ${index === 0 ? "base" : ""}`} key={level.name}>
                  <span><b>{level.name}</b>{index === 0 ? "First stake" : `After ${index} loss${index === 1 ? "" : "es"}`}</span>
                  <strong>{money(level.stake, currency)}</strong>
                  <small>win +{money(level.profit, currency)}</small>
                </div>
              ))}
            </div>
            <p className="money-bank-helper"><Info size={14} /> Levels cap at Max Stake. A win resets to BASE unless Reinvest Profit is enabled.</p>
          </section>

          <section className="money-bank-card money-bank-risk-card">
            <div className="money-bank-card-head">
              <div>
                <small>RISK & SESSION</small>
                <h3>Protect the session</h3>
              </div>
              <span className="money-bank-account-balance">{accountBalance != null ? money(accountBalance, currency) : "—"}</span>
            </div>
            <div className="money-bank-risk-grid">
              <label><span>Max Stake</span><div className="money-bank-input-wrap"><b>$</b><input type="number" min="0.01" step="0.01" value={maxStake} onChange={(event) => onMaxStakeChange(Math.max(0.01, Number(event.target.value) || 0.01))} disabled={running} /></div></label>
              <label><span>Profit target</span><div className="money-bank-input-wrap"><b>$</b><input type="number" min="0" step="1" value={profitTarget} onChange={(event) => onProfitTargetChange(Math.max(0, Number(event.target.value) || 0))} disabled={running} /></div></label>
              <label><span>Loss limit</span><div className="money-bank-input-wrap"><b>$</b><input type="number" min="0" step="1" value={lossLimit} onChange={(event) => onLossLimitChange(Math.max(0, Number(event.target.value) || 0))} disabled={running} /></div></label>
            </div>
            <div className="money-bank-toggle-list">
              <label><span><b>Auto cycle</b><small>Continue after each settlement</small></span><input type="checkbox" checked={autoCycle} onChange={(event) => onAutoCycleChange(event.target.checked)} disabled={running} /><i /></label>
              <label><span><b>Reinvest profit</b><small>Keep wins in the next BASE</small></span><input type="checkbox" checked={reinvestProfit} onChange={(event) => onReinvestProfitChange(event.target.checked)} disabled={running} /><i /></label>
              <label><span><b>Cooldown after loss</b><small>Pause before the next level</small></span><input type="checkbox" checked={cooldown} onChange={(event) => onCooldownChange(event.target.checked)} disabled={running} /><i /></label>
            </div>
          </section>
        </aside>
      </div>

      <footer className="money-bank-footer">
        <div className="money-bank-safety-copy">
          <ShieldCheck size={17} />
          <span><b>Recovery bot is bounded</b><small>It stops at L6, Max Stake, Profit target, or Loss limit.</small></span>
        </div>
        <div className="money-bank-session-stats">
          <span><small>SESSION P/L</small><b className={sessionPnl >= 0 ? "positive" : "negative"}>{sessionPnl >= 0 ? "+" : ""}{money(sessionPnl, currency)}</b></span>
          <span><small>TRADES</small><b>{tradeCount}</b></span>
        </div>
        {isReal && !liveConfirmed && (
          <label className="money-bank-live-confirm"><input type="checkbox" checked={liveConfirmed} onChange={(event) => onLiveConfirm(event.target.checked)} /><span>Confirm live funds</span></label>
        )}
        <button type="button" className={`money-bank-start ${running ? "stop" : ""}`} onClick={submitStart} disabled={!isConnected || (isReal && !liveConfirmed)}>
          {running ? <><Square size={15} /> Stop bot</> : <><Play size={15} /> Start accumulator</>}
        </button>
        <button type="button" className="money-bank-reset" onClick={() => { onGrowthRateChange(4); onTakeProfitTicksChange(3); onStrategyChange("budget"); }} disabled={running} title="Reset core settings">
          <RotateCcw size={15} />
        </button>
      </footer>
    </section>
  );
}