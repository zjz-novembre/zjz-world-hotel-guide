import AMapFoundationKit
import MAMapKit
import SwiftUI

@main
struct HotelGuideApp: App {
    init() {
        MAMapView.updatePrivacyShow(.didShow, privacyInfo: .didContain)
        MAMapView.updatePrivacyAgree(.didAgree)
        AMapServices.shared().apiKey = "8924dbb00daef3035dc6a5872f425efb"
    }

    var body: some Scene {
        WindowGroup {
            HotelGuideRootView()
        }
    }
}

struct HotelGuideRootView: View {
    @StateObject private var mapStore = NativeHotelMapStore()
    @StateObject private var previewStore = HotelPreviewStore()

    var body: some View {
        ZStack {
            NativeHotelMapView(mapStore: mapStore)
                .ignoresSafeArea()

            HotelGuideWebView(mapStore: mapStore, previewStore: previewStore)
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
