require('dotenv').config();

const crypto = require('crypto');
const cors = require('cors');
const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const path = require('path');
const WebSocket = require('ws');

const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const APP_ID = process.env.DERIV_APP_ID;
const TOKEN = process.env.DERIV_API_TOKEN;
const DASHBOARD_API_KEY = process.env.DASHBOARD_API_KEY;
const API_BASE = 'https://api.derivws.com';
const ACCOUNT_ID = process.env.DERIV_ACCOUNT_ID || '';
const SYMBOL = process.env.DERIV_SYMBOL || 'R_75';
const CURRENCY = process.env.DERIV_CURRENCY || 'USD';
const MAX_TRADE_AMOUNT = Number.parseFloat(process.env.MAX_TRADE_AMOUNT || '100');

const app = express();
const state = {
  derivWs: null,
  isAuthorized: false,
  account: null,
  lastTick: null,
  lastProposal: null,
  lastBuy: null,
  botRunning: false,
  reconnectTimer: null,
  connecting: false,
  shuttingDown: false,
  botLoopPromise: null,
  proposalIds: new Set()
};

function requiredConfiguration() {
  const missing = [];
  if (!APP_ID || APP_ID.startsWith('replace_')) missing.push('DERIV_APP_ID');
  if (!TOKEN || TOKEN.startsWith('replace_')) missing.push('DERIV_API_TOKEN');
  if (!DASHBOARD_API_KEY || DASHBOARD_API_KEY.startsWith('replace_')) {
    missing.push('DASHBOARD_API_KEY');
  }
  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
    missing.push('PORT (must be a valid port)');
  }
  if (!Number.isFinite(MAX_TRADE_AMOUNT) || MAX_TRADE_AMOUNT <= 0) {
    missing.push('MAX_TRADE_AMOUNT (must be greater than zero)');
  }
  return missing;
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length
    && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function apiKeyRequired(req, res, next) {
  const suppliedKey = req.get('x-api-key');
  if (!safeEqual(suppliedKey, DASHBOARD_API_KEY)) {
    return res.status(401).json({ ok: false, error: 'Invalid API key' });
  }
  return next();
}

function allowedOrigins() {
  return (process.env.CORS_ORIGIN || `http://localhost:${PORT}`)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function configureApp() {
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      // Same-origin browser requests do not include Origin.
      if (!origin || allowedOrigins().includes(origin)) return callback(null, true);
      return callback(new Error('Origin is not allowed'));
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'X-API-Key']
  }));
  app.use(express.json({ limit: '10kb' }));
  app.use(rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: 'draft-8',
    legacyHeaders: false
  }));
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/healthz', (req, res) => {
    res.json({ ok: true });
  });

  app.use('/api', apiKeyRequired);

  app.get('/api/status', (req, res) => {
    res.json({
      connected: Boolean(state.derivWs && state.derivWs.readyState === WebSocket.OPEN),
      authorized: state.isAuthorized,
      account: state.account,
      lastTick: state.lastTick,
      lastProposal: state.lastProposal,
      lastBuy: state.lastBuy,
      botRunning: state.botRunning,
      symbol: SYMBOL,
      currency: CURRENCY,
      maxTradeAmount: MAX_TRADE_AMOUNT
    });
  });

  app.post('/api/start-bot', (req, res) => {
    if (process.env.ENABLE_BOT !== 'true') {
      return res.status(409).json({
        ok: false,
        error: 'The bot is disabled. Set ENABLE_BOT=true only after adding and testing a strategy.'
      });
    }
    if (state.botRunning) return res.json({ ok: true, message: 'Already running' });
    state.botRunning = true;
    state.botLoopPromise = runObservationLoop();
    return res.json({ ok: true, message: 'Observation-only bot started' });
  });

  app.post('/api/stop-bot', (req, res) => {
    state.botRunning = false;
    return res.json({ ok: true, message: 'Bot stopped' });
  });

  app.post('/api/manual-trade', (req, res) => {
    if (!state.isAuthorized) {
      return res.status(503).json({ ok: false, error: 'Deriv is not authorized' });
    }

    const input = validateTradeInput(req.body);
    if (!input.ok) return res.status(400).json({ ok: false, error: input.error });

    const sent = sendDeriv({
      proposal: 1,
      amount: input.amount,
      basis: 'stake',
      contract_type: input.contract_type,
      currency: CURRENCY,
      duration: input.duration,
      duration_unit: input.duration_unit,
      symbol: input.symbol,
      subscribe: 1
    });

    if (!sent) return res.status(503).json({ ok: false, error: 'Deriv connection is unavailable' });
    return res.status(202).json({
      ok: true,
      message: 'Proposal requested. Review it before buying.',
      trade: input
    });
  });

  app.post('/api/buy', (req, res) => {
    if (!state.isAuthorized) {
      return res.status(503).json({ ok: false, error: 'Deriv is not authorized' });
    }

    const proposalId = typeof req.body?.proposal_id === 'string'
      ? req.body.proposal_id.trim()
      : '';
    const price = Number(req.body?.price);

    if (!proposalId || !state.proposalIds.has(proposalId)) {
      return res.status(400).json({
        ok: false,
        error: 'proposal_id must be a proposal returned by this server'
      });
    }
    if (!Number.isFinite(price) || price <= 0 || price > MAX_TRADE_AMOUNT) {
      return res.status(400).json({
        ok: false,
        error: `price must be greater than 0 and no more than ${MAX_TRADE_AMOUNT}`
      });
    }

    const sent = sendDeriv({ buy: proposalId, price });
    if (!sent) return res.status(503).json({ ok: false, error: 'Deriv connection is unavailable' });
    return res.status(202).json({
      ok: true,
      message: 'Buy request sent to Deriv',
      proposal_id: proposalId,
      price
    });
  });

  app.use((error, req, res, next) => {
    if (error.message === 'Origin is not allowed') {
      return res.status(403).json({ ok: false, error: error.message });
    }
    console.error('Unhandled request error:', error.message);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  });

  return app;
}

