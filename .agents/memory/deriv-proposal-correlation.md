---
name: Deriv proposal correlation
description: Fresh proposal buys must correlate asynchronous WebSocket responses to a request.
---

When a trade flow requests a proposal and buys it immediately, correlate the proposal response with a request ID and buy that exact returned proposal rather than trusting the latest global proposal. For multi-leg buys, retain each leg's input by proposal and contract ID so asynchronous updates cannot overwrite direction or symbol metadata.

**Why:** Live quote refreshes can arrive between the request and response, so using only the latest stored proposal can buy stale or mismatched contract terms.

**How to apply:** Keep proposal refreshes and one-shot buy proposals request-correlated; preserve per-leg metadata through buy and settlement updates; preserve server-side session and account validation for both demo and real accounts.

For bulk purchases, do not hold several temporary proposal IDs and buy them after all quotes arrive. Deriv may invalidate one of those IDs before the buy request is processed; use direct parameter buys with each fresh quote as the maximum price and correlate acknowledgements by request ID.

**Why:** A parallel quote-then-buy batch produced `InvalidContractProposal` / `Unknown contract proposal` in live use even though each quote had returned successfully.

**How to apply:** Keep proposal-ID buys for immediate single-leg flows, and use request-correlated direct parameter buys for multi-contract batches.