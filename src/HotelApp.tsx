import { useCallback, useEffect, useMemo, useState } from "react";
import { FilterControl } from "./components/FilterControl";
import { AwardIcon, ChevronDownIcon, DiamondIcon, MapPinIcon, TagIcon } from "./components/icons";
import { HotelDetailPreview } from "./components/HotelDetailPreview";
import { HotelList, type PreviewAnchor } from "./components/HotelList";
import { HotelMapView } from "./components/HotelMapView";
import { HotelPriceFilter } from "./components/HotelPriceFilter";
import { filterAndRankHotels, formatHotelRate } from "./lib/hotel-filtering";
import { loadHotels } from "./lib/hotels-api";
import { wgs84ToGcj02 } from "./lib/coordinates";
import type { Hotel, HotelBrandOption, HotelChainOption, HotelFilters, HotelProvinceOption, UserLocation } from "./types";
import "./styles.css";

type SelectedMarker = {
  id: string;
  mode: "small" | "detail";
};

type NativeHotelPreviewPayload = {
  id: string;
  nameZh: string;
  nameEn: string;
  brand: string;
  city: string;
  priceText: string;
  description: string;
  hotelImageUrl?: string;
  standardRoomName?: string;
  standardRoomImageUrl?: string;
  standardRoomAreaSqm?: number;
  suiteRoomName?: string;
  suiteRoomImageUrl?: string;
  suiteRoomAreaSqm?: number;
  sourceUrl?: string;
  anchor?: PreviewAnchor;
};

declare global {
  interface Window {
    __HOTEL_GUIDE_NATIVE_PREVIEW__?: boolean;
    webkit?: {
      messageHandlers?: {
        hotelPreview?: {
          postMessage: (payload: NativeHotelPreviewPayload) => void;
        };
      };
    };
  }
}

const defaultFilters: HotelFilters = {
  province: "shanghai",
  priceBand: "all",
  customPriceMin: "",
  customPriceMax: "",
  chains: [],
  brands: [],
};

const fallbackProvince: HotelProvinceOption = {
  value: "shanghai",
  label: "上海",
  provinceName: "上海",
  cityName: "上海",
  province: "上海",
  country: "中国",
  amapCity: "上海",
  center: [121.4746, 31.2286],
  mapZoom: 12.45,
  offlineScale: 1450,
  count: 0,
};

