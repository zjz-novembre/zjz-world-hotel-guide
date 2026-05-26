import SwiftUI

struct NativeHotelGuideChromeView: View {
    @ObservedObject var store: NativeHotelGuideStore
    @ObservedObject var previewStore: HotelPreviewStore

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .top) {
                VStack(spacing: NativeHotelGuideToken.filterRowGap) {
                    filterRow
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

                if let activeFilter = store.activeFilter {
                    Color.black.opacity(0.001)
                        .ignoresSafeArea()
                        .onTapGesture {
                            withAnimation(.spring(response: 0.24, dampingFraction: 0.9)) {
                                store.activeFilter = nil
                            }
                        }

                    NativeHotelFilterMenu(kind: activeFilter, store: store)
                        .frame(
                            width: min(proxy.size.width - NativeHotelGuideToken.screenPadding * 2, NativeHotelGuideToken.menuMaxWidth),
                            alignment: .top
                        )
                        .padding(.top, proxy.safeAreaInsets.top + NativeHotelGuideToken.menuTopPadding)
                        .transition(.opacity.combined(with: .scale(scale: 0.98, anchor: .top)))
                }
            }
        }
        .animation(.spring(response: 0.28, dampingFraction: 0.88), value: store.activeFilter?.id)
        .animation(.spring(response: 0.32, dampingFraction: 0.9), value: store.isListExpanded)
    }

    private var filterRow: some View {
        HStack(spacing: NativeHotelGuideToken.filterRowGap) {
            NativeHotelFilterChip(
                title: store.provinceLabel,
                systemImage: "map",
                isActive: store.activeFilter == .province
            ) {
                store.activeFilter = store.activeFilter == .province ? nil : .province
            }

            NativeHotelFilterChip(
                title: store.priceLabel,
                systemImage: "yensign",
                isActive: store.activeFilter == .price
            ) {
                store.activeFilter = store.activeFilter == .price ? nil : .price
            }

            NativeHotelFilterChip(
                title: store.chainLabel,
                systemImage: "diamond",
                isActive: store.activeFilter == .chain
            ) {
                store.activeFilter = store.activeFilter == .chain ? nil : .chain
            }

            NativeHotelFilterChip(
                title: store.brandLabel,
                systemImage: "tag",
                isActive: store.activeFilter == .brand
            ) {
                store.activeFilter = store.activeFilter == .brand ? nil : .brand
            }
        }
    }

    private func bottomListHeight(in proxy: GeometryProxy) -> CGFloat {
        store.isListExpanded
            ? min(proxy.size.height * 0.44, NativeHotelGuideToken.listMaxHeight)
            : NativeHotelGuideToken.collapsedListHeight
    }
}

private struct NativeHotelFilterChip: View {
    let title: String
    let systemImage: String
    let isActive: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: NativeHotelGuideToken.chipInnerGap) {
                Image(systemName: systemImage)
                    .font(.system(size: NativeHotelGuideToken.chipIconSize, weight: .semibold))
                    .frame(width: NativeHotelGuideToken.chipIconFrame, height: NativeHotelGuideToken.chipIconFrame)

                Text(title)
                    .font(.system(size: NativeHotelGuideToken.chipFontSize, weight: .semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.68)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .foregroundStyle(isActive ? Color.primary : Color.primary.opacity(0.9))
            .padding(.horizontal, NativeHotelGuideToken.chipHorizontalPadding)
            .frame(height: NativeHotelGuideToken.chipHeight)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity)
        .hotelGuideGlass(cornerRadius: NativeHotelGuideToken.chipRadius, interactive: true)
    }
}

private struct NativeHotelFilterMenu: View {
    let kind: NativeHotelFilterKind
    @ObservedObject var store: NativeHotelGuideStore
    @FocusState private var customPriceFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            switch kind {
            case .province:
                provinceMenu
            case .price:
                priceMenu
            case .chain:
                multiSelectMenu(options: store.dataset.chains, selected: store.filters.chains) { option in
                    store.toggleChain(option.value)
                }
            case .brand:
                multiSelectMenu(options: store.visibleBrands, selected: store.filters.brands) { option in
                    store.toggleBrand(option.value)
                }
            }
        }
        .padding(.vertical, NativeHotelGuideToken.menuVerticalPadding)
        .frame(maxHeight: NativeHotelGuideToken.menuMaxHeight)
        .hotelGuideGlass(cornerRadius: NativeHotelGuideToken.menuRadius, interactive: true)
    }

    private var provinceMenu: some View {
        ScrollView(showsIndicators: false) {
            LazyVStack(spacing: NativeHotelGuideToken.optionGap) {
                ForEach(store.dataset.provinces) { province in
                    NativeHotelOptionButton(
                        title: province.label,
                        isSelected: store.filters.province == province.value
                    ) {
                        store.setProvince(province.value)
                        store.activeFilter = nil
                    }
                }
            }
            .padding(.horizontal, NativeHotelGuideToken.menuHorizontalPadding)
        }
    }

    private var priceMenu: some View {
        ScrollView(showsIndicators: false) {
            LazyVStack(spacing: NativeHotelGuideToken.optionGap) {
                ForEach(NativeHotelPriceBand.allCases) { band in
                    if band == .custom {
                        NativeHotelCustomPriceRow(
                            isSelected: store.filters.priceBand == .custom,
                            minText: Binding(
                                get: { store.filters.customPriceMin },
                                set: { store.setCustomPriceMin($0) }
                            ),
                            maxText: Binding(
                                get: { store.filters.customPriceMax },
                                set: { store.setCustomPriceMax($0) }
                            ),
                            isFocused: $customPriceFocused
                        ) {
                            store.setPriceBand(.custom)
                            customPriceFocused = true
                        }
                    } else {
                        NativeHotelOptionButton(
                            title: band.title,
                            isSelected: store.filters.priceBand == band
                        ) {
                            store.setPriceBand(band)
                            store.activeFilter = nil
                        }
                    }
                }
            }
            .padding(.horizontal, NativeHotelGuideToken.menuHorizontalPadding)
        }
    }

    private func multiSelectMenu<Option: NativeHotelMenuOption>(
        options: [Option],
        selected: Set<String>,
        action: @escaping (Option) -> Void
    ) -> some View {
        ScrollView(showsIndicators: false) {
            LazyVStack(spacing: NativeHotelGuideToken.optionGap) {
                ForEach(options) { option in
                    NativeHotelOptionButton(
                        title: option.displayLabel,
                        isSelected: selected.contains(option.value)
                    ) {
                        action(option)
                    }
                }
            }
            .padding(.horizontal, NativeHotelGuideToken.menuHorizontalPadding)
        }
    }
}

