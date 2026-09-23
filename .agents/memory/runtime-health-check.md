---
name: Runtime health checks
description: API startup configuration and health-check behavior in the development workflow.
---

If administrator bootstrap reports missing secrets while the secrets are present, restart the API workflow so it reloads the current runtime configuration. The API health check is served at `/api/healthz`.

**Why:** A workflow can retain the environment it had when it started; restarting confirmed the configuration and restored successful administrator provisioning.

**How to apply:** During runtime verification, check `/api/healthz` through the shared proxy and inspect the post-restart API startup log before treating a bootstrap warning as a code defect.