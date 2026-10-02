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
  useSellDerivContract,
  getDerivHistory,
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
import { DerivAccountSwitcher } from "@/components/deriv-account-switcher";
import {
  Activity, BookOpen, Bot, ChevronDown, ChevronLeft, ChevronRight, Link2, Loader2,
  Pause, Play, Power, RefreshCw, RotateCcw, ShieldAlert, ShieldCheck, X, Zap,
} from "lucide-react";
import {
  chooseBestDigitSignal,
  chooseBestEdgeSignal,
  digitForTick,
  nextStakeAfterSettlement,
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
import {
  MoneyBankPanel,
  calculateRecoveryLadder,
  type MoneyBankStartConfig,
  type MoneyBankMarketSignal,
  type MoneyBankTrade,
  type MoneyBankStrategy,
  type MoneyBankJdyDecision,
  MONEY_BANK_AUTO_SYMBOLS,
} from "../components/money-bank-panel";
import CashGrabPanel, {
  type CashGrabAiStatus,
  type CashGrabContractFamily,
  type CashGrabDirection,
  type CashGrabDuration,
  type CashGrabStartConfig,
  type CashGrabTrade,
} from "../components/cash-grab-panel";
import DerivHistory from "../components/deriv-history";
import { getAccountBalance } from "../lib/account-balance";
import { readCachedHistorySnapshot } from "../lib/history-snapshot";

const markets = [
  ["R_10", "Volatility 10 Index"], ["R_25", "Volatility 25 Index"],
  ["R_50", "Volatility 50 Index"], ["R_75", "Volatility 75 Index"],
  ["R_100", "Volatility 100 Index"], ["1HZ10V", "Volatility 10 (1s)"],
  ["1HZ15V", "Volatility 15 (1s)"], ["1HZ25V", "Volatility 25 (1s)"],
  ["1HZ30V", "Volatility 30 (1s)"], ["1HZ50V", "Volatility 50 (1s)"],
  ["1HZ75V", "Volatility 75 (1s)"], ["1HZ90V", "Volatility 90 (1s)"],
  ["1HZ100V", "Volatility 100 (1s)"],
  ["JD10", "Jump 10 Index"], ["JD25", "Jump 25 Index"], ["JD50", "Jump 50 Index"],
  ["JD75", "Jump 75 Index"], ["JD100", "Jump 100 Index"],
] as const;

const realizedProfit = (trades: readonly { status: string; profit: number }[]) =>
  trades.reduce((sum, trade) => sum + (trade.status === "open" ? 0 : trade.profit), 0);

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
  { title: "Ranked candidates", body: "Trade X can rank observed digits so you can compare the active Digit Differs barrier before sending a contract.", points: ["Ranked mode follows the live candidate order.", "Tap a digit or turn Manual Select on when you want an exact barrier.", "The active entry is shown before every action."] },
  { title: "Manual actions", body: "Place Trade X Trade sends one Digit Differs contract using the active digit.", points: ["Check market, stake, duration, and digit before sending.", "Manual digit taps switch to exact-digit selection so the request matches the screen.", "The expiry result is decided by Deriv."] },
  { title: "A careful workflow", body: "Start with a small demo stake, wait for a meaningful sample, and treat every signal as descriptive market context rather than certainty.", points: ["Confirm the selected account is the one you intend to use.", "Use the lowest practical stake while evaluating a market.", "Stop automation before changing markets or strategy assumptions."] },
  { title: "Set the stake", body: "Stake controls the amount requested for each Digit Differs contract. Start low while learning how the distribution reacts.", points: ["Keep a reserve in the account.", "The server and account balance remain final guards.", "A higher stake does not make a signal stronger."] },
  { title: "Manual selection", body: "Manual selection lets you choose the exact digit barrier rather than accepting the current ranked candidate.", points: ["Tap a digit to make it active.", "Confirm the selected digit before placing a trade.", "The barrier is sent with the contract request."] },
  { title: "Ranked candidates", body: "The ranked list orders digits from the observed distribution so you can compare the least frequent candidates for a Differs idea.", points: ["Ranking is based on the current sample.", "A low observed frequency is not a guarantee.", "Refresh the sample when the context changes."] },
  { title: "Observed percentages", body: "The distribution percentages summarize the selected sample and update as live ticks arrive.", points: ["Small samples can move sharply.", "Use sample count beside the percentage.", "Treat the number as context, not certainty."] },
  { title: "Place a manual trade", body: "Place Trade X Trade uses the active market, stake, duration, and selected digit to send one Digit Differs contract.", points: ["Review every control before placing.", "Live accounts require explicit confirmation.", "The expiry result is decided by Deriv."] },
  { title: "Live-money protection", body: "Real accounts require live-funds confirmation and the server's live-trading guard before Trade X can send contracts.", points: ["Switch to demo while learning.", "A disabled action indicates a missing guard.", "Reconfirm after an account switch."] },
  { title: "Reading open contracts", body: "An open row has been bought but does not yet have a final result. It remains visible while Deriv settles the contract.", points: ["Do not treat an open row as a win or loss.", "History refreshes as settlement arrives.", "New actions remain separate from open rows."] },
  { title: "Clearing Trade X history", body: "The Trade X clear control hides the dashboard rows after a second tap. It does not delete contracts or records from Deriv.", points: ["Use the two-step action intentionally.", "The fade confirms the rows were removed from view.", "Clearing does not stop automation."] },
  { title: "Reset the sample", body: "Refreshing analysis starts a new local sample window so the distribution reflects the next stream of ticks.", points: ["Wait for enough observations after refresh.", "Avoid making decisions from an empty sample.", "The account and contract history remain unchanged."] },
  { title: "Safe first session", body: "Start with one small demo Digit Differs contract, a fresh sample, and manual selection.", points: ["Confirm market, digit, duration, and stake.", "Watch the returned row settle.", "Stop if the signal no longer matches your plan."] },
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
  { title: "Select a trade type", body: "Bulk Trader supports Over / Under and Differs. The rest of the panel changes to match the selected contract family.", points: ["Only the controls for the active type are shown.", "Differs uses one selected digit.", "Manual trade buttons remain available regardless of the observed signal."] },
  { title: "Live analysis", body: "Bulk Trader keeps a running count of observed ticks for the selected market. The digit percentages and markers update as new ticks arrive.", points: ["Refresh starts the counter again at 1.", "The counter has no fixed end value.", "Observed percentages provide context, not certainty."] },
  { title: "Over and Under predictions", body: "Over / Under predictions use digits 1 through 9. The selected digit becomes the barrier sent with the matching contract.", points: ["Over wins above the selected barrier.", "Under wins below the selected barrier.", "The expiry digit decides the contract result."] },
  { title: "Reading O, U, and =", body: "For Over / Under, the digit row marks values above the selected barrier with O, below it with U, and the selected barrier with =.", points: ["The markers follow the selected prediction.", "The current tick is marked separately.", "A marker is descriptive market context only."] },
  { title: "Differs predictions", body: "Differs uses digits 0 through 9. The selected digit is the barrier that the contract must differ from at expiry.", points: ["The row does not show O or U markers in this mode.", "The selected digit is visibly emphasized.", "A digit absent from the sample is still not guaranteed to be absent next."] },
  { title: "Current tick display", body: "The current tick readout shows the latest live quote's last digit and marks that digit in the ten-digit strip.", points: ["The red pointer identifies the latest digit.", "A quote can move before the next control action.", "The sample trail shows recent context, not a fixed sequence."] },
  { title: "Execution ticks", body: "Execution duration is set separately from the analysis window. Choose 1 through 5 ticks for how long each contract observes before settlement.", points: ["One tick resolves quickly.", "Longer durations are not automatically safer.", "Changing duration does not rewrite past rows."] },
  { title: "Stake", body: "Stake starts at 0.35 and accepts decimals. The server and selected account remain the final authority over whether a contract can be bought.", points: ["Keep a reserve in the account.", "There is no artificial maximum in the control.", "A valid stake does not remove market risk."] },
  { title: "Number of bulk trades", body: "Choose 1 through 6 bulk trades. One action sends that many separate contracts and the history lists each returned contract independently.", points: ["Bulk count is not a single combined contract.", "Watch the account balance before increasing count.", "The request is blocked while another bulk request is pending."] },
  { title: "Trade buttons", body: "The action buttons change with the active trade type and show the current observed percentage beneath the label.", points: ["Over / Under show two buttons.", "Differs shows one action for the selected digit.", "Manual actions remain available when the observed signal is not ready."] },
  { title: "Live-money confirmation", body: "Real accounts require the live-funds confirmation before Bulk Trader sends anything. The API also enforces its own live-trading guardrails.", points: ["Read the confirmation before enabling a live action.", "Switch to demo when learning.", "A disabled button means a required guard is not satisfied."] },
  { title: "Bulk trade history", body: "Each returned contract is shown with its type, symbol, account, buy amount, status, and settlement result.", points: ["Open contracts show no final result yet.", "Rows update as the Deriv stream settles.", "Bulk history is kept separate from the other feature panels."] },
  { title: "Clearing history", body: "The history bin uses a two-step clear. Tap once to arm it, then tap again within the short window; rows fade from the dashboard without deleting Deriv records.", points: ["The second tap confirms the action.", "The fade gives feedback before rows disappear.", "Clearing does not affect active contracts."] },
  { title: "A safe first bulk session", body: "Use one demo contract, one tick, a small stake, and a fresh sample before increasing the bulk count or duration.", points: ["Confirm market, type, prediction, ticks, and stake.", "Watch the first returned row settle.", "Treat every percentage and streak as observed context, never certainty."] },
  { title: "Final checklist", body: "Bulk Trader is ready when the account, market, trade type, prediction, analysis window, execution duration, stake, and bulk count are intentional.", points: ["Start with a small demo batch.", "Keep the clear control available for dashboard hygiene.", "Use the guide again whenever you change contract family."] },
] as const;

const moneyBankGuidePages = [
  { title: "Welcome to Money Bank", body: "Money Bank is the Accumulator workspace for structured Volatility-index growth. It uses one open contract at a time and keeps the recovery state visible.", points: ["Start with a demo account while learning.", "Accumulator outcomes are not guaranteed.", "Read the full guide before using live funds."] },
  { title: "Connect your Deriv account", body: "Connect your own PAT and select the account that Money Bank should use. The server validates the credential and the account balance before every entry.", points: ["Use a demo account first.", "Real accounts require explicit confirmation.", "Keep your PAT private."] },
  { title: "Choose a Volatility pair", body: "The market selector contains Volatility indices only, including 1-second V10, V15, V25, V30, V50, V75, V90, and V100 streams.", points: ["Switch markets before starting.", "Live quotes show the selected stream.", "Changing markets does not change the recovery ladder."] },
  { title: "Growth rate", body: "Growth rate is the Accumulator growth applied to each tick. Higher rates can increase the theoretical return while also changing the contract risk.", points: ["Available rates are 1% through 5%.", "The exact decimal rate is sent to Deriv.", "The rate is not a win probability."] },
  { title: "Take-profit ticks", body: "Take Profit ticks is the exact contract duration target used by Money Bank. The panel keeps it between 5 and 50 ticks because Deriv Accumulator contracts require at least five ticks.", points: ["Shorter contracts settle sooner.", "Longer contracts expose the position for more ticks.", "The selected tick target is sent unchanged to Deriv."] },
  { title: "Auto Budget BASE", body: "Auto Budget divides the entered budget across the seven recovery levels and calculates the first BASE stake for you.", points: ["The budget is a planning amount, not a guaranteed loss cap.", "Review the calculated BASE before starting.", "The account balance remains the final guard."] },
  { title: "Manual BASE", body: "Manual BASE lets you choose the first stake directly. Each recovery level is calculated from that BASE and the selected growth and tick settings.", points: ["Use a small stake while testing.", "The next level can be larger after a loss.", "Keep enough balance for the full ladder."] },
  { title: "Recovery ladder", body: "BASE through L6 are explicit recovery levels. A losing settlement advances one level; a profitable settlement resets the level.", points: ["L6 is the final level.", "Money Bank stops instead of silently extending the ladder.", "The ladder is always visible before entry."] },
  { title: "Reinvest Profit", body: "Reinvest Profit is off by default. When it is off, every win resets to the original BASE; when it is on, the win is added to the next BASE.", points: ["The switch changes the next cycle only.", "Compounding can increase exposure quickly.", "Review the next-stake value after every win."] },
  { title: "Profit Target", body: "Profit Target is an optional session limit in account currency. Leave it blank to run without a positive P/L stop.", points: ["The limit is checked after settlement.", "It does not close a contract early.", "Blank means no profit target is applied."] },
  { title: "Loss Limit", body: "Loss Limit is an optional session guard. Leave it blank to run without a negative P/L stop.", points: ["The limit is checked after settlement.", "It is a guardrail, not a loss guarantee.", "Blank means no loss limit is applied."] },
  { title: "Safest pair snapshot", body: "The snapshot compares the live samples for supported Volatility pairs. It is advisory and does not change your selected market or settings.", points: ["Wait for samples before comparing markets.", "The snapshot is descriptive, not a prediction.", "Select any market manually before starting."] },
  { title: "Live pair samples", body: "The snapshot lists observed tick counts, rise and fall percentages, and the latest quote for each supported pair.", points: ["It shows observed market data, not simulated sessions.", "Refresh updates the capture time.", "Select a market manually before starting."] },
  { title: "Account and session", body: "The selected account and live balance appear in the workspace header. Money Bank session P/L and trade count remain in the footer.", points: ["Open contracts remain unsettled until Deriv responds.", "Session values reset when a new Money Bank run starts.", "The account balance is supplied by Deriv."] },
  { title: "Start Accumulator", body: "Start Accumulator validates the connection, account, balance, live confirmation, and calculated BASE before starting the guarded loop.", points: ["Check the selected pair and ladder first.", "The loop waits for settlement before its next entry.", "Only one Money Bank action runs at a time."] },
  { title: "Stop Accumulator", body: "Stop Accumulator immediately prevents another pending entry and then sends a close request for every open Accumulator contract found in the session history.", points: ["Wait for the closing state to finish.", "A pending buy is closed when Deriv acknowledges it.", "Stopping does not delete trade history."] },
  { title: "Trade history", body: "Money Bank history lists each returned Accumulator contract with its market, account, barrier, price, current value, payout, profit, status, and timestamps.", points: ["Open rows update with current value and profit.", "Rows update as Deriv settles or closes them.", "History is scoped visually to Accumulator contracts."] },
  { title: "Download and Reset", body: "Download exports the visible Money Bank rows as a CSV file. Reset uses a two-tap confirmation and fades the visible rows before clearing them from this panel.", points: ["Download does not alter account records.", "Reset does not cancel open contracts.", "A fresh run can add new rows again."] },
  { title: "Live-money protection", body: "Real-money use requires the live-funds confirmation and the server's own live-trading guard. Never treat the snapshot as a guarantee.", points: ["Demo testing is strongly recommended.", "A disabled action means a required guard is missing.", "Keep an acceptable reserve in the account."] },
  { title: "Final checklist", body: "Money Bank is ready when the account, Volatility pair, growth rate, ticks, BASE strategy, optional limits, reinvest state, and auto-switch state are intentional.", points: ["Start small.", "Watch every settlement.", "Stop if the session no longer matches your plan."] },
] as const;