export function HotelApp() {
  const [filters, setFilters] = useState<HotelFilters>(defaultFilters);
  const [selectedMarker, setSelectedMarker] = useState<SelectedMarker | null>(null);
  const [previewHotelId, setPreviewHotelId] = useState<string | null>(null);
  const [isListCollapsed, setIsListCollapsed] = useState(false);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [provinceOptions, setProvinceOptions] = useState<HotelProvinceOption[]>([fallbackProvince]);
  const [chainOptions, setChainOptions] = useState<HotelChainOption[]>([]);
  const [brandOptions, setBrandOptions] = useState<HotelBrandOption[]>([]);
  const [dataStatus, setDataStatus] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    document.title = "China Hotels";
  }, []);

  useEffect(() => {
    let cancelled = false;

    loadHotels()
      .then((payload) => {
        if (cancelled) return;
        setHotels(payload.hotels);
        setProvinceOptions(payload.provinces.length ? payload.provinces : [fallbackProvince]);
        setChainOptions(payload.chains);
        setBrandOptions(payload.brands);
        setDataStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setDataStatus("failed");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setUserLocation({
          heading: Number.isFinite(coords.heading) ? coords.heading : null,
          position: wgs84ToGcj02([coords.longitude, coords.latitude]),
        });
      },
      () => undefined,
      {
        enableHighAccuracy: true,
        maximumAge: 60_000,
        timeout: 8_000,
      },
    );
  }, []);

  const selectedProvince =
    provinceOptions.find((province) => province.value === filters.province) ??
    provinceOptions[0] ??
    fallbackProvince;
  const visibleBrandOptions = useMemo(() => {
    if (!filters.chains.length) return brandOptions;
    const activeChains = new Set(filters.chains);
    return brandOptions.filter((brand) => activeChains.has(brand.chain));
  }, [brandOptions, filters.chains]);
  const activeHotels = useMemo(
    () => filterAndRankHotels(hotels, filters, selectedProvince, userLocation),
    [filters, hotels, selectedProvince, userLocation],
  );
  const selectedId = selectedMarker?.id ?? null;
  const previewHotel = activeHotels.find((hotel) => hotel.id === previewHotelId) ?? null;

  useEffect(() => {
    if (provinceOptions.some((province) => province.value === filters.province)) return;
    setFilters((current) => ({ ...current, province: "shanghai" }));
    setSelectedMarker(null);
  }, [filters.province, provinceOptions]);

  useEffect(() => {
    if (!filters.brands.length) return;
    const visibleBrands = new Set(visibleBrandOptions.map((brand) => brand.value));
    const nextBrands = filters.brands.filter((brand) => visibleBrands.has(brand));
    if (nextBrands.length === filters.brands.length) return;
    setFilters((current) => ({ ...current, brands: nextBrands }));
    setSelectedMarker(null);
  }, [filters.brands, visibleBrandOptions]);

  const updateProvince = useCallback((province: string) => {
    setFilters((current) => ({ ...current, province }));
    setSelectedMarker(null);
  }, []);

  const updatePriceBand = useCallback((priceBand: HotelFilters["priceBand"]) => {
    setFilters((current) => ({ ...current, priceBand }));
    setSelectedMarker(null);
  }, []);

  const updateCustomPrice = useCallback((range: { min: string; max: string }) => {
    setFilters((current) => ({
      ...current,
      customPriceMin: sanitizePriceInput(range.min),
      customPriceMax: sanitizePriceInput(range.max),
      priceBand: "custom",
    }));
    setSelectedMarker(null);
  }, []);

  const updateChains = useCallback((chains: string[]) => {
    setFilters((current) => ({
      ...current,
      chains: chains.filter((chain) => chain !== "all"),
    }));
    setSelectedMarker(null);
  }, []);

  const updateBrands = useCallback((brands: string[]) => {
    setFilters((current) => ({
      ...current,
      brands: brands.filter((brand) => brand !== "all"),
    }));
    setSelectedMarker(null);
  }, []);

  const handleMapSelect = useCallback((hotelId: string) => {
    setSelectedMarker((current) =>
      current?.id === hotelId && current.mode === "detail"
        ? null
        : {
            id: hotelId,
            mode: "detail",
          },
    );
  }, []);

  const handleListSelect = useCallback((hotelId: string) => {
    setSelectedMarker((current) =>
      current?.id === hotelId && current.mode === "small"
        ? null
        : {
            id: hotelId,
            mode: "small",
          },
    );
  }, []);

  const handlePreview = useCallback((hotelId: string, anchor?: PreviewAnchor) => {
    const hotel = activeHotels.find((item) => item.id === hotelId);
    setPreviewHotelId(hotelId);
    setSelectedMarker({ id: hotelId, mode: "detail" });

    if (hotel && postNativeHotelPreview(hotel, anchor)) {
      setPreviewHotelId(null);
    }
  }, [activeHotels]);

  const handleClearSelect = useCallback(() => {
    setSelectedMarker(null);
  }, []);

  useEffect(() => {
    if (!previewHotelId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewHotelId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewHotelId]);

  return (
    <main className="app-shell hotel-shell" data-guide="hotel" data-hotel-status={dataStatus}>
      <section className="content-shell">
        <section className="map-section">
          <HotelMapView
            key={selectedProvince.value}
            hotels={activeHotels}
            onClearSelection={handleClearSelect}
            onSelect={handleMapSelect}
            province={selectedProvince}
            selectedId={selectedId}
            selectedMode={selectedMarker?.mode ?? null}
            userLocation={userLocation}
          />
        </section>

        <div className="chrome-layer hotel-chrome">
          <header className="topbar">
            <div className="brand" aria-label="China Hotels">
              <span className="brand__word">HOTELS</span>
            </div>
          </header>

          <section className="filters hotel-filters" aria-label="筛选">
            <div className="filter-slot filter-slot--city">
              <FilterControl
                icon={MapPinIcon}
                label="省份"
                onChange={updateProvince}
                options={provinceOptions.map((province) => ({
                  value: province.value,
                  label: province.label,
                }))}
                value={filters.province}
              />
            </div>
            <div className="filter-slot filter-slot--cost">
              <HotelPriceFilter
                customMax={filters.customPriceMax}
                customMin={filters.customPriceMin}
                icon={TagIcon}
                label="人均"
                value={filters.priceBand}
                onCustomChange={updateCustomPrice}
                onValueChange={updatePriceBand}
              />
            </div>
            <div className="filter-slot filter-slot--chain">
              <FilterControl
                icon={DiamondIcon}
                label="集团"
                multiple
                onValuesChange={updateChains}
                options={[
                  { value: "all", label: "全部" },
                  ...chainOptions.map((chain) => ({
                    value: chain.value,
                    label: chain.labelZh || chain.label,
                  })),
                ]}
                values={filters.chains}
              />
            </div>
            <div className="filter-slot filter-slot--brand">
              <FilterControl
                icon={AwardIcon}
                label="品牌"
                multiple
                onValuesChange={updateBrands}
                options={[
                  { value: "all", label: "全部" },
                  ...visibleBrandOptions.map((brand) => ({
                    value: brand.value,
                    label: brand.labelZh || brand.label,
                    searchText: `${brand.label} ${brand.labelZh} ${brand.labelEn} ${brand.chain}`,
                  })),
                ]}
                searchable
                values={filters.brands}
              />
            </div>
          </section>
        </div>

        <section className={isListCollapsed ? "list-section list-section--collapsed" : "list-section"}>
          <button
            aria-label={isListCollapsed ? "展开列表" : "收起列表"}
            className="hotel-list-toggle"
            type="button"
            onClick={() => setIsListCollapsed((current) => !current)}
          >
            <ChevronDownIcon />
          </button>
          <HotelList hotels={activeHotels} onPreview={handlePreview} onSelect={handleListSelect} selectedId={selectedId} />
        </section>
        {previewHotel && <HotelDetailPreview hotel={previewHotel} onClose={() => setPreviewHotelId(null)} />}
      </section>
    </main>
  );
}

