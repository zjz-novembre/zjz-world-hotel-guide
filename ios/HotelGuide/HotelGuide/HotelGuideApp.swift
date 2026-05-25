import SwiftUI

@main
struct HotelGuideApp: App {
    var body: some Scene {
        WindowGroup {
            HotelGuideWebView()
                .ignoresSafeArea()
        }
    }
}
