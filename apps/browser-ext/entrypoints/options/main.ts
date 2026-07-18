import { loadSettings, saveSettings, type Settings } from '../../lib/store';
import { pair } from '../../lib/api';

// ---------------------------------------------------------------------------
// Pair-code validation: must match XXXX-XXXX (alphanumeric groups)
// ---------------------------------------------------------------------------
const PAIR_CODE_RE = /^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/;

// ---------------------------------------------------------------------------
// Detect default device name from browser + platform
// ---------------------------------------------------------------------------
function defaultDeviceName(): string {
  const ua = navigator.userAgent;
  let os = 'Unknown OS';
  if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Linux/.test(ua)) os = 'Linux';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad/.test(ua)) os = 'iOS';
  return `Browser on ${os}`;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
async function render(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;

  let settings: Settings;
  try {
    settings = await loadSettings();
  } catch {
    root.textContent = 'Error loading settings.';
    return;
  }

  root.innerHTML = '';

  const container = document.createElement('div');
  container.className = 'container';

  // Header
  const h1 = document.createElement('h1');
  h1.textContent = 'MindBase Capture · Settings';
  container.appendChild(h1);

  // ── Server section ──────────────────────────────────────────────────────
  const serverCard = document.createElement('div');
  serverCard.className = 'card';

  const serverHeading = document.createElement('h2');
  serverHeading.textContent = 'Server';
  serverCard.appendChild(serverHeading);

  const serverGroup = document.createElement('div');
  serverGroup.className = 'form-group';
  const serverLabel = document.createElement('label');
  serverLabel.htmlFor = 'server-url';
  serverLabel.textContent = 'Server URL';
  const serverInput = document.createElement('input');
  serverInput.type = 'text';
  serverInput.id = 'server-url';
  serverInput.value = settings.serverUrl;
  serverInput.placeholder = 'http://localhost:4321';
  const serverHelp = document.createElement('p');
  serverHelp.className = 'help-text';
  serverHelp.textContent =
    'The base URL of your self-hosted MindBase server (no trailing slash).';
  serverGroup.appendChild(serverLabel);
  serverGroup.appendChild(serverInput);
  serverGroup.appendChild(serverHelp);
  serverCard.appendChild(serverGroup);

  const saveServerBtn = document.createElement('button');
  saveServerBtn.className = 'btn btn-primary';
  saveServerBtn.textContent = 'Save Server URL';
  saveServerBtn.style.alignSelf = 'flex-start';

  const serverStatus = document.createElement('p');
  serverStatus.className = 'status-message';

  saveServerBtn.addEventListener('click', async () => {
    const url = serverInput.value.trim();
    if (!url) {
      serverStatus.textContent = 'Server URL cannot be empty.';
      serverStatus.className = 'status-message error';
      return;
    }
    try {
      settings.serverUrl = url;
      await saveSettings(settings);
      serverStatus.textContent = '✓ Saved';
      serverStatus.className = 'status-message success';
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      serverStatus.textContent = `✗ ${msg}`;
      serverStatus.className = 'status-message error';
    }
  });

  serverCard.appendChild(saveServerBtn);
  serverCard.appendChild(serverStatus);
  container.appendChild(serverCard);

  // ── Pairing section ─────────────────────────────────────────────────────
  const pairCard = document.createElement('div');
  pairCard.className = 'card';

  const pairHeading = document.createElement('h2');
  pairHeading.textContent = 'Device Pairing';
  pairCard.appendChild(pairHeading);

  // Status badge
  const badgeRow = document.createElement('div');
  const badge = document.createElement('span');
  badge.className = `status-badge ${settings.token ? 'paired' : 'unpaired'}`;
  badge.textContent = settings.token ? '● Paired' : '○ Not paired';
  badgeRow.appendChild(badge);
  pairCard.appendChild(badgeRow);

  if (settings.token && settings.deviceId) {
    const info = document.createElement('p');
    info.className = 'device-info';
    info.textContent = `Device ID: ${settings.deviceId}`;
    pairCard.appendChild(info);
  }

  pairCard.appendChild(document.createElement('hr'));

  // Pair code
  const codeGroup = document.createElement('div');
  codeGroup.className = 'form-group';
  const codeLabel = document.createElement('label');
  codeLabel.htmlFor = 'pair-code';
  codeLabel.textContent = 'Pair Code';
  const codeInput = document.createElement('input');
  codeInput.type = 'text';
  codeInput.id = 'pair-code';
  codeInput.placeholder = 'XXXX-XXXX';
  codeInput.maxLength = 9;
  const codeHelp = document.createElement('p');
  codeHelp.className = 'help-text';
  codeHelp.textContent =
    'Get a pair code from your MindBase server (Settings → Connected Devices → Add).';
  codeGroup.appendChild(codeLabel);
  codeGroup.appendChild(codeInput);
  codeGroup.appendChild(codeHelp);
  pairCard.appendChild(codeGroup);

  // Device name
  const nameGroup = document.createElement('div');
  nameGroup.className = 'form-group';
  const nameLabel = document.createElement('label');
  nameLabel.htmlFor = 'device-name';
  nameLabel.textContent = 'Device Name';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.id = 'device-name';
  nameInput.value = defaultDeviceName();
  nameInput.placeholder = 'My Browser';
  nameGroup.appendChild(nameLabel);
  nameGroup.appendChild(nameInput);
  pairCard.appendChild(nameGroup);

  const pairStatus = document.createElement('p');
  pairStatus.className = 'status-message';

  const btnRow = document.createElement('div');
  btnRow.className = 'btn-row';

  const pairBtn = document.createElement('button');
  pairBtn.className = 'btn btn-primary';
  pairBtn.textContent = 'Pair';

  pairBtn.addEventListener('click', async () => {
    const code = codeInput.value.trim();
    const name = nameInput.value.trim() || defaultDeviceName();

    if (!PAIR_CODE_RE.test(code)) {
      pairStatus.textContent = '✗ Pair code must be in format XXXX-XXXX';
      pairStatus.className = 'status-message error';
      return;
    }

    pairBtn.disabled = true;
    pairStatus.textContent = 'Pairing…';
    pairStatus.className = 'status-message saving';

    try {
      // Use the server URL the user has currently entered, not the stored one
      settings.serverUrl = serverInput.value.trim() || settings.serverUrl;
      const result = await pair(code, name);
      settings.token = result.token;
      settings.deviceId = result.deviceId;
      await saveSettings(settings);
      pairStatus.textContent = '✓ Paired successfully! Reloading…';
      pairStatus.className = 'status-message success';
      // Re-render to reflect new state
      setTimeout(() => void render(), 800);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      pairStatus.textContent = `✗ ${msg}`;
      pairStatus.className = 'status-message error';
      pairBtn.disabled = false;
    }
  });

  btnRow.appendChild(pairBtn);

  if (settings.token) {
    const unpairBtn = document.createElement('button');
    unpairBtn.className = 'btn btn-danger';
    unpairBtn.textContent = 'Unpair';

    unpairBtn.addEventListener('click', async () => {
      if (!confirm('Remove pairing? You will need to pair again to capture.')) return;
      settings.token = null;
      settings.deviceId = null;
      await saveSettings(settings);
      void render();
    });

    btnRow.appendChild(unpairBtn);
  }

  pairCard.appendChild(btnRow);
  pairCard.appendChild(pairStatus);

  container.appendChild(pairCard);
  root.appendChild(container);
}

void render();
