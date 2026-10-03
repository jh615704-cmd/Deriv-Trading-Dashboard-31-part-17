import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Activity, Trash2 } from "lucide-react";
import { createDerivHistoryRowView, type DerivHistoryRow } from "../lib/deriv-history";
export type { DerivHistoryRow } from "../lib/deriv-history";

function money(amount: number, currency?: string) {
  return currency === "USD"
    ? `$${amount.toFixed(2)}`
    : `${currency ? `${currency} ` : ""}${amount.toFixed(2)}`;
}

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
  hideSummary?: boolean;
  actions?: ReactNode;
};

export default function DerivHistory({ title, strategy, rows, currency, clearArmed = false, fading = false, onClear, sessionPnl, sessionTradeCount, hideSummary = false, actions }: Props) {
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
      {!hideSummary && <div className="deriv-history-summary">
        <div className="deriv-history-net"><small>{sessionPnl == null ? "VISIBLE HISTORY P/L" : "SESSION P/L"}</small><b className={pnl < 0 ? "negative" : "positive"}>{pnl >= 0 ? "+" : ""}{money(pnl, currency)}</b></div>
        <div><small>SETTLED WIN RATE</small><b>{rate == null ? "—" : `${rate.toFixed(1)}%`}</b></div>
        <div><small>{sessionTradeCount == null ? "ALL / WIN / LOSS" : "SESSION TRADES"}</small><b>{sessionTradeCount ?? `${rows.length} / ${wins} / ${losses}`}</b></div>
      </div>}
      <nav className="deriv-history-filters" aria-label={`Filter ${title} history`}>
        {(["all", "win", "loss"] as const).map((value) => <button type="button" key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)} aria-pressed={filter === value}>{value === "all" ? `All (${rows.length})` : value === "win" ? `Wins (${wins})` : `Losses (${losses})`}</button>)}
      </nav>
      <div className="deriv-history-list">
        {!visible.length ? <div className="deriv-history-empty">{rows.length ? "No contracts match this filter." : "Deriv contracts will appear here when this feature trades."}</div> : visible.map((row) => {
          const view = createDerivHistoryRowView(row, currency);
          return <article className="deriv-history-row" key={`${row.account_id}-${row.contract_id}`} data-testid={`deriv-history-${row.account_id}-${row.contract_id}`}>
            <div className="deriv-history-rowtop"><span className="deriv-history-feature">{strategy}</span><b className={`deriv-history-profit ${view.profitClass}`}>{view.profit}</b></div>
            <div className="deriv-history-market"><b>{view.symbol}</b><span className="deriv-history-account">{view.account}</span><small className="deriv-history-account-id">{view.accountId}</small><span className={`deriv-history-outcome ${view.outcomeClass}`}>{view.outcome}</span><strong>{view.contract}{view.barrier ? ` · ${view.barrier}` : ""}</strong></div>
            <div className="deriv-history-details">
              {view.details.map((detail) => <span key={detail.label}><small>{detail.label}</small><b>{detail.value}</b></span>)}
            </div>
          </article>;
        })}
      </div>
    </section>
  );
}