function validateTradeInput(body = {}) {
  const amount = Number(body.amount ?? 1);
  const duration = Number(body.duration ?? 5);
  const durationUnit = body.duration_unit ?? 't';
  const contractType = body.contract_type ?? 'CALL';
  const symbol = body.symbol ?? SYMBOL;

  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_TRADE_AMOUNT) {
    return { ok: false, error: `amount must be greater than 0 and no more than ${MAX_TRADE_AMOUNT}` };
  }
  if (!Number.isInteger(duration) || duration < 1 || duration > 1000) {
    return { ok: false, error: 'duration must be an integer from 1 to 1000' };
  }
  if (!['t', 's', 'm'].includes(durationUnit)) {
    return { ok: false, error: 'duration_unit must be t, s, or m' };
  }
  if (!['CALL', 'PUT'].includes(contractType)) {
    return { ok: false, error: 'contract_type must be CALL or PUT' };
  }
  if (typeof symbol !== 'string' || !/^[A-Za-z0-9_]+$/.test(symbol) || symbol.length > 32) {
    return { ok: false, error: 'symbol contains unsupported characters' };
  }
  return {
    ok: true,
    amount,
    duration,
    duration_unit: durationUnit,
    contract_type: contractType,
    symbol
  };
}

function sendDeriv(message) {
  if (!state.derivWs || state.derivWs.readyState !== WebSocket.OPEN) return false;
  state.derivWs.send(JSON.stringify(message));
  return true;
}