const cashGrabGuidePages = [
  { title: "Welcome to Cash Grab", body: "Cash Grab is a controlled batch workspace for four supported Deriv contract families. It keeps the selected settings visible and records each returned contract separately.", points: ["Start with demo funds.", "Cash Grab does not guarantee a result.", "Read the full guide before live use."] },
  { title: "Connect your Deriv account", body: "Connect your own PAT and select the account Cash Grab should use. The server validates the credential and account before each request.", points: ["Keep your PAT private.", "Check the selected account.", "Demo is the safest place to learn."] },
  { title: "Choose a market", body: "Choose any supported Volatility or Jump market. The selected symbol remains fixed while Cash Grab is running.", points: ["Switch markets before starting.", "Wait for live digits after a change.", "Cash Grab never silently swaps your market."] },
  { title: "Choose a contract family", body: "Cash Grab supports Even / Odd, Rise / Fall, Differs, and Accumulator. Choose the family explicitly before sending.", points: ["One family is used per batch.", "The family is not inferred from a percentage.", "Deriv decides the settlement."] },
  { title: "Even and Odd", body: "Even and Odd are digit parity contracts. Select the exact parity shown in the contract controls before starting.", points: ["Even and Odd are separate contract types.", "The expiry digit decides the result.", "Recent parity is descriptive context only."] },
  { title: "Rise and Fall", body: "Rise and Fall map to Deriv's CALL and PUT contract types. Select Rise or Fall; Cash Grab keeps that choice fixed.", points: ["Rise and Fall are separate directions.", "The quote at entry does not guarantee expiry.", "Review the returned contract status."] },
  { title: "Digit Differs", body: "Differs uses the selected digit as its barrier. The contract wins only when the expiry digit differs from that barrier.", points: ["Digits 0 through 9 are available.", "The barrier is sent unchanged.", "A missing digit in a sample is not a guarantee."] },
  { title: "Accumulator", body: "Accumulator uses the selected market and a fixed low growth parameter required by Deriv. The server requires at least 1.00 per contract.", points: ["A stake below 1.00 is rejected without adjustment.", "Growth is not a win probability.", "Read the settlement and floating value carefully."] },
  { title: "Read the live digit", body: "The live digit strip shows observed overall and selected-market percentages. The 💯 marker identifies the current live digit.", points: ["The marker is telemetry, not a signal guarantee.", "Digits can change between reading and entry.", "Wait for a useful sample."] },
  { title: "Stake", body: "Stake is the amount requested for each contract. Cash Grab accepts a minimum of 0.35 and does not silently increase a selected stake.", points: ["The connected balance remains final.", "Accumulator has its own 1.00 minimum.", "Keep a reserve."] },
  { title: "Bulk count", body: "Bulk count is the number of independent contracts sent in one request. There is no visible dashboard maximum; account balance and server capacity remain final guards.", points: ["A batch is not one combined contract.", "Contracts can settle differently.", "Review every returned row."] },
  { title: "Duration", body: "Choose 1 through 5 ticks for the contract duration. Shorter duration settles sooner but does not remove market risk.", points: ["The selected duration is sent unchanged.", "Duration does not improve probability by itself.", "Open contracts remain open until Deriv settles them."] },
  { title: "Sync Balance", body: "SYNC BALANCE can calculate the per-contract stake from a selected percentage of the connected balance. DOUBLE SYNC is a visible percentage control.", points: ["Sync is optional.", "The parent retains balance guards.", "A synced value is still a risk amount."] },
  { title: "Shadows 2", body: "Shadows 2 is a pre-entry safety gate. It remains quiet until MONEY START, then it may hold an entry when the selected setup fails the current risk check.", points: ["It does not change your settings.", "A held entry is skipped, not replaced.", "It does not promise a win."] },
  { title: "Shadows 3", body: "Shadows 3 can begin the Cash Grab loop without a separate MONEY START tap. It uses the same honest pre-entry gate and does not claim a guaranteed outcome.", points: ["It uses the selected settings.", "Rejected entries are skipped.", "Disable it to return to manual start."] },
  { title: "MONEY START", body: "MONEY START snapshots the visible Cash Grab configuration and begins the controlled loop after account and live-trading checks pass.", points: ["Review market, family, direction, stake, count, and ticks.", "The loop waits between independent batches.", "Changing controls does not rewrite an active batch."] },
  { title: "MONEY STOP", body: "MONEY STOP prevents another batch from being started and closes every active Cash Grab contract from the current run.", points: ["The stop sweep covers every returned contract, not just the last one.", "Contracts already settled remain in history.", "Review history after stopping."] },
  { title: "Session P/L", body: "Session P/L totals the settled profit and loss for Cash Grab entries since the current run began.", points: ["Open contracts are not final P/L.", "The account balance comes from Deriv.", "A positive session does not predict the next result."] },
  { title: "Trading history", body: "History lists each returned contract with family, symbol, stake, status, and result. Independent contracts can show different outcomes in the same batch.", points: ["OPEN means no final result yet.", "WON and LOST reflect returned settlement data.", "History does not delete Deriv records."] },
  { title: "Clear history", body: "The clear action uses a second tap and a short fade to hide visible Cash Grab rows from this dashboard.", points: ["It does not cancel open contracts.", "It does not delete Deriv records.", "New returned rows can appear in a later session."] },
  { title: "Final checklist", body: "Cash Grab is ready when the account, market, family, direction, digit, stake, count, duration, balance mode, and AI gate state are intentional.", points: ["Start small on demo.", "Treat percentages as context.", "Never rely on a guaranteed outcome."] },
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
// Cash Grab does not expose the generic tick-duration control for Accumulators.
// Deriv still needs a reference horizon to calculate the take-profit quote, and
// five ticks is the supported default used by the accumulator workflow.
const CASH_GRAB_ACCUMULATOR_REFERENCE_TICKS: CashGrabDuration = 5;
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

function chooseBestAutoOver345Signal(signals: MarketSignal[], excludeSymbol?: string): BestEdgeSignal | null {
  const candidates = signals
    .filter((signal) => signal.sample_count >= EDGE_MIN_MARKET_SAMPLE && signal.quote != null && signal.symbol !== excludeSymbol)
    .flatMap((signal) => (signal.digit_outcomes ?? [])
      .filter((outcome) => outcome.digit >= 3 && outcome.digit <= 5)
      .map((outcome) => ({
        symbol: signal.symbol,
        direction: "DIGITOVER" as const,
        digit: outcome.digit,
        score: Number(outcome.over_percentage),
        sampleCount: signal.sample_count,
      })))
    .filter((candidate) => Number.isFinite(candidate.score))
    .sort((left, right) => right.score - left.score || right.sampleCount - left.sampleCount);
  return candidates[0] ?? null;
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

type MoneyBankScannerRecommendation = {
  symbol: string;
  growthRate: number;
  takeProfitTicks: number;
  score: number;
  sampleCount: number;
  observedBalance: number;
  estimatedLosses: number;
};

type CashGrabAutoSwitchRecommendation = {
  symbol: string;
  observedWinRate: number;
  observedLossRate: number;
  sampleCount: number;
  multiplier: number;
  nextStake: number;
  score: number;
};

export default function XTraderPage() {
  const accessSession = useGetAccessSession({ query: { retry: false, queryKey: getGetAccessSessionQueryKey() } });
  const queryClient = useQueryClient();
  const isAdmin = accessSession.data?.is_admin === true;
  const canUseEdge = isAdmin || accessSession.data?.features.includes("edge") === true;
  const canUseDigitFlip = isAdmin || accessSession.data?.features.includes("digit-flip") === true;
  const canUseTradeX = isAdmin || accessSession.data?.features.includes("trade-x") === true;
  const canUseBulkTrader = isAdmin || accessSession.data?.features.includes("bulk-trader") === true;
  const canUseCashGrab = isAdmin || accessSession.data?.features.includes("cash-grab") === true;
  const canUseMoneyBank = isAdmin || accessSession.data?.features.includes("money-bank") === true;
  const canUseJdyAi3 = isAdmin || accessSession.data?.features.includes("jdy-ai-3") === true;
  const canUseDeriv = canUseEdge || canUseDigitFlip || canUseTradeX || canUseBulkTrader || canUseCashGrab || canUseMoneyBank;
  const canViewHistory = canUseDeriv || accessSession.data?.features.includes("history") === true;
  const tokenStatus = useGetDerivTokenStatus({ query: { enabled: canUseDeriv, retry: false, queryKey: getGetDerivTokenStatusQueryKey() } });
  const connectedToken = Boolean(tokenStatus.data?.has_token);
  const accounts = useGetDerivAccounts({ query: { enabled: connectedToken && canUseDeriv, retry: false, refetchInterval: 10_000, queryKey: getGetDerivAccountsQueryKey() } });
  const storedPatInvalid = errorMessage(accounts.error).includes("saved Deriv token is no longer readable");
  const status = useGetDerivStatus({ query: { enabled: connectedToken && canUseDeriv, retry: false, refetchInterval: 500, queryKey: getGetDerivStatusQueryKey() } });
  const history = useGetDerivHistory({ query: { enabled: connectedToken && canViewHistory, retry: false, refetchInterval: 1_000, queryKey: getGetDerivHistoryQueryKey() } });
  const tokenMutation = useTestDerivToken();
  const connectionMutation = useTestDerivConnection();
  const deleteTokenMutation = useDeleteDerivToken();
  const symbolMutation = useSelectDerivSymbol();
  const bulkBuyMutation = useBulkBuyDerivContracts();
  const dualBuyMutation = useDualBuyDerivContracts();
  const digitFlipBuyMutation = useBuyDerivContract();
  const moneyBankBuyMutation = useBuyDerivContract();
  const moneyBankSellMutation = useSellDerivContract();
  const cashGrabSellMutation = useSellDerivContract();

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
  const [edgeAutoOverThreeFourFive, setEdgeAutoOverThreeFourFive] = useState(false);
  const [edgeBestPairAnalyzer, setEdgeBestPairAnalyzer] = useState(false);
  const [edgeAutoSelectBest, setEdgeAutoSelectBest] = useState(false);
  const [edgeScannerMessage, setEdgeScannerMessage] = useState<string | null>(null);
  const [edgeAccountBalance, setEdgeAccountBalance] = useState("");
  const [xTraderEnabled, setXTraderEnabled] = useState(false);
  const [tradeXEnabled, setTradeXEnabled] = useState(false);
  const [tradeXMarketType, setTradeXMarketType] = useState<TradeXMarketType>("volatility");
  const [tradeXSymbol, setTradeXSymbol] = useState("R_75");
  const [tradeXStake, setTradeXStake] = useState(1);
  const [tradeXSelectedDigit, setTradeXSelectedDigit] = useState(5);
  const [tradeXDuration, setTradeXDuration] = useState<TradeXDuration>(1);
  const [tradeXManualSelect, setTradeXManualSelect] = useState(false);
  const [digitFlipEnabled, setDigitFlipEnabled] = useState(false);
  const [edge2Enabled, setEdge2Enabled] = useState(false);
  const [moneyBankSymbol, setMoneyBankSymbol] = useState("1HZ90V");
  const [moneyBankGrowthRate, setMoneyBankGrowthRate] = useState(4);
  const [moneyBankTakeProfitTicks, setMoneyBankTakeProfitTicks] = useState(5);
  const [moneyBankStrategy, setMoneyBankStrategy] = useState<MoneyBankStrategy>("budget");
  const [moneyBankBudget, setMoneyBankBudget] = useState(500);
  const [moneyBankManualBase, setMoneyBankManualBase] = useState(1);
  const [moneyBankReinvestProfit, setMoneyBankReinvestProfit] = useState(false);
  const [moneyBankReinvestPercent, setMoneyBankReinvestPercent] = useState(100);
  const [moneyBankProfitTarget, setMoneyBankProfitTarget] = useState<number | null>(null);
  const [moneyBankLossLimit, setMoneyBankLossLimit] = useState<number | null>(null);
  const [moneyBankRunning, setMoneyBankRunning] = useState(false);
  const [moneyBankClosing, setMoneyBankClosing] = useState(false);
  const [moneyBankSafestSymbol, setMoneyBankSafestSymbol] = useState("1HZ90V");
  const [moneyBankScannerEnabled, setMoneyBankScannerEnabled] = useState(false);
  const [moneyBankScannerCountdown, setMoneyBankScannerCountdown] = useState(0);
  const [moneyBankScannerBusy, setMoneyBankScannerBusy] = useState(false);
  const [moneyBankScannerRecommendation, setMoneyBankScannerRecommendation] = useState<MoneyBankScannerRecommendation | null>(null);
  const [moneyBankJdyEnabled, setMoneyBankJdyEnabled] = useState(false);
  const [moneyBankJdyState, setMoneyBankJdyState] = useState<"idle" | "scanning" | "safe" | "not-good">("idle");
  const [moneyBankJdyDecision, setMoneyBankJdyDecision] = useState<MoneyBankJdyDecision | null>(null);
  const [moneyBankSessionPnl, setMoneyBankSessionPnl] = useState(0);
  const [moneyBankLastSettledProfit, setMoneyBankLastSettledProfit] = useState<number | null>(null);
  const [moneyBankTradeCount, setMoneyBankTradeCount] = useState(0);
  const [bulkTraderEnabled, setBulkTraderEnabled] = useState(false);
  const [bulkTraderType, setBulkTraderType] = useState<BulkTraderType>("over-under");
  const [bulkTraderPrediction, setBulkTraderPrediction] = useState<BulkTraderPrediction>(5);
  const [bulkTraderSymbol, setBulkTraderSymbol] = useState("R_75");
  const [bulkTraderDuration, setBulkTraderDuration] = useState(1);
  const [bulkTraderStake, setBulkTraderStake] = useState(.35);
  const [bulkTraderCount, setBulkTraderCount] = useState(1);
  const [bulkTraderClearArmed, setBulkTraderClearArmed] = useState(false);
  const [bulkTraderAutoSelectBest, setBulkTraderAutoSelectBest] = useState(false);
  const [bulkTraderHiddenHistoryIds, setBulkTraderHiddenHistoryIds] = useState<Set<string>>(new Set());
  const [cashGrabEnabled, setCashGrabEnabled] = useState(false);
  const [cashGrabFamily, setCashGrabFamily] = useState<CashGrabContractFamily>("even-odd");
  const [cashGrabDirection, setCashGrabDirection] = useState<CashGrabDirection>("DIGITEVEN");
  const [cashGrabSymbol, setCashGrabSymbol] = useState("R_75");
  const [cashGrabSelectedDigit, setCashGrabSelectedDigit] = useState(5);
  const [cashGrabStake, setCashGrabStake] = useState(.35);
  const [cashGrabGrowthRate, setCashGrabGrowthRate] = useState(1);
  const [cashGrabCount, setCashGrabCount] = useState(1);
  const [cashGrabDuration, setCashGrabDuration] = useState<CashGrabDuration>(CASH_GRAB_ACCUMULATOR_REFERENCE_TICKS);
  const [cashGrabMultiplier, setCashGrabMultiplier] = useState<number | null>(null);
  const [cashGrabAutoSelectBest, setCashGrabAutoSelectBest] = useState(false);
  const [cashGrabAutoSwitchSafestPair, setCashGrabAutoSwitchSafestPair] = useState(false);
  const [cashGrabAutoSwitchSafestPairStatus, setCashGrabAutoSwitchSafestPairStatus] = useState<CashGrabAiStatus>("off");
  const [cashGrabAutoSwitchRecommendation, setCashGrabAutoSwitchRecommendation] = useState<CashGrabAutoSwitchRecommendation | null>(null);
  const [cashGrabSyncBalance, setCashGrabSyncBalance] = useState(false);
  const [cashGrabBalancePercentage, setCashGrabBalancePercentage] = useState(10);
  const [cashGrabJdyAi2, setCashGrabJdyAi2] = useState(false);
  const [cashGrabJdyAi3, setCashGrabJdyAi3] = useState(false);
  const [cashGrabJdyAi2Status, setCashGrabJdyAi2Status] = useState<CashGrabAiStatus>("off");
  const [cashGrabJdyAi3Status, setCashGrabJdyAi3Status] = useState<CashGrabAiStatus>("off");
  const [cashGrabRunning, setCashGrabRunning] = useState(false);
  const [cashGrabStopping, setCashGrabStopping] = useState(false);
  const [cashGrabSessionPnl, setCashGrabSessionPnl] = useState(0);
  const [cashGrabTradeCount, setCashGrabTradeCount] = useState(0);
  const [cashGrabClearArmed, setCashGrabClearArmed] = useState(false);
  const [cashGrabHiddenHistoryIds, setCashGrabHiddenHistoryIds] = useState<Set<string>>(new Set());
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
  const [digitFlipClearArmed, setDigitFlipClearArmed] = useState(false);
  const [edgeHiddenHistoryIds, setEdgeHiddenHistoryIds] = useState<Set<string>>(new Set());
  const [digitFlipHiddenHistoryIds, setDigitFlipHiddenHistoryIds] = useState<Set<string>>(new Set());
  const [edgeMinWinRate, setEdgeMinWinRate] = useState(90);
  const [tradeXTradesSent, setTradeXTradesSent] = useState(0);
  const [tradeXMessage, setTradeXMessage] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guidePage, setGuidePage] = useState(0);
  const [guideMode, setGuideMode] = useState<"edge" | "trade-x" | "digit-flip" | "bulk-trader" | "money-bank" | "cash-grab">("edge");
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
  const [connectionMessageFading, setConnectionMessageFading] = useState(false);
  useEffect(() => {
    if (!connectionMessage) {
      setConnectionMessageFading(false);
      return;
    }
    setConnectionMessageFading(false);
    const fadeTimer = window.setTimeout(() => setConnectionMessageFading(true), 4500);
    const removeTimer = window.setTimeout(() => setConnectionMessage(null), 5000);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(removeTimer);
    };
  }, [connectionMessage]);
  const [nextStake, setNextStake] = useState(stake);
  const runningRef = useRef(false);
  const autoSwitchRef = useRef(autoSwitch);
  const edgePercentageModeRef = useRef(edgePercentageMode);
  const edgeOverThreeSniperRef = useRef(edgeOverThreeSniper);
  const edgeAutoOverThreeFourFiveRef = useRef(edgeAutoOverThreeFourFive);
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
  const tradeXActionLockRef = useRef(false);
  const edgeActionLockRef = useRef(false);
  const edgeSettlementLockRef = useRef(false);
  const bulkActionLockRef = useRef(false);
  const digitFlipRunningRef = useRef(false);
  const moneyBankRunningRef = useRef(false);
  const moneyBankSafestSymbolRef = useRef("1HZ90V");
  const moneyBankActionLockRef = useRef(false);
  const moneyBankClosePromiseRef = useRef<Promise<void> | null>(null);
  const moneyBankOpenContractIdRef = useRef<string | null>(null);
  const moneyBankScannerNextAtRef = useRef<number | null>(null);
  const moneyBankScannerRotationRef = useRef(0);
  const moneyBankJdyScanInFlightRef = useRef(false);
  const cashGrabRunningRef = useRef(false);
  const cashGrabRunIdRef = useRef(0);
  const cashGrabActionLockRef = useRef(false);
  const cashGrabRemainingTradesRef = useRef(0);
  const cashGrabCurrentStakeRef = useRef(.35);
  const cashGrabSessionKnownIdsRef = useRef<Set<string> | null>(null);
  const cashGrabProcessedSettlementIdsRef = useRef(new Set<string>());
  const cashGrabConfigRef = useRef<CashGrabStartConfig | null>(null);
  const cashGrabSessionPnlRef = useRef(0);
  const cashGrabAutoSwitchBusyRef = useRef(false);
  const cashGrabAutoSwitchNextAtRef = useRef<number | null>(null);
  const cashGrabAutoSwitchRecommendationRef = useRef<CashGrabAutoSwitchRecommendation | null>(null);
  const cashGrabClosePromiseRef = useRef<Promise<void> | null>(null);
  const moneyBankSessionKnownIdsRef = useRef<Set<string> | null>(null);
  const moneyBankProcessedSettlementIdsRef = useRef(new Set<string>());
  const moneyBankLevelRef = useRef(0);
  const moneyBankConfigRef = useRef<MoneyBankStartConfig | null>(null);
  const moneyBankSessionPnlRef = useRef(0);
  const digitFlipActionLockRef = useRef(false);
  const digitFlipAssaultRef = useRef(false);
  const digitFlipMagicRef = useRef(false);
  const digitFlipNextMarketScanAtRef = useRef(0);
  const digitFlipAutoSelectionKeyRef = useRef("");
  const digitFlipMarketSignalsRef = useRef<DigitFlipMarketSignal[]>([]);
  const digitFlipRatesRef = useRef({ even: 50, odd: 50 });
  const digitFlipConfigRef = useRef({
    marketType: digitFlipMarketType,
    symbol: digitFlipSymbol,
    parity: digitFlipParity,
    duration: digitFlipDuration,
    stake: digitFlipStake,
    stakeMode: digitFlipStakeMode,
    multiplier: digitFlipMultiplier,
  });
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
  const bulkSessionKnownIdsRef = useRef<Set<string> | null>(null);
  const edgeClaimedHistoryIdsRef = useRef(new Set<string>());
  const tradeXClaimedHistoryIdsRef = useRef(new Set<string>());
  const digitFlipClaimedHistoryIdsRef = useRef(new Set<string>());
  const bulkClaimedHistoryIdsRef = useRef(new Set<string>());
  const cashGrabClaimedHistoryIdsRef = useRef(new Set<string>());
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
    frameworkSignalReady: false,
    rankedDigits: [] as number[],
  });

  const currentAccount = status.data?.account;
  const currentAccountBalance = getAccountBalance(currentAccount);
  const isReal = currentAccount?.type === "real";
  const isConnected = Boolean(status.data?.connected && status.data?.authorized);
  const volatilityMarkets = markets.filter(([market]) => !market.startsWith("JD"));
  const moneyBankMarkets = volatilityMarkets.filter(([market]) =>
    (MONEY_BANK_AUTO_SYMBOLS as readonly string[]).includes(market),
  );
  const rows = history.data ?? [];
  const readHistorySnapshot = async () => {
    // History is a display and settlement feed. The API's buy guard is the
    // authority for whether another contract can be opened.
    return readCachedHistorySnapshot(
      async () => {
        const latestRows = await getDerivHistory();
        queryClient.setQueryData(getGetDerivHistoryQueryKey(), latestRows);
        return latestRows;
      },
      queryClient.getQueryData<typeof rows>(getGetDerivHistoryQueryKey()) ?? rows,
    );
  };
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
  const moneyBankAllRows = rows.filter((trade) => trade.contract_type === "ACCU");
  const cashGrabAllRows = rows.filter((trade) => (
    trade.contract_type === "DIGITEVEN"
    || trade.contract_type === "DIGITODD"
    || trade.contract_type === "CALL"
    || trade.contract_type === "PUT"
    || trade.contract_type === "DIGITDIFF"
    || trade.contract_type === "ACCU"
  ));
  const edgeRows = edgeAllRows.filter((trade) => edgeClaimedHistoryIdsRef.current.has(trade.contract_id) && !edgeHiddenHistoryIds.has(trade.contract_id));
  const tradeXRows = tradeXAllRows.filter((trade) => tradeXClaimedHistoryIdsRef.current.has(trade.contract_id) && !tradeXHiddenHistoryIds.has(trade.contract_id));
  const digitFlipRows = digitFlipAllRows.filter((trade) => digitFlipClaimedHistoryIdsRef.current.has(trade.contract_id) && !digitFlipHiddenHistoryIds.has(trade.contract_id));
  const bulkRows = bulkAllRows.filter((trade) => bulkClaimedHistoryIdsRef.current.has(trade.contract_id) && !bulkTraderHiddenHistoryIds.has(trade.contract_id));
  const moneyBankRows = moneyBankAllRows
    .filter((trade) => !cashGrabClaimedHistoryIdsRef.current.has(trade.contract_id)) as MoneyBankTrade[];
  const cashGrabRows = cashGrabAllRows
    .filter((trade) => !cashGrabHiddenHistoryIds.has(trade.contract_id))
    .filter((trade) => cashGrabClaimedHistoryIdsRef.current.has(trade.contract_id)) as CashGrabTrade[];
  const cashGrabSymbols = markets.map(([value, label]) => ({ value, label }));
  const cashGrabBestSymbol = useMemo(() => {
    const supported = new Set<string>(cashGrabSymbols.map((item) => item.value));
    const signals = (status.data?.market_signals ?? [])
      .filter((signal) => supported.has(signal.symbol) && signal.sample_count >= 5)
      .map((signal) => {
        const observedRate = cashGrabFamily === "even-odd"
          ? Math.max(signal.digit_even_percentage ?? 0, signal.digit_odd_percentage ?? 0)
          : cashGrabFamily === "rise-fall" || cashGrabFamily === "accumulator"
            ? Math.max(signal.rise_percentage ?? 0, signal.fall_percentage ?? 0)
            : Math.max(signal.rise_percentage ?? 0, signal.fall_percentage ?? 0);
        return { signal, score: observedRate + Math.min(signal.sample_count, 100) / 100 };
      });
    return signals.sort((left, right) => right.score - left.score || right.signal.sample_count - left.signal.sample_count)[0]?.signal.symbol ?? null;
  }, [cashGrabFamily, cashGrabSymbols, status.data?.market_signals]);
  const cashGrabDigitObservations = useMemo(() => {
    const marketDigits = status.data?.digit_history?.length ? status.data.digit_history : analysisDigits;
    const marketCounts = Array.from({ length: 10 }, (_, digit) => marketDigits.filter((entry) => entry === digit).length);
    const sample = marketDigits.length || 1;
    return Array.from({ length: 10 }, (_, digit) => ({
      digit,
      marketPercentage: (marketCounts[digit] / sample) * 100,
      overallPercentage: (analysisDigits.filter((entry) => entry === digit).length / Math.max(1, analysisDigits.length)) * 100,
    }));
  }, [analysisDigits, status.data?.digit_history]);
  const bulkSessionRows = bulkSessionKnownIdsRef.current
    ? bulkAllRows.filter((trade) => bulkClaimedHistoryIdsRef.current.has(trade.contract_id) && !bulkSessionKnownIdsRef.current?.has(trade.contract_id))
    : [];
  const edgeSessionRows = edgeSessionKnownIdsRef.current
    ? edgeAllRows.filter((trade) => edgeClaimedHistoryIdsRef.current.has(trade.contract_id) && !edgeSessionKnownIdsRef.current?.has(trade.contract_id))
    : [];
  const digitFlipSessionRows = digitFlipSessionKnownIdsRef.current
    ? digitFlipAllRows.filter((trade) => digitFlipClaimedHistoryIdsRef.current.has(trade.contract_id) && !digitFlipSessionKnownIdsRef.current?.has(trade.contract_id))
    : [];
  const moneyBankSessionRows = moneyBankSessionKnownIdsRef.current
    ? moneyBankAllRows
      .filter((trade) => !cashGrabClaimedHistoryIdsRef.current.has(trade.contract_id))
      .filter((trade) => !moneyBankSessionKnownIdsRef.current?.has(trade.contract_id))
    : [];
  const cashGrabSessionRows = cashGrabSessionKnownIdsRef.current
    ? cashGrabAllRows.filter((trade) => cashGrabClaimedHistoryIdsRef.current.has(trade.contract_id) && !cashGrabSessionKnownIdsRef.current?.has(trade.contract_id))
    : [];
  const moneyBankCompletedRows = moneyBankSessionRows.filter((trade) => trade.status !== "open");
  const moneyBankSignals = (status.data?.market_signals ?? []) as MoneyBankMarketSignal[];
  const moneyBankScannerRecommendationRef = useRef<MoneyBankScannerRecommendation | null>(null);
  const fastSessionPnl = realizedProfit(edgeSessionRows);
  const moneyBankHistorySessionPnl = realizedProfit(moneyBankSessionRows);
  const cashGrabHistorySessionPnl = realizedProfit(cashGrabSessionRows);
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
      const observedPercentage = bulkTraderType === "over-under"
        ? Number((selectedOutcome ? Math.max(Number(selectedOutcome.over_percentage), Number(selectedOutcome.under_percentage)) : 50).toFixed(1))
         : Number(differsRate.toFixed(1));
      return {
        symbol: signal.symbol,
        sampleCount: signal.sample_count,
        observedPercentage,
      };
    }),
    [bulkTraderPrediction, bulkTraderType, status.data?.market_signals],
  );
  const bulkTraderBestSymbol = useMemo(
    () => [...bulkTraderMarketSignals]
      .sort((left, right) => right.observedPercentage - left.observedPercentage || right.sampleCount - left.sampleCount)[0]?.symbol ?? null,
    [bulkTraderMarketSignals],
  );

  const scanMoneyBank = async () => {
    if (!isConnected || moneyBankScannerBusy) return;
    setMoneyBankScannerBusy(true);
    try {
      const freshStatus = await status.refetch();
      const freshSignals = (freshStatus.data?.market_signals ?? moneyBankSignals) as MoneyBankMarketSignal[];
       const candidates: MoneyBankScannerRecommendation[] = [];
      for (const [marketSymbol] of moneyBankMarkets) {
        const signal = freshSignals.find((entry) => entry.symbol === marketSymbol);
        if (!signal || signal.sample_count < 5) continue;
        const observedBalance = Math.max(signal.rise_percentage ?? 50, signal.fall_percentage ?? 50);
        for (let growthRate = 1; growthRate <= 5; growthRate += 1) {
          for (let takeProfitTicks = 5; takeProfitTicks <= 50; takeProfitTicks += 1) {
             const riskPenalty = growthRate * 1.35 + takeProfitTicks * 0.08;
             const sampleConfidence = Math.min(signal.sample_count, 100) / 10;
             const estimatedLosses = Math.max(0, Math.ceil((100 - observedBalance + riskPenalty) / 10));
             candidates.push({
               symbol: marketSymbol,
               growthRate,
               takeProfitTicks,
               score: observedBalance * 0.9 + sampleConfidence - estimatedLosses * 2 - riskPenalty,
               sampleCount: signal.sample_count,
               observedBalance,
               estimatedLosses,
             });
          }
        }
      }
       const ranked = candidates.sort((left, right) =>
         right.observedBalance - left.observedBalance
         || left.estimatedLosses - right.estimatedLosses
         || right.sampleCount - left.sampleCount
         || right.score - left.score,
       );
       const bestByMarket = moneyBankMarkets
         .map(([marketSymbol]) => ranked.find((candidate) => candidate.symbol === marketSymbol))
         .filter((candidate): candidate is MoneyBankScannerRecommendation => Boolean(candidate))
         .sort((left, right) =>
           right.observedBalance - left.observedBalance
           || left.estimatedLosses - right.estimatedLosses
           || right.sampleCount - left.sampleCount
           || right.score - left.score,
         );
       const rotationWindow = bestByMarket.length ? bestByMarket : ranked.slice(0, Math.min(24, ranked.length));
       const rotationIndex = rotationWindow.length ? moneyBankScannerRotationRef.current++ % rotationWindow.length : 0;
       const best = rotationWindow[rotationIndex] ?? null;
      moneyBankScannerRecommendationRef.current = best;
      setMoneyBankScannerRecommendation(best);
      if (best) {
        setConnectionMessage({
          kind: "info",
          text: `AI SCANNER recommends ${best.symbol} at ${best.growthRate}% growth for ${best.takeProfitTicks} ticks (${best.observedBalance.toFixed(1)}% observed market balance).`,
        });
      } else {
        setConnectionMessage({ kind: "info", text: "AI SCANNER is collecting enough live samples across the supported Volatility markets." });
      }
    } catch (error) {
      setConnectionMessage({ kind: "error", text: `AI SCANNER could not refresh: ${errorMessage(error)}` });
    } finally {
      setMoneyBankScannerBusy(false);
    }
  };

  const scanJdyMoneyBank = async (
    candidateConfig?: MoneyBankStartConfig,
    candidateSymbol?: string,
  ): Promise<MoneyBankJdyDecision | null> => {
    if (!isConnected || moneyBankJdyScanInFlightRef.current) return moneyBankJdyDecision;
    const config = candidateConfig ?? moneyBankConfigRef.current;
    const selectedSymbol = candidateSymbol ?? config?.symbol;
    if (!config || !selectedSymbol) return null;
    moneyBankJdyScanInFlightRef.current = true;
    setMoneyBankJdyState("scanning");
    try {
      const freshStatus = await status.refetch();
      const freshSignals = (freshStatus.data?.market_signals ?? moneyBankSignals) as MoneyBankMarketSignal[];
      const evaluateSetup = (marketSymbol: string, growthRate: number, takeProfitTicks: number): MoneyBankJdyDecision => {
        const signal = freshSignals.find((entry) => entry.symbol === marketSymbol);
        const observedBalance = signal ? Math.max(signal.rise_percentage ?? 50, signal.fall_percentage ?? 50) : 0;
        const stake = config.ladder[Math.min(6, moneyBankLevelRef.current)]?.stake ?? config.ladder[0]?.stake ?? 1;
        const stakeRiskPenalty = currentAccountBalance
          ? Math.min(15, (stake / currentAccountBalance) * 100)
          : 20;
        const riskPenalty = growthRate * 1.5 + takeProfitTicks * 0.12 + stakeRiskPenalty;
        const predictedWinRate = Math.max(0, Math.min(100, observedBalance - riskPenalty));
        const estimatedLossStreak = Math.max(0, Math.ceil((100 - predictedWinRate) / 10));
        const sampleCount = signal?.sample_count ?? 0;
        const score = predictedWinRate + Math.min(sampleCount, 200) / 10;
        return {
          symbol: marketSymbol,
          growthRate,
          takeProfitTicks,
          score,
          sampleCount,
          observedBalance,
          estimatedLosses: estimatedLossStreak,
          stake,
          predictedWinRate,
          estimatedLossStreak,
           safe: sampleCount >= 5 && predictedWinRate >= 45 && estimatedLossStreak <= 5,
          suggestedSymbol: null,
          suggestedGrowthRate: null,
          suggestedTakeProfitTicks: null,
          suggestedStake: Math.max(1, Number((stake * 0.5).toFixed(2))),
        };
      };

      const decision = evaluateSetup(selectedSymbol, config.growthRate, config.takeProfitTicks);
      const alternatives = moneyBankMarkets
        .flatMap(([marketSymbol]) => Array.from({ length: 5 }, (_, index) => index + 1)
          .flatMap((growthRate) => Array.from({ length: 46 }, (_, index) => index + 5)
            .map((takeProfitTicks) => evaluateSetup(marketSymbol, growthRate, takeProfitTicks))))
        .filter((candidate) => candidate.symbol !== decision.symbol || candidate.growthRate !== decision.growthRate || candidate.takeProfitTicks !== decision.takeProfitTicks)
        .sort((left, right) =>
          Number(right.safe) - Number(left.safe)
          || right.score - left.score
          || right.sampleCount - left.sampleCount,
        );
      const suggestion = alternatives[0];
      if (!decision.safe && suggestion) {
        decision.suggestedSymbol = suggestion.symbol;
        decision.suggestedGrowthRate = suggestion.growthRate;
        decision.suggestedTakeProfitTicks = suggestion.takeProfitTicks;
      }
      setMoneyBankJdyDecision(decision);
      setMoneyBankJdyState(decision.safe ? "safe" : "not-good");
      return decision;
    } catch (error) {
      setMoneyBankJdyState("not-good");
      setConnectionMessage({ kind: "error", text: `Shadows could not complete its scan: ${errorMessage(error)}` });
      return null;
    } finally {
      moneyBankJdyScanInFlightRef.current = false;
    }
  };

  useEffect(() => {
    if (!moneyBankScannerEnabled) {
      moneyBankScannerNextAtRef.current = null;
      setMoneyBankScannerCountdown(0);
      return;
    }
    moneyBankScannerNextAtRef.current ??= Date.now() + 10_000;
    const timer = window.setInterval(() => {
      const nextAt = moneyBankScannerNextAtRef.current ?? Date.now();
      const remaining = Math.max(0, Math.ceil((nextAt - Date.now()) / 1000));
      setMoneyBankScannerCountdown(remaining);
      if (remaining === 0 && !moneyBankScannerBusy) {
        moneyBankScannerNextAtRef.current = Date.now() + 60_000;
        void scanMoneyBank();
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [moneyBankScannerEnabled, moneyBankScannerBusy, isConnected, status.data?.market_signals]);

  useEffect(() => {
    if (sessionAccountIdRef.current === currentAccount?.id) return;
    sessionAccountIdRef.current = currentAccount?.id ?? null;
    edgeSessionKnownIdsRef.current = null;
    digitFlipSessionKnownIdsRef.current = null;
    bulkSessionKnownIdsRef.current = null;
    setEdgeAccountBalance(currentAccountBalance == null ? "" : currentAccountBalance.toFixed(2));
    setDigitFlipAccountBalance(currentAccountBalance == null ? "" : currentAccountBalance.toFixed(2));
    setLiveConfirmed(false);
  }, [currentAccount?.id]);

  useEffect(() => {
    if (currentAccountBalance == null) return;
    const liveBalance = currentAccountBalance.toFixed(2);
    if (edgeAccountBalance !== liveBalance) setEdgeAccountBalance(liveBalance);
  }, [currentAccountBalance, edgeAccountBalance]);

  useEffect(() => {
    if (currentAccountBalance == null) return;
    const liveBalance = currentAccountBalance.toFixed(2);
    if (digitFlipAccountBalance !== liveBalance) setDigitFlipAccountBalance(liveBalance);
  }, [currentAccountBalance, digitFlipAccountBalance]);

  useEffect(() => {
    if (history.data == null || sessionAccountIdRef.current == null) return;
    if (edgeSessionKnownIdsRef.current == null) {
      edgeSessionKnownIdsRef.current = new Set(edgeAllRows.map((trade) => trade.contract_id));
    }
    if (digitFlipSessionKnownIdsRef.current == null) {
      digitFlipSessionKnownIdsRef.current = new Set(digitFlipAllRows.map((trade) => trade.contract_id));
    }
    if (bulkSessionKnownIdsRef.current == null) {
      bulkSessionKnownIdsRef.current = new Set(bulkAllRows.map((trade) => trade.contract_id));
    }
  }, [history.data, edgeAllRows, digitFlipAllRows, bulkAllRows]);

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
    setDigitFlipSessionPnl(realizedProfit(digitFlipSessionRows));
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
        percentage: total ? Number(((count / total) * 100).toFixed(1)) : 0,
        streak: absentStreak,
        momentum: recentCount > previousCount ? "up" : recentCount < previousCount ? "down" : "flat",
        sampleCount: total,
      };
    });
  }, [analysis.counts, analysisDigits]);
  const tradeXRankedDigits = useMemo(
    () => analysisTickCount > 0
      ? [...tradeXDistribution]
        .sort((left, right) => {
          const leftScore = Math.max(0, Math.min(100, 100 - left.percentage * 4 + Math.min(left.streak, 10) * 2));
          const rightScore = Math.max(0, Math.min(100, 100 - right.percentage * 4 + Math.min(right.streak, 10) * 2));
          return rightScore - leftScore || left.digit - right.digit;
        })
        .map((item) => item.digit)
      : [],
    [analysisTickCount, tradeXDistribution],
  );
  const tradeXRankedEntryDigit = digitForTick(tradeXDuration, tradeXRankedDigits, tradeXSelectedDigit);
  const tradeXEntryDigit = tradeXManualSelect ? tradeXSelectedDigit : tradeXRankedEntryDigit;
  const tradeXFrameworkSignalReady = useMemo(() => {
    const selectedSignal = tradeXDistribution[tradeXEntryDigit];
    return Boolean(
      selectedSignal
      && selectedSignal.percentage < 7
      && (selectedSignal.streak === 3 || selectedSignal.streak === 4)
      && lastDigit === tradeXEntryDigit,
    );
  }, [lastDigit, tradeXDistribution, tradeXEntryDigit]);
  useEffect(() => {
    edgeAnalysisRef.current = {
      sample: analysisDigits.length,
      overPercent: analysis.overPercent,
      underPercent: analysis.underPercent,
    };
  }, [analysis, analysisDigits, analysisTickCount, lastDigit, tradeXDistribution]);
  const rankedDigits = useMemo(
    () => analysisTickCount > 0 ? rankDigitsByDistribution(analysis.counts) : [],
    [analysis.counts, analysisTickCount],
  );

  useEffect(() => {
    configRef.current = { direction, barrier, duration, stake, strategy, martingale, symbol, liveConfirmed, rankedDigits };
  }, [direction, barrier, duration, stake, strategy, martingale, symbol, liveConfirmed, rankedDigits]);

  useEffect(() => {
    cashGrabConfigRef.current = {
      contractFamily: cashGrabFamily,
      direction: cashGrabDirection,
      symbol: cashGrabSymbol,
      selectedDigit: cashGrabSelectedDigit,
      stake: cashGrabSyncBalance && currentAccountBalance != null
        ? Math.max(cashGrabFamily === "accumulator" ? 1 : .35, currentAccountBalance * (cashGrabBalancePercentage / 100))
        : Math.max(cashGrabFamily === "accumulator" ? 1 : .35, cashGrabStake),
      growthRate: Math.min(5, Math.max(1, cashGrabGrowthRate)),
      bulkCount: Math.max(1, Math.trunc(cashGrabCount)),
      duration: cashGrabDuration,
      syncBalance: cashGrabSyncBalance,
      balancePercentage: Math.max(.5, cashGrabBalancePercentage),
      multiplier: cashGrabMultiplier == null ? null : Math.max(.5, cashGrabMultiplier),
      autoSelectBest: cashGrabAutoSelectBest,
      autoSwitchSafestPair: cashGrabAutoSwitchSafestPair,
      jdyAi2: cashGrabJdyAi2,
      jdyAi3: cashGrabJdyAi3,
    };
  }, [
    cashGrabBalancePercentage,
    cashGrabAutoSelectBest,
    cashGrabAutoSwitchSafestPair,
    cashGrabCount,
    cashGrabDirection,
    cashGrabDuration,
    cashGrabFamily,
    cashGrabGrowthRate,
    cashGrabJdyAi2,
    cashGrabJdyAi3,
    cashGrabSelectedDigit,
    cashGrabStake,
    cashGrabSymbol,
    cashGrabSyncBalance,
    cashGrabMultiplier,
    currentAccount,
  ]);

  useEffect(() => {
    tradeXConfigRef.current = {
      symbol: tradeXSymbol,
      stake: tradeXStake,
      selectedDigit: tradeXEntryDigit,
      duration: tradeXDuration,
      manualSelect: tradeXManualSelect,
      frameworkSignalReady: tradeXFrameworkSignalReady,
      rankedDigits: tradeXRankedDigits,
    };
  }, [
    tradeXSymbol,
    tradeXStake,
    tradeXEntryDigit,
    tradeXDuration,
    tradeXManualSelect,
    tradeXFrameworkSignalReady,
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
    edgeAutoOverThreeFourFiveRef.current = edgeAutoOverThreeFourFive;
    edgeBestPairAnalyzerRef.current = edgeBestPairAnalyzer;
    edgeAutoSelectBestRef.current = edgeAutoSelectBest;
  }, [edgeAutoOverThreeFourFive, edgeAutoSelectBest, edgeBestPairAnalyzer, edgeOverThreeSniper]);

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
    if (status.data?.last_tick?.symbol !== symbol) return;
    if (analysisEpochRef.current != null && epoch <= analysisEpochRef.current) return;
    analysisEpochRef.current = epoch;
    liveTickSequenceRef.current += 1;
    setAnalysisDigits((current) => [...current, digit].slice(-1000));
    setAnalysisTickCount((current) => current + 1);
    if (tradeXEnabled && status.data?.last_tick?.symbol === tradeXSymbol) {
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
      queryClient.setQueryData(getGetDerivTokenStatusQueryKey(), {
        has_token: true,
        expires_at: null,
        last_verified_at: new Date().toISOString(),
      });
      const connection = await connectionMutation.mutateAsync();
      if (!connection.ok) throw new Error(connection.message);
      queryClient.setQueryData(getGetDerivAccountsQueryKey(), connection.accounts);
      queryClient.setQueryData(getGetDerivStatusQueryKey(), connection.status);
      setConnectionMessage({ kind: "info", text: "Deriv connected. Your credential remains protected on the server." });
    } catch (error) {
      setConnectionMessage({ kind: "error", text: errorMessage(error) });
    }
  };

  const disconnect = async () => {
    runningRef.current = false;
    setRunning(false);
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
    const recommendation = edgeAutoOverThreeFourFiveRef.current
      ? chooseBestAutoOver345Signal(signals, excludeSymbol)
      : edgeOverThreeSniperRef.current
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
      edgeAutoOverThreeFourFiveRef.current
        ? `Hunting all Volatility and Jump pairs for the best observed Over ${recommendation.digit} · ${recommendation.symbol}`
        : edgeOverThreeSniperRef.current
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
    if (!isConnected || (!edgeAutoOverThreeFourFive && !edgeOverThreeSniper && !edgeBestPairAnalyzer && !edgeAutoSelectBest)) return;
    const signals = (status.data?.market_signals ?? []) as MarketSignal[];
    const recommendation = edgeAutoOverThreeFourFive
      ? chooseBestAutoOver345Signal(signals)
      : edgeOverThreeSniper
      ? chooseBestOverThreeSignal(signals)
      : chooseBestAnalyzerSignal(signals);
    if (!recommendation) return;
    const key = `${recommendation.symbol}:${recommendation.direction}:${recommendation.digit}:${recommendation.score.toFixed(1)}:${recommendation.sampleCount}`;
    if (edgeAutoSelectionKeyRef.current === key) return;
    edgeAutoSelectionKeyRef.current = key;
    void selectEdgeAutomation();
  }, [
    edgeAutoSelectBest,
    edgeAutoOverThreeFourFive,
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

  const claimFeatureRows = async (
    target: Set<string>,
    beforeRows: readonly { contract_id: string; contract_type: string }[],
    types: readonly string[],
  ) => {
    const beforeIds = new Set(beforeRows.map((trade) => trade.contract_id));
    let latestRows = beforeRows;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        latestRows = await getDerivHistory();
      } catch {
        // A confirmed buy must not be reported as failed just because its
        // history row has not arrived or the history endpoint is unavailable.
        latestRows = queryClient.getQueryData<typeof rows>(getGetDerivHistoryQueryKey()) ?? latestRows;
        break;
      }
      latestRows
        .filter((trade) => types.includes(trade.contract_type) && !beforeIds.has(trade.contract_id))
        .forEach((trade) => target.add(trade.contract_id));
      if (latestRows.some((trade) => target.has(trade.contract_id))) break;
      await sleep(180);
    }
    queryClient.setQueryData(getGetDerivHistoryQueryKey(), latestRows);
    return latestRows;
  };

  const waitForEdgeSettlement = async (contractIds: readonly string[]) => {
    if (!contractIds.length) return true;
    const expectedIds = new Set(contractIds);
    let historySnapshot = await readHistorySnapshot();
    if (!historySnapshot.fresh) return false;
    let latestRows = historySnapshot.rows;
    let sawContract = false;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const matching = latestRows.filter((trade) => expectedIds.has(trade.contract_id));
      if (matching.length) sawContract = true;
      if (sawContract && matching.every((trade) => trade.status !== "open")) {
        queryClient.setQueryData(getGetDerivHistoryQueryKey(), latestRows);
        return true;
      }
      // Allow the history stream time to publish the buy acknowledgement. The
      // next EDGE entry must never race that update, even for a one-tick trade.
      await sleep(500);
      historySnapshot = await readHistorySnapshot();
      if (!historySnapshot.fresh) return false;
      latestRows = historySnapshot.rows;
    }
    throw new Error("EDGE stopped because the previous trade did not settle in time.");
  };

  const executeBatch = async () => {
    if (edgeSettlementLockRef.current) return;
    edgeSettlementLockRef.current = true;
    edgeActionLockRef.current = true;
    try {
    const config = configRef.current;
    const entryDigit = config.barrier;
    // Do not decide the next stake from an older settled result while the
    // immediately preceding contract is still open.
    let historySnapshot = await readHistorySnapshot();
    let latestRows = historySnapshot.rows;
    for (let attempt = 0; historySnapshot.fresh && latestRows.some((trade) => trade.status === "open") && attempt < 20; attempt += 1) {
      await sleep(500);
      historySnapshot = await readHistorySnapshot();
      latestRows = historySnapshot.rows;
    }
    if (historySnapshot.fresh && latestRows.some((trade) => trade.status === "open")) {
      throw new Error("The previous contract is still settling. EDGE stopped without sending another trade.");
    }
    for (const trade of (historySnapshot.fresh ? latestRows : []).filter((item) => (item.contract_type === "DIGITOVER" || item.contract_type === "DIGITUNDER") && item.status !== "open")) {
      if (edgeProcessedSettlementIdsRef.current.has(trade.contract_id)) continue;
      edgeProcessedSettlementIdsRef.current.add(trade.contract_id);
      edgeLossStreakRef.current = trade.profit < 0 ? edgeLossStreakRef.current + 1 : 0;
    }
    if (historySnapshot.fresh) queryClient.setQueryData(getGetDerivHistoryQueryKey(), latestRows);
    if (!runningRef.current) return;
    const amount = config.strategy === "martingale" ? nextStakeRef.current : config.stake;
    const declaredAccountBalance = currentAccountBalance ?? 0;
    if (!Number.isFinite(declaredAccountBalance) || declaredAccountBalance <= 0) {
      throw new Error("Sync the connected account balance before EDGE places another trade.");
    }
    if (amount > declaredAccountBalance || (currentAccountBalance != null && amount > currentAccountBalance)) {
      throw new Error(`EDGE stopped before the next trade because the ${amount.toFixed(2)} ${currentAccount?.currency ?? "USD"} stake exceeds the connected balance. Lower the stake or Martingale multiplier.`);
    }
    armMartingaleWatch(latestRows, amount, 1);
    const result = await bulkBuyMutation.mutateAsync({
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
    result.buys.forEach((buy) => edgeClaimedHistoryIdsRef.current.add(buy.contract_id));
    await claimFeatureRows(edgeClaimedHistoryIdsRef.current, latestRows, ["DIGITOVER", "DIGITUNDER"]);
    setSessionTrades((value) => value + 1);
    if (!await waitForEdgeSettlement(result.buys.map((buy) => buy.contract_id))) {
      runningRef.current = false;
      setRunning(false);
      setConnectionMessage({
        kind: "info",
        text: "Deriv accepted the EDGE trade. Trade history is temporarily unavailable, so automatic entries are paused; Deriv still checks settlement before another trade.",
      });
      refreshTradeResults();
      return;
    }
    refreshTradeResults();
    } finally {
      edgeActionLockRef.current = false;
      edgeSettlementLockRef.current = false;
    }
  };

  const executeDualBatch = async () => {
    if (edgeSettlementLockRef.current) return;
    edgeSettlementLockRef.current = true;
    edgeActionLockRef.current = true;
    try {
    const config = configRef.current;
    let historySnapshot = await readHistorySnapshot();
    let latestRows = historySnapshot.rows;
    for (let attempt = 0; historySnapshot.fresh && latestRows.some((trade) => trade.status === "open") && attempt < 20; attempt += 1) {
      await sleep(500);
      historySnapshot = await readHistorySnapshot();
      latestRows = historySnapshot.rows;
    }
    if (historySnapshot.fresh && latestRows.some((trade) => trade.status === "open")) {
      throw new Error("The previous contract is still settling. EDGE stopped without sending another dual trade.");
    }
    if (!runningRef.current) return;
    const amount = config.strategy === "martingale" ? nextStakeRef.current : config.stake;
    const declaredAccountBalance = Number(edgeAccountBalance);
    if (!Number.isFinite(declaredAccountBalance) || declaredAccountBalance <= 0) {
      throw new Error("Sync the connected account balance before EDGE places another dual trade.");
    }
    if (amount * 2 > declaredAccountBalance || (currentAccountBalance != null && amount * 2 > currentAccountBalance)) {
      throw new Error(`EDGE stopped before the dual trade because the ${ (amount * 2).toFixed(2) } ${currentAccount?.currency ?? "USD"} stake exceeds the connected balance.`);
    }
    armMartingaleWatch(latestRows, amount, 2);
    const result = await dualBuyMutation.mutateAsync({
      data: {
        amount,
        duration: config.duration,
        duration_unit: "t",
        barrier: config.barrier,
        symbol: config.symbol,
        confirm_live_trade: true,
      },
    });
    result.buys.forEach((buy) => edgeClaimedHistoryIdsRef.current.add(buy.contract_id));
    await claimFeatureRows(edgeClaimedHistoryIdsRef.current, latestRows, ["DIGITOVER", "DIGITUNDER"]);
    setSessionTrades((value) => value + 2);
    if (!await waitForEdgeSettlement(result.buys.map((buy) => buy.contract_id))) {
      runningRef.current = false;
      setRunning(false);
      setConnectionMessage({
        kind: "info",
        text: "Deriv accepted the EDGE dual trade. Trade history is temporarily unavailable, so automatic entries are paused; Deriv still checks settlement before another trade.",
      });
      refreshTradeResults();
      return;
    }
    refreshTradeResults();
    } finally {
      edgeActionLockRef.current = false;
      edgeSettlementLockRef.current = false;
    }
  };

  const runLoop = async () => {
    while (runningRef.current) {
      try {
        if (edgeAutoOverThreeFourFiveRef.current || edgeOverThreeSniperRef.current || edgeBestPairAnalyzerRef.current || edgeAutoSelectBestRef.current) {
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
        const message = errorMessage(error);
        if (message.includes("still settling")) {
          setConnectionMessage({
            kind: "info",
            text: "Deriv is still settling the previous contract. EDGE will retry after the server confirms it is safe to continue.",
          });
          await sleep(500);
          continue;
        }
        runningRef.current = false;
        setRunning(false);
        setConnectionMessage({ kind: "error", text: message });
      }
    }
  };

  const closeMoneyBankContracts = async () => {
    if (moneyBankClosePromiseRef.current) return moneyBankClosePromiseRef.current;
    const operation = (async () => {
      setMoneyBankClosing(true);
      try {
        let latestRows = await getDerivHistory();
        const openContractId = moneyBankOpenContractIdRef.current;
        if (openContractId && latestRows.some((trade) => trade.contract_id === openContractId && trade.status === "open")) {
          await moneyBankSellMutation.mutateAsync({ data: { contract_id: openContractId } });
        }
        await queryClient.refetchQueries({ queryKey: getGetDerivHistoryQueryKey(), type: "active" });
      } finally {
        setMoneyBankClosing(false);
        moneyBankClosePromiseRef.current = null;
      }
    })();
    moneyBankClosePromiseRef.current = operation;
    return operation;
  };

  const stopMoneyBank = () => {
    moneyBankRunningRef.current = false;
    moneyBankActionLockRef.current = false;
    setMoneyBankRunning(false);
    void closeMoneyBankContracts().catch((error) => {
      setConnectionMessage({ kind: "error", text: `Money Bank could not close every open contract: ${errorMessage(error)}` });
    });
  };

  const executeMoneyBankTrade = async () => {
    const config = moneyBankConfigRef.current;
    if (!config || !moneyBankRunningRef.current || moneyBankActionLockRef.current) return;

    let historySnapshot = await readHistorySnapshot();
    let latestRows = historySnapshot.rows;
    const openContractId = moneyBankOpenContractIdRef.current;
    for (let attempt = 0; historySnapshot.fresh && attempt < 240; attempt += 1) {
      const stillOpen = openContractId
        ? latestRows.some((trade) => trade.contract_id === openContractId && trade.status === "open")
        : latestRows.some((trade) =>
          trade.contract_type === "ACCU"
          && !cashGrabClaimedHistoryIdsRef.current.has(trade.contract_id)
          && trade.status === "open",
        );
      if (!stillOpen) break;
      await sleep(500);
      historySnapshot = await readHistorySnapshot();
      latestRows = historySnapshot.rows;
    }
    const unsettledPrevious = historySnapshot.fresh && (openContractId
      ? latestRows.some((trade) => trade.contract_id === openContractId && trade.status === "open")
      : latestRows.some((trade) =>
        trade.contract_type === "ACCU"
        && !cashGrabClaimedHistoryIdsRef.current.has(trade.contract_id)
        && trade.status === "open",
      ));
    if (unsettledPrevious) {
      throw new Error("Money Bank stopped while the previous contract was still settling.");
    }

    const settledAccumulatorRows = historySnapshot.fresh
      ? openContractId
        ? latestRows.filter((trade) => trade.contract_id === openContractId)
        : latestRows
          .filter((trade) => trade.contract_type === "ACCU")
          .filter((trade) => !cashGrabClaimedHistoryIdsRef.current.has(trade.contract_id))
          .filter((trade) => trade.status !== "open")
      : [];
    const settledAccumulator = settledAccumulatorRows.find((trade) =>
      !moneyBankProcessedSettlementIdsRef.current.has(trade.contract_id),
    );
    if (settledAccumulator) {
      moneyBankProcessedSettlementIdsRef.current.add(settledAccumulator.contract_id);
      const nextSessionPnl = moneyBankSessionPnlRef.current + settledAccumulator.profit;
      moneyBankSessionPnlRef.current = nextSessionPnl;
      setMoneyBankSessionPnl(nextSessionPnl);
      setMoneyBankLastSettledProfit(settledAccumulator.profit);
      if (settledAccumulator.profit > 0) {
        moneyBankLevelRef.current = 0;
        if (config.reinvestProfit) {
          const reinvestedProfit = settledAccumulator.profit * (config.reinvestPercent / 100);
          const nextBase = Math.max(1, config.ladder[0].stake + reinvestedProfit);
          moneyBankConfigRef.current = {
            ...config,
            ladder: calculateRecoveryLadder({
              strategy: "manual",
              budget: config.ladder.at(-1)?.cumulative ?? 0,
              manualBase: nextBase,
              growthRate: config.growthRate,
              takeProfitTicks: config.takeProfitTicks,
            }),
          };
        }
      } else if (moneyBankLevelRef.current >= 6) {
        throw new Error("Money Bank stopped at L6 after a losing settlement.");
      } else {
        moneyBankLevelRef.current += 1;
      }
      if (config.profitTarget != null && config.profitTarget > 0 && nextSessionPnl >= config.profitTarget) {
        throw new Error("Money Bank reached the session Profit target.");
      }
      if (config.lossLimit != null && config.lossLimit > 0 && nextSessionPnl <= -config.lossLimit) {
        throw new Error("Money Bank reached the session Loss limit.");
      }
      if (moneyBankScannerEnabled) {
        moneyBankScannerNextAtRef.current = Date.now() + 60_000;
        void scanMoneyBank();
      }
    }

    if (!moneyBankRunningRef.current) return;
    let currentConfig = moneyBankConfigRef.current ?? config;
    if (currentConfig.autoSwitch && Date.now() >= (moneyBankScannerNextAtRef.current ?? 0)) {
      moneyBankScannerNextAtRef.current = Date.now() + 20_000;
      await scanMoneyBank();
      const recommendation = moneyBankScannerRecommendationRef.current;
      if (recommendation) {
        currentConfig = {
          ...currentConfig,
          symbol: recommendation.symbol,
          growthRate: recommendation.growthRate,
          takeProfitTicks: recommendation.takeProfitTicks,
          ladder: calculateRecoveryLadder({
            strategy: currentConfig.strategy,
            budget: currentConfig.ladder.at(-1)?.cumulative ?? moneyBankBudget,
            manualBase: currentConfig.ladder[0]?.stake ?? moneyBankManualBase,
            growthRate: recommendation.growthRate,
            takeProfitTicks: recommendation.takeProfitTicks,
          }),
        };
        moneyBankConfigRef.current = currentConfig;
        moneyBankSafestSymbolRef.current = recommendation.symbol;
        setMoneyBankSafestSymbol(recommendation.symbol);
        setMoneyBankSymbol(recommendation.symbol);
        setMoneyBankGrowthRate(recommendation.growthRate);
        setMoneyBankTakeProfitTicks(recommendation.takeProfitTicks);
        if (recommendation.symbol !== symbol) await selectMarket(recommendation.symbol);
      }
    }
    let tradeSymbol = currentConfig.autoSwitch ? moneyBankSafestSymbolRef.current : currentConfig.symbol;
    if (moneyBankJdyEnabled) {
      // The Money Bank gate evaluates the market selected in the form.
      // Auto-switch is intentionally ignored for this guarded entry.
      tradeSymbol = currentConfig.symbol;
      const decision = await scanJdyMoneyBank(currentConfig, tradeSymbol);
      if (!decision?.safe) {
        moneyBankRunningRef.current = false;
        setMoneyBankRunning(false);
        setMoneyBankJdyState("not-good");
        setConnectionMessage({
          kind: "info",
          text: decision
            ? `Shadows cancelled this trade: not a good trade, with an estimated ${decision.estimatedLossStreak}-loss streak risk.`
            : "Shadows cancelled this trade because it could not confirm a safe setup.",
        });
        return;
      }
      setMoneyBankJdyState("safe");
      setConnectionMessage({
        kind: "info",
        text: `Shadows confirmed the selected ${tradeSymbol} setup before entry.`,
      });
    }
    const level = currentConfig.ladder?.[Math.min(6, moneyBankLevelRef.current)];
    if (!level) throw new Error("Money Bank could not calculate the next recovery level.");
    const accountBalance = currentAccountBalance ?? 0;
    if (!accountBalance || level.stake > accountBalance) {
      throw new Error(`Money Bank stopped because ${level.stake.toFixed(2)} ${currentAccount?.currency ?? "USD"} exceeds the connected balance.`);
    }

    if (tradeSymbol !== moneyBankSymbol) {
      setMoneyBankSymbol(tradeSymbol);
      await selectMarket(tradeSymbol);
    }

    moneyBankActionLockRef.current = true;
    try {
      const result = await moneyBankBuyMutation.mutateAsync({
        data: {
          amount: Number(level.stake.toFixed(2)),
          duration: currentConfig.takeProfitTicks,
          duration_unit: "t",
          contract_type: "ACCU",
          growth_rate: currentConfig.growthRate / 100,
          symbol: tradeSymbol,
          confirm_live_trade: true,
        },
      });
      const contractId = result.buy?.contract_id;
      if (typeof contractId === "string" && contractId) {
        moneyBankOpenContractIdRef.current = contractId;
      }
      setMoneyBankTradeCount((value) => value + 1);
      refreshTradeResults();
    } finally {
      moneyBankActionLockRef.current = false;
      if (!moneyBankRunningRef.current) await closeMoneyBankContracts();
    }
  };

  const runMoneyBankLoop = async () => {
    while (moneyBankRunningRef.current) {
      try {
        await executeMoneyBankTrade();
        if (!moneyBankRunningRef.current) return;
        await sleep(250);
      } catch (error) {
        const message = errorMessage(error);
        if (message.includes("still settling")) {
          setConnectionMessage({
            kind: "info",
            text: "Deriv is still settling the previous Accumulator. Money Bank will retry when the server confirms it is safe to continue.",
          });
          await sleep(750);
          continue;
        }
        stopMoneyBank();
        setConnectionMessage({ kind: "error", text: message });
      }
    }
  };

  const startMoneyBank = async (config: MoneyBankStartConfig) => {
    if (!isConnected) {
      setConnectionMessage({ kind: "error", text: "Connect Deriv before starting Money Bank." });
      return;
    }
    if (isReal && !liveConfirmed) {
      setConnectionMessage({ kind: "error", text: "Confirm live funds before starting Money Bank." });
      return;
    }
    if (!currentAccount || currentAccountBalance == null) {
      setConnectionMessage({ kind: "error", text: "Select a Deriv account before starting Money Bank." });
      return;
    }
    if (!config.ladder?.[0] || config.ladder[0].stake > currentAccountBalance) {
      setConnectionMessage({ kind: "error", text: "The calculated BASE is higher than the connected account balance." });
      return;
    }

    try {
      const historySnapshot = await readHistorySnapshot();
      const latestRows = historySnapshot.rows;
      const accumulatorIds = latestRows
        .filter((trade) => trade.contract_type === "ACCU")
        .filter((trade) => !cashGrabClaimedHistoryIdsRef.current.has(trade.contract_id))
        .map((trade) => trade.contract_id);
      moneyBankSessionKnownIdsRef.current = new Set(accumulatorIds);
      moneyBankProcessedSettlementIdsRef.current = new Set(accumulatorIds);
       const existingOpenAccumulator = latestRows.find((trade) =>
         trade.contract_type === "ACCU"
         && !cashGrabClaimedHistoryIdsRef.current.has(trade.contract_id)
         && trade.status === "open"
       );
       if (historySnapshot.fresh && existingOpenAccumulator) {
         setConnectionMessage({ kind: "info", text: "Money Bank is waiting for the existing Accumulator contract to settle before starting a new session." });
         return;
       }
       moneyBankOpenContractIdRef.current = existingOpenAccumulator?.contract_id ?? null;
      moneyBankLevelRef.current = 0;
      moneyBankConfigRef.current = config;
      moneyBankSafestSymbolRef.current = moneyBankSafestSymbol;
      moneyBankSessionPnlRef.current = 0;
      setMoneyBankSessionPnl(0);
      setMoneyBankLastSettledProfit(null);
      setMoneyBankTradeCount(0);
      moneyBankRunningRef.current = true;
      setMoneyBankRunning(true);
      if (moneyBankJdyEnabled) {
        setMoneyBankJdyDecision(null);
        setMoneyBankJdyState("scanning");
      }
      void runMoneyBankLoop();
    } catch (error) {
      setConnectionMessage({ kind: "error", text: errorMessage(error) });
    }
  };

  const start = async () => {
    if (!isConnected) return;
    if (currentAccountBalance == null || currentAccountBalance <= 0) {
      setConnectionMessage({ kind: "error", text: "Sync the connected account balance before starting EDGE." });
      return;
    }
    if (isReal && !liveConfirmed) {
      setConnectionMessage({ kind: "error", text: "Confirm live-funds trading before starting." });
      return;
    }
    const declaredAccountBalance = Number(edgeAccountBalance);
    if (!Number.isFinite(declaredAccountBalance) || declaredAccountBalance <= 0) {
      setConnectionMessage({ kind: "error", text: "Enter a positive account balance before starting EDGE." });
      return;
    }
    if (currentAccountBalance != null && declaredAccountBalance > currentAccountBalance + 0.01) {
      setConnectionMessage({ kind: "error", text: `The declared account balance is above the connected ${currentAccount?.currency ?? "USD"} balance.` });
      return;
    }
    const historySnapshot = await readHistorySnapshot();
    const latestEdgeIds = historySnapshot.rows
      .filter((trade) => trade.contract_type === "DIGITOVER" || trade.contract_type === "DIGITUNDER")
      .map((trade) => trade.contract_id);
    edgeSessionKnownIdsRef.current = new Set(latestEdgeIds);
    edgeProcessedSettlementIdsRef.current = new Set(latestEdgeIds);
    edgeLossStreakRef.current = 0;
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

  const cashGrabContractTypes = ["DIGITEVEN", "DIGITODD", "CALL", "PUT", "DIGITDIFF", "ACCU"] as const;

  const cashGrabSafetyCheck = (config: CashGrabStartConfig) => {
    const selectedSignal = (status.data?.market_signals ?? []).find((signal) => signal.symbol === config.symbol) as
      (MoneyBankMarketSignal & {
        digit_even_percentage?: number;
        digit_odd_percentage?: number;
        digit_outcomes?: Array<{ digit: number; over_percentage: number; under_percentage: number }>;
      }) | undefined;
    const sampleCount = selectedSignal?.sample_count ?? 0;
    const selectedObservation = cashGrabDigitObservations.find((observation) => observation.digit === config.selectedDigit);
    const differsOutcome = selectedSignal?.digit_outcomes?.find((outcome) => outcome.digit === config.selectedDigit);
    const observedRate = config.contractFamily === "even-odd"
      ? config.direction === "DIGITODD"
        ? selectedSignal?.digit_odd_percentage ?? 0
        : selectedSignal?.digit_even_percentage ?? 0
      : config.contractFamily === "rise-fall"
        ? config.direction === "PUT"
          ? selectedSignal?.fall_percentage ?? 0
          : selectedSignal?.rise_percentage ?? 0
        : config.contractFamily === "accumulator"
          ? Math.max(selectedSignal?.rise_percentage ?? 0, selectedSignal?.fall_percentage ?? 0)
          : differsOutcome
            ? differsOutcome.over_percentage + differsOutcome.under_percentage
            : 100 - (selectedObservation?.marketPercentage ?? 0);
    return sampleCount >= 5 && observedRate >= 45;
  };

  const scanCashGrabAutoSwitch = async (
    candidateConfig?: CashGrabStartConfig,
  ): Promise<CashGrabAutoSwitchRecommendation | null> => {
    if (!isConnected || cashGrabAutoSwitchBusyRef.current) return cashGrabAutoSwitchRecommendationRef.current;
    const config = candidateConfig ?? cashGrabConfigRef.current;
    if (!config || currentAccountBalance == null) return null;
    cashGrabAutoSwitchBusyRef.current = true;
    setCashGrabAutoSwitchSafestPairStatus("watching");
    try {
      const freshStatus = await status.refetch();
      const signals = (freshStatus.data?.market_signals ?? []) as Array<MoneyBankMarketSignal & {
        digit_even_percentage?: number;
        digit_odd_percentage?: number;
        digit_outcomes?: Array<{ digit: number; over_percentage: number; under_percentage: number }>;
      }>;
      const balance = currentAccountBalance;
      const minimumStake = config.contractFamily === "accumulator" ? 1 : .35;
      const baseStake = config.syncBalance
        ? Math.max(minimumStake, balance * (config.balancePercentage / 100))
        : Math.max(minimumStake, config.stake);
      const currentStake = Math.max(minimumStake, cashGrabCurrentStakeRef.current || baseStake);
      const lossToRecover = Math.max(0, -cashGrabSessionPnlRef.current);
      const recoveryTarget = lossToRecover + (baseStake * 0.25);
      const desiredMultiplier = Math.max(2, Math.min(9, 1 + (recoveryTarget / Math.max(baseStake, .35))));
      const candidates: CashGrabAutoSwitchRecommendation[] = [];

      for (const signal of signals) {
        if (!cashGrabSymbols.some((item) => item.value === signal.symbol) || signal.sample_count < 5) continue;
        const differsOutcome = signal.digit_outcomes?.find((outcome) => outcome.digit === config.selectedDigit);
        const observedWinRate = config.contractFamily === "even-odd"
          ? config.direction === "DIGITODD"
            ? signal.digit_odd_percentage ?? 50
            : signal.digit_even_percentage ?? 50
          : config.contractFamily === "rise-fall"
            ? config.direction === "PUT"
              ? signal.fall_percentage ?? 50
              : signal.rise_percentage ?? 50
            : config.contractFamily === "differs" && differsOutcome
              ? differsOutcome.over_percentage + differsOutcome.under_percentage
              : Math.max(signal.rise_percentage ?? 50, signal.fall_percentage ?? 50);
        const observedLossRate = Math.max(0, 100 - observedWinRate);
        for (let multiplier = 2; multiplier <= 9; multiplier += 1) {
          const nextStake = Number((currentStake * multiplier).toFixed(2));
          if (nextStake > balance || observedWinRate < 50) continue;
          const sampleConfidence = Math.min(signal.sample_count, 200) / 20;
          const recoveryFit = Math.max(0, 10 - Math.abs(multiplier - desiredMultiplier) * 2);
          const score = observedWinRate * 2 - observedLossRate * 0.8 + sampleConfidence + recoveryFit;
          candidates.push({
            symbol: signal.symbol,
            observedWinRate,
            observedLossRate,
            sampleCount: signal.sample_count,
            multiplier,
            nextStake,
            score,
          });
        }
      }

      const recommendation = candidates.sort((left, right) =>
        right.score - left.score
        || right.observedWinRate - left.observedWinRate
        || left.observedLossRate - right.observedLossRate
        || right.sampleCount - left.sampleCount,
      )[0] ?? null;
      cashGrabAutoSwitchRecommendationRef.current = recommendation;
      setCashGrabAutoSwitchRecommendation(recommendation);
      if (recommendation) {
        setCashGrabAutoSwitchSafestPairStatus("ready");
        setConnectionMessage({
          kind: "info",
          text: `Auto-switch selected ${recommendation.symbol}: ${recommendation.observedWinRate.toFixed(1)}% observed win balance, ${recommendation.multiplier}x recovery, and ${recommendation.nextStake.toFixed(2)} next stake.`,
        });
      } else {
        setCashGrabAutoSwitchSafestPairStatus("quiet");
        setConnectionMessage({ kind: "info", text: "Auto-switch is waiting for enough live samples and balance room for a guarded 2x–9x recovery setting." });
      }
      return recommendation;
    } catch (error) {
      setCashGrabAutoSwitchSafestPairStatus("quiet");
      setConnectionMessage({ kind: "error", text: `Auto-switch could not scan: ${errorMessage(error)}` });
      return null;
    } finally {
      cashGrabAutoSwitchBusyRef.current = false;
    }
  };

  const reconcileCashGrabSession = (latestRows: typeof rows) => {
    const knownIds = cashGrabSessionKnownIdsRef.current;
    if (!knownIds) return [];
    const completed = latestRows
      .filter((trade) => cashGrabContractTypes.includes(trade.contract_type as typeof cashGrabContractTypes[number]))
      .filter((trade) => !knownIds.has(trade.contract_id))
      .filter((trade) => trade.status !== "open")
      .filter((trade) => !cashGrabProcessedSettlementIdsRef.current.has(trade.contract_id));
    if (!completed.length) return [];
    completed.forEach((trade) => cashGrabProcessedSettlementIdsRef.current.add(trade.contract_id));
    const pnl = completed.reduce((sum, trade) => sum + trade.profit, 0);
    cashGrabSessionPnlRef.current += pnl;
    setCashGrabSessionPnl(cashGrabSessionPnlRef.current);
    return completed;
  };

  const applyCashGrabSettlements = (completed: typeof rows) => {
    const latestSettled = completed.at(-1);
    const config = cashGrabConfigRef.current;
    if (!latestSettled || !config) return;
    const currentStake = cashGrabCurrentStakeRef.current;
    cashGrabCurrentStakeRef.current = latestSettled.profit < 0 && config.multiplier != null
      ? Number((currentStake * Math.max(.5, config.multiplier)).toFixed(2))
      : Number(config.stake.toFixed(2));
  };

  const executeCashGrabTrade = async () => {
    let config = cashGrabConfigRef.current;
    if (!config || !cashGrabRunningRef.current || cashGrabActionLockRef.current) return;
    if (cashGrabRemainingTradesRef.current <= 0) {
      stopCashGrab();
      return;
    }
    let historySnapshot = await readHistorySnapshot();
    let latestRows = historySnapshot.rows;
    if (historySnapshot.fresh) applyCashGrabSettlements(reconcileCashGrabSession(latestRows));
    for (let attempt = 0; historySnapshot.fresh && attempt < 60; attempt += 1) {
      const activeCashGrab = latestRows.some((trade) =>
        cashGrabContractTypes.includes(trade.contract_type as typeof cashGrabContractTypes[number])
        && cashGrabSessionKnownIdsRef.current
        && !cashGrabSessionKnownIdsRef.current.has(trade.contract_id)
        && trade.status === "open",
      );
      if (!activeCashGrab) break;
      await sleep(500);
      historySnapshot = await readHistorySnapshot();
      latestRows = historySnapshot.rows;
      if (!historySnapshot.fresh) break;
      applyCashGrabSettlements(reconcileCashGrabSession(latestRows));
    }
    if (!cashGrabRunningRef.current) return;

    if (config.autoSwitchSafestPair && Date.now() >= (cashGrabAutoSwitchNextAtRef.current ?? 0)) {
      const recommendation = await scanCashGrabAutoSwitch(config);
      cashGrabAutoSwitchNextAtRef.current = Date.now() + 20_000;
      if (!cashGrabRunningRef.current) return;
      if (!recommendation) return;
      config = {
        ...config,
        symbol: recommendation.symbol,
        multiplier: recommendation.multiplier,
        autoSelectBest: false,
      };
      cashGrabConfigRef.current = config;
      setCashGrabSymbol(recommendation.symbol);
      setCashGrabMultiplier(recommendation.multiplier);
      await selectMarket(recommendation.symbol);
    }
    if (!cashGrabRunningRef.current) return;

    if (config.autoSelectBest && cashGrabBestSymbol && cashGrabBestSymbol !== config.symbol) {
      config = { ...config, symbol: cashGrabBestSymbol };
      cashGrabConfigRef.current = config;
      setCashGrabSymbol(cashGrabBestSymbol);
      await selectMarket(cashGrabBestSymbol);
    }
    if (!cashGrabRunningRef.current) return;
    const gateEnabled = config.jdyAi2 || config.jdyAi3;
    setCashGrabJdyAi2Status(config.jdyAi2 ? "watching" : "off");
    setCashGrabJdyAi3Status(config.jdyAi3 ? "watching" : "off");
    if (gateEnabled && !cashGrabSafetyCheck(config)) {
      setCashGrabJdyAi2Status(config.jdyAi2 ? "quiet" : "off");
      setCashGrabJdyAi3Status(config.jdyAi3 ? "quiet" : "off");
      setConnectionMessage({ kind: "info", text: "Cash Grab held this entry: the selected setup did not pass the current safety check. Your settings stayed unchanged." });
      return;
    }
    setCashGrabJdyAi2Status(config.jdyAi2 ? "ready" : "off");
    setCashGrabJdyAi3Status(config.jdyAi3 ? "ready" : "off");

    const amount = Number(cashGrabCurrentStakeRef.current.toFixed(2));
    const batchCount = Math.max(1, Math.trunc(config.bulkCount));
    if (currentAccountBalance == null || amount * batchCount > currentAccountBalance) {
      setConnectionMessage({ kind: "error", text: "Cash Grab stopped because the selected stake exceeds the connected balance." });
      cashGrabRunningRef.current = false;
      setCashGrabRunning(false);
      return;
    }
    if (config.contractFamily === "accumulator" && amount < 1) {
      setConnectionMessage({ kind: "error", text: "Cash Grab skipped the Accumulator batch because Deriv requires at least 1.00 per contract. The selected stake was not changed." });
      cashGrabRunningRef.current = false;
      setCashGrabRunning(false);
      return;
    }
    const contractType = config.contractFamily === "differs"
      ? "DIGITDIFF"
      : config.contractFamily === "accumulator"
        ? "ACCU"
        : config.direction;
    const contractDuration = contractType === "ACCU"
      ? CASH_GRAB_ACCUMULATOR_REFERENCE_TICKS
      : config.duration;
    let batchConfirmed = false;
    cashGrabActionLockRef.current = true;
    try {
      const result = await bulkBuyMutation.mutateAsync({
        data: {
          amount,
          duration: contractDuration,
          duration_unit: "t",
          contract_type: contractType,
          ...(contractType === "DIGITDIFF" ? { barrier: config.selectedDigit } : {}),
           ...(contractType === "ACCU" ? { growth_rate: config.growthRate / 100 } : {}),
          symbol: config.symbol,
            count: batchCount,
          confirm_live_trade: true,
        },
      });
       batchConfirmed = true;
       result.buys.forEach((buy) => cashGrabClaimedHistoryIdsRef.current.add(buy.contract_id));
       cashGrabRemainingTradesRef.current -= 1;
       setCashGrabTradeCount((value) => value + batchCount);
       let afterRows = await claimFeatureRows(cashGrabClaimedHistoryIdsRef.current, latestRows, [...cashGrabContractTypes]) as typeof rows;
       let completed = reconcileCashGrabSession(afterRows);
       applyCashGrabSettlements(completed);
       for (let attempt = 0; attempt < 60 && cashGrabRunningRef.current; attempt += 1) {
         const active = afterRows.some((trade) =>
           cashGrabContractTypes.includes(trade.contract_type as typeof cashGrabContractTypes[number])
           && cashGrabSessionKnownIdsRef.current
           && !cashGrabSessionKnownIdsRef.current.has(trade.contract_id)
           && trade.status === "open",
         );
         if (!active) break;
         await sleep(250);
         afterRows = await getDerivHistory();
         completed = reconcileCashGrabSession(afterRows);
         applyCashGrabSettlements(completed);
       }
       if (cashGrabRemainingTradesRef.current <= 0) stopCashGrab();
      refreshTradeResults();
    } catch (error) {
      if (batchConfirmed) {
        setConnectionMessage({
          kind: "error",
          text: `Cash Grab batch was confirmed by Deriv, but its settlement history could not be refreshed: ${errorMessage(error)}. Cash Grab is paused to prevent overlapping trades.`,
        });
        cashGrabRunningRef.current = false;
        setCashGrabRunning(false);
      } else {
        setConnectionMessage({ kind: "error", text: `Cash Grab skipped this batch: ${errorMessage(error)}` });
      }
    } finally {
      cashGrabActionLockRef.current = false;
    }
  };

  const runCashGrabLoop = async (runId: number) => {
    while (cashGrabRunningRef.current && cashGrabRunIdRef.current === runId) {
      try {
        const currentConfig = cashGrabConfigRef.current;
        if (currentConfig?.autoSwitchSafestPair) {
          const nextScanAt = cashGrabAutoSwitchNextAtRef.current ?? Date.now();
          const waitForScan = Math.max(0, nextScanAt - Date.now());
          if (waitForScan > 0) await sleep(waitForScan);
        }
        if (!cashGrabRunningRef.current || cashGrabRunIdRef.current !== runId) break;
        await executeCashGrabTrade();
        if (cashGrabRunningRef.current && cashGrabRunIdRef.current === runId) {
          const nextConfig = cashGrabConfigRef.current;
          if (nextConfig?.autoSwitchSafestPair) {
            const nextScanAt = cashGrabAutoSwitchNextAtRef.current ?? (Date.now() + 20_000);
            const waitForScan = Math.max(250, nextScanAt - Date.now());
            await sleep(waitForScan);
          } else {
            await sleep(900);
          }
        }
      } catch (error) {
        if (cashGrabRunIdRef.current !== runId) return;
        cashGrabRunningRef.current = false;
        setCashGrabRunning(false);
        setConnectionMessage({ kind: "error", text: errorMessage(error) });
      }
    }
  };

  const closeCashGrabContracts = async () => {
    if (cashGrabClosePromiseRef.current) return cashGrabClosePromiseRef.current;
    const operation = (async () => {
      try {
        for (let pass = 0; pass < 80; pass += 1) {
          const cachedRows = queryClient.getQueryData<typeof rows>(getGetDerivHistoryQueryKey()) ?? rows;
          const openIds = cachedRows
            .filter((trade) => cashGrabContractTypes.includes(trade.contract_type as typeof cashGrabContractTypes[number]))
            .filter((trade) => cashGrabClaimedHistoryIdsRef.current.has(trade.contract_id))
            .filter((trade) => trade.status === "open")
            .map((trade) => trade.contract_id);
          if (!openIds.length) {
            const latestRows = await getDerivHistory();
            const refreshedOpenIds = latestRows
              .filter((trade) => cashGrabContractTypes.includes(trade.contract_type as typeof cashGrabContractTypes[number]))
              .filter((trade) => cashGrabClaimedHistoryIdsRef.current.has(trade.contract_id))
              .filter((trade) => trade.status === "open")
              .map((trade) => trade.contract_id);
            queryClient.setQueryData(getGetDerivHistoryQueryKey(), latestRows);
            if (!refreshedOpenIds.length) {
              // MONEY STOP can be clicked while the buy acknowledgement is
              // still in flight. Keep the close sweep alive until that
              // acknowledgement has been claimed and its contract is visible.
              if (cashGrabActionLockRef.current) {
                await sleep(50);
                continue;
              }
              return;
            }
            await Promise.all(refreshedOpenIds.map(async (contractId) => {
              try {
                await cashGrabSellMutation.mutateAsync({ data: { contract_id: contractId } });
              } catch {
                // Settlement can win the race against a close request.
              }
            }));
            await sleep(100);
            continue;
          }

          await Promise.all(openIds.map(async (contractId) => {
            try {
              await cashGrabSellMutation.mutateAsync({ data: { contract_id: contractId } });
            } catch {
              // A contract can settle between the history read and the close
              // request. The next history sweep decides whether it still needs
              // a close attempt.
            }
          }));
          await sleep(100);
        }

        const finalRows = await getDerivHistory();
        queryClient.setQueryData(getGetDerivHistoryQueryKey(), finalRows);
        const stillOpen = finalRows.some((trade) =>
          cashGrabContractTypes.includes(trade.contract_type as typeof cashGrabContractTypes[number])
          && cashGrabClaimedHistoryIdsRef.current.has(trade.contract_id)
          && trade.status === "open",
        );
        if (stillOpen) {
          throw new Error("MONEY STOP could not close every active Cash Grab contract. Deriv is still processing the close request.");
        }
      } finally {
        setCashGrabStopping(false);
        cashGrabClosePromiseRef.current = null;
      }
    })();
    cashGrabClosePromiseRef.current = operation;
    return operation;
  };

  const stopCashGrab = () => {
    cashGrabRunIdRef.current += 1;
    cashGrabRunningRef.current = false;
    cashGrabRemainingTradesRef.current = 0;
    cashGrabAutoSwitchNextAtRef.current = null;
    setCashGrabStopping(true);
    setCashGrabRunning(false);
    setCashGrabJdyAi2Status(cashGrabJdyAi2 ? "blocked" : "off");
    setCashGrabJdyAi3Status(cashGrabJdyAi3 ? "blocked" : "off");
    setCashGrabAutoSwitchSafestPairStatus(
      cashGrabAutoSwitchSafestPair || cashGrabConfigRef.current?.autoSwitchSafestPair ? "blocked" : "off",
    );
    void closeCashGrabContracts().catch((error) => {
      setConnectionMessage({ kind: "error", text: errorMessage(error) });
    });
  };

  const startCashGrab = async (requestedConfig?: CashGrabStartConfig) => {
    if (cashGrabRunningRef.current) return;
    if (cashGrabClosePromiseRef.current || cashGrabStopping) {
      setConnectionMessage({ kind: "info", text: "Cash Grab is finishing MONEY STOP. Start again when the active contracts are closed." });
      return;
    }
    const requested = requestedConfig ?? cashGrabConfigRef.current;
    const config = requested?.contractFamily === "accumulator"
      ? { ...requested, duration: CASH_GRAB_ACCUMULATOR_REFERENCE_TICKS }
      : requested;
    if (!config || !isConnected) {
      setConnectionMessage({ kind: "error", text: "Connect Deriv before starting Cash Grab." });
      return;
    }
    if (!currentAccount) {
      setConnectionMessage({ kind: "error", text: "Select a Deriv account before starting Cash Grab." });
      return;
    }
    if (isReal && !liveConfirmed) {
      setConnectionMessage({ kind: "error", text: "Confirm live funds before starting Cash Grab." });
      return;
    }
    const existingIds = rows
      .filter((trade) => cashGrabContractTypes.includes(trade.contract_type as typeof cashGrabContractTypes[number]))
      .map((trade) => trade.contract_id);
    cashGrabSessionKnownIdsRef.current = new Set(existingIds);
    cashGrabProcessedSettlementIdsRef.current = new Set(existingIds);
    cashGrabConfigRef.current = config;
    // The selected count is the size of one batch. Manual mode sends that
    // batch once; auto-switch mode continues with fresh batches.
    cashGrabRemainingTradesRef.current = config.autoSwitchSafestPair
      ? Number.MAX_SAFE_INTEGER
      : 1;
    cashGrabCurrentStakeRef.current = Number(config.stake.toFixed(2));
    cashGrabSessionPnlRef.current = 0;
    cashGrabAutoSwitchNextAtRef.current = config.autoSwitchSafestPair ? 0 : null;
    setCashGrabStopping(false);
    setCashGrabSessionPnl(0);
    setCashGrabTradeCount(0);
    setCashGrabJdyAi2Status(config.jdyAi2 ? "watching" : "off");
    setCashGrabJdyAi3Status(config.jdyAi3 ? "watching" : "off");
    setCashGrabAutoSwitchSafestPairStatus(config.autoSwitchSafestPair ? "watching" : "off");
    cashGrabRunningRef.current = true;
    setCashGrabRunning(true);
    const runId = ++cashGrabRunIdRef.current;
    void runCashGrabLoop(runId);
  };

  const deactivateCashGrab = () => {
    stopCashGrab();
    setCashGrabEnabled(false);
    setCashGrabJdyAi2(false);
    setCashGrabJdyAi3(false);
    setCashGrabJdyAi2Status("off");
    setCashGrabJdyAi3Status("off");
  };

  const toggleCashGrab = (enabled: boolean) => {
    if (enabled && !isConnected) {
      setConnectionMessage({ kind: "error", text: "Connect Deriv before enabling Cash Grab." });
      return;
    }
    setCashGrabEnabled(enabled);
    if (!enabled) {
      stopCashGrab();
      return;
    }
    deactivateMoneyBank();
    stop();
    setXTraderEnabled(false);
    setDigitFlipEnabled(false);
    setTradeXEnabled(false);
    setBulkTraderEnabled(false);
    digitFlipRunningRef.current = false;
    setDigitFlipRunning(false);
  };

  const clearCashGrabHistory = async () => {
    if (!cashGrabClearArmed) {
      setCashGrabClearArmed(true);
      window.setTimeout(() => setCashGrabClearArmed(false), 2_500);
      return;
    }
    setCashGrabClearArmed(false);
    setHistoryFading(true);
    await sleep(260);
    setCashGrabHiddenHistoryIds((current) => {
      const next = new Set(current);
      cashGrabRows.forEach((trade) => next.add(trade.contract_id));
      return next;
    });
    setHistoryFading(false);
  };

  const deactivateMoneyBank = () => {
    setEdge2Enabled(false);
    setMoneyBankScannerEnabled(false);
    setMoneyBankScannerRecommendation(null);
    moneyBankScannerNextAtRef.current = null;
    setMoneyBankJdyEnabled(false);
    setMoneyBankJdyState("idle");
    setMoneyBankJdyDecision(null);
    stopMoneyBank();
  };

  const toggleXTrader = (enabled: boolean) => {
    if (enabled && !isConnected) {
      setConnectionMessage({ kind: "error", text: "Connect Deriv before enabling EDGE." });
      return;
    }
    setXTraderEnabled(enabled);
    if (!enabled) {
      stop();
      return;
    }
    deactivateMoneyBank();
    deactivateCashGrab();
    setDigitFlipEnabled(false);
    digitFlipRunningRef.current = false;
    setDigitFlipRunning(false);
    setTradeXEnabled(false);
    setBulkTraderEnabled(false);
    void selectMarket(symbol);
  };

  const toggleMoneyBank = (enabled: boolean) => {
    if (enabled && !canUseMoneyBank) return;
    if (enabled && !isConnected) {
      setConnectionMessage({ kind: "error", text: "Connect Deriv before enabling Money Bank." });
      return;
    }
    setEdge2Enabled(enabled);
    if (!enabled) {
      deactivateMoneyBank();
      return;
    }
    deactivateCashGrab();
    stop();
    setXTraderEnabled(false);
    setDigitFlipEnabled(false);
    digitFlipRunningRef.current = false;
    setDigitFlipRunning(false);
    setTradeXEnabled(false);
    setBulkTraderEnabled(false);
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

  useEffect(() => {
    if (
      !bulkTraderAutoSelectBest
      || !bulkTraderBestSymbol
      || bulkTraderBestSymbol === bulkTraderSymbol
      || bulkBuyMutation.isPending
    ) return;
    setBulkTraderSymbol(bulkTraderBestSymbol);
    void selectMarket(bulkTraderBestSymbol);
  }, [bulkTraderAutoSelectBest, bulkTraderBestSymbol, bulkTraderSymbol, bulkBuyMutation.isPending]);

  const executeTradeX = async (count = 1, durationOverride = tradeXConfigRef.current.duration, digitOverride?: number) => {
    if (tradeXActionLockRef.current) {
      setTradeXMessage("Trade X is already sending. Wait for the current request to finish.");
      return false;
    }
    const config = tradeXConfigRef.current;
    const entryDigit = digitOverride ?? (config.manualSelect
      ? config.selectedDigit
      : config.frameworkSignalReady
        ? config.selectedDigit
        : digitForTick(durationOverride, config.rankedDigits, config.selectedDigit));
    if (!isConnected) {
      setTradeXMessage("Connect Deriv before sending a Trade X contract.");
      return false;
    }
    if (currentAccountBalance == null) {
      setTradeXMessage("Trade X is paused until the selected account balance is available.");
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
    if (currentAccountBalance == null || config.stake * count > currentAccountBalance) {
      setTradeXMessage("The selected Trade X batch is higher than the available account balance.");
      return false;
    }
    const latestRows = queryClient.getQueryData<typeof rows>(getGetDerivHistoryQueryKey()) ?? [];
    tradeXActionLockRef.current = true;
    try {
      const result = await bulkBuyMutation.mutateAsync({
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
      result.buys.forEach((buy) => tradeXClaimedHistoryIdsRef.current.add(buy.contract_id));
       await claimFeatureRows(tradeXClaimedHistoryIdsRef.current, latestRows, ["DIGITDIFF"]);
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


  const chooseDigitFlipSetup = async (requireThreshold = false) => {
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
    const declaredAccountBalance = currentAccountBalance ?? 0;
    if (!Number.isFinite(declaredAccountBalance) || declaredAccountBalance <= 0) {
      setConnectionMessage({ kind: "error", text: "DigitFlip is paused until the account balance is entered." });
      return false;
    }
    // History is a display/settlement feed, not a prerequisite for a buy.
    // Use the newest cached snapshot; the API serializes buys and rejects one
    // while an earlier contract is still open.
    const latestRows = queryClient.getQueryData<typeof rows>(getGetDerivHistoryQueryKey()) ?? [];
    applyDigitFlipAssaultSettlements(latestRows);
    const config = digitFlipConfigRef.current;
    const selectedRate = config.parity === "DIGITEVEN" ? digitFlipRatesRef.current.even : digitFlipRatesRef.current.odd;
    if (digitFlipMagicRef.current && selectedRate < DIGIT_FLIP_SIGNAL_FLOOR) {
      setConnectionMessage({ kind: "info", text: `Standby is waiting for an ${DIGIT_FLIP_SIGNAL_FLOOR}% observed parity signal. Current ${selectedRate.toFixed(1)}%.` });
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
    if (amount > declaredAccountBalance || (currentAccountBalance != null && amount > currentAccountBalance)) {
      setConnectionMessage({ kind: "error", text: "The DigitFlip stake is higher than the available balance." });
      return false;
    }
    digitFlipActionLockRef.current = true;
    setDigitFlipCurrentStake(amount);
    try {
      const result = await digitFlipBuyMutation.mutateAsync({
        data: {
          amount,
          duration: config.duration,
          duration_unit: "t",
          contract_type: config.parity,
          symbol: config.symbol,
          confirm_live_trade: true,
        },
      });
      // The buy acknowledgement is authoritative. Claim its contract id now,
      // and let history polling populate the full row when Deriv publishes it.
      if (result.buy?.contract_id) {
        digitFlipClaimedHistoryIdsRef.current.add(result.buy.contract_id);
      }
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
    if (enabled && !isConnected) {
      setConnectionMessage({ kind: "error", text: "Connect Deriv before enabling DigitFlip." });
      return;
    }
    setDigitFlipEnabled(enabled);
    if (!enabled) {
      digitFlipRunningRef.current = false;
      digitFlipMartingaleWatchRef.current = null;
      setDigitFlipRunning(false);
      return;
    }
    deactivateMoneyBank();
    deactivateCashGrab();
    setXTraderEnabled(false);
    setTradeXEnabled(false);
    setBulkTraderEnabled(false);
    runningRef.current = false;
    setRunning(false);
    setAutoSwitch(false);
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
    if (currentAccountBalance == null || currentAccountBalance <= 0) {
      setConnectionMessage({ kind: "error", text: "Sync the connected account balance before starting DigitFlip." });
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
    if (currentAccountBalance != null && declaredAccountBalance > currentAccountBalance + 0.01) {
      setConnectionMessage({ kind: "error", text: `The declared account balance is above the connected ${currentAccount?.currency ?? "USD"} balance.` });
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

  const toggleTradeX = (enabled: boolean) => {
    if (enabled && !isConnected) {
      setConnectionMessage({ kind: "error", text: "Connect Deriv before enabling Trade X." });
      return;
    }
    setTradeXEnabled(enabled);
    if (enabled) {
      deactivateMoneyBank();
      deactivateCashGrab();
      setXTraderEnabled(false);
      setDigitFlipEnabled(false);
      setBulkTraderEnabled(false);
      digitFlipRunningRef.current = false;
      setDigitFlipRunning(false);
      stop();
      autoSwitchRef.current = false;
      setAutoSwitch(false);
      void selectMarket(tradeXSymbol);
      return;
    }
    setTradeXMessage("Trade X paused.");
  };

  const toggleBulkTrader = (enabled: boolean) => {
    if (enabled && !isConnected) {
      setConnectionMessage({ kind: "error", text: "Connect Deriv before enabling Bulk Trader." });
      return;
    }
    setBulkTraderEnabled(enabled);
    if (!enabled) return;
    deactivateMoneyBank();
    deactivateCashGrab();
    setXTraderEnabled(false);
    setTradeXEnabled(false);
    setDigitFlipEnabled(false);
    runningRef.current = false;
    digitFlipRunningRef.current = false;
    setRunning(false);
    setDigitFlipRunning(false);
    void selectMarket(bulkTraderSymbol);
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
    if (currentAccountBalance == null) {
      setConnectionMessage({ kind: "error", text: "Bulk Trader is paused until the selected account balance is available." });
      return;
    }
    if (isReal && !liveConfirmed) {
      setConnectionMessage({ kind: "error", text: "Confirm live funds before sending a Bulk Trader contract." });
      return;
    }
    const beforeRows = queryClient.getQueryData<typeof rows>(getGetDerivHistoryQueryKey()) ?? [];
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
    bulkActionLockRef.current = true;
    try {
      const result = await send(contractType);
      result.buys.forEach((buy) => bulkClaimedHistoryIdsRef.current.add(buy.contract_id));
      await claimFeatureRows(bulkClaimedHistoryIdsRef.current, beforeRows, [contractType]);
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
    if (edgeActionLockRef.current || edgeSettlementLockRef.current) return;
    if (!isConnected) return;
    if (currentAccountBalance == null) {
      setConnectionMessage({ kind: "error", text: "EDGE is paused until the selected account balance is available." });
      return;
    }
    if (isReal && !liveConfirmed) {
      setConnectionMessage({ kind: "error", text: "Confirm live funds before sending a trade." });
      return;
    }
    edgeActionLockRef.current = true;
    edgeSettlementLockRef.current = true;
    try {
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
      if (currentAccountBalance == null || amount > currentAccountBalance) {
        setConnectionMessage({ kind: "error", text: "The next stake is higher than the available balance." });
        return;
      }
      const latestRows = queryClient.getQueryData<typeof rows>(getGetDerivHistoryQueryKey()) ?? [];
      armMartingaleWatch(latestRows, amount, 1);
      const result = await bulkBuyMutation.mutateAsync({
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
      result.buys.forEach((buy) => edgeClaimedHistoryIdsRef.current.add(buy.contract_id));
      await claimFeatureRows(edgeClaimedHistoryIdsRef.current, latestRows, ["DIGITOVER", "DIGITUNDER"]);
      setDirection(contractType);
      setSessionTrades((value) => value + 1);
      if (!await waitForEdgeSettlement(result.buys.map((buy) => buy.contract_id))) {
        setConnectionMessage({
          kind: "info",
          text: "Deriv accepted the EDGE trade. Trade history is temporarily unavailable; Deriv still checks settlement before another trade.",
        });
        refreshTradeResults();
        return;
      }
      await queryClient.invalidateQueries();
    } catch (error) {
      martingaleWatchRef.current = null;
      setConnectionMessage({ kind: "error", text: errorMessage(error) });
    } finally {
      edgeActionLockRef.current = false;
      edgeSettlementLockRef.current = false;
    }
  };

  const fireDualTrade = async () => {
    if (edgeActionLockRef.current || edgeSettlementLockRef.current) return;
    if (!isConnected) return;
    if (currentAccountBalance == null) {
      setConnectionMessage({ kind: "error", text: "EDGE is paused until the selected account balance is available." });
      return;
    }
    if (isReal && !liveConfirmed) {
      setConnectionMessage({ kind: "error", text: "Confirm live funds before sending a trade." });
      return;
    }
    edgeActionLockRef.current = true;
    edgeSettlementLockRef.current = true;
    try {
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
      if (currentAccountBalance == null || amount * 2 > currentAccountBalance) {
        setConnectionMessage({ kind: "error", text: "The dual stake is higher than the available balance." });
        return;
      }
      const latestRows = queryClient.getQueryData<typeof rows>(getGetDerivHistoryQueryKey()) ?? [];
      armMartingaleWatch(latestRows, amount, 2);
      const result = await dualBuyMutation.mutateAsync({
        data: {
          amount,
          duration,
          duration_unit: "t",
          barrier: configRef.current.barrier,
          symbol: configRef.current.symbol,
          confirm_live_trade: true,
        },
      });
      result.buys.forEach((buy) => edgeClaimedHistoryIdsRef.current.add(buy.contract_id));
      await claimFeatureRows(edgeClaimedHistoryIdsRef.current, latestRows, ["DIGITOVER", "DIGITUNDER"]);
      setSessionTrades((value) => value + 2);
      if (!await waitForEdgeSettlement(result.buys.map((buy) => buy.contract_id))) {
        setConnectionMessage({
          kind: "info",
          text: "Deriv accepted the EDGE dual trade. Trade history is temporarily unavailable; Deriv still checks settlement before another trade.",
        });
        refreshTradeResults();
        return;
      }
      await queryClient.invalidateQueries();
    } catch (error) {
      martingaleWatchRef.current = null;
      setConnectionMessage({ kind: "error", text: errorMessage(error) });
    } finally {
      edgeActionLockRef.current = false;
      edgeSettlementLockRef.current = false;
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

  const anyFeatureRunning = running
    || xTraderEnabled
    || tradeXEnabled
    || digitFlipEnabled
    || bulkTraderEnabled
    || cashGrabRunning
    || cashGrabStopping
    || moneyBankRunning;
  const entryDigit = barrier;
  const activeGuidePages = guideMode === "trade-x"
    ? tradeXGuidePages
    : guideMode === "digit-flip"
      ? digitFlipGuidePages
      : guideMode === "bulk-trader"
        ? bulkTraderGuidePages
        : guideMode === "money-bank"
          ? moneyBankGuidePages
          : guideMode === "cash-grab"
            ? cashGrabGuidePages
        : guidePages;
  const statusText = isConnected ? "CONNECTED" : connectedToken ? "CONNECTING" : "DISCONNECTED";
  const activityText = running ? "EDGE RUNNING" : "EDGE STOPPED";
  const edgeBalanceReady = currentAccountBalance != null && currentAccountBalance > 0;
  const canTrade = isConnected && !running && edgeBalanceReady
    && (!isReal || (Boolean(status.data?.live_trading_enabled) && liveConfirmed))
    && Boolean(currentAccount) && stake <= Number(edgeAccountBalance)
    && stake <= (currentAccountBalance ?? 0);

  return (
    <main className="xt-app">
      <header className="xt-header">
        <div className="xt-brand">
          <span>S</span>
          <div className="xt-brand-copy">
            <div className="xt-brand-heading">
              <strong>Shadow Ai Trading</strong>
              <small>AI Trading</small>
            </div>
            {accessSession.data?.is_admin === true && (
              <Link href="/admin/users" className="xt-admin-link">
                <ShieldCheck size={14} /> ADMIN PANEL
              </Link>
            )}
          </div>
        </div>
        <div className="xt-header-right">
          <DerivAccountSwitcher
            variant="cockpit"
            className="deriv-account-switcher-xt"
            enabled={canUseDeriv}
            disabled={anyFeatureRunning || bulkBuyMutation.isPending || digitFlipBuyMutation.isPending || moneyBankBuyMutation.isPending}
            onAccountSelected={() => {
              setLiveConfirmed(false);
              void queryClient.invalidateQueries();
            }}
            onAccountSelectError={(message) => setConnectionMessage({ kind: "error", text: message })}
          />
          <div className={`xt-connection ${isConnected ? "online" : ""}`}><i />{statusText}</div>
        </div>
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
        {connectionMessage && <p className={`xt-inline-message ${connectionMessage.kind}${connectionMessageFading ? " fading" : ""}`} role="status" aria-live="polite">{connectionMessage.text}</p>}
      </section>

      <section className="xt-feature-card xt-feature-card-cash-grab">
        <div><Activity size={18} /><span><b>Cash Grab</b><small>AI MONEY PRINTING MACHINE · controlled batch entry</small></span></div>
        <div className="xt-feature-actions">
          {!canUseCashGrab && <span className="xt-feature-locked">RESTRICTED</span>}
          {canUseCashGrab && <button className="xt-guide-button" type="button" onClick={() => { setGuideMode("cash-grab"); setGuidePage(0); setGuideOpen(true); }}>
            <BookOpen size={14} />Guide
          </button>}
          <label className="xt-switch">
            <input type="checkbox" checked={cashGrabEnabled} onChange={(event) => toggleCashGrab(event.target.checked)} aria-label="Toggle Cash Grab" disabled={!canUseCashGrab || !isConnected} />
            <span />
          </label>
        </div>
      </section>

      <section className="xt-feature-card xt-feature-card-edge2">
        <div><Bot size={18} /><span><b>Money Bank</b><small>Accumulator</small></span></div>
        <div className="xt-feature-actions">
          <button className="xt-guide-button" type="button" onClick={() => { setGuideMode("money-bank"); setGuidePage(0); setGuideOpen(true); }}>
            <BookOpen size={14} />Guide
          </button>
          <label className="xt-switch">
           <input
              type="checkbox"
              checked={edge2Enabled}
              onChange={(event) => toggleMoneyBank(event.target.checked)}
              aria-label="Toggle Money Bank"
               disabled={!canUseMoneyBank || !isConnected}
            />
            <span />
          </label>
        </div>
      </section>

      <section className="xt-feature-card xt-feature-card-bulk">
        <div><Activity size={18} /><span><b>Bulk Trader</b><small>Send 1–6 contracts instantly across four trade types</small></span></div>
        <div className="xt-feature-actions">
          {!canUseBulkTrader && <span className="xt-feature-locked">RESTRICTED</span>}
          {canUseBulkTrader && <button className="xt-guide-button" type="button" onClick={() => { setGuideMode("bulk-trader"); setGuidePage(0); setGuideOpen(true); }}>
            <BookOpen size={14} />Guide
          </button>}
          <label className="xt-switch">
            <input type="checkbox" checked={bulkTraderEnabled} onChange={(event) => toggleBulkTrader(event.target.checked)} aria-label="Toggle Bulk Trader" disabled={!canUseBulkTrader || !isConnected} />
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

      <section className="xt-feature-card xt-feature-card-edge">
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

      {bulkTraderEnabled && canUseBulkTrader && (
        <BulkTraderPanel
          symbol={bulkTraderSymbol}
          symbols={tradeXSymbols}
          marketSignals={bulkTraderMarketSignals}
          marketLabel={markets.find(([id]) => id === bulkTraderSymbol)?.[1] ?? bulkTraderSymbol}
          currency={currentAccount?.currency ?? "USD"}
          quote={status.data?.last_tick?.quote}
          lastDigit={lastDigit}
          digitHistory={analysisDigits}
          type={bulkTraderType}
          prediction={bulkTraderPrediction}
          duration={bulkTraderDuration}
          stake={bulkTraderStake}
          tradeCount={bulkTraderCount}
           analysisTickCount={analysisTickCount}
           autoSelectBest={bulkTraderAutoSelectBest}
          recentTrades={bulkRows}
          isConnected={isConnected}
          isReal={Boolean(isReal)}
          liveConfirmed={liveConfirmed}
          isPlacingTrade={bulkBuyMutation.isPending}
          historyFading={historyFading}
          clearArmed={bulkTraderClearArmed}
           onSymbolChange={(next) => { setBulkTraderAutoSelectBest(false); setBulkTraderSymbol(next); void selectMarket(next); }}
          onTypeChange={(next) => {
            setBulkTraderType(next);
             setBulkTraderPrediction(next === "over-under" ? 5 : 0);
          }}
          onPredictionChange={setBulkTraderPrediction}
           onAutoSelectBestChange={(enabled) => {
             setBulkTraderAutoSelectBest(enabled);
             if (enabled && bulkTraderBestSymbol) {
               setBulkTraderSymbol(bulkTraderBestSymbol);
               void selectMarket(bulkTraderBestSymbol);
             }
           }}
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
           autoOverThreeFourFive={edgeAutoOverThreeFourFive}
          bestPairAnalyzer={edgeBestPairAnalyzer}
          autoSelectBest={edgeAutoSelectBest}
          scannerMessage={edgeScannerMessage}
          canTrade={canTrade}
          onStart={start}
          onStop={stop}
          onReset={reset}
          onOverThreeSniperChange={(enabled) => {
            setEdgeOverThreeSniper(enabled);
            edgeOverThreeSniperRef.current = enabled;
            if (enabled) {
               setEdgeAutoOverThreeFourFive(false);
               edgeAutoOverThreeFourFiveRef.current = false;
              setEdgeAutoSelectBest(true);
              edgeAutoSelectBestRef.current = true;
              setEdgeBestPairAnalyzer(false);
              edgeBestPairAnalyzerRef.current = false;
              setEdgeScannerMessage("Hunting all Volatility and Jump pairs for the best observed Over 3 signal…");
              void selectEdgeAutomation();
            } else if (!edgeBestPairAnalyzerRef.current && !edgeAutoOverThreeFourFiveRef.current) {
              setEdgeAutoSelectBest(false);
              edgeAutoSelectBestRef.current = false;
              setEdgeScannerMessage(null);
            }
          }}
           onAutoOverThreeFourFiveChange={(enabled) => {
             setEdgeAutoOverThreeFourFive(enabled);
             edgeAutoOverThreeFourFiveRef.current = enabled;
             if (enabled) {
               setEdgeAutoSelectBest(true);
               edgeAutoSelectBestRef.current = true;
               setEdgeOverThreeSniper(false);
               edgeOverThreeSniperRef.current = false;
               setEdgeBestPairAnalyzer(false);
               edgeBestPairAnalyzerRef.current = false;
               setEdgeScannerMessage("Hunting the strongest observed Over signal across barriers 3, 4, and 5…");
               void selectEdgeAutomation();
             } else if (!edgeOverThreeSniperRef.current && !edgeBestPairAnalyzerRef.current) {
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
               setEdgeAutoOverThreeFourFive(false);
               edgeAutoOverThreeFourFiveRef.current = false;
              setEdgeScannerMessage("Hunting all Volatility and Jump pairs for the best observed Over or Under digit…");
              void selectEdgeAutomation();
            } else if (!edgeOverThreeSniperRef.current && !edgeAutoOverThreeFourFiveRef.current) {
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
            } else if (!edgeOverThreeSniperRef.current && !edgeAutoOverThreeFourFiveRef.current && !edgeBestPairAnalyzerRef.current) {
              setEdgeRecommendation(null);
              setEdgeScannerMessage(null);
            }
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
            onRefreshAnalysis={refreshAnalysis}
          />
          {tradeXMessage && <p className="tx-parent-message" role="status">{tradeXMessage}</p>}
          {canViewHistory && <DerivHistory title="Trade X History" strategy="Trade X Strategy" rows={tradeXRows} currency={currentAccount?.currency} clearArmed={tradeXHistoryClearArmed} fading={historyFading} onClear={clearTradeXHistory} />}
        </section>
      )}

       {edge2Enabled && canUseMoneyBank && (
        <MoneyBankPanel
          isConnected={isConnected}
          running={moneyBankRunning}
          closing={moneyBankClosing}
          isReal={isReal}
          liveConfirmed={liveConfirmed}
          onLiveConfirm={setLiveConfirmed}
          symbol={moneyBankSymbol}
          markets={moneyBankMarkets}
          onSymbolChange={(next) => {
            setMoneyBankSymbol(next);
            void selectMarket(next);
          }}
          accountBalance={currentAccountBalance}
          currency={currentAccount?.currency ?? "USD"}
          quote={status.data?.last_tick?.quote}
          growthRate={moneyBankGrowthRate}
          onGrowthRateChange={setMoneyBankGrowthRate}
          takeProfitTicks={moneyBankTakeProfitTicks}
          onTakeProfitTicksChange={setMoneyBankTakeProfitTicks}
          strategy={moneyBankStrategy}
          onStrategyChange={setMoneyBankStrategy}
          budget={moneyBankBudget}
          onBudgetChange={setMoneyBankBudget}
          manualBase={moneyBankManualBase}
          onManualBaseChange={setMoneyBankManualBase}
          reinvestProfit={moneyBankReinvestProfit}
          onReinvestProfitChange={setMoneyBankReinvestProfit}
          reinvestPercent={moneyBankReinvestPercent}
          onReinvestPercentChange={setMoneyBankReinvestPercent}
          profitTarget={moneyBankProfitTarget}
          onProfitTargetChange={setMoneyBankProfitTarget}
          lossLimit={moneyBankLossLimit}
          onLossLimitChange={setMoneyBankLossLimit}
           scannerEnabled={moneyBankScannerEnabled}
           scannerCountdown={moneyBankScannerCountdown}
           scannerBusy={moneyBankScannerBusy}
           scannerRecommendation={moneyBankScannerRecommendation}
           onScannerChange={(enabled) => {
             setMoneyBankScannerEnabled(enabled);
             if (enabled) {
               moneyBankScannerNextAtRef.current = Date.now() + 10_000;
             } else {
               moneyBankScannerNextAtRef.current = null;
               setMoneyBankScannerCountdown(0);
               setMoneyBankScannerRecommendation(null);
               moneyBankScannerRecommendationRef.current = null;
             }
           }}
           onAdaptScannerSettings={() => {
             const recommendation = moneyBankScannerRecommendationRef.current;
             if (!recommendation) return;
             setMoneyBankSymbol(recommendation.symbol);
             setMoneyBankGrowthRate(recommendation.growthRate);
             setMoneyBankTakeProfitTicks(recommendation.takeProfitTicks);
             void selectMarket(recommendation.symbol);
             setConnectionMessage({ kind: "info", text: "Money Bank adapted to the latest AI SCANNER recommendation." });
           }}
          marketSignals={moneyBankSignals}
          recentTrades={moneyBankRows}
          lastSettledProfit={moneyBankLastSettledProfit}
           sessionPnl={moneyBankHistorySessionPnl}
          tradeCount={moneyBankCompletedRows.length}
          onStart={(config) => void startMoneyBank(config)}
          onStop={stopMoneyBank}
        />
      )}

      {cashGrabEnabled && canUseCashGrab && (
        <CashGrabPanel
          contractFamily={cashGrabFamily}
          direction={cashGrabDirection}
          symbol={cashGrabSymbol}
           bestSymbol={cashGrabBestSymbol}
           autoSelectBest={cashGrabAutoSelectBest}
          symbols={cashGrabSymbols}
          selectedDigit={cashGrabSelectedDigit}
          lastDigit={lastDigit}
          digitObservations={cashGrabDigitObservations}
          stake={cashGrabStake}
           growthRate={cashGrabGrowthRate}
          bulkCount={cashGrabCount}
          duration={cashGrabDuration}
          syncBalance={cashGrabSyncBalance}
          accountBalance={currentAccountBalance}
          currency={currentAccount?.currency ?? "USD"}
          balancePercentage={cashGrabBalancePercentage}
           multiplier={cashGrabMultiplier}
          jdyAi2={cashGrabJdyAi2}
          jdyAi2Status={cashGrabJdyAi2Status}
           jdyAi3={cashGrabJdyAi3}
           jdyAi3Available={canUseJdyAi3}
           jdyAi3Status={cashGrabJdyAi3Status}
           autoSwitchSafestPair={cashGrabAutoSwitchSafestPair}
           autoSwitchSafestPairStatus={cashGrabAutoSwitchSafestPairStatus}
           autoSwitchSafestPairRecommendation={cashGrabAutoSwitchRecommendation}
          running={cashGrabRunning}
          stopping={cashGrabStopping}
          isConnected={isConnected}
          isReal={isReal}
          liveConfirmed={liveConfirmed}
          isPlacingTrade={bulkBuyMutation.isPending}
          recentTrades={cashGrabRows}
           sessionPnl={cashGrabHistorySessionPnl}
          tradeCount={cashGrabTradeCount}
          clearArmed={cashGrabClearArmed}
          historyFading={historyFading}
           onContractFamilyChange={(next) => {
            setCashGrabFamily(next);
             if (next === "accumulator") setCashGrabDuration(CASH_GRAB_ACCUMULATOR_REFERENCE_TICKS);
            if (next === "even-odd" && cashGrabDirection !== "DIGITEVEN" && cashGrabDirection !== "DIGITODD") setCashGrabDirection("DIGITEVEN");
            if (next === "rise-fall" && cashGrabDirection !== "CALL" && cashGrabDirection !== "PUT") setCashGrabDirection("CALL");
          }}
          onDirectionChange={setCashGrabDirection}
          onSymbolChange={(next) => { setCashGrabSymbol(next); void selectMarket(next); }}
           onAutoSelectBestChange={(enabled) => {
             setCashGrabAutoSelectBest(enabled);
             if (enabled && cashGrabBestSymbol) {
               setCashGrabSymbol(cashGrabBestSymbol);
               void selectMarket(cashGrabBestSymbol);
             }
           }}
          onSelectedDigitChange={setCashGrabSelectedDigit}
          onStakeChange={setCashGrabStake}
           onGrowthRateChange={setCashGrabGrowthRate}
          onBulkCountChange={setCashGrabCount}
          onDurationChange={setCashGrabDuration}
          onSyncBalanceChange={setCashGrabSyncBalance}
          onBalancePercentageChange={setCashGrabBalancePercentage}
           onMultiplierChange={setCashGrabMultiplier}
          onJdyAi2Change={(enabled) => {
            setCashGrabJdyAi2(enabled);
            setCashGrabJdyAi2Status(enabled ? "ready" : "off");
          }}
          onJdyAi3Change={(enabled) => {
            setCashGrabJdyAi3(enabled);
            setCashGrabJdyAi3Status(enabled ? "ready" : "off");
            if (!enabled) {
              if (cashGrabConfigRef.current) {
                cashGrabConfigRef.current = { ...cashGrabConfigRef.current, jdyAi3: false };
              }
              if (!cashGrabAutoSwitchSafestPair && cashGrabRunning) stopCashGrab();
             } else if (cashGrabConfigRef.current) {
              cashGrabConfigRef.current = { ...cashGrabConfigRef.current, jdyAi3: true };
            }
          }}
          onAutoSwitchSafestPairChange={(enabled) => {
            const currentConfig = cashGrabConfigRef.current;
            setCashGrabAutoSwitchSafestPair(enabled);
            if (!enabled) {
              cashGrabAutoSwitchNextAtRef.current = null;
              cashGrabAutoSwitchRecommendationRef.current = null;
              setCashGrabAutoSwitchRecommendation(null);
              setCashGrabAutoSwitchSafestPairStatus("off");
              if (currentConfig) cashGrabConfigRef.current = { ...currentConfig, autoSwitchSafestPair: false };
              stopCashGrab();
              setCashGrabAutoSwitchSafestPairStatus("off");
              return;
            }
            cashGrabAutoSwitchRecommendationRef.current = null;
            setCashGrabAutoSwitchRecommendation(null);
            const nextConfig = currentConfig
              ? {
                ...currentConfig,
                autoSwitchSafestPair: true,
                autoSelectBest: false,
                // Safest-pair selection is separate from Shadows 3. Preserve the
                // explicit JDY switch state when this control changes.
                jdyAi3: cashGrabJdyAi3,
              }
              : null;
            setCashGrabAutoSwitchSafestPairStatus("watching");
            cashGrabAutoSwitchNextAtRef.current = 0;
            if (nextConfig) {
              cashGrabConfigRef.current = nextConfig;
              if (cashGrabRunning) cashGrabRemainingTradesRef.current = Number.MAX_SAFE_INTEGER;
              if (!cashGrabRunning) void startCashGrab(nextConfig);
            }
          }}
          onLiveConfirmChange={setLiveConfirmed}
          onMoneyStart={(config) => void startCashGrab(config)}
          onMoneyStop={stopCashGrab}
          onClearHistory={() => void clearCashGrabHistory()}
        />
      )}

      {guideOpen && (
        <div className="xt-guide-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setGuideOpen(false); }}>
          <section className="xt-guide" role="dialog" aria-modal="true" aria-labelledby="xt-guide-title">
            <header className="xt-guide-header">
              <div><BookOpen size={18} /><span><b>{guideMode === "trade-x" ? "Trade X Guide" : guideMode === "digit-flip" ? "DigitFlip Guide" : guideMode === "bulk-trader" ? "Bulk Trader Guide" : guideMode === "money-bank" ? "Money Bank Guide" : guideMode === "cash-grab" ? "Cash Grab Guide" : "EDGE Guide"}</b><small>Page {guidePage + 1} of {activeGuidePages.length}</small></span></div>
              <button type="button" aria-label="Close guide" onClick={() => setGuideOpen(false)}><X size={17} /></button>
            </header>
            <div className="xt-guide-progress"><span style={{ width: `${((guidePage + 1) / activeGuidePages.length) * 100}%` }} /></div>
            <article className="xt-guide-page">
               <small className="xt-guide-kicker">{guideMode === "trade-x" ? "TRADE X FIELD GUIDE" : guideMode === "digit-flip" ? "DIGITFLIP FIELD GUIDE" : guideMode === "bulk-trader" ? "BULK TRADER FIELD GUIDE" : guideMode === "money-bank" ? "MONEY BANK FIELD GUIDE" : guideMode === "cash-grab" ? "CASH GRAB FIELD GUIDE" : "EDGE FIELD GUIDE"}</small>
              <h2 id="xt-guide-title">{activeGuidePages[guidePage].title}</h2>
              <p>{activeGuidePages[guidePage].body}</p>
              <ul>{activeGuidePages[guidePage].points.map((point) => <li key={point}>{point}</li>)}</ul>
            </article>
            <footer className="xt-guide-footer">
              <button type="button" className="xt-guide-nav" onClick={() => setGuidePage((page) => Math.max(0, page - 1))} disabled={guidePage === 0}><ChevronLeft size={15} />Back</button>
              <span>{guidePage + 1} / {activeGuidePages.length}</span>
              {guidePage === activeGuidePages.length - 1 ? (
                <button type="button" className="xt-guide-start" onClick={() => { setGuideOpen(false); guideMode === "trade-x" ? toggleTradeX(true) : guideMode === "digit-flip" ? toggleDigitFlip(true) : guideMode === "bulk-trader" ? toggleBulkTrader(true) : guideMode === "money-bank" ? toggleMoneyBank(true) : guideMode === "cash-grab" ? toggleCashGrab(true) : toggleXTrader(true); }}>Let's start trading</button>
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