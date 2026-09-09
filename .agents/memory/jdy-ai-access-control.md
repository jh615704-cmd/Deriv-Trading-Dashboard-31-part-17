---
name: JDY AI access control
description: Durable authorization and account-provisioning rules for the admin-controlled login model.
---

Clerk remains the identity and session provider, but a valid Clerk session alone never grants JDY AI access. Every protected API must also require an active local approved-user record keyed to the Clerk user ID. Only an approved administrator may provision users and choose their initial Clerk password; there is no public signup flow.

**Why:** Hiding signup controls is not authorization. Social or directly created Clerk identities could otherwise reach trading APIs unless the server independently enforces administrator approval.

**How to apply:** New protected routes must use the approved-user middleware, and admin capabilities must also enforce the local admin role server-side. Passwords go directly to Clerk and must never be logged, returned, or stored locally.