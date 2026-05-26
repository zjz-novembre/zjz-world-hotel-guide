import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  getAmapConfig,
  loadAmap,
  type AMapMap,
  type AMapMarker,
  type RuntimeAmapConfig,
} from "../lib/amap";
import type { Hotel, HotelProvinceOption, UserLocation } from "../types";

type HotelMapViewProps = {
  hotels: Hotel[];
  onClearSelection: () => void;
  onSelect: (hotelId: string) => void;
  province: HotelProvinceOption;
  selectedId: string | null;
  selectedMode: "small" | "detail" | null;
  userLocation: UserLocation | null;
};

type MapStatus = "missing-key" | "loading" | "ready" | "failed" | "offline";

const DEFAULT_AMAP_STYLE = "amap://styles/whitesmoke";
const AMAP_FEATURES = ["bg", "road", "point"];
const MOBILE_MAX_WIDTH = 760;
const MOBILE_LANDSCAPE_MAX_WIDTH = 960;
const MOBILE_LANDSCAPE_MAX_HEIGHT = 520;
const MAP_TILE_SIZE = 256;
const HOTEL_MARKER_Z_INDEX = 30;
const ACTIVE_HOTEL_MARKER_Z_INDEX = 10000;
const hotelGroupLogoFileByChain: Record<string, string> = {
  Accor: "accor.svg",
  "Four Seasons": "four-seasons.svg",
  Hilton: "hilton.svg",
  "IHG Hotels & Resorts": "ihg-2.svg",
  "The Leading Hotels of the World": "lhw.svg",
};

