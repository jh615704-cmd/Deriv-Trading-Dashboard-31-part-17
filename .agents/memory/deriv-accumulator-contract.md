---
name: Deriv Accumulator contract
description: The Deriv request shape and dashboard rules needed for Money Bank Accumulator trades.
---

Deriv Accumulator requests use contract type `ACCU`, a decimal `growth_rate`, the selected underlying symbol, and tick duration. The same Accumulator fields must be accepted and forwarded by both proposal and buy paths.

**Why:** Money Bank depends on the returned Accumulator contract rather than a digit-contract approximation; omitting the growth rate or sending a percentage integer changes the contract request.

**How to apply:** Keep `ACCU` and `growth_rate` aligned across the OpenAPI schema, generated client/Zod types, server WebSocket payloads, and the Money Bank recovery loop. Keep Money Bank’s visible market list limited to supported Volatility symbols.