import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Activity, Trash2 } from "lucide-react";

export type DerivHistoryRow = {
  contract_id: string;
  contract_type: string;
  symbol: string;
  account_type?: string;
  barrier?: number | null;
  buy_price: number;
  current_value?: number | null;
  payout?: number | null;
  profit: number;
  status: string;
  buy_time?: number | null;
  sell_time?: number | null;
};

type Props = {
  title: string;
  strategy: string;
  rows: readonly DerivHistoryRow[];
  currency?: string;
  clearArmed?: boolean;
  fading?: boolean;
  onClear?: () => void;
  sessionPnl?: number;
  sessionTradeCount?: number;
  actions?: ReactNode;
};

const money = (amount: number, currency?: string) =>
  `${currency ? `${currency} ` : ""}${amount.toFixed(2)}`;

const timeLabel = (epoch?: number | null) => {
  if (epoch == null || !Number.isFinite(epoch)) return "—";
  const date = new Date(epoch * 1000);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString([], { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

export default function DerivHistory({ title, strategy, rows, currency, clearArmed = false, fading = false, onClear, sessionPnl, sessionTradeCount, actions }: Props) {
  const [filter, setFilter] = useState<"all" | "win" | "loss">("all");
  const settled = rows.filter((row) => row.status.toLowerCase() !== "open");
  const wins = settled.filter((row) => row.profit > 0).length;
  const losses = settled.filter((row) => row.profit < 0).length;
  const pnl = sessionPnl ?? settled.reduce((total, row) => total + row.profit, 0);
  const rate = settled.length ? (wins / settled.length) * 100 : null;
  const visible = useMemo(() => rows.filter((row) => {
    if (filter === "win") return row.status.toLowerCase() !== "open" && row.profit > 0;
    if (filter === "loss") return row.status.toLowerCase() !== "open" && row.profit < 0;
    return true;
  }), [filter, rows]);

  return (
    <section className={`deriv-history ${fading ? "is-fading" : ""}`} aria-label={`${title} Deriv history`}>
      <header className="deriv-history-head">
        <div className="deriv-history-title"><Activity size={17} /><span><b>{title}</b><small>Deriv contracts · local feature view</small></span></div>
        <div className="deriv-history-actions">
          {actions}
          {onClear && <button type="button" onClick={onClear} disabled={!rows.length || fading} aria-label={clearArmed ? `Tap again to clear ${title}` : `Clear ${title}`}><Trash2 size={14} />{clearArmed ? "Tap again" : "Clear"}</button>}
        </div>
      </header>
      <div className="deriv-history-summary">
        <div className="deriv-history-net"><small>{sessionPnl == null ? "VISIBLE HISTORY P/L" : "SESSION P/L"}</small><b className={pnl < 0 ? "negative" : "positive"}>{pnl >= 0 ? "+" : ""}{money(pnl, currency)}</b></div>
        <div><small>SETTLED WIN RATE</small><b>{rate == null ? "—" : `${rate.toFixed(1)}%`}</b></div>
        <div><small>{sessionTradeCount == null ? "ALL / WIN / LOSS" : "SESSION TRADES"}</small><b>{sessionTradeCount ?? `${rows.length} / ${wins} / ${losses}`}</b></div>
      </div>
      <nav className="deriv-history-filters" aria-label={`Filter ${title} history`}>
        {(["all", "win", "loss"] as const).map((value) => <button type="button" key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)} aria-pressed={filter === value}>{value === "all" ? `All (${rows.length})` : value === "win" ? `Wins (${wins})` : `Losses (${losses})`}</button>)}
      </nav>
      <div className="deriv-history-list">
        {!visible.length ? <div className="deriv-history-empty">{rows.length ? "No contracts match this filter." : "Deriv contracts will appear here when this feature trades."}</div> : visible.map((row) => {
          const status = row.status.toLowerCase();
          const open = status === "open";
          const outcome = open ? "OPEN" : row.profit > 0 ? "WON" : row.profit < 0 ? "LOST" : status.toUpperCase();
          const barrier = row.barrier == null ? "" : ` · ${row.contract_type.startsWith("DIGIT") ? "digit" : "barrier"} ${row.barrier}`;
          return <article className="deriv-history-row" key={row.contract_id} data-testid={`deriv-history-${row.contract_id}`}>
            <div className="deriv-history-rowtop"><span className="deriv-history-feature">{strategy}</span><b className={`deriv-history-profit ${row.profit < 0 ? "negative" : "positive"}`}>{row.profit >= 0 ? "+" : ""}{money(row.profit, currency)}</b></div>
            <div className="deriv-history-market"><b>{row.symbol}</b><span className="deriv-history-account">{row.account_type?.toUpperCase() ?? "ACCOUNT —"}</span><span className={`deriv-history-outcome ${open ? "open" : row.profit < 0 ? "loss" : "win"}`}>{outcome}</span><strong>{row.contract_type.replace("DIGIT", "")}{barrier}</strong></div>
            <div className="deriv-history-details">
              <span><small>OPENED</small><b>{timeLabel(row.buy_time)}</b></span>
              <span><small>SETTLED</small><b>{timeLabel(row.sell_time)}</b></span>
              <span><small>STAKE</small><b>{money(row.buy_price, currency)}</b></span>
              {row.current_value != null && <span><small>CURRENT VALUE</small><b>{money(row.current_value, currency)}</b></span>}
              {row.payout != null && <span><small>FULL PAYOUT</small><b>{money(row.payout, currency)}</b></span>}
              <span><small>STATUS</small><b>{row.status}</b></span>
            </div>
          </article>;
        })}
      </div>
    </section>
  );
}