export function HotelMapView({
  hotels,
  province,
  selectedId,
  selectedMode,
  onClearSelection,
  onSelect,
  userLocation,
}: HotelMapViewProps) {
  const surfaceNode = useRef<HTMLDivElement | null>(null);
  const mapNode = useRef<HTMLDivElement | null>(null);
  const map = useRef<AMapMap | null>(null);
  const provinceRef = useRef(province);
  const suppressNextMapClear = useRef(false);
  const markers = useRef<Map<string, AMapMarker>>(new Map());
  const markerElements = useRef<Map<string, HTMLElement>>(new Map());
  const [mapReady, setMapReady] = useState(false);
  const [mapConfig, setMapConfig] = useState<RuntimeAmapConfig | null>(null);
  const [mapStatus, setMapStatus] = useState<MapStatus>("loading");
  const amapKey = mapConfig?.key?.trim();
  const amapStyle = mapConfig?.mapStyle?.trim() || DEFAULT_AMAP_STYLE;
  const amapSecurityCode = mapConfig?.securityCode?.trim();
  const hotelKey = useMemo(() => hotels.map((hotel) => hotel.id).join("|"), [hotels]);
  const selectedHotel = useMemo(
    () => hotels.find((hotel) => hotel.id === selectedId) ?? null,
    [hotels, selectedId],
  );

  useEffect(() => {
    provinceRef.current = province;
  }, [province]);

  useEffect(() => {
    let cancelled = false;
    getAmapConfig().then((config) => {
      if (!cancelled) setMapConfig(config);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mapConfig) {
      setMapReady(false);
      setMapStatus("loading");
      return;
    }

    if (!navigator.onLine) {
      setMapReady(false);
      setMapStatus("offline");
      return;
    }

    if (!amapKey || !mapNode.current) {
      setMapReady(false);
      setMapStatus("missing-key");
      return;
    }

    let cancelled = false;
    let didMarkReady = false;
    let readinessFrame = 0;
    let readinessTimeout = 0;
    setMapStatus("loading");

    const markReady = () => {
      if (cancelled) return;
      window.cancelAnimationFrame(readinessFrame);
      window.clearTimeout(readinessTimeout);
      if (!didMarkReady && map.current) {
        applyProvinceView(map.current, provinceRef.current, mapNode.current);
      }
      didMarkReady = true;
      map.current?.setFeatures?.(AMAP_FEATURES);
      map.current?.setMapStyle?.(amapStyle);
      setMapStatus("ready");
    };

    const watchLiveAmapDom = () => {
      if (cancelled) return;
      if (mapNode.current && hasLiveAmapDom(mapNode.current)) {
        markReady();
        return;
      }

      readinessFrame = window.requestAnimationFrame(watchLiveAmapDom);
    };

    loadAmap({ key: amapKey, securityCode: amapSecurityCode })
      .then((AMap) => {
        if (cancelled || !mapNode.current) return;

        const initialProvince = provinceRef.current;
        const initialZoom = getVisibleProvinceZoom(initialProvince, mapNode.current);
        const initialCenter = getVisibleProvinceCenter(initialProvince, mapNode.current, initialZoom);
        const nextMap = new AMap.Map(mapNode.current, {
          center: initialCenter,
          features: AMAP_FEATURES,
          isHotspot: false,
          mapStyle: amapStyle,
          pitch: 0,
          resizeEnable: true,
          showIndoorMap: false,
          showLabel: true,
          viewMode: "2D",
          zoom: initialZoom,
        });
        map.current = nextMap;
        nextMap.setFeatures?.(AMAP_FEATURES);
        nextMap.setMapStyle?.(amapStyle);
        setMapReady(true);
        nextMap.on("complete", markReady);
        readinessFrame = window.requestAnimationFrame(watchLiveAmapDom);
        readinessTimeout = window.setTimeout(() => {
          if (cancelled) return;
          setMapReady(false);
          setMapStatus("failed");
        }, 15000);
      })
      .catch(() => {
        setMapReady(false);
        setMapStatus(navigator.onLine ? "failed" : "offline");
      });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(readinessFrame);
      window.clearTimeout(readinessTimeout);
      markers.current.clear();
      markerElements.current.clear();
      map.current?.destroy();
      map.current = null;
      setMapReady(false);
    };
  }, [amapKey, amapSecurityCode, amapStyle, mapConfig]);

  useEffect(() => {
    if (!amapKey || !map.current || !window.AMap || !mapReady) return;

    const activeMap = map.current;
    activeMap.clearMap();
    markers.current.clear();
    markerElements.current.clear();
    applyProvinceView(activeMap, province, mapNode.current);

    const provinceAnchor = createProvinceAnchorMarker(province);
    const nextMarkers = hotels
      .filter((hotel) => hotel.position)
      .map((hotel) => {
        const selectHotel = () => {
          suppressNextMapClear.current = true;
          window.setTimeout(() => {
            suppressNextMapClear.current = false;
          }, 0);
          onSelect(hotel.id);
        };
        const content = createHotelMarkerContent(hotel, selectHotel);
        const marker = new window.AMap!.Marker({
          anchor: "bottom-center",
          content,
          offset: new window.AMap!.Pixel(0, 0),
          position: hotel.position,
          title: hotel.name,
          zIndex: HOTEL_MARKER_Z_INDEX,
        });

        markers.current.set(hotel.id, marker);
        markerElements.current.set(hotel.id, content);

        return marker;
      });
    const userMarker = userLocation ? createUserLocationMarker(userLocation) : null;
    activeMap.add([provinceAnchor, ...nextMarkers, ...(userMarker ? [userMarker] : [])]);
  }, [amapKey, hotelKey, hotels, mapReady, onSelect, province, userLocation]);

  useEffect(() => {
    const element = surfaceNode.current;
    if (!element) return;

    const clearOnMapClick = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".hotel-map-marker, .offline-hotel-map__marker")) return;
      onClearSelection();
    };

    element.addEventListener("click", clearOnMapClick);
    return () => element.removeEventListener("click", clearOnMapClick);
  }, [onClearSelection]);

  useEffect(() => {
    if (!map.current || !mapReady) return;

    const clearOnAmapClick = () => {
      if (suppressNextMapClear.current) {
        suppressNextMapClear.current = false;
        return;
      }

      onClearSelection();
    };

    map.current.on("click", clearOnAmapClick);
    return () => map.current?.off?.("click", clearOnAmapClick);
  }, [mapReady, onClearSelection]);

  useEffect(() => {
    if (!map.current || !mapReady) return;

    let resizeFrame = 0;
    const syncProvinceView = () => {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        if (!map.current) return;
        applyProvinceView(map.current, province, mapNode.current);
      });
    };

    window.addEventListener("resize", syncProvinceView);
    return () => {
      window.cancelAnimationFrame(resizeFrame);
      window.removeEventListener("resize", syncProvinceView);
    };
  }, [mapReady, province]);

  useEffect(() => {
    markers.current.forEach((item) => {
      item.setTop?.(false);
      item.setzIndex?.(HOTEL_MARKER_Z_INDEX);
    });
    markerElements.current.forEach((element, hotelId) => {
      const isSelected = hotelId === selectedId;
      element.classList.toggle("hotel-map-marker--active", isSelected && selectedMode === "detail");
      element.classList.toggle("hotel-map-marker--selected-small", isSelected && selectedMode === "small");
    });

    if (!selectedId || !map.current) return;

    const marker = markers.current.get(selectedId);
    if (!marker) return;
    marker.setTop?.(true);
    marker.setzIndex?.(ACTIVE_HOTEL_MARKER_Z_INDEX);
  }, [selectedId, selectedMode]);

  useEffect(() => {
    if (!map.current || !mapReady || selectedMode !== "small" || !selectedHotel?.position) return;

    const zoom = Math.max(getVisibleProvinceZoom(province, mapNode.current), 14.8);
    const center = getVisibleCoordinateCenter(selectedHotel.position, mapNode.current, zoom);
    applyMapView(map.current, zoom, center);
  }, [mapReady, province, selectedHotel, selectedMode]);

  return (
    <div
      ref={surfaceNode}
      className={`amap-surface hotel-map amap-surface--${mapStatus}`}
      aria-label="高德地图"
      data-amap-status={mapStatus}
      data-map-province={province.value}
      data-cached-map={mapStatus === "ready" ? "hidden" : "visible"}
      style={{ "--map-marker-scale": 1 } as CSSProperties}
    >
      <div ref={mapNode} className="amap-live-layer" aria-hidden={mapStatus !== "ready"} />
      {mapStatus !== "ready" && (
        <OfflineHotelMap
          hotels={hotels}
          onSelect={onSelect}
          province={province}
          selectedId={selectedId}
          surfaceElement={surfaceNode.current}
        />
      )}
    </div>
  );
}

