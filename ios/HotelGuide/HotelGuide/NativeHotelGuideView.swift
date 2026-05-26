import SwiftUI
import UIKit

struct NativeHotelGuideChromeView: View {
    @ObservedObject var store: NativeHotelGuideStore
    @ObservedObject var previewStore: HotelPreviewStore
    @State private var showsPriceEditor = false

    var body: some View {
        GeometryReader { proxy in
            VStack(spacing: NativeHotelGuideToken.topStackGap) {
                VStack(spacing: NativeHotelGuideToken.controlStackGap) {
                    NativeHotelGroupLogoStrip(store: store)
                    filterRow
                }
                .padding(.horizontal, NativeHotelGuideToken.screenPadding)
                .padding(.top, proxy.safeAreaInsets.top + NativeHotelGuideToken.topPadding)

                Spacer(minLength: 0)

                NativeHotelBottomList(
                    store: store,
                    previewStore: previewStore,
                    maxHeight: bottomListHeight(in: proxy)
                )
                .padding(.horizontal, NativeHotelGuideToken.screenPadding)
                .padding(.bottom, max(proxy.safeAreaInsets.bottom, NativeHotelGuideToken.bottomPadding))
            }
        }
        .sheet(isPresented: $showsPriceEditor) {
            NativeHotelPriceEditorSheet(store: store)
                .presentationDetents([.height(NativeHotelGuideToken.priceSheetHeight)])
                .presentationDragIndicator(.visible)
        }
        .animation(.spring(response: 0.32, dampingFraction: 0.9), value: store.isListExpanded)
    }

    private var filterRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: NativeHotelGuideToken.filterRowGap) {
                NativeHotelProvinceMenu(store: store)
                NativeHotelPriceMenu(store: store, showsPriceEditor: $showsPriceEditor)
                NativeHotelChainMenu(store: store)
                NativeHotelBrandMenu(store: store)
            }
            .padding(.vertical, NativeHotelGuideToken.filterRowVerticalPadding)
        }
    }

    private func bottomListHeight(in proxy: GeometryProxy) -> CGFloat {
        store.isListExpanded
            ? min(proxy.size.height * 0.44, NativeHotelGuideToken.listMaxHeight)
            : NativeHotelGuideToken.collapsedListHeight
    }
}

private struct NativeHotelGroupLogoStrip: View {
    @ObservedObject var store: NativeHotelGuideStore

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: NativeHotelGuideToken.logoGap) {
                ForEach(featuredChains) { chain in
                    Button {
                        store.toggleChain(chain.value)
                    } label: {
                        NativeHotelGroupLogoCircle(
                            chain: chain,
                            isSelected: store.filters.chains.contains(chain.value)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.vertical, NativeHotelGuideToken.logoRowVerticalPadding)
        }
        .frame(height: NativeHotelGuideToken.logoRowHeight)
    }

    private var featuredChains: [NativeChainOption] {
        let order = NativeHotelGroupLogoAsset.displayOrder
        return store.dataset.chains
            .filter { NativeHotelGroupLogoAsset.fileName(for: $0.value) != nil }
            .sorted { lhs, rhs in
                (order[lhs.value] ?? Int.max, lhs.displayLabel) < (order[rhs.value] ?? Int.max, rhs.displayLabel)
            }
    }
}

private struct NativeHotelGroupLogoCircle: View {
    let chain: NativeChainOption
    let isSelected: Bool

    var body: some View {
        ZStack {
            Circle()
                .fill(Color.white.opacity(isSelected ? 0.92 : 0.78))
                .overlay(
                    Circle()
                        .strokeBorder(Color.primary.opacity(isSelected ? 0.78 : 0.16), lineWidth: isSelected ? 1.4 : 0.8)
                )

            if let image = NativeHotelGroupLogoAsset.image(for: chain.value) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .padding(NativeHotelGroupLogoAsset.padding(for: chain.value))
            } else {
                Text(String(chain.displayLabel.prefix(1)))
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.primary)
            }
        }
        .frame(width: NativeHotelGuideToken.logoSize, height: NativeHotelGuideToken.logoSize)
        .shadow(color: .black.opacity(isSelected ? 0.14 : 0.07), radius: isSelected ? 10 : 7, y: 4)
        .scaleEffect(isSelected ? 1.04 : 1)
        .hotelGuideGlass(cornerRadius: NativeHotelGuideToken.logoSize / 2, interactive: true)
        .accessibilityLabel(chain.displayLabel)
    }
}

