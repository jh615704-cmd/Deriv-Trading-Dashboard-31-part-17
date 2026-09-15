---
name: DigitFlip scanner isolation
description: Local parity scanner state and per-feature history boundaries for the trading dashboard.
---

DigitFlip’s parity sample must be tracked independently from EDGE and Trade X analysis, and each feature’s visible history must filter by its own contract types before calculating P/L or rendering rows.

**Why:** The shared live history and analysis counters caused parity trades to appear in EDGE and allowed one feature’s reset/clear behavior to affect another feature’s displayed state.

**How to apply:** Keep parity counts local to DigitFlip, reset them without deleting Deriv records, and use DIGITEVEN/DIGITODD only for DigitFlip views, DIGITDIFF only for Trade X, and DIGITOVER/DIGITUNDER only for EDGE.