---
name: Per-user Deriv lifecycle
description: Concurrency and isolation rules for multi-user Deriv credentials and trading runtimes.
---

All credential lookup, PAT replacement or deletion, reconnect work, account switching, and buy execution for one user must share a stable user-keyed lock that outlives disposable WebSocket runtime objects. WebSocket callbacks must verify both the owning user runtime and the exact socket instance before changing state.

**Why:** Separate lifecycle and trading queues allow stale credential reads to recreate deleted sessions, while runtime-only callback checks allow late messages from a previous account socket to overwrite the current account.

**How to apply:** Any new background timer, reconnect path, credential mutation, or account/trade operation must enter the stable user lock. Replaced or closed sockets must become inert immediately, and runtime disposal must never recreate state through a late callback.