function hasLiveAmapDom(element: HTMLElement) {
  return Boolean(
    element.querySelector(
      ".amap-maps, .amap-layer, .amap-layers, .amap-logo, .amap-copyright, canvas",
    ),
  );
}

function applyProvinceView(activeMap: AMapMap, province: HotelProvinceOption, element: HTMLElement | null) {
  const zoom = getVisibleProvinceZoom(province, element);
  const center = getVisibleProvinceCenter(province, element, zoom);
  applyMapView(activeMap, zoom, center);
}

function applyMapView(activeMap: AMapMap, zoom: number, center: [number, number]) {
  if (activeMap.setZoomAndCenter) {
    activeMap.setZoomAndCenter(zoom, center, true);
    return;
  }

  activeMap.setCenter(center);
  activeMap.setZoom?.(zoom, true);
}

function getVisibleProvinceCenter(
  province: HotelProvinceOption,
  element: HTMLElement | null,
  zoom: number,
): [number, number] {
  return getVisibleCoordinateCenter(province.center, element, zoom);
}

function getVisibleCoordinateCenter(
  coordinate: [number, number],
  element: HTMLElement | null,
  zoom: number,
): [number, number] {
  const width = element?.clientWidth ?? window.innerWidth;
  const height = element?.clientHeight ?? window.innerHeight;
  const focus = getMapFocus(element, width, height);
  const horizontalPixels = width / 2 - focus.x;
  const verticalPixels = height / 2 - focus.y;
  const lngShift = getLongitudeShiftForPixels(horizontalPixels, coordinate[1], zoom);
  const latShift = getLatitudeShiftForPixels(verticalPixels, coordinate[1], zoom);

  return [coordinate[0] + lngShift, coordinate[1] + latShift];
}

