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
  useRequestDerivProposal,
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
import BulkTraderPanel, {
  type BulkTraderContractType,
  type BulkTraderPrediction,
  type BulkTraderType,
} from "../components/bulk-trader-panel";
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
  { title: "Set the stake", body: "Stake controls the amount requested for each Digit Differs contract. Start low while learning how the distribution reacts.", points: ["Keep a reserve in the account.", "The server and account balance remain final guards.", "A higher stake does not make a signal stronger."] },
  { title: "Manual selection", body: "Manual selection lets you choose the exact digit barrier rather than accepting the current ranked candidate.", points: ["Tap a digit to make it active.", "Confirm the selected digit before placing a trade.", "The barrier is sent with the contract request."] },
  { title: "Ranked candidates", body: "The ranked list orders digits from the observed distribution so you can compare the least frequent candidates for a Differs idea.", points: ["Ranking is based on the current sample.", "A low observed frequency is not a guarantee.", "Refresh the sample when the context changes."] },
  { title: "Observed percentages", body: "The distribution percentages summarize the selected sample and update as live ticks arrive.", points: ["Small samples can move sharply.", "Use sample count beside the percentage.", "Treat the number as context, not certainty."] },
  { title: "Smart confidence", body: "Smart Auto waits for the configured observed confidence floor before sending. The floor is a gate for the local loop, not a guarantee of profit.", points: ["Use a conservative trade count.", "Stop Smart Auto before changing assumptions.", "Demo-test thresholds before real use."] },
  { title: "Smart trade count", body: "Smart trade count controls how many separate Digit Differs contracts are requested when Smart Auto enters.", points: ["Each returned contract appears independently.", "Check the account balance before increasing count.", "The request is blocked while another action is pending."] },
  { title: "AI ticks and ranked entry", body: "The AI tick setting maps the next live observations to the ranked candidate used by Smart Auto.", points: ["A longer setting needs more live ticks.", "The selected candidate can change before entry.", "Manual selection overrides ranked selection when enabled."] },
  { title: "Place a manual trade", body: "Place Trade X Trade uses the active market, stake, duration, and selected digit to send one Digit Differs contract.", points: ["Review every control before placing.", "Live accounts require explicit confirmation.", "The expiry result is decided by Deriv."] },
  { title: "Live-money protection", body: "Real accounts require live-funds confirmation and the server's live-trading guard before Trade X can send contracts.", points: ["Switch to demo while learning.", "A disabled action indicates a missing guard.", "Reconfirm after an account switch."] },
  { title: "Reading open contracts", body: "An open row has been bought but does not yet have a final result. It remains visible while Deriv settles the contract.", points: ["Do not treat an open row as a win or loss.", "History refreshes as settlement arrives.", "New actions remain separate from open rows."] },
  { title: "Clearing Trade X history", body: "The Trade X clear control hides the dashboard rows after a second tap. It does not delete contracts or records from Deriv.", points: ["Use the two-step action intentionally.", "The fade confirms the rows were removed from view.", "Clearing does not stop automation."] },
  { title: "Reset the sample", body: "Refreshing analysis starts a new local sample window so the distribution reflects the next stream of ticks.", points: ["Wait for enough observations after refresh.", "Avoid making decisions from an empty sample.", "The account and contract history remain unchanged."] },
  { title: "Safe first session", body: "Start with one small demo Digit Differs contract, a fresh sample, and manual selection before trying Smart Auto.", points: ["Confirm market, digit, duration, and stake.", "Watch the returned row settle.", "Stop if the signal no longer matches your plan."] },
  { title: "Final checklist", body: "Trade X is ready when the market, sample, digit, duration, stake, and automation state are all intentional.", points: ["Start small.", "Keep live confirmation explicit.", "Use observed data as context, never as certainty."] },
] as const;

