#if !targetEnvironment(simulator)
import CoreLocation
import MAMapKit
import SwiftUI
import UIKit

struct NativeHotelMapView: UIViewRepresentable {
    @ObservedObject var mapStore: NativeHotelMapStore

    func makeCoordinator() -> Coordinator {
        Coordinator(mapStore: mapStore)
    }

    func makeUIView(context: Context) -> MAMapView {
        let mapView = MAMapView(frame: .zero)
        mapView.delegate = context.coordinator
        mapView.showsCompass = false
        mapView.showsScale = false
        mapView.isRotateEnabled = false
        mapView.isRotateCameraEnabled = false
        mapView.logoCenter = CGPoint(x: -1000, y: -1000)
        mapView.minZoomLevel = 3
        mapView.maxZoomLevel = 20
        mapView.showsUserLocation = false
        configureCustomStyle(on: mapView)
        context.coordinator.attach(mapView)
        return mapView
    }

    func updateUIView(_ mapView: MAMapView, context: Context) {
        context.coordinator.apply(payload: mapStore.payload, to: mapView)
    }

    static func dismantleUIView(_ uiView: MAMapView, coordinator: Coordinator) {
        uiView.delegate = nil
    }

    private func configureCustomStyle(on mapView: MAMapView) {
        let options = MAMapCustomStyleOptions()
        if let styleURL = Bundle.main.url(
            forResource: "style",
            withExtension: "data",
            subdirectory: "MapStyle"
        ),
           let styleData = try? Data(contentsOf: styleURL) {
            options.styleData = styleData
        }

        if let extraURL = Bundle.main.url(
            forResource: "style_extra",
            withExtension: "data",
            subdirectory: "MapStyle"
        ),
           let extraData = try? Data(contentsOf: extraURL) {
            options.styleExtraData = extraData
        }

        mapView.setCustomMapStyleOptions(options)
        mapView.customMapStyleEnabled = true
    }

    final class Coordinator: NSObject, MAMapViewDelegate {
        private let mapStore: NativeHotelMapStore
        private weak var mapView: MAMapView?
        private var hotelAnnotations: [String: NativeHotelAnnotation] = [:]
        private var hotelAnnotationKey = ""
        private var currentSelectedId: String?
        private var userLocationAnnotation: NativeUserLocationAnnotation?
        private var isApplyingSelection = false

        init(mapStore: NativeHotelMapStore) {
            self.mapStore = mapStore
        }

        func attach(_ mapView: MAMapView) {
            self.mapView = mapView
        }

        func apply(payload: NativeHotelMapPayload?, to mapView: MAMapView) {
            guard let payload else { return }

            currentSelectedId = payload.selectedId
            syncHotels(payload.hotels, in: mapView)
            syncUserLocation(payload.userLocation, in: mapView)
            syncCamera(payload.camera, in: mapView)
            syncSelection(selectedId: payload.selectedId, in: mapView)
        }

        func mapView(_ mapView: MAMapView!, viewFor annotation: MAAnnotation!) -> MAAnnotationView! {
            if annotation is MAUserLocation { return nil }

            if let hotelAnnotation = annotation as? NativeHotelAnnotation {
                let reuseIdentifier = "NativeHotelAnnotationView"
                let annotationView: NativeHotelAnnotationView
                if let reusableView = mapView.dequeueReusableAnnotationView(withIdentifier: reuseIdentifier) as? NativeHotelAnnotationView {
                    annotationView = reusableView
                } else {
                    annotationView = NativeHotelAnnotationView(annotation: annotation, reuseIdentifier: reuseIdentifier)
                }
                annotationView.annotation = annotation
                annotationView.configure(
                    hotel: hotelAnnotation.hotel,
                    selected: hotelAnnotation.hotel.id == currentSelectedId
                )
                return annotationView
            }

            if annotation is NativeUserLocationAnnotation {
                let reuseIdentifier = "NativeUserLocationAnnotationView"
                let annotationView: NativeUserLocationAnnotationView
                if let reusableView = mapView.dequeueReusableAnnotationView(withIdentifier: reuseIdentifier) as? NativeUserLocationAnnotationView {
                    annotationView = reusableView
                } else {
                    annotationView = NativeUserLocationAnnotationView(annotation: annotation, reuseIdentifier: reuseIdentifier)
                }
                annotationView.annotation = annotation
                return annotationView
            }

            return nil
        }