function getVisibleProvinceZoom(province: HotelProvinceOption, element: HTMLElement | null) {
  const width = element?.clientWidth ?? window.innerWidth;
  const height = element?.clientHeight ?? window.innerHeight;
  const isPortraitMobile = width <= MOBILE_MAX_WIDTH;
  const isLandscapeMobile = width <= MOBILE_LANDSCAPE_MAX_WIDTH && height <= MOBILE_LANDSCAPE_MAX_HEIGHT;
  if (province.value === "shanghai" && !isPortraitMobile && !isLandscapeMobile) return 12.45;
  if (province.value === "shanghai") return 12.0;
  return province.mapZoom;
}

function getMapFocus(element: HTMLElement | null, width: number, height: number) {
  const mapRect = element?.getBoundingClientRect();
  const stageRect = document.querySelector(".content-shell")?.getBoundingClientRect();
  const chromeRect = document.querySelector(".chrome-layer")?.getBoundingClientRect();
  const listElement = document.querySelector(".list-section");
  const listRect = listElement?.getBoundingClientRect();
  const listIsCollapsed = listElement?.classList.contains("list-section--collapsed") ?? false;
  const stageLeft = stageRect?.left ?? mapRect?.left ?? 0;
  const stageTop = stageRect?.top ?? mapRect?.top ?? 0;
  const stageRight = stageRect?.right ?? stageLeft + width;
  const stageBottom = stageRect?.bottom ?? stageTop + height;
  const stageWidth = stageRight - stageLeft;
  const stageHeight = stageBottom - stageTop;
  const isLandscapeMobile = width <= MOBILE_LANDSCAPE_MAX_WIDTH && height <= MOBILE_LANDSCAPE_MAX_HEIGHT;
  const isPortraitMobile = width <= MOBILE_MAX_WIDTH;
  let visibleLeft = stageLeft;
  let visibleTop = stageTop;
  let visibleRight = stageRight;
  let visibleBottom = stageBottom;

  if (chromeRect && (isPortraitMobile || isLandscapeMobile)) {
    visibleTop = Math.max(visibleTop, chromeRect.bottom);
  }

  if (listRect) {
    const listIsRightRail =
      listRect.width < stageWidth * 0.7 && listRect.left > stageLeft + stageWidth * 0.35;

    if (listIsRightRail) {
      visibleRight = Math.min(visibleRight, listRect.left);
    } else if (isPortraitMobile) {
      const stableListTop = listIsCollapsed ? listRect.bottom - stageHeight * 0.43 : listRect.top;
      visibleBottom = Math.min(visibleBottom, stableListTop);
    }
  }

  if (visibleRight <= visibleLeft || visibleBottom <= visibleTop) {
    return {
      x: isPortraitMobile ? width / 2 : width * 0.3,
      y: height / 2,
    };
  }

  const mapLeft = mapRect?.left ?? 0;
  const mapTop = mapRect?.top ?? 0;

  return {
    x: (visibleLeft + visibleRight) / 2 - mapLeft,
    y: (visibleTop + visibleBottom) / 2 - mapTop,
  };
}

function getLongitudeShiftForPixels(pixels: number, latitude: number, zoom: number) {
  const worldPixels = MAP_TILE_SIZE * 2 ** zoom;
  const latitudeFactor = Math.max(Math.cos((latitude * Math.PI) / 180), 0.2);

  return (pixels * 360) / (worldPixels * latitudeFactor);
}

