---
name: JDY AI access control
description: Durable boundary between public trading sessions and Clerk-protected administrator APIs.
---

The trading cockpit has no login gate. Trading and PAT APIs use a signed, HTTP-only per-browser guest session so encrypted credentials and Deriv runtime state remain isolated. Clerk and local approved-user records remain the authorization model for administrator APIs only.

**Why:** The product requires direct access to the cockpit without email/password login while still preventing one browser from reading another browser's PAT or trading state. Administrator provisioning remains privileged.

**How to apply:** New trading routes must use the signed guest identity and preserve per-user serialization. New administrator routes must use Clerk plus the active local approved-user/admin role checks. Never expose PATs or Clerk passwords.