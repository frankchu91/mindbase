import SwiftUI
import AVFoundation

struct VoiceRecorderView: View {
    @State private var recorder: AVAudioRecorder?
    @State private var isRecording = false
    @State private var status = ""
    @State private var statusOk = false
    @State private var elapsed: TimeInterval = 0
    @State private var startTime: Date?
    @State private var timer: Timer?

    var body: some View {
        VStack(spacing: 24) {
            Text("Voice Memo")
                .font(.title2)
                .bold()

            if isRecording {
                Text(timeString(elapsed))
                    .font(.system(.largeTitle, design: .monospaced))
                    .foregroundStyle(.red)
            }

            Button(action: toggle) {
                Image(systemName: isRecording ? "stop.circle.fill" : "mic.circle.fill")
                    .resizable()
                    .frame(width: 120, height: 120)
                    .foregroundStyle(isRecording ? .red : .accentColor)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("mic-record-button")
            .accessibilityLabel(isRecording ? "Stop recording" : "Start recording")

            if !status.isEmpty {
                Text(status)
                    .foregroundStyle(statusOk ? .green : .red)
            }

            Text(isRecording ? "Tap to stop and upload" : "Tap to record")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .padding()
    }

    private func toggle() {
        if isRecording { stop() } else { start() }
    }

    private func start() {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString).m4a")
        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: 44_100,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue,
        ]
        do {
            try AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
            try AVAudioSession.sharedInstance().setActive(true)
            let r = try AVAudioRecorder(url: url, settings: settings)
            r.record()
            recorder = r
            isRecording = true
            startTime = Date()
            timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { _ in
                if let start = startTime { elapsed = Date().timeIntervalSince(start) }
                if elapsed > 120 { stop() } // 2 minute hard cap
            }
            status = ""
        } catch {
            status = "✗ \(error.localizedDescription)"
            statusOk = false
        }
    }

    private func stop() {
        guard let r = recorder else { return }
        r.stop()
        timer?.invalidate()
        timer = nil
        let url = r.url
        recorder = nil
        isRecording = false
        startTime = nil
        elapsed = 0
        try? AVAudioSession.sharedInstance().setActive(false)

        Task {
            status = "Uploading…"
            statusOk = false
            do {
                try await APIClient().capture(
                    type: .audio,
                    fileURL: url,
                    clientDedupKey: "voice:ios:\(UUID().uuidString)"
                )
                status = "✓ Saved to inbox"
                statusOk = true
            } catch {
                status = "✗ \(error.localizedDescription)"
                statusOk = false
            }
            // clean up the temp file regardless
            try? FileManager.default.removeItem(at: url)
        }
    }

    private func timeString(_ t: TimeInterval) -> String {
        let total = Int(t)
        let m = total / 60, s = total % 60
        return String(format: "%d:%02d", m, s)
    }
}

#Preview {
    VoiceRecorderView()
}