private struct NativeHotelProvinceMenu: View {
    @ObservedObject var store: NativeHotelGuideStore

    var body: some View {
        Menu {
            ForEach(store.dataset.provinces) { province in
                Button {
                    store.setProvince(province.value)
                } label: {
                    NativeHotelMenuLabel(title: province.label, isSelected: store.filters.province == province.value)
                }
            }
        } label: {
            NativeHotelFilterChip(title: store.provinceLabel, systemImage: "map")
        }
        .buttonStyle(.plain)
    }
}

private struct NativeHotelPriceMenu: View {
    @ObservedObject var store: NativeHotelGuideStore
    @Binding var showsPriceEditor: Bool

    var body: some View {
        Menu {
            ForEach(NativeHotelPriceBand.allCases) { band in
                if band == .custom {
                    Button {
                        store.setPriceBand(.custom)
                        showsPriceEditor = true
                    } label: {
                        NativeHotelMenuLabel(title: band.title, isSelected: store.filters.priceBand == band)
                    }
                } else {
                    Button {
                        store.setPriceBand(band)
                    } label: {
                        NativeHotelMenuLabel(title: band.title, isSelected: store.filters.priceBand == band)
                    }
                }
            }
        } label: {
            NativeHotelFilterChip(title: store.priceLabel, systemImage: "yensign.circle")
        }
        .buttonStyle(.plain)
    }
}

private struct NativeHotelChainMenu: View {
    @ObservedObject var store: NativeHotelGuideStore

    var body: some View {
        Menu {
            ForEach(store.dataset.chains) { chain in
                Toggle(
                    isOn: Binding(
                        get: { store.filters.chains.contains(chain.value) },
                        set: { _ in store.toggleChain(chain.value) }
                    )
                ) {
                    Text(chain.displayLabel)
                }
            }
        } label: {
            NativeHotelFilterChip(title: store.chainLabel, systemImage: "building.2")
        }
        .buttonStyle(.plain)
    }
}

private struct NativeHotelBrandMenu: View {
    @ObservedObject var store: NativeHotelGuideStore

    var body: some View {
        Menu {
            ForEach(store.visibleBrands) { brand in
                Toggle(
                    isOn: Binding(
                        get: { store.filters.brands.contains(brand.value) },
                        set: { _ in store.toggleBrand(brand.value) }
                    )
                ) {
                    Text(brand.displayLabel)
                }
            }
        } label: {
            NativeHotelFilterChip(title: store.brandLabel, systemImage: "seal")
        }
        .buttonStyle(.plain)
    }
}

private struct NativeHotelFilterChip: View {
    let title: String
    let systemImage: String

    var body: some View {
        HStack(spacing: NativeHotelGuideToken.chipInnerGap) {
            Image(systemName: systemImage)
                .font(.system(size: NativeHotelGuideToken.chipIconSize, weight: .semibold))
                .frame(width: NativeHotelGuideToken.chipIconFrame, height: NativeHotelGuideToken.chipIconFrame)

            Text(title)
                .font(.system(size: NativeHotelGuideToken.chipFontSize, weight: .semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.72)
        }
        .foregroundStyle(Color.primary.opacity(0.94))
        .padding(.horizontal, NativeHotelGuideToken.chipHorizontalPadding)
        .frame(height: NativeHotelGuideToken.chipHeight)
        .contentShape(.rect)
        .fixedSize(horizontal: true, vertical: false)
        .hotelGuideGlass(cornerRadius: NativeHotelGuideToken.chipRadius, interactive: true)
    }
}

private struct NativeHotelMenuLabel: View {
    let title: String
    let isSelected: Bool

    var body: some View {
        if isSelected {
            Label(title, systemImage: "checkmark")
        } else {
            Text(title)
        }
    }
}

private struct NativeHotelPriceEditorSheet: View {
    @ObservedObject var store: NativeHotelGuideStore
    @Environment(\.dismiss) private var dismiss
    @FocusState private var isFocused: Bool

