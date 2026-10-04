# Deriv session capacity

## Enforced boundary

The API allows up to **four Deriv-enabled user runtimes per Node process**. A fifth distinct user receives HTTP `503` with a retry-later message. The limit is per process, not per deployment, and idle runtimes are normally reclaimed after 30 minutes.

Treat four as an initial operating ceiling, not as a measured production capacity. The API is not currently published, and no deployment machine size or replica count has been confirmed. Do not claim a global four-user limit if deployment runs more than one API process: runtime ownership is process-local. Until shared ownership is implemented and tested, use a single API process (or Autoscale configured to one maximum machine).

## Rate-budget estimate

The dashboard polls Deriv status every 500 ms in its active trading screen. The server refreshes the selected account through REST at most once every two seconds, so that path is approximately 30 Deriv REST requests per active user per minute. The active X Trader screen refreshes account lists every ten seconds; the legacy app screen refreshes them every five seconds. Using the more conservative 12 account-list requests per minute gives an estimate of 42 Deriv REST requests per user per minute. At four active sessions, the estimate is 168 requests per minute from this app, or 56% of Deriv's documented 300 requests per IP per minute. The estimated 42 requests per user per minute is below the documented 80 requests per logged-in user per minute.

This estimate excludes bursts from initial connections, retries, account changes, other apps sharing the same egress IP, and changes to polling behavior. It is an upstream request-budget calculation, not a CPU, memory, or end-to-end performance guarantee.

## Verification

**Never load-test with live accounts or live trades.** The external probe is restricted to isolated demo accounts and read-only requests; it never sends proposals, buys, or sells.

`pnpm --filter @workspace/api-server test` includes staged 1-, 2-, and 4-session tests using mocked REST and WebSockets. It verifies the fifth session is rejected, established sessions remain open, and no buy or sell messages are sent. Those tests do not contact Deriv and do not establish demo-service or deployment capacity.

The full external check is available as `pnpm --filter @workspace/api-server capacity:demo`. It requires four distinct dedicated secrets (`DERIV_DEMO_TEST_PAT_1` through `_4`) and `DERIV_APP_ID`. It lists demo accounts for all PATs and selects a distinct account for each before opening any test sockets; if four distinct demo accounts are unavailable, it exits without opening test sessions. Each staged session checks the account portfolio and aborts if there are open positions. It opens read-only sessions in stages of 1, 2, and 4, then closes them. It sends account, OTP, portfolio, profit-table, balance-subscription, and market-tick requests only. It does not request proposals or send buy/sell messages. PATs and account IDs are not printed. Never substitute `DERIV_API_TOKEN`.

When only one isolated demo account is available, `pnpm --filter @workspace/api-server capacity:demo:smoke` uses `DERIV_DEMO_TEST_PAT_1` to check one authenticated read-only session. This is a connectivity smoke test only; it does not validate 2- or 4-session Deriv capacity.

### Results to date

- Mocked 1/2/4-session API test passed; the fifth session was rejected and no trade messages were sent. The latest test-runner observation was 29/2/4 ms per stage and 156.4 MiB baseline RSS to 169.7 MiB at four mock sessions. These measurements are from the test runner, not production.
- One-account Deriv demo smoke passed with one authenticated session: 3.1 seconds mean session readiness, 13.1 seconds for connection and read-only setup, 138 ticks received, and RSS from 117.5 MiB baseline to 121.3 MiB. It sent no proposal, buy, or sell messages.
- The full external 1/2/4 probe was not run: all four configured PATs resolved to one distinct demo account. It exited before opening test sockets. The single-session smoke does not validate concurrent Deriv capacity.

## Sources and assumptions

- Deriv API limits: <https://developers.deriv.com/docs/limits/>
- Deriv API best practices: <https://developers.deriv.com/docs/best-practices/>
- Deriv authenticated Options WebSocket: the API first loads accounts, requests an account OTP, then connects to the returned authenticated WebSocket URL.
- Replit Autoscale may run more than one machine; per-process runtime state is not shared between replicas. See <https://docs.replit.com/features/publishing/deployment-types> and <https://docs.replit.com/features/publishing/machine-configuration>
- The numerical request estimate reflects the current dashboard polling intervals and server-side two-second account-refresh throttle. Revisit this document if either changes.