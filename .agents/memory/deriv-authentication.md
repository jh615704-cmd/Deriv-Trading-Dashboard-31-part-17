---
name: Deriv authentication
description: External constraints for the Deriv Options REST and WebSocket APIs.
---

Deriv Personal Access Tokens authenticate REST requests. The authenticated Options WebSocket flow is REST account lookup, then POST the account OTP endpoint, then connect to the returned short-lived `wss://` URL; do not send the PAT directly to the WebSocket.

**Why:** The legacy `ws.derivws.com/websockets/v3?app_id=...` authorize flow rejects current PATs and returns a 401.

**How to apply:** Keep the PAT server-side, prefer a demo account when no account is explicitly configured, and use `underlying_symbol` (not `symbol`) in proposal messages for the Options WebSocket.