    var body: some View {
        NavigationStack {
            VStack(spacing: NativeHotelGuideToken.priceEditorGap) {
                HStack(spacing: NativeHotelGuideToken.priceEditorFieldGap) {
                    NativeHotelPriceField(title: "最低", text: Binding(
                        get: { store.filters.customPriceMin },
                        set: { store.setCustomPriceMin($0) }
                    ))
                    .focused($isFocused)

                    NativeHotelPriceField(title: "最高", text: Binding(
                        get: { store.filters.customPriceMax },
                        set: { store.setCustomPriceMax($0) }
                    ))
                    .focused($isFocused)
                }

                Button {
                    store.setPriceBand(.custom)
                    dismiss()
                } label: {
                    Text("完成")
                        .font(.system(size: NativeHotelGuideToken.doneButtonFontSize, weight: .semibold))
                        .frame(maxWidth: .infinity)
                        .frame(height: NativeHotelGuideToken.doneButtonHeight)
                }
                .buttonStyle(.plain)
                .hotelGuideGlass(cornerRadius: NativeHotelGuideToken.doneButtonHeight / 2, interactive: true)
            }
            .padding(.horizontal, NativeHotelGuideToken.priceEditorPadding)
            .padding(.top, NativeHotelGuideToken.priceEditorTopPadding)
            .navigationTitle("价格")
            .navigationBarTitleDisplayMode(.inline)
        }
        .onAppear {
            store.setPriceBand(.custom)
            isFocused = true
        }
    }
}

private struct NativeHotelPriceField: View {
    let title: String
    @Binding var text: String

    var body: some View {
        TextField(title, text: $text)
            .keyboardType(.numberPad)
            .textFieldStyle(.plain)
            .font(.system(size: NativeHotelGuideToken.priceFieldFontSize, weight: .semibold))
            .multilineTextAlignment(.center)
            .frame(height: NativeHotelGuideToken.priceFieldHeight)
            .background(
                Color.primary.opacity(0.055),
                in: RoundedRectangle(cornerRadius: NativeHotelGuideToken.priceFieldRadius, style: .continuous)
            )
    }
}

private struct NativeHotelBottomList: View {
    @ObservedObject var store: NativeHotelGuideStore
    @ObservedObject var previewStore: HotelPreviewStore
    let maxHeight: CGFloat

    var body: some View {
        VStack(spacing: 0) {
            Button {
                store.isListExpanded.toggle()
            } label: {
                HStack {
                    Capsule()
                        .fill(Color.primary.opacity(0.22))
                        .frame(width: NativeHotelGuideToken.dragHandleWidth, height: NativeHotelGuideToken.dragHandleHeight)

                    Spacer(minLength: 0)

                    Image(systemName: store.isListExpanded ? "chevron.down" : "chevron.up")
                        .font(.system(size: NativeHotelGuideToken.listChevronSize, weight: .semibold))
                }
                .padding(.horizontal, NativeHotelGuideToken.listHorizontalPadding)
                .frame(height: NativeHotelGuideToken.listHeaderHeight)
                .contentShape(.rect)
            }
            .buttonStyle(.plain)

            if store.isListExpanded {
                ScrollView(showsIndicators: false) {
                    LazyVStack(spacing: NativeHotelGuideToken.rowGap) {
                        ForEach(store.rankedHotels.prefix(NativeHotelGuideToken.maxVisibleRows)) { rankedHotel in
                            NativeHotelCompactRow(
                                rankedHotel: rankedHotel,
                                rateText: store.rateText(for: rankedHotel.hotel),
                                distanceText: store.distanceText(for: rankedHotel)
                            ) { anchor in
                                store.selectHotel(rankedHotel.hotel.id)
                                if let payload = store.previewPayload(for: rankedHotel.hotel, anchor: anchor) {
                                    previewStore.show(payload)
                                }
                            } onSelect: {
                                store.selectHotel(rankedHotel.hotel.id)
                            }
                        }
                    }
                    .padding(.horizontal, NativeHotelGuideToken.listHorizontalPadding)
                    .padding(.bottom, NativeHotelGuideToken.listBottomPadding)
                }
            }
        }
        .frame(maxHeight: maxHeight)
        .hotelGuideGlass(cornerRadius: NativeHotelGuideToken.listRadius, interactive: true)
    }
}

private struct NativeHotelCompactRow: View {
    let rankedHotel: NativeRankedHotel
    let rateText: String
    let distanceText: String
    let onPreview: (PreviewAnchor?) -> Void
    let onSelect: () -> Void

