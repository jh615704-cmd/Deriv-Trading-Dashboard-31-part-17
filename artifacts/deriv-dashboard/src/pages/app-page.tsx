import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Activity, ArrowDownRight, ArrowUpRight, Check, CircleAlert, CircleCheck,
  Clock3, Copy, FlaskConical, RefreshCw, Signal, Trash2, Wifi, LockKeyhole
} from 'lucide-react';
import {
  getGetDerivAccountsQueryKey, getGetDerivHistoryQueryKey, getGetDerivStatusQueryKey,
  useBuyDerivContract, useClearDerivHistory, useGetDerivAccounts, useGetDerivHistory,
  useGetDerivStatus, useTestDerivConnection, useGetDerivTokenStatus
} from '@workspace/api-client-react';
import { AppShell } from '@/components/layout/app-shell';
import { PatOnboarding } from '@/components/pat-onboarding';
import { getAccountBalance } from '@/lib/account-balance';

const money = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const time = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const historyTime = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

function tradeOutcome(status: string, profit: number) {
  const normalizedStatus = status.toLowerCase();
  if (normalizedStatus === 'open') {
    if (profit > 0) return 'WINNING';
    if (profit < 0) return 'LOSING';
    return 'OPEN';
  }
  if (normalizedStatus.includes('won') || profit > 0) return 'WON';
  if (normalizedStatus.includes('lost') || profit < 0) return 'LOST';
  return 'CLOSED';
}

function StatusDot({ active, amber = false }: { active: boolean; amber?: boolean }) {
  return <span className={`status-dot ${active ? (amber ? 'status-dot-amber' : 'status-dot-live') : 'status-dot-off'} `} aria-hidden="true" />;
}

