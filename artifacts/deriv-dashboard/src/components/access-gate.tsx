import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import {
  getGetAccessSessionQueryKey,
  useGetAccessSession,
  useHeartbeatAccessSession,
  useLoginAccessKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";

const DEVICE_STORAGE_KEY = "jdy-edge-device-id";

function getDeviceId() {
  const saved = window.localStorage.getItem(DEVICE_STORAGE_KEY);
  if (saved) return saved;
  const next = `browser-${crypto.randomUUID()}`;
  window.localStorage.setItem(DEVICE_STORAGE_KEY, next);
  return next;
}

function getErrorMessage(error: unknown) {
  const candidate = error as { data?: { error?: string }; message?: string };
  return candidate.data?.error ?? candidate.message ?? "That access key could not be accepted.";
}

export function AccessGate({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const accessSession = useGetAccessSession({
    query: {
      retry: false,
      refetchOnWindowFocus: false,
      queryKey: getGetAccessSessionQueryKey(),
    },
  });
  const login = useLoginAccessKey();
  const heartbeat = useHeartbeatAccessSession();
  const [accessKey, setAccessKey] = useState("");
  const [error, setError] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);
  const unlockTimerRef = useRef<number | null>(null);
  const deviceId = useMemo(() => getDeviceId(), []);

  useEffect(() => {
    if (!accessSession.data) return;
    const timer = window.setInterval(() => {
      heartbeat.mutate();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [accessSession.data, heartbeat]);

  useEffect(() => () => {
    if (unlockTimerRef.current !== null) {
      window.clearTimeout(unlockTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (location.startsWith("/admin") && accessSession.data && !accessSession.data.is_admin) {
      setLocation("/app");
    }
  }, [accessSession.data, location, setLocation]);

  if (location === "/sign-in" || location.startsWith("/sign-in/")) return <>{children}</>;
  if (accessSession.isLoading) {
    return (
      <div className="access-gate">
        <div className="access-gate-card access-gate-loading">
          <Loader2 className="spin" size={26} />
          <span>Checking access…</span>
        </div>
      </div>
    );
  }

  if (accessSession.data) {
    return (
      <>
        {children}
        {isUnlocking && (
          <div className="access-gate access-gate-exit" role="status" aria-live="polite">
            <div className="access-gate-card access-gate-unlocking">
              <ShieldCheck size={26} />
              <strong>Access verified</strong>
              <span>Opening your workspace…</span>
            </div>
          </div>
        )}
      </>
    );
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const session = await login.mutateAsync({
        data: { access_key: accessKey.trim(), device_id: deviceId },
      });
      // The login response is already the server-verified session. Put it in
      // the cache immediately instead of waiting for a second request that
      // can briefly race the cookie update in the browser.
      queryClient.setQueryData(getGetAccessSessionQueryKey(), session);
      setAccessKey("");
      setIsUnlocking(true);
      unlockTimerRef.current = window.setTimeout(() => {
        setLocation("/app");
        unlockTimerRef.current = window.setTimeout(() => {
          setIsUnlocking(false);
          unlockTimerRef.current = null;
        }, 180);
      }, 300);
    } catch (loginError) {
      setError(getErrorMessage(loginError));
    }
  };

  return (
    <div className="access-gate">
      <div className="access-gate-orbit" aria-hidden="true" />
      <div className="access-gate-card">
        <div className="brand-lockup access-gate-brand">
          <span className="brand-mark">J</span>
          <span>JDY <b>AI</b></span>
        </div>
        <div className="access-gate-eyebrow"><ShieldCheck size={14} /> PRIVATE ACCESS</div>
        <h1>Enter your access key.</h1>
        <p>Use the key provided by your administrator to open the trading workspace on this device.</p>
        {error && <div className="access-gate-error" role="alert">{error}</div>}
        <form onSubmit={handleSubmit} className="access-gate-form">
          <label htmlFor="edge-access-key">ACCESS KEY</label>
          <div className="access-gate-input">
            <KeyRound size={17} />
            <input
              id="edge-access-key"
              type="password"
              value={accessKey}
              onChange={(event) => setAccessKey(event.target.value)}
              placeholder="USER-…"
              autoComplete="off"
              autoFocus
              disabled={login.isPending}
            />
          </div>
          <button type="submit" disabled={login.isPending || !accessKey.trim()}>
            {login.isPending ? <><Loader2 className="spin" size={16} /> Checking key…</> : "Unlock"}
          </button>
        </form>
        <div className="access-gate-footer">
          <span>One device per key by default</span>
          <span>Administrator keys unlock the control panel</span>
        </div>
      </div>
    </div>
  );
}