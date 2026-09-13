---
name: Access-key recovery
description: Administrator recovery policy for user access keys.
---

User access keys are stored as a one-way hash for authentication and an independently encrypted copy for the primary administrator's protected directory. Legacy keys without an encrypted copy must be replaced rather than revealed.

**Why:** The administrator needs to help a user who forgot a key, but raw keys must not be recoverable through normal user or trading endpoints.

**How to apply:** Keep the raw-key field behind the primary-admin access route only, use `SESSION_SECRET`-derived authenticated encryption, and preserve replacement-key flow for records created before encrypted recovery was introduced.

Administrator-type keys may use `max_devices = 0` to mean unlimited active devices; the primary administrator route remains restricted to the designated primary key.

**Why:** Unlimited multi-device trading access is useful for a trusted administrator credential, while unrestricted access-key provisioning should remain protected by the primary administrator.

**How to apply:** Treat zero as unlimited only in device-limit checks and display it as “Unlimited”; reject zero for user keys.