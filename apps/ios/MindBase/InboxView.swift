import SwiftUI

struct InboxView: View {
    @State private var entries: [InboxEntry] = []
    @State private var loading = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                if let error {
                    Text(error).foregroundStyle(.red)
                }
                if entries.isEmpty && !loading {
                    Text("Inbox is empty.")
                        .foregroundStyle(.secondary)
                        .listRowBackground(Color.clear)
                }
                ForEach(entries) { e in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            statusBadge(e.status)
                            Text(e.type).font(.caption).foregroundStyle(.secondary)
                            Text(e.captured_via).font(.caption).foregroundStyle(.secondary)
                        }
                        Text(e.title ?? e.url ?? "(no title)").font(.body).lineLimit(2)
                        if let err = e.error {
                            Text(err).font(.caption).foregroundStyle(.red).lineLimit(2)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
            .navigationTitle("Inbox")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await load() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                }
            }
            .refreshable { await load() }
            .task { await load() }
        }
    }

    @ViewBuilder
    private func statusBadge(_ status: String) -> some View {
        let color: Color = {
            switch status {
            case "queued": return .yellow
            case "processing": return .blue
            case "compiled": return .green
            case "failed": return .red
            default: return .gray
            }
        }()
        Text(status)
            .font(.caption2)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color.opacity(0.2))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }

    private func load() async {
        // Skip network during UI testing so empty state is immediately visible
        guard !CommandLine.arguments.contains("-UI_TESTING") else { return }
        loading = true
        defer { loading = false }
        do {
            let url = APIClient().serverURL.appendingPathComponent("/api/inbox")
            let (data, _) = try await URLSession.shared.data(from: url)
            let resp = try JSONDecoder().decode(InboxResponse.self, from: data)
            entries = resp.entries
            error = nil
        } catch let e {
            error = "Failed to load: \(e.localizedDescription)"
        }
    }
}

private struct InboxResponse: Decodable {
    let entries: [InboxEntry]
}

struct InboxEntry: Identifiable, Decodable {
    let id: String
    let type: String
    let url: String?
    let title: String?
    let status: String
    let captured_at: String
    let captured_via: String
    let error: String?
    let wiki_slug: String?
}

#Preview {
    InboxView()
}
