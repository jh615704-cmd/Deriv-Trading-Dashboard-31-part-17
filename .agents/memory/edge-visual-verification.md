---
name: EDGE visual verification
description: Authenticated preview constraints for visually checking the trading cockpit.
---

The app preview can confirm workflow health and the access gate, but it cannot show the authenticated EDGE cockpit unless a valid access-key session is available.

**Why:** The access gate intentionally blocks the trading workspace before the feature UI mounts, so an unauthenticated screenshot is not evidence that the cockpit itself rendered correctly.

**How to apply:** For future EDGE visual passes, verify the component through typechecks and isolated rendering when no access-key session is available, then capture the live mobile preview once an authenticated session can reach the cockpit.