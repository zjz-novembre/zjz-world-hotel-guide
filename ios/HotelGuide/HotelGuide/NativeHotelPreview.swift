import SwiftUI
import UIKit

struct NativeHotelPreview: View {
    let hotel: HotelPreviewPayload
    let onDismiss: () -> Void

    @Environment(\.openURL) private var openURL
    @Namespace private var glassNamespace
    @State private var appeared = false

    private var sourceURL: URL? {
        guard let sourceUrl = hotel.sourceUrl else { return nil }
        return URL(string: sourceUrl)
    }

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                Rectangle()
                    .fill(.black.opacity(appeared ? 0.08 : 0))
                    .ignoresSafeArea()
                    .onTapGesture {
                        dismiss()
                    }

                appleMusicStack(maxWidth: maxPreviewWidth(in: proxy.size))
                    .scaleEffect(appeared ? 1 : 0.96)
                    .opacity(appeared ? 1 : 0)
                    .position(x: proxy.size.width / 2, y: preferredY(in: proxy))
            }
            .onAppear {
                withAnimation(.spring(response: 0.34, dampingFraction: 0.86)) {
                    appeared = true
                }
            }
        }
    }

    @ViewBuilder
    private func appleMusicStack(maxWidth: CGFloat) -> some View {
        if #available(iOS 26.0, *) {
            GlassEffectContainer(spacing: HotelPreviewToken.stackSpacing) {
                VStack(spacing: HotelPreviewToken.stackSpacing) {
                    previewHeader(maxWidth: maxWidth)
                        .glassEffectID("hotel-preview-header-\(hotel.id)", in: glassNamespace)
                    menuPanel(maxWidth: maxWidth)
                        .glassEffectID("hotel-preview-menu-\(hotel.id)", in: glassNamespace)
                }
            }
        } else {
            VStack(spacing: HotelPreviewToken.stackSpacing) {
                previewHeader(maxWidth: maxWidth)
                menuPanel(maxWidth: maxWidth)
            }
        }
    }

    private func previewHeader(maxWidth: CGFloat) -> some View {
        Button {
            if let sourceURL {
                openURL(sourceURL)
            }
        } label: {
            HStack(spacing: 14) {
                HotelPreviewImage(source: hotel.hotelImageUrl, fallbackText: hotel.nameZh)
                    .frame(width: 84, height: 84)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

                VStack(alignment: .leading, spacing: 4) {
                    Text(hotel.nameZh)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(.primary)
                        .lineLimit(2)

                    if hotel.nameEn != hotel.nameZh {
                        Text(hotel.nameEn)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }

                    Text(headerMeta)
                        .font(.system(size: 13, weight: .regular))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Image(systemName: "chevron.right")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
            .padding(12)
            .frame(width: maxWidth)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .disabled(sourceURL == nil)
        .hotelGlass(cornerRadius: 30, interactive: sourceURL != nil)
    }

    private func menuPanel(maxWidth: CGFloat) -> some View {
        VStack(spacing: 0) {
            actionStrip
                .padding(.horizontal, 14)
                .padding(.top, 14)
                .padding(.bottom, 12)

            HotelPreviewDivider()

            ForEach(roomItems) { room in
                HotelPreviewMenuRow(
                    title: room.title,
                    subtitle: room.subtitle,
                    systemImage: room.systemImage,
                    imageUrl: room.imageUrl
                )
                HotelPreviewDivider()
            }

            if !hotel.description.isEmpty {
                HotelPreviewMenuRow(
                    title: "酒店介绍",
                    subtitle: hotel.description,
                    systemImage: "info.circle",
                    imageUrl: nil
                )
                HotelPreviewDivider()
            }

            if let sourceURL {
                Button {
                    openURL(sourceURL)
                } label: {
                    HotelPreviewMenuRow(
                        title: "官网",
                        subtitle: sourceURL.host ?? "",
                        systemImage: "safari",
                        imageUrl: nil,
                        showsChevron: true
                    )
                }
                .buttonStyle(.plain)
            }
        }
        .frame(width: maxWidth)
        .hotelGlass(cornerRadius: 30, interactive: true)
    }

    private var actionStrip: some View {
        HStack(spacing: 10) {
            Button {
                if let sourceURL {
                    openURL(sourceURL)
                }
            } label: {
                HotelPreviewActionLabel(title: "官网", systemImage: "safari")
            }
            .disabled(sourceURL == nil)

            Button {
                dismiss()
            } label: {
                HotelPreviewActionLabel(title: "关闭", systemImage: "xmark")
            }

            if let sourceURL {
                ShareLink(item: sourceURL) {
                    HotelPreviewActionLabel(title: "分享", systemImage: "square.and.arrow.up")
                }
            } else {
                HotelPreviewActionLabel(title: "分享", systemImage: "square.and.arrow.up")
                    .opacity(0.36)
            }
        }
        .hotelGlassButtonStyle()
    }

    private var headerMeta: String {
        [hotel.brand, hotel.city, hotel.priceText]
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }

    private var roomItems: [HotelPreviewRoom] {
        [
            HotelPreviewRoom(
                id: "standard",
                title: roomTitle(hotel.standardRoomName, fallback: "客房", imageUrl: hotel.standardRoomImageUrl, areaSqm: hotel.standardRoomAreaSqm),
                imageUrl: hotel.standardRoomImageUrl,
                areaSqm: hotel.standardRoomAreaSqm,
                systemImage: "bed.double"
            ),
            HotelPreviewRoom(
                id: "standardBathroom",
                title: roomTitle(hotel.standardBathroomName, fallback: "客房浴室", imageUrl: hotel.standardBathroomImageUrl, areaSqm: nil),
                imageUrl: hotel.standardBathroomImageUrl,
                areaSqm: nil,
                systemImage: "shower"
            ),
            HotelPreviewRoom(
                id: "suite",
                title: roomTitle(hotel.suiteRoomName, fallback: "套房", imageUrl: hotel.suiteRoomImageUrl, areaSqm: hotel.suiteRoomAreaSqm),
                imageUrl: hotel.suiteRoomImageUrl,
                areaSqm: hotel.suiteRoomAreaSqm,
                systemImage: "sofa"
            ),
            HotelPreviewRoom(
                id: "suiteBathroom",
                title: roomTitle(hotel.suiteBathroomName, fallback: "套房浴室", imageUrl: hotel.suiteBathroomImageUrl, areaSqm: nil),
                imageUrl: hotel.suiteBathroomImageUrl,
                areaSqm: nil,
                systemImage: "bathtub"
            ),
        ].filter { !$0.title.isEmpty }
    }

    private func roomTitle(_ title: String?, fallback: String, imageUrl: String?, areaSqm: Double?) -> String {
        if let title, !title.isEmpty { return title }
        return imageUrl != nil || areaSqm != nil ? fallback : ""
    }

    private func dismiss() {
        withAnimation(.spring(response: 0.24, dampingFraction: 0.9)) {
            appeared = false
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.14) {
            onDismiss()
        }
    }

    private func maxPreviewWidth(in size: CGSize) -> CGFloat {
        min(size.width - HotelPreviewToken.screenInset * 2, HotelPreviewToken.maxWidth)
    }

    private func preferredY(in proxy: GeometryProxy) -> CGFloat {
        let size = proxy.size
        let safeArea = proxy.safeAreaInsets
        let panelHeight: CGFloat = roomItems.isEmpty ? 310 : 430
        let defaultY = size.height * 0.5
        let anchoredY: CGFloat

        if let anchor = hotel.anchor {
            anchoredY = anchor.midY < size.height * 0.5
                ? anchor.midY + panelHeight * 0.34
                : anchor.midY - panelHeight * 0.34
        } else {
            anchoredY = defaultY
        }

        let minY = safeArea.top + panelHeight * 0.5 + 10
        let maxY = size.height - safeArea.bottom - panelHeight * 0.5 - 10
        return min(max(anchoredY, minY), maxY)
    }
}

private struct HotelPreviewRoom: Identifiable {
    let id: String
    let title: String
    let imageUrl: String?
    let areaSqm: Double?
    let systemImage: String

    var subtitle: String {
        guard let areaSqm else { return "" }
        return "\(Int(areaSqm.rounded())) sqm"
    }
}

private struct HotelPreviewActionLabel: View {
    let title: String
    let systemImage: String

    var body: some View {
        VStack(spacing: 5) {
            Image(systemName: systemImage)
                .font(.system(size: 19, weight: .semibold))
            Text(title)
                .font(.system(size: 12, weight: .medium))
        }
        .frame(maxWidth: .infinity, minHeight: 56)
        .contentShape(.rect)
    }
}

private struct HotelPreviewMenuRow: View {
    let title: String
    let subtitle: String
    let systemImage: String
    let imageUrl: String?
    var showsChevron = false

    var body: some View {
        HStack(spacing: 14) {
            if imageUrl != nil {
                HotelPreviewImage(source: imageUrl, fallbackText: title)
                    .frame(width: 44, height: 38)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            } else {
                Image(systemName: systemImage)
                    .font(.system(size: 19, weight: .regular))
                    .foregroundStyle(.primary)
                    .frame(width: 44, height: 38)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 16, weight: .regular))
                    .foregroundStyle(.primary)
                    .lineLimit(1)

                if !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.system(size: 12, weight: .regular))
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            if showsChevron {
                Image(systemName: "chevron.right")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
        .contentShape(.rect)
    }
}

private struct HotelPreviewDivider: View {
    var body: some View {
        Rectangle()
            .fill(.primary.opacity(0.08))
            .frame(height: 0.5)
            .padding(.leading, 76)
    }
}

private struct HotelPreviewImage: View {
    let source: String?
    let fallbackText: String

    var body: some View {
        Group {
            if let image = HotelPreviewImageLoader.localImage(for: source) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else if let url = HotelPreviewImageLoader.remoteURL(for: source) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    default:
                        placeholder
                    }
                }
            } else {
                placeholder
            }
        }
        .clipped()
    }

    private var placeholder: some View {
        ZStack {
            Rectangle()
                .fill(Color.secondary.opacity(0.14))

            Text(String(fallbackText.prefix(2)))
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(.secondary)
        }
    }
}

