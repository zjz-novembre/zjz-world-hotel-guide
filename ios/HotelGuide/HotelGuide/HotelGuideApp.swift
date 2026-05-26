import SwiftUI

@main
struct HotelGuideApp: App {
    var body: some Scene {
        WindowGroup {
            HotelGuideRootView()
        }
    }
}

struct HotelGuideRootView: View {
    @StateObject private var previewStore = HotelPreviewStore()

    var body: some View {
        ZStack {
            HotelGuideWebView(previewStore: previewStore)
                .ignoresSafeArea()

            if let preview = previewStore.preview {
                NativeHotelPreview(hotel: preview) {
                    previewStore.dismiss()
                }
                .id(preview.id)
                .transition(.opacity.combined(with: .scale(scale: 0.96)))
            }
        }
        .animation(.spring(response: 0.34, dampingFraction: 0.86), value: previewStore.preview?.id)
    }
}
