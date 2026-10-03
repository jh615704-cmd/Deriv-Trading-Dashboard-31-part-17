# Deriv session capacity

## Enforced boundary

The API allows up to **four Deriv-enabled user runtimes per Node process**. A fifth distinct user receives HTTP `503` with a retry-later message. The limit is per process, not per deployment, and idle runtimes are normally reclaimed after 30 minutes.

Treat four as an initial operating ceiling, not as a measured production capacity. The API is not currently published, and no deployment machine size or replica count has been confirmed. Do not claim a global four-user limit if deployment runs more than one API process: runtime ownership is process-local. Until shared ownership is implemented and tested, use a single API process (or Autoscale configured to one maximum machine).

## Rate-budget estimate

The dashboard polls Deriv status every 500 ms in its active trading screen. The server refreshes the selected account through REST at most once every two seconds, so that path is approximately 30 Deriv REST requests per active user per minute. The active X Trader screen refreshes account lists every ten seconds; the legacy app screen refreshes them every five seconds. Using the more conservative 12 account-list requests per minute gives an estimate of 42 Deriv REST requests per user per minute. At four active sessions, the estimate is 168 requests per minute from this app, or 56% of Deriv's documented 300 requests per IP per minute. The estimated 42 requests per user per minute is below the documented 80 requests per logged-in user per minute.

This estimate excludes bursts from initial connections, retries, account changes, other apps sharing the same egress IP, and changes to polling behavior. It is an upstream request-budget calculation, not a CPU, memory, or end-to-end performance guarantee.

## Verification

`pnpm --filter @workspace/api-server test` includes staged 1-, 2-, and 4-session tests using mocked REST and WebSockets. It verifies the fifth session is rejected, established sessions remain open, and no buy or sell messages are sent. Those tests do not contact Deriv and do not establish demo-service or deployment capacity.

An optional external check is available as `pnpm --filter @workspace/api-server capacity:demo`. It requires four dedicated secrets (`DERIV_DEMO_TEST_PAT_1` through `_4`) and `DERIV_APP_ID`, with one PAT for each distinct isolated demo account. It checks all four accounts before opening any sockets, rejects duplicate accounts or PATs, aborts if an account has open positions, opens read-only sessions in stages of 1, 2, and 4, and closes them afterward. It sends account, OTP, portfolio, profit-table, balance-subscription, and market-tick requests only. It does not request proposals or send buy/sell messages. PATs and account IDs are not printed. Never substitute `DERIV_API_TOKEN`.

## Sources and assumptions

- Deriv API limits: <https://developers.deriv.com/docs/limits/>
- Deriv API best practices: <https://developers.deriv.com/docs/best-practices/>
- Deriv authenticated Options WebSocket: the API first loads accounts, requests an account OTP, then connects to the returned authenticated WebSocket URL.
- Replit Autoscale may run more than one machine; per-process runtime state is not shared between replicas. See <https://docs.replit.com/features/publishing/deployment-types> and <https://docs.replit.com/features/publishing/machine-configuration>
- The numerical request estimate reflects the current dashboard polling intervals and server-side two-second account-refresh throttle. Revisit this document if either changes.