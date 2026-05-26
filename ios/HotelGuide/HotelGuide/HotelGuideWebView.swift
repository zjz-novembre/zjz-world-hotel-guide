import SwiftUI
import WebKit

struct HotelGuideWebView: UIViewRepresentable {
    @ObservedObject var previewStore: HotelPreviewStore

    func makeCoordinator() -> Coordinator {
        Coordinator(previewStore: previewStore)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.allowsInlineMediaPlayback = true
        configuration.setURLSchemeHandler(HotelGuideSchemeHandler(), forURLScheme: "hotelguide")

        let userContentController = WKUserContentController()
        userContentController.add(context.coordinator, name: "hotelPreview")
        userContentController.addUserScript(
            WKUserScript(
                source: "window.__HOTEL_GUIDE_NATIVE_PREVIEW__ = true;",
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
        )
        configuration.userContentController = userContentController

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.loadHotelGuide()
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "hotelPreview")
    }

    final class Coordinator: NSObject, WKScriptMessageHandler {
        private let previewStore: HotelPreviewStore

        init(previewStore: HotelPreviewStore) {
            self.previewStore = previewStore
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == "hotelPreview", let preview = HotelPreviewPayload(message: message.body) else {
                return
            }

            Task { @MainActor in
                previewStore.show(preview)
            }
        }
    }
}

private extension WKWebView {
    func loadHotelGuide() {
        guard let indexURL = URL(string: "hotelguide://app/index.html") else {
            loadHTMLString("<html><body></body></html>", baseURL: nil)
            return
        }

        load(URLRequest(url: indexURL))
    }
}
