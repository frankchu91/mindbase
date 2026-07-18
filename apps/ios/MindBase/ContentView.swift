import SwiftUI

struct ContentView: View {
    @State private var paired: Bool = KeychainStore.load(key: "token") != nil
    @State private var showingPairing: Bool = false

    var body: some View {
        TabView {
            VoiceRecorderView()
                .tabItem { Label("Voice", systemImage: "mic.fill") }

            InboxView()
                .tabItem { Label("Inbox", systemImage: "tray") }

            SettingsTab(paired: $paired, showingPairing: $showingPairing)
                .tabItem { Label("Settings", systemImage: "gear") }
        }
        .sheet(isPresented: $showingPairing) {
            PairingView()
                .onDisappear {
                    paired = KeychainStore.load(key: "token") != nil
                }
        }
        .onAppear {
            // Suppress auto-pairing sheet during UI tests so tab bar is reachable
            let isUITesting = CommandLine.arguments.contains("-UI_TESTING")
            if !paired && !isUITesting { showingPairing = true }
        }
    }
}

private struct SettingsTab: View {
    @Binding var paired: Bool
    @Binding var showingPairing: Bool

    var body: some View {
        NavigationStack {
            Form {
                Section("Pairing") {
                    HStack {
                        Text("Status")
                        Spacer()
                        Text(paired ? "✓ Paired" : "Not paired")
                            .foregroundStyle(paired ? .green : .secondary)
                    }
                    Button(paired ? "Re-pair this device" : "Pair this device") {
                        showingPairing = true
                    }
                    .accessibilityIdentifier("pair-device-button")
                    if paired {
                        Button("Unpair", role: .destructive) {
                            KeychainStore.delete(key: "token")
                            KeychainStore.delete(key: "deviceId")
                            paired = false
                        }
                    }
                }
                Section("About") {
                    HStack {
                        Text("Version")
                        Spacer()
                        Text("0.1.0").foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("Settings")
        }
    }
}

#Preview {
    ContentView()
}
