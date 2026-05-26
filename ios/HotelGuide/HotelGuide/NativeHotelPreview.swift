import SwiftUI
import UIKit

struct NativeHotelPreview: View {
    let hotel: HotelPreviewPayload
    let onDismiss: () -> Void

    @Namespace private var glassNamespace
    @State private var actionsEnabled = false
    @State private var appeared = false

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                Color.black
                    .opacity(appeared ? 0.22 : 0)
                    .background(.thinMaterial)
                    .ignoresSafeArea()
                    .onTapGesture {
                        dismiss()
                    }

                previewChrome(maxWidth: maxPreviewWidth(in: proxy.size))
                    .scaleEffect(appeared ? 1 : 0.92)
                    .opacity(appeared ? 1 : 0)
                    .position(x: proxy.size.width / 2, y: preferredY(in: proxy))
            }
            .onAppear {
                withAnimation(.spring(response: 0.38, dampingFraction: 0.82)) {
                    appeared = true
                }

                DispatchQueue.main.asyncAfter(deadline: .now() + 0.46) {
                    actionsEnabled = true
                }
            }
        }
    }

    @ViewBuilder
    private func previewChrome(maxWidth: CGFloat) -> some View {
        if #available(iOS 26.0, *) {
            GlassEffectContainer(spacing: HotelPreviewToken.glassSpacing) {
                VStack(spacing: HotelPreviewToken.stackSpacing) {
                    previewCard(maxWidth: maxWidth)
                        .glassEffectID("hotel-card-\(hotel.id)", in: glassNamespace)
                    actionBar(maxWidth: maxWidth)
                        .glassEffectID("hotel-actions-\(hotel.id)", in: glassNamespace)
                }
            }
        } else {
            VStack(spacing: HotelPreviewToken.stackSpacing) {
                previewCard(maxWidth: maxWidth)
                actionBar(maxWidth: maxWidth)
            }
        }
    }

    private func previewCard(maxWidth: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: HotelPreviewToken.cardGap) {
            ZStack(alignment: .bottomLeading) {
                HotelPreviewImage(source: hotel.hotelImageUrl, fallbackText: hotel.nameZh)
                    .frame(height: HotelPreviewToken.heroHeight)
                    .clipShape(RoundedRectangle(cornerRadius: HotelPreviewToken.heroRadius, style: .continuous))

                if !hotel.priceText.isEmpty {
                    Text(hotel.priceText)
                        .font(.system(size: 16, weight: .semibold, design: .rounded))
                        .foregroundStyle(.primary)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .glassSurface(cornerRadius: HotelPreviewToken.pillRadius, tint: .white.opacity(0.08), interactive: false)
                        .padding(12)
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                Text(hotel.nameZh)
                    .font(.system(size: 24, weight: .semibold, design: .rounded))
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)

                if hotel.nameEn != hotel.nameZh {
                    Text(hotel.nameEn)
                        .font(.system(size: 13, weight: .medium, design: .rounded))
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }

                if !hotel.brand.isEmpty || !hotel.city.isEmpty {
                    Text([hotel.brand, hotel.city].filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(.system(size: 13, weight: .medium, design: .rounded))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }

            if !hotel.description.isEmpty {
                Text(hotel.description)
                    .font(.system(size: 14, weight: .regular, design: .rounded))
                    .foregroundStyle(Color.primary.opacity(0.76))
                    .lineLimit(4)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if !roomItems.isEmpty {
                HStack(spacing: 10) {
                    ForEach(roomItems) { room in
                        HotelRoomTile(room: room)
                    }
                }
            }
        }
        .padding(HotelPreviewToken.cardPadding)
        .frame(width: maxWidth)
        .glassSurface(cornerRadius: HotelPreviewToken.cardRadius, tint: .white.opacity(0.08), interactive: false)
        .shadow(color: .black.opacity(0.18), radius: 34, y: 22)
    }

    @ViewBuilder
    private func actionBar(maxWidth: CGFloat) -> some View {
        if #available(iOS 26.0, *) {
            HStack(spacing: 10) {
                Button {
                    dismiss()
                } label: {
                    Label("关闭", systemImage: "xmark")
                }
            }
            .buttonStyle(.glass)
            .font(.system(size: 16, weight: .semibold, design: .rounded))
            .padding(8)
            .frame(width: maxWidth)
            .glassSurface(cornerRadius: HotelPreviewToken.actionRadius, tint: .white.opacity(0.05), interactive: true)
            .allowsHitTesting(actionsEnabled)
        } else {
            HStack(spacing: 10) {
                Button {
                    dismiss()
                } label: {
                    Label("关闭", systemImage: "xmark")
                }
            }
            .buttonStyle(.bordered)
            .font(.system(size: 16, weight: .semibold, design: .rounded))
            .padding(10)
            .frame(width: maxWidth)
            .glassSurface(cornerRadius: HotelPreviewToken.actionRadius, tint: .white.opacity(0.05), interactive: true)
            .allowsHitTesting(actionsEnabled)
        }
    }

    private var roomItems: [HotelPreviewRoom] {
        [
            HotelPreviewRoom(
                id: "standard",
                title: roomTitle(hotel.standardRoomName, fallback: "客房", imageUrl: hotel.standardRoomImageUrl, areaSqm: hotel.standardRoomAreaSqm),
                imageUrl: hotel.standardRoomImageUrl,
                areaSqm: hotel.standardRoomAreaSqm
            ),
            HotelPreviewRoom(
                id: "standardBathroom",
                title: roomTitle(hotel.standardBathroomName, fallback: "客房浴室", imageUrl: hotel.standardBathroomImageUrl, areaSqm: nil),
                imageUrl: hotel.standardBathroomImageUrl,
                areaSqm: nil
            ),
            HotelPreviewRoom(
                id: "suite",
                title: roomTitle(hotel.suiteRoomName, fallback: "套房", imageUrl: hotel.suiteRoomImageUrl, areaSqm: hotel.suiteRoomAreaSqm),
                imageUrl: hotel.suiteRoomImageUrl,
                areaSqm: hotel.suiteRoomAreaSqm
            ),
            HotelPreviewRoom(
                id: "suiteBathroom",
                title: roomTitle(hotel.suiteBathroomName, fallback: "套房浴室", imageUrl: hotel.suiteBathroomImageUrl, areaSqm: nil),
                imageUrl: hotel.suiteBathroomImageUrl,
                areaSqm: nil
            ),
        ].filter { $0.imageUrl != nil || $0.areaSqm != nil || !$0.title.isEmpty }
    }

    private func roomTitle(_ title: String?, fallback: String, imageUrl: String?, areaSqm: Double?) -> String {
        if let title, !title.isEmpty { return title }
        return imageUrl != nil || areaSqm != nil ? fallback : ""
    }

    private func dismiss() {
        withAnimation(.spring(response: 0.26, dampingFraction: 0.9)) {
            actionsEnabled = false
            appeared = false
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.16) {
            onDismiss()
        }
    }

    private func maxPreviewWidth(in size: CGSize) -> CGFloat {
        min(size.width - HotelPreviewToken.screenInset * 2, HotelPreviewToken.maxWidth)
    }

    private func preferredY(in proxy: GeometryProxy) -> CGFloat {
        let safeArea = proxy.safeAreaInsets
        let size = proxy.size
        let defaultY = size.height * 0.53
        let anchoredY: CGFloat

        if let anchor = hotel.anchor {
            anchoredY = anchor.midY < size.height * 0.5
                ? anchor.midY + HotelPreviewToken.anchorOffset
                : anchor.midY - HotelPreviewToken.anchorOffset
        } else {
            anchoredY = defaultY
        }

        let minY = safeArea.top + HotelPreviewToken.verticalClamp
        let maxY = size.height - safeArea.bottom - HotelPreviewToken.verticalClamp
        return min(max(anchoredY, minY), maxY)
    }
}