function getLatitudeShiftForPixels(pixels: number, latitude: number, zoom: number) {
  const worldPixels = MAP_TILE_SIZE * 2 ** zoom;
  const latitudeFactor = Math.max(Math.cos((latitude * Math.PI) / 180), 0.2);

  return (-pixels * 360 * latitudeFactor) / worldPixels;
}

function createProvinceAnchorMarker(province: HotelProvinceOption): AMapMarker {
  const anchor = document.createElement("span");
  anchor.className = "map-city-anchor";
  anchor.dataset.city = province.value;

  return new window.AMap!.Marker({
    anchor: "center",
    content: anchor,
    position: province.center,
    title: province.provinceName,
  });
}

function createUserLocationMarker(location: UserLocation): AMapMarker {
  const marker = document.createElement("span");
  marker.className = "map-user-location";
  marker.setAttribute("aria-label", "当前位置方向");
  marker.style.setProperty("--user-heading", `${normalizeHeading(location.heading)}deg`);

  const arrow = document.createElement("span");
  arrow.className = "map-user-location__arrow";
  marker.appendChild(arrow);

  return new window.AMap!.Marker({
    anchor: "center",
    content: marker,
    position: location.position,
    title: "当前位置",
    zIndex: 999,
  });
}

function createHotelMarkerContent(hotel: Hotel, onClick: () => void) {
  const logoSrc = getHotelGroupLogoSrc(hotel.chain);
  const marker = document.createElement("div");
  marker.className = logoSrc ? "hotel-map-marker hotel-map-marker--has-logo" : "hotel-map-marker";
  marker.dataset.hotelId = hotel.id;
  marker.role = "button";
  marker.tabIndex = 0;
  marker.setAttribute("aria-label", hotel.name);
  marker.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });
  marker.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  });

  const tag = document.createElement("span");
  tag.className = "hotel-map-marker__tag";
  tag.textContent = hotel.name;

  const pin = document.createElement("span");
  pin.className = logoSrc ? "hotel-map-marker__pin hotel-map-marker__pin--logo" : "hotel-map-marker__pin";
  pin.setAttribute("aria-hidden", "true");
  if (logoSrc) {
    const logo = document.createElement("img");
    logo.alt = "";
    logo.className = "hotel-map-marker__logo";
    logo.decoding = "async";
    logo.src = logoSrc;
    pin.appendChild(logo);
  }
  marker.appendChild(pin);
  marker.appendChild(tag);

  return marker;
}

function getHotelGroupLogoSrc(chain: string) {
  const fileName = hotelGroupLogoFileByChain[chain];
  return fileName ? `${import.meta.env.BASE_URL}logos/hotel-groups/${fileName}` : null;
}

function normalizeHeading(heading: number | null) {
  if (heading === null || !Number.isFinite(heading)) return 0;
  return ((heading % 360) + 360) % 360;
}

