---
name: Access-key recovery
description: Administrator recovery policy for user access keys.
---

User access keys are stored as a one-way hash for authentication and an independently encrypted copy for the primary administrator's protected directory. Legacy keys without an encrypted copy must be replaced rather than revealed.

**Why:** The administrator needs to help a user who forgot a key, but raw keys must not be recoverable through normal user or trading endpoints.

**How to apply:** Keep the raw-key field behind the primary-admin access route only, use `SESSION_SECRET`-derived authenticated encryption, and preserve replacement-key flow for records created before encrypted recovery was introduced.