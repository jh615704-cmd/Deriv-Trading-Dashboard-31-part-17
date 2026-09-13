---
name: Runtime scaling boundary
description: The infrastructure boundary for the high-concurrency Deriv runtime.
---

The API can be hardened with indexed access lookups, bounded database pools, bounded request bodies, and idle runtime cleanup, but one Node process cannot guarantee 900,000 active personalized Deriv WebSocket sessions.

**Why:** Each active session has user-specific credentials and live Deriv state; connection count, memory, upstream subscriptions, and browser update fan-out all scale with active sessions.

**How to apply:** Treat 900k as a horizontal-capacity target. Load test with multiple API instances, externalize or partition runtime coordination as needed, and size the database pool per instance rather than multiplying a fixed pool across replicas.