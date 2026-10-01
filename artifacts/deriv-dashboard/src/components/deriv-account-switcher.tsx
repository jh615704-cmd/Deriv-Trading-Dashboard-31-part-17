import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown } from "lucide-react";
import {
  getGetDerivAccountsQueryKey,
  getGetDerivStatusQueryKey,
  getGetDerivTokenStatusQueryKey,
  useGetDerivAccounts,
  useGetDerivStatus,
  useGetDerivTokenStatus,
  useSelectDerivAccount,
} from "@workspace/api-client-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

const money = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

interface DerivAccountSwitcherProps {
  className?: string;
  disabled?: boolean;
  enabled?: boolean;
  onAccountSelected?: (accountId: string) => void;
  onAccountSelectError?: (message: string) => void;
}

export function DerivAccountSwitcher({
  className,
  disabled = false,
  enabled = true,
  onAccountSelected,
  onAccountSelectError,
}: DerivAccountSwitcherProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [pendingAccountId, setPendingAccountId] = useState<string | null>(null);

  const tokenStatus = useGetDerivTokenStatus({
    query: { queryKey: getGetDerivTokenStatusQueryKey(), retry: false, enabled },
  });
  const hasToken = Boolean(tokenStatus.data?.has_token);
  const accountsQuery = useGetDerivAccounts({
    query: {
      queryKey: getGetDerivAccountsQueryKey(),
      enabled: enabled && hasToken,
      refetchInterval: 10_000,
    },
  });
  const statusQuery = useGetDerivStatus({
    query: {
      queryKey: getGetDerivStatusQueryKey(),
      enabled: enabled && hasToken,
      refetchInterval: 1_000,
    },
  });
  const selectAccount = useSelectDerivAccount();

  const accounts = accountsQuery.data ?? [];
  const serverAccount = statusQuery.data?.account;
  const accountOptions = serverAccount && !accounts.some((account) => account.id === serverAccount.id)
    ? [serverAccount, ...accounts]
    : accounts;
  const activeAccount = accountOptions.find((account) => account.id === serverAccount?.id)
    ?? accountOptions.find((account) => account.type === "demo")
    ?? accountOptions[0];
  const selectedAccount = accountOptions.find((account) => account.id === pendingAccountId) ?? activeAccount;
  const balance = selectedAccount?.id === serverAccount?.id
    ? serverAccount.balance
    : selectedAccount?.balance;

  const handleSelectAccount = (accountId: string) => {
    const account = accountOptions.find((option) => option.id === accountId);
    if (!account || account.id === activeAccount?.id || disabled || selectAccount.isPending) return;

    setPendingAccountId(account.id);
    selectAccount.mutate(
      { data: { account_id: account.id } },
      {
        onSuccess: (result) => {
          setPendingAccountId(null);
          queryClient.setQueryData(getGetDerivStatusQueryKey(), result);
          queryClient.setQueryData(getGetDerivAccountsQueryKey(), (current: typeof accounts) =>
            current?.map((item) =>
              item.id === result.account?.id
                ? { ...item, balance: result.account.balance }
                : item,
            ) ?? current,
          );
          void queryClient.invalidateQueries({ queryKey: getGetDerivAccountsQueryKey() });
          onAccountSelected?.(account.id);
        },
        onError: (error) => {
          setPendingAccountId(null);
          const message = error instanceof Error ? error.message : "Account selection failed.";
          if (onAccountSelectError) {
            onAccountSelectError(message);
          } else {
            toast({
              title: "Account selection failed",
              description: message,
              variant: "destructive",
            });
          }
        },
      },
    );
  };

  if (!hasToken || !selectedAccount) return null;

  const formattedBalance = money.format(balance ?? selectedAccount.balance);

  return (
    <div className={`deriv-account-switcher ${className ?? ""}`}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={`deriv-account-trigger ${selectedAccount.type === "real" ? "real" : ""}`}
            aria-label={`Selected ${selectedAccount.type} account, ${selectedAccount.currency} ${formattedBalance}. Choose trading account`}
            data-testid="button-account-balance"
            disabled={disabled || selectAccount.isPending}
          >
            <span className={`deriv-account-type ${selectedAccount.type === "real" ? "real" : ""}`}>
              {selectedAccount.type.toUpperCase()}
            </span>
            <span className="deriv-account-amount">
              {selectedAccount.currency} {formattedBalance}
            </span>
            <ChevronDown size={14} aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="deriv-account-menu">
          <DropdownMenuLabel className="deriv-account-menu-title">TRADING ACCOUNT</DropdownMenuLabel>
          <DropdownMenuSeparator className="deriv-account-menu-separator" />
          {accountOptions.map((account) => {
            const isSelected = account.id === selectedAccount.id;
            const accountBalance = account.id === serverAccount?.id
              ? serverAccount.balance
              : account.balance;

            return (
              <DropdownMenuItem
                key={account.id}
                className={`deriv-account-option ${isSelected ? "selected" : ""}`}
                disabled={disabled || selectAccount.isPending}
                onSelect={() => handleSelectAccount(account.id)}
                data-testid={`menu-account-${account.id}`}
              >
                <span className={`deriv-account-option-type ${account.type}`}>
                  {account.type.toUpperCase()}
                </span>
                <span className="deriv-account-option-id">{account.id}</span>
                <span className="deriv-account-option-currency">{account.currency}</span>
                <span className="deriv-account-option-balance">
                  {money.format(accountBalance)}
                </span>
                <Check size={15} className="deriv-account-option-check" aria-hidden="true" />
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}