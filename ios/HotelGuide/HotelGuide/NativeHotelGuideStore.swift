import CoreLocation
import Foundation
import SwiftUI

@MainActor
final class NativeHotelGuideStore: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published private(set) var dataset = NativeHotelDataset.empty
    @Published var filters = NativeHotelFilters()
    @Published var isListExpanded = true
    @Published private(set) var rankedHotels: [NativeRankedHotel] = []
    @Published private(set) var mapPayload: NativeHotelMapPayload?
    @Published private(set) var selectedId: String?
    @Published private(set) var loadError: String?

    private let locationManager = CLLocationManager()
    private var selectedMode: NativeHotelSelectionMode?
    private var userLocation: [Double]?

    override init() {
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    func load() async {
        guard dataset.hotels.isEmpty else { return }

        do {
            let nextDataset = try NativeHotelDataset.loadFromBundle()
            dataset = nextDataset
            if !nextDataset.provinces.contains(where: { $0.value == filters.province }) {
                filters.province = nextDataset.provinces.first?.value ?? NativeHotelFilters.defaultProvince
            }
            rebuildDerivedState()
        } catch {
            loadError = error.localizedDescription
        }
    }

    func requestUserLocation() {
        switch locationManager.authorizationStatus {
        case .notDetermined:
            locationManager.requestWhenInUseAuthorization()
        case .authorizedAlways, .authorizedWhenInUse:
            locationManager.startUpdatingLocation()
        default:
            break
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        requestUserLocation()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let coordinate = locations.last?.coordinate else { return }
        userLocation = [coordinate.longitude, coordinate.latitude]
        rebuildDerivedState()
        manager.stopUpdatingLocation()
    }

    func setProvince(_ value: String) {
        filters.province = value
        selectedId = nil
        selectedMode = nil
        rebuildDerivedState()
    }

    func setPriceBand(_ band: NativeHotelPriceBand) {
        filters.priceBand = band
        rebuildDerivedState()
    }

    func setCustomPriceMin(_ value: String) {
        filters.customPriceMin = value
        filters.priceBand = .custom
        rebuildDerivedState()
    }

    func setCustomPriceMax(_ value: String) {
        filters.customPriceMax = value
        filters.priceBand = .custom
        rebuildDerivedState()
    }

    func toggleChain(_ value: String) {
        if filters.chains.contains(value) {
            filters.chains.remove(value)
        } else {
            filters.chains.insert(value)
        }
        normalizeBrandsForSelectedChains()
        rebuildDerivedState()
    }

    func toggleBrand(_ value: String) {
        if filters.brands.contains(value) {
            filters.brands.remove(value)
        } else {
            filters.brands.insert(value)
        }
        rebuildDerivedState()
    }

    func selectHotel(_ id: String, mode: NativeHotelSelectionMode = .small) {
        selectedId = id
        selectedMode = mode
        rebuildDerivedState()
    }

    func clearSelection() {
        selectedId = nil
        selectedMode = nil
        rebuildDerivedState()
    }

    func previewPayload(for hotel: NativeHotel, anchor: PreviewAnchor?) -> HotelPreviewPayload? {
        HotelPreviewPayload(
            id: hotel.id,
            nameZh: hotel.nameZh,
            nameEn: hotel.nameEn,
            brand: hotel.displayBrand,
            city: hotel.displayCity,
            priceText: rateText(for: hotel),
            description: hotel.displayDescription,
            hotelImageUrl: hotel.hotelImageUrl,
            standardRoomName: hotel.standardRoomName,
            standardRoomImageUrl: hotel.standardRoomImageUrl,
            standardRoomAreaSqm: hotel.standardRoomAreaSqm,
            standardBathroomName: hotel.standardBathroomName,
            standardBathroomImageUrl: hotel.standardBathroomImageUrl,
            suiteRoomName: hotel.suiteRoomName,
            suiteRoomImageUrl: hotel.suiteRoomImageUrl,
            suiteRoomAreaSqm: hotel.suiteRoomAreaSqm,
            suiteBathroomName: hotel.suiteBathroomName,
            suiteBathroomImageUrl: hotel.suiteBathroomImageUrl,
            sourceUrl: hotel.sourceUrl,
            anchor: anchor
        )
    }

    func hotel(with id: String) -> NativeHotel? {
        dataset.hotels.first { $0.id == id }
    }

    func previewPayload(forHotelId id: String, anchor: PreviewAnchor?) -> HotelPreviewPayload? {
        guard let hotel = hotel(with: id) else { return nil }
        return previewPayload(for: hotel, anchor: anchor)
    }

    func rateText(for hotel: NativeHotel) -> String {
        guard let rate = hotel.averageRateTaxInclusiveLocal ?? hotel.averageRateLocal else {
            return "暂无"
        }

        let symbol = NativeHotelCurrency.symbol(for: hotel.averageRateCurrency)
        if rate >= 1000 {
            let value = rate / 1000
            return value >= 10
                ? "\(symbol)\(Int(value.rounded()))K"
                : "\(symbol)\(String(format: "%.1f", value))K"
        }

        return "\(symbol)\(Int(rate.rounded()))"
    }

    func distanceText(for rankedHotel: NativeRankedHotel) -> String {
        guard let distanceKm = rankedHotel.distanceKm else { return "" }
        if distanceKm < 1 {
            return "\(Int((distanceKm * 1000).rounded()))m"
        }
        if distanceKm < 100 {
            return "\(String(format: "%.1f", distanceKm))km"
        }
        return "\(Int(distanceKm.rounded()))km"
    }

    var selectedProvince: NativeProvinceOption {
        dataset.provinces.first(where: { $0.value == filters.province })
            ?? dataset.provinces.first
            ?? NativeProvinceOption.shanghai
    }

    var provinceLabel: String {
        selectedProvince.label
    }

    var priceLabel: String {
        switch filters.priceBand {
        case .custom:
            let minValue = filters.customPriceMin.trimmed
            let maxValue = filters.customPriceMax.trimmed
            if minValue.isEmpty && maxValue.isEmpty { return "价格" }
            if minValue.isEmpty { return "≤\(maxValue)" }
            if maxValue.isEmpty { return "≥\(minValue)" }
            return "\(minValue)-\(maxValue)"
        default:
            return filters.priceBand.title
        }
    }

    var chainLabel: String {
        guard !filters.chains.isEmpty else { return "集团" }
        if filters.chains.count == 1,
           let value = filters.chains.first,
           let chain = dataset.chains.first(where: { $0.value == value }) {
            return chain.displayLabel
        }
        return "\(filters.chains.count)集团"
    }

    var brandLabel: String {
        guard !filters.brands.isEmpty else { return "品牌" }
        if filters.brands.count == 1,
           let value = filters.brands.first,
           let brand = dataset.brands.first(where: { $0.value == value }) {
            return brand.displayLabel
        }
        return "\(filters.brands.count)品牌"
    }

    var visibleBrands: [NativeBrandOption] {
        if filters.chains.isEmpty { return dataset.brands }
        return dataset.brands.filter { filters.chains.contains($0.chain) }
    }

    private func rebuildDerivedState() {
        let province = selectedProvince
        let origin = userLocation ?? province.center
        let filtered = dataset.hotels.filter { hotel in
            hotel.province == province.value
                && priceMatches(hotel)
                && (filters.chains.isEmpty || filters.chains.contains(hotel.chain))
                && (filters.brands.isEmpty || filters.brands.contains(hotel.brandFilterValue))
        }

        rankedHotels = filtered
            .map { hotel in
                NativeRankedHotel(
                    hotel: hotel,
                    distanceKm: NativeHotelDistance.distanceKm(from: origin, to: hotel.position)
                )
            }
            .sorted { lhs, rhs in
                switch (lhs.distanceKm, rhs.distanceKm) {
                case let (.some(left), .some(right)) where abs(left - right) > 0.01:
                    return left < right
                case (.some, .none):
                    return true
                case (.none, .some):
                    return false
                default:
                    return lhs.hotel.displayName.localizedStandardCompare(rhs.hotel.displayName) == .orderedAscending
                }
            }

        if let selectedId, !rankedHotels.contains(where: { $0.hotel.id == selectedId }) {
            self.selectedId = nil
            selectedMode = nil
        }

        mapPayload = makeMapPayload(province: province)
    }

    private func makeMapPayload(province: NativeProvinceOption) -> NativeHotelMapPayload {
        return NativeHotelMapPayload(
            hotels: rankedHotels.compactMap(\.hotel.mapHotel),
            province: NativeHotelMapProvince(
                value: province.value,
                name: province.label,
                center: province.center,
                zoom: province.mapZoom
            ),
            camera: NativeHotelMapCamera(center: province.center, zoom: province.mapZoom),
            selectedId: selectedId,
            selectedMode: selectedMode?.rawValue,
            userLocation: userLocation.map { NativeHotelUserLocation(position: $0, heading: nil) },
            layout: nil
        )
    }

    private func priceMatches(_ hotel: NativeHotel) -> Bool {
        guard filters.priceBand != .all else { return true }
        guard let rate = hotel.averageRateTaxInclusiveLocal ?? hotel.averageRateLocal else { return false }

        switch filters.priceBand {
        case .all:
            return true
        case .custom:
            let minValue = Double(filters.customPriceMin.trimmed)
            let maxValue = Double(filters.customPriceMax.trimmed)
            if let minValue, rate < minValue { return false }
            if let maxValue, rate > maxValue { return false }
            return true
        case .under500:
            return rate <= 500
        case .fiveHundredToOneThousand:
            return rate > 500 && rate <= 1000
        case .oneThousandToFifteenHundred:
            return rate > 1000 && rate <= 1500
        case .overFifteenHundred:
            return rate > 1500
        }
    }

    private func normalizeBrandsForSelectedChains() {
        guard !filters.chains.isEmpty else { return }
        let allowedBrands = Set(dataset.brands.filter { filters.chains.contains($0.chain) }.map(\.value))
        filters.brands = filters.brands.filter { allowedBrands.contains($0) }
    }
}

struct NativeHotelDataset {
    let provinces: [NativeProvinceOption]
    let chains: [NativeChainOption]
    let brands: [NativeBrandOption]
    let hotels: [NativeHotel]

    static let empty = NativeHotelDataset(provinces: [], chains: [], brands: [], hotels: [])

    static func loadFromBundle() throws -> NativeHotelDataset {
        guard let url = Bundle.main.url(
            forResource: "hotels",
            withExtension: "json",
            subdirectory: "WebAssets"
        ) else {
            throw NativeHotelDatasetError.missingHotelsJSON
        }

        let data = try Data(contentsOf: url)
        let payload = try JSONDecoder().decode(NativeHotelJSONPayload.self, from: data)
        return NativeHotelDataset(
            provinces: payload.provinces,
            chains: payload.chains,
            brands: payload.brands,
            hotels: payload.hotels
        )
    }
}

private enum NativeHotelDatasetError: LocalizedError {
    case missingHotelsJSON

    var errorDescription: String? {
        "Missing bundled WebAssets/hotels.json"
    }
}

private struct NativeHotelJSONPayload: Decodable {
    let provinces: [NativeProvinceOption]
    let chains: [NativeChainOption]
    let brands: [NativeBrandOption]
    let hotels: [NativeHotel]
}

struct NativeProvinceOption: Decodable, Identifiable {
    let value: String
    let label: String
    let provinceName: String?
    let center: [Double]
    let mapZoom: Double

    var id: String { value }

    static let shanghai = NativeProvinceOption(
        value: NativeHotelFilters.defaultProvince,
        label: "上海",
        provinceName: "上海",
        center: [121.4791199614327, 31.226654443930652],
        mapZoom: 12.45
    )
}

struct NativeChainOption: Decodable, Identifiable {
    let value: String
    let label: String
    let labelZh: String?
    let labelEn: String?

    var id: String { value }
    var displayLabel: String { labelZh?.trimmedNilIfEmpty ?? label }
}

struct NativeBrandOption: Decodable, Identifiable {
    let value: String
    let label: String
    let labelZh: String?
    let labelEn: String?
    let chain: String

    var id: String { value }
    var displayLabel: String { labelZh?.trimmedNilIfEmpty ?? label }
}

struct NativeHotel: Decodable, Identifiable {
    let id: String
    let name: String?
    let nameZh: String?
    let nameEn: String?
    let chain: String
    let chainZh: String?
    let chainEn: String?
    let brand: String?
    let brandValue: String?
    let brandZh: String?
    let brandEn: String?
    let city: String?
    let province: String
    let provinceNameZh: String?
    let provinceName: String?
    let cityNameZh: String?
    let cityName: String?
    let position: [Double]?
    let averageRateLocal: Double?
    let averageRateCurrency: String?
    let averageRateTaxInclusiveLocal: Double?
    let descriptionZh: String?
    let descriptionEn: String?
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

    var displayName: String {
        nameZh?.trimmedNilIfEmpty ?? name?.trimmedNilIfEmpty ?? nameEn?.trimmedNilIfEmpty ?? id
    }

    var displayBrand: String {
        brandZh?.trimmedNilIfEmpty ?? brand?.trimmedNilIfEmpty ?? chainZh?.trimmedNilIfEmpty ?? chain
    }

    var displayCity: String {
        let provinceName = provinceNameZh?.trimmedNilIfEmpty ?? self.provinceName?.trimmedNilIfEmpty
        let cityName = cityNameZh?.trimmedNilIfEmpty ?? self.cityName?.trimmedNilIfEmpty
        return [provinceName, cityName]
            .compactMap { $0 }
            .removingDuplicates()
            .joined(separator: " ")
    }

    var displayDescription: String {
        descriptionZh?.trimmedNilIfEmpty ?? descriptionEn?.trimmedNilIfEmpty ?? ""
    }

    var brandFilterValue: String {
        brandValue?.trimmedNilIfEmpty ?? brand?.trimmedNilIfEmpty ?? displayBrand
    }

    var mapHotel: NativeHotelMapHotel? {
        guard let position, position.count == 2 else { return nil }
        return NativeHotelMapHotel(
            id: id,
            name: displayName,
            nameZh: nameZh?.trimmedNilIfEmpty ?? displayName,
            nameEn: nameEn?.trimmedNilIfEmpty ?? displayName,
            chain: chain,
            chainZh: chainZh?.trimmedNilIfEmpty ?? chain,
            brandZh: brandZh?.trimmedNilIfEmpty ?? displayBrand,
            logoFile: Self.logoFileByChain[chain],
            position: position
        )
    }

    private static let logoFileByChain: [String: String] = [
        "Accor": "accor-1.svg",
        "Four Seasons": "four-seasons.svg",
        "Hilton": "hilton.svg",
        "Hyatt": "hyatt-3-mark.png",
        "IHG Hotels & Resorts": "ihg-2.svg",
        "Marriott": "marriott-2-mark.png",
        "The Leading Hotels of the World": "lhw.svg",
    ]
}

struct NativeRankedHotel: Identifiable {
    let hotel: NativeHotel
    let distanceKm: Double?

    var id: String { hotel.id }
}

struct NativeHotelFilters {
    static let defaultProvince = "shanghai"

    var province = defaultProvince
    var priceBand = NativeHotelPriceBand.all
    var customPriceMin = ""
    var customPriceMax = ""
    var chains = Set<String>()
    var brands = Set<String>()
}

enum NativeHotelPriceBand: String, CaseIterable, Identifiable {
    case all
    case custom
    case under500
    case fiveHundredToOneThousand
    case oneThousandToFifteenHundred
    case overFifteenHundred

    var id: String { rawValue }

    var title: String {
        switch self {
        case .all:
            return "不限"
        case .custom:
            return "价格"
        case .under500:
            return "0-500"
        case .fiveHundredToOneThousand:
            return "500-1000"
        case .oneThousandToFifteenHundred:
            return "1000-1500"
        case .overFifteenHundred:
            return "1500+"
        }
    }
}

enum NativeHotelSelectionMode: String {
    case small
}

private enum NativeHotelCurrency {
    static func symbol(for currency: String?) -> String {
        switch currency?.uppercased() {
        case "HKD":
            return "HK$"
        case "MOP":
            return "MOP$"
        case "TWD":
            return "NT$"
        default:
            return "¥"
        }
    }
}

private enum NativeHotelDistance {
    static func distanceKm(from origin: [Double], to target: [Double]?) -> Double? {
        guard origin.count == 2, let target, target.count == 2 else { return nil }

        let lat1 = origin[1] * .pi / 180
        let lon1 = origin[0] * .pi / 180
        let lat2 = target[1] * .pi / 180
        let lon2 = target[0] * .pi / 180
        let dLat = lat2 - lat1
        let dLon = lon2 - lon1
        let a = sin(dLat / 2) * sin(dLat / 2)
            + cos(lat1) * cos(lat2) * sin(dLon / 2) * sin(dLon / 2)
        let c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return 6371 * c
    }
}

private extension Array where Element: Hashable {
    func removingDuplicates() -> [Element] {
        var seen = Set<Element>()
        return filter { seen.insert($0).inserted }
    }
}

private extension String {
    var trimmed: String {
        trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var trimmedNilIfEmpty: String? {
        let value = trimmed
        return value.isEmpty ? nil : value
    }
}
