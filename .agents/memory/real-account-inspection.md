---
name: Real-account balance inspection
description: Selecting a real account for balance inspection must remain separate from permission to place live trades.
---

Allow users to select a real account to inspect its balance even when live trading is disabled. Keep live-trading enablement and explicit confirmation checks on quote or buy execution paths.

**Why:** Account selection is a view/session change, not authorization to spend real funds.

**How to apply:** Do not reuse trade-permission flags to block account inspection; preserve the existing safeguards at every actual live-trade entry point.