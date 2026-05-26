import SwiftUI
import WebKit

struct HotelGuideWebView: UIViewRepresentable {
    @ObservedObject var mapStore: NativeHotelMapStore
    @ObservedObject var previewStore: HotelPreviewStore

    func makeCoordinator() -> Coordinator {
        Coordinator(previewStore: previewStore, mapStore: mapStore)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.allowsInlineMediaPlayback = true
        configuration.setURLSchemeHandler(HotelGuideSchemeHandler(), forURLScheme: "hotelguide")

        let userContentController = WKUserContentController()
        userContentController.add(context.coordinator, name: "hotelMap")
        userContentController.add(context.coordinator, name: "hotelPreview")
        userContentController.addUserScript(
            WKUserScript(
                source: """
                window.__HOTEL_GUIDE_NATIVE_PREVIEW__ = true;
                window.__HOTEL_GUIDE_NATIVE_MAP__ = true;
                """,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
        )
        configuration.userContentController = userContentController

        let webView = PassthroughHotelGuideWebView(frame: .zero, configuration: configuration)
        webView.mapStore = mapStore
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        mapStore.attach(webView: webView)
        webView.loadHotelGuide()
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "hotelMap")
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "hotelPreview")
        coordinator.detach()
    }

    final class Coordinator: NSObject, WKScriptMessageHandler {
        private let mapStore: NativeHotelMapStore
        private let previewStore: HotelPreviewStore

        init(previewStore: HotelPreviewStore, mapStore: NativeHotelMapStore) {
            self.previewStore = previewStore
            self.mapStore = mapStore
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            if message.name == "hotelMap" {
                Task { @MainActor in
                    mapStore.update(from: message.body)
                }
                return
            }

            if message.name == "hotelPreview", let preview = HotelPreviewPayload(message: message.body) {
                Task { @MainActor in
                    previewStore.show(preview)
                }
            }
        }

        func detach() {
            Task { @MainActor in
                mapStore.attach(webView: nil)
            }
        }
    }
}

final class PassthroughHotelGuideWebView: WKWebView {
    weak var mapStore: NativeHotelMapStore?

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        let hitView = super.hitTest(point, with: event)
        guard hitView != nil, mapStore?.shouldRouteTouchToNativeMap(at: point) == true else {
            return hitView
        }

        return nil
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