const digitFlipGuidePages = [
  { title: "Welcome to DigitFlip", body: "DigitFlip trades Even or Odd contracts using a live parity sample. Estimates describe recent ticks and never guarantee the next contract result.", points: ["Start with a demo account.", "Only one of DigitFlip, Trade X, and EDGE can run at once.", "Auto Candidates reviews the strongest market every 10 seconds after settlement."] },
  { title: "Choose a market and parity", body: "DigitFlip starts with an automatically selected market, then lets you choose Volatility or Jump markets manually. Even and Odd have distinct selected states.", points: ["The quote and last digit are live telemetry.", "Recent percentages come from the selected market sample.", "The market selector does not predict the next digit."] },
  { title: "Stake and duration", body: "Choose 1 to 5 ticks and begin with a flat stake of 0.50 or more. Martingale after loss is optional and can grow exposure quickly.", points: ["Decimals are supported for the multiplier.", "Use a small stake while evaluating a signal.", "There is no max-stake control in this workspace."] },
  { title: "Run, stop, and reset", body: "Run starts the guarded loop. Stop prevents another entry after the active request. Reset clears only session P/L and current stake; it does not delete Deriv history.", points: ["Take Profit and Stop Loss stop the loop.", "Recent trades can be hidden from this dashboard.", "Hidden rows remain in Deriv."] },
  { title: "Reading the live parity", body: "DigitFlip uses the live Even and Odd percentages as market context. The percentages describe recent ticks and never guarantee the next contract result.", points: ["Wait for a meaningful live sample before trading.", "Use a small stake while evaluating a market.", "No condition is presented as a guaranteed win."] },
  { title: "Live account protection", body: "Real-money DigitFlip actions require a live-funds confirmation and the server's live-trading setting.", points: ["Use demo funds while learning.", "Check the selected account before every session.", "A confirmation is required again after switching accounts."] },
  { title: "Reading the market label", body: "The market label identifies the stream currently used for the parity sample. A new market needs fresh observations before its percentages become useful.", points: ["Wait for the sample to refresh after switching.", "Do not mix observations from different markets.", "The quote is live context, not a promise."] },
  { title: "Auto Candidates", body: "Auto Candidates compares supported markets using the available parity sample and can select a stronger observed setup after settlement.", points: ["It is a selection aid, not an outcome guarantee.", "It can change the market between entries.", "Stop the loop before changing your risk settings."] },
  { title: "Assault mode", body: "Assault mode changes which parity direction is considered for the next entry after a settlement. It does not change Deriv's contract rules.", points: ["Review the active parity before starting.", "Keep the stake small while evaluating the mode.", "Use a stop limit for every live experiment."] },
  { title: "Magic mode", body: "Magic mode applies the configured parity decision from the live sample and session state. It remains subject to the same account and balance guards.", points: ["The mode never bypasses live confirmation.", "The mode does not change contract expiry.", "Turn it off when you want manual control."] },
  { title: "Take Profit and Stop Loss", body: "Session limits stop the local loop when the configured positive or negative result is reached. They do not close an already-open contract.", points: ["A limit is a guardrail, not a guarantee.", "Open contracts may settle after stopping.", "Review history before restarting."] },
  { title: "Martingale caution", body: "If Martingale is enabled, the next stake can increase after a losing settlement and reset after a profitable one.", points: ["Losses can grow exposure quickly.", "Keep a reserve in the selected account.", "Demo-test before considering real funds."] },
  { title: "History and session state", body: "The session counter and P/L describe the active DigitFlip run. History rows remain separate from other feature histories.", points: ["Reset does not delete Deriv records.", "Clear hides rows from this dashboard only.", "Open contracts show as unsettled until Deriv responds."] },
  { title: "A safe first session", body: "Begin with one-tick demo contracts, a small stake, and a fresh sample. Stop when the signal no longer matches your plan.", points: ["Confirm the account and market.", "Check the active parity and duration.", "Never call a streak a guaranteed win."] },
  { title: "Final checklist", body: "You are ready to use DigitFlip when the account, market, parity, duration, stake, and risk limits are all intentional.", points: ["Start with one small demo trade.", "Watch the settlement and history update.", "Keep the guide open while learning."] },
  { title: "Live tick timing", body: "The quote and last digit can change between the moment you read the panel and the moment a request reaches Deriv.", points: ["Use the live label to confirm the stream.", "Do not assume the previous digit repeats.", "Short duration does not remove timing risk."] },
  { title: "Dual parity context", body: "When the parity controls expose both directions, compare the live Even and Odd sample before choosing the action.", points: ["Dual does not remove contract risk.", "Both sides are tracked independently.", "Read the returned contracts separately."] },
  { title: "History clearing", body: "The DigitFlip clear action hides visible dashboard rows after confirmation while leaving Deriv records untouched.", points: ["Tap twice to confirm.", "Open contracts are not cancelled.", "The history panel can be rebuilt by a fresh session."] },
  { title: "When to stop", body: "Stop the loop when the sample is too thin, the account changes, the risk limit is reached, or the signal no longer matches your plan.", points: ["Stopping prevents another entry.", "Already-open contracts may still settle.", "Review results before restarting."] },
  { title: "Ready to begin", body: "Use DigitFlip deliberately: choose the account, market, parity, duration, stake, and guardrails, then begin with a small demo action.", points: ["Confirm the live stream.", "Keep the first session simple.", "Return to this guide whenever you change modes."] },
] as const;

