import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAccessSessionQueryKey,
  useGetAccessSession,
  useDeleteDerivToken,
  useGetDerivAccounts,
  useGetDerivHistory,
  useGetDerivStatus,
  useGetDerivTokenStatus,
  useBulkBuyDerivContracts,
  useDualBuyDerivContracts,
  useBuyDerivContract,
  getDerivHistory,
  useSelectDerivAccount,
  useSelectDerivSymbol,
  useTestDerivConnection,
  useTestDerivToken,
  getGetDerivTokenStatusQueryKey,
  getGetDerivAccountsQueryKey,
  getGetDerivStatusQueryKey,
  getGetDerivHistoryQueryKey,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import {
  Activity, BookOpen, Bot, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign, Link2, Loader2,
  Pause, Play, Power, RefreshCw, RotateCcw, ShieldAlert, ShieldCheck, Trash2, X, Zap,
} from "lucide-react";
import {
  chooseBestDigitSignal,
  chooseBestEdgeSignal,
  digitForTick,
  nextStakeAfterSettlement,
  rankDigitsForDiffers,
  rankDigitsByDistribution,
  sessionStopReason,
  type BestEdgeSignal,
  type MarketSignal,
} from "../lib/trading-sequence";
import TradeXPanel, {
  type TradeXDigitDistribution,
  type TradeXDuration,
  type TradeXMarketType,
  type TradeXSymbolOption,
  type TradeXTradeCount,
} from "../components/trade-x-panel";
import DigitFlipPanel, {
  type DigitFlipDuration,
  type DigitFlipMarketSignal,
  type DigitFlipMarketType,
  type DigitFlipParity,
  type DigitFlipStakeMode,
} from "../components/digit-flip-panel";
import EdgeReferencePanel from "../components/edge-reference-panel";

const markets = [
  ["R_10", "Volatility 10 Index"], ["R_25", "Volatility 25 Index"],
  ["R_50", "Volatility 50 Index"], ["R_75", "Volatility 75 Index"],
  ["R_100", "Volatility 100 Index"], ["1HZ10V", "Volatility 10 (1s)"],
  ["1HZ25V", "Volatility 25 (1s)"], ["1HZ50V", "Volatility 50 (1s)"],
  ["1HZ75V", "Volatility 75 (1s)"], ["1HZ100V", "Volatility 100 (1s)"],
  ["JD10", "Jump 10 Index"], ["JD25", "Jump 25 Index"], ["JD50", "Jump 50 Index"],
  ["JD75", "Jump 75 Index"], ["JD100", "Jump 100 Index"],
] as const;

const guidePages = [
  { title: "Welcome to EDGE 🏔️", body: "EDGE is a digit-contract workspace for testing Over and Under ideas with a controlled stake, a selected market, and visible session results.", points: ["Use demo accounts while learning.", "Every trade uses the selected duration, stake, market, and barrier.", "The guide explains the controls before you start."] },
  { title: "Connect and choose an account", body: "Connect a Deriv PAT with read and trade permissions, then select the account you want to use. The active balance is refreshed from Deriv.", points: ["Demo accounts are the safest place to validate a strategy.", "Real accounts require live-trading confirmation.", "Account changes clear the active market session state."] },
  { title: "Markets and live ticks", body: "Each supported market streams live quotes. The final digit of each quote becomes the digit signal used by the streak display.", points: ["Switch markets from the Market selector.", "The last tick shows the current quote and final digit.", "Past ticks describe history; they do not control the next tick."] },
  { title: "What Over means", body: "An Over contract wins when the last digit at expiry is above the selected barrier. For example, Over 1 wins on digits 2 through 9.", points: ["Choose a barrier from the digit row.", "The button label always shows the current barrier.", "The result is decided by the contract expiry, not by the entry quote."] },
  { title: "What Under means", body: "An Under contract wins when the last digit at expiry is below the selected barrier. For example, Under 1 wins only on digit 0.", points: ["Over and Under have different winning ranges.", "Changing the barrier changes the winning range.", "Do not treat a visible streak as a promise about the next result."] },
  { title: "Choosing a digit barrier", body: "The digit row shows recent Over and Under streak lengths for each barrier. Selecting a digit changes both the contract label and the configuration summary.", points: ["A larger barrier gives Over more possible winning digits.", "A smaller barrier gives Under more possible winning digits.", "Compare the streaks with the payout and your risk limit."] },
  { title: "Duration in ticks", body: "Duration controls how many ticks the contract observes before settlement. Short durations resolve quickly and can also change rapidly.", points: ["Use 1 tick for fast experiments.", "Use longer durations only when your strategy is designed for them.", "Duration does not improve the probability by itself."] },
  { title: "Stake and balance", body: "Stake is the amount risked on each contract. The selected stake is used for the next Over or Under trade unless Martingale after loss is enabled.", points: ["Keep a reserve instead of risking the full balance.", "Martingale increases the next stake after a loss and resets after a win.", "A valid balance check cannot prevent market losses."] },
  { title: "Flat stake strategy", body: "Flat staking uses the same stake on every trade. It is the simplest baseline and makes session results easier to compare.", points: ["Use it to measure a signal without changing risk size.", "Set Take Profit and Stop Loss before starting.", "A losing trade does not automatically justify a larger next stake."] },
  { title: "Martingale after loss", body: "Martingale increases the next stake after a loss by the configured multiplier. It can grow exposure quickly and may exhaust a balance after a short losing run.", points: ["Set a low multiplier and a hard stop if you test it.", "The strategy is not a recovery guarantee.", "Demo testing is strongly recommended before any live use."] },
  { title: "Auto Best Digit", body: "Auto Best Digit ranks the live signals from all supported markets using available tick history, current sample size, and the strongest recent Over or Under streak. It selects a market, direction, and barrier for the next batch.", points: ["The score favors fresh markets with enough observations.", "It selects both Over or Under and the strongest observed signal.", "It is a signal-selection aid, not a prediction engine. No strategy guarantees an outcome."] },
  { title: "How the signal score works", body: "The built-in score compares recent consecutive digits above and below each candidate barrier across every subscribed market. Stronger, better-sampled signals rank higher.", points: ["Signals with no recent ticks are ignored.", "The selected market can change when a stronger signal appears.", "Recent streak length is descriptive, not proof of future probability."] },
  { title: "Manual Over and Under", body: "Use the Over or Under direction and trade controls in the execution area to send one contract using the selected barrier, duration, stake, and strategy.", points: ["The trade control sends one contract at a time.", "Martingale can multiply the next stake after a loss, but it cannot guarantee recovery.", "The next win resets the amount to the normal stake."] },
  { title: "Auto Best Digit", body: "Auto Best Digit starts the repeating loop after selecting the strongest available signal. Stop ends the loop after the active request completes.", points: ["Review the account, market, direction, barrier, duration, and stake first.", "The loop uses the current strategy and risk limits.", "Turning off EDGE stops the loop and hides its controls."] },
  { title: "Take Profit", body: "Take Profit stops the repeating loop after the session reaches the configured positive P/L. It applies to the local session total, not to your entire Deriv account history.", points: ["Choose an amount you can accept as a session target.", "The target is checked as results settle.", "Take Profit does not close a contract early."] },
  { title: "Stop Loss", body: "Stop Loss stops the repeating loop after the session reaches the configured negative P/L. It is a guardrail, not a guarantee that losses cannot exceed the target.", points: ["Use a smaller loss limit while testing.", "Bulk trades can settle after the loop is stopped.", "Review the trade history before starting another session."] },
  { title: "Live-money protection", body: "Real accounts require an explicit live-funds confirmation before Auto Best Digit or an immediate trade can send contracts.", points: ["Read the confirmation carefully.", "The server also enforces its live-trading configuration.", "If you are learning, switch back to a demo account."] },
  { title: "Reading session results", body: "Session P/L and Trades Sent show only activity since the last Reset. Recent Trades contains the dashboard rows received from the Deriv stream.", points: ["Reset clears only Session P/L and Trades Sent.", "Reset does not change stake, duration, barrier, or strategy.", "Clear Recent Trades removes dashboard rows without deleting Deriv records."] },
  { title: "A careful pre-trade checklist", body: "Before sending anything, confirm the account, market, direction, barrier, duration, stake, strategy, and risk limits.", points: ["Start with a demo account.", "Martingale increases exposure after losses, so keep a reserve.", "Never rely on a claimed guaranteed outcome."] },
  { title: "Let's start trading", body: "You now know how the market selector, Over and Under contracts, Martingale, Auto Best Digit, and risk controls work.", points: ["Start with one small demo trade.", "Watch the settlement and confirm the history updates.", "Keep the guide available whenever you change strategy."] },
] as const;

const tradeXGuidePages = [
  { title: "Welcome to Trade X", body: "Trade X is the Digit Differs workspace. It watches the live digit distribution, ranks the least frequent digits, and lets you decide whether to send one trade or use controlled automation.", points: ["Use a demo account while learning the signal.", "The signal describes observed ticks; it cannot guarantee the next digit.", "The switch pauses every Trade X action without changing EDGE."] },
  { title: "Read the distribution", body: "Each digit shows its observed percentage and current absence streak. The differs candidate list ranks digits with the lowest observed frequency first, because a Differs contract wins when the expiry digit is not the selected barrier.", points: ["Tap any oval digit to make it the active selection.", "The top three list follows the same live ranking.", "Refresh restarts the local sample window from the next market tick."] },
  { title: "Tick mapping", body: "Trade X can map the Smart Auto tick setting to a ranked candidate. One tick uses rank 1, two ticks uses rank 2, and so on through five ticks.", points: ["Ranked mode follows the live candidate order.", "Tap a digit or turn Manual Select on when you want an exact barrier.", "The active entry is shown before every action."] },
  { title: "Manual and automated actions", body: "Place Trade X Trade sends one Digit Differs contract using the active digit. Trade select sends the exact digit you tapped. Smart Auto waits for the configured observed signal score before entering.", points: ["Check market, stake, duration, and digit before sending.", "Manual digit taps switch to exact-digit selection so the request matches the screen.", "Smart Auto uses the live sample, ranked candidate, and trade count you choose."] },
  { title: "Smart Auto Trade", body: "Smart Auto Trade is an optional live-percentage gate. It sends as soon as the observed differs signal reaches your selected threshold.", points: ["The percentage is a live sample, not a promise of profit.", "The AI tick setting uses the same ranked tick mapping.", "Disable Smart Auto Trade to stop its loop immediately."] },
  { title: "A careful workflow", body: "Start with a small demo stake, wait for a meaningful sample, and treat every signal as descriptive market context rather than certainty.", points: ["Confirm the selected account is the one you intend to use.", "Use the lowest practical stake while evaluating a market.", "Stop automation before changing markets or strategy assumptions."] },
] as const;

const digitFlipGuidePages = [
  { title: "Welcome to DigitFlip", body: "DigitFlip trades Even or Odd contracts using a live parity sample. Estimates describe recent ticks and never guarantee the next contract result.", points: ["Start with a demo account.", "Only one of DigitFlip, Trade X, and EDGE can run at once.", "Auto Candidates reviews the strongest market every 10 seconds after settlement."] },
  { title: "Choose a market and parity", body: "DigitFlip starts with an automatically selected market, then lets you choose Volatility or Jump markets manually. Even and Odd have distinct selected states.", points: ["The quote and last digit are live telemetry.", "Recent percentages come from the selected market sample.", "The market selector does not predict the next digit."] },
  { title: "Stake and duration", body: "Choose 1 to 5 ticks and begin with a flat stake of 0.50 or more. Martingale after loss is optional and can grow exposure quickly.", points: ["Decimals are supported for the multiplier.", "Use a small stake while evaluating a signal.", "There is no max-stake control in this workspace."] },
  { title: "Run, stop, and reset", body: "Run starts the guarded loop. Stop prevents another entry after the active request. Reset clears only session P/L and current stake; it does not delete Deriv history.", points: ["Take Profit and Stop Loss stop the loop.", "Recent trades can be hidden from this dashboard.", "Hidden rows remain in Deriv."] },
  { title: "Reading the live parity", body: "DigitFlip uses the live Even and Odd percentages as market context. The percentages describe recent ticks and never guarantee the next contract result.", points: ["Wait for a meaningful live sample before trading.", "Use a small stake while evaluating a market.", "No condition is presented as a guaranteed win."] },
] as const;

const tradeXSymbols: readonly TradeXSymbolOption[] = markets.map(([value, label]) => ({
  value,
  label,
  marketType: value.startsWith("JD") ? "jumps" : "volatility",
}));

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const DIGIT_FLIP_SIGNAL_FLOOR = 80;
const DIGIT_FLIP_MARKET_SCAN_INTERVAL_MS = 10_000;
const EDGE_PERCENTAGE_SCAN_FLOOR = 90;
// The trading calendar is deliberately internal. "all-days" keeps the
// strategy available on both weekdays and weekends without adding another
// user-facing switch that could be mistaken for a market prediction.
const TRADING_CALENDAR_MODE = "all-days" as const;
const isTradingCalendarOpen = (date = new Date()) => (
  TRADING_CALENDAR_MODE === "all-days"
  || (TRADING_CALENDAR_MODE === "weekdays" && date.getDay() > 0 && date.getDay() < 6)
  || (TRADING_CALENDAR_MODE === "weekends" && (date.getDay() === 0 || date.getDay() === 6))
);
const errorMessage = (error: unknown) => {
  if (!error || typeof error !== "object") return "Request failed";
  const candidate = error as { data?: { error?: string }; message?: string };
  return candidate.data?.error ?? candidate.message ?? "Request failed";
};

function chooseBestOverThreeSignal(signals: MarketSignal[], excludeSymbol?: string): BestEdgeSignal | null {
  const candidates = signals
    .filter((signal) => signal.sample_count >= 5 && signal.quote != null && signal.symbol !== excludeSymbol)
    .map((signal) => {
      const outcome = signal.digit_outcomes?.find((item) => item.digit === 3);
      return outcome ? { signal, score: Number(outcome.over_percentage) } : null;
    })
    .filter((candidate): candidate is { signal: MarketSignal; score: number } => candidate !== null && Number.isFinite(candidate.score))
    .sort((left, right) => right.score - left.score || right.signal.sample_count - left.signal.sample_count);
  const best = candidates[0];
  return best ? { symbol: best.signal.symbol, direction: "DIGITOVER", digit: 3, score: best.score, sampleCount: best.signal.sample_count } : null;
}

