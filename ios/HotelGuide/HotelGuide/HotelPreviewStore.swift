import CoreGraphics
import Combine
import SwiftUI

struct HotelPreviewPayload: Equatable, Identifiable {
    let id: String
    let nameZh: String
    let nameEn: String
    let brand: String
    let city: String
    let priceText: String
    let description: String
    let hotelImageUrl: String?
    let standardRoomName: String?
    let standardRoomImageUrl: String?
    let standardRoomAreaSqm: Double?
    let standardBathroomName: String?
    let standardBathroomImageUrl: String?
    let suiteRoomName: String?
    let suiteRoomImageUrl: String?
    let suiteRoomAreaSqm: Double?
    let suiteBathroomName: String?
    let suiteBathroomImageUrl: String?
    let sourceUrl: String?
    let anchor: PreviewAnchor?

    init?(
        id: String?,
        nameZh: String?,
        nameEn: String?,
        brand: String?,
        city: String?,
        priceText: String?,
        description: String?,
        hotelImageUrl: String?,
        standardRoomName: String?,
        standardRoomImageUrl: String?,
        standardRoomAreaSqm: Double?,
        standardBathroomName: String?,
        standardBathroomImageUrl: String?,
        suiteRoomName: String?,
        suiteRoomImageUrl: String?,
        suiteRoomAreaSqm: Double?,
        suiteBathroomName: String?,
        suiteBathroomImageUrl: String?,
        sourceUrl: String?,
        anchor: PreviewAnchor?
    ) {
        guard let id = id?.trimmedNilIfEmpty else {
            return nil
        }

        self.id = id
        self.nameZh = nameZh?.trimmedNilIfEmpty ?? nameEn?.trimmedNilIfEmpty ?? id
        self.nameEn = nameEn?.trimmedNilIfEmpty ?? nameZh?.trimmedNilIfEmpty ?? id
        self.brand = brand?.trimmedNilIfEmpty ?? ""
        self.city = city?.trimmedNilIfEmpty ?? ""
        self.priceText = priceText?.trimmedNilIfEmpty ?? ""
        self.description = description?.trimmedNilIfEmpty ?? ""
        self.hotelImageUrl = hotelImageUrl?.trimmedNilIfEmpty
        self.standardRoomName = standardRoomName?.trimmedNilIfEmpty
        self.standardRoomImageUrl = standardRoomImageUrl?.trimmedNilIfEmpty
        self.standardRoomAreaSqm = standardRoomAreaSqm
        self.standardBathroomName = standardBathroomName?.trimmedNilIfEmpty
        self.standardBathroomImageUrl = standardBathroomImageUrl?.trimmedNilIfEmpty
        self.suiteRoomName = suiteRoomName?.trimmedNilIfEmpty
        self.suiteRoomImageUrl = suiteRoomImageUrl?.trimmedNilIfEmpty
        self.suiteRoomAreaSqm = suiteRoomAreaSqm
        self.suiteBathroomName = suiteBathroomName?.trimmedNilIfEmpty
        self.suiteBathroomImageUrl = suiteBathroomImageUrl?.trimmedNilIfEmpty
        self.sourceUrl = sourceUrl?.trimmedNilIfEmpty
        self.anchor = anchor
    }

    init?(message: Any) {
        guard let dictionary = message as? [String: Any] else {
            return nil
        }

        self.init(
            id: dictionary.previewString("id"),
            nameZh: dictionary.previewString("nameZh"),
            nameEn: dictionary.previewString("nameEn"),
            brand: dictionary.previewString("brand"),
            city: dictionary.previewString("city"),
            priceText: dictionary.previewString("priceText"),
            description: dictionary.previewString("description"),
            hotelImageUrl: dictionary.previewString("hotelImageUrl"),
            standardRoomName: dictionary.previewString("standardRoomName"),
            standardRoomImageUrl: dictionary.previewString("standardRoomImageUrl"),
            standardRoomAreaSqm: dictionary.previewDouble("standardRoomAreaSqm"),
            standardBathroomName: dictionary.previewString("standardBathroomName"),
            standardBathroomImageUrl: dictionary.previewString("standardBathroomImageUrl"),
            suiteRoomName: dictionary.previewString("suiteRoomName"),
            suiteRoomImageUrl: dictionary.previewString("suiteRoomImageUrl"),
            suiteRoomAreaSqm: dictionary.previewDouble("suiteRoomAreaSqm"),
            suiteBathroomName: dictionary.previewString("suiteBathroomName"),
            suiteBathroomImageUrl: dictionary.previewString("suiteBathroomImageUrl"),
            sourceUrl: dictionary.previewString("sourceUrl"),
            anchor: PreviewAnchor(message: dictionary["anchor"])
        )
    }
}

struct PreviewAnchor: Equatable {
    let x: CGFloat
    let y: CGFloat
    let width: CGFloat
    let height: CGFloat

    var midY: CGFloat {
        y + height / 2
    }

    init?(message: Any?) {
        guard let dictionary = message as? [String: Any],
              let x = dictionary.previewDouble("x"),
              let y = dictionary.previewDouble("y"),
              let width = dictionary.previewDouble("width"),
              let height = dictionary.previewDouble("height")
        else {
            return nil
        }

        self.x = CGFloat(x)
        self.y = CGFloat(y)
        self.width = CGFloat(width)
        self.height = CGFloat(height)
    }
}

@MainActor
final class HotelPreviewStore: ObservableObject {
    @Published private(set) var preview: HotelPreviewPayload?

    func show(_ preview: HotelPreviewPayload) {
        self.preview = preview
    }

    func dismiss() {
        preview = nil
    }
}

private extension Dictionary where Key == String, Value == Any {
    func previewString(_ key: String) -> String? {
        self[key] as? String
    }

    func previewDouble(_ key: String) -> Double? {
        if let double = self[key] as? Double {
            return double
        }

        if let number = self[key] as? NSNumber {
            return number.doubleValue
        }

        if let string = self[key] as? String {
            return Double(string)
        }

        return nil
    }
}

private extension String {
    var trimmedNilIfEmpty: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
