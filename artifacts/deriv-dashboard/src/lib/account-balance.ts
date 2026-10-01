export interface BalanceSource {
  balance?: unknown;
}

export function getAccountBalance(
  account: BalanceSource | null | undefined,
): number | undefined {
  const balance = account?.balance;
  return typeof balance === "number" && Number.isFinite(balance) && balance >= 0
    ? balance
    : undefined;
}