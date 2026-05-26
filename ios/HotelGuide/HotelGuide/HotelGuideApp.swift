import SwiftUI
import AMapFoundationKit
import MAMapKit

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
    @StateObject private var guideStore = NativeHotelGuideStore()
    @StateObject private var previewStore = HotelPreviewStore()

    var body: some View {
        ZStack {
            NativeHotelMapView(mapStore: mapStore)
                .ignoresSafeArea()

            NativeHotelGuideChromeView(store: guideStore, previewStore: previewStore)

            if let preview = previewStore.preview {
                NativeHotelPreview(hotel: preview) {
                    previewStore.dismiss()
                }
                .id(preview.id)
                .transition(.opacity.combined(with: .scale(scale: 0.96)))
            }
        }
        .task {
            await guideStore.load()
            guideStore.requestUserLocation()
        }
        .onAppear {
            mapStore.onSelectHotel = { hotelId in
                guideStore.selectHotel(hotelId)
            }
            mapStore.onClearSelection = {
                guideStore.clearSelection()
            }
            mapStore.onPreviewHotel = { hotelId, anchor in
                guideStore.selectHotel(hotelId)
                if let payload = guideStore.previewPayload(forHotelId: hotelId, anchor: anchor) {
                    previewStore.show(payload)
                }
            }
        }
        .onReceive(guideStore.$mapPayload) { payload in
            mapStore.setPayload(payload)
        }
        .preferredColorScheme(.light)
        .animation(.spring(response: 0.34, dampingFraction: 0.86), value: previewStore.preview?.id)
    }
}
