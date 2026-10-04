export type DerivCredentialWarningKind = "rejected" | "permission";

export function getDerivCredentialWarningKind(
  error: unknown,
): DerivCredentialWarningKind | null {
  if (!error || typeof error !== "object") return null;

  const candidate = error as {
    status?: unknown;
    data?: unknown;
  };
  if (!candidate.data || typeof candidate.data !== "object") return null;

  const message = (candidate.data as { error?: unknown }).error;
  if (typeof message !== "string") return null;

  if (
    candidate.status === 401
    && message.includes("saved Deriv token was rejected")
  ) {
    return "rejected";
  }

  if (
    candidate.status === 403
    && message.startsWith("Deriv denied this request.")
  ) {
    return "permission";
  }

  return null;
}