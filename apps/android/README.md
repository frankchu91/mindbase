# MindBase Android

Native Android companion app for [MindBase](../../README.md) — capture URLs, text, images, and voice memos from your Android device and share them directly into your personal knowledge base.

> **Important disclaimer:** This code was written on a machine with no Android toolchain (no JDK, Gradle, Android SDK, or Kotlin compiler). It has NOT been built or run. You must open it in Android Studio to verify it compiles. See "Known issues" below for anything that may need adjustment.

---

## Requirements

| Tool | Version |
|------|---------|
| Android Studio | Hedgehog (2023.1.1) or later |
| JDK | 17 (lower versions will fail Gradle sync — see `kotlinOptions.jvmTarget = "17"`) |
| Android SDK platform | 35 (Android 15) |
| `compileSdk` / `targetSdk` | 35 |
| `minSdk` | 28 (Android 9) |

Install Android Studio from https://developer.android.com/studio — it bundles an appropriate JDK and lets you install SDK platforms via the SDK Manager.

---

## First-time setup

### 1. Generate the Gradle wrapper jar

The `gradle-wrapper.jar` binary is **not committed** (it is listed in `.gitignore`). You need it to use `./gradlew`. Two options:

**Option A — Android Studio (recommended, no extra tools needed):**
Open the `apps/android/` folder in Android Studio. The IDE detects the missing wrapper jar and downloads Gradle 8.7 automatically during Gradle sync.

**Option B — CLI (requires Gradle installed on host):**
```bash
cd apps/android
gradle wrapper --gradle-version 8.7
```

This creates `gradle/wrapper/gradle-wrapper.jar`. After this, `./gradlew` works from the command line.

### 2. Create `local.properties`

Android Studio usually creates this automatically when you open the project. If it is missing, create `apps/android/local.properties`:

```properties
# macOS default (adjust to your actual path)
sdk.dir=/Users/your-username/Library/Android/sdk

# Linux
# sdk.dir=/home/your-username/Android/Sdk

# Windows
# sdk.dir=C\:\\Users\\your-username\\AppData\\Local\\Android\\Sdk
```

---

## Build

### Android Studio (recommended)
1. Open Android Studio
2. File → Open → select the `apps/android/` directory
3. Wait for Gradle sync to complete (first sync downloads ~500 MB of dependencies)
4. Run → Run 'app' (or Shift+F10)

### Command line
```bash
cd apps/android
./gradlew assembleDebug
```

Output: `app/build/outputs/apk/debug/app-debug.apk`

---

## Install

### On emulator or USB-connected device
```bash
adb install app/build/outputs/apk/debug/app-debug.apk
```

Or run directly from Android Studio with a device/emulator selected.

### Start an emulator (if you don't have a physical device)
Android Studio → Device Manager → Create Device → choose Pixel 7 → system image with API 35.

---

## Pair with MindBase server