private struct HotelPreviewRoom: Identifiable {
    let id: String
    let title: String
    let imageUrl: String?
    let areaSqm: Double?
}

private struct HotelRoomTile: View {
    let room: HotelPreviewRoom

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HotelPreviewImage(source: room.imageUrl, fallbackText: room.title)
                .frame(height: HotelPreviewToken.roomImageHeight)
                .clipShape(RoundedRectangle(cornerRadius: HotelPreviewToken.roomRadius, style: .continuous))

            VStack(alignment: .leading, spacing: 3) {
                Text(room.title)
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .lineLimit(1)

                if let area = room.areaSqm {
                    Text("\(Int(area.rounded())) sqm")
                        .font(.system(size: 12, weight: .medium, design: .rounded))
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.primary.opacity(0.055), in: RoundedRectangle(cornerRadius: HotelPreviewToken.roomContainerRadius, style: .continuous))
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
            LinearGradient(
                colors: [
                    Color(red: 0.92, green: 0.91, blue: 0.88),
                    Color(red: 0.74, green: 0.77, blue: 0.74),
                    Color(red: 0.36, green: 0.42, blue: 0.40),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            Text(String(fallbackText.prefix(2)))
                .font(.system(size: 26, weight: .semibold, design: .rounded))
                .foregroundStyle(.white.opacity(0.86))
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
    static let actionRadius: CGFloat = 24
    static let anchorOffset: CGFloat = 236
    static let cardGap: CGFloat = 14
    static let cardPadding: CGFloat = 12
    static let cardRadius: CGFloat = 30
    static let glassSpacing: CGFloat = 18
    static let heroHeight: CGFloat = 204
    static let heroRadius: CGFloat = 24
    static let maxWidth: CGFloat = 372
    static let pillRadius: CGFloat = 18
    static let roomContainerRadius: CGFloat = 18
    static let roomImageHeight: CGFloat = 76
    static let roomRadius: CGFloat = 14
    static let screenInset: CGFloat = 18
    static let stackSpacing: CGFloat = 14
    static let verticalClamp: CGFloat = 286
}

private extension View {
    @ViewBuilder
    func glassSurface(cornerRadius: CGFloat, tint: Color, interactive: Bool) -> some View {
        if #available(iOS 26.0, *) {
            glassEffect(
                interactive ? Glass.regular.tint(tint).interactive() : Glass.regular.tint(tint),
                in: .rect(cornerRadius: cornerRadius)
            )
        } else {
            background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        }
    }
}
