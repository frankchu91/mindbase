# MindBase Capture

> Save anything to your MindBase wiki from any tab

A browser extension for capturing web pages, text selections, screenshots, and voice notes directly into your MindBase wiki. Works in Chrome, Firefox, and Safari.

---

## Install (developer mode)

### Build

From the monorepo root:

```bash
pnpm -F @mindbase/browser-ext build
```

This produces `.output/chrome-mv3/` (Chrome MV3 manifest).

For Firefox:

```bash
pnpm -F @mindbase/browser-ext build:firefox
```

This produces `.output/firefox-mv2/` (Firefox MV2 manifest).

### Load in your browser

#### Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select `/path/to/mindbase/apps/browser-ext/.output/chrome-mv3/`

The extension icon appears in your toolbar.

#### Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select `/path/to/mindbase/apps/browser-ext/.output/firefox-mv2/manifest.json`

The extension icon appears in your toolbar.

#### Safari

Safari requires native app distribution via Xcode. From `.output/chrome-mv3/`:

```bash
xcrun safari-web-extension-converter .output/chrome-mv3/
```

This generates an Xcode project (macOS + Xcode + Apple Developer account required). See [Apple's safari-web-extension-converter docs](https://developer.apple.com/documentation/safariservices/safari_web_extensions/converting_a_web_extension_for_safari) for full steps.

---

## Pair with your MindBase instance

Before capturing, connect the extension to your MindBase server.

1. **Open pairing page:** Visit `<your-mindbase>/devices` in your browser (e.g., `http://localhost:4321/devices`)
2. **Request pairing:** Click "Pair new device" and note the code (e.g., `8EUG-T28F`)
3. **Open extension options:**
   - Right-click the extension icon → **Options**, or
   - Chrome: `chrome://extensions/` → find MindBase Capture → click **Extension options**
   - Firefox: `about:debugging#/runtime/this-firefox` → find MindBase Capture → click **Extension options**
4. **Enter settings:**
   - **Server URL:** Your MindBase instance (default: `http://localhost:4321`)
   - **Pair code:** Paste the code from step 2
5. **Click Pair**

The extension is now linked to your MindBase instance.

---

## Capture

### Open the popup

Click the extension icon in your toolbar, or use the keyboard shortcut:

- **Chrome/Firefox on Mac:** `⌘+Shift+M`
- **Chrome/Firefox on Windows/Linux:** `Ctrl+Shift+M`

The popup shows three capture modes:

### Mode: URL

Captures the current tab's page title and URL.

- **Pre-filled:** Page title, URL, and note field
- **Optional fields:** Add tags, custom note text
- **Click Capture** to save

### Mode: Selection

Captures highlighted text from the page.

- **Select text** on the page, then click the extension icon
- The selected text pre-fills the capture form
- **Add tags and notes** as needed
- **Click Capture** to save

### Mode: Voice

Record a voice memo (capped at 120 seconds per capture).

- **Click the microphone** icon in the popup
- Speak your note
- **Auto-stops at 120s** or **click Stop** to end early
- **Add tags** (optional) and click **Capture**
- The audio is saved as an attachment with the wiki entry

### Context menu (right-click)

On any page:

- **Save selection to MindBase** — captures highlighted text
- **Save screenshot to MindBase** — captures a full-page or region screenshot

---

## Building for distribution

### Chrome Web Store

Build and zip:

```bash
pnpm -F @mindbase/browser-ext zip
```

Produces: `.output/mindbasebrowser-ext-<version>-chrome.zip`

Upload to the [Chrome Web Store](https://chrome.google.com/webstore).

### Firefox Add-ons (AMO)

Build and zip:

```bash
pnpm -F @mindbase/browser-ext zip:firefox
```

Produces:
- `.output/mindbasebrowser-ext-<version>-firefox.zip` — the extension
- `.output/mindbasebrowser-ext-<version>-sources.zip` — required source archive for AMO submission

Upload to [addons.mozilla.org](https://addons.mozilla.org).

### Safari App Store

Requires Xcode and Apple Developer account. See the Safari section above.

---

## Privacy

- **Storage:** Your server URL and pairing token are stored locally in `chrome.storage.local` (never transmitted elsewhere)
- **Captures:** All content is sent only to your configured MindBase instance
- **No telemetry:** The extension does not send usage data, crash reports, or analytics to anyone
- **Device isolation:** Each paired device has a unique token; revoking pairing on `<your-mindbase>/devices` immediately disconnects the extension

---

## Known issues

- **Firefox and data_collection_permissions:** Firefox requires a `data_collection_permissions` entry for new extensions submitted after November 3, 2025. The extension prompts users to opt in at first run. Existing extensions on AMO are exempt.
- **Voice mode in restrictive browser policies:** Some corporate/school browser policies block `navigator.mediaDevices.getUserMedia()` in popup contexts. Voice capture may fail silently in these environments. Workaround: use the context menu "Save selection" instead.
- **Screenshot capture on iframes:** Screenshots via context menu may not work correctly on cross-origin iframes due to browser security policies.

---

## Development

```bash
# from monorepo root
pnpm -F @mindbase/browser-ext dev              # watch mode (Chrome)
pnpm -F @mindbase/browser-ext dev:firefox      # watch mode (Firefox)
pnpm -F @mindbase/browser-ext build            # production build (Chrome)
pnpm -F @mindbase/browser-ext build:firefox    # production build (Firefox)
pnpm -F @mindbase/browser-ext typecheck        # tsc --noEmit
```

Built with [WXT 0.20.25](https://wxt.dev) — a cross-browser extension framework. Source:

```
entrypoints/
├── background.ts        # service worker (permissions, context menus, lifecycle)
├── popup/
│   └── main.ts         # popup UI (modes, capture form, voice recording)
└── options/
    └── main.ts         # options page (pairing, server URL settings)

lib/
├── api.ts              # capture() — sends data to MindBase instance
├── store.ts            # load/save settings from chrome.storage.local
└── ...
```
