---
name: API test runtime
description: The supported runtime for executing API TypeScript tests in this workspace.
---

API server tests should run through the workspace-provided TSX runner rather than Node's strip-types loader directly.

**Why:** The API source is bundled for production and uses extensionless local imports; Node's native test runner cannot resolve those imports without a TypeScript-aware loader.

**How to apply:** Keep API test scripts on the existing workspace TSX runner and retain Node's experimental module-mock flag when mocking dependencies such as `ws`.