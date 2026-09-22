---
name: Admin PAT separation
description: The boundary between workspace access-key authorization and the Deriv credential used for trading.
---

The primary administrator access key grants workspace and feature permissions only. It must never select, inject, or fall back to `DERIV_API_TOKEN`; each access-key browser session must validate and use the PAT entered in its own connection form.

**Why:** Reusing the secret PAT made a newly entered admin session appear connected to an old credential and made PAT rotation ambiguous. It also coupled application administration to an external trading credential.

**How to apply:** Keep Deriv PATs encrypted per access-key session, require explicit PAT entry before account/status/history/proposal/buy requests, dispose the runtime when the PAT is disconnected or rejected, and treat secret rotation as unrelated to an already authenticated browser session.