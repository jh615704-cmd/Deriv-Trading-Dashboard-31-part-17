---
name: Access feature registry
description: Access-controlled dashboard features must stay synchronized across runtime validation, API schemas, generated clients, and admin controls.
---

Keep every access-controlled feature in one synchronized registry across the API server, OpenAPI schema, generated client types, route middleware, and administrator feature picker.

**Why:** Adding a feature only to the UI leaves access keys unable to grant it correctly, while adding it only to the server makes the admin control and client types reject valid values.

**How to apply:** When adding or renaming an access feature, update all registry surfaces together and rebuild the workspace declaration cache before type-checking dependent artifacts.