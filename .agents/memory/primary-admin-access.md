---
name: Primary admin access
description: The access-control boundary for the single designated administrator key and session lifetime.
---

Only the designated administrator access-key fingerprint may open or mutate the admin directory; Clerk administrator sessions and additional admin-kind keys must not bypass that boundary.

**Why:** The owner explicitly chose to keep the Deriv PAT separate from application administration and requires one known EDGE key to control all admin operations.

**How to apply:** Keep the primary-key fingerprint as a one-way hash, expose an explicit `is_admin` session flag, and use a session cookie with no Max-Age. Do not revoke the access session on page exit or backgrounding; users can explicitly lock EDGE from the user menu.