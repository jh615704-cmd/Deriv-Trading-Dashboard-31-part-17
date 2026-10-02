---
name: Replit multi-artifact deployment
description: Deployment boundaries for this project's Replit web dashboard and API artifacts.
---

Replit publishes all artifacts in this project together as one deployment; it cannot publish the API artifact independently. The selected deployment type applies to the whole project.

**Why:** The dashboard and API are complementary artifacts in one Replit project, but the API retains trading sessions and Deriv WebSocket connections in process memory.

**How to apply:** Before relying on Replit as the production API host, verify the whole project's deployment type is Reserved VM. Do not assume a healthy `/api/healthz` endpoint on Autoscale satisfies the always-on runtime requirement.