async function derivRequest(pathname, options = {}) {
  const response = await fetch(`${API_BASE}${pathname}`, {
    ...options,
    headers: {
      'Deriv-App-ID': APP_ID,
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.errors?.[0]?.message || `HTTP ${response.status}`;
    throw new Error(`Deriv REST ${response.status}: ${message}`);
  }
  return body;
}

function normalizeAccount(account) {
  if (!account || typeof account !== 'object') return null;
  const id = account.account_id || account.accountId || account.loginid || account.id;
  if (!id || typeof id !== 'string') return null;
  return {
    id,
    type: account.account_type || account.type || (id.startsWith('DOT') ? 'demo' : 'real'),
    currency: account.currency || CURRENCY,
    status: account.status
  };
}

function accountsFromResponse(body) {
  const data = body?.data;
  const candidates = Array.isArray(data)
    ? data
    : data?.accounts || body?.accounts || (data ? [data] : []);
  return candidates.map(normalizeAccount).filter(Boolean);
}

async function getAccount() {
  const accountsResponse = await derivRequest('/trading/v1/options/accounts');
  const accounts = accountsFromResponse(accountsResponse);
  if (!accounts.length) throw new Error('Deriv returned no Options trading accounts');

  const configured = ACCOUNT_ID
    ? accounts.find((account) => account.id === ACCOUNT_ID)
    : null;
  if (ACCOUNT_ID && !configured) {
    throw new Error('DERIV_ACCOUNT_ID was not found in the account list');
  }
  return configured || accounts.find((account) => account.type === 'demo') || accounts[0];
}

async function getAuthenticatedWebSocketUrl(accountId) {
  const response = await derivRequest(
    `/trading/v1/options/accounts/${encodeURIComponent(accountId)}/otp`,
    { method: 'POST' }
  );
  const url = response?.data?.url;
  if (!url || typeof url !== 'string' || !url.startsWith('wss://')) {
    throw new Error('Deriv returned an invalid authenticated WebSocket URL');
  }
  return url;
}

async function connectDeriv() {
  if (state.shuttingDown || state.connecting) return;
  if (state.derivWs && state.derivWs.readyState === WebSocket.OPEN) return;

  state.connecting = true;
  try {
    // PATs authenticate REST requests. Deriv then returns a short-lived OTP
    // URL; the PAT must never be sent directly over the WebSocket.
    const account = await getAccount();
    const wsUrl = await getAuthenticatedWebSocketUrl(account.id);
    if (state.shuttingDown) return;

    state.account = account;
    const socket = new WebSocket(wsUrl);
    state.derivWs = socket;

    socket.on('open', () => {
      state.isAuthorized = true;
      console.log('Connected to Deriv account', account.id);
      sendDeriv({ balance: 1, subscribe: 1 });
      sendDeriv({ ticks: SYMBOL, subscribe: 1 });
    });

    socket.on('message', (raw) => {
      let data;
      try {
        data = JSON.parse(raw.toString());
      } catch {
        console.error('Received an invalid Deriv message');
        return;
      }

      if (data.error) {
        console.error('Deriv error:', data.error.code || 'unknown', data.error.message || 'unknown');
        return;
      }

      if (data.msg_type === 'balance') {
        state.account = {
          ...(state.account || {}),
          balance: Number(data.balance.balance),
          currency: data.balance.currency
        };
        return;
      }

      if (data.msg_type === 'tick') {
        state.lastTick = {
          symbol: data.tick.symbol,
          quote: Number(data.tick.quote),
          epoch: data.tick.epoch
        };
        return;
      }

      if (data.msg_type === 'proposal') {
        const proposal = {
          id: data.proposal.id,
          ask_price: Number(data.proposal.ask_price),
          payout: Number(data.proposal.payout),
          spot: Number(data.proposal.spot),
          longcode: data.proposal.longcode
        };
        state.lastProposal = proposal;
        state.proposalIds.add(proposal.id);
        // Keep the allow-list bounded so stale proposal IDs cannot accumulate.
        if (state.proposalIds.size > 50) {
          state.proposalIds.delete(state.proposalIds.values().next().value);
        }
        return;
      }

      if (data.msg_type === 'buy') {
        state.lastBuy = {
          contract_id: data.buy.contract_id,
          buy_price: Number(data.buy.buy_price),
          payout: Number(data.buy.payout),
          start_time: data.buy.start_time
        };
      }
    });

    socket.on('close', () => {
      if (state.derivWs !== socket) return;
      state.isAuthorized = false;
      state.account = null;
      console.log('Deriv WebSocket closed');
      scheduleReconnect();
    });

    socket.on('error', (error) => {
      console.error('Deriv WebSocket error:', error.message);
    });
  } catch (error) {
    console.error('Deriv connection failed:', error.message);
    scheduleReconnect();
  } finally {
    state.connecting = false;
  }
}

function scheduleReconnect() {
  if (state.shuttingDown || state.reconnectTimer) return;
  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    void connectDeriv();
  }, 5000);
}

async function runObservationLoop() {
  while (state.botRunning) {
    // Intentionally observation-only. Add and test a strategy before allowing
    // this loop to request proposals or place trades.
    if (state.lastTick) {
      console.log('Bot observation:', state.lastTick.symbol, state.lastTick.quote);
    }
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }
}

function start() {
  const missing = requiredConfiguration();
  if (missing.length) {
    console.error(`Missing or invalid configuration: ${missing.join(', ')}`);
    console.error('Copy .env.example to .env and set the values before starting.');
    process.exitCode = 1;
    return;
  }

  configureApp();
  const server = app.listen(PORT, () => {
    console.log(`Dashboard running at http://localhost:${PORT}`);
  });
  connectDeriv();

  const shutdown = () => {
    if (state.shuttingDown) return;
    state.shuttingDown = true;
    state.botRunning = false;
    if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
    if (state.derivWs) state.derivWs.close();
    server.close(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

if (require.main === module) start();

module.exports = {
  app,
  configureApp,
  requiredConfiguration,
  validateTradeInput
};