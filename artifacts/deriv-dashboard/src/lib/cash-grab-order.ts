export type CashGrabDirection = "CALL" | "PUT";
export type CashGrabDuration = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface CashGrabBulkBuyInput {
  amount: number;
  duration: CashGrabDuration;
  direction: CashGrabDirection;
  symbol: string;
  count: number;
}

export function buildCashGrabBulkBuyPayload(input: CashGrabBulkBuyInput) {
  if (input.direction !== "CALL" && input.direction !== "PUT") {
    throw new Error("Cash Grab supports Rise/Fall contracts only.");
  }

  return {
    amount: input.amount,
    duration: input.duration,
    duration_unit: "t" as const,
    contract_type: input.direction,
    symbol: input.symbol,
    count: input.count,
    confirm_live_trade: true as const,
  };
}