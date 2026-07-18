import SwiftUI

struct PairingView: View {
    @State private var serverURL: String = KeychainStore.load(key: "serverUrl") ?? "http://localhost:4321"
    @State private var deviceName: String = UIDevice.current.name
    @State private var code: String = ""
    @State private var status: String = ""
    @State private var statusOk: Bool = false
    @State private var scanning: Bool = false
    @State private var working: Bool = false

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("Server") {
                    TextField("Server URL", text: $serverURL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                        .accessibilityIdentifier("server-url-field")
                }
                Section("Device") {
                    TextField("Device name", text: $deviceName)
                        .accessibilityIdentifier("device-name-field")
                }
                Section("Pair") {
                    HStack {
                        TextField("XXXX-XXXX", text: $code)
                            .textInputAutocapitalization(.characters)
                            .autocorrectionDisabled()
                            .monospaced()
                            .accessibilityIdentifier("pair-code-field")
                        Button {
                            scanning = true
                        } label: {
                            Image(systemName: "qrcode.viewfinder")
                        }
                    }
                    Button {
                        Task { await pair() }
                    } label: {
                        if working {
                            ProgressView()
                        } else {
                            Text("Pair this device")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(working || code.isEmpty || serverURL.isEmpty)
                    .accessibilityIdentifier("pair-submit-button")
                    if !status.isEmpty {
                        Text(status)
                            .font(.footnote)
                            .foregroundStyle(statusOk ? .green : .red)
                    }
                }
            }
            .navigationTitle("Pair MindBase")
            .navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $scanning) {
                QRScannerView { scanned in
                    code = scanned.uppercased()
                    scanning = false
                }
            }
        }
    }

    private func pair() async {
        working = true
        status = ""
        KeychainStore.save(key: "serverUrl", value: serverURL)
        do {
            let resp = try await APIClient().pair(code: code, name: deviceName)
            KeychainStore.save(key: "token", value: resp.token)
            KeychainStore.save(key: "deviceId", value: resp.deviceId)
            status = "✓ Paired"
            statusOk = true
            try? await Task.sleep(for: .seconds(0.8))
            dismiss()
        } catch {
            status = "✗ \(error.localizedDescription)"
            statusOk = false
        }
        working = false
    }
}

#Preview {
    PairingView()
}
