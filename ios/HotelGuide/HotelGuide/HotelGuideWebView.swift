import SwiftUI
import WebKit

struct HotelGuideWebView: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.allowsInlineMediaPlayback = true
        configuration.setURLSchemeHandler(HotelGuideSchemeHandler(), forURLScheme: "hotelguide")

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.loadHotelGuide()
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}
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
