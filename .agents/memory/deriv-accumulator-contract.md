---
name: Deriv Accumulator contract
description: The Deriv request shape and dashboard rules needed for Money Bank Accumulator trades.
---

Deriv Accumulator requests use contract type `ACCU`, a decimal `growth_rate`, the selected underlying symbol, and no `duration` or `date_expiry`. Money Bank's visible tick target becomes a two-decimal `limit_order.take_profit`; stakes must be at least 1.00.

**Why:** The live Options API rejects both expiry forms for ACCU, rejects barriers, and rejects take-profit values with more than two decimal places. A demo execution confirmed the no-expiry request with a cent-rounded limit order.

**How to apply:** Keep the shared ACCU parameters aligned across proposal and direct-buy payloads, preserve decimal `growth_rate`, calculate `stake * ((1 + growth_rate) ^ ticks - 1)` rounded to cents for `limit_order.take_profit`, and use duration fields only for other contract types. Keep Money Bank’s visible market list limited to supported 1-second Volatility symbols.