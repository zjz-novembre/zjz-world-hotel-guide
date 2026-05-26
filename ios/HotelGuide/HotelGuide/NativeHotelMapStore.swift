import CoreGraphics
import CoreLocation
import Foundation
import WebKit

@MainActor
final class NativeHotelMapStore: ObservableObject {
    @Published private(set) var payload: NativeHotelMapPayload?

    private weak var webView: WKWebView?

    func attach(webView: WKWebView?) {
        self.webView = webView
    }

    func update(from message: Any) {
        guard
            JSONSerialization.isValidJSONObject(message),
            let data = try? JSONSerialization.data(withJSONObject: message),
            let payload = try? JSONDecoder().decode(NativeHotelMapPayload.self, from: data)
        else {
            return
        }

        self.payload = payload
    }

    func selectHotel(_ hotelId: String) {
        if var nextPayload = payload {
            nextPayload.selectedId = hotelId
            payload = nextPayload
        }

        evaluateMapCallback(name: "__HOTEL_GUIDE_NATIVE_MAP_SELECT__", argument: hotelId)
    }

    func clearSelection() {
        if var nextPayload = payload {
            nextPayload.selectedId = nil
            nextPayload.selectedMode = nil
            payload = nextPayload
        }

        webView?.evaluateJavaScript("window.__HOTEL_GUIDE_NATIVE_MAP_CLEAR__?.();")
    }

    func shouldRouteTouchToNativeMap(at point: CGPoint) -> Bool {
        guard let layout = payload?.layout else { return false }
        guard layout.mapRect.cgRect.contains(point) else { return false }
        return !layout.blockedRects.contains { $0.cgRect.contains(point) }
    }

    private func evaluateMapCallback(name: String, argument: String) {
        guard
            let data = try? JSONEncoder().encode(argument),
            let literal = String(data: data, encoding: .utf8)
        else {
            return
        }

        webView?.evaluateJavaScript("window.\(name)?.(\(literal));")
    }
}

struct NativeHotelMapPayload: Decodable {
    var hotels: [NativeHotelMapHotel]
    var province: NativeHotelMapProvince
    var camera: NativeHotelMapCamera
    var selectedId: String?
    var selectedMode: String?
    var userLocation: NativeHotelUserLocation?
    var layout: NativeHotelMapLayout?
}

struct NativeHotelMapHotel: Decodable {
    var id: String
    var name: String
    var nameZh: String
    var nameEn: String
    var chain: String
    var chainZh: String
    var brandZh: String
    var logoFile: String?
    var position: [Double]

    var coordinate: CLLocationCoordinate2D? {
        guard position.count == 2 else { return nil }
        return CLLocationCoordinate2D(latitude: position[1], longitude: position[0])
    }

    var displayName: String {
        if !nameZh.isEmpty { return nameZh }
        if !name.isEmpty { return name }
        return nameEn
    }

    var nativeLogoFile: String? {
        guard let logoFile else { return nil }
        return (logoFile as NSString).deletingPathExtension + ".png"
    }
}

struct NativeHotelMapProvince: Decodable {
    var value: String
    var name: String
    var center: [Double]
    var zoom: Double

    var coordinate: CLLocationCoordinate2D {
        guard center.count == 2 else {
            return CLLocationCoordinate2D(latitude: 31.2286, longitude: 121.4746)
        }

        return CLLocationCoordinate2D(latitude: center[1], longitude: center[0])
    }
}

struct NativeHotelMapCamera: Decodable {
    var center: [Double]
    var zoom: Double

    var coordinate: CLLocationCoordinate2D {
        guard center.count == 2 else {
            return CLLocationCoordinate2D(latitude: 31.2286, longitude: 121.4746)
        }

        return CLLocationCoordinate2D(latitude: center[1], longitude: center[0])
    }
}

struct NativeHotelUserLocation: Decodable {
    var position: [Double]
    var heading: Double?

    var coordinate: CLLocationCoordinate2D? {
        guard position.count == 2 else { return nil }
        return CLLocationCoordinate2D(latitude: position[1], longitude: position[0])
    }
}

struct NativeHotelMapLayout: Decodable {
    var mapRect: NativeHotelMapRect
    var blockedRects: [NativeHotelMapRect]
}

struct NativeHotelMapRect: Decodable {
    var x: Double
    var y: Double
    var width: Double
    var height: Double

    var cgRect: CGRect {
        CGRect(x: x, y: y, width: width, height: height)
    }
}
