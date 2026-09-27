---
name: Trading protection test isolation
description: The global admin entry shield is persisted in the shared database and can block API trade tests before their Deriv assertions run.
---

API tests that exercise Deriv buys must control or isolate the persisted trading-protection settings instead of assuming all three switches are off.

**Why:** The protection is intentionally global and survives admin-page reloads. A switch enabled for the current day can correctly reject a test trade before the test reaches proposal or buy correlation logic.

**How to apply:** Keep production persistence intact, but reset or mock the protection settings in test setup and add focused tests for weekday, weekend, and dual-day activation separately.