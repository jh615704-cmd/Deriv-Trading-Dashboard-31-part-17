---
name: Trade contract selection
description: Exact-barrier semantics and settlement display rules for digit trading features.
---

For Digit Differs, the selected digit is the barrier that must not be the final digit at expiry; intermediate ticks do not settle the contract. Manual taps must submit that exact barrier, while ranked automation may choose a candidate only when it is explicitly surfaced as ranked mode.

**Why:** Duration-based ranked selection previously replaced a digit the user had selected, and open-contract mark-to-market profit was displayed as a loss before settlement.

**How to apply:** Keep manual and automated entry selection explicit, never use an automation setting as the contract duration by accident, block overlapping contracts when the feature expects sequential settlement, and display profit only after the contract is closed.