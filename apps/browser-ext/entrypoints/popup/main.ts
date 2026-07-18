import { loadSettings } from '../../lib/store';
import { capture } from '../../lib/api';
import {
  loadCaptures,
  upsertCapture,
  saveCaptures,
  type TrackedCapture,
} from '../../lib/captures';

// ---------------------------------------------------------------------------
// HTML escaping — never interpolate untrusted strings into innerHTML directly
// ---------------------------------------------------------------------------
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (HTMLElement | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const child of children) {
    if (typeof child === 'string') e.appendChild(document.createTextNode(child));
    else e.appendChild(child);
  }
  return e;
}

function relativeTime(isoStr: string): string {
  const diffMs = Date.now() - new Date(isoStr).getTime();
  const s = Math.floor(diffMs / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------
type Mode = 'url' | 'selection' | 'voice';
let currentMode: Mode = 'url';
let activeTab: chrome.tabs.Tab | null = null;
let recordedBlob: Blob | null = null;
let mediaRecorder: MediaRecorder | null = null;
let recordingStream: MediaStream | null = null;
let recordingTimer: ReturnType<typeof setTimeout> | null = null;

let captures: TrackedCapture[] = [];
let serverUrl = 'http://localhost:4321';

// ---------------------------------------------------------------------------
// Not-paired state
// ---------------------------------------------------------------------------
function renderNotPaired(root: HTMLElement): void {
  root.innerHTML = '';
  const state = el('div', { class: 'empty-state' });
  state.appendChild(el('p', {}, 'MindBase is not paired with a server yet.'));
  const btn = el('button', { class: 'btn btn-secondary' }, 'Open Settings to pair');
  btn.addEventListener('click', () => chrome.runtime.openOptionsPage());
  state.appendChild(btn);
  root.appendChild(state);
}

// ---------------------------------------------------------------------------
// Recent list — only writes into #recent-section, never touches the form
// ---------------------------------------------------------------------------
function renderRecent(): void {
  const section = document.getElementById('recent-section');
  if (!section) return;

  const recent = captures.slice(0, 5);

  if (recent.length === 0) {
    section.innerHTML = '';
    return;
  }

  const hasInFlight = recent.some(
    c => c.status === 'queued' || c.status === 'processing' || c.status === 'pending',
  );

  section.innerHTML = `
    <hr class="divider"/>
    <div class="recent-section">
      <div class="recent-label">Recent</div>
      <ul class="capture-list">${recent.map(renderCaptureItem).join('')}</ul>
      ${hasInFlight ? '<p class="polling-hint">Compiling in background&hellip;</p>' : ''}
    </div>
  `;

  // Wire per-card buttons
  section.querySelectorAll<HTMLButtonElement>('.btn-retry').forEach(btn => {
    const id = btn.dataset['id'];
    if (!id) return;
    btn.addEventListener('click', () => void handleRetry(id));
  });

  section.querySelectorAll<HTMLButtonElement>('.btn-dismiss').forEach(btn => {
    const id = btn.dataset['id'];
    if (!id) return;
    btn.addEventListener('click', () => void handleDismiss(id));
  });
}

function renderCaptureItem(c: TrackedCapture): string {
  const ago = relativeTime(c.captured_at);
  const titleText = c.title || c.url || '(no title)';
  const truncated = titleText.length > 48 ? titleText.slice(0, 48) + '…' : titleText;

  const statusLabels: Record<TrackedCapture['status'], string> = {
    pending: 'pending',
    queued: 'queued',
    processing: 'compiling',
    compiled: 'done',
    failed: 'failed',
  };

  return `
    <li class="capture-card status-${esc(c.status)}">
      <div class="card-top">
        <span class="badge badge-${esc(c.status)}">${statusLabels[c.status] ?? c.status}</span>
        <span class="card-title-inline" title="${esc(titleText)}">${esc(truncated)}</span>
        <span class="card-time">${esc(ago)}</span>
        <button class="btn-dismiss icon-btn" data-id="${esc(c.id)}" title="Dismiss">&#x2715;</button>
      </div>
      ${c.error ? `<div class="card-error">${esc(c.error)}</div>` : ''}
      <div class="card-actions">
        ${
          c.status === 'compiled'
            ? `<a href="${esc(serverUrl)}" target="_blank" class="link-btn">Open wiki &#x2192;</a>`
            : ''
        }
        ${
          c.status === 'failed'
            ? `<button class="link-btn btn-retry" data-id="${esc(c.id)}">Retry</button>`
            : ''
        }
      </div>
    </li>
  `;
}

async function handleRetry(id: string): Promise<void> {
  try {
    const settings = await loadSettings();
    const res = await fetch(`${settings.serverUrl}/api/inbox/${id}/compile`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${settings.token ?? ''}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    captures = captures.map(c =>
      c.id === id ? { ...c, status: 'processing' as const, error: undefined } : c,
    );
    await saveCaptures(captures);
    renderRecent();
    chrome.runtime.sendMessage({ kind: 'poll-now' }).catch(() => {});
  } catch (e) {
    console.error('[MindBase] retry failed:', e);
  }
}

async function handleDismiss(id: string): Promise<void> {
  captures = captures.filter(c => c.id !== id);
  await saveCaptures(captures);
  renderRecent();
}

// ---------------------------------------------------------------------------
// Form helpers (voice recorder)
// ---------------------------------------------------------------------------
function buildModePills(onChange: (mode: Mode) => void): HTMLDivElement {
  const pills = el('div', { class: 'mode-pills' });
  const modes: { id: Mode; label: string }[] = [
    { id: 'url', label: 'URL' },
    { id: 'selection', label: 'Selection' },
    { id: 'voice', label: 'Voice' },
  ];
  for (const m of modes) {
    const btn = el('button', { class: `mode-pill${currentMode === m.id ? ' active' : ''}` }, m.label);
    btn.addEventListener('click', () => {
      pills.querySelectorAll('.mode-pill').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      currentMode = m.id;
      onChange(m.id);
    });
    pills.appendChild(btn);
  }
  return pills;
}

function buildVoiceSection(): {
  section: HTMLDivElement;
  getBlob: () => Blob | null;
} {
  const section = el('div', { class: 'voice-section' });
  const hint = el('p', { class: 'voice-hint' }, 'Click the mic to start recording');
  const recordBtn = el('button', { class: 'record-btn', title: 'Start recording' });
  recordBtn.textContent = '🎙';

  let chunks: BlobPart[] = [];
  recordedBlob = null;

  function stopRecording(): void {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    if (recordingTimer !== null) {
      clearTimeout(recordingTimer);
      recordingTimer = null;
    }
    recordBtn.classList.remove('recording');
    recordBtn.textContent = '🎙';
    recordBtn.title = 'Start recording';
    hint.textContent = 'Processing…';
  }

  recordBtn.addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      stopRecording();
      return;
    }

    chunks = [];
    recordedBlob = null;

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(stream => {
        recordingStream = stream;
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

        mediaRecorder.addEventListener('dataavailable', (e: BlobEvent) => {
          if (e.data.size > 0) chunks.push(e.data);
        });

        mediaRecorder.addEventListener('stop', () => {
          recordedBlob = new Blob(chunks, { type: 'audio/webm' });
          stream.getTracks().forEach(t => t.stop());
          recordingStream = null;
          hint.textContent = 'Recorded · click Save';
        });

        mediaRecorder.start();
        recordBtn.classList.add('recording');
        recordBtn.textContent = '⏹';
        recordBtn.title = 'Stop recording';
        hint.textContent = 'Recording… (max 120 s)';

        recordingTimer = setTimeout(() => stopRecording(), 120_000);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        hint.textContent = `Mic error: ${msg}`;
      });
  });

  section.appendChild(recordBtn);
  section.appendChild(hint);

  return {
    section,
    getBlob: () => recordedBlob,
  };
}

// ---------------------------------------------------------------------------
// Form — built once on init; inputs are reset after each successful save
// ---------------------------------------------------------------------------
async function renderForm(root: HTMLElement): Promise<void> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tabs[0] ?? null;
  const tabTitle = activeTab?.title ?? '';
  const tabUrl = activeTab?.url ?? '';

  // ── Outer scaffold: form + recent slot ─────────────────────────────────────
  root.innerHTML = `
    <form id="capture-form"></form>
    <div id="recent-section"></div>
  `;

  const formEl = document.getElementById('capture-form') as HTMLFormElement;

  // Title field
  const titleGroup = el('div', { class: 'form-group' });
  titleGroup.appendChild(el('label', {}, 'Title'));
  const titleInput = el('input', { type: 'text', placeholder: 'Page title' });
  titleInput.value = tabTitle;
  titleGroup.appendChild(titleInput);
  formEl.appendChild(titleGroup);

  // Mode pills
  let voiceSection: { section: HTMLDivElement; getBlob: () => Blob | null } | null = null;
  const modeContainer = el('div', { class: 'form-group' });
  modeContainer.appendChild(el('label', {}, 'Capture mode'));
  const modeExtra = el('div', {});

  const pills = buildModePills(mode => {
    modeExtra.innerHTML = '';
    voiceSection = null;
    if (mode === 'voice') {
      voiceSection = buildVoiceSection();
      modeExtra.appendChild(voiceSection.section);
    }
  });
  modeContainer.appendChild(pills);
  formEl.appendChild(modeContainer);
  formEl.appendChild(modeExtra);

  // Note field
  const noteGroup = el('div', { class: 'form-group' });
  noteGroup.appendChild(el('label', {}, 'Note'));
  const noteInput = el('textarea', { placeholder: 'Optional note…' });
  noteGroup.appendChild(noteInput);
  formEl.appendChild(noteGroup);

  // Tags field
  const tagsGroup = el('div', { class: 'form-group' });
  tagsGroup.appendChild(el('label', {}, 'Tags'));
  const tagsInput = el('input', { type: 'text', placeholder: 'tag1, tag2, …' });
  tagsGroup.appendChild(tagsInput);
  formEl.appendChild(tagsGroup);

  // Status feedback
  const statusEl = el('p', { class: 'status' });

  // Save button
  const saveBtn = el('button', { type: 'button', class: 'btn btn-primary' }, 'Save');

  function parseTags(): string[] {
    return tagsInput.value
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
  }

  function setStatus(text: string, type: 'saving' | 'success' | 'error'): void {
    statusEl.textContent = text;
    statusEl.className = `status ${type}`;
  }

  async function getSelectionText(): Promise<string> {
    if (!activeTab?.id) return '';
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: () => window.getSelection()?.toString() ?? '',
      });
      const firstResult = results[0];
      return typeof firstResult?.result === 'string' ? firstResult.result : '';
    } catch {
      return '';
    }
  }

  async function doSave(): Promise<void> {
    saveBtn.disabled = true;
    setStatus('Saving…', 'saving');

    try {
      const title = titleInput.value.trim() || tabTitle;
      const note = noteInput.value.trim() || undefined;
      const tags = parseTags();
      let result: { id: string; status: string };

      if (currentMode === 'url') {
        result = await capture({
          type: 'url',
          url: tabUrl,
          title,
          note,
          tags,
          client_dedup_key: `url:${tabUrl}:${Date.now()}`,
        });
      } else if (currentMode === 'selection') {
        const text = await getSelectionText();
        if (!text) {
          setStatus('✗ No selection found — highlight text on the page first', 'error');
          saveBtn.disabled = false;
          return;
        }
        result = await capture({
          type: 'text',
          text,
          url: tabUrl,
          title,
          note,
          tags,
          client_dedup_key: `sel:${tabUrl}:${text.slice(0, 40)}:${Date.now()}`,
        });
      } else {
        const blob = voiceSection?.getBlob() ?? null;
        if (!blob) {
          setStatus('✗ Record audio first, then click Save', 'error');
          saveBtn.disabled = false;
          return;
        }
        result = await capture({
          type: 'audio',
          file: blob,
          title: title || 'Voice recording',
          note,
          tags,
          client_dedup_key: `audio:${Date.now()}`,
        });
      }

      // Add to local captures list as queued — storage.onChanged fires → renderRecent()
      const newCapture: TrackedCapture = {
        id: result.id,
        type: currentMode === 'url' ? 'url' : currentMode === 'selection' ? 'text' : 'audio',
        title: titleInput.value.trim() || tabTitle || 'Capture',
        url: tabUrl || undefined,
        captured_at: new Date().toISOString(),
        status: 'queued',
      };
      await upsertCapture(newCapture);
      captures = await loadCaptures();

      // Tell background to start tracking + trigger a poll
      chrome.runtime
        .sendMessage({
          kind: 'track',
          id: result.id,
          type: newCapture.type,
          title: newCapture.title,
          url: newCapture.url,
        })
        .catch(() => {});

      // Reset form — title back to tab title, note + tags cleared
      titleInput.value = tabTitle;
      noteInput.value = '';
      tagsInput.value = '';
      setStatus('✓ Saved', 'success');
      setTimeout(() => {
        statusEl.textContent = '';
        statusEl.className = 'status';
      }, 2000);

      // Re-enable save
      saveBtn.disabled = false;

      // Render the newly queued entry immediately (storage change may lag a tick)
      renderRecent();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`✗ ${msg}`, 'error');
      saveBtn.disabled = false;
    }
  }

  saveBtn.addEventListener('click', () => void doSave());

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void doSave();
    }
  });

  formEl.appendChild(statusEl);
  formEl.appendChild(saveBtn);

  // Render recent list for the first time
  renderRecent();
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
async function init(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;

  try {
    const settings = await loadSettings();
    serverUrl = settings.serverUrl;

    if (!settings.token) {
      renderNotPaired(root);
      return;
    }

    captures = await loadCaptures();

    // Subscribe to storage changes — only update the recent list, never touch the form
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if ('mindbase.captures' in changes) {
        const newVal = changes['mindbase.captures']?.newValue;
        captures = Array.isArray(newVal) ? (newVal as TrackedCapture[]) : [];
        renderRecent();
      }
    });

    // Trigger immediate poll via background
    chrome.runtime.sendMessage({ kind: 'poll-now' }).catch(() => {});

    await renderForm(root);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (root) root.textContent = `Error: ${msg}`;
  }
}

void init();