private struct NativeHotelOptionButton: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: NativeHotelGuideToken.optionInnerGap) {
                Text(title)
                    .font(.system(size: NativeHotelGuideToken.optionFontSize, weight: .medium))
                    .lineLimit(1)
                    .minimumScaleFactor(0.78)
                    .frame(maxWidth: .infinity, alignment: .leading)

                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: NativeHotelGuideToken.optionCheckSize, weight: .semibold))
                    .foregroundStyle(isSelected ? Color.primary : Color.primary.opacity(0.34))
            }
            .padding(.horizontal, NativeHotelGuideToken.optionHorizontalPadding)
            .frame(height: NativeHotelGuideToken.optionHeight)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .background(
            Color.primary.opacity(isSelected ? 0.055 : 0.025),
            in: RoundedRectangle(cornerRadius: NativeHotelGuideToken.optionRadius, style: .continuous)
        )
    }
}

private struct NativeHotelCustomPriceRow: View {
    let isSelected: Bool
    @Binding var minText: String
    @Binding var maxText: String
    var isFocused: FocusState<Bool>.Binding
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: NativeHotelGuideToken.customPriceGap) {
                HStack(spacing: NativeHotelGuideToken.optionInnerGap) {
                    Text("价格")
                        .font(.system(size: NativeHotelGuideToken.optionFontSize, weight: .medium))
                        .frame(maxWidth: .infinity, alignment: .leading)

                    Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                        .font(.system(size: NativeHotelGuideToken.optionCheckSize, weight: .semibold))
                        .foregroundStyle(isSelected ? Color.primary : Color.primary.opacity(0.34))
                }

                if isSelected {
                    HStack(spacing: NativeHotelGuideToken.customFieldGap) {
                        NativeHotelPriceField(title: "最低", text: $minText, isFocused: isFocused)
                        NativeHotelPriceField(title: "最高", text: $maxText, isFocused: isFocused)
                    }
                }
            }
            .padding(.horizontal, NativeHotelGuideToken.optionHorizontalPadding)
            .padding(.vertical, isSelected ? NativeHotelGuideToken.customPricePadding : 0)
            .frame(minHeight: NativeHotelGuideToken.optionHeight)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .background(
            Color.primary.opacity(isSelected ? 0.055 : 0.025),
            in: RoundedRectangle(cornerRadius: NativeHotelGuideToken.optionRadius, style: .continuous)
        )
    }
}

private struct NativeHotelPriceField: View {
    let title: String
    @Binding var text: String
    var isFocused: FocusState<Bool>.Binding

    var body: some View {
        TextField(title, text: $text)
            .focused(isFocused)
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

private protocol NativeHotelMenuOption: Identifiable {
    var value: String { get }
    var displayLabel: String { get }
}

extension NativeChainOption: NativeHotelMenuOption {}
extension NativeBrandOption: NativeHotelMenuOption {}

private enum NativeHotelGuideToken {
    static let screenPadding: CGFloat = 12
    static let topPadding: CGFloat = 8
    static let bottomPadding: CGFloat = 10
    static let filterRowGap: CGFloat = 7
    static let chipHeight: CGFloat = 45
    static let chipRadius: CGFloat = 22.5
    static let chipHorizontalPadding: CGFloat = 10
    static let chipInnerGap: CGFloat = 4
    static let chipIconSize: CGFloat = 13
    static let chipIconFrame: CGFloat = 15
    static let chipFontSize: CGFloat = 13
    static let menuTopPadding: CGFloat = 64
    static let menuMaxWidth: CGFloat = 390
    static let menuMaxHeight: CGFloat = 430
    static let menuRadius: CGFloat = 28
    static let menuVerticalPadding: CGFloat = 10
    static let menuHorizontalPadding: CGFloat = 10
    static let optionGap: CGFloat = 6
    static let optionHeight: CGFloat = 44
    static let optionRadius: CGFloat = 16
    static let optionHorizontalPadding: CGFloat = 14
    static let optionInnerGap: CGFloat = 10
    static let optionFontSize: CGFloat = 15
    static let optionCheckSize: CGFloat = 18
    static let customPriceGap: CGFloat = 10
    static let customFieldGap: CGFloat = 8
    static let customPricePadding: CGFloat = 12
    static let priceFieldHeight: CGFloat = 38
    static let priceFieldRadius: CGFloat = 13
    static let priceFieldFontSize: CGFloat = 15
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
