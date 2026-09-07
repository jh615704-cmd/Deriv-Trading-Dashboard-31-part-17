---
name: Deriv proposal correlation
description: Fresh proposal buys must correlate asynchronous WebSocket responses to a request.
---

When a trade flow requests a proposal and buys it immediately, correlate the proposal response with a request ID and buy that exact returned proposal rather than trusting the latest global proposal.

**Why:** Live quote refreshes can arrive between the request and response, so using only the latest stored proposal can buy stale or mismatched contract terms.

**How to apply:** Keep proposal refreshes and one-shot buy proposals request-correlated; preserve server-side session and account validation for both demo and real accounts.