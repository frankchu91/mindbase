import Foundation

struct APIClient {
    var serverURL: URL {
        URL(string: KeychainStore.load(key: "serverUrl") ?? "http://localhost:4321")!
    }
    var token: String? { KeychainStore.load(key: "token") }

    struct PairResponse: Decodable {
        let token: String
        let deviceId: String
    }

    func pair(code: String, name: String) async throws -> PairResponse {
        var req = URLRequest(url: serverURL.appendingPathComponent("/api/devices/pair"))
        req.httpMethod = "POST"
        req.addValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: Any] = [
            "code": code,
            "device_name": name,
            "device_type": "ios",
        ]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let txt = String(data: data, encoding: .utf8) ?? "unknown"
            throw NSError(domain: "MindBase", code: -1, userInfo: [NSLocalizedDescriptionKey: "Pair failed: \(txt)"])
        }
        return try JSONDecoder().decode(PairResponse.self, from: data)
    }

    enum CaptureType: String {
        case url, text, image, audio
    }

    func capture(
        type: CaptureType,
        url: String? = nil,
        title: String? = nil,
        text: String? = nil,
        note: String? = nil,
        fileURL: URL? = nil,
        clientDedupKey: String? = nil
    ) async throws {
        guard let token else {
            throw NSError(domain: "MindBase", code: -2, userInfo: [NSLocalizedDescriptionKey: "Not paired"])
        }
        var req = URLRequest(url: serverURL.appendingPathComponent("/api/capture"))
        req.httpMethod = "POST"
        req.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        var payload: [String: Any] = [
            "type": type.rawValue,
            "captured_via": "ios",
            "captured_at": ISO8601DateFormatter().string(from: Date()),
        ]
        if let url { payload["url"] = url }
        if let title { payload["title"] = title }
        if let text { payload["text"] = text }
        if let note { payload["note"] = note }
        if let clientDedupKey { payload["client_dedup_key"] = clientDedupKey }

        if let fileURL {
            let boundary = "----MB\(UUID().uuidString)"
            req.addValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
            var body = Data()
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"payload\"\r\n\r\n".data(using: .utf8)!)
            body.append(try JSONSerialization.data(withJSONObject: payload))
            body.append("\r\n--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(fileURL.lastPathComponent)\"\r\n\r\n".data(using: .utf8)!)
            body.append(try Data(contentsOf: fileURL))
            body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
            req.httpBody = body
        } else {
            req.addValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: payload)
        }

        let (data, resp) = try await URLSession.shared.data(for: req)
        let httpResp = resp as? HTTPURLResponse
        guard let httpResp, (200..<300).contains(httpResp.statusCode) else {
            let txt = String(data: data, encoding: .utf8) ?? "unknown"
            throw NSError(domain: "MindBase", code: -3, userInfo: [NSLocalizedDescriptionKey: "Capture failed (\(httpResp?.statusCode ?? 0)): \(txt)"])
        }
    }
}
