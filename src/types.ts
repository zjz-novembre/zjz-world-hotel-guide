export type Hotel = {
  id: string;
  hotelKey: string;
  spiritCode: string;
  name: string;
  nameZh: string;
  nameEn: string;
  nameZhSource: string;
  nameEnSource: string;
  hasOfficialChineseName: boolean;
  chain: string;
  chainZh: string;
  chainEn: string;
  brand: string;
  brandValue: string;
  brandZh: string;
  brandEn: string;
  city: string;
  province: string;
  provinceName: string;
  provinceNameZh: string;
  provinceNameEn: string;
  cityName: string;
  cityNameZh: string;
  cityNameEn: string;
  countryCode: string;
  position?: [number, number];
  positionSource: string;
  positionCoordinateSystem?: "gcj02" | "wgs84";
  positionConfirmed: boolean;
  address?: string;
  addressZh: string;
  addressEn: string;
  rateStatus: string;
  officialDynamicRateAvailable: boolean;
  averageRateLocal?: number;
  averageRateCurrency?: string;
  averageRateTaxInclusiveLocal?: number;
  averageRatePreTaxLocal?: number;
  averageRateTaxEstimateUsed: boolean;
  averageRateBasis: "tax_inclusive" | "tax_inclusive_estimate" | "pre_tax" | "missing";
  descriptionZh?: string;
  descriptionEn?: string;
  descriptionSource?: string;
  hotelImageUrl?: string;
  hotelImageAlt?: string;
  hotelImageSource?: string;
  standardRoomName?: string;
  standardRoomImageUrl?: string;
  standardRoomAreaSqm?: number;
  standardRoomSourceUrl?: string;
  standardBathroomName?: string;
  standardBathroomImageUrl?: string;
  standardBathroomSourceUrl?: string;
  suiteRoomName?: string;
  suiteRoomImageUrl?: string;
  suiteRoomAreaSqm?: number;
  suiteRoomSourceUrl?: string;
  suiteBathroomName?: string;
  suiteBathroomImageUrl?: string;
  suiteBathroomSourceUrl?: string;
  sourceUrl?: string;
};

export type HotelMapOption = {
  value: string;
  label: string;
  cityName: string;
  province: string;
  country: string;
  amapCity: string;
  center: [number, number];
  mapZoom: number;
  offlineScale: number;
};

export type HotelProvinceOption = HotelMapOption & {
  count: number;
  provinceName: string;
};

export type HotelCityOption = HotelMapOption & {
  count: number;
  provinceName: string;
};

export type HotelChainOption = {
  value: string;
  label: string;
  labelZh: string;
  labelEn: string;
  count: number;
};

export type HotelBrandOption = {
  value: string;
  label: string;
  labelZh: string;
  labelEn: string;
  count: number;
  chain: string;
};

export type HotelPriceBand = "all" | "custom" | "0-500" | "500-1000" | "1000-1500" | "1500-plus";

export type HotelsPayload = {
  source: string;
  generatedAt: string;
  rateWindowStartDate: string | null;
  rateWindowEndDate: string | null;
  count: number;
  provinces: HotelProvinceOption[];
  cities: HotelCityOption[];
  chains: HotelChainOption[];
  brands: HotelBrandOption[];
  hotels: Hotel[];
};

export type HotelFilters = {
  province: string;
  priceBand: HotelPriceBand;
  customPriceMin: string;
  customPriceMax: string;
  chains: string[];
  brands: string[];
};

export type UserLocation = {
  position: [number, number];
  heading: number | null;
};