export default function AppPage() {
  const queryClient = useQueryClient();
  const tokenStatusQuery = useGetDerivTokenStatus();
  
  // These queries should ideally be enabled only if token exists, but let's keep it simple
  // They will return error if no token, which is handled gracefully.
  const hasToken = Boolean(tokenStatusQuery.data?.has_token);

  const accountsQuery = useGetDerivAccounts({ query: { queryKey: getGetDerivAccountsQueryKey(), refetchInterval: 5000, enabled: hasToken } });
  const statusQuery = useGetDerivStatus({ query: { queryKey: getGetDerivStatusQueryKey(), refetchInterval: 1500, enabled: hasToken } });
   const historyQuery = useGetDerivHistory({ query: { queryKey: getGetDerivHistoryQueryKey(), refetchInterval: 1000, enabled: hasToken } });
  
  const testConnection = useTestDerivConnection();
  const buyContract = useBuyDerivContract();
  const clearHistory = useClearDerivHistory();
  
  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);
  const status = statusQuery.data;
  const history = historyQuery.data ?? [];
  
  const [amount, setAmount] = useState('1.00');
  const [duration, setDuration] = useState('5');
  const [buyCooldownUntil, setBuyCooldownUntil] = useState(0);
  const [cooldownClock, setCooldownClock] = useState(() => Date.now());
  const [contractType, setContractType] = useState<'DIGITEVEN' | 'DIGITODD'>('DIGITEVEN');
  const [symbol, setSymbol] = useState('');
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testFailed, setTestFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmLiveTrade, setConfirmLiveTrade] = useState(false);
  const [clearHistoryArmed, setClearHistoryArmed] = useState(false);

  const selectedAccount = (status?.account ? accounts.find((account) => account.id === status.account?.id) ?? status.account : undefined)
    ?? accounts.find((account) => account.type === 'demo')
    ?? accounts[0];
  
  const isReal = selectedAccount?.type === 'real';
  const serverSelected = status?.account?.id === selectedAccount?.id;
  const liveBalance = status?.account?.id === selectedAccount?.id
    ? getAccountBalance(status?.account)
    : getAccountBalance(selectedAccount);

  const effectiveSymbol = symbol || status?.symbol || '';
  const isInitialLoading = tokenStatusQuery.isLoading || (hasToken && (accountsQuery.isLoading || statusQuery.isLoading));
  const hasError = accountsQuery.isError || statusQuery.isError;
  const quote = status?.last_tick;
  const proposal = status?.last_proposal;
  
  const isTestPending = testConnection.isPending;
  const buyCooldownRemaining = Math.max(0, buyCooldownUntil - cooldownClock);
  const isBuyPending = buyContract.isPending;
  const proposalReady = Boolean(status?.authorized && serverSelected && effectiveSymbol && Number(amount) > 0 && Number(duration) >= 1 && Number(duration) <= 5);

  const refreshTradeResults = () => {
    void Promise.all([
      queryClient.refetchQueries({ queryKey: getGetDerivStatusQueryKey(), type: 'active' }),
      queryClient.refetchQueries({ queryKey: getGetDerivHistoryQueryKey(), type: 'active' }),
      queryClient.refetchQueries({ queryKey: getGetDerivAccountsQueryKey(), type: 'active' }),
    ]);
    window.setTimeout(() => {
      void queryClient.refetchQueries({ queryKey: getGetDerivStatusQueryKey(), type: 'active' });
      void queryClient.refetchQueries({ queryKey: getGetDerivHistoryQueryKey(), type: 'active' });
      void queryClient.refetchQueries({ queryKey: getGetDerivAccountsQueryKey(), type: 'active' });
    }, 180);
  };

  useEffect(() => {
    const timer = window.setInterval(() => setCooldownClock(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setConfirmLiveTrade(false);
  }, [selectedAccount?.id]);

  useEffect(() => {
    if (status?.account) {
      const balance = getAccountBalance(status.account);
      if (balance == null) return;
      queryClient.setQueryData(getGetDerivAccountsQueryKey(), (current: typeof accounts) =>
        current?.map((account) =>
          account.id === status.account?.id
            ? { ...account, balance }
            : account,
        ) ?? current,
      );
    }
  }, [accounts, queryClient, status?.account]);

  const handleTestConnection = () => {
    setTestMessage(null);
    setTestFailed(false);
    testConnection.mutate(undefined, {
      onSuccess: (result) => {
        setTestMessage(result.message);
        setTestFailed(!result.ok);
        queryClient.setQueryData(getGetDerivAccountsQueryKey(), result.accounts);
        queryClient.setQueryData(getGetDerivStatusQueryKey(), result.status);
      },
      onError: (error) => {
        setTestFailed(true);
        setTestMessage(error instanceof Error ? error.message : 'Connection test could not complete.');
      },
    });
  };

  const handleBuy = () => {
    if (!proposalReady || buyCooldownRemaining > 0 || isBuyPending || (isReal && !confirmLiveTrade)) return;
    setBuyCooldownUntil(Date.now() + 1000);
    buyContract.mutate(
      {
        data: {
          amount: Number(amount),
          duration: Number(duration),
          duration_unit: 't',
          contract_type: contractType,
          symbol: effectiveSymbol,
          confirm_live_trade: true,
        },
      },
      {
        onSuccess: (result) => {
          setTestFailed(false);
          setTestMessage(result.message);
          setConfirmLiveTrade(false);
          if (result.proposal) {
            queryClient.setQueryData(getGetDerivStatusQueryKey(), (current: typeof status) =>
              current ? { ...current, last_proposal: result.proposal } : current,
            );
          }
           refreshTradeResults();
        },
        onError: (error) => {
          setTestFailed(true);
          setTestMessage(error instanceof Error ? error.message : 'Buy request failed.');
        },
      },
    );
  };

  const handleClearHistory = () => {
    if (!clearHistoryArmed) {
      setClearHistoryArmed(true);
      setTestFailed(false);
       setTestMessage('Press again within two seconds to clear the recent rows for this account.');
      window.setTimeout(() => setClearHistoryArmed(false), 2000);
      return;
    }
    setClearHistoryArmed(false);
    clearHistory.mutate(undefined, {
      onSuccess: (result) => {
        setTestFailed(false);
        setTestMessage(result.message);
        queryClient.invalidateQueries({ queryKey: getGetDerivHistoryQueryKey() });
      },
      onError: (error) => {
        setTestFailed(true);
        setTestMessage(error instanceof Error ? error.message : 'History could not be cleared.');
      },
    });
  };

  const copyLongcode = async () => {
    if (!proposal?.longcode) return;
    await navigator.clipboard?.writeText(proposal.longcode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  if (isInitialLoading) {
    return (
      <AppShell title="LIVE DASHBOARD">
        <div className="page-skeleton"><div className="skeleton-line wide" /><div className="skeleton-line medium" /><div className="skeleton-grid">{[1, 2, 3].map((item) => <div className="skeleton-card" key={item} />)}</div></div>
      </AppShell>
    );
  }

  if (!hasToken) {
    return (
      <AppShell title="CONNECTION SETUP">
        <PatOnboarding />
      </AppShell>
    );
  }

  return (
    <AppShell 
      title="LIVE DASHBOARD" 
      onRefresh={() => { accountsQuery.refetch(); statusQuery.refetch(); }}
      headerContent={
        <button type="button" className="icon-button" title="Refresh data" aria-label="Refresh account data" data-testid="button-refresh-data" onClick={() => { accountsQuery.refetch(); statusQuery.refetch(); }}>
          <RefreshCw size={16} />
        </button>
      }
    >
      <section className="intro-row">
        <div>
          <div className="eyebrow"><span className="eyebrow-rule" />OPERATIONS / 01</div>
          <h1>Connection <em>control.</em></h1>
          <p className="intro-copy">A clear line between your Deriv connection and the next test.</p>
        </div>
        <div className="test-action">
          <div className={`last-check ${testFailed ? 'last-check-failed' : ''}`}>{testMessage ? <>{testFailed ? <CircleAlert size={13} /> : <CircleCheck size={13} />}{testMessage}</> : 'Run a fresh health check before testing'}</div>
          <button type="button" className="primary-button" data-testid="button-test-connection" onClick={handleTestConnection} disabled={isTestPending}>
            {isTestPending ? <RefreshCw className="spin" size={16} /> : <Wifi size={16} />}
            {isTestPending ? 'Testing line…' : 'Test connection'}
          </button>
        </div>
      </section>

      {hasError && (
        <div className="error-banner" data-testid="status-load-error">
          <CircleAlert size={18} />
          <div><strong>We could not read the Deriv workspace.</strong><p>Check the API server, then try the connection test again.</p></div>
          <button type="button" className="text-button" data-testid="button-retry-load" onClick={() => { accountsQuery.refetch(); statusQuery.refetch(); }}>Retry</button>
        </div>
      )}

      <section className="signal-strip" aria-label="Connection status">
        <div className="signal-cell">
          <div className="signal-label"><StatusDot active={Boolean(status?.connected)} />NETWORK</div>
          <strong data-testid="status-network">{status ? (status.connected ? 'Connected' : 'Offline') : 'Awaiting test'}</strong>
          <span>{status?.last_tick ? `Last tick ${time.format(new Date(status.last_tick.epoch * 1000))}` : 'No telemetry received'}</span>
        </div>
        <div className="signal-cell">
          <div className="signal-label"><StatusDot active={Boolean(status?.authorized)} />AUTHORIZATION</div>
          <strong data-testid="status-authorization">{status ? (status.authorized ? 'Authorized' : 'Not authorized') : 'Awaiting test'}</strong>
          <span>{selectedAccount ? `${selectedAccount.type === 'real' ? 'LIVE DERIV' : 'DERIV DEMO'} / ${selectedAccount.currency}` : 'No account selected'}</span>
        </div>
        <div className="signal-cell">
          <div className="signal-label"><StatusDot active={Boolean(status?.bot_running)} amber />BOT STATE</div>
          <strong data-testid="status-bot">{status?.bot_running ? 'Running' : 'Standby'}</strong>
          <span>Execution is not initiated here</span>
        </div>
        <div className="signal-cell signal-cell-accent">
          <div className="signal-label"><Signal size={13} />MARKET CHANNEL</div>
          <strong data-testid="text-symbol">{status?.symbol ?? '—'}</strong>
          <span>{status?.currency ?? '—'} denomination</span>
        </div>
      </section>

      <div className="section-heading proposal-heading"><div><span className="section-index">01</span><h2>Trade desk</h2></div><span className="section-note">Choose a stake and contract, then Buy requests and executes immediately</span></div>
      <section className="quote-layout">
        <div className="quote-panel panel">
          <div className="panel-header"><div><span className="panel-overline">LIVE QUOTE</span><h3>{quote?.symbol ?? status?.symbol ?? 'No symbol selected'}</h3></div><div className="quote-live"><span className="pulse-dot" />{quote ? 'LIVE' : 'QUIET'}</div></div>
          {quote ? <div className="quote-readout"><div className="quote-value" data-testid="text-quote">{quote.quote.toFixed(4)}</div><div className="quote-time"><Clock3 size={13} />{time.format(new Date(quote.epoch * 1000))}<span>epoch {quote.epoch}</span></div><div className="quote-ticks"><span className="tick-bar bar-a" /><span className="tick-bar bar-b" /><span className="tick-bar bar-c" /><span className="tick-bar bar-d" /><span className="tick-bar bar-e" /><span className="tick-bar bar-f" /><span className="tick-bar bar-g" /><span className="tick-bar bar-h" /></div></div> : <div className="empty-state quote-empty"><Activity size={22} /><strong>Waiting for market telemetry</strong><span>A successful connection test will hydrate the latest quote.</span></div>}
          <div className="quote-foot"><span>STREAM STATUS</span><b>{status?.connected ? 'WebSocket available' : 'Not connected'}</b></div>
        </div>

        <form className={`proposal-panel panel ${!serverSelected ? 'proposal-disabled' : ''}`} onSubmit={(event) => { event.preventDefault(); handleBuy(); }}>
          <div className="panel-header"><div><span className="panel-overline">TRADE REQUEST</span><h3>{isReal ? 'Live account buy' : 'Demo account buy'}</h3></div><FlaskConical size={19} className="panel-icon" /></div>
          {!serverSelected && <div className="guardrail"><LockKeyhole size={16} /><span><b>Account switch in progress.</b> Wait for the selected session to connect.</span></div>}
          <div className="form-grid">
            <label className="field"><span>STAKE</span><div className="input-with-prefix"><i>{selectedAccount?.currency ?? '$'}</i><input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={!serverSelected} data-testid="input-proposal-amount" /></div></label>
            <div className="field"><span>DURATION / TICKS</span><div className="tick-choice-group" role="group" aria-label="Trade duration in ticks">{[1, 2, 3, 4, 5].map((tickCount) => <button type="button" key={tickCount} className={`tick-choice ${Number(duration) === tickCount ? 'tick-choice-selected' : ''}`} onClick={() => setDuration(String(tickCount))} disabled={!serverSelected} data-testid={`button-duration-${tickCount}`}>{tickCount}</button>)}</div></div>
            <label className="field field-wide"><span>SYMBOL</span><input value={effectiveSymbol} onChange={(event) => setSymbol(event.target.value)} placeholder={status?.symbol ?? 'Symbol from status'} disabled={!serverSelected} data-testid="input-proposal-symbol" /></label>
          </div>
          <div className="direction-label">DIGIT CONTRACT</div>
          <div className="direction-group"><button type="button" className={`direction-button call ${contractType === 'DIGITEVEN' ? 'direction-selected' : ''}`} onClick={() => setContractType('DIGITEVEN')} disabled={!serverSelected} data-testid="button-contract-even"><ArrowUpRight size={16} /><span>EVEN</span><small>Last digit is even</small></button><button type="button" className={`direction-button put ${contractType === 'DIGITODD' ? 'direction-selected' : ''}`} onClick={() => setContractType('DIGITODD')} disabled={!serverSelected} data-testid="button-contract-odd"><ArrowDownRight size={16} /><span>ODD</span><small>Last digit is odd</small></button></div>
          {isReal && <label className="live-confirm"><input type="checkbox" checked={confirmLiveTrade} onChange={(event) => setConfirmLiveTrade(event.target.checked)} /><span><b>I understand this can spend real funds.</b> Require explicit confirmation before buying this proposal.</span></label>}
          <div className="buy-submit-row"><span className="proposal-hint">No configured max stake · Deriv and available balance decide what can be bought</span>{selectedAccount && <button type="button" className="live-buy-button" disabled={!proposalReady || buyCooldownRemaining > 0 || isBuyPending || (isReal && !confirmLiveTrade) || (isReal && !status?.live_trading_enabled)} onClick={handleBuy} data-testid="button-buy-contract">{isBuyPending ? <><RefreshCw className="spin" size={16} />Requesting quote + buying…</> : `Buy ${selectedAccount.currency} (${isReal ? 'LIVE' : 'DEMO'})`}</button>}<span className={`buy-cooldown ${buyCooldownRemaining > 0 ? 'buy-cooldown-active' : ''}`} aria-live="polite">{buyCooldownRemaining > 0 ? `Cooldown ${Math.ceil(buyCooldownRemaining / 100) / 10}s` : 'Ready — 1 second between buys'}</span></div>
        </form>
      </section>

      <section className="response-panel panel">
        <div className="response-heading"><div><span className="panel-overline">LAST SERVER RESPONSE</span><h3>Proposal telemetry</h3></div><span className={`response-state ${proposal ? 'response-state-ready' : ''}`}><span />{proposal ? 'Live quote' : 'No quote yet'}</span></div>
        <div className="digit-meter" aria-label="Live odd and even market meter"><div className="digit-meter-labels"><span className="digit-meter-even"><i />EVEN <b>{status?.digit_even_percentage ?? 50}%</b></span><span className="digit-meter-odd"><i />ODD <b>{status?.digit_odd_percentage ?? 50}%</b></span></div><div className="digit-meter-track"><span className="digit-meter-even-fill" style={{ width: `${status?.digit_even_percentage ?? 50}%` }} /><span className="digit-meter-odd-fill" style={{ width: `${status?.digit_odd_percentage ?? 50}%` }} /></div><small>{status?.digit_sample_count ?? 0} live market digits observed</small></div>
        {proposal ? <div className="proposal-output"><div className="output-metric"><span>ASK PRICE</span><strong data-testid="text-ask-price">{money.format(proposal.ask_price)}</strong><small>{selectedAccount?.currency ?? status?.currency ?? ''}</small></div><div className="output-metric"><span>PAYOUT</span><strong data-testid="text-payout">{money.format(proposal.payout)}</strong><small>{selectedAccount?.currency ?? status?.currency ?? ''}</small></div><div className="output-metric"><span>SPOT</span><strong data-testid="text-spot">{proposal.spot.toFixed(4)}</strong><small>{proposal.id}</small></div><div className="longcode-output"><span>CONTRACT DESCRIPTION</span><div><p>{proposal.longcode ?? 'No longcode returned by Deriv.'}</p>{proposal.longcode && <button type="button" className="copy-button" onClick={copyLongcode} title="Copy contract description" aria-label="Copy contract description" data-testid="button-copy-longcode">{copied ? <Check size={15} /> : <Copy size={15} />}</button>}</div></div></div> : <div className="response-empty"><div className="empty-marker"><span /></div><div><strong>Proposal output will appear here</strong><p>Select a session and request a fresh server-side quote.</p></div></div>}
        {status?.last_contract && <div className="contract-live-card" data-testid="live-contract-card"><div><span className="panel-overline">LIVE CONTRACT</span><strong>{status.last_contract.status}</strong><small>Contract {status.last_contract.contract_id}</small></div><div><span>PROFIT / LOSS</span><b className={status.last_contract.profit >= 0 ? 'profit-positive' : 'profit-negative'}>{money.format(status.last_contract.profit)} {selectedAccount?.currency ?? status.currency}</b></div><div><span>LIVE BALANCE</span><b>{liveBalance == null ? '—' : money.format(liveBalance)} {selectedAccount?.currency ?? status.currency}</b></div></div>}
      </section>

      <section className="history-panel panel">
         <div className="response-heading"><div><span className="panel-overline">DERIV ACCOUNT ACTIVITY</span><h3>Trading history</h3></div><div className="history-actions"><span className="response-state"><span />{history.length} recorded</span><button type="button" className={`clear-history-button ${clearHistoryArmed ? 'clear-history-armed' : ''}`} onClick={handleClearHistory} disabled={clearHistory.isPending} title={clearHistoryArmed ? 'Press again to clear this account history' : 'Press twice to clear recent rows for this account'} aria-label={clearHistoryArmed ? 'Press again to clear this account history' : 'Clear this account history'} data-testid="button-clear-history"><Trash2 size={14} />{clearHistoryArmed ? 'Press again' : 'Clear'}</button></div></div>
          {history.length ? <div className="history-table-wrap"><table className="history-table"><thead><tr><th>ACCOUNT</th><th>CONTRACT / ID</th><th>MARKET</th><th>BARRIER</th><th>STAKE</th><th>VALUE NOW</th><th>PAYOUT</th><th>PROFIT / LOSS</th><th>STATUS</th><th>OPENED</th><th>SETTLED</th></tr></thead><tbody>{history.map((trade) => <tr key={`${trade.account_id}-${trade.contract_id}`}><td><span className={`history-account ${trade.account_type}`}>{trade.account_type === 'real' ? 'LIVE' : 'DEMO'}</span><small>{trade.account_id}</small></td><td><b>{trade.contract_type}</b><small className="history-contract-id">#{trade.contract_id}</small></td><td>{trade.symbol}</td><td>{trade.barrier ?? '—'}</td><td>{trade.currency} {money.format(trade.buy_price)}</td><td>{trade.currency} {money.format(trade.current_value)}</td><td>{trade.currency} {money.format(trade.payout)}</td><td className={trade.profit >= 0 ? 'profit-positive' : 'profit-negative'}>{trade.profit >= 0 ? '+' : ''}{trade.currency} {money.format(trade.profit)}</td><td><span className="history-status">{tradeOutcome(trade.status, trade.profit)}</span><small>{trade.status}</small></td><td>{trade.buy_time != null ? historyTime.format(new Date(trade.buy_time * 1000)) : '—'}</td><td>{trade.sell_time != null ? historyTime.format(new Date(trade.sell_time * 1000)) : '—'}</td></tr>)}</tbody></table></div> : <div className="response-empty history-empty"><div className="empty-marker"><span /></div><div><strong>No Deriv trades for this account yet</strong><p>Completed and open contracts for the selected account will appear here.</p></div></div>}
      </section>

    </AppShell>
  );
}