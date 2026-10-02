---
name: Deriv read concurrency
description: The concurrency rule for keeping live trade results responsive while preserving serialized per-user mutations.
---

Live status, account, and history reads should stay outside the per-user mutation lock. Buy, credential, account-selection, and symbol-selection operations remain serialized.

**Why:** High-frequency dashboard reads can otherwise build a queue in front of a buy acknowledgement, making recent trades and session P/L appear delayed even when the Deriv WebSocket has already delivered the update.

**How to apply:** When adding a Deriv route, classify it as a read or mutation. Use the non-serialized credential path for safe reads and keep state-changing operations on the stable per-user lock.

DigitFlip buys must not depend on a successful history request. Use the latest cached rows for strategy context, track confirmed buys from Deriv's acknowledgement, and refresh history asynchronously; the server's serialized active-contract check remains authoritative.

**Why:** A history outage should not suppress a valid buy or make an acknowledged buy appear to have failed, while stale client history must not authorize overlapping contracts.

**How to apply:** Keep history out of the DigitFlip buy prerequisite and post-buy success path. Preserve server-side open-contract, account-balance, and live-trading safeguards.