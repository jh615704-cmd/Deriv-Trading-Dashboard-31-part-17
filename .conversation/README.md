# Deriv trading dashboard

This is a Node.js/Express starter for a Deriv Options WebSocket connection. It
keeps the Deriv PAT on the server, uses the PAT with Deriv's REST account and
OTP endpoints, then connects with the short-lived authenticated WebSocket URL.
It protects the local API with a separate dashboard key, validates trade
inputs, and requests a proposal before a separate buy request.

## Run it

1. Use Node.js 18 or newer.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Create the local environment file:

   ```bash
   cp .env.example .env
   ```

4. Set `DERIV_APP_ID`, `DERIV_API_TOKEN`, and a long random
   `DASHBOARD_API_KEY` in your environment. Optionally set
   `DERIV_ACCOUNT_ID` to force a particular demo or real account; otherwise the
   server selects a demo account when one is available.
5. Start the server:

   ```bash
   npm start
   ```

6. Open `http://localhost:3000` and enter the dashboard key.

## Safety defaults

- No credentials are hardcoded in source or sent to the browser.
- All `/api` routes require `X-API-Key`.
- Trade amount, duration, direction, and symbol are validated.
- The bot loop is disabled by default and is observation-only.
- A proposal must be returned by Deriv before `/api/buy` accepts its ID.
- Never commit `.env` or share a PAT. If the PAT in the original snippet was
  ever real, revoke it in Deriv and issue a replacement.

The app does not implement a profitable strategy. Deriv trading involves
financial risk; test with a demo account before enabling any live actions.