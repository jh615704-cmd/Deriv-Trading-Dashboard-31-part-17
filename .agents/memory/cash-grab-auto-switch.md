---
name: Cash Grab auto-switch
description: Cash Grab's safest-pair automation scans live evidence on a fixed cadence and remains interruptible.
---

Cash Grab Auto-switch safest pair is a guarded mode independent from JDY AI 3: it rescans supported markets every 20 seconds, ranks only balance-feasible setups with at least a 50% observed direction rate, chooses a recovery multiplier from 2x through 9x, and trades one contract only after the prior contract settles.

**Why:** The user needs automatic compounding and market rotation without allowing a stale setup, overlapping contracts, an accidental JDY AI 3 activation, or an unstoppable recovery loop.

**How to apply:** Keep MONEY STOP and switching Auto-switch off as immediate no-new-entry controls; MONEY STOP also closes every claimed open Cash Grab contract from the active session. Session P/L displays should derive from settled rows in each feature-scoped history, not only mutable counters. Preserve account/live-funds checks, sample thresholds, cent rounding, and explicit messaging that observed rates are not guaranteed outcomes.