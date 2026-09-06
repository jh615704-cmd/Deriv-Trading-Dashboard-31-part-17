# Deriv Trading Dashboard

A demo-first operations dashboard for loading Deriv accounts, testing the REST and authenticated WebSocket connection, monitoring live quotes, and requesting proposals without exposing credentials.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/deriv-dashboard run dev` — run the dashboard
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DERIV_APP_ID`, `DERIV_API_TOKEN`, `DASHBOARD_API_KEY`, `DERIV_ALLOW_LIVE_TRADING`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/deriv-dashboard` — React/Vite dashboard UI
- `artifacts/api-server/src/lib/deriv.ts` — Deriv REST/OTP/WebSocket service
- `artifacts/api-server/src/routes/deriv.ts` — dashboard API routes
- `lib/api-spec/openapi.yaml` — API contract source of truth

## Architecture decisions

- Deriv PATs authenticate REST requests; the server obtains an OTP WebSocket URL before opening the authenticated stream.
- Demo accounts are preferred automatically when no `DERIV_ACCOUNT_ID` is configured.
- Proposal requests are separate from trade execution; this dashboard does not expose a buy endpoint.
- Live buys require a selected real account, the server live-trading flag, a matching proposal, and explicit UI confirmation.

## Product

The dashboard loads all configured Deriv accounts, shows demo/real account balances, runs a connection health test, displays live `R_75` telemetry, and requests demo-first proposal quotes for inspection.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After changing `lib/api-spec/openapi.yaml`, run `pnpm --filter @workspace/api-spec run codegen`.
- Keep `DERIV_API_TOKEN` and `DASHBOARD_API_KEY` in Replit Secrets; never commit or display them.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