        func mapView(_ mapView: MAMapView!, didSelect view: MAAnnotationView!) {
            guard !isApplyingSelection, let annotation = view.annotation as? NativeHotelAnnotation else { return }
            Task { @MainActor in
                mapStore.selectHotel(annotation.hotel.id)
            }
        }

        func mapView(_ mapView: MAMapView!, didSingleTappedAt coordinate: CLLocationCoordinate2D) {
            Task { @MainActor in
                mapStore.clearSelection()
            }
        }

        private func syncHotels(_ hotels: [NativeHotelMapHotel], in mapView: MAMapView) {
            let nextKey = hotels
                .compactMap { hotel -> String? in
                    guard hotel.coordinate != nil else { return nil }
                    return "\(hotel.id):\(hotel.position.map { String(format: "%.6f", $0) }.joined(separator: ","))"
                }
                .joined(separator: "|")
            guard nextKey != hotelAnnotationKey else { return }

            if !hotelAnnotations.isEmpty {
                mapView.removeAnnotations(Array(hotelAnnotations.values))
            }

            hotelAnnotations = Dictionary(
                uniqueKeysWithValues: hotels.compactMap { hotel in
                    guard let coordinate = hotel.coordinate else { return nil }
                    let annotation = NativeHotelAnnotation(hotel: hotel)
                    annotation.coordinate = coordinate
                    annotation.title = hotel.displayName
                    return (hotel.id, annotation)
                }
            )
            hotelAnnotationKey = nextKey
            mapView.addAnnotations(Array(hotelAnnotations.values))
        }

        private func syncUserLocation(_ userLocation: NativeHotelUserLocation?, in mapView: MAMapView) {
            if let current = userLocationAnnotation {
                mapView.removeAnnotation(current)
                userLocationAnnotation = nil
            }

            guard let coordinate = userLocation?.coordinate else { return }
            let annotation = NativeUserLocationAnnotation()
            annotation.coordinate = coordinate
            userLocationAnnotation = annotation
            mapView.addAnnotation(annotation)
        }

        private func syncCamera(_ camera: NativeHotelMapCamera, in mapView: MAMapView) {
            let nextZoom = CGFloat(camera.zoom)
            if abs(mapView.zoomLevel - nextZoom) > 0.01 {
                mapView.setZoomLevel(nextZoom, animated: true)
            }

            let current = mapView.centerCoordinate
            let next = camera.coordinate
            if abs(current.latitude - next.latitude) > 0.00001 || abs(current.longitude - next.longitude) > 0.00001 {
                mapView.setCenter(next, animated: true)
            }
        }

        private func syncSelection(selectedId: String?, in mapView: MAMapView) {
            isApplyingSelection = true
            defer { isApplyingSelection = false }

            hotelAnnotations.values.forEach { annotation in
                guard annotation.hotel.id != selectedId else { return }
                mapView.deselectAnnotation(annotation, animated: true)
            }

            guard let selectedId, let annotation = hotelAnnotations[selectedId] else { return }
            mapView.selectAnnotation(annotation, animated: true)
        }
    }
}

private final class NativeHotelAnnotation: MAPointAnnotation {
    let hotel: NativeHotelMapHotel

    init(hotel: NativeHotelMapHotel) {
        self.hotel = hotel
        super.init()
    }
}

private final class NativeUserLocationAnnotation: MAPointAnnotation {}

private final class NativeHotelAnnotationView: MAAnnotationView {
    private let hostingController = UIHostingController(
        rootView: NativeHotelMarkerHost(hotel: nil, selected: false)
    )
    private var currentHotel: NativeHotelMapHotel?

    override init!(annotation: MAAnnotation!, reuseIdentifier: String!) {
        super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)
        canShowCallout = false
        backgroundColor = .clear
        hostingController.view.backgroundColor = .clear
        hostingController.view.isUserInteractionEnabled = false
        addSubview(hostingController.view)
    }

    required init?(coder: NSCoder) {
        nil
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        hostingController.view.frame = bounds
    }

    func configure(hotel: NativeHotelMapHotel, selected: Bool) {
        currentHotel = hotel
        let layout = NativeHotelMarkerLayout.layout(for: hotel, selected: selected)
        bounds = CGRect(origin: .zero, size: layout.size)
        centerOffset = layout.centerOffset
        hostingController.view.frame = bounds
        hostingController.rootView = NativeHotelMarkerHost(hotel: hotel, selected: selected)
        zIndex = selected ? 10000 : 30
    }

    override func setSelected(_ selected: Bool, animated: Bool) {
        super.setSelected(selected, animated: animated)
        if let currentHotel {
            configure(hotel: currentHotel, selected: selected)
        }
    }
}

