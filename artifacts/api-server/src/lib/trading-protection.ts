import { db, tradingProtectionSettingsTable } from "@workspace/db";

export type TradingProtectionSettings = {
  weekdaysEnabled: boolean;
  weekendsEnabled: boolean;
  dualWeekendsWeekdaysEnabled: boolean;
};

export async function getTradingProtectionSettings(): Promise<TradingProtectionSettings> {
  const [settings] = await db.select().from(tradingProtectionSettingsTable).limit(1);
  return {
    weekdaysEnabled: settings?.weekdaysEnabled ?? false,
    weekendsEnabled: settings?.weekendsEnabled ?? false,
    dualWeekendsWeekdaysEnabled: settings?.dualWeekendsWeekdaysEnabled ?? false,
  };
}

function activeForToday(settings: TradingProtectionSettings, date = new Date()) {
  const day = date.getDay();
  const weekdays = day >= 1 && day <= 5;
  const weekends = day === 0 || day === 6;
  return (settings.dualWeekendsWeekdaysEnabled)
    || (settings.weekdaysEnabled && weekdays)
    || (settings.weekendsEnabled && weekends);
}

function finitePercentage(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

type ProtectionSignal = {
  symbol: string;
  sample_count: number;
  digit_even_percentage: number;
  digit_odd_percentage: number;
  rise_percentage: number;
  fall_percentage: number;
  digit_outcomes?: Array<{ digit: number; over_percentage: number; under_percentage: number }>;
};

type ProtectionStatus = {
  market_signals: ProtectionSignal[] | undefined;
  symbol: string;
};

export function assertTradingProtection(
  settings: TradingProtectionSettings,
  status: ProtectionStatus,
  input: { contract_type: string; barrier?: number; symbol?: string },
) {
  if (!activeForToday(settings)) return;
  const selectedSymbol = input.symbol ?? status.symbol;
  const signal = status.market_signals?.find((entry) => entry.symbol === selectedSymbol);
   if (
     !signal
     || !Number.isInteger(signal.sample_count)
     || signal.sample_count < 20
     || !finitePercentage(signal.digit_even_percentage)
     || !finitePercentage(signal.digit_odd_percentage)
     || !finitePercentage(signal.rise_percentage)
     || !finitePercentage(signal.fall_percentage)
   ) {
    throw new Error("Global trading protection held this entry until the selected market has enough live samples.");
  }

  let observedRate = 0;
  switch (input.contract_type) {
    case "DIGITEVEN":
      observedRate = signal.digit_even_percentage;
      break;
    case "DIGITODD":
      observedRate = signal.digit_odd_percentage;
      break;
    case "CALL":
      observedRate = signal.rise_percentage;
      break;
    case "PUT":
      observedRate = signal.fall_percentage;
      break;
    case "ACCU":
      // ACCU grows only while the quote moves in the configured direction;
      // accepting the stronger of rise/fall would approve a setup using the
      // wrong side of the market.
      observedRate = signal.rise_percentage;
      break;
    case "DIGITOVER":
      observedRate = signal.digit_outcomes?.find((entry) => entry.digit === input.barrier)?.over_percentage ?? Number.NaN;
      break;
    case "DIGITUNDER":
      observedRate = signal.digit_outcomes?.find((entry) => entry.digit === input.barrier)?.under_percentage ?? Number.NaN;
      break;
    case "DIGITDIFF": {
      const outcome = signal.digit_outcomes?.find((entry) => entry.digit === input.barrier);
      observedRate = outcome && finitePercentage(outcome.over_percentage) && finitePercentage(outcome.under_percentage)
        ? outcome.over_percentage + outcome.under_percentage
        : Number.NaN;
      break;
    }
    default:
      observedRate = 0;
  }
   if (!finitePercentage(observedRate) || observedRate < 52) {
     const observedText = finitePercentage(observedRate) ? `${observedRate.toFixed(1)}%` : "not valid";
     throw new Error(`Global trading protection held this entry because the selected setup is ${observedText} in the live sample.`);
  }
}