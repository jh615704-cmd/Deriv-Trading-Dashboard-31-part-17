---
name: Cash Grab auto-switch
description: Cash Grab's safest-pair automation scans live evidence on a fixed cadence and remains interruptible.
---

All Cash Grab modes keep at most one current-session contract open. Manual contract limits count sequential entries, and each next entry waits for settlement. Auto-switch remains independent from JDY AI 3: it rescans supported markets every 20 seconds, ranks only balance-feasible setups with at least a 50% observed direction rate, and chooses a recovery multiplier from 2x through 9x.

**Why:** Sequential entries prevent overlapping exposure in manual and automatic sessions. Auto-switch also needs to avoid stale setups, accidental JDY AI 3 activation, and unstoppable recovery loops.

**How to apply:** Keep MONEY STOP and switching Auto-switch off as immediate no-new-entry controls; MONEY STOP also closes every claimed open Cash Grab contract from the active session. Session P/L displays should derive from settled rows in each feature-scoped history, not only mutable counters. Preserve account/live-funds checks, sample thresholds, cent rounding, and explicit messaging that observed rates are not guaranteed outcomes.