private final class NativeUserLocationAnnotationView: MAAnnotationView {
    private let dotView = UIView()

    override init!(annotation: MAAnnotation!, reuseIdentifier: String!) {
        super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)
        bounds = CGRect(x: 0, y: 0, width: 18, height: 18)
        backgroundColor = .clear
        dotView.frame = bounds
        dotView.backgroundColor = UIColor(red: 0.10, green: 0.45, blue: 1.0, alpha: 0.92)
        dotView.layer.cornerRadius = 9
        dotView.layer.borderColor = UIColor.white.cgColor
        dotView.layer.borderWidth = 3
        addSubview(dotView)
        zIndex = 999
    }

    required init?(coder: NSCoder) {
        nil
    }
}

private struct NativeHotelMarkerHost: View {
    let hotel: NativeHotelMapHotel?
    let selected: Bool

    var body: some View {
        let layout = NativeHotelMarkerLayout.layout(for: hotel, selected: selected)
        ZStack(alignment: .topLeading) {
            if let hotel {
                if let tagCenter = layout.tagCenter {
                    NativeHotelSmallTag(name: hotel.displayName)
                        .position(tagCenter)
                        .zIndex(1)
                }

                NativeHotelPinBadge(hotel: hotel, selected: selected)
                    .position(layout.pinCenter)
                    .zIndex(2)
            }
        }
        .frame(width: layout.size.width, height: layout.size.height)
    }
}

private struct NativeHotelMarkerLayout {
    static let pinSize: CGFloat = 29.59375
    static let pinContainerSize: CGFloat = 44
    static let tagGap: CGFloat = 5
    static let tagTextMaxWidth: CGFloat = 152
    static let tagFontSize: CGFloat = 12.8
    static let tagHorizontalPadding: CGFloat = 12
    static let tagVerticalPadding: CGFloat = 8

    let size: CGSize
    let pinCenter: CGPoint
    let tagCenter: CGPoint?

    var centerOffset: CGPoint {
        let pinBottom = CGPoint(x: pinCenter.x, y: pinCenter.y + Self.pinSize / 2)
        return CGPoint(
            x: size.width / 2 - pinBottom.x,
            y: size.height / 2 - pinBottom.y
        )
    }

    static func layout(for hotel: NativeHotelMapHotel?, selected: Bool) -> NativeHotelMarkerLayout {
        guard let hotel, selected else {
            return NativeHotelMarkerLayout(
                size: CGSize(width: pinContainerSize, height: pinContainerSize),
                pinCenter: CGPoint(x: pinContainerSize / 2, y: pinContainerSize / 2),
                tagCenter: nil
            )
        }

        let tagWidth = smallTagWidth(for: hotel.displayName)
        let visualPinRight = pinSize
        let size = CGSize(
            width: visualPinRight + tagGap + tagWidth,
            height: pinContainerSize
        )
        let pinCenter = CGPoint(x: pinSize / 2, y: size.height / 2)
        let tagCenter = CGPoint(
            x: visualPinRight + tagGap + tagWidth / 2,
            y: size.height / 2
        )
        return NativeHotelMarkerLayout(size: size, pinCenter: pinCenter, tagCenter: tagCenter)
    }

    static func smallTagWidth(for name: String) -> CGFloat {
        smallTagTextWidth(for: name) + tagHorizontalPadding * 2
    }

    static func smallTagTextWidth(for name: String) -> CGFloat {
        let font = UIFont.systemFont(ofSize: tagFontSize, weight: .semibold)
        let measured = (name as NSString).boundingRect(
            with: CGSize(width: CGFloat.greatestFiniteMagnitude, height: tagFontSize * 1.4),
            options: [.usesLineFragmentOrigin, .usesFontLeading],
            attributes: [.font: font],
            context: nil
        ).width
        return min(ceil(measured), tagTextMaxWidth)
    }
}

private struct NativeHotelPinBadge: View {
    private static let fallbackFill = Color(red: 0.09, green: 0.10, blue: 0.09)

    let hotel: NativeHotelMapHotel
    let selected: Bool

    private var pinSize: CGFloat {
        NativeHotelMarkerLayout.pinSize
    }

