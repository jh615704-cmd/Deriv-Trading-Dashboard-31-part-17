---
name: Money Bank JDY gate
description: Durable behavior for the Money Bank JDY pre-entry safety scan.
---

JDY must stay quiet while enabled but idle, scan only after Start Accumulator begins, and block the contract unless the selected market, growth, ticks, and stake pass the safety heuristic. It rescans after settlement; suggested alternatives remain advisory.

**Why:** Automatically replacing the user’s selected setup made the displayed controls disagree with the contract that JDY evaluated and removed the user’s opportunity to review the recommendation.

**How to apply:** Keep the pre-entry scan as the only gate before buying. Never mutate Money Bank settings from a JDY result; show predicted win rate, loss-streak risk, and suggested market/growth/ticks/stake in the status panel instead.