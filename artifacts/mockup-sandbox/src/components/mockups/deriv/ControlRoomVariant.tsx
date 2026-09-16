import { useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  Bot,
  ChevronRight,
  CircleHelp,
  Gauge,
  GitCompare,
  LayoutDashboard,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  TimerReset,
  Zap,
} from "lucide-react";
import "./ControlRoomVariant.css";

type MarketFamily = "volatility" | "jumps";

const digits = [
  { value: 0, rate: 8.8, streak: 2, trend: "steady" },
  { value: 1, rate: 11.6, streak: 4, trend: "rising" },
  { value: 2, rate: 9.4, streak: 1, trend: "cooling" },
  { value: 3, rate: 12.1, streak: 3, trend: "rising" },
  { value: 4, rate: 7.9, streak: 2, trend: "steady" },
  { value: 5, rate: 13.7, streak: 5, trend: "rising" },
  { value: 6, rate: 8.2, streak: 1, trend: "cooling" },
  { value: 7, rate: 10.3, streak: 3, trend: "steady" },
  { value: 8, rate: 9.8, streak: 2, trend: "rising" },
  { value: 9, rate: 8.2, streak: 1, trend: "cooling" },
] as const;

const symbols: Record<MarketFamily, string[]> = {
  volatility: ["Volatility 10 · R_10", "Volatility 50 · R_50", "Volatility 75 · R_75"],
  jumps: ["Jump 10 · JD10", "Jump 25 · JD25", "Jump 50 · JD50"],
};

const trades = [
  { side: "DIFFERS 6", symbol: "R_10", stake: "$1.20", result: "+$0.96", time: "14:32:08" },
  { side: "EVEN", symbol: "R_50", stake: "$0.80", result: "+$0.64", time: "14:29:41" },
  { side: "DIFFERS 2", symbol: "JD25", stake: "$1.00", result: "−$1.00", time: "14:25:16" },
];

