---
name: Deriv capacity testing
description: Safety constraints for staged Deriv session-capacity checks.
---

Never load-test with live trades. External capacity checks must use isolated demo accounts and read-only requests; no proposal, buy, or sell requests.

**Why:** A load test must not create financial exposure on real accounts; this restriction was explicitly set for the Deriv capacity work.

**How to apply:** Before opening test sessions, verify every credential resolves to a demo account and that the account has no open positions. Keep trade entry disabled in the probe.