const bulkTraderGuidePages = [
  { title: "Welcome to Bulk Trader", body: "Bulk Trader is the fast multi-contract workspace for reading live digit context and sending one to six separate contracts from a single action.", points: ["Start on a demo account.", "The feature switch pauses the other trading surfaces.", "Percentages describe the current sample and do not guarantee an outcome."] },
  { title: "Connect and choose an account", body: "Connect your Deriv account, then confirm the account shown in the trading account selector before opening Bulk Trader.", points: ["Demo funds are the safest place to learn.", "Real accounts require explicit live-funds confirmation.", "Account changes refresh the live session."] },
  { title: "Choose a market", body: "The market list includes Volatility and Jump pairs. Selecting a pair changes the live Deriv stream used by the current tick and digit sample.", points: ["Use the filter to focus on Volatility or Jump pairs.", "The right-side percentage is live observed context.", "Wait for fresh ticks after switching markets."] },
  { title: "Select a trade type", body: "Bulk Trader supports Over / Under, Even / Odd, Rise / Fall, and Differs. The rest of the panel changes to match the selected contract family.", points: ["Only the controls for the active type are shown.", "Differs uses one selected digit.", "Dual is available for parity and direction pairs."] },
  { title: "Analysis tick windows", body: "Choose 100, 300, 500, 800, or 1000 ticks for the visible analysis window. The digit percentages and markers recalculate from that window.", points: ["Short windows react faster.", "Longer windows provide more context.", "The window changes analysis, not contract duration."] },
  { title: "Over and Under predictions", body: "Over / Under predictions use digits 1 through 9. The selected digit becomes the barrier sent with the matching contract.", points: ["Over wins above the selected barrier.", "Under wins below the selected barrier.", "The expiry digit decides the contract result."] },
  { title: "Reading O, U, and =", body: "For Over / Under, the digit row marks values above the selected barrier with O, below it with U, and the selected barrier with =.", points: ["The markers follow the selected prediction.", "The current tick is marked separately.", "A marker is descriptive market context only."] },
  { title: "Even, Odd, and Dual", body: "Even / Odd offers Even, Odd, and Dual actions. The digit row shows E or O to make parity context quick to scan.", points: ["Dual sends one Even and one Odd batch.", "Each returned contract is recorded separately.", "Parity observations can change every tick."] },
  { title: "Rise, Fall, and Dual", body: "Rise / Fall offers Rise, Fall, and Dual actions. The row shows R or F from the latest tick-to-tick movement.", points: ["Dual sends one Rise and one Fall batch.", "The movement marker is not a prediction.", "The expiry rules still belong to Deriv."] },
  { title: "Differs predictions", body: "Differs uses digits 0 through 9. The selected digit is the barrier that the contract must differ from at expiry.", points: ["The row does not show O or U markers in this mode.", "The selected digit is visibly emphasized.", "A digit absent from the sample is still not guaranteed to be absent next."] },
  { title: "Current tick display", body: "The current tick readout shows the latest live quote's last digit and marks that digit in the ten-digit strip.", points: ["The red pointer identifies the latest digit.", "A quote can move before the next control action.", "The sample trail shows recent context, not a fixed sequence."] },
  { title: "Execution ticks", body: "Execution duration is set separately from the analysis window. Choose 1 through 5 ticks for how long each contract observes before settlement.", points: ["One tick resolves quickly.", "Longer durations are not automatically safer.", "Changing duration does not rewrite past rows."] },
  { title: "Stake", body: "Stake starts at 0.35 and accepts decimals. The server and selected account remain the final authority over whether a contract can be bought.", points: ["Keep a reserve in the account.", "There is no artificial maximum in the control.", "A valid stake does not remove market risk."] },
  { title: "Number of bulk trades", body: "Choose 1 through 6 bulk trades. One action sends that many separate contracts and the history lists each returned contract independently.", points: ["Bulk count is not a single combined contract.", "Watch the account balance before increasing count.", "The request is blocked while another bulk request is pending."] },
  { title: "Trade buttons", body: "The action buttons change with the active trade type and show the current observed percentage beneath the label.", points: ["Over / Under show two buttons.", "Even / Odd and Rise / Fall include Dual.", "Differs shows one action for the selected digit."] },
  { title: "Live-money confirmation", body: "Real accounts require the live-funds confirmation before Bulk Trader sends anything. The API also enforces its own live-trading guardrails.", points: ["Read the confirmation before enabling a live action.", "Switch to demo when learning.", "A disabled button means a required guard is not satisfied."] },
  { title: "Bulk trade history", body: "Each returned contract is shown with its type, symbol, account, buy amount, status, and settlement result.", points: ["Open contracts show no final result yet.", "Rows update as the Deriv stream settles.", "Bulk history is kept separate from the other feature panels."] },
  { title: "Clearing history", body: "The history bin uses a two-step clear. Tap once to arm it, then tap again within the short window; rows fade from the dashboard without deleting Deriv records.", points: ["The second tap confirms the action.", "The fade gives feedback before rows disappear.", "Clearing does not affect active contracts."] },
  { title: "A safe first bulk session", body: "Use one demo contract, one tick, a small stake, and a fresh sample before increasing the bulk count or duration.", points: ["Confirm market, type, prediction, ticks, and stake.", "Watch the first returned row settle.", "Treat every percentage and streak as observed context, never certainty."] },
  { title: "Final checklist", body: "Bulk Trader is ready when the account, market, trade type, prediction, analysis window, execution duration, stake, and bulk count are intentional.", points: ["Start with a small demo batch.", "Keep the clear control available for dashboard hygiene.", "Use the guide again whenever you change contract family."] },
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
const EDGE_MIN_MARKET_SAMPLE = 20;
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
    .filter((signal) => signal.sample_count >= EDGE_MIN_MARKET_SAMPLE && signal.quote != null && signal.symbol !== excludeSymbol)
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
  const available = signals.filter((signal) =>
    signal.sample_count >= EDGE_MIN_MARKET_SAMPLE
    && signal.quote != null
    && signal.symbol !== excludeSymbol,
  );
  const candidates = available.flatMap((signal) => (signal.digit_outcomes ?? []).flatMap((outcome) => {
    // Barriers 0 and 9 make one side tautological, so they are not useful
    // scanner candidates even when a short sample makes them look perfect.
    if (outcome.digit <= 0 || outcome.digit >= 9) return [];
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
  const [edgeAutoSelectBest, setEdgeAutoSelectBest] = useState(false);
  const [edgeScannerMessage, setEdgeScannerMessage] = useState<string | null>(null);
  const [edgeAccountBalance, setEdgeAccountBalance] = useState("");
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
  const [bulkTraderEnabled, setBulkTraderEnabled] = useState(false);
  const [bulkTraderType, setBulkTraderType] = useState<BulkTraderType>("over-under");
  const [bulkTraderPrediction, setBulkTraderPrediction] = useState<BulkTraderPrediction>(5);
  const [bulkTraderSymbol, setBulkTraderSymbol] = useState("R_75");
  const [bulkTraderSampleTicks, setBulkTraderSampleTicks] = useState(100);
  const [bulkTraderDuration, setBulkTraderDuration] = useState(1);
  const [bulkTraderStake, setBulkTraderStake] = useState(.35);
  const [bulkTraderCount, setBulkTraderCount] = useState(1);
  const [bulkTraderClearArmed, setBulkTraderClearArmed] = useState(false);
  const [bulkTraderHiddenHistoryIds, setBulkTraderHiddenHistoryIds] = useState<Set<string>>(new Set());
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
  const [digitFlipAccountBalance, setDigitFlipAccountBalance] = useState("");
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
  const [guideMode, setGuideMode] = useState<"edge" | "trade-x" | "digit-flip" | "bulk-trader">("edge");
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
  const edgeAutoSelectBestRef = useRef(edgeAutoSelectBest);
  const edgeAutoSelectionKeyRef = useRef("");
  const edgeProposalRequestKeyRef = useRef("");
  const edgeProposalMutation = useRequestDerivProposal();
  const edgeLossStreakRef = useRef(0);
  const edgeProcessedSettlementIdsRef = useRef(new Set<string>());
  const nextStakeRef = useRef(stake);
  const martingaleWatchRef = useRef<MartingaleSettlementWatch | null>(null);
  const analysisEpochRef = useRef<number | null>(null);
  const tradeXSmartRef = useRef(false);
  const tradeXActionLockRef = useRef(false);
  const bulkActionLockRef = useRef(false);
  const digitFlipRunningRef = useRef(false);
  const digitFlipActionLockRef = useRef(false);
  const digitFlipAssaultRef = useRef(false);
  const digitFlipMagicRef = useRef(false);
  const digitFlipNextMarketScanAtRef = useRef(0);
  const digitFlipAutoSelectionKeyRef = useRef("");
  const digitFlipMarketSignalsRef = useRef<DigitFlipMarketSignal[]>([]);
  const digitFlipRatesRef = useRef({ even: 50, odd: 50 });
  const tradeXLastDigitRef = useRef<number | null>(null);
  const tradeXObservedTickWindowRef = useRef<number[]>([]);
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
  const bulkAllRows = rows.filter((trade) => (
    trade.contract_type === "DIGITOVER"
    || trade.contract_type === "DIGITUNDER"
    || trade.contract_type === "DIGITEVEN"
    || trade.contract_type === "DIGITODD"
    || trade.contract_type === "DIGITDIFF"
    || trade.contract_type === "CALL"
    || trade.contract_type === "PUT"
  ));
  const edgeRows = edgeAllRows.filter((trade) => !edgeHiddenHistoryIds.has(trade.contract_id));
  const tradeXRows = tradeXAllRows.filter((trade) => !tradeXHiddenHistoryIds.has(trade.contract_id));
  const digitFlipRows = digitFlipAllRows.filter((trade) => !digitFlipHiddenHistoryIds.has(trade.contract_id));
  const bulkRows = bulkAllRows.filter((trade) => !bulkTraderHiddenHistoryIds.has(trade.contract_id));
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
  const bulkTraderMarketSignals = useMemo(
    () => (status.data?.market_signals ?? []).map((signal) => {
      const selectedDigit = typeof bulkTraderPrediction === "number" ? bulkTraderPrediction : 5;
      const selectedOutcome = signal.digit_outcomes?.find((outcome) => outcome.digit === selectedDigit);
      const differsRate = selectedOutcome
        ? Number(selectedOutcome.over_percentage) + Number(selectedOutcome.under_percentage)
        : 50;
      const parityRate = Math.max(signal.digit_even_percentage, signal.digit_odd_percentage);
      const movementRate = Math.max(signal.rise_percentage, signal.fall_percentage);
      const observedPercentage = bulkTraderType === "over-under"
        ? Number((selectedOutcome ? Math.max(Number(selectedOutcome.over_percentage), Number(selectedOutcome.under_percentage)) : 50).toFixed(1))
        : bulkTraderType === "differs"
          ? Number(differsRate.toFixed(1))
          : bulkTraderType === "even-odd"
            ? Number(parityRate.toFixed(1))
            : Number(movementRate.toFixed(1));
      return {
        symbol: signal.symbol,
        sampleCount: signal.sample_count,
        observedPercentage,
      };
    }),
    [bulkTraderPrediction, bulkTraderType, status.data?.market_signals],
  );

  useEffect(() => {
    if (sessionAccountIdRef.current === currentAccount?.id) return;
    sessionAccountIdRef.current = currentAccount?.id ?? null;
    edgeSessionKnownIdsRef.current = null;
    digitFlipSessionKnownIdsRef.current = null;
    setEdgeOutcomeSynced(false);
    setEdgeAccountBalance(currentAccount ? currentAccount.balance.toFixed(2) : "");
    setDigitFlipOutcomeSynced(false);
    setDigitFlipAccountBalance(currentAccount ? currentAccount.balance.toFixed(2) : "");
  }, [currentAccount?.id]);

  useEffect(() => {
    if (!edgeOutcomeSynced || !currentAccount) return;
    const liveBalance = currentAccount.balance.toFixed(2);
    if (edgeAccountBalance !== liveBalance) setEdgeAccountBalance(liveBalance);
  }, [currentAccount?.balance, edgeAccountBalance, edgeOutcomeSynced]);

  useEffect(() => {
    if (!digitFlipOutcomeSynced || !currentAccount) return;
    const liveBalance = currentAccount.balance.toFixed(2);
    if (digitFlipAccountBalance !== liveBalance) setDigitFlipAccountBalance(liveBalance);
  }, [currentAccount?.balance, digitFlipAccountBalance, digitFlipOutcomeSynced]);

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
    edgeAutoSelectBestRef.current = edgeAutoSelectBest;
  }, [edgeAutoSelectBest, edgeBestPairAnalyzer, edgeOverThreeSniper]);

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
    setAnalysisDigits((current) => [...current, digit].slice(-1000));
    setAnalysisTickCount((current) => current + 1);
    if (tradeXEnabled && status.data?.last_tick?.symbol === tradeXSymbol) {
      tradeXObservedTickWindowRef.current = [...tradeXObservedTickWindowRef.current, digit].slice(-5);
    }
    if (digitFlipEnabled) {
      setDigitFlipSampleCount((current) => current + 1);
      if (digit % 2 === 0) setDigitFlipEvenCount((current) => current + 1);
    }
  }, [digitFlipEnabled, status.data?.last_tick?.epoch, status.data?.last_digit, status.data?.last_tick?.symbol, tradeXEnabled, tradeXSymbol]);

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
      setConnectionMessage({ kind: "info", text: "Deriv connected. Your credential remains protected on the server." });
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

  const requestEdgeQuote = async (quote: {
    symbol: string;
    direction: "DIGITOVER" | "DIGITUNDER";
    barrier: number;
  }) => {
    const key = `${quote.symbol}:${quote.direction}:${quote.barrier}:${stake}:${duration}`;
    if (edgeProposalRequestKeyRef.current === key) return;
    edgeProposalRequestKeyRef.current = key;
    try {
      await edgeProposalMutation.mutateAsync({
        data: {
          amount: stake,
          duration,
          duration_unit: "t",
          contract_type: quote.direction,
          barrier: quote.barrier,
          symbol: quote.symbol,
        },
      });
      await sleep(150);
      await queryClient.refetchQueries({ queryKey: getGetDerivStatusQueryKey(), type: "active" });
    } catch {
      edgeProposalRequestKeyRef.current = "";
    }
  };

  const selectEdgeAutomation = async (excludeSymbol?: string) => {
    const signals = (status.data?.market_signals ?? []) as MarketSignal[];
    const recommendation = edgeOverThreeSniperRef.current
      ? chooseBestOverThreeSignal(signals, excludeSymbol)
      : (edgeBestPairAnalyzerRef.current || edgeAutoSelectBestRef.current)
        ? chooseBestAnalyzerSignal(signals, excludeSymbol)
        : null;
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
    void requestEdgeQuote({
      symbol: recommendation.symbol,
      direction: nextDirection,
      barrier: recommendation.digit,
    });
    setEdgeScannerMessage(
      edgeOverThreeSniperRef.current
        ? `Hunting all Volatility and Jump pairs for the best observed Over 3 · ${recommendation.symbol}`
        : `Hunting all Volatility and Jump pairs for the best observed ${recommendation.direction === "DIGITOVER" ? "Over" : "Under"} ${recommendation.digit} · ${recommendation.symbol}`,
    );
    return recommendation;
  };

  useEffect(() => {
    if (!isConnected || !xTraderEnabled) return;
    void requestEdgeQuote({ symbol, direction, barrier });
  }, [barrier, direction, duration, isConnected, stake, symbol, xTraderEnabled]);

  useEffect(() => {
    if (!isConnected || (!edgeOverThreeSniper && !edgeBestPairAnalyzer && !edgeAutoSelectBest)) return;
    const signals = (status.data?.market_signals ?? []) as MarketSignal[];
    const recommendation = edgeOverThreeSniper
      ? chooseBestOverThreeSignal(signals)
      : chooseBestAnalyzerSignal(signals);
    if (!recommendation) return;
    const key = `${recommendation.symbol}:${recommendation.direction}:${recommendation.digit}:${recommendation.score.toFixed(1)}:${recommendation.sampleCount}`;
    if (edgeAutoSelectionKeyRef.current === key) return;
    edgeAutoSelectionKeyRef.current = key;
    void selectEdgeAutomation();
  }, [
    edgeAutoSelectBest,
    edgeBestPairAnalyzer,
    edgeOverThreeSniper,
    isConnected,
    status.data?.market_signals,
  ]);

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
    const declaredAccountBalance = Number(edgeAccountBalance);
    if (!Number.isFinite(declaredAccountBalance) || declaredAccountBalance <= 0) {
      throw new Error("Sync the connected account balance before EDGE places another trade.");
    }
    if (amount > declaredAccountBalance || (currentAccount && amount > currentAccount.balance)) {
      throw new Error(`EDGE stopped before the next trade because the ${amount.toFixed(2)} ${currentAccount?.currency ?? "USD"} stake exceeds the connected balance. Lower the stake or Martingale multiplier.`);
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
        if (edgeOverThreeSniperRef.current || edgeBestPairAnalyzerRef.current || edgeAutoSelectBestRef.current) {
          const recommendation = await selectEdgeAutomation();
          if (!recommendation) {
            await sleep(1500);
            continue;
          }
          await executeBatch();
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
    const declaredAccountBalance = Number(edgeAccountBalance);
    if (!Number.isFinite(declaredAccountBalance) || declaredAccountBalance <= 0) {
      setConnectionMessage({ kind: "error", text: "Enter a positive account balance before starting EDGE." });
      return;
    }
    if (!edgeOutcomeSynced) {
      setConnectionMessage({ kind: "error", text: "Select Sync balance in Expected outcome before starting EDGE." });
      return;
    }
    if (currentAccount && declaredAccountBalance > currentAccount.balance + 0.01) {
      setConnectionMessage({ kind: "error", text: `The declared account balance is above the connected ${currentAccount.currency ?? "USD"} balance.` });
      return;
    }
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
      nextStakeRef.current = stake;
      setNextStake(stake);
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
    setBulkTraderEnabled(false);
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
    tradeXObservedTickWindowRef.current = [];
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
    const declaredAccountBalance = Number(digitFlipAccountBalance);
    if (!Number.isFinite(declaredAccountBalance) || declaredAccountBalance <= 0) {
      setConnectionMessage({ kind: "error", text: "DigitFlip is paused until the account balance is entered." });
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
    if (amount > declaredAccountBalance || (currentAccount && amount > currentAccount.balance)) {
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
    setBulkTraderEnabled(false);
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
    const declaredAccountBalance = Number(digitFlipAccountBalance);
    if (!Number.isFinite(declaredAccountBalance) || declaredAccountBalance <= 0) {
      setConnectionMessage({ kind: "error", text: "Enter a positive account balance before starting DigitFlip." });
      return;
    }
    if (!digitFlipOutcomeSynced) {
      setConnectionMessage({ kind: "error", text: "Select Sync balance before starting DigitFlip." });
      return;
    }
    if (currentAccount && declaredAccountBalance > currentAccount.balance + 0.01) {
      setConnectionMessage({ kind: "error", text: `The declared account balance is above the connected ${currentAccount.currency ?? "USD"} balance.` });
      return;
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
      await waitForMarketTicks(config.smartAiTicks, () => tradeXSmartRef.current);
      if (!tradeXSmartRef.current) break;
      const observedTicks = tradeXObservedTickWindowRef.current.slice(-config.smartAiTicks);
      if (observedTicks.length < config.smartAiTicks) {
        setTradeXMessage(`Trade X is collecting the next ${config.smartAiTicks} live tick${config.smartAiTicks === 1 ? "" : "s"} before evaluating the entry.`);
        continue;
      }
      const observedCounts = Array.from({ length: 10 }, (_, digit) => observedTicks.filter((value) => value === digit).length);
      const observedRankedDigits = rankDigitsForDiffers(observedCounts);
      const rankedDigit = config.manualSelect
        ? config.selectedDigit
        : observedRankedDigits[0] ?? digitForTick(config.smartAiTicks, config.rankedDigits, config.selectedDigit);
      const confidence = tradeXDistributionRef.current.length
        ? Math.min(99, Math.max(50, Math.round(100 - (tradeXDistributionRef.current[rankedDigit]?.percentage ?? 0))))
        : tradeXAnalysisRef.current.confidence;
      if (confidence < config.smartConfidence) {
        setTradeXMessage(`Smart Auto Trade observed the next ${config.smartAiTicks} live tick${config.smartAiTicks === 1 ? "" : "s"}; current signal is ${confidence}% against the ${config.smartConfidence}% floor.`);
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
      setBulkTraderEnabled(false);
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

  const toggleBulkTrader = (enabled: boolean) => {
    setBulkTraderEnabled(enabled);
    if (!enabled) return;
    setXTraderEnabled(false);
    setTradeXEnabled(false);
    setDigitFlipEnabled(false);
    runningRef.current = false;
    tradeXSmartRef.current = false;
    digitFlipRunningRef.current = false;
    setRunning(false);
    setTradeXSmartAuto(false);
    setDigitFlipRunning(false);
  };

  const executeBulkTrade = async (contractType: BulkTraderContractType, barrierOverride?: number) => {
    if (bulkActionLockRef.current || bulkBuyMutation.isPending) {
      setConnectionMessage({ kind: "info", text: "Bulk Trader is already sending. Wait for the current request to finish." });
      return;
    }
    if (!isConnected) {
      setConnectionMessage({ kind: "error", text: "Connect Deriv before sending a Bulk Trader contract." });
      return;
    }
    if (isReal && !liveConfirmed) {
      setConnectionMessage({ kind: "error", text: "Confirm live funds before sending a Bulk Trader contract." });
      return;
    }
    const send = (type: BulkTraderContractType) => bulkBuyMutation.mutateAsync({
      data: {
        amount: bulkTraderStake,
        duration: bulkTraderDuration,
        duration_unit: "t",
        contract_type: type,
        ...(barrierOverride == null ? {} : { barrier: barrierOverride }),
        symbol: bulkTraderSymbol,
        count: bulkTraderCount,
        confirm_live_trade: true,
      },
    });
    const isDual = bulkTraderPrediction === "dual";
    bulkActionLockRef.current = true;
    try {
      if (isDual && bulkTraderType === "even-odd") {
        await send("DIGITEVEN");
        await send("DIGITODD");
      } else if (isDual && bulkTraderType === "rise-fall") {
        await send("CALL");
        await send("PUT");
      } else {
        await send(contractType);
      }
      refreshTradeResults();
    } catch (error) {
      setConnectionMessage({ kind: "error", text: errorMessage(error) });
    } finally {
      bulkActionLockRef.current = false;
    }
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

  const clearBulkTraderHistory = async () => {
    if (!bulkTraderClearArmed) {
      setBulkTraderClearArmed(true);
      window.setTimeout(() => setBulkTraderClearArmed(false), 2_500);
      return;
    }
    setBulkTraderClearArmed(false);
    setHistoryFading(true);
    await sleep(260);
    setBulkTraderHiddenHistoryIds((current) => {
      const next = new Set(current);
      bulkRows.forEach((trade) => next.add(trade.contract_id));
      return next;
    });
    setHistoryFading(false);
  };

  const accountOptions = accounts.data ?? [];
  const entryDigit = barrier;
  const activeGuidePages = guideMode === "trade-x"
    ? tradeXGuidePages
    : guideMode === "digit-flip"
      ? digitFlipGuidePages
      : guideMode === "bulk-trader"
        ? bulkTraderGuidePages
        : guidePages;
  const statusText = isConnected ? "CONNECTED" : connectedToken ? "CONNECTING" : "DISCONNECTED";
  const activityText = running ? "EDGE RUNNING" : "EDGE STOPPED";
  const edgeBalanceReady = edgeOutcomeSynced
    && Number.isFinite(Number(edgeAccountBalance))
    && Number(edgeAccountBalance) > 0;
  const canTrade = isConnected && !running && edgeBalanceReady
    && (!isReal || (Boolean(status.data?.live_trading_enabled) && liveConfirmed))
    && Boolean(currentAccount) && stake <= Number(edgeAccountBalance)
    && stake <= (currentAccount?.balance ?? 0);

  return (
    <main className="xt-app">
      <header className="xt-header">
        <div className="xt-brand"><span>J</span><div><strong>JDY AI</strong><small>DERIV DIGIT TRADER</small></div>{accessSession.data?.is_admin === true && <Link href="/admin/users" className="xt-admin-link"><ShieldCheck size={14} /> ADMIN PANEL</Link>}</div>
        <div className={`xt-connection ${isConnected ? "online" : ""}`}><i />{statusText}</div>
      </header>

      <section className="xt-connect-card">
        <div className="xt-section-title"><Link2 size={17} /><div><b>Connect your Deriv account</b><small>Enter your own Personal Access Token with trade and read scopes. Your access key only opens this workspace.</small></div></div>
         {!canUseDeriv ? (
           <div className="xt-restricted-message"><ShieldAlert size={17} /><span>Restricted — admin access only. This key has not been granted a trading feature.</span></div>
         ) : !connectedToken ? (
          <form onSubmit={connectPat} className="xt-pat-form">
            <input type="password" value={pat} onChange={(event) => setPat(event.target.value)} placeholder="Paste your Deriv PAT token" autoComplete="off" />
            <button disabled={!pat.trim() || tokenMutation.isPending}>{tokenMutation.isPending ? <Loader2 className="spin" size={16} /> : <Power size={16} />}Connect</button>
          </form>
        ) : (
          <div className="xt-connected-row">
           <span><i />Deriv credential connected securely</span>
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
        <label className="xt-select-card"><small>TRADING ACCOUNT</small><div><select value={currentAccount?.id ?? ""} onChange={(event) => accountMutation.mutate({ data: { account_id: event.target.value } }, { onSuccess: () => void queryClient.invalidateQueries() })} disabled={!accountOptions.length || running || digitFlipRunning || tradeXSmartAuto || bulkBuyMutation.isPending || digitFlipBuyMutation.isPending || accountMutation.isPending}>
          {!accountOptions.length && <option value="">Connect PAT first</option>}
          {accountOptions.map((account) => <option key={account.id} value={account.id}>{account.id} · {account.type.toUpperCase()} · {account.currency} {account.balance.toFixed(2)}</option>)}
        </select><ChevronDown size={15} /></div></label>
      </section>

      <section className="xt-feature-card xt-feature-card-digit-flip">
        <div><Activity size={18} /><span><b>Bulk Trader</b><small>Send 1–6 contracts instantly across four trade types</small></span></div>
        <div className="xt-feature-actions">
          <button className="xt-guide-button" type="button" onClick={() => { setGuideMode("bulk-trader"); setGuidePage(0); setGuideOpen(true); }}>
            <BookOpen size={14} />Guide
          </button>
          <label className="xt-switch">
            <input type="checkbox" checked={bulkTraderEnabled} onChange={(event) => toggleBulkTrader(event.target.checked)} aria-label="Toggle Bulk Trader" disabled={!isConnected} />
            <span />
          </label>
        </div>
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

      {bulkTraderEnabled && (
        <BulkTraderPanel
          symbol={bulkTraderSymbol}
          symbols={tradeXSymbols}
          marketSignals={bulkTraderMarketSignals}
          marketLabel={markets.find(([id]) => id === bulkTraderSymbol)?.[1] ?? bulkTraderSymbol}
          quote={status.data?.last_tick?.quote}
          lastDigit={lastDigit}
          digitHistory={analysisDigits}
          type={bulkTraderType}
          prediction={bulkTraderPrediction}
          sampleTicks={bulkTraderSampleTicks}
          duration={bulkTraderDuration}
          stake={bulkTraderStake}
          tradeCount={bulkTraderCount}
          recentTrades={bulkRows}
          isConnected={isConnected}
          isReal={Boolean(isReal)}
          liveConfirmed={liveConfirmed}
          isPlacingTrade={bulkBuyMutation.isPending}
          historyFading={historyFading}
          clearArmed={bulkTraderClearArmed}
          onSymbolChange={(next) => { setBulkTraderSymbol(next); void selectMarket(next); }}
          onTypeChange={(next) => {
            setBulkTraderType(next);
            setBulkTraderPrediction(next === "over-under" ? 5 : next === "differs" ? 0 : next === "even-odd" ? "even" : "rise");
          }}
          onPredictionChange={setBulkTraderPrediction}
          onSampleTicksChange={setBulkTraderSampleTicks}
          onDurationChange={setBulkTraderDuration}
          onStakeChange={setBulkTraderStake}
          onTradeCountChange={setBulkTraderCount}
          onLiveConfirmChange={setLiveConfirmed}
          onTrade={(contractType, selectedBarrier) => void executeBulkTrade(contractType, selectedBarrier)}
          onRefreshAnalysis={refreshAnalysis}
          onClearHistory={() => void clearBulkTraderHistory()}
        />
      )}

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
           accountBalance={digitFlipAccountBalance || (currentAccount ? currentAccount.balance.toFixed(2) : "")}
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
            onAccountBalanceChange={setDigitFlipAccountBalance}
           onOutcomeSyncedChange={(synced) => {
             if (synced && currentAccount) setDigitFlipAccountBalance(currentAccount.balance.toFixed(2));
             setDigitFlipOutcomeSynced(synced);
           }}
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
          payoutPercent={status.data?.last_proposal && status.data.last_proposal.ask_price > 0
            ? (status.data.last_proposal.payout / status.data.last_proposal.ask_price) * 100
            : null}
          nextStake={nextStake}
          sessionPnl={sessionPnl}
          sessionTrades={sessionTrades}
          overThreeSniper={edgeOverThreeSniper}
          bestPairAnalyzer={edgeBestPairAnalyzer}
          autoSelectBest={edgeAutoSelectBest}
          scannerMessage={edgeScannerMessage}
          accountBalance={edgeAccountBalance || (currentAccount ? currentAccount.balance.toFixed(2) : "")}
          outcomeSynced={edgeOutcomeSynced}
          canTrade={canTrade}
          onStart={start}
          onStop={stop}
          onReset={reset}
          onOverThreeSniperChange={(enabled) => {
            setEdgeOverThreeSniper(enabled);
            edgeOverThreeSniperRef.current = enabled;
            if (enabled) {
              setEdgeAutoSelectBest(true);
              edgeAutoSelectBestRef.current = true;
              setEdgeBestPairAnalyzer(false);
              edgeBestPairAnalyzerRef.current = false;
              setEdgeScannerMessage("Hunting all Volatility and Jump pairs for the best observed Over 3 signal…");
              void selectEdgeAutomation();
            } else if (!edgeBestPairAnalyzerRef.current) {
              setEdgeAutoSelectBest(false);
              edgeAutoSelectBestRef.current = false;
              setEdgeScannerMessage(null);
            }
          }}
          onBestPairAnalyzerChange={(enabled) => {
            setEdgeBestPairAnalyzer(enabled);
            edgeBestPairAnalyzerRef.current = enabled;
            if (enabled) {
              setEdgeAutoSelectBest(true);
              edgeAutoSelectBestRef.current = true;
              setEdgeOverThreeSniper(false);
              edgeOverThreeSniperRef.current = false;
              setEdgeScannerMessage("Hunting all Volatility and Jump pairs for the best observed Over or Under digit…");
              void selectEdgeAutomation();
            } else if (!edgeOverThreeSniperRef.current) {
              setEdgeAutoSelectBest(false);
              edgeAutoSelectBestRef.current = false;
              setEdgeScannerMessage(null);
            }
          }}
          onAutoSelectBestChange={(enabled) => {
            edgeAutoSelectBestRef.current = enabled;
            setEdgeAutoSelectBest(enabled);
            if (enabled) {
              setEdgeScannerMessage("Following the live best observed market and barrier…");
              void selectEdgeAutomation();
            } else if (!edgeOverThreeSniperRef.current && !edgeBestPairAnalyzerRef.current) {
              setEdgeRecommendation(null);
              setEdgeScannerMessage(null);
            }
          }}
          onAccountBalanceChange={setEdgeAccountBalance}
          onOutcomeSyncedChange={(synced) => {
            if (synced && currentAccount) setEdgeAccountBalance(currentAccount.balance.toFixed(2));
            setEdgeOutcomeSynced(synced);
          }}
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
              <div><BookOpen size={18} /><span><b>{guideMode === "trade-x" ? "Trade X Guide" : guideMode === "digit-flip" ? "DigitFlip Guide" : guideMode === "bulk-trader" ? "Bulk Trader Guide" : "EDGE Guide"}</b><small>Page {guidePage + 1} of {activeGuidePages.length}</small></span></div>
              <button type="button" aria-label="Close guide" onClick={() => setGuideOpen(false)}><X size={17} /></button>
            </header>
            <div className="xt-guide-progress"><span style={{ width: `${((guidePage + 1) / activeGuidePages.length) * 100}%` }} /></div>
            <article className="xt-guide-page">
               <small className="xt-guide-kicker">{guideMode === "trade-x" ? "TRADE X FIELD GUIDE" : guideMode === "digit-flip" ? "DIGITFLIP FIELD GUIDE" : guideMode === "bulk-trader" ? "BULK TRADER FIELD GUIDE" : "EDGE FIELD GUIDE"}</small>
              <h2 id="xt-guide-title">{activeGuidePages[guidePage].title}</h2>
              <p>{activeGuidePages[guidePage].body}</p>
              <ul>{activeGuidePages[guidePage].points.map((point) => <li key={point}>{point}</li>)}</ul>
            </article>
            <footer className="xt-guide-footer">
              <button type="button" className="xt-guide-nav" onClick={() => setGuidePage((page) => Math.max(0, page - 1))} disabled={guidePage === 0}><ChevronLeft size={15} />Back</button>
              <span>{guidePage + 1} / {activeGuidePages.length}</span>
              {guidePage === activeGuidePages.length - 1 ? (
                <button type="button" className="xt-guide-start" onClick={() => { setGuideOpen(false); guideMode === "trade-x" ? toggleTradeX(true) : guideMode === "digit-flip" ? toggleDigitFlip(true) : guideMode === "bulk-trader" ? toggleBulkTrader(true) : toggleXTrader(true); }}>Let's start trading</button>
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