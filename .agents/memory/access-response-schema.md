---
name: Access response schema completeness
description: Access-key list, create, and update responses share the AccessSession contract.
---

Whenever a field is added to the shared access-session contract, every composed access-key response must return it for list, create, and update operations.

**Why:** Zod validates the complete response envelope at runtime, so one omitted shared field turns the admin directory into a 500 even when authorization succeeded.

**How to apply:** Treat AccessSession changes as a coordinated server-route and generated-schema change; verify all access-key response constructors before restarting the API.