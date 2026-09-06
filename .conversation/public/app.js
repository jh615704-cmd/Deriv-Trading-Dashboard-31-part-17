const apiKeyInput = document.querySelector('#api-key');
const authMessage = document.querySelector('#auth-message');
const proposalOutput = document.querySelector('#proposal');
let latestProposal = null;

apiKeyInput.value = sessionStorage.getItem('deriv_dashboard_key') || '';

function apiKey() {
  return sessionStorage.getItem('deriv_dashboard_key') || '';
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey(),
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

function setText(selector, value) {
  document.querySelector(selector).textContent = value;
}

function showError(error) {
  setText('#global-message', error.message);
}

async function refresh() {
  if (!apiKey()) return;
  try {
    const status = await api('/api/status');
    setText('#connection', status.connected ? 'Connected' : 'Offline');
    setText('#authorization', status.authorized ? 'Authorized' : 'Waiting');
    setText('#balance', status.account?.balance != null
      ? `${status.account.balance.toFixed(2)} ${status.account.currency || status.currency}`
      : '—');
    setText('#quote', status.lastTick?.quote != null ? status.lastTick.quote : '—');
    setText('#symbol-label', status.symbol || '—');
    latestProposal = status.lastProposal;
    proposalOutput.textContent = latestProposal
      ? JSON.stringify(latestProposal, null, 2)
      : 'No proposal received yet.';
    authMessage.textContent = `Connected to ${status.symbol}.`;
  } catch (error) {
    authMessage.textContent = error.message;
  }
}

document.querySelector('#save-key').addEventListener('click', async () => {
  sessionStorage.setItem('deriv_dashboard_key', apiKeyInput.value);
  await refresh();
});

document.querySelector('#trade-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const result = await api('/api/manual-trade', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(form))
    });
    setText('#trade-message', result.message);
  } catch (error) {
    setText('#trade-message', error.message);
  }
});

document.querySelector('#buy-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!latestProposal?.id) {
    setText('#buy-message', 'Request a proposal first.');
    return;
  }
  const price = Number(new FormData(event.currentTarget).get('price'));
  try {
    const result = await api('/api/buy', {
      method: 'POST',
      body: JSON.stringify({ proposal_id: latestProposal.id, price })
    });
    setText('#buy-message', result.message);
  } catch (error) {
    setText('#buy-message', error.message);
  }
});

document.querySelector('#start-bot').addEventListener('click', async () => {
  try {
    setText('#global-message', (await api('/api/start-bot', { method: 'POST' })).message);
  } catch (error) {
    showError(error);
  }
});

document.querySelector('#stop-bot').addEventListener('click', async () => {
  try {
    setText('#global-message', (await api('/api/stop-bot', { method: 'POST' })).message);
  } catch (error) {
    showError(error);
  }
});

refresh();
setInterval(refresh, 3000);