export default function ControlRoomVariant() {
  const [section, setSection] = useState("trade-x");
  const [market, setMarket] = useState<MarketFamily>("volatility");
  const [symbol, setSymbol] = useState(symbols.volatility[0]);
  const [selectedDigit, setSelectedDigit] = useState(6);
  const [duration, setDuration] = useState(3);
  const [running, setRunning] = useState(false);
  const [smartAuto, setSmartAuto] = useState(false);
  const [refreshed, setRefreshed] = useState(false);
  const [message, setMessage] = useState("Ready for a deliberate entry");

  const selectedData = useMemo(
    () => digits.find((digit) => digit.value === selectedDigit) ?? digits[0],
    [selectedDigit],
  );
  const ranking = useMemo(
    () => [...digits].sort((left, right) => left.rate - right.rate).slice(0, 3),
    [],
  );

  const changeMarket = (next: MarketFamily) => {
    setMarket(next);
    setSymbol(symbols[next][0]);
    setMessage(`${next === "volatility" ? "Volatility" : "Jump"} family loaded`);
  };

  const refreshSignal = () => {
    setRefreshed(true);
    setMessage("Signal sample refreshed · 48 ticks observed");
    window.setTimeout(() => setRefreshed(false), 800);
  };

  const handleTrade = () => {
    setMessage(`Trade X sent · digit ${selectedDigit} · ${duration} ticks`);
    setRunning(true);
    window.setTimeout(() => setRunning(false), 1100);
  };

  return (
    <div className="crv-root">
      <div className="crv-shell">
        <aside className="crv-rail">
          <div className="crv-rail-top">
            <div>
              <div className="crv-brand">
                <span className="crv-brand-mark">J</span>
                <span className="crv-brand-copy">JDY <em>AI</em></span>
              </div>
              <p className="crv-rail-kicker">CONNECTION CENTER / 04</p>
              <nav className="crv-nav" aria-label="Workspace sections">
                <button type="button" className={`crv-nav-item ${section === "overview" ? "active" : ""}`} onClick={() => setSection("overview")}>
                  <LayoutDashboard size={16} />Overview<small>01</small>
                </button>
                <button type="button" className={`crv-nav-item ${section === "trade-x" ? "active" : ""}`} onClick={() => setSection("trade-x")}>
                  <GitCompare size={16} />Trade X<small>02</small>
                </button>
                <button type="button" className={`crv-nav-item ${section === "digit-flip" ? "active" : ""}`} onClick={() => setSection("digit-flip")}>
                  <Zap size={16} />DigitFlip<small>03</small>
                </button>
              </nav>
              <div className="crv-rail-rule" />
              <div className="crv-watch-title"><span>MARKET WATCH</span><span>LIVE</span></div>
              <div className="crv-watch-list">
                {["R_10", "R_50", "JD25"].map((item, index) => (
                  <div className="crv-watch-row" key={item}>
                    <i className={`crv-watch-dot ${index < 2 ? "live" : ""}`} />
                    <span className="crv-watch-name">{item}<small>{index === 2 ? "JUMP 25" : `VOLATILITY ${index === 0 ? "10" : "50"}`}</small></span>
                    <span className="crv-watch-value">{index === 0 ? "742.381" : index === 1 ? "928.064" : "184.227"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="crv-rail-foot">
            <div className="crv-operator">
              <span className="crv-avatar">EO</span>
              <span>EDGE operator<small>Session 04 · protected</small></span>
              <Settings2 size={14} color="#6f9db0" />
            </div>
            <div className="crv-connection"><i /> DERIV DEMO ACCOUNT / CONNECTED</div>
          </div>
        </aside>

        <main className="crv-main">
          <header className="crv-topbar">
            <div className="crv-crumbs"><span>WORKSPACE</span><span className="crv-slash">/</span><strong>CONTROL ROOM</strong></div>
            <div className="crv-top-actions">
              <span className="crv-env"><i />DEMO ACCOUNT CONNECTED</span>
              <button type="button" className="crv-top-button" onClick={refreshSignal}><RefreshCw size={13} className={refreshed ? "crv-rotating" : ""} />Refresh feed</button>
              <button type="button" className="crv-top-button" onClick={() => setMessage("Guide opened · sample evidence is descriptive")}><CircleHelp size={13} />Guide</button>
            </div>
          </header>

          <section className="crv-title-block">
            <div>
              <div className="crv-overline">OPERATIONS / LIVE SIGNAL</div>
              <h1>Choose the <em>cleanest</em> entry.</h1>
            </div>
            <p>One compact surface for market context, signal evidence, and a single deliberate action.</p>
          </section>

          <section className="crv-ticker" aria-label="Connection status">
            <div className="crv-ticker-cell accent"><span>NETWORK</span><strong>CONNECTED</strong><small>WebSocket available</small></div>
            <div className="crv-ticker-cell"><span>AUTHORIZATION</span><strong>AUTHORIZED</strong><small>DERIV DEMO / USD</small></div>
            <div className="crv-ticker-cell"><span>BOT STATE</span><strong>{smartAuto ? "WATCHING" : "STANDBY"}</strong><small>{smartAuto ? "Signal gate active" : "Execution not initiated"}</small></div>
            <div className="crv-ticker-cell"><span>MARKET CHANNEL</span><strong>R_10</strong><small>Last tick 14:32:10</small></div>
          </section>

          <div className="crv-workspace">
            <section className="crv-card crv-market-card">
              <div className="crv-card-head">
                <div><span className="crv-overline">01 / INSTRUMENT CONTEXT</span><h2>Market setup</h2><p>Keep the instrument and contract type explicit before reading the rail.</p></div>
                <Gauge size={18} className="crv-card-icon" />
              </div>
              <div className="crv-market-body">
                <div className="crv-field">
                  <span>MARKET FAMILY</span>
                  <div className="crv-segments">
                    <button type="button" className={`crv-segment ${market === "volatility" ? "selected" : ""}`} onClick={() => changeMarket("volatility")}>Volatility</button>
                    <button type="button" className={`crv-segment ${market === "jumps" ? "selected" : ""}`} onClick={() => changeMarket("jumps")}>Jumps</button>
                  </div>
                </div>
                <label className="crv-field"><span>SYMBOL</span><select className="crv-select" value={symbol} onChange={(event) => { setSymbol(event.target.value); setMessage(`${event.target.value} selected`); }}>{symbols[market].map((item) => <option key={item}>{item}</option>)}</select></label>
                <div className="crv-field"><span>LIVE QUOTE / LAST DIGIT</span><div className="crv-quote-box"><strong>742.3816</strong><span>last digit <small>6</small></span></div></div>
              </div>
            </section>

            <section className="crv-card crv-signal-card">
              <div className="crv-card-head">
                <div><span className="crv-overline">02 / DIGIT DISTRIBUTION</span><h2>Entry signal</h2><p>Recent frequency and absence streak, surfaced before execution.</p></div>
                <button type="button" className="crv-top-button" onClick={refreshSignal}><RefreshCw size={12} />Refresh</button>
              </div>
              <div className="crv-signal-summary">
                <div className="crv-summary-metric"><span>SIGNAL SAMPLE</span><strong>48 <small>ticks</small></strong></div>
                <div className="crv-summary-divider" />
                <div className="crv-summary-metric"><span>SELECTED DIGIT</span><strong>{selectedDigit}<small>{selectedData.rate < 9 ? "filter ready" : "ranked entry"}</small></strong></div>
                <span className="crv-live-badge"><i />LIVE TICKS</span>
              </div>
              <div className="crv-digit-grid" role="group" aria-label="Select a digit">
                {digits.map((digit) => <button type="button" key={digit.value} className={`crv-digit ${selectedDigit === digit.value ? "selected" : ""} ${ranking.some((item) => item.value === digit.value) ? "ranked" : ""}`} onClick={() => { setSelectedDigit(digit.value); setMessage(`Digit ${digit.value} selected`); }}><span className="crv-digit-number">{digit.value}</span><span className="crv-digit-rate">{digit.rate.toFixed(1)}%</span><span className="crv-digit-meta">{digit.streak}x absent · {digit.trend}</span></button>)}
              </div>
              <div className="crv-signal-detail">
                <div className="crv-detail-head"><span>DIFFERS {selectedDigit} / OBSERVED RATE</span><strong>{(100 - selectedData.rate).toFixed(0)}%</strong></div>
                <div className="crv-detail-bar"><i style={{ width: `${Math.max(10, selectedData.rate * 6.2)}%` }} /></div>
                <p className="crv-detail-note">{selectedData.rate < 9 ? "Low observed rate and a short absence streak meet the current filter. Descriptive signal, not a probability guarantee." : "This digit is above the current observed-rate filter. Choose a lower-ranked signal or refresh the sample."}</p>
              </div>
            </section>

            <section className="crv-card crv-rank-card">
              <div className="crv-card-head"><div><span className="crv-overline">03 / RANKED CANDIDATES</span><h2>Lowest observed differs</h2><p>Tap a candidate to make it the active barrier.</p></div><ShieldCheck size={18} className="crv-card-icon" /></div>
              <div className="crv-ranking">
                {ranking.map((digit, index) => <div className={`crv-rank-row ${selectedDigit === digit.value ? "selected" : ""}`} key={digit.value}>
                  <span className="crv-rank-no">0{index + 1}</span>
                  <button type="button" className="crv-rank-digit" onClick={() => { setSelectedDigit(digit.value); setMessage(`Rank ${index + 1} · digit ${digit.value} active`); }}>{digit.value}</button>
                  <span className="crv-rank-graph"><i style={{ width: `${digit.rate * 6.3}%` }} /></span>
                  <span className="crv-rank-stats"><b>{digit.rate.toFixed(1)}%</b><small>{digit.streak} tick streak</small></span>
                </div>)}
              </div>
              <button type="button" className="crv-tap" onClick={handleTrade}><Target size={13} />Use digit {selectedDigit} for next trade<ChevronRight size={13} /></button>
            </section>

            <section className="crv-card crv-execution-card">
              <div className="crv-card-head"><div><span className="crv-overline">04 / EXECUTION RAIL</span><h2>Send one deliberate action</h2><p>Duration, stake, then the final request.</p></div><TimerReset size={18} className="crv-card-icon" /></div>
              <div className="crv-execution-body">
                <div className="crv-field"><span>DURATION / TICKS</span><div className="crv-duration-list">{[1, 2, 3, 4, 5].map((item) => <button type="button" className={`crv-duration ${duration === item ? "selected" : ""}`} key={item} onClick={() => { setDuration(item); setMessage(`${item} tick duration selected`); }}><b>{item}</b><small>{item === 1 ? "tick" : "ticks"}</small></button>)}</div></div>
                <div className="crv-trade-preview"><span>REQUEST PREVIEW</span><strong>DIFFERS {selectedDigit} · {duration}T</strong><small>R_10 · $1.20 demo stake</small></div>
                <button type="button" className="crv-primary" onClick={handleTrade}><Sparkles size={18} /><span>{running ? "Sending trade…" : "Place Trade X trade"}<small>{running ? "Waiting for server response" : message}</small></span><ChevronRight size={17} /></button>
              </div>
            </section>
          </div>

          <div className="crv-footer-grid">
            <section className="crv-card crv-history">
              <div className="crv-history-head"><div><span className="crv-overline">DERIV ACCOUNT ACTIVITY</span><h2>Trading history</h2></div><small>3 recorded</small></div>
              <div className="crv-history-list">
                <div className="crv-history-row head"><span>CONTRACT</span><span>SYMBOL</span><span>RESULT</span><span>TIME</span></div>
                {trades.map((trade) => <div className="crv-history-row" key={`${trade.time}-${trade.symbol}`}><span>{trade.side}<small>DEMO · {trade.stake}</small></span><span>{trade.symbol}</span><span className={trade.result.startsWith("+") ? "crv-profit" : ""}>{trade.result}</span><span>{trade.time}</span></div>)}
              </div>
            </section>
            <section className="crv-card crv-pulse-card">
              <div className="crv-card-head"><div><span className="crv-overline">05 / PARITY PULSE</span><h2>Even / Odd sample</h2></div><Activity size={18} className="crv-card-icon" /></div>
              <div className="crv-pulse-body">
                <div className="crv-pulse-main"><span>OBSERVED SPLIT<strong>57.4 / 42.6</strong><small>EVEN LEADING</small></span><BarChart3 size={28} color="#55e5c2" /></div>
                <div className="crv-meter"><i style={{ width: "57.4%" }} /><i style={{ width: "42.6%" }} /></div>
                <div className="crv-meter-labels"><span>EVEN 57.4%</span><span>ODD 42.6%</span></div>
                <button type="button" className="crv-pulse-button" onClick={() => setSmartAuto(!smartAuto)}><Bot size={13} /> {smartAuto ? "Smart Auto enabled" : "Enable Smart Auto"}</button>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}