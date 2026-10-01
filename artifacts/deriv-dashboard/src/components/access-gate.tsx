import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import {
  getGetAccessSessionQueryKey,
  useGetAccessSession,
  useHeartbeatAccessSession,
  useLoginAccessKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, MessageCircle, ShieldCheck } from "lucide-react";

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
  const [termsAccepted, setTermsAccepted] = useState(false);
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

  useEffect(() => {
    if (!accessSession.data) return;

    let exitHandled = false;
    const revokeOnExit = () => {
      if (exitHandled) return;
      exitHandled = true;

      // pagehide is fired for refresh, tab close, navigation away, and
      // browser back/forward cache transitions. sendBeacon is designed to
      // finish this small POST while the document is being unloaded.
      const logoutUrl = new URL("/api/access/logout", window.location.origin).toString();
      const payload = new Blob([], { type: "application/json" });
      navigator.sendBeacon(logoutUrl, payload);
      queryClient.clear();
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      // A bfcache restore can bring back the rendered workspace after the
      // unload beacon has revoked its session. Reload so the gate performs a
      // fresh server check instead of briefly showing stale content.
      queryClient.clear();
      window.location.reload();
    };

    window.addEventListener("pagehide", revokeOnExit);
    window.addEventListener("beforeunload", revokeOnExit);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("pagehide", revokeOnExit);
      window.removeEventListener("beforeunload", revokeOnExit);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [accessSession.data, queryClient]);

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
      queryClient.clear();
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
          <span className="brand-mark">S</span>
          <span className="access-brand-copy"><strong>Shadow Ai Trading</strong><small>AI Trading</small></span>
        </div>
        <div className="access-gate-risk"><b>RISK DISCLAIMER</b><p>Deriv offers complex derivatives, such as options and contracts for difference (“CFDs”). These products may not be suitable for all clients, and trading them puts you at risk. You may lose some or all of the money you invest. If your trade involves currency conversion, exchange rates affect your profits and losses. Never trade with borrowed money or money you cannot afford to lose.</p></div>
        <div className="access-gate-lock"><ShieldCheck size={25} /></div>
        <h1>Login to Shadow Ai</h1>
        <p className="access-gate-intro">Use your access key to open your private trading workspace.</p>
        <a className="access-message-link" href="https://t.me/JDY_HATED" target="_blank" rel="noreferrer"><MessageCircle size={16} /> Message me now</a>
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
              placeholder="Enter your access key"
              autoComplete="off"
              autoFocus
              disabled={login.isPending}
            />
          </div>
          <label className="access-terms"><input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} disabled={login.isPending} /><span>I acknowledge and agree to the terms and conditions of Shadow Ai Trading.</span></label>
          <button type="submit" disabled={login.isPending || !accessKey.trim() || !termsAccepted}>
            {login.isPending ? <><Loader2 className="spin" size={16} /> Checking key…</> : "Unlock workspace"}
          </button>
        </form>
        <div className="access-gate-footer">
          <span>Private access · This browser only</span>
          <span>Contact: @JDY_HATED</span>
        </div>
      </div>
    </div>
  );
}