    @State private var frameInScreen = CGRect.zero

    var body: some View {
        Button(action: onSelect) {
            HStack(spacing: NativeHotelGuideToken.rowInnerGap) {
                HotelPreviewImage(source: rankedHotel.hotel.hotelImageUrl, fallbackText: rankedHotel.hotel.displayName)
                    .frame(width: NativeHotelGuideToken.hotelImageSize, height: NativeHotelGuideToken.hotelImageSize)
                    .clipShape(RoundedRectangle(cornerRadius: NativeHotelGuideToken.rowImageRadius, style: .continuous))

                VStack(alignment: .leading, spacing: NativeHotelGuideToken.rowTextGap) {
                    Text(rankedHotel.hotel.displayName)
                        .font(.system(size: NativeHotelGuideToken.rowTitleSize, weight: .semibold))
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)

                    Text(rowMeta)
                        .font(.system(size: NativeHotelGuideToken.rowMetaSize, weight: .medium))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Text(rateText)
                    .font(.system(size: NativeHotelGuideToken.rowRateSize, weight: .bold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)
                    .frame(width: NativeHotelGuideToken.rateWidth, alignment: .trailing)

                roomThumb
            }
            .padding(.horizontal, NativeHotelGuideToken.rowHorizontalPadding)
            .frame(height: NativeHotelGuideToken.rowHeight)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .background(
            Color.primary.opacity(0.035),
            in: RoundedRectangle(cornerRadius: NativeHotelGuideToken.rowRadius, style: .continuous)
        )
        .background(
            GeometryReader { proxy in
                Color.clear
                    .onAppear {
                        frameInScreen = proxy.frame(in: .global)
                    }
                    .onChange(of: proxy.frame(in: .global)) { _, newValue in
                        frameInScreen = newValue
                    }
            }
        )
        .onLongPressGesture(minimumDuration: NativeHotelGuideToken.longPressDuration) {
            onPreview(frameInScreen == .zero ? nil : PreviewAnchor(rect: frameInScreen))
        }
    }

    private var rowMeta: String {
        [rankedHotel.hotel.displayBrand, distanceText]
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }

    @ViewBuilder
    private var roomThumb: some View {
        VStack(spacing: NativeHotelGuideToken.roomThumbGap) {
            HotelPreviewImage(
                source: rankedHotel.hotel.standardRoomImageUrl,
                fallbackText: rankedHotel.hotel.standardRoomName ?? rankedHotel.hotel.displayName
            )
            .frame(width: NativeHotelGuideToken.roomImageWidth, height: NativeHotelGuideToken.roomImageHeight)
            .clipShape(RoundedRectangle(cornerRadius: NativeHotelGuideToken.roomImageRadius, style: .continuous))

            Text(roomAreaText)
                .font(.system(size: NativeHotelGuideToken.roomAreaSize, weight: .medium))
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .frame(width: NativeHotelGuideToken.roomThumbWidth)
    }

    private var roomAreaText: String {
        guard let area = rankedHotel.hotel.standardRoomAreaSqm else { return "" }
        return "\(Int(area.rounded()))㎡"
    }
}

private enum NativeHotelGroupLogoAsset {
    static let displayOrder: [String: Int] = [
        "Marriott": 0,
        "Hyatt": 1,
        "Hilton": 2,
        "IHG Hotels & Resorts": 3,
        "Accor": 4,
        "Four Seasons": 5,
        "The Leading Hotels of the World": 6,
    ]

    private static let fileNames: [String: String] = [
        "Accor": "accor-1.png",
        "Four Seasons": "four-seasons.png",
        "Hilton": "hilton.png",
        "Hyatt": "hyatt-3-mark.png",
        "IHG Hotels & Resorts": "ihg-2.png",
        "Marriott": "marriott-2-mark.png",
        "The Leading Hotels of the World": "lhw.png",
    ]

    private static let cache = NSCache<NSString, UIImage>()

    static func fileName(for chain: String) -> String? {
        fileNames[chain]
    }

    static func image(for chain: String) -> UIImage? {
        guard let fileName = fileName(for: chain) else { return nil }
        if let cached = cache.object(forKey: fileName as NSString) { return cached }

        let baseName = (fileName as NSString).deletingPathExtension
        guard
            let url = Bundle.main.url(
                forResource: baseName,
                withExtension: "png",
                subdirectory: "WebAssets/logos/hotel-groups/native"
            ),
            let image = UIImage(contentsOfFile: url.path)
        else {
            return nil
        }

        cache.setObject(image, forKey: fileName as NSString)
        return image
    }

    static func padding(for chain: String) -> CGFloat {
        switch chain {
        case "Hyatt":
            return 6
        case "Hilton", "Marriott":
            return 7
        case "The Leading Hotels of the World":
            return 4
        default:
            return 8
        }
    }
}

private enum NativeHotelGuideToken {
    static let screenPadding: CGFloat = 12
    static let topPadding: CGFloat = 8
    static let bottomPadding: CGFloat = 10
    static let topStackGap: CGFloat = 8
    static let controlStackGap: CGFloat = 6
    static let filterRowGap: CGFloat = 8
    static let filterRowVerticalPadding: CGFloat = 2
    static let logoRowHeight: CGFloat = 52
    static let logoRowVerticalPadding: CGFloat = 3
    static let logoGap: CGFloat = 10
    static let logoSize: CGFloat = 44
    static let chipHeight: CGFloat = 52
    static let chipRadius: CGFloat = 26
    static let chipHorizontalPadding: CGFloat = 14
    static let chipInnerGap: CGFloat = 6
    static let chipIconSize: CGFloat = 16
    static let chipIconFrame: CGFloat = 18
    static let chipFontSize: CGFloat = 14
    static let priceSheetHeight: CGFloat = 236
    static let priceEditorGap: CGFloat = 18
    static let priceEditorFieldGap: CGFloat = 10
    static let priceEditorPadding: CGFloat = 22
    static let priceEditorTopPadding: CGFloat = 18
    static let doneButtonHeight: CGFloat = 48
    static let doneButtonFontSize: CGFloat = 16
    static let priceFieldHeight: CGFloat = 48
    static let priceFieldRadius: CGFloat = 16
    static let priceFieldFontSize: CGFloat = 16
    static let listMaxHeight: CGFloat = 390
    static let collapsedListHeight: CGFloat = 58
    static let listRadius: CGFloat = 28
    static let listHeaderHeight: CGFloat = 40
    static let listHorizontalPadding: CGFloat = 10
    static let listBottomPadding: CGFloat = 12
    static let dragHandleWidth: CGFloat = 36
    static let dragHandleHeight: CGFloat = 4
    static let listChevronSize: CGFloat = 15
    static let rowGap: CGFloat = 8
    static let rowHeight: CGFloat = 76
    static let rowRadius: CGFloat = 18
    static let rowInnerGap: CGFloat = 10
    static let rowHorizontalPadding: CGFloat = 8
    static let hotelImageSize: CGFloat = 58
    static let rowImageRadius: CGFloat = 14
    static let rowTextGap: CGFloat = 3
    static let rowTitleSize: CGFloat = 15
    static let rowMetaSize: CGFloat = 12
    static let rowRateSize: CGFloat = 15
    static let rateWidth: CGFloat = 58
    static let roomThumbWidth: CGFloat = 58
    static let roomThumbGap: CGFloat = 3
    static let roomImageWidth: CGFloat = 54
    static let roomImageHeight: CGFloat = 42
    static let roomImageRadius: CGFloat = 11
    static let roomAreaSize: CGFloat = 10
    static let maxVisibleRows = 240
    static let longPressDuration = 0.35
}

private extension View {
    @ViewBuilder
    func hotelGuideGlass(cornerRadius: CGFloat, interactive: Bool) -> some View {
        if #available(iOS 26.0, *) {
            let glass = interactive ? Glass.clear.interactive() : Glass.clear
            glassEffect(glass, in: .rect(cornerRadius: cornerRadius))
        } else {
            background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        }
    }
}
