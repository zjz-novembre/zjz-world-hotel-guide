import Foundation
import UniformTypeIdentifiers
import WebKit

final class HotelGuideSchemeHandler: NSObject, WKURLSchemeHandler {
    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard
            let url = urlSchemeTask.request.url,
            let fileURL = fileURL(for: url),
            let data = try? Data(contentsOf: fileURL)
        else {
            urlSchemeTask.didFailWithError(URLError(.fileDoesNotExist))
            return
        }

        let response = HTTPURLResponse(
            url: url,
            statusCode: 200,
            httpVersion: "HTTP/1.1",
            headerFields: [
                "Content-Type": mimeType(for: fileURL),
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-store"
            ]
        )!
        urlSchemeTask.didReceive(response)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}

    private func fileURL(for url: URL) -> URL? {
        let relativePath = normalizedPath(url.path)
        guard !relativePath.isEmpty, !relativePath.contains("..") else { return nil }
        return Bundle.main.resourceURL?
            .appendingPathComponent("WebAssets", isDirectory: true)
            .appendingPathComponent(relativePath)
    }

    private func normalizedPath(_ path: String) -> String {
        let trimmed = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return trimmed.isEmpty ? "index.html" : trimmed
    }

    private func mimeType(for fileURL: URL) -> String {
        if let type = UTType(filenameExtension: fileURL.pathExtension),
           let mimeType = type.preferredMIMEType {
            return mimeType
        }

        switch fileURL.pathExtension.lowercased() {
        case "js":
            return "text/javascript"
        case "json":
            return "application/json"
        case "svg":
            return "image/svg+xml"
        case "woff2":
            return "font/woff2"
        default:
            return "application/octet-stream"
        }
    }
}
