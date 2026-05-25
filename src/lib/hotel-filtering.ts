import type { Hotel, HotelFilters, HotelPriceBand, HotelProvinceOption, UserLocation } from "../types";

const EARTH_RADIUS_KM = 6371.0088;

export type RankedHotel = Hotel & {
  distanceKm: number | null;
};

export function filterAndRankHotels(
  hotels: Hotel[],
  filters: HotelFilters,
  province: HotelProvinceOption,
  userLocation: UserLocation | null,
): RankedHotel[] {
  const origin = userLocation?.position ?? province.center;
  const activeChains = new Set(filters.chains);
  const activeBrands = new Set(filters.brands);

  return hotels
    .filter((hotel) => hotel.province === filters.province)
    .filter((hotel) => matchesPriceBand(hotel, filters))
    .filter((hotel) => !activeChains.size || activeChains.has(hotel.chain))
    .filter((hotel) => !activeBrands.size || activeBrands.has(hotel.brandValue))
    .map((hotel) => ({
      ...hotel,
      distanceKm: hotel.position ? distanceKm(origin, hotel.position) : null,
    }))
    .sort((left, right) => {
      const distanceDelta = (left.distanceKm ?? Number.POSITIVE_INFINITY) - (right.distanceKm ?? Number.POSITIVE_INFINITY);
      if (distanceDelta !== 0) return distanceDelta;
      return left.name.localeCompare(right.name, "zh-Hans-CN");
    });
}

export function formatDistance(distanceKm: number | null) {
  if (distanceKm === null) return "";
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m`;
  if (distanceKm < 100) return `${distanceKm.toFixed(1)} km`;
  return `${Math.round(distanceKm)} km`;
}

export function formatHotelRate(hotel: Pick<Hotel, "averageRateCurrency" | "averageRateTaxInclusiveLocal">) {
  if (!Number.isFinite(hotel.averageRateTaxInclusiveLocal)) return "";
  const symbol = currencySymbol(hotel.averageRateCurrency);
  const value = hotel.averageRateTaxInclusiveLocal!;
  if (value >= 1000) return `${symbol}${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  return `${symbol}${Math.round(value)}`;
}

function matchesPriceBand(hotel: Hotel, filters: HotelFilters) {
  if (filters.priceBand === "all") return true;
  const value = hotel.averageRateTaxInclusiveLocal;
  if (!Number.isFinite(value)) return false;

  if (filters.priceBand === "custom") {
    const min = numberOrNull(filters.customPriceMin);
    const max = numberOrNull(filters.customPriceMax);
    if (min !== null && value! < min) return false;
    if (max !== null && value! > max) return false;
    return min !== null || max !== null;
  }

  const [min, max] = priceBandRange(filters.priceBand);
  return value! >= min && (max === null || value! < max);
}

function priceBandRange(priceBand: Exclude<HotelPriceBand, "all" | "custom">) {
  if (priceBand === "0-500") return [0, 500] as const;
  if (priceBand === "500-1000") return [500, 1000] as const;
  if (priceBand === "1000-1500") return [1000, 1500] as const;
  return [1500, null] as const;
}

function numberOrNull(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : null;
}

function currencySymbol(currency: string | undefined) {
  if (currency === "HKD") return "HK$";
  if (currency === "MOP") return "MOP ";
  if (currency === "TWD") return "NT$";
  return "¥";
}

function distanceKm(left: [number, number], right: [number, number]) {
  const leftLat = toRadians(left[1]);
  const rightLat = toRadians(right[1]);
  const deltaLat = toRadians(right[1] - left[1]);
  const deltaLng = toRadians(right[0] - left[0]);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(leftLat) * Math.cos(rightLat) * Math.sin(deltaLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}
