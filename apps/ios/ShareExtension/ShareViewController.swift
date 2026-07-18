import UIKit
import Social
import UniformTypeIdentifiers

class ShareViewController: SLComposeServiceViewController {

    override func isContentValid() -> Bool {
        // We accept anything the activation rule lets through.
        return true
    }

    override func didSelectPost() {
        // The note typed in the system share sheet is `contentText` (inherited).
        let note = contentText
        guard let item = extensionContext?.inputItems.first as? NSExtensionItem,
              let provider = item.attachments?.first else {
            extensionContext?.completeRequest(returningItems: nil)
            return
        }

        Task {
            do {
                if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    let raw = try await provider.loadItem(forTypeIdentifier: UTType.url.identifier)
                    if let url = raw as? URL {
                        try await APIClient().capture(
                            type: .url,
                            url: url.absoluteString,
                            title: extensionAppTitleHint() ?? url.host ?? "Shared link",
                            note: note?.isEmpty == false ? note : nil,
                            clientDedupKey: "share-ios:url:\(url.absoluteString)"
                        )
                    }
                } else if provider.hasItemConformingToTypeIdentifier(UTType.text.identifier) {
                    let raw = try await provider.loadItem(forTypeIdentifier: UTType.text.identifier)
                    if let text = raw as? String {
                        try await APIClient().capture(
                            type: .text,
                            title: extensionAppTitleHint(),
                            text: text,
                            note: note?.isEmpty == false ? note : nil,
                            clientDedupKey: "share-ios:text:\(text.prefix(64))"
                        )
                    }
                } else if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
                    let raw = try await provider.loadItem(forTypeIdentifier: UTType.image.identifier)
                    if let url = raw as? URL {
                        try await APIClient().capture(
                            type: .image,
                            title: "Shared image",
                            note: note?.isEmpty == false ? note : nil,
                            fileURL: url,
                            clientDedupKey: "share-ios:image:\(url.absoluteString)"
                        )
                    } else if let img = raw as? UIImage,
                              let data = img.pngData() {
                        let tmp = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString).png")
                        try? data.write(to: tmp)
                        try await APIClient().capture(
                            type: .image,
                            title: "Shared image",
                            note: note?.isEmpty == false ? note : nil,
                            fileURL: tmp,
                            clientDedupKey: "share-ios:image:\(UUID().uuidString)"
                        )
                        try? FileManager.default.removeItem(at: tmp)
                    }
                }
            } catch {
                // Swallow — the share extension should never throw to the system.
                // Errors will be visible in the inbox UI later.
                print("[MindBase Share] error: \(error.localizedDescription)")
            }
            extensionContext?.completeRequest(returningItems: nil)
        }
    }

    override func configurationItems() -> [Any]! {
        return []
    }

    private func extensionAppTitleHint() -> String? {
        // Use the extension item's title as a hint when available.
        guard let item = extensionContext?.inputItems.first as? NSExtensionItem else { return nil }
        if let attr = item.attributedTitle?.string, !attr.isEmpty { return attr }
        if let raw = item.attributedContentText?.string, !raw.isEmpty { return raw.prefix(80).description }
        return nil
    }
}
