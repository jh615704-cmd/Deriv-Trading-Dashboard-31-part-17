---
name: Deriv Accumulator contract
description: The Deriv request shape and dashboard rules needed for Money Bank Accumulator trades.
---

Deriv Accumulator requests use contract type `ACCU`, a decimal `growth_rate`, the selected underlying symbol, and an absolute future `date_expiry` for Money Bank's one-second Volatility streams. The same fields must be forwarded by both proposal and buy paths; UI durations start at five ticks.

**Why:** Money Bank depends on the returned Accumulator contract rather than a digit-contract approximation; omitting the growth rate or sending a percentage integer changes the contract request.

**How to apply:** Keep `ACCU` and decimal `growth_rate` aligned across the OpenAPI schema, generated client/Zod types, server WebSocket payloads, and the Money Bank recovery loop. Convert the selected tick count to a future integer `date_expiry` for ACCU proposals/buys; use duration fields for other contract types. Keep Money Bank’s visible market list limited to supported 1-second Volatility symbols.