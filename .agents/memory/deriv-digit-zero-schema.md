---
name: Deriv digit zero response schema
description: Compatibility rule for digit streak payloads shared by the Deriv API and generated response validators.
---

Deriv digit streak arrays include all ten digits, including digit 0. The OpenAPI `DigitStreak` schema and every generated response validator that embeds it must allow a minimum of 0.

**Why:** Allowing the UI or server to select digit 0 while leaving the generated Zod validator at minimum 1 makes otherwise healthy `/api/deriv/status` and connection-test responses fail validation and return 502.

**How to apply:** When changing the digit candidate range, update the OpenAPI source first, regenerate the shared validators when the generator is available, and verify status plus connection-test response variants.