private enum HotelPreviewImageLoader {
    private static let cache = NSCache<NSString, UIImage>()

    static func localImage(for source: String?) -> UIImage? {
        guard let relativePath = localResourcePath(from: source),
              let resourceURL = Bundle.main.resourceURL
        else {
            return nil
        }

        let imageURL = resourceURL
            .appendingPathComponent("WebAssets", isDirectory: true)
            .appendingPathComponent(relativePath)
        let cacheKey = imageURL.path as NSString

        if let cached = cache.object(forKey: cacheKey) {
            return cached
        }

        guard let image = UIImage(contentsOfFile: imageURL.path) else {
            return nil
        }

        cache.setObject(image, forKey: cacheKey)
        return image
    }

    static func remoteURL(for source: String?) -> URL? {
        guard let source,
              let url = URL(string: source),
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https"
        else {
            return nil
        }

        return url
    }

    private static func localResourcePath(from source: String?) -> String? {
        guard let source = source?.trimmingCharacters(in: .whitespacesAndNewlines), !source.isEmpty else {
            return nil
        }

        if let url = URL(string: source), let scheme = url.scheme?.lowercased() {
            if scheme == "http" || scheme == "https" {
                return nil
            }

            if scheme == "hotelguide" {
                return trimmedLocalPath(url.path)
            }
        }

        return trimmedLocalPath(source)
    }

    private static func trimmedLocalPath(_ path: String) -> String? {
        var trimmed = (path.removingPercentEncoding ?? path)
            .trimmingCharacters(in: .whitespacesAndNewlines)

        while trimmed.hasPrefix("/") {
            trimmed.removeFirst()
        }

        return trimmed.isEmpty ? nil : trimmed
    }
}

private enum HotelPreviewToken {
    static let maxWidth: CGFloat = 336
    static let screenInset: CGFloat = 28
    static let stackSpacing: CGFloat = 12
}

private extension View {
    @ViewBuilder
    func hotelGlass(cornerRadius: CGFloat, interactive: Bool) -> some View {
        if #available(iOS 26.0, *) {
            let glass = interactive ? Glass.clear.interactive() : Glass.clear
            glassEffect(glass, in: .rect(cornerRadius: cornerRadius))
        } else {
            background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        }
    }

    @ViewBuilder
    func hotelGlassButtonStyle() -> some View {
        if #available(iOS 26.0, *) {
            buttonStyle(.glass(.clear))
        } else {
            buttonStyle(.borderless)
        }
    }
}
