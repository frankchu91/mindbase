import { defineBackground } from 'wxt/utils/define-background';
import { capture as apiCapture } from '../lib/api';
import {
  upsertCapture,
  loadCaptures,
  saveCaptures,
  inFlightCount,
  type TrackedCapture,
} from '../lib/captures';
import { loadSettings } from '../lib/store';

export default defineBackground(() => {
  // ── Context menu registration ────────────────────────────────────────────
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: 'mindbase-save-selection',
      title: 'Save selection to MindBase',
      contexts: ['selection'],
    });
    chrome.contextMenus.create({
      id: 'mindbase-save-screenshot',
      title: 'Save screenshot to MindBase',
      contexts: ['page'],
    });
  });

  // ── Context menu click handler ───────────────────────────────────────────
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    void (async () => {
      try {
        if (info.menuItemId === 'mindbase-save-selection' && info.selectionText) {
          const r = await apiCapture({
            type: 'text',
            text: info.selectionText,
            url: tab?.url,
            title: tab?.title ?? 'Selection',
            client_dedup_key: `sel:${tab?.url ?? ''}:${info.selectionText.slice(0, 40)}`,
          });
          await trackNew(r.id, 'text', tab?.title ?? 'Selection', tab?.url);
          console.log('[MindBase] context menu selection captured, id:', r.id);
        } else if (info.menuItemId === 'mindbase-save-screenshot') {
          const dataUrl = await chrome.tabs.captureVisibleTab();
          const blob = await (await fetch(dataUrl)).blob();
          const r = await apiCapture({
            type: 'image',
            file: blob,
            url: tab?.url,
            title: tab?.title ?? 'Screenshot',
            client_dedup_key: `shot:${tab?.url ?? ''}:${Date.now()}`,
          });
          await trackNew(r.id, 'image', tab?.title ?? 'Screenshot', tab?.url);
          console.log('[MindBase] context menu screenshot captured, id:', r.id);
        }
      } catch (e) {
        console.error('[MindBase] context menu capture failed:', e instanceof Error ? e.message : e);
      }
    })();
  });

  // ── Keyboard shortcut ────────────────────────────────────────────────────
  chrome.commands.onCommand.addListener(cmd => {
    if (cmd === 'open-popup') {
      if (typeof chrome.action.openPopup === 'function') {
        chrome.action.openPopup().catch(() => {
          console.log('[MindBase] openPopup not available in this context');
        });
      }
    }
  });

  // ── Polling: alarms as reliable wake-up (MV3 service workers can be killed) ──
  // 6-second tick via alarms (minimum period is ~1 minute but Chrome clamps to
  // the value; 0.1 min = 6s in Chrome's implementation).
  chrome.alarms.create('mindbase-poll', { periodInMinutes: 0.1 });
  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === 'mindbase-poll') {
      void pollOnce();
    }
  });

  // ── Message handler (from popup) ─────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
    if (!msg || typeof msg !== 'object') return false;
    const m = msg as { kind?: string; id?: string; type?: string; title?: string; url?: string };

    if (m.kind === 'track') {
      const type = (m.type ?? 'url') as TrackedCapture['type'];
      trackNew(m.id ?? '', type, m.title ?? '', m.url)
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: false }));
      return true; // keep channel open for async response
    }

    if (m.kind === 'poll-now') {
      pollOnce()
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: false }));
      return true;
    }

    return false;
  });

  // ── Helpers ──────────────────────────────────────────────────────────────

  async function trackNew(
    id: string,
    type: TrackedCapture['type'],
    title: string,
    url?: string,
  ): Promise<void> {
    await upsertCapture({
      id,
      type,
      title,
      url,
      captured_at: new Date().toISOString(),
      status: 'queued',
    });
    await updateBadge();
    // Trigger a quick poll so status reflects any fast server response
    setTimeout(() => void pollOnce(), 1500);
  }

  // Consecutive failure counter — used to back off + suppress noisy console.error
  // when the server is briefly unreachable (laptop sleep, tsx-watch reload, Wi-Fi
  // change). Chrome surfaces every console.error as an extension "Error" badge,
  // which makes transient network blips look like the extension itself crashed.
  let consecutiveFailures = 0;

  async function pollOnce(): Promise<void> {
    const list = await loadCaptures();
    if (inFlightCount(list) === 0) {
      await updateBadge();
      return;
    }

    const settings = await loadSettings();
    if (!settings.token) return;

    try {
      const res = await fetch(`${settings.serverUrl}/api/inbox`, {
        headers: { Authorization: `Bearer ${settings.token}` },
      });
      if (!res.ok) {
        // Server responded but with an error status — treat as a soft failure.
        consecutiveFailures++;
        return;
      }
      consecutiveFailures = 0; // reset on any successful response

      const body = (await res.json()) as {
        entries: Array<{
          id: string;
          status: string;
          wiki_slug?: string;
          error?: string;
          title?: string;
        }>;
      };
      const byId = new Map(body.entries.map(e => [e.id, e]));

      let changed = false;
      for (const c of list) {
        if (c.status === 'compiled' || c.status === 'failed') continue;
        const e = byId.get(c.id);
        if (!e) continue;
        const newStatus = e.status as TrackedCapture['status'];
        if (
          newStatus !== c.status ||
          e.wiki_slug !== c.wiki_slug ||
          e.error !== c.error
        ) {
          c.status = newStatus;
          c.wiki_slug = e.wiki_slug;
          c.error = e.error;
          c.last_polled_at = new Date().toISOString();
          changed = true;
        }
      }

      if (changed) await saveCaptures(list);
    } catch (e) {
      consecutiveFailures++;
      // Use console.warn — Chrome surfaces console.error as a hard extension
      // error in chrome://extensions, which is misleading for transient network
      // failures. Only escalate to console.error after 10 consecutive failures
      // (~60 seconds with the 6s alarm cadence), which suggests a real config
      // problem (server gone, wrong URL, token revoked, etc).
      const msg = e instanceof Error ? e.message : String(e);
      if (consecutiveFailures > 10) {
        console.error(
          `[MindBase] poll failing for ${consecutiveFailures} cycles — is the server running at ${settings.serverUrl}?`,
          msg,
        );
      } else {
        console.warn('[MindBase] poll skipped (transient):', msg);
      }
    }

    await updateBadge();
  }

  async function updateBadge(): Promise<void> {
    const list = await loadCaptures();
    const n = inFlightCount(list);
    if (n === 0) {
      await chrome.action.setBadgeText({ text: '' });
    } else {
      await chrome.action.setBadgeText({ text: String(n) });
      await chrome.action.setBadgeBackgroundColor({ color: '#fbbf24' }); // amber
    }
  }

  console.log('[MindBase] background service worker loaded');
});
