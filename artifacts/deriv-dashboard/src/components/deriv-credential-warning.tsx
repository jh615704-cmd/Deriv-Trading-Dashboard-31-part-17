import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  getGetDerivAccountsQueryKey,
  getGetDerivHistoryQueryKey,
  getGetDerivStatusQueryKey,
  getGetDerivTokenStatusQueryKey,
} from "@workspace/api-client-react";
import { CircleAlert, X } from "lucide-react";
import {
  getDerivCredentialWarningKind,
  type DerivCredentialWarningKind,
} from "@/lib/deriv-credential-warning";
import "./deriv-credential-warning.css";

const TOKEN_TEST_MUTATION_KEY = "testDerivToken";

export function DerivCredentialWarning() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [warning, setWarning] = useState<DerivCredentialWarningKind | null>(null);
  const lastKindRef = useRef<DerivCredentialWarningKind | null>(null);
  const dismissedKindRef = useRef<DerivCredentialWarningKind | null>(null);

  useEffect(() => {
    const clearWarning = () => {
      lastKindRef.current = null;
      dismissedKindRef.current = null;
      setWarning(null);
    };

    const showWarning = (error: unknown) => {
      const kind = getDerivCredentialWarningKind(error);
      if (!kind) return;

      const isNewIncident = lastKindRef.current !== kind;
      if (isNewIncident) {
        lastKindRef.current = kind;
        dismissedKindRef.current = null;
      }

      if (kind === "rejected" && isNewIncident) {
        queryClient.setQueryData(getGetDerivTokenStatusQueryKey(), {
          has_token: false,
          expires_at: null,
          last_verified_at: null,
        });
        queryClient.removeQueries({ queryKey: getGetDerivAccountsQueryKey() });
        queryClient.removeQueries({ queryKey: getGetDerivStatusQueryKey() });
        queryClient.removeQueries({ queryKey: getGetDerivHistoryQueryKey() });
        void queryClient.invalidateQueries({
          queryKey: getGetDerivTokenStatusQueryKey(),
        });
      }

      if (dismissedKindRef.current === kind) return;
      setWarning((current) => {
        if (current === "rejected" && kind === "permission") return current;
        return kind;
      });
    };

    const unsubscribeQueries = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "error") {
        showWarning(event.query.state.error);
      }
    });
    const unsubscribeMutations = queryClient.getMutationCache().subscribe((event) => {
      if (event.type !== "updated") return;
      if (event.action.type === "error") {
        showWarning(event.mutation.state.error);
        return;
      }
      if (
        event.action.type === "success"
        && event.mutation.options.mutationKey?.includes(TOKEN_TEST_MUTATION_KEY)
      ) {
        clearWarning();
      }
    });

    return () => {
      unsubscribeQueries();
      unsubscribeMutations();
    };
  }, [queryClient]);

  if (!warning) return null;

  const isRejected = warning === "rejected";
  return (
    <div
      className={`deriv-credential-warning ${isRejected ? "deriv-credential-warning--rejected" : "deriv-credential-warning--permission"}`}
      role="alert"
      aria-live="assertive"
      data-testid="deriv-credential-warning"
    >
      <CircleAlert size={20} className="deriv-credential-warning__icon" aria-hidden="true" />
      <div className="deriv-credential-warning__message">
        <strong>{isRejected ? "Reconnect your Deriv PAT" : "Deriv permission issue"}</strong>
        <p>
          {isRejected
            ? "Deriv rejected the saved PAT. It may be expired or revoked. Connect a valid replacement to continue."
            : "Deriv denied a request with this PAT. The token is still saved; check its permissions before replacing it."}
        </p>
      </div>
      {isRejected && (
        <button
          type="button"
          className="deriv-credential-warning__action"
          onClick={() => setLocation("/app")}
        >
          Reconnect
        </button>
      )}
      <button
        type="button"
        className="deriv-credential-warning__dismiss"
        aria-label="Dismiss Deriv PAT warning"
        onClick={() => {
          dismissedKindRef.current = warning;
          setWarning(null);
        }}
      >
        <X size={17} aria-hidden="true" />
      </button>
    </div>
  );
}