    var body: some View {
        let logo = NativeHotelLogoCache.shared.image(named: hotel.nativeLogoFile)

        ZStack {
            NativeHotelPinShape()
                .fill(logo == nil ? Self.fallbackFill : pinFillColor)
                .strokeBorder(Color.white.opacity(0.96), lineWidth: 1)
                .frame(width: pinSize, height: pinSize)
                .rotationEffect(.degrees(-45))
                .shadow(
                    color: Color(red: 0.13, green: 0.15, blue: 0.14).opacity(selected ? 0.24 : 0.18),
                    radius: selected ? 12 : 10,
                    y: 5
                )

            if let logo {
                Image(uiImage: logo)
                    .resizable()
                    .scaledToFit()
                    .frame(width: pinSize * logoScale, height: pinSize * logoScale)
                    .offset(x: pinSize * logoOffsetX)
            } else {
                Circle()
                    .fill(Color.white)
                    .frame(width: pinSize * 0.31, height: pinSize * 0.31)
            }
        }
        .scaleEffect(selected ? 1.08 : 1, anchor: .bottom)
        .accessibilityLabel(hotel.displayName)
    }

    private var logoScale: CGFloat {
        switch hotel.chain {
        case "The Leading Hotels of the World":
            return 0.82
        case "Hilton":
            return 0.80
        case "Hyatt":
            return 0.72
        case "Marriott":
            return 0.76
        default:
            return 0.64
        }
    }

    private var logoOffsetX: CGFloat {
        hotel.chain == "IHG Hotels & Resorts" ? 0.035 : 0
    }

    private var pinFillColor: Color {
        hotel.chain == "Hyatt" ? Color(red: 0, green: 114.0 / 255.0, blue: 206.0 / 255.0) : Color(white: 0.99)
    }
}

private struct NativeHotelSmallTag: View {
    let name: String

    var body: some View {
        Text(name)
            .font(.system(size: NativeHotelMarkerLayout.tagFontSize, weight: .semibold))
            .foregroundStyle(Color.white)
            .lineLimit(1)
            .truncationMode(.tail)
            .frame(width: NativeHotelMarkerLayout.smallTagTextWidth(for: name), alignment: .leading)
            .padding(.horizontal, NativeHotelMarkerLayout.tagHorizontalPadding)
            .padding(.vertical, NativeHotelMarkerLayout.tagVerticalPadding)
            .background(
                Color(red: 0.09, green: 0.10, blue: 0.09).opacity(0.96),
                in: RoundedRectangle(cornerRadius: 6, style: .continuous)
            )
            .shadow(color: .black.opacity(0.14), radius: 13, y: 5)
    }
}

private struct NativeHotelPinShape: InsettableShape {
    var insetAmount: CGFloat = 0

    func path(in rect: CGRect) -> Path {
        let r = rect.insetBy(dx: insetAmount, dy: insetAmount)
        let radius = r.width / 2
        let smallRadius = min(4, radius)
        var path = Path()
        path.move(to: CGPoint(x: r.minX + radius, y: r.minY))
        path.addLine(to: CGPoint(x: r.maxX - radius, y: r.minY))
        path.addArc(
            center: CGPoint(x: r.maxX - radius, y: r.minY + radius),
            radius: radius,
            startAngle: .degrees(-90),
            endAngle: .degrees(0),
            clockwise: false
        )
        path.addLine(to: CGPoint(x: r.maxX, y: r.maxY - radius))
        path.addArc(
            center: CGPoint(x: r.maxX - radius, y: r.maxY - radius),
            radius: radius,
            startAngle: .degrees(0),
            endAngle: .degrees(90),
            clockwise: false
        )
        path.addLine(to: CGPoint(x: r.minX + smallRadius, y: r.maxY))
        path.addArc(
            center: CGPoint(x: r.minX + smallRadius, y: r.maxY - smallRadius),
            radius: smallRadius,
            startAngle: .degrees(90),
            endAngle: .degrees(180),
            clockwise: false
        )
        path.addLine(to: CGPoint(x: r.minX, y: r.minY + radius))
        path.addArc(
            center: CGPoint(x: r.minX + radius, y: r.minY + radius),
            radius: radius,
            startAngle: .degrees(180),
            endAngle: .degrees(270),
            clockwise: false
        )
        path.closeSubpath()
        return path
    }

    func inset(by amount: CGFloat) -> some InsettableShape {
        var copy = self
        copy.insetAmount += amount
        return copy
    }
}

private final class NativeHotelLogoCache {
    static let shared = NativeHotelLogoCache()

    private var cache: [String: UIImage] = [:]

    func image(named fileName: String?) -> UIImage? {
        guard let fileName, !fileName.isEmpty else { return nil }
        if let image = cache[fileName] { return image }

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

        cache[fileName] = image
        return image
    }
}
#endif