function OfflineHotelMap({
  hotels,
  selectedId,
  onSelect,
  province,
  surfaceElement,
}: {
  hotels: Hotel[];
  selectedId: string | null;
  onSelect: (hotelId: string) => void;
  province: HotelProvinceOption;
  surfaceElement: HTMLElement | null;
}) {
  const metrics = getOfflineMapMetrics(province, surfaceElement);
  const offlineStyle = {
    "--offline-focus-x": `${metrics.focusXPercent}%`,
    "--offline-focus-y": `${metrics.focusYPercent}%`,
  } as CSSProperties;

  return (
    <div className="offline-city-map offline-hotel-map" style={offlineStyle} aria-hidden={false}>
      <span className="offline-city-map__water offline-city-map__water--one" aria-hidden="true" />
      <span className="offline-city-map__water offline-city-map__water--two" aria-hidden="true" />
      <span className="offline-city-map__park offline-city-map__park--one" aria-hidden="true" />
      <span className="offline-city-map__park offline-city-map__park--two" aria-hidden="true" />
      <span className="offline-city-map__road offline-city-map__road--one" aria-hidden="true" />
      <span className="offline-city-map__road offline-city-map__road--two" aria-hidden="true" />
      <span className="offline-city-map__road offline-city-map__road--three" aria-hidden="true" />
      <span className="offline-city-map__road offline-city-map__road--four" aria-hidden="true" />
      <span className="offline-city-map__road offline-city-map__road--five" aria-hidden="true" />
      <span className="offline-city-map__road offline-city-map__road--six" aria-hidden="true" />
      <span className="offline-city-map__road offline-city-map__road--seven" aria-hidden="true" />
      <span className="offline-city-map__road offline-city-map__road--eight" aria-hidden="true" />
      <span className="offline-city-map__axis offline-city-map__axis--one" />
      <span className="offline-city-map__axis offline-city-map__axis--two" />
      <span className="offline-city-map__axis offline-city-map__axis--three" />
      <span className="offline-city-map__ring" />
      <span className="offline-city-map__center">{province.provinceName}</span>
      {hotels
        .filter((hotel) => hotel.position)
        .map((hotel) => {
          const point = getOfflinePoint(hotel.position!, metrics);
          if (!point) return null;
          const [x, y] = point;
          const logoSrc = getHotelGroupLogoSrc(hotel.chain);
          return (
            <button
              key={hotel.id}
              className={
                hotel.id === selectedId
                  ? `offline-hotel-map__marker offline-hotel-map__marker--active ${
                      logoSrc ? "offline-hotel-map__marker--has-logo" : ""
                    }`
                  : `offline-hotel-map__marker ${logoSrc ? "offline-hotel-map__marker--has-logo" : ""}`
              }
              style={{ left: `${x}%`, top: `${y}%` }}
              type="button"
              onClick={() => onSelect(hotel.id)}
              aria-label={hotel.name}
            >
              <span
                className={
                  logoSrc ? "offline-hotel-map__pin offline-hotel-map__pin--logo" : "offline-hotel-map__pin"
                }
                aria-hidden="true"
              >
                {logoSrc && <img alt="" className="offline-hotel-map__logo" src={logoSrc} />}
              </span>
              <span className="offline-hotel-map__label">{hotel.name}</span>
            </button>
          );
        })}
    </div>
  );
}

type OfflineMapMetrics = {
  center: [number, number];
  focusXPercent: number;
  focusYPercent: number;
  height: number;
  width: number;
  worldPixels: number;
};

function getOfflineMapMetrics(province: HotelProvinceOption, element: HTMLElement | null): OfflineMapMetrics {
  const width = element?.clientWidth || window.innerWidth;
  const height = element?.clientHeight || window.innerHeight;
  const zoom = getVisibleProvinceZoom(province, element);
  const center = getVisibleProvinceCenter(province, element, zoom);
  const focus = getMapFocus(element, width, height);

  return {
    center,
    focusXPercent: clamp((focus.x / width) * 100, 0, 100),
    focusYPercent: clamp((focus.y / height) * 100, 0, 100),
    height,
    width,
    worldPixels: MAP_TILE_SIZE * 2 ** zoom,
  };
}

function getOfflinePoint(position: [number, number], metrics: OfflineMapMetrics) {
  const [centerLng, centerLat] = metrics.center;
  const [lng, lat] = position;
  const latitudeFactor = Math.max(Math.cos((centerLat * Math.PI) / 180), 0.2);
  const xPixels = ((lng - centerLng) * metrics.worldPixels * latitudeFactor) / 360;
  const yPixels = (-(lat - centerLat) * metrics.worldPixels) / (360 * latitudeFactor);
  const x = ((metrics.width / 2 + xPixels) / metrics.width) * 100;
  const y = ((metrics.height / 2 + yPixels) / metrics.height) * 100;

  if (x < -8 || x > 108 || y < -8 || y > 108) return null;
  return [x, y] as const;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