function sanitizePriceInput(value: string) {
  return value.replace(/[^\d.]/g, "");
}

function postNativeHotelPreview(hotel: Hotel, anchor?: PreviewAnchor) {
  const handler = window.webkit?.messageHandlers?.hotelPreview;
  if (!window.__HOTEL_GUIDE_NATIVE_PREVIEW__ || !handler) return false;

  handler.postMessage({
    id: hotel.id,
    nameZh: hotel.nameZh || hotel.name,
    nameEn: hotel.nameEn || hotel.name,
    brand: [hotel.chainZh || hotel.chainEn || hotel.chain, hotel.brandZh || hotel.brandEn || hotel.brand]
      .filter(Boolean)
      .join(" · "),
    city: hotel.cityNameZh || hotel.cityName || hotel.provinceNameZh || hotel.provinceName,
    priceText: formatHotelRate(hotel),
    description: hotel.descriptionZh || hotel.descriptionEn || "",
    hotelImageUrl: hotel.hotelImageUrl,
    standardRoomName: hotel.standardRoomName,
    standardRoomImageUrl: hotel.standardRoomImageUrl,
    standardRoomAreaSqm: hotel.standardRoomAreaSqm,
    suiteRoomName: hotel.suiteRoomName,
    suiteRoomImageUrl: hotel.suiteRoomImageUrl,
    suiteRoomAreaSqm: hotel.suiteRoomAreaSqm,
    sourceUrl: hotel.sourceUrl,
    anchor,
  });

  return true;
}
