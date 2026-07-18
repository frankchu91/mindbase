# MindBase iOS

> Capture into your MindBase wiki from anywhere on your phone

A native SwiftUI app that surfaces a share extension in the iOS system share sheet, lets you record voice memos, scan QR codes to pair with your server, and review your capture inbox — all without opening a browser.

---

## What it is

The iOS app ships two bundled targets:

- **MindBase** — the main app. Handles device pairing, voice recording, and the capture inbox.
- **ShareExtension** — the system extension. Appears in the iOS share sheet when you share a URL from Safari, text from Notes, or an image from Photos. Sends the content directly to your MindBase instance via `APIClient`.

Both targets share the same Keychain group (`group.app.mindbase`), so the auth token set during pairing is immediately available to the extension without any extra setup.

---

## Requirements

- Xcode 16+
- iOS 17.0+ device or simulator
- [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`)
- A running MindBase server (local or remote)

The `.xcodeproj` is **not committed** — it is fully reproducible from `project.yml` via `xcodegen generate`.

---

## Setup

```bash
cd apps/ios
xcodegen generate
open MindBase.xcodeproj
```

`xcodegen generate` reads `project.yml` and writes a fresh `MindBase.xcodeproj`. Re-run it any time `project.yml` changes.

---

## Build for simulator

No signing required. Use the env override to skip code-sign prompts:

```bash
cd apps/ios
CODE_SIGN_IDENTITY="" CODE_SIGNING_REQUIRED=NO CODE_SIGNING_ALLOWED=NO \
  xcodebuild -project MindBase.xcodeproj \
             -scheme MindBase \
             -sdk iphonesimulator \
             -destination 'platform=iOS Simulator,name=iPhone 16' \
             build
```

Expected: `** BUILD SUCCEEDED **`

After a successful build the app bundle contains the embedded extension:

```
MindBase.app/
└── PlugIns/
    └── ShareExtension.appex/
```

---

## Build for device

Device builds require a real Apple Developer account because the `group.app.mindbase` App Group capability is not available with free signing.

1. **Set your Team ID.** Open `project.yml` and set `DEVELOPMENT_TEAM` to your 10-character team ID (find it at [developer.apple.com/account](https://developer.apple.com/account) → Membership):

   ```yaml
   settings:
     base:
       DEVELOPMENT_TEAM: "XXXXXXXXXX"
   ```

   Re-run `xcodegen generate` after editing.

2. **Register the App Group.** In the Apple Developer portal → Certificates, Identifiers & Profiles → Identifiers:
   - Register `app.mindbase.ios` (App ID) with the App Groups capability.
   - Register `app.mindbase.ios.share` (App Extension ID) with the same App Groups capability.
   - Create the App Group `group.app.mindbase`.
   - Regenerate provisioning profiles for both IDs.

3. **Build.** With `CODE_SIGN_STYLE: Automatic` in `project.yml`, Xcode resolves profiles automatically:

   ```bash
   xcodebuild -project MindBase.xcodeproj \
              -scheme MindBase \
              -sdk iphoneos \
              -destination 'generic/platform=iOS' \
              build
   ```

---

## Pair the app

Pairing links the app to your MindBase server and stores a token in the shared Keychain.

1. Open your MindBase web UI at `<server>/devices` (e.g. `http://localhost:4321/devices`).
2. Click **Pair new device** and note the pairing code (e.g. `8EUG-T28F`).
3. In the iOS app, tap **Settings** → **Pair this device**.
4. Enter the pairing code manually, or tap the QR icon and scan the code from your screen.
5. Tap **Pair**. The app confirms pairing and stores the token.

The Share Extension reads this token automatically via the shared App Group Keychain — no separate pairing step needed.

---

## Test the Share Extension

1. Run the MindBase app at least once on the simulator or device (this registers the extension with iOS).
2. Open **Safari** and navigate to any webpage.
3. Tap the **Share** button (box with arrow).
4. In the share sheet, scroll right through the app row. If MindBase is not visible, tap **More** → find **MindBase** → enable it.
5. Tap **MindBase** in the share sheet. A compose sheet appears with an optional note field.
6. Add a note (optional) and tap **Post**. The URL is sent to your MindBase server.

The extension handles three content types:

| Shared from | Type sent |
|---|---|
| Safari URL | `url` with `title` and `url` fields |
| Notes / selected text | `text` with the raw text |
| Photos / Files (image) | `image` with the file uploaded as multipart |

---

## Source layout

| Path | Role |
|---|---|
| `MindBaseApp.swift` | App entry point (`@main`) |
| `ContentView.swift` | Root SwiftUI view — tab bar host |
| `PairingView.swift` | Pairing UI — manual code entry + QR scan trigger |
| `QRScannerView.swift` | AVFoundation QR scanner sheet |
| `VoiceRecorderView.swift` | Voice memo recorder — sends `audio` capture |
| `InboxView.swift` | Lists recent captures from the server inbox |
| `KeychainStore.swift` | Shared Keychain wrapper (App Group `group.app.mindbase`) — used by both targets |
| `APIClient.swift` | Async/await HTTP client — `pair()` and `capture()` — used by both targets |
| `MindBase.entitlements` | Main app App Group entitlement |
| `ShareExtension/ShareViewController.swift` | `SLComposeServiceViewController` subclass — handles URL, text, and image share types |
| `ShareExtension/Info.plist` | Extension Info.plist (generated by XcodeGen from `project.yml`) |
| `ShareExtension/ShareExtension.entitlements` | Extension App Group entitlement (generated by XcodeGen) |
| `project.yml` | XcodeGen spec — source of truth for both targets |

---

## TestFlight

To distribute to testers:

1. Set `DEVELOPMENT_TEAM` in `project.yml` and re-run `xcodegen generate`.
2. In Xcode: **Product → Archive**.
3. In the Organizer window that opens: click **Distribute App** → **App Store Connect** → follow the prompts.
4. In [App Store Connect](https://appstoreconnect.apple.com): add testers under the **TestFlight** tab.

Requires a paid Apple Developer account ($99/year).

---

## Testing

The iOS app has an XCUITest target (`MindBaseUITests`) covering six scenarios: launch + tab bar, unpaired Settings, pairing sheet fields, disabled Pair button with empty code, Voice mic button, and Inbox empty state.

### Run from CLI

```bash
bash apps/ios/test.sh
```

Or from the repo root:

```bash
pnpm test:ios
```

Both commands call `xcodegen generate` first, then run `xcodebuild test` against the **iPhone 16** simulator (iOS 18.x, whichever SDK ships with Xcode 16.3). The full run takes approximately 60–90 seconds including simulator boot.

### Simulator dependency

The test script hard-codes `name=iPhone 16`. If that device type is absent, change the `-destination` line in `test.sh` to match an available simulator:

```bash
xcrun simctl list devicetypes | grep iPhone
```

### UI testing flags

Two `CommandLine.arguments` flags control test behaviour in the app itself:

- `-UI_TESTING` — suppresses the auto-open pairing sheet on launch (ContentView) and skips the network load in InboxView so the empty state appears immediately. Both flags are set via `app.launchArguments` in the XCUITest setUp.

### What is tested

| Test | What it checks |
|---|---|
| `testLaunchShowsTabBar` | Tab bar appears; Voice, Inbox, Settings tabs present |
| `testSettingsShowsPairButton` | Settings tab shows "Pair this device" button when unpaired |
| `testPairingSheetFields` | Pairing sheet has server URL, device name, pair code fields + submit button |
| `testPairingWithEmptyCodeKeepsButtonDisabled` | Submit button is disabled when code field is empty |
| `testVoiceTabShowsMicButton` | Voice tab shows the mic record button |
| `testInboxTabShowsEmptyState` | Inbox tab shows "Inbox is empty." with no server reachable |

---

## Known issues

- **App Group on free signing:** free Apple Developer accounts cannot use the App Groups capability. The app will build for simulator without this limitation, but device builds require a paid account.
- **Share extension memory limit:** iOS caps extension memory at approximately 120 MB. Large images (e.g. RAW files from Photos) may exceed this limit and fail silently. The extension logs the error to the console and calls `completeRequest` cleanly — it will not crash the share sheet.
- **Simulator share sheet:** the share sheet in the iOS Simulator does not always list third-party extensions. Test share-sheet behaviour on a real device for reliable results.
- **Voice memo requires microphone permission:** `NSMicrophoneUsageDescription` is declared in `MindBase/Info.plist`. iOS will prompt the user on first use.
- **QR scan requires camera permission:** `NSCameraUsageDescription` is declared in `MindBase/Info.plist`. iOS will prompt the user on first use.
- **Extension not appearing in share sheet after install:** reboot the simulator (`Device → Restart`) or reinstall the app. iOS caches the extension registry and sometimes needs a nudge.