1. Start the MindBase server (`cd apps/server && bun run dev`, listens on port 4321)
2. Open the MindBase web UI in a browser → Settings → Devices → Add device → copy the 8-character code
3. On your Android device/emulator: open MindBase app → Settings tab → "Pair this device"
4. Enter the pair code (`XXXX-XXXX` format) or tap the QR icon to scan
5. Enter the server URL:
   - **Emulator:** `http://10.0.2.2:4321` (Android's loopback alias for the host machine — default)
   - **Physical device on same LAN:** use your host machine's LAN IP, e.g. `http://192.168.1.42:4321`
   - **Cloudflare tunnel:** use the tunnel URL, e.g. `https://your-tunnel.trycloudflare.com`
6. Tap "Pair this device" — you should see "Paired successfully"

---

## Test the share intent

1. Install and run the app at least once (so Android registers the share target)
2. Open Chrome → navigate to any page → tap the share button
3. "MindBase" should appear in the share sheet
4. Tap it — the URL is sent to your MindBase inbox (brief toast confirms success)

Also works from:
- Any app that shares `text/plain` (notes, messages, etc.)
- Gallery apps that share `image/*`

---

## Permissions

| Permission | Trigger |
|-----------|---------|
| `INTERNET` | Always-on (network access to MindBase server) |
| `RECORD_AUDIO` | Prompted the first time you tap the mic button in the Voice tab |
| `CAMERA` | Prompted when you tap the QR scanner icon in the Pair screen |

No location, contacts, or storage permissions are requested.

---

## Source layout

| File | Role |
|------|------|
| `TokenStore.kt` | Persists server URL, auth token, and device ID using Jetpack DataStore (Preferences) |
| `APIClient.kt` | HTTP client (Ktor/CIO) — `pair()` and `capture()` calls to MindBase REST API |
| `MainActivity.kt` | Entry point; hosts bottom navigation bar (Voice / Inbox / Settings tabs) |
| `VoiceScreen.kt` | Composable with large mic button; MediaRecorder → .m4a → upload via APIClient |
| `InboxScreen.kt` | LazyColumn fetching `GET /api/inbox`; status badges matching iOS InboxView |
| `PairingScreen.kt` | Server URL + device name + pair code form; delegates to QRScannerScreen |
| `QRScannerScreen.kt` | CameraX preview + ML Kit barcode analysis; fires callback on first QR detected |
| `SettingsScreen.kt` | Shows paired/unpaired state; "Pair this device" and "Unpair" buttons |
| `ShareReceiverActivity.kt` | Handles `ACTION_SEND` for `text/plain` and `image/*`; calls APIClient; shows toast |

---

## Play Store release

### 1. Generate a signing key (once)
```bash
keytool -genkey -v \
  -keystore mindbase-release.jks \
  -alias mindbase \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Store `mindbase-release.jks` somewhere safe (not committed to git).

### 2. Add signing config to `app/build.gradle.kts`
```kotlin
android {
    signingConfigs {
        create("release") {
            storeFile = file("../mindbase-release.jks")
            storePassword = System.getenv("KEYSTORE_PASSWORD")
            keyAlias = "mindbase"
            keyPassword = System.getenv("KEY_PASSWORD")
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = true  // Enable for Play Store
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
}
```

### 3. Build a release bundle
```bash
KEYSTORE_PASSWORD=... KEY_PASSWORD=... ./gradlew bundleRelease
```

Output: `app/build/outputs/bundle/release/app-release.aab`

Upload to Play Console → Internal testing track (recommended before production).

### 4. Before Play Store submission — tighten cleartext traffic
Remove `android:usesCleartextTraffic="true"` from `AndroidManifest.xml` (or set to `false`). Your server must be on HTTPS for production.

---

## Known issues

The following may require adjustment when you open this project in Android Studio, since this code was written without a live Android toolchain:

1. **`@ExperimentalGetImage` annotation in QRScannerScreen.kt** — CameraX's `imageProxy.image` accessor is experimental. The file uses `@androidx.annotation.OptIn(androidx.camera.core.ExperimentalGetImage::class)` on the composable. If the compiler still complains, add the same annotation at the call site or suppress with `@SuppressLint("UnsafeOptInUsageError")`.

2. **`mutableIntStateOf` availability** — requires Compose `1.5+`. The BOM `2024.10.00` includes Compose `1.7.x` so this is fine, but if you downgrade the BOM it may not resolve.

3. **`InboxScreen` creates its own `HttpClient`** — in a production app you would share a single client instance (e.g. via a ViewModel or a singleton). The current approach creates a new client per recomposition of the screen, which is wasteful. A `remember { }` wraps it, so it's only created once per screen lifecycle, but it won't be closed on screen disposal. For a production app, hoist the client into a ViewModel.

4. **`ShareReceiverActivity` uses `@Suppress("DEPRECATION")`** — `getParcelableExtra()` without a type parameter is deprecated in API 33+. The code handles both API levels with a conditional, but the suppression annotation is needed to silence the lint warning on the old path.

5. **Gradle wrapper jar** — not committed; must be generated before CLI builds work (see First-time setup above).

6. **`10.0.2.2` is emulator-specific** — this is the standard Android emulator alias for the host loopback. A real physical device on your LAN needs the actual LAN IP of the host running the server.