function chooseBestAnalyzerSignal(signals: MarketSignal[], excludeSymbol?: string): BestEdgeSignal | null {
  const available = signals.filter((signal) => signal.symbol !== excludeSymbol);
  const candidates = available.flatMap((signal) => (signal.digit_outcomes ?? []).flatMap((outcome) => {
    const over = Number(outcome.over_percentage);
    const under = Number(outcome.under_percentage);
    if (!Number.isFinite(over) || !Number.isFinite(under)) return [];
    return [
      { symbol: signal.symbol, direction: "DIGITOVER" as const, digit: outcome.digit, score: over, sampleCount: signal.sample_count },
      { symbol: signal.symbol, direction: "DIGITUNDER" as const, digit: outcome.digit, score: under, sampleCount: signal.sample_count },
    ];
  })).filter((candidate) => candidate.sampleCount >= 5 && candidate.score >= 0);
  return candidates.sort((left, right) => right.score - left.score || right.sampleCount - left.sampleCount)[0] ?? null;
}

type MartingaleSettlementWatch = {
  knownIds: Set<string>;
  processedIds: Set<string>;
  amount: number;
  expectedSettlements: number;
};

type DigitFlipSettlementWatch = {
  knownIds: Set<string>;
  processedIds: Set<string>;
};

export default function XTraderPage() {
  const accessSession = useGetAccessSession({ query: { retry: false, queryKey: getGetAccessSessionQueryKey() } });
  const queryClient = useQueryClient();
  const isAdmin = accessSession.data?.is_admin === true;
  const canUseEdge = isAdmin || accessSession.data?.features.includes("edge") === true;
  const canUseDigitFlip = isAdmin || accessSession.data?.features.includes("digit-flip") === true || canUseEdge;
  const canUseTradeX = isAdmin || accessSession.data?.features.includes("trade-x") === true;
  const canUseDeriv = canUseEdge || canUseDigitFlip || canUseTradeX;
  const canViewHistory = isAdmin || accessSession.data?.features.includes("history") === true;
  const tokenStatus = useGetDerivTokenStatus({ query: { enabled: canUseDeriv, retry: false, queryKey: getGetDerivTokenStatusQueryKey() } });
  const connectedToken = Boolean(tokenStatus.data?.has_token);
  const accounts = useGetDerivAccounts({ query: { enabled: connectedToken && canUseDeriv, retry: false, refetchInterval: 10_000, queryKey: getGetDerivAccountsQueryKey() } });
  const storedPatInvalid = errorMessage(accounts.error).includes("saved Deriv token is no longer readable");
  const status = useGetDerivStatus({ query: { enabled: connectedToken && canUseDeriv, retry: false, refetchInterval: 500, queryKey: getGetDerivStatusQueryKey() } });
  const history = useGetDerivHistory({ query: { enabled: connectedToken && canViewHistory, retry: false, refetchInterval: 250, queryKey: getGetDerivHistoryQueryKey() } });
  const tokenMutation = useTestDerivToken();
  const connectionMutation = useTestDerivConnection();
  const deleteTokenMutation = useDeleteDerivToken();
  const accountMutation = useSelectDerivAccount();
  const symbolMutation = useSelectDerivSymbol();
  const bulkBuyMutation = useBulkBuyDerivContracts();
  const dualBuyMutation = useDualBuyDerivContracts();
  const digitFlipBuyMutation = useBuyDerivContract();

  const [pat, setPat] = useState("");
  const [symbol, setSymbol] = useState("R_75");
  const [direction, setDirection] = useState<"DIGITOVER" | "DIGITUNDER">("DIGITOVER");
  const [barrier, setBarrier] = useState(5);
  const [duration, setDuration] = useState(5);
  const [stake, setStake] = useState(1);
  const [strategy, setStrategy] = useState<"flat" | "martingale">("martingale");
  const [martingale, setMartingale] = useState(2);
  const [takeProfit, setTakeProfit] = useState(10);
  const [stopLoss, setStopLoss] = useState(10);
  const [autoSwitch, setAutoSwitch] = useState(false);
  const [edgePercentageMode, setEdgePercentageMode] = useState(false);
  const [edgeRecommendation, setEdgeRecommendation] = useState<BestEdgeSignal | null>(null);
  const [edgeOverThreeSniper, setEdgeOverThreeSniper] = useState(false);
  const [edgeBestPairAnalyzer, setEdgeBestPairAnalyzer] = useState(false);
  const [edgeScannerMessage, setEdgeScannerMessage] = useState<string | null>(null);
  const [edgeRiskBalance, setEdgeRiskBalance] = useState("");
  const [edgeAccountBalance, setEdgeAccountBalance] = useState("");
  const [edgeOutcomeMultiplier, setEdgeOutcomeMultiplier] = useState("");
  const [edgeOutcomeSynced, setEdgeOutcomeSynced] = useState(false);
  const [xTraderEnabled, setXTraderEnabled] = useState(false);
  const [tradeXEnabled, setTradeXEnabled] = useState(false);
  const [tradeXMarketType, setTradeXMarketType] = useState<TradeXMarketType>("volatility");
  const [tradeXSymbol, setTradeXSymbol] = useState("R_75");
  const [tradeXStake, setTradeXStake] = useState(1);
  const [tradeXSelectedDigit, setTradeXSelectedDigit] = useState(5);
  const [tradeXDuration, setTradeXDuration] = useState<TradeXDuration>(1);
  const [tradeXManualSelect, setTradeXManualSelect] = useState(false);
  const [tradeXSmartAuto, setTradeXSmartAuto] = useState(false);
  const [tradeXSmartConfidence, setTradeXSmartConfidence] = useState(95);
  const [tradeXSmartTradeCount, setTradeXSmartTradeCount] = useState<TradeXTradeCount>(1);
  const [tradeXSmartAiTicks, setTradeXSmartAiTicks] = useState<TradeXDuration>(1);
  const [digitFlipEnabled, setDigitFlipEnabled] = useState(false);
  const [digitFlipMarketType, setDigitFlipMarketType] = useState<DigitFlipMarketType>("auto");
  const [digitFlipSymbol, setDigitFlipSymbol] = useState("R_75");
  const [digitFlipParity, setDigitFlipParity] = useState<DigitFlipParity>("DIGITEVEN");
  const [digitFlipDuration, setDigitFlipDuration] = useState<DigitFlipDuration>(1);
  const [digitFlipStake, setDigitFlipStake] = useState(.5);
  const [digitFlipStakeMode, setDigitFlipStakeMode] = useState<DigitFlipStakeMode>("flat");
  const [digitFlipMultiplier, setDigitFlipMultiplier] = useState(2);
  const [digitFlipTakeProfit, setDigitFlipTakeProfit] = useState(10);
  const [digitFlipStopLoss, setDigitFlipStopLoss] = useState(10);
  const [digitFlipRunning, setDigitFlipRunning] = useState(false);
  const [digitFlipAssault, setDigitFlipAssault] = useState(false);
  const [digitFlipMagic, setDigitFlipMagic] = useState(false);
  const [digitFlipCurrentStake, setDigitFlipCurrentStake] = useState(.5);
  const [digitFlipSessionPnl, setDigitFlipSessionPnl] = useState(0);
  const [digitFlipTradeCount, setDigitFlipTradeCount] = useState(0);
  const [digitFlipSampleCount, setDigitFlipSampleCount] = useState(0);
  const [digitFlipEvenCount, setDigitFlipEvenCount] = useState(0);
  const [digitFlipRiskBalance, setDigitFlipRiskBalance] = useState("");
  const [digitFlipAccountBalance, setDigitFlipAccountBalance] = useState("");
  const [digitFlipOutcomeMultiplier, setDigitFlipOutcomeMultiplier] = useState("1");
  const [digitFlipOutcomeSynced, setDigitFlipOutcomeSynced] = useState(false);
  const [digitFlipClearArmed, setDigitFlipClearArmed] = useState(false);
  const [edgeHiddenHistoryIds, setEdgeHiddenHistoryIds] = useState<Set<string>>(new Set());
  const [digitFlipHiddenHistoryIds, setDigitFlipHiddenHistoryIds] = useState<Set<string>>(new Set());
  const [edgeMinWinRate, setEdgeMinWinRate] = useState(90);
  const [tradeXTradesSent, setTradeXTradesSent] = useState(0);
  const [tradeXMessage, setTradeXMessage] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guidePage, setGuidePage] = useState(0);
  const [guideMode, setGuideMode] = useState<"edge" | "trade-x" | "digit-flip">("edge");
  const [clearHistoryArmed, setClearHistoryArmed] = useState(false);
  const [historyFading, setHistoryFading] = useState(false);
  const [tradeXHistoryClearArmed, setTradeXHistoryClearArmed] = useState(false);
  const [tradeXHiddenHistoryIds, setTradeXHiddenHistoryIds] = useState<Set<string>>(new Set());
  const [liveConfirmed, setLiveConfirmed] = useState(false);
  const [sessionPnl, setSessionPnl] = useState(0);
  const [sessionTrades, setSessionTrades] = useState(0);
  const [analysisDigits, setAnalysisDigits] = useState<number[]>([]);
  const [analysisTickCount, setAnalysisTickCount] = useState(0);
  const [connectionMessage, setConnectionMessage] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [nextStake, setNextStake] = useState(stake);
  const runningRef = useRef(false);
  const autoSwitchRef = useRef(autoSwitch);
  const edgePercentageModeRef = useRef(edgePercentageMode);
  const edgeOverThreeSniperRef = useRef(edgeOverThreeSniper);
  const edgeBestPairAnalyzerRef = useRef(edgeBestPairAnalyzer);
  const edgeLossStreakRef = useRef(0);
  const edgeProcessedSettlementIdsRef = useRef(new Set<string>());
  const nextStakeRef = useRef(stake);
  const martingaleWatchRef = useRef<MartingaleSettlementWatch | null>(null);
  const analysisEpochRef = useRef<number | null>(null);
  const tradeXSmartRef = useRef(false);
  const tradeXActionLockRef = useRef(false);
  const digitFlipRunningRef = useRef(false);
  const digitFlipActionLockRef = useRef(false);
  const digitFlipAssaultRef = useRef(false);
  const digitFlipMagicRef = useRef(false);
  const digitFlipNextMarketScanAtRef = useRef(0);
  const digitFlipAutoSelectionKeyRef = useRef("");
  const digitFlipMarketSignalsRef = useRef<DigitFlipMarketSignal[]>([]);
  const digitFlipRatesRef = useRef({ even: 50, odd: 50 });
  const tradeXLastDigitRef = useRef<number | null>(null);
  const tradeXAnalysisDigitsRef = useRef<number[]>([]);
  const digitFlipConfigRef = useRef({
    marketType: digitFlipMarketType,
    symbol: digitFlipSymbol,
    parity: digitFlipParity,
    duration: digitFlipDuration,
    stake: digitFlipStake,
    stakeMode: digitFlipStakeMode,
    multiplier: digitFlipMultiplier,
  });
  const tradeXAnalysisRef = useRef({ tickCount: 0, confidence: 50 });
  const tradeXDistributionRef = useRef<TradeXDigitDistribution[]>([]);
  const edgeAnalysisRef = useRef({ sample: 0, overPercent: 50, underPercent: 50 });
  const liveTickSequenceRef = useRef(0);
  const digitFlipNextStakeRef = useRef(digitFlipStake);
  const digitFlipMartingaleWatchRef = useRef<{ knownIds: Set<string>; processedIds: Set<string> } | null>(null);
  const digitFlipAssaultWatchRef = useRef<DigitFlipSettlementWatch | null>(null);
  const digitFlipAssaultLossesRef = useRef<Record<DigitFlipParity, number>>({
    DIGITEVEN: 0,
    DIGITODD: 0,
  });
  const sessionAccountIdRef = useRef<string | null>(null);
  const edgeSessionKnownIdsRef = useRef<Set<string> | null>(null);
  const digitFlipSessionKnownIdsRef = useRef<Set<string> | null>(null);
  const configRef = useRef({
    direction,
    barrier,
    duration,
    stake,
    strategy,
    martingale,
     symbol,
    liveConfirmed,
    rankedDigits: [] as number[],
  });
  const tradeXConfigRef = useRef({
    symbol: tradeXSymbol,
    stake: tradeXStake,
    selectedDigit: tradeXSelectedDigit,
    duration: tradeXDuration,
    manualSelect: tradeXManualSelect,
    smartConfidence: tradeXSmartConfidence,
    smartTradeCount: tradeXSmartTradeCount,
    smartAiTicks: tradeXSmartAiTicks,
    rankedDigits: [] as number[],
  });

  const currentAccount = status.data?.account;
  const isReal = currentAccount?.type === "real";
  const isConnected = Boolean(status.data?.connected && status.data?.authorized);
  const rows = history.data ?? [];
  const edgeAllRows = rows.filter((trade) => trade.contract_type === "DIGITOVER" || trade.contract_type === "DIGITUNDER");
  const tradeXAllRows = rows.filter((trade) => trade.contract_type === "DIGITDIFF");
  const digitFlipAllRows = rows.filter((trade) => trade.contract_type === "DIGITEVEN" || trade.contract_type === "DIGITODD");
  const edgeRows = edgeAllRows.filter((trade) => !edgeHiddenHistoryIds.has(trade.contract_id));
  const tradeXRows = tradeXAllRows.filter((trade) => !tradeXHiddenHistoryIds.has(trade.contract_id));
  const digitFlipRows = digitFlipAllRows.filter((trade) => !digitFlipHiddenHistoryIds.has(trade.contract_id));
  const edgeSessionRows = edgeSessionKnownIdsRef.current
    ? edgeAllRows.filter((trade) => !edgeSessionKnownIdsRef.current?.has(trade.contract_id))
    : [];
  const digitFlipSessionRows = digitFlipSessionKnownIdsRef.current
    ? digitFlipAllRows.filter((trade) => !digitFlipSessionKnownIdsRef.current?.has(trade.contract_id))
    : [];
  const tradeXProfit = tradeXRows.reduce((sum, trade) => sum + (trade.status === "open" ? 0 : trade.profit), 0);
  const tradeXWins = tradeXRows.filter((trade) => trade.status !== "open" && trade.profit > 0).length;
  const tradeXLosses = tradeXRows.filter((trade) => trade.status !== "open" && trade.profit < 0).length;
  const settledPnl = edgeSessionRows.reduce((sum, trade) => sum + (trade.status === "open" ? 0 : trade.profit), 0);
  const liveContract = status.data?.last_contract;
  const liveContractRow = liveContract
    ? edgeAllRows.find((trade) => trade.contract_id === liveContract.contract_id)
    : undefined;
  const liveUnsettledPnl = liveContract
    && edgeSessionKnownIdsRef.current
    && !edgeSessionKnownIdsRef.current.has(liveContract.contract_id)
    && (!liveContractRow || liveContractRow.status === "open")
    ? liveContract.profit
    : 0;
  const fastSessionPnl = settledPnl + liveUnsettledPnl;
  const streaks = status.data?.digit_streaks ?? [];
  const lastDigit = status.data?.last_digit;
  const digitFlipEvenPercentage = digitFlipSampleCount ? (digitFlipEvenCount / digitFlipSampleCount) * 100 : 50;
  const digitFlipOddPercentage = digitFlipSampleCount ? 100 - digitFlipEvenPercentage : 50;
  const digitFlipMarketSignals = useMemo<DigitFlipMarketSignal[]>(
    () => (status.data?.market_signals ?? []).map((signal) => ({
      symbol: signal.symbol,
      evenPercentage: signal.digit_even_percentage,
      oddPercentage: signal.digit_odd_percentage,
      sampleCount: signal.sample_count,
    })),
    [status.data?.market_signals],
  );

  useEffect(() => {
    if (sessionAccountIdRef.current === currentAccount?.id) return;
    sessionAccountIdRef.current = currentAccount?.id ?? null;
    edgeSessionKnownIdsRef.current = null;
    digitFlipSessionKnownIdsRef.current = null;
  }, [currentAccount?.id]);

  useEffect(() => {
    if (history.data == null || sessionAccountIdRef.current == null) return;
    if (edgeSessionKnownIdsRef.current == null) {
      edgeSessionKnownIdsRef.current = new Set(edgeAllRows.map((trade) => trade.contract_id));
    }
    if (digitFlipSessionKnownIdsRef.current == null) {
      digitFlipSessionKnownIdsRef.current = new Set(digitFlipAllRows.map((trade) => trade.contract_id));
    }
  }, [history.data, edgeAllRows, digitFlipAllRows]);

  const analysis = useMemo(() => {
    const counts = Array.from({ length: 10 }, (_, digit) => analysisDigits.filter((value) => value === digit).length);
    const overCount = analysisDigits.filter((digit) => digit > barrier).length;
    const underCount = analysisDigits.filter((digit) => digit < barrier).length;
    const decisiveCount = overCount + underCount;
    const overPercent = decisiveCount ? (overCount / decisiveCount) * 100 : 50;
    const underPercent = decisiveCount ? (underCount / decisiveCount) * 100 : 50;
    const lean = overPercent >= underPercent ? "OVER" : "UNDER";
    return {
      counts,
      overPercent,
      underPercent,
      lean,
      maxCount: Math.max(1, ...counts),
    };
  }, [analysisDigits, barrier]);

  useEffect(() => {
    const settled = digitFlipSessionRows.reduce((sum, trade) => sum + (trade.status === "open" ? 0 : trade.profit), 0);
    const live = digitFlipSessionRows.find((trade) => trade.status === "open")?.profit ?? 0;
    setDigitFlipSessionPnl(settled + live);
    if (digitFlipStakeMode !== "martingale") {
      digitFlipNextStakeRef.current = digitFlipStake;
      if (!digitFlipRunning) setDigitFlipCurrentStake(digitFlipStake);
      return;
    }
    const watch = digitFlipMartingaleWatchRef.current;
    if (!watch) {
      digitFlipNextStakeRef.current = digitFlipStake;
      if (!digitFlipRunning) setDigitFlipCurrentStake(digitFlipStake);
      return;
    }
    const newlySettled = digitFlipSessionRows
      .filter((trade) => !watch.knownIds.has(trade.contract_id) && !watch.processedIds.has(trade.contract_id) && trade.status !== "open")
      .sort((left, right) => (left.buy_time ?? 0) - (right.buy_time ?? 0));
    if (!newlySettled.length) return;
    let next = digitFlipNextStakeRef.current;
    for (const trade of newlySettled) {
      next = nextStakeAfterSettlement(trade.profit, next, digitFlipStake, digitFlipMultiplier);
      watch.processedIds.add(trade.contract_id);
    }
    digitFlipNextStakeRef.current = next;
    setDigitFlipCurrentStake(next);
  }, [digitFlipSessionRows, digitFlipMultiplier, digitFlipRunning, digitFlipStake, digitFlipStakeMode]);
  const tradeXDistribution = useMemo<TradeXDigitDistribution[]>(() => {
    const total = analysisDigits.length;
    return analysis.counts.map((count, digit) => {
      let absentStreak = 0;
      for (let index = analysisDigits.length - 1; index >= 0 && analysisDigits[index] !== digit; index -= 1) {
        absentStreak += 1;
      }
      const midpoint = Math.floor(analysisDigits.length / 2);
      const previousCount = analysisDigits.slice(0, midpoint).filter((value) => value === digit).length;
      const recentCount = analysisDigits.slice(midpoint).filter((value) => value === digit).length;
      return {
        digit,
        // Laplace smoothing keeps every digit visible in a short live sample.
        // A zero observation is still informative, but should not render as a
        // frozen 0.0% probability while the other digits move.
        percentage: Number((((count + 1) / (total + 10)) * 100).toFixed(1)),
        streak: absentStreak,
        momentum: recentCount > previousCount ? "up" : recentCount < previousCount ? "down" : "flat",
        sampleCount: total,
      };
    });
  }, [analysis.counts, analysisDigits]);
  const tradeXRankedDigits = useMemo(
    () => analysisTickCount > 0
      ? rankDigitsForDiffers(analysis.counts, tradeXDistribution.map((item) => item.streak))
      : [],
    [analysis.counts, analysisTickCount, tradeXDistribution],
  );
  const tradeXRankedEntryDigit = digitForTick(tradeXDuration, tradeXRankedDigits, tradeXSelectedDigit);
  const tradeXEntryDigit = tradeXManualSelect ? tradeXSelectedDigit : tradeXRankedEntryDigit;
  const tradeXConfidence = tradeXDistribution.length
    ? Math.min(99, Math.max(50, Math.round(100 - (tradeXDistribution[tradeXEntryDigit]?.percentage ?? 0))))
    : 50;
  useEffect(() => {
    tradeXAnalysisRef.current = { tickCount: analysisTickCount, confidence: tradeXConfidence };
    tradeXDistributionRef.current = tradeXDistribution;
    tradeXLastDigitRef.current = lastDigit ?? null;
    tradeXAnalysisDigitsRef.current = analysisDigits;
    edgeAnalysisRef.current = {
      sample: analysisDigits.length,
      overPercent: analysis.overPercent,
      underPercent: analysis.underPercent,
    };
  }, [analysis, analysisDigits, analysisTickCount, lastDigit, tradeXConfidence, tradeXDistribution]);
  const rankedDigits = useMemo(
    () => analysisTickCount > 0 ? rankDigitsByDistribution(analysis.counts) : [],
    [analysis.counts, analysisTickCount],
  );

  useEffect(() => {
    configRef.current = { direction, barrier, duration, stake, strategy, martingale, symbol, liveConfirmed, rankedDigits };
  }, [direction, barrier, duration, stake, strategy, martingale, symbol, liveConfirmed, rankedDigits]);

  useEffect(() => {
    tradeXConfigRef.current = {
      symbol: tradeXSymbol,
      stake: tradeXStake,
      selectedDigit: tradeXEntryDigit,
      duration: tradeXDuration,
      manualSelect: tradeXManualSelect,
      smartConfidence: tradeXSmartConfidence,
      smartTradeCount: tradeXSmartTradeCount,
      smartAiTicks: tradeXSmartAiTicks,
      rankedDigits: tradeXRankedDigits,
    };
  }, [
    tradeXSymbol,
    tradeXStake,
    tradeXEntryDigit,
    tradeXDuration,
    tradeXManualSelect,
    tradeXSmartConfidence,
    tradeXSmartTradeCount,
    tradeXSmartAiTicks,
    tradeXRankedDigits,
  ]);

  useEffect(() => {
    if (storedPatInvalid) void tokenStatus.refetch();
  }, [storedPatInvalid, tokenStatus]);

  useEffect(() => {
    autoSwitchRef.current = autoSwitch;
  }, [autoSwitch]);

  useEffect(() => {
    edgePercentageModeRef.current = edgePercentageMode;
  }, [edgePercentageMode]);

  useEffect(() => {
    edgeOverThreeSniperRef.current = edgeOverThreeSniper;
    edgeBestPairAnalyzerRef.current = edgeBestPairAnalyzer;
  }, [edgeBestPairAnalyzer, edgeOverThreeSniper]);

  useEffect(() => {
    nextStakeRef.current = stake;
    setNextStake(stake);
  }, [stake, strategy]);

  useEffect(() => {
    const watch = martingaleWatchRef.current;
    if (!watch || strategy !== "martingale") return;
    const newlySettled = edgeRows
      .filter((trade) => !watch.knownIds.has(trade.contract_id) && !watch.processedIds.has(trade.contract_id) && trade.status !== "open")
      .sort((left, right) => (left.buy_time ?? 0) - (right.buy_time ?? 0));
    if (!newlySettled.length) return;

    let next = watch.amount;
    for (const settledTrade of newlySettled) {
      next = nextStakeAfterSettlement(settledTrade.profit, next, stake, martingale);
      watch.knownIds.add(settledTrade.contract_id);
      watch.processedIds.add(settledTrade.contract_id);
    }
    nextStakeRef.current = next;
    setNextStake(next);
    if (watch.processedIds.size >= watch.expectedSettlements) {
      martingaleWatchRef.current = null;
    }
  }, [edgeRows, strategy, martingale, stake]);

  useEffect(() => {
    const epoch = status.data?.last_tick?.epoch;
    const digit = status.data?.last_digit;
    if (epoch == null || digit == null) return;
    if (analysisEpochRef.current != null && epoch <= analysisEpochRef.current) return;
    analysisEpochRef.current = epoch;
    liveTickSequenceRef.current += 1;
    setAnalysisDigits((current) => [...current, digit].slice(-100));
    setAnalysisTickCount((current) => current + 1);
    if (digitFlipEnabled) {
      setDigitFlipSampleCount((current) => current + 1);
      if (digit % 2 === 0) setDigitFlipEvenCount((current) => current + 1);
    }
  }, [digitFlipEnabled, status.data?.last_tick?.epoch, status.data?.last_digit]);

  useEffect(() => {
    digitFlipAssaultRef.current = digitFlipAssault;
    digitFlipMagicRef.current = digitFlipMagic;
    digitFlipMarketSignalsRef.current = digitFlipMarketSignals;
    digitFlipRatesRef.current = { even: digitFlipEvenPercentage, odd: digitFlipOddPercentage };
    digitFlipConfigRef.current = {
      marketType: digitFlipMarketType,
      symbol: digitFlipSymbol,
      parity: digitFlipParity,
      duration: digitFlipDuration,
      stake: digitFlipStake,
      stakeMode: digitFlipStakeMode,
      multiplier: digitFlipMultiplier,
    };
  }, [digitFlipAssault, digitFlipMagic, digitFlipMarketSignals, digitFlipEvenPercentage, digitFlipOddPercentage, digitFlipMarketType, digitFlipSymbol, digitFlipParity, digitFlipDuration, digitFlipStake, digitFlipStakeMode, digitFlipMultiplier]);

  useEffect(() => {
    const pnl = fastSessionPnl;
    setSessionPnl(pnl);
    if (!running) return;
    const stopReason = sessionStopReason(pnl, takeProfit, stopLoss);
    if (stopReason) {
      runningRef.current = false;
      setRunning(false);
      setConnectionMessage({
        kind: "info",
        text: `${stopReason === "take-profit" ? "Take profit" : "Stop loss"} reached at ${pnl.toFixed(2)} ${currentAccount?.currency ?? "USD"}.`,
      });
    }
  }, [fastSessionPnl, running, takeProfit, stopLoss, currentAccount?.currency]);

  useEffect(() => {
    if (!digitFlipRunning) return;
    const stopReason = sessionStopReason(digitFlipSessionPnl, digitFlipTakeProfit, digitFlipStopLoss);
    if (!stopReason) return;
    digitFlipRunningRef.current = false;
    setDigitFlipRunning(false);
    setConnectionMessage({
      kind: "info",
      text: `DigitFlip ${stopReason === "take-profit" ? "take profit" : "stop loss"} reached at ${digitFlipSessionPnl.toFixed(2)} ${currentAccount?.currency ?? "USD"}.`,
    });
  }, [digitFlipSessionPnl, digitFlipRunning, digitFlipTakeProfit, digitFlipStopLoss, currentAccount?.currency]);

  useEffect(() => () => {
    runningRef.current = false;
    tradeXSmartRef.current = false;
    digitFlipRunningRef.current = false;
  }, []);

  const connectPat = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pat.trim()) return;
    setConnectionMessage({ kind: "info", text: "Validating PAT and opening the Deriv connection…" });
    try {
      const tokenResult = await tokenMutation.mutateAsync({ data: { token: pat.trim() } });
      setPat("");
      queryClient.setQueryData(getGetDerivAccountsQueryKey(), tokenResult.accounts);
      await queryClient.invalidateQueries({ queryKey: getGetDerivTokenStatusQueryKey() });
      await connectionMutation.mutateAsync();
      await queryClient.invalidateQueries({ queryKey: getGetDerivAccountsQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetDerivStatusQueryKey() });
      setConnectionMessage({ kind: "info", text: "Deriv connected. Your PAT is encrypted and saved." });
    } catch (error) {
      setConnectionMessage({ kind: "error", text: errorMessage(error) });
    }
  };

  const disconnect = async () => {
    runningRef.current = false;
    tradeXSmartRef.current = false;
    setRunning(false);
    setTradeXSmartAuto(false);
    await deleteTokenMutation.mutateAsync();
    queryClient.clear();
    void tokenStatus.refetch();
  };

  const chooseBestDigit = async () => {
    const signals = (status.data?.market_signals ?? []) as MarketSignal[];
    const fallback: MarketSignal = {
      symbol,
      quote: status.data?.last_tick?.quote ?? null,
      sample_count: status.data?.digit_sample_count ?? 0,
      digit_streaks: streaks,
    };
    const best = chooseBestDigitSignal(signals, fallback);
    if (!best) return;
    if (best.symbol !== symbol) await selectMarket(best.symbol);
    setDirection(best.direction);
    setBarrier(best.digit);
    configRef.current = { ...configRef.current, direction: best.direction, barrier: best.digit, symbol: best.symbol };
  };

  const applyPercentageRecommendation = async () => {
    const signals = (status.data?.market_signals ?? []) as MarketSignal[];
    const recommendation = chooseBestEdgeSignal(signals, EDGE_PERCENTAGE_SCAN_FLOOR);
    setEdgeRecommendation(recommendation);
    if (!recommendation) {
      setConnectionMessage({
        kind: "info",
        text: `Percentage scan is waiting for a cross-market observed outcome at or above ${EDGE_PERCENTAGE_SCAN_FLOOR}%.`,
      });
      return null;
    }
    if (recommendation.symbol !== configRef.current.symbol) {
      await selectMarket(recommendation.symbol);
    }
    const nextDirection = recommendation.direction === "DIGITUNDER" ? "DIGITUNDER" : "DIGITOVER";
    setDirection(nextDirection);
    setBarrier(recommendation.digit);
    configRef.current = {
      ...configRef.current,
      direction: nextDirection,
      barrier: recommendation.digit,
      symbol: recommendation.symbol,
    };
    setConnectionMessage({
      kind: "info",
      text: `Percentage scan recommends ${recommendation.direction === "DUAL" ? "Dual" : nextDirection === "DIGITOVER" ? "Over" : "Under"} ${recommendation.digit} on ${recommendation.symbol} at ${recommendation.score.toFixed(1)}% observed ${recommendation.direction === "DUAL" ? "coverage" : "share"}. This is evidence, not a guaranteed outcome.`,
    });
    return recommendation;
  };

  const selectEdgeAutomation = async (excludeSymbol?: string) => {
    const signals = (status.data?.market_signals ?? []) as MarketSignal[];
    const recommendation = edgeOverThreeSniperRef.current
      ? chooseBestOverThreeSignal(signals, excludeSymbol)
      : chooseBestAnalyzerSignal(signals, excludeSymbol);
    if (!recommendation) {
      setEdgeScannerMessage("Hunting all Volatility and Jump pairs for enough observed ticks…");
      return null;
    }
    if (recommendation.symbol !== configRef.current.symbol) await selectMarket(recommendation.symbol);
    const nextDirection = recommendation.direction === "DIGITUNDER" ? "DIGITUNDER" : "DIGITOVER";
    setDirection(nextDirection);
    setBarrier(recommendation.digit);
    configRef.current = {
      ...configRef.current,
      direction: nextDirection,
      barrier: recommendation.digit,
      symbol: recommendation.symbol,
    };
    setEdgeRecommendation(recommendation);
    setEdgeScannerMessage(
      edgeOverThreeSniperRef.current
        ? `Hunting all Volatility and Jump pairs for the best observed Over 3 · ${recommendation.symbol}`
        : `Hunting all Volatility and Jump pairs for the best observed ${recommendation.direction === "DIGITOVER" ? "Over" : "Under"} ${recommendation.digit} · ${recommendation.symbol}`,
    );
    return recommendation;
  };

  const armMartingaleWatch = (latestRows: typeof rows, amount: number, expectedSettlements: number) => {
    if (configRef.current.strategy !== "martingale") {
      martingaleWatchRef.current = null;
      return;
    }
    martingaleWatchRef.current = {
      knownIds: new Set(latestRows.map((trade) => trade.contract_id)),
      processedIds: new Set(),
      amount,
      expectedSettlements,
    };
  };

  const refreshTradeResults = () => {
    // The buy acknowledgement and the contract stream update arrive
    // independently. Refresh immediately, then once more after the stream
    // has had time to append the contract to recent history.
    void Promise.all([
      queryClient.refetchQueries({ queryKey: getGetDerivStatusQueryKey(), type: "active" }),
      queryClient.refetchQueries({ queryKey: getGetDerivHistoryQueryKey(), type: "active" }),
      queryClient.refetchQueries({ queryKey: getGetDerivAccountsQueryKey(), type: "active" }),
    ]);
    window.setTimeout(() => {
      void queryClient.refetchQueries({ queryKey: getGetDerivStatusQueryKey(), type: "active" });
      void queryClient.refetchQueries({ queryKey: getGetDerivHistoryQueryKey(), type: "active" });
      void queryClient.refetchQueries({ queryKey: getGetDerivAccountsQueryKey(), type: "active" });
    }, 180);
  };

  const executeBatch = async () => {
    const config = configRef.current;
    const entryDigit = config.barrier;
    // Do not decide the next stake from an older settled result while the
    // immediately preceding contract is still open.
    let latestRows = await getDerivHistory();
    for (let attempt = 0; latestRows.some((trade) => trade.status === "open") && attempt < 20; attempt += 1) {
      await sleep(500);
      latestRows = await getDerivHistory();
    }
    if (latestRows.some((trade) => trade.status === "open")) {
      throw new Error("The previous contract is still settling. EDGE stopped without sending another trade.");
    }
    for (const trade of latestRows.filter((item) => (item.contract_type === "DIGITOVER" || item.contract_type === "DIGITUNDER") && item.status !== "open")) {
      if (edgeProcessedSettlementIdsRef.current.has(trade.contract_id)) continue;
      edgeProcessedSettlementIdsRef.current.add(trade.contract_id);
      edgeLossStreakRef.current = trade.profit < 0 ? edgeLossStreakRef.current + 1 : 0;
    }
    queryClient.setQueryData(getGetDerivHistoryQueryKey(), latestRows);
    if (!runningRef.current) return;
    const amount = config.strategy === "martingale" ? nextStakeRef.current : config.stake;
    const riskBalance = Number(edgeRiskBalance);
    const declaredAccountBalance = Number(edgeAccountBalance);
    if (!Number.isFinite(riskBalance) || riskBalance <= 0 || !Number.isFinite(declaredAccountBalance) || declaredAccountBalance <= 0 || amount > riskBalance || amount > declaredAccountBalance) {
      throw new Error("EDGE is paused until the expected-outcome balances are valid and the next stake fits the risk balance.");
    }
    armMartingaleWatch(latestRows, amount, 1);
    await bulkBuyMutation.mutateAsync({
      data: {
        amount,
        duration: config.duration,
        duration_unit: "t",
        contract_type: config.direction,
         barrier: entryDigit,
        symbol: config.symbol,
        count: 1,
        confirm_live_trade: true,
      },
    });
    setSessionTrades((value) => value + 1);
    refreshTradeResults();
  };

  const executeDualBatch = async () => {
    const config = configRef.current;
    let latestRows = await getDerivHistory();
    for (let attempt = 0; latestRows.some((trade) => trade.status === "open") && attempt < 20; attempt += 1) {
      await sleep(500);
      latestRows = await getDerivHistory();
    }
    if (latestRows.some((trade) => trade.status === "open")) {
      throw new Error("The previous contract is still settling. EDGE stopped without sending another trade.");
    }
    queryClient.setQueryData(getGetDerivHistoryQueryKey(), latestRows);
    if (!runningRef.current) return;
    const amount = config.strategy === "martingale" ? nextStakeRef.current : config.stake;
    armMartingaleWatch(latestRows, amount, 2);
    await dualBuyMutation.mutateAsync({
      data: {
        amount,
        duration: config.duration,
        duration_unit: "t",
        barrier: config.barrier,
        symbol: config.symbol,
        confirm_live_trade: true,
      },
    });
    setSessionTrades((value) => value + 2);
    refreshTradeResults();
  };

  const runLoop = async () => {
    while (runningRef.current) {
      try {
        if (edgeBestPairAnalyzerRef.current && edgeLossStreakRef.current >= 4) {
          setEdgeScannerMessage("Paused after 4 losses — switching to another best pair and Over/Under digit.");
          setConnectionMessage({
            kind: "info",
            text: "Best Pair Analyzer paused trading after 4 consecutive losses and is selecting a different market and digit.",
          });
          const switched = await selectEdgeAutomation(configRef.current.symbol);
          if (!switched) {
            await sleep(1500);
            continue;
          }
          edgeLossStreakRef.current = 0;
          await sleep(1500);
          continue;
        }
        if (edgeOverThreeSniperRef.current || edgeBestPairAnalyzerRef.current) {
          const recommendation = await selectEdgeAutomation();
          if (!recommendation) {
            await sleep(1500);
            continue;
          }
        } else if (edgePercentageModeRef.current) {
          const recommendation = await applyPercentageRecommendation();
          if (!recommendation) {
            await sleep(1500);
            continue;
          }
          if (recommendation.direction === "DUAL") await executeDualBatch();
          else await executeBatch();
        } else {
          if (autoSwitchRef.current) await chooseBestDigit();
          if (autoSwitchRef.current) {
          const currentAnalysis = edgeAnalysisRef.current;
          const directionRate = configRef.current.direction === "DIGITOVER"
            ? currentAnalysis.overPercent
            : currentAnalysis.underPercent;
          if (directionRate < edgeMinWinRate) {
            setConnectionMessage({
              kind: "info",
              text: `Auto Best Digit is waiting for ${edgeMinWinRate}% live win percentage. Current ${configRef.current.direction === "DIGITOVER" ? "Over" : "Under"} signal: ${Math.round(directionRate)}%.`,
            });
            await sleep(1500);
            continue;
          }
          }
          await executeBatch();
        }
        // executeBatch waits for the active contract to settle. Do not add a
        // duration-based cooldown after settlement; Deriv's tick duration is
        // the source of truth for how long the contract runs.
        if (runningRef.current) await sleep(250);
      } catch (error) {
        runningRef.current = false;
        setRunning(false);
        setConnectionMessage({ kind: "error", text: errorMessage(error) });
      }
    }
  };

  const start = async () => {
    if (!isConnected) return;
    if (isReal && !liveConfirmed) {
      setConnectionMessage({ kind: "error", text: "Confirm live-funds trading before starting." });
      return;
    }
    const riskBalance = Number(edgeRiskBalance);
    const declaredAccountBalance = Number(edgeAccountBalance);
    const outcomeMultiplier = Number(edgeOutcomeMultiplier);
    if (!Number.isFinite(riskBalance) || riskBalance <= 0 || !Number.isFinite(declaredAccountBalance) || declaredAccountBalance <= 0 || !Number.isFinite(outcomeMultiplier) || outcomeMultiplier < 1) {
      setConnectionMessage({ kind: "error", text: "Enter a positive risk balance, account balance, and multiple before starting EDGE." });
      return;
    }
    if (!edgeOutcomeSynced) {
      setConnectionMessage({ kind: "error", text: "Select Sync balances in Expected outcome before starting EDGE." });
      return;
    }
    if (currentAccount && declaredAccountBalance > currentAccount.balance + 0.01) {
      setConnectionMessage({ kind: "error", text: `The declared account balance is above the connected ${currentAccount.currency ?? "USD"} balance.` });
      return;
    }
    if (edgeOutcomeSynced) setTakeProfit(Math.max(0.01, Number((riskBalance * outcomeMultiplier).toFixed(2))));
    try {
      const latestRows = await getDerivHistory();
      const latestEdgeIds = latestRows
        .filter((trade) => trade.contract_type === "DIGITOVER" || trade.contract_type === "DIGITUNDER")
        .map((trade) => trade.contract_id);
      edgeSessionKnownIdsRef.current = new Set(latestEdgeIds);
      edgeProcessedSettlementIdsRef.current = new Set(latestEdgeIds);
      edgeLossStreakRef.current = 0;
      queryClient.setQueryData(getGetDerivHistoryQueryKey(), latestRows);
    } catch (error) {
      setConnectionMessage({ kind: "error", text: errorMessage(error) });
      return;
    }
    setSessionPnl(0);
    setSessionTrades(0);
    runningRef.current = true;
    setRunning(true);
    void runLoop();
  };

  const stop = () => {
    runningRef.current = false;
    setRunning(false);
  };

  const toggleXTrader = (enabled: boolean) => {
    setXTraderEnabled(enabled);
    if (!enabled) {
      stop();
      return;
    }
    setDigitFlipEnabled(false);
    digitFlipRunningRef.current = false;
    setDigitFlipRunning(false);
    setTradeXEnabled(false);
    tradeXSmartRef.current = false;
    setTradeXSmartAuto(false);
  };

  const reset = () => {
    edgeSessionKnownIdsRef.current = new Set(edgeAllRows.map((trade) => trade.contract_id));
    setSessionPnl(0);
    setSessionTrades(0);
    nextStakeRef.current = stake;
    setNextStake(stake);
    martingaleWatchRef.current = null;
    edgeLossStreakRef.current = 0;
    setEdgeScannerMessage(null);
  };

  const refreshAnalysis = () => {
    analysisEpochRef.current = status.data?.last_tick?.epoch ?? null;
    setAnalysisDigits([]);
    setAnalysisTickCount(0);
  };

  const toggleAutoBestDigit = (enabled: boolean) => {
    if (enabled) {
      if (!isConnected) {
        setConnectionMessage({ kind: "error", text: "Connect Deriv before enabling Auto Best Digit." });
        return;
      }
      if (isReal && !liveConfirmed) {
        setConnectionMessage({ kind: "error", text: "Confirm live funds before enabling Auto Best Digit." });
        return;
      }
      autoSwitchRef.current = true;
      setAutoSwitch(true);
      if (!runningRef.current) void start();
      return;
    }
    autoSwitchRef.current = false;
    setAutoSwitch(false);
    if (runningRef.current) stop();
  };

  const toggleEdgePercentageMode = (enabled: boolean) => {
    if (enabled) {
      if (!isConnected) {
        setConnectionMessage({ kind: "error", text: "Connect Deriv before enabling Percentage Scan." });
        return;
      }
      if (isReal && !liveConfirmed) {
        setConnectionMessage({ kind: "error", text: "Confirm live funds before enabling Percentage Scan." });
        return;
      }
      edgePercentageModeRef.current = true;
      setEdgePercentageMode(true);
      void applyPercentageRecommendation();
      return;
    }
    edgePercentageModeRef.current = false;
    setEdgePercentageMode(false);
    setEdgeRecommendation(null);
  };

  const resetDigitFlipScanner = () => {
    setDigitFlipSampleCount(0);
    setDigitFlipEvenCount(0);
  };

  const selectMarket = async (next: string) => {
    setSymbol(next);
    analysisEpochRef.current = null;
    setAnalysisDigits([]);
    setAnalysisTickCount(0);
    if (digitFlipEnabled) resetDigitFlipScanner();
    try {
      await symbolMutation.mutateAsync({ data: { symbol: next } });
      refreshTradeResults();
    } catch (error) {
      setConnectionMessage({ kind: "error", text: errorMessage(error) });
    }
  };

  const executeTradeX = async (count = 1, durationOverride = tradeXConfigRef.current.duration, digitOverride?: number) => {
    if (tradeXActionLockRef.current) {
      setTradeXMessage("Trade X is already sending. Wait for the current request to finish.");
      return false;
    }
    const config = tradeXConfigRef.current;
    const entryDigit = digitOverride ?? (config.manualSelect
      ? config.selectedDigit
      : digitForTick(durationOverride, config.rankedDigits, config.selectedDigit));
    if (!isConnected) {
      setTradeXMessage("Connect Deriv before sending a Trade X contract.");
      return false;
    }
    if (isReal && !liveConfirmed) {
      setTradeXMessage("Confirm live funds before sending a Trade X contract.");
      return false;
    }
    if (!isTradingCalendarOpen()) {
      setTradeXMessage("Trade X is outside its configured trading calendar.");
      return false;
    }
    if (currentAccount && config.stake * count > currentAccount.balance) {
      setTradeXMessage("The selected Trade X batch is higher than the available account balance.");
      return false;
    }
    const selectedSignal = tradeXDistributionRef.current[entryDigit];
    const selectedConfidence = selectedSignal ? 100 - selectedSignal.percentage : 0;
    const selectedDigitIsAwayFromMarket = tradeXLastDigitRef.current == null || tradeXLastDigitRef.current !== entryDigit;
    const observedEntryReady = Boolean(
      selectedSignal
      && selectedSignal.percentage < 7
      && selectedSignal.streak >= 1
      && selectedDigitIsAwayFromMarket,
    );
    if (
      tradeXSmartRef.current
      && (!observedEntryReady || selectedConfidence < config.smartConfidence)
    ) {
      setTradeXMessage(`Trade X is waiting for a sub-7% observed digit signal after the market moves away from digit ${entryDigit}.`);
      return false;
    }
    if (tradeXLastDigitRef.current === entryDigit) {
      setTradeXMessage(`Trade X delayed because digit ${entryDigit} is the current market digit. Waiting for it to move away.`);
      await waitForMarketTicks(Math.max(1, durationOverride), () => isConnected);
      return false;
    }
    const latestRows = await getDerivHistory();
    if (latestRows.some((trade) => trade.contract_type === "DIGITDIFF" && trade.status === "open")) {
      setTradeXMessage("The previous Digit Differs contract is still settling. Trade X will not overlap contracts.");
      return false;
    }
    tradeXActionLockRef.current = true;
    try {
      await bulkBuyMutation.mutateAsync({
        data: {
          amount: config.stake,
          duration: durationOverride,
          duration_unit: "t",
          contract_type: "DIGITDIFF",
          barrier: entryDigit,
          symbol: config.symbol,
          count,
          confirm_live_trade: true,
        },
      });
      setTradeXTradesSent((value) => value + count);
      setTradeXMessage(`${count === 1 ? "Trade X trade" : `${count} Trade X trades`} sent on Digit Differs ${entryDigit} for ${durationOverride} ${durationOverride === 1 ? "tick" : "ticks"}.`);
      refreshTradeResults();
      return true;
    } catch (error) {
      setTradeXMessage(errorMessage(error));
      return false;
    } finally {
      tradeXActionLockRef.current = false;
    }
  };

  const waitForTradeXSettlements = async (
    knownIds: ReadonlySet<string>,
    expectedCount: number,
    isActive: () => boolean,
  ) => {
    for (let attempt = 0; attempt < 120 && isActive(); attempt += 1) {
      const latestRows = await getDerivHistory();
      const newRows = latestRows.filter(
        (trade) => trade.contract_type === "DIGITDIFF" && !knownIds.has(trade.contract_id),
      );
      if (newRows.length >= expectedCount && newRows.every((trade) => trade.status !== "open")) return;
      await sleep(250);
    }
  };

  const chooseDigitFlipSetup = async (requireThreshold = false) => {
    const currentRows = await getDerivHistory();
    if (currentRows.some((trade) => (trade.contract_type === "DIGITEVEN" || trade.contract_type === "DIGITODD") && trade.status === "open")) {
      return false;
    }
    const config = digitFlipConfigRef.current;
    const signals = digitFlipMarketSignalsRef.current
      .filter((signal) => signal.sampleCount > 0)
      .filter((signal) => config.marketType === "auto" || tradeXSymbols.find((option) => option.value === signal.symbol)?.marketType === config.marketType)
      .map((signal) => ({
        signal,
        parity: signal.evenPercentage >= signal.oddPercentage ? "DIGITEVEN" as const : "DIGITODD" as const,
        rate: Math.max(signal.evenPercentage, signal.oddPercentage),
      }))
      .filter((candidate) => !requireThreshold || candidate.rate >= DIGIT_FLIP_SIGNAL_FLOOR)
      .sort((left, right) => right.rate - left.rate || right.signal.sampleCount - left.signal.sampleCount);
    const best = signals[0];
    if (!best) return false;
    if (best.signal.symbol !== config.symbol) {
      setDigitFlipSymbol(best.signal.symbol);
      await selectMarket(best.signal.symbol);
    }
    const nextParity = (config.marketType === "auto" || digitFlipMagicRef.current) && !digitFlipAssaultRef.current
      ? best.parity
      : config.parity;
    if (nextParity !== config.parity) setDigitFlipParity(nextParity);
    digitFlipConfigRef.current = {
      ...digitFlipConfigRef.current,
      symbol: best.signal.symbol,
      parity: nextParity,
    };
    return true;
  };

  useEffect(() => {
    if (!digitFlipEnabled || (!digitFlipMagic && digitFlipMarketType !== "auto") || !digitFlipMarketSignals.length) return;
    const eligible = digitFlipMarketSignals
      .filter((signal) => digitFlipMarketType === "auto" || tradeXSymbols.some((option) => option.value === signal.symbol && option.marketType === digitFlipMarketType))
      .sort((left, right) => Math.max(right.evenPercentage, right.oddPercentage) - Math.max(left.evenPercentage, left.oddPercentage) || right.sampleCount - left.sampleCount);
    const best = eligible[0];
    if (!best) return;
    const parity = best.oddPercentage > best.evenPercentage ? "DIGITODD" : "DIGITEVEN";
    const key = `${best.symbol}:${parity}`;
    if (digitFlipAutoSelectionKeyRef.current === key) return;
    digitFlipAutoSelectionKeyRef.current = key;
    if (digitFlipConfigRef.current.symbol === best.symbol && digitFlipConfigRef.current.parity === parity) return;
    void chooseDigitFlipSetup(false);
  }, [digitFlipEnabled, digitFlipMagic, digitFlipMarketSignals, digitFlipMarketType]);

  const chooseDigitFlipMarket = async () => chooseDigitFlipSetup(false);

  const applyDigitFlipAssaultSettlements = (latestRows: typeof rows) => {
    if (!digitFlipAssaultRef.current) return;
    const watch = digitFlipAssaultWatchRef.current;
    if (!watch) return;
    const newlySettled = latestRows
      .filter((trade) =>
        (trade.contract_type === "DIGITEVEN" || trade.contract_type === "DIGITODD")
        && !watch.knownIds.has(trade.contract_id)
        && !watch.processedIds.has(trade.contract_id)
        && trade.status !== "open",
      )
      .sort((left, right) => (left.buy_time ?? 0) - (right.buy_time ?? 0));
    for (const trade of newlySettled) {
      const settledParity = trade.contract_type === "DIGITEVEN" ? "DIGITEVEN" : "DIGITODD";
      watch.processedIds.add(trade.contract_id);
      watch.knownIds.add(trade.contract_id);
      if (trade.profit < 0) {
        digitFlipAssaultLossesRef.current[settledParity] += 1;
        const nextParity = settledParity === "DIGITEVEN" ? "DIGITODD" : "DIGITEVEN";
        digitFlipConfigRef.current = { ...digitFlipConfigRef.current, parity: nextParity };
        setDigitFlipParity(nextParity);
        setConnectionMessage({
          kind: "info",
          text: `Assault switched to ${nextParity === "DIGITEVEN" ? "Even" : "Odd"} after a ${settledParity === "DIGITEVEN" ? "Even" : "Odd"} loss${digitFlipAssaultLossesRef.current[settledParity] >= 3 ? " (3-loss trigger)" : ""}.`,
        });
      } else {
        digitFlipAssaultLossesRef.current[settledParity] = 0;
      }
    }
  };

  const executeDigitFlip = async () => {
    if (digitFlipActionLockRef.current || !isConnected) return false;
    if (isReal && !liveConfirmed) {
      setConnectionMessage({ kind: "error", text: "Confirm live funds before sending a DigitFlip trade." });
      return false;
    }
    if (!isTradingCalendarOpen()) {
      setConnectionMessage({ kind: "info", text: "DigitFlip is outside its configured trading calendar." });
      return false;
    }
    const riskBalance = Number(digitFlipRiskBalance);
    const declaredAccountBalance = Number(digitFlipAccountBalance);
    if (!Number.isFinite(riskBalance) || riskBalance <= 0 || !Number.isFinite(declaredAccountBalance) || declaredAccountBalance <= 0) {
      setConnectionMessage({ kind: "error", text: "DigitFlip is paused until the expected-outcome balances are entered." });
      return false;
    }
    const latestRows = await getDerivHistory();
    applyDigitFlipAssaultSettlements(latestRows);
    const config = digitFlipConfigRef.current;
    const selectedRate = config.parity === "DIGITEVEN" ? digitFlipRatesRef.current.even : digitFlipRatesRef.current.odd;
    if (digitFlipMagicRef.current && selectedRate < DIGIT_FLIP_SIGNAL_FLOOR) {
      setConnectionMessage({ kind: "info", text: `Standby is waiting for an ${DIGIT_FLIP_SIGNAL_FLOOR}% observed parity signal. Current ${selectedRate.toFixed(1)}%.` });
      return false;
    }
    if (latestRows.some((trade) => (trade.contract_type === "DIGITEVEN" || trade.contract_type === "DIGITODD") && trade.status === "open")) {
      return false;
    }
    const latestFlip = latestRows.find((trade) => (trade.contract_type === "DIGITEVEN" || trade.contract_type === "DIGITODD") && trade.status !== "open");
    const watch = digitFlipMartingaleWatchRef.current;
    if (
      config.stakeMode === "martingale" &&
      latestFlip &&
      watch &&
      !watch.knownIds.has(latestFlip.contract_id) &&
      !watch.processedIds.has(latestFlip.contract_id)
    ) {
      digitFlipNextStakeRef.current = nextStakeAfterSettlement(latestFlip.profit, digitFlipNextStakeRef.current, config.stake, config.multiplier);
      watch.processedIds.add(latestFlip.contract_id);
    }
    const amount = config.stakeMode === "martingale"
      ? digitFlipNextStakeRef.current
      : config.stake;
    if (amount > riskBalance || amount > declaredAccountBalance || (currentAccount && amount > currentAccount.balance)) {
      setConnectionMessage({ kind: "error", text: "The DigitFlip stake is higher than the available balance." });
      return false;
    }
    digitFlipActionLockRef.current = true;
    setDigitFlipCurrentStake(amount);
    try {
      await digitFlipBuyMutation.mutateAsync({
        data: {
          amount,
          duration: config.duration,
          duration_unit: "t",
          contract_type: config.parity,
          symbol: config.symbol,
          confirm_live_trade: true,
        },
      });
      setDigitFlipTradeCount((value) => value + 1);
      refreshTradeResults();
      return true;
    } catch (error) {
      setConnectionMessage({ kind: "error", text: errorMessage(error) });
      return false;
    } finally {
      digitFlipActionLockRef.current = false;
    }
  };

  const waitForMarketTicks = async (count: number, isActive: () => boolean) => {
    const target = liveTickSequenceRef.current + Math.max(1, Math.trunc(count));
    while (isActive() && liveTickSequenceRef.current < target) {
      await sleep(50);
    }
  };

  const runDigitFlipLoop = async () => {
    digitFlipNextMarketScanAtRef.current = 0;
    while (digitFlipRunningRef.current) {
      const config = digitFlipConfigRef.current;
      if ((config.marketType === "auto" || digitFlipMagicRef.current) && Date.now() >= digitFlipNextMarketScanAtRef.current) {
        const selected = await chooseDigitFlipSetup(digitFlipMagicRef.current);
        if (!selected) {
          setConnectionMessage({ kind: "info", text: `Standby is waiting for a market with an ${DIGIT_FLIP_SIGNAL_FLOOR}% observed parity signal.` });
          digitFlipNextMarketScanAtRef.current = Date.now() + DIGIT_FLIP_MARKET_SCAN_INTERVAL_MS;
          await waitForMarketTicks(1, () => digitFlipRunningRef.current);
          continue;
        }
        digitFlipNextMarketScanAtRef.current = Date.now() + DIGIT_FLIP_MARKET_SCAN_INTERVAL_MS;
      }
      const didTrade = await executeDigitFlip();
      if (digitFlipRunningRef.current) {
        await waitForMarketTicks(didTrade ? digitFlipDuration : 1, () => digitFlipRunningRef.current);
        if (didTrade && (digitFlipConfigRef.current.marketType === "auto" || digitFlipMagicRef.current)) {
          await sleep(DIGIT_FLIP_MARKET_SCAN_INTERVAL_MS);
          digitFlipNextMarketScanAtRef.current = 0;
        }
      }
    }
  };

  const toggleDigitFlip = (enabled: boolean) => {
    setDigitFlipEnabled(enabled);
    if (!enabled) {
      digitFlipRunningRef.current = false;
      digitFlipMartingaleWatchRef.current = null;
      setDigitFlipRunning(false);
      return;
    }
    setXTraderEnabled(false);
    setTradeXEnabled(false);
    runningRef.current = false;
    tradeXSmartRef.current = false;
    setRunning(false);
    setAutoSwitch(false);
    setTradeXSmartAuto(false);
    void chooseDigitFlipMarket();
  };

  const toggleDigitFlipAssault = (enabled: boolean) => {
    digitFlipAssaultRef.current = enabled;
    setDigitFlipAssault(enabled);
    if (enabled) {
      digitFlipAssaultLossesRef.current = { DIGITEVEN: 0, DIGITODD: 0 };
      digitFlipAssaultWatchRef.current = {
        knownIds: new Set(digitFlipAllRows.map((trade) => trade.contract_id)),
        processedIds: new Set(),
      };
      setConnectionMessage({ kind: "info", text: "Assault is armed. A settled loss switches the next trade to the opposite parity." });
    }
  };

  const toggleDigitFlipMagic = (enabled: boolean) => {
    digitFlipMagicRef.current = enabled;
    setDigitFlipMagic(enabled);
    if (enabled) {
      setConnectionMessage({ kind: "info", text: `Standby is working with an ${DIGIT_FLIP_SIGNAL_FLOOR}% observed-signal gate; it does not guarantee a win.` });
    }
  };

  const toggleDigitFlipRun = () => {
    if (digitFlipRunningRef.current) {
      digitFlipRunningRef.current = false;
      setDigitFlipRunning(false);
      return;
    }
    if (!isConnected) {
      setConnectionMessage({ kind: "error", text: "Connect Deriv before running DigitFlip." });
      return;
    }
    if (isReal && !liveConfirmed) {
      setConnectionMessage({ kind: "error", text: "Confirm live funds before running DigitFlip." });
      return;
    }
    const riskBalance = Number(digitFlipRiskBalance);
    const declaredAccountBalance = Number(digitFlipAccountBalance);
    const outcomeMultiplier = Number(digitFlipOutcomeMultiplier);
    if (
      !Number.isFinite(riskBalance)
      || riskBalance <= 0
      || !Number.isFinite(declaredAccountBalance)
      || declaredAccountBalance <= 0
      || !Number.isFinite(outcomeMultiplier)
      || outcomeMultiplier < 1
    ) {
      setConnectionMessage({ kind: "error", text: "Enter a positive risk balance, account balance, and multiple before starting DigitFlip." });
      return;
    }
    if (currentAccount && declaredAccountBalance > currentAccount.balance + 0.01) {
      setConnectionMessage({ kind: "error", text: `The declared account balance is above the connected ${currentAccount.currency ?? "USD"} balance.` });
      return;
    }
    if (digitFlipOutcomeSynced) {
      setDigitFlipTakeProfit(Math.max(0.01, Number((riskBalance * outcomeMultiplier).toFixed(2))));
    }
    digitFlipSessionKnownIdsRef.current = new Set(digitFlipAllRows.map((trade) => trade.contract_id));
    setDigitFlipSessionPnl(0);
    setDigitFlipTradeCount(0);
    setDigitFlipCurrentStake(digitFlipStake);
    digitFlipNextStakeRef.current = digitFlipStake;
    digitFlipMartingaleWatchRef.current = {
      knownIds: new Set(digitFlipAllRows.map((trade) => trade.contract_id)),
      processedIds: new Set(),
    };
    digitFlipAssaultWatchRef.current = {
      knownIds: new Set(digitFlipAllRows.map((trade) => trade.contract_id)),
      processedIds: new Set(),
    };
    digitFlipAssaultLossesRef.current = { DIGITEVEN: 0, DIGITODD: 0 };
    digitFlipNextMarketScanAtRef.current = 0;
    digitFlipRunningRef.current = true;
    setDigitFlipRunning(true);
    void runDigitFlipLoop();
  };

  const resetDigitFlip = () => {
    digitFlipSessionKnownIdsRef.current = new Set(digitFlipAllRows.map((trade) => trade.contract_id));
    setDigitFlipSessionPnl(0);
    setDigitFlipTradeCount(0);
    setDigitFlipCurrentStake(digitFlipStake);
    resetDigitFlipScanner();
    digitFlipNextStakeRef.current = digitFlipStake;
    digitFlipMartingaleWatchRef.current = null;
    digitFlipAssaultWatchRef.current = null;
    digitFlipAssaultLossesRef.current = { DIGITEVEN: 0, DIGITODD: 0 };
    digitFlipNextMarketScanAtRef.current = 0;
  };

  const refreshDigitFlipSample = () => {
    resetDigitFlipScanner();
    setConnectionMessage({ kind: "info", text: "DigitFlip parity scanner reset. Waiting for fresh ticks." });
  };

  const clearDigitFlipHistory = async () => {
    if (!digitFlipClearArmed) {
      setDigitFlipClearArmed(true);
      window.setTimeout(() => setDigitFlipClearArmed(false), 2_500);
      return;
    }
    setDigitFlipClearArmed(false);
    setHistoryFading(true);
    await sleep(260);
    setDigitFlipHiddenHistoryIds((current) => {
      const next = new Set(current);
      digitFlipRows.forEach((trade) => next.add(trade.contract_id));
      return next;
    });
    setHistoryFading(false);
  };

  const runTradeXSmartLoop = async () => {
    while (tradeXSmartRef.current) {
      const config = tradeXConfigRef.current;
      const rankedDigit = digitForTick(config.smartAiTicks, config.rankedDigits, config.selectedDigit);
      const confidence = tradeXDistributionRef.current.length
        ? Math.min(99, Math.max(50, Math.round(100 - (tradeXDistributionRef.current[rankedDigit]?.percentage ?? 0))))
        : tradeXAnalysisRef.current.confidence;
      if (confidence < config.smartConfidence) {
        setTradeXMessage(`Smart Auto Trade is waiting for a ${config.smartConfidence}% signal; current sample is ${confidence}%.`);
        await waitForMarketTicks(1, () => tradeXSmartRef.current);
        continue;
      }
      const knownIds = new Set(
        (await getDerivHistory())
          .filter((trade) => trade.contract_type === "DIGITDIFF")
          .map((trade) => trade.contract_id),
      );
      const didTrade = await executeTradeX(config.smartTradeCount, config.duration, rankedDigit);
      if (tradeXSmartRef.current && didTrade) {
        await waitForTradeXSettlements(knownIds, config.smartTradeCount, () => tradeXSmartRef.current);
      } else if (tradeXSmartRef.current && !didTrade) {
        await waitForMarketTicks(1, () => tradeXSmartRef.current);
      }
    }
  };

  const toggleTradeXSmart = (enabled: boolean) => {
    if (!enabled) {
      tradeXSmartRef.current = false;
      setTradeXSmartAuto(false);
      setTradeXMessage("Smart Auto Trade stopped.");
      return;
    }
    if (!isConnected) {
      setTradeXMessage("Connect Deriv before enabling Smart Auto Trade.");
      return;
    }
    if (isReal && !liveConfirmed) {
      setTradeXMessage("Confirm live funds before enabling Smart Auto Trade.");
      return;
    }
    tradeXSmartRef.current = true;
    setTradeXSmartAuto(true);
    void runTradeXSmartLoop();
  };

  const toggleTradeX = (enabled: boolean) => {
    setTradeXEnabled(enabled);
    if (enabled) {
      setXTraderEnabled(false);
      setDigitFlipEnabled(false);
      digitFlipRunningRef.current = false;
      setDigitFlipRunning(false);
      stop();
      autoSwitchRef.current = false;
      setAutoSwitch(false);
      return;
    }
    tradeXSmartRef.current = false;
    setTradeXSmartAuto(false);
    setTradeXMessage("Trade X paused.");
  };

  const selectDuration = (next: number) => {
    setDuration(next);
  };

  const fireTrade = async (contractType: "DIGITOVER" | "DIGITUNDER") => {
    if (!isConnected) return;
    if (isReal && !liveConfirmed) {
      setConnectionMessage({ kind: "error", text: "Confirm live funds before sending a trade." });
      return;
    }
    if (edgePercentageModeRef.current) {
      const recommendation = await applyPercentageRecommendation();
      if (!recommendation) return;
      if (recommendation.direction === "DUAL" || recommendation.direction !== contractType) {
        setConnectionMessage({
          kind: "info",
          text: `Percentage Scan recommends ${recommendation.direction === "DUAL" ? "Dual" : recommendation.direction === "DIGITOVER" ? "Over" : "Under"} ${recommendation.digit} on ${recommendation.symbol}; no ${contractType === "DIGITOVER" ? "Over" : "Under"} trade was sent.`,
        });
        return;
      }
    }
    const amount = strategy === "martingale" ? nextStakeRef.current : stake;
    const entryDigit = configRef.current.barrier;
    if (currentAccount && amount > currentAccount.balance) {
      setConnectionMessage({ kind: "error", text: "The next stake is higher than the available balance." });
      return;
    }
    try {
      const latestRows = await getDerivHistory();
      queryClient.setQueryData(getGetDerivHistoryQueryKey(), latestRows);
      armMartingaleWatch(latestRows, amount, 1);
      await bulkBuyMutation.mutateAsync({
        data: {
          amount,
          duration,
          duration_unit: "t",
          contract_type: contractType,
           barrier: entryDigit,
          symbol: configRef.current.symbol,
          count: 1,
          confirm_live_trade: true,
        },
      });
      setDirection(contractType);
      setSessionTrades((value) => value + 1);
      await queryClient.invalidateQueries();
    } catch (error) {
      martingaleWatchRef.current = null;
      setConnectionMessage({ kind: "error", text: errorMessage(error) });
    }
  };

  const fireDualTrade = async () => {
    if (!isConnected) return;
    if (isReal && !liveConfirmed) {
      setConnectionMessage({ kind: "error", text: "Confirm live funds before sending a trade." });
      return;
    }
    if (edgePercentageModeRef.current) {
      const recommendation = await applyPercentageRecommendation();
      if (!recommendation) return;
      if (recommendation.direction !== "DUAL") {
        setConnectionMessage({
          kind: "info",
          text: `Percentage Scan recommends ${recommendation.direction === "DIGITOVER" ? "Over" : "Under"} ${recommendation.digit} on ${recommendation.symbol}; Dual was not sent.`,
        });
        return;
      }
    }
    const amount = strategy === "martingale" ? nextStakeRef.current : stake;
    const entryDigit = configRef.current.barrier;
    if (currentAccount && amount * 2 > currentAccount.balance) {
      setConnectionMessage({ kind: "error", text: "The dual stake is higher than the available balance." });
      return;
    }
    try {
      const latestRows = await getDerivHistory();
      queryClient.setQueryData(getGetDerivHistoryQueryKey(), latestRows);
      armMartingaleWatch(latestRows, amount, 2);
      await dualBuyMutation.mutateAsync({
        data: {
          amount,
          duration,
          duration_unit: "t",
          barrier: entryDigit,
          symbol: configRef.current.symbol,
          confirm_live_trade: true,
        },
      });
      setSessionTrades((value) => value + 2);
      await queryClient.invalidateQueries();
    } catch (error) {
      martingaleWatchRef.current = null;
      setConnectionMessage({ kind: "error", text: errorMessage(error) });
    }
  };
  const clearHistory = async () => {
    if (!clearHistoryArmed) {
      setClearHistoryArmed(true);
      window.setTimeout(() => setClearHistoryArmed(false), 2_500);
      return;
    }
    setClearHistoryArmed(false);
    setHistoryFading(true);
    await sleep(260);
    setEdgeHiddenHistoryIds((current) => {
      const next = new Set(current);
      edgeRows.forEach((trade) => next.add(trade.contract_id));
      return next;
    });
    setHistoryFading(false);
  };

  const clearTradeXHistory = async () => {
    if (!tradeXHistoryClearArmed) {
      setTradeXHistoryClearArmed(true);
      window.setTimeout(() => setTradeXHistoryClearArmed(false), 2_500);
      return;
    }
    setTradeXHistoryClearArmed(false);
    setHistoryFading(true);
    await sleep(260);
    setTradeXHiddenHistoryIds((current) => {
      const next = new Set(current);
      tradeXRows.forEach((trade) => next.add(trade.contract_id));
      return next;
    });
    setHistoryFading(false);
  };

  const accountOptions = accounts.data ?? [];
  const entryDigit = barrier;
  const activeGuidePages = guideMode === "trade-x" ? tradeXGuidePages : guideMode === "digit-flip" ? digitFlipGuidePages : guidePages;
  const statusText = isConnected ? "CONNECTED" : connectedToken ? "CONNECTING" : "DISCONNECTED";
  const activityText = running ? "EDGE RUNNING" : "EDGE STOPPED";
  const edgeRiskReady = edgeOutcomeSynced
    && Number.isFinite(Number(edgeRiskBalance))
    && Number(edgeRiskBalance) > 0
    && Number.isFinite(Number(edgeAccountBalance))
    && Number(edgeAccountBalance) > 0
    && Number.isFinite(Number(edgeOutcomeMultiplier))
    && Number(edgeOutcomeMultiplier) >= 1;
  const canTrade = isConnected && !running && edgeRiskReady
    && (!isReal || (Boolean(status.data?.live_trading_enabled) && liveConfirmed))
    && Boolean(currentAccount) && (strategy !== "martingale" ? stake : nextStake) <= Number(edgeRiskBalance)
    && (strategy !== "martingale" ? stake : nextStake) <= (currentAccount?.balance ?? 0);

  return (
    <main className="xt-app">
      <header className="xt-header">
        <div className="xt-brand"><span>J</span><div><strong>JDY AI</strong><small>DERIV DIGIT TRADER</small></div>{accessSession.data?.is_admin === true && <Link href="/admin/users" className="xt-admin-link"><ShieldCheck size={14} /> ADMIN PANEL</Link>}</div>
        <div className={`xt-connection ${isConnected ? "online" : ""}`}><i />{statusText}</div>
      </header>

      <section className="xt-connect-card">
        <div className="xt-section-title"><Link2 size={17} /><div><b>Deriv API Connection</b><small>Enter a Personal Access Token with trade and read scopes.</small></div></div>
         {!canUseDeriv ? (
           <div className="xt-restricted-message"><ShieldAlert size={17} /><span>Restricted — admin access only. This key has not been granted a trading feature.</span></div>
         ) : !connectedToken ? (
          <form onSubmit={connectPat} className="xt-pat-form">
            <input type="password" value={pat} onChange={(event) => setPat(event.target.value)} placeholder="Paste your Deriv PAT token" autoComplete="off" />
            <button disabled={!pat.trim() || tokenMutation.isPending}>{tokenMutation.isPending ? <Loader2 className="spin" size={16} /> : <Power size={16} />}Connect</button>
          </form>
        ) : (
          <div className="xt-connected-row">
            <span><i />Token encrypted and saved for this browser</span>
            <button onClick={() => void disconnect()} disabled={deleteTokenMutation.isPending}>Disconnect</button>
          </div>
        )}
        {connectionMessage && <p className={`xt-inline-message ${connectionMessage.kind}`}>{connectionMessage.text}</p>}
      </section>

      <section className="xt-account-grid">
        <div className="xt-balance-card">
          <small>ACTIVE BALANCE</small>
          <strong><span>{currentAccount?.currency ?? "USD"}</span>{(currentAccount?.balance ?? 0).toFixed(2)}</strong>
          <div>{currentAccount?.id ?? "No account connected"} <b className={isReal ? "real" : ""}>{currentAccount?.type ?? "—"}</b></div>
        </div>
        <label className="xt-select-card"><small>TRADING ACCOUNT</small><div><select value={currentAccount?.id ?? ""} onChange={(event) => accountMutation.mutate({ data: { account_id: event.target.value } }, { onSuccess: () => void queryClient.invalidateQueries() })} disabled={!accountOptions.length || running}>
          {!accountOptions.length && <option value="">Connect PAT first</option>}
          {accountOptions.map((account) => <option key={account.id} value={account.id}>{account.id} · {account.type.toUpperCase()} · {account.currency} {account.balance.toFixed(2)}</option>)}
        </select><ChevronDown size={15} /></div></label>
      </section>

      <section className="xt-feature-card xt-feature-card-digit-flip">
        <div><Zap size={18} /><span><b>DigitFlip</b><small>Even / Odd parity trading with live estimates</small></span></div>
        <div className="xt-feature-actions">
          {!canUseDigitFlip && <span className="xt-feature-locked">RESTRICTED</span>}
          {canUseDigitFlip && <button className="xt-guide-button" type="button" onClick={() => { setGuideMode("digit-flip"); setGuidePage(0); setGuideOpen(true); }}><BookOpen size={14} />Guide</button>}
          <label className="xt-switch">
            <input type="checkbox" checked={digitFlipEnabled} onChange={(event) => toggleDigitFlip(event.target.checked)} aria-label="Toggle DigitFlip" disabled={!canUseDigitFlip} />
            <span />
          </label>
        </div>
      </section>

      <section className="xt-feature-card xt-feature-card-trade-x">
        <div><Activity size={18} /><span><b>Trade X</b><small>Digit Differs distribution and ranked-entry automation</small></span></div>
        <div className="xt-feature-actions">
          {!canUseTradeX && <span className="xt-feature-locked">RESTRICTED</span>}
          {canUseTradeX && <button className="xt-guide-button" type="button" onClick={() => { setGuideMode("trade-x"); setGuidePage(0); setGuideOpen(true); }}>
            <BookOpen size={14} />Guide
          </button>}
          <label className="xt-switch">
            <input
              type="checkbox"
              checked={tradeXEnabled}
              onChange={(event) => toggleTradeX(event.target.checked)}
              aria-label="Toggle Trade X"
              disabled={!canUseTradeX}
            />
            <span />
          </label>
        </div>
      </section>

      <section className="xt-feature-card">
        <div><Bot size={18} /><span><b>EDGE 🏔️</b><small>Over / Under digit automation</small></span></div>
        <div className="xt-feature-actions">
          {!canUseEdge && <span className="xt-feature-locked">RESTRICTED</span>}
          {canUseEdge && <button className="xt-guide-button" type="button" onClick={() => { setGuideMode("edge"); setGuidePage(0); setGuideOpen(true); }}>
            <BookOpen size={14} />Guide
          </button>}
          <label className="xt-switch">
            <input
              type="checkbox"
              checked={xTraderEnabled}
              onChange={(event) => toggleXTrader(event.target.checked)}
              aria-label="Toggle EDGE"
              disabled={!canUseEdge}
            />
            <span />
          </label>
        </div>
      </section>

      {digitFlipEnabled && (
        <DigitFlipPanel
          enabled={digitFlipEnabled}
          marketType={digitFlipMarketType}
          symbol={digitFlipSymbol}
          symbols={tradeXSymbols}
           marketSignals={digitFlipMarketSignals}
          quote={status.data?.last_tick?.quote}
          lastDigit={lastDigit}
           evenPercentage={digitFlipEvenPercentage}
           oddPercentage={digitFlipOddPercentage}
           sampleCount={digitFlipSampleCount}
          selectedParity={digitFlipParity}
          duration={digitFlipDuration}
          stake={digitFlipStake}
          stakeMode={digitFlipStakeMode}
          multiplier={digitFlipMultiplier}
          takeProfit={digitFlipTakeProfit}
          stopLoss={digitFlipStopLoss}
          running={digitFlipRunning}
          currentStake={digitFlipCurrentStake}
          sessionPnl={digitFlipSessionPnl}
          tradeCount={digitFlipTradeCount}
          recentTrades={digitFlipRows}
            assaultEnabled={digitFlipAssault}
           magicEnabled={digitFlipMagic}
           clearTradesArmed={digitFlipClearArmed}
           historyFading={historyFading}
            riskBalance={digitFlipRiskBalance}
            accountBalance={digitFlipAccountBalance}
            outcomeMultiplier={digitFlipOutcomeMultiplier}
            outcomeSynced={digitFlipOutcomeSynced}
          isPlacingTrade={digitFlipBuyMutation.isPending}
          disabled={!isConnected}
          onMarketTypeChange={(next) => {
            setDigitFlipMarketType(next);
             if (next === "auto") {
               window.setTimeout(() => void chooseDigitFlipSetup(false), 0);
             } else {
               const nextSymbol = tradeXSymbols.find((option) => option.marketType === next)?.value;
               if (nextSymbol) {
                 setDigitFlipSymbol(nextSymbol);
                 void selectMarket(nextSymbol);
               }
             }
          }}
          onSymbolChange={(next) => { setDigitFlipSymbol(next); void selectMarket(next); }}
          onParityChange={setDigitFlipParity}
          onDurationChange={setDigitFlipDuration}
          onStakeChange={setDigitFlipStake}
          onStakeModeChange={setDigitFlipStakeMode}
          onMultiplierChange={setDigitFlipMultiplier}
          onTakeProfitChange={setDigitFlipTakeProfit}
          onStopLossChange={setDigitFlipStopLoss}
          onRunStop={toggleDigitFlipRun}
          onReset={resetDigitFlip}
          onClearTrades={clearDigitFlipHistory}
           onRefreshSample={refreshDigitFlipSample}
           onAssaultChange={toggleDigitFlipAssault}
           onMagicChange={toggleDigitFlipMagic}
            onRiskBalanceChange={setDigitFlipRiskBalance}
            onAccountBalanceChange={setDigitFlipAccountBalance}
            onOutcomeMultiplierChange={setDigitFlipOutcomeMultiplier}
            onOutcomeSyncedChange={setDigitFlipOutcomeSynced}
          onGuide={() => { setGuideMode("digit-flip"); setGuidePage(0); setGuideOpen(true); }}
        />
      )}

      {xTraderEnabled && (
        <EdgeReferencePanel
          isConnected={isConnected}
          running={running}
          isReal={isReal}
          liveConfirmed={liveConfirmed}
          onLiveConfirm={setLiveConfirmed}
          symbol={symbol}
          markets={markets}
          onSymbolChange={(next) => void selectMarket(next)}
          currentAccount={currentAccount}
          direction={direction}
          onDirectionChange={setDirection}
          barrier={barrier}
          onBarrierChange={setBarrier}
          duration={duration}
          onDurationChange={selectDuration}
          stake={stake}
          onStakeChange={setStake}
          strategy={strategy}
          onStrategyChange={setStrategy}
          martingale={martingale}
          onMartingaleChange={setMartingale}
          takeProfit={takeProfit}
          onTakeProfitChange={setTakeProfit}
          stopLoss={stopLoss}
          onStopLossChange={setStopLoss}
          edgeRecommendation={edgeRecommendation}
          marketSignals={(status.data?.market_signals ?? []) as MarketSignal[]}
          analysis={analysis}
          lastDigit={lastDigit}
          quote={status.data?.last_tick?.quote}
          nextStake={nextStake}
          sessionPnl={sessionPnl}
          sessionTrades={sessionTrades}
          overThreeSniper={edgeOverThreeSniper}
          bestPairAnalyzer={edgeBestPairAnalyzer}
          scannerMessage={edgeScannerMessage}
          riskBalance={edgeRiskBalance}
          accountBalance={edgeAccountBalance}
          outcomeMultiplier={edgeOutcomeMultiplier}
          outcomeSynced={edgeOutcomeSynced}
          canTrade={canTrade}
          onStart={start}
          onStop={stop}
          onReset={reset}
          onOverThreeSniperChange={(enabled) => {
            setEdgeOverThreeSniper(enabled);
            edgeOverThreeSniperRef.current = enabled;
            if (enabled) {
              setEdgeBestPairAnalyzer(false);
              edgeBestPairAnalyzerRef.current = false;
              setEdgeScannerMessage("Hunting all Volatility and Jump pairs for the best observed Over 3 signal…");
              void selectEdgeAutomation();
            } else if (!edgeBestPairAnalyzerRef.current) {
              setEdgeScannerMessage(null);
            }
          }}
          onBestPairAnalyzerChange={(enabled) => {
            setEdgeBestPairAnalyzer(enabled);
            edgeBestPairAnalyzerRef.current = enabled;
            if (enabled) {
              setEdgeOverThreeSniper(false);
              edgeOverThreeSniperRef.current = false;
              setEdgeScannerMessage("Hunting all Volatility and Jump pairs for the best observed Over or Under digit…");
              void selectEdgeAutomation();
            } else if (!edgeOverThreeSniperRef.current) {
              setEdgeScannerMessage(null);
            }
          }}
          onRiskBalanceChange={setEdgeRiskBalance}
          onAccountBalanceChange={setEdgeAccountBalance}
          onOutcomeMultiplierChange={setEdgeOutcomeMultiplier}
          onOutcomeSyncedChange={setEdgeOutcomeSynced}
          canViewHistory={canViewHistory}
          recentTrades={edgeRows}
          historyFading={historyFading}
          clearTradesArmed={clearHistoryArmed}
          onClearHistory={clearHistory}
        />
      )}

      {xTraderEnabled && (
        <>
          <section className="xt-cockpit edge-legacy-hidden">
            <div className="xt-cockpit-head">
              <div><Activity size={18} /><span><b>EDGE Cockpit</b><small>Live tick analysis · historical streaks do not guarantee outcomes</small></span></div>
              <em className={running ? "running" : ""}><i />{activityText}</em>
            </div>

             <div className="xt-market-row market-only">
              <label><small>MARKET</small><select value={symbol} onChange={(event) => void selectMarket(event.target.value)} disabled={!isConnected || running}>{markets.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
            </div>

             <section className="xt-analysis-panel" aria-live="polite">
               <div className="xt-analysis-header">
                 <div className="xt-analysis-title"><Activity size={16} /><span><b>LIVE ANALYSIS · {analysisTickCount}T</b><small>{analysisTickCount ? "Live market digits" : "Waiting for the next live tick"}</small></span></div>
                 <div className="xt-analysis-actions">
                   <button type="button" className="xt-analysis-refresh" onClick={refreshAnalysis} disabled={!isConnected} title="Restart live analysis count"><RefreshCw size={14} /></button>
                 </div>
               </div>
               <div className="xt-analysis-track" aria-label={`Live analysis: ${analysis.overPercent.toFixed(1)} percent over and ${analysis.underPercent.toFixed(1)} percent under`}>
                 <span className="over" style={{ width: `${analysis.overPercent}%` }} />
                 <span className="under" style={{ width: `${analysis.underPercent}%` }} />
               </div>
               <div className="xt-analysis-chart" aria-label="Live digit distribution">
                 {analysis.counts.map((count, digit) => {
                   const tone = digit === barrier ? "selected" : digit > barrier ? "over" : "under";
                   const height = count ? Math.max(18, (count / analysis.maxCount) * 100) : 10;
                   return <div className={`xt-analysis-column ${tone}`} key={digit}><small>{count}</small><span style={{ height: `${height}%` }} /><b>{digit}</b></div>;
                 })}
               </div>
               <div className="xt-analysis-trail" aria-label="Recent live digits">
                 {analysisDigits.slice(-20).map((digit, index) => <span className={digit === barrier ? "selected" : digit > barrier ? "over" : "under"} key={`${digit}-${index}`}>{digit}</span>)}
                 {!analysisDigits.length && <small>New ticks will appear here after the market connects.</small>}
               </div>
                <p className="xt-analysis-note">Green marks digits above the selected barrier, red marks digits below it, and yellow marks the selected barrier. Percentages describe this sample; they are not guaranteed outcomes.</p>
             </section>

            <div className="xt-direction">
              <button className={direction === "DIGITOVER" ? "active over" : ""} onClick={() => setDirection("DIGITOVER")} disabled={running}><b>OVER</b><small>Last digit above barrier</small></button>
              <button className={direction === "DIGITUNDER" ? "active under" : ""} onClick={() => setDirection("DIGITUNDER")} disabled={running}><b>UNDER</b><small>Last digit below barrier</small></button>
            </div>

            <div className="xt-form-grid">
               <label><small>DURATION</small><div className="xt-ticks">{[1,2,3,4,5].map((tick) => <button key={tick} className={duration === tick ? "active" : ""} onClick={() => selectDuration(tick)} disabled={running}>{tick}</button>)}</div><b className="xt-field-help">Selected barrier {entryDigit} · contract runs for {duration} tick{duration === 1 ? "" : "s"}</b></label>
               <label><small>STAKE · MIN 0.35</small><div className="xt-money"><span>{currentAccount?.currency ?? "USD"}</span><input type="number" min=".35" step=".01" value={stake} onChange={(event) => setStake(Math.max(.35, Number(event.target.value) || .35))} disabled={running} /></div><b className="xt-field-help">Up to the available account balance</b></label>
              <label><small>STRATEGY</small><select value={strategy} onChange={(event) => setStrategy(event.target.value as "flat" | "martingale")} disabled={running}><option value="flat">Flat stake</option><option value="martingale">Martingale after loss</option></select></label>
              <label><small>MARTINGALE MULTIPLIER</small><input type="number" min="1" max="10" step=".1" value={martingale} onChange={(event) => setMartingale(Number(event.target.value))} disabled={running || strategy === "flat"} /></label>
              <label><small>TAKE PROFIT</small><input type="number" min=".01" step=".01" value={takeProfit} onChange={(event) => setTakeProfit(Number(event.target.value))} disabled={running} /></label>
              <label><small>STOP LOSS</small><input type="number" min=".01" step=".01" value={stopLoss} onChange={(event) => setStopLoss(Number(event.target.value))} disabled={running} /></label>
                 <label><small>MIN OBSERVED SIDE SHARE · {edgeMinWinRate}%</small><input type="range" min="90" max="99" step="1" value={edgeMinWinRate} onChange={(event) => setEdgeMinWinRate(Number(event.target.value))} disabled={running} /></label>
              <label className="xt-auto-row"><span><small>AUTO BEST DIGIT</small><b>Scan markets and trade the strongest signal automatically</b></span><span className="xt-switch"><input type="checkbox" checked={autoSwitch} onChange={(event) => toggleAutoBestDigit(event.target.checked)} disabled={!isConnected} /><span /></span></label>
               <label className="xt-auto-row"><span><small>PERCENTAGE SCAN · {EDGE_PERCENTAGE_SCAN_FLOOR}% FLOOR</small><b>Scan every market and gate Over, Under, or Dual by observed outcomes</b></span><span className="xt-switch"><input type="checkbox" checked={edgePercentageMode} onChange={(event) => toggleEdgePercentageMode(event.target.checked)} disabled={!isConnected} /><span /></span></label>
               {edgePercentageMode && <div className={`xt-percentage-recommendation ${edgeRecommendation ? "ready" : "waiting"}`}>
                 <span><small>LIVE RECOMMENDATION</small><b>{edgeRecommendation ? `${edgeRecommendation.direction === "DUAL" ? "DUAL" : edgeRecommendation.direction === "DIGITOVER" ? "OVER" : "UNDER"} ${edgeRecommendation.digit} · ${edgeRecommendation.symbol}` : "WAITING FOR ENOUGH OBSERVED OUTCOMES"}</b></span>
                 <strong>{edgeRecommendation ? `${edgeRecommendation.score.toFixed(1)}% observed` : "No trade sent"}</strong>
               </div>}
               <label className="xt-chosen-digit"><small>CHOSEN DIGIT</small><div className="xt-digit-picker">{Array.from({ length: 10 }, (_, digit) => digit).map((digit) => <button type="button" key={digit} className={barrier === digit ? "active" : ""} onClick={() => setBarrier(digit)} disabled={running}>{digit}</button>)}</div><b>Trade {direction === "DIGITOVER" ? "Over" : "Under"} the selected digit</b></label>
            </div>

            {isReal && <label className="xt-live-warning"><ShieldAlert size={18} /><input type="checkbox" checked={liveConfirmed} onChange={(event) => setLiveConfirmed(event.target.checked)} /><span><b>Live funds confirmation</b>I understand EDGE will place real-money contracts.</span></label>}

            <div className="xt-session">
              <div><small>SESSION P/L</small><strong className={sessionPnl < 0 ? "loss" : ""}>{sessionPnl >= 0 ? "+" : ""}{sessionPnl.toFixed(2)}</strong></div>
              <div><small>TRADES SENT</small><strong>{sessionTrades}</strong></div>
               <div><small>CONFIGURATION</small><strong>{direction === "DIGITOVER" ? "OVER" : "UNDER"} {entryDigit} · {duration}T</strong></div>
            </div>

            <div className="xt-controls">
               {running && <button className="stop" onClick={stop}><Pause size={18} fill="currentColor" />STOP</button>}
              <button className="reset" onClick={reset}><RotateCcw size={18} />RESET</button>
            </div>
             <div className="xt-bulk-controls">
              <button className="xt-bulk-over" onClick={() => void fireTrade("DIGITOVER")} disabled={!canTrade}>
                 <span><Play size={14} fill="currentColor" />OVER {entryDigit}</span>
                <small>Send one trade</small>
              </button>
               <button className="xt-bulk-dual" onClick={() => void fireDualTrade()} disabled={!canTrade}>
                  <span><Play size={14} fill="currentColor" />DUAL {entryDigit}</span>
                 <small>Send Over + Under</small>
               </button>
              <button className="xt-bulk-under" onClick={() => void fireTrade("DIGITUNDER")} disabled={!canTrade}>
                 <span><Play size={14} fill="currentColor" />UNDER {entryDigit}</span>
                <small>Send one trade</small>
              </button>
            </div>
            {strategy === "martingale" && <p className="xt-streak-note">Next stake after settlement: <b>{nextStake.toFixed(2)} {currentAccount?.currency ?? "USD"}</b>. Every loss multiplies the next stake; any profit resets it to normal.</p>}
          </section>

          {canViewHistory && <section className="xt-history edge-legacy-hidden" title="Recent dashboard trade history">
            <div className="xt-history-head"><div><CircleDollarSign size={18} /><span><b>Recent EDGE Trades</b><small>EDGE rows only · Deriv records are not deleted</small></span></div><button onClick={() => void clearHistory()} disabled={historyFading}><Trash2 size={15} />{clearHistoryArmed ? "Tap again" : "Clear"}</button></div>
             {!edgeRows.length ? <div className="xt-empty"><RefreshCw size={20} />Trades will appear here after EDGE starts.</div> : edgeRows.slice(0, 12).map((trade) => {
              const settled = trade.status !== "open";
              return <div className={`xt-trade ${historyFading ? "fading" : ""}`} key={trade.contract_id}><span><b>{trade.contract_type.replace("DIGIT", "")}</b><small>{trade.symbol} · {trade.account_type}{trade.barrier == null ? "" : ` · barrier ${trade.barrier}`}</small></span><span><small>BUY</small>{trade.buy_price.toFixed(2)}</span><span><small>STATUS</small>{trade.status}</span><strong className={settled && trade.profit < 0 ? "loss" : ""}>{settled ? `${trade.profit >= 0 ? "+" : ""}${trade.profit.toFixed(2)}` : "—"}</strong></div>;
            })}
           </section>}
        </>
      )}

      {tradeXEnabled && (
        <section className="xt-bottom-feature">
          <TradeXPanel
            enabled={tradeXEnabled}
            marketType={tradeXMarketType}
            symbol={tradeXSymbol}
            tradeType="DIGITDIFF"
            stake={tradeXStake}
            selectedDigit={tradeXEntryDigit}
            duration={tradeXDuration}
            manualSelectMode={tradeXManualSelect}
            smartAutoEnabled={tradeXSmartAuto}
            smartConfidence={tradeXSmartConfidence}
            smartTradeCount={tradeXSmartTradeCount}
            smartAiTicks={tradeXSmartAiTicks}
            distribution={tradeXDistribution}
            rankedSafestDigits={tradeXRankedDigits}
            symbols={tradeXSymbols}
            analysisTickCount={analysisTickCount}
            analysisUpdatedAt={lastDigit == null ? "waiting for live ticks" : `last digit ${lastDigit}`}
            lastDigit={lastDigit}
            isPlacingTrade={bulkBuyMutation.isPending}
            isRefreshingAnalysis={analysisTickCount === 0 && !isConnected}
            disabled={running}
            onMarketTypeChange={setTradeXMarketType}
            onSymbolChange={(next) => { setTradeXSymbol(next); void selectMarket(next); }}
            onTradeTypeChange={() => undefined}
            onStakeChange={(next) => setTradeXStake(Math.max(0.35, Number.isFinite(next) ? next : 0.35))}
             onSelectedDigitChange={(digit) => {
               setTradeXSelectedDigit(digit);
               setTradeXManualSelect(true);
             }}
            onDurationChange={setTradeXDuration}
            onManualSelectModeChange={setTradeXManualSelect}
             onTradeSelect={(digit) => {
               setTradeXSelectedDigit(digit);
               setTradeXManualSelect(true);
               void executeTradeX(1, tradeXDuration, digit);
             }}
            onPlaceTrade={() => void executeTradeX(1)}
            onSmartAutoChange={toggleTradeXSmart}
            onSmartConfidenceChange={setTradeXSmartConfidence}
            onSmartTradeCountChange={setTradeXSmartTradeCount}
            onSmartAiTicksChange={(next) => setTradeXSmartAiTicks(next as TradeXDuration)}
            onRefreshAnalysis={refreshAnalysis}
          />
          {tradeXMessage && <p className="tx-parent-message" role="status">{tradeXMessage}</p>}
          {canViewHistory && (
            <section className="xt-history xt-history-trade-x" title="Recent Trade X trade history">
              <div className="xt-history-head">
                <div><CircleDollarSign size={18} /><span><b>Trade X Recent Trades</b><small>Digit Differs rows only · Deriv records are not deleted</small></span></div>
                <button onClick={clearTradeXHistory} disabled={!tradeXRows.length}><Trash2 size={15} />{tradeXHistoryClearArmed ? "Tap again" : "Clear"}</button>
              </div>
              <div className="xt-pnl-strip" aria-label="Trade X profit and loss summary">
                <div><small>TRADE X P/L</small><strong className={tradeXProfit < 0 ? "loss" : ""}>{tradeXProfit >= 0 ? "+" : ""}{tradeXProfit.toFixed(2)}</strong></div>
                <div><small>WINS</small><strong>{tradeXWins}</strong></div>
                <div><small>LOSSES</small><strong className={tradeXLosses ? "loss" : ""}>{tradeXLosses}</strong></div>
              </div>
              {!tradeXRows.length ? <div className="xt-empty"><RefreshCw size={20} />Trade X trades will appear here after a Digit Differs entry.</div> : tradeXRows.slice(0, 12).map((trade) => {
                const settled = trade.status !== "open";
                return <div className={`xt-trade ${historyFading ? "fading" : ""}`} key={trade.contract_id}><span><b>DIGIT DIFFERS {trade.barrier == null ? "" : trade.barrier}</b><small>{trade.symbol} · {trade.account_type} · expiry decides the result</small></span><span><small>BUY</small>{trade.buy_price.toFixed(2)}</span><span><small>STATUS</small>{trade.status}</span><strong className={settled && trade.profit < 0 ? "loss" : ""}>{settled ? `${trade.profit >= 0 ? "+" : ""}${trade.profit.toFixed(2)}` : "—"}</strong></div>;
              })}
            </section>
          )}
        </section>
      )}

      {guideOpen && (
        <div className="xt-guide-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setGuideOpen(false); }}>
          <section className="xt-guide" role="dialog" aria-modal="true" aria-labelledby="xt-guide-title">
            <header className="xt-guide-header">
              <div><BookOpen size={18} /><span><b>{guideMode === "trade-x" ? " Trade X Guide" : " EDGE Guide"}</b><small>Page {guidePage + 1} of {activeGuidePages.length}</small></span></div>
              <button type="button" aria-label="Close guide" onClick={() => setGuideOpen(false)}><X size={17} /></button>
            </header>
            <div className="xt-guide-progress"><span style={{ width: `${((guidePage + 1) / activeGuidePages.length) * 100}%` }} /></div>
            <article className="xt-guide-page">
               <small className="xt-guide-kicker">{guideMode === "trade-x" ? "TRADE X FIELD GUIDE" : guideMode === "digit-flip" ? "DIGITFLIP FIELD GUIDE" : "EDGE FIELD GUIDE"}</small>
              <h2 id="xt-guide-title">{activeGuidePages[guidePage].title}</h2>
              <p>{activeGuidePages[guidePage].body}</p>
              <ul>{activeGuidePages[guidePage].points.map((point) => <li key={point}>{point}</li>)}</ul>
            </article>
            <footer className="xt-guide-footer">
              <button type="button" className="xt-guide-nav" onClick={() => setGuidePage((page) => Math.max(0, page - 1))} disabled={guidePage === 0}><ChevronLeft size={15} />Back</button>
              <span>{guidePage + 1} / {activeGuidePages.length}</span>
              {guidePage === activeGuidePages.length - 1 ? (
                <button type="button" className="xt-guide-start" onClick={() => { setGuideOpen(false); guideMode === "trade-x" ? toggleTradeX(true) : guideMode === "digit-flip" ? toggleDigitFlip(true) : toggleXTrader(true); }}>Let's start trading</button>
              ) : (
                <button type="button" className="xt-guide-nav next" onClick={() => setGuidePage((page) => Math.min(activeGuidePages.length - 1, page + 1))}>Next<ChevronRight size={15} /></button>
              )}
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}