import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { hotelSourceDir } from "./paths.mjs";

const outputDir = hotelSourceDir;
const outputJsonPath = join(outputDir, "ihg-hilton-greater-china-official-hotels.json");
const outputCsvPath = join(outputDir, "ihg-hilton-greater-china-official-hotels.csv");
const outputSummaryPath = join(outputDir, "ihg-hilton-greater-china-official-hotels-summary.md");

const fetchedAt = new Date().toISOString();
const usage = "personal_noncommercial_low_frequency";
const userAgent = "michelin-list-personal-research/0.1 (+low-frequency official hotel list collection)";

const hotelKeys = [
  "chain",
  "source",
  "official_locale_primary",
  "official_locale_secondary",
  "spiritCode",
  "name_en",
  "name_zh",
  "brand_en",
  "brand_zh",
  "brandKey",
  "hotelStatus",
  "propertyType",
  "gpCategory",
  "city_en",
  "city_zh",
  "province_en",
  "province_zh",
  "region_en",
  "region_zh",
  "regionCode",
  "subRegionCode",
  "subRegionLabel_en",
  "subRegionLabel_zh",
  "country_en",
  "country_zh",
  "countryCode",
  "countryDisplay_en",
  "countryDisplay_zh",
  "address1_en",
  "address1_zh",
  "zipcode",
  "latitude",
  "longitude",
  "phone",
  "email",
  "propertySiteURL_en",
  "propertySiteURL_zh",
  "externalBookingURL_en",
  "externalBookingURL_zh",
  "bookableDate",
  "openDate",
  "checkinTime",
  "checkoutTime",
  "nonSmoking",
  "excludeFromBrandFilter",
  "showBrandLogo",
  "suppressBrandLogo",
  "description_en",
  "description_zh",
  "amenities_en",
  "amenities_zh",
  "amenityKeys",
  "characteristics_en",
  "characteristics_zh",
  "thumbnails",
  "brandlogo",
  "flag",
  "verifiedRating",
  "verifiedNumReviews",
  "lastRenovationDate",
  "raw_en",
  "raw_zh",
];

const csvColumns = [
  "spiritCode",
  "name_en",
  "name_zh",
  "brand_en",
  "brand_zh",
  "brandKey",
  "hotelStatus",
  "propertyType",
  "gpCategory",
  "city_en",
  "city_zh",
  "province_en",
  "province_zh",
  "address1_en",
  "address1_zh",
  "zipcode",
  "latitude",
  "longitude",
  "phone",
  "propertySiteURL_en",
  "propertySiteURL_zh",
  "bookableDate",
  "openDate",
  "checkinTime",
  "checkoutTime",
  "nonSmoking",
];

const sourceUrls = {
  hiltonExtract: "https://www.hilton.com/en/cp/hse/hotel-summary-extract.json",
  hiltonGraphql: "https://www.hilton.com/graphql/customer",
  hiltonChina: "https://www.hilton.com/en/locations/china/",
  hiltonHongKong: "https://www.hilton.com/en/locations/hong-kong/",
  hiltonMacao: "https://www.hilton.com/en/locations/macao/",
  hiltonTaiwan: "https://www.hilton.com/en/locations/taiwan/",
  ihgMainland: "https://www.ihg.com/mainland-china",
  ihgHongKong: "https://www.ihg.com/hong-kong",
  ihgMacau: "https://www.ihg.com/macau",
  ihgTaiwan: "https://www.ihg.com/taiwan",
};

const chainOrder = new Map([
  ["IHG Hotels & Resorts", 0],
  ["Hilton", 1],
]);

const regionDefinitions = {
  MAINLAND_CN: {
    region_en: "Mainland China",
    region_zh: "中国大陆",
    country_en: "China",
    country_zh: "中国",
    countryCode: "CN",
    countryDisplay_en: "Mainland China",
    countryDisplay_zh: "中国大陆",
  },
  HK: {
    region_en: "Hong Kong",
    region_zh: "中国香港",
    country_en: "Hong Kong SAR China",
    country_zh: "中国香港",
    countryCode: "HK",
    countryDisplay_en: "Hong Kong",
    countryDisplay_zh: "中国香港",
  },
  MO: {
    region_en: "Macau",
    region_zh: "中国澳门",
    country_en: "Macau SAR China",
    country_zh: "中国澳门",
    countryCode: "MO",
    countryDisplay_en: "Macau",
    countryDisplay_zh: "中国澳门",
  },
  TW: {
    region_en: "Taiwan",
    region_zh: "中国台湾",
    country_en: "Taiwan",
    country_zh: "中国台湾",
    countryCode: "TW",
    countryDisplay_en: "Taiwan",
    countryDisplay_zh: "中国台湾",
  },
};

const regionByCountryCode = {
  CN: "MAINLAND_CN",
  HK: "HK",
  MO: "MO",
  TW: "TW",
};

const regionByIhgCountry = {
  "Mainland China": "MAINLAND_CN",
  China: "MAINLAND_CN",
  "Hong Kong": "HK",
  Macau: "MO",
  Macao: "MO",
  Taiwan: "TW",
};

const ihgBrandZh = {
  "Atwell Suites": "Atwell Suites",
  "Crowne Plaza": "皇冠假日酒店",
  "EVEN Hotel": "逸衡酒店",
  "Garner Hotel": "Garner Hotel",
  HUALUXE: "华邑酒店及度假村",
  "Holiday Inn": "假日酒店",
  "Holiday Inn & Suites": "假日套房酒店",
  "Holiday Inn Express": "智选假日酒店",
  "Holiday Inn Resort": "假日度假酒店",
  "Hotel Indigo": "英迪格酒店",
  "IC Alliance Resorts": "洲际联盟度假村",
  "Independent (SPHC)": "IHG 独立酒店",
  InterContinental: "洲际酒店及度假村",
  Kimpton: "金普顿酒店及餐厅",
  Regent: "丽晶酒店及度假村",
  "Vignette Collection": "Vignette Collection",
  voco: "voco 酒店",
};

const hiltonBrandZh = {
  "Canopy by Hilton": "希尔顿嘉悦里",
  "Conrad Hotels & Resorts": "康莱德酒店及度假村",
  "Curio Collection by Hilton": "希尔顿格芮精选",
  "DoubleTree by Hilton": "希尔顿逸林",
  "Hampton by Hilton": "希尔顿欢朋",
  "Hilton Garden Inn": "希尔顿花园酒店",
  "Hilton Hotels & Resorts": "希尔顿酒店及度假村",
  "Home2 Suites by Hilton": "希尔顿惠庭",
  "Motto by Hilton": "希尔顿 Motto",
  "Signia by Hilton": "希尔顿 Signia",
  "Small Luxury Hotels of the World": "全球奢华精品酒店",
  "Tapestry by Hilton": "希尔顿启缤精选",
  "Waldorf Astoria": "华尔道夫酒店及度假村",
};

const cityZh = {
  Beijing: "北京",
  Shanghai: "上海",
  Guangzhou: "广州",
  Shenzhen: "深圳",
  "Hong Kong": "香港",
  Macau: "澳门",
  Macao: "澳门",
  Taipei: "台北",
  Tainan: "台南",
};

async function main() {
  mkdirSync(outputDir, { recursive: true });

  const hiltonContext = await fetchHiltonContext();
  const [ihgResult, hiltonHotels] = await Promise.all([fetchIhgHotels(), fetchHiltonHotels(hiltonContext)]);
  const hotels = [...ihgResult.hotels, ...hiltonHotels].sort(compareHotels);

  validateRecords(hotels);
  assertNoRateFields(hotels);

  const metadata = buildMetadata(hotels, ihgResult, hiltonContext);
  const payload = {
    metadata,
    official_sites: [
      sourceUrls.ihgMainland,
      sourceUrls.ihgHongKong,
      sourceUrls.ihgMacau,
      sourceUrls.ihgTaiwan,
      sourceUrls.hiltonExtract,
      sourceUrls.hiltonChina,
      sourceUrls.hiltonHongKong,
      sourceUrls.hiltonMacao,
      sourceUrls.hiltonTaiwan,
    ],
    hotels,
  };

  writeFileSync(outputJsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  writeFileSync(outputCsvPath, toCsv(hotels));
  writeFileSync(outputSummaryPath, toSummary(metadata));

  console.log(`Wrote ${hotels.length} hotels`);
  console.log(outputJsonPath);
  console.log(outputCsvPath);
  console.log(outputSummaryPath);
}

async function fetchHiltonContext() {
  const [brands, locationTotals] = await Promise.all([fetchHiltonBrands(), fetchHiltonLocationTotals()]);
  return { brands, locationTotals };
}

async function fetchHiltonBrands() {
  const query = `query brands($language: String!) {
    brands(language: $language) {
      code
      name
      formalName
      canonicalSlug
      url
      isHotelBrand
      hasHotels
    }
  }`;
  const payload = await postHiltonGraphql(query, { language: "en" });
  const brands = payload.data?.brands ?? [];
  return Object.fromEntries(
    brands
      .filter((brand) => brand?.code)
      .map((brand) => [
        brand.code,
        {
          code: brand.code,
          name: cleanText(brand.formalName || brand.name),
          shortName: cleanText(brand.name),
          canonicalSlug: brand.canonicalSlug,
          url: brand.url,
        },
      ]),
  );
}

async function fetchHiltonLocationTotals() {
  const query = `query locationTotal($path: String!, $language: String!) {
    geocodePage(path: $path, language: $language) {
      match {
        name
        type
        address {
          country
          countryName
        }
      }
      hotelSummaryOptions {
        _hotels {
          totalSize
        }
        hotels(first: 1) {
          ctyhocn
        }
      }
    }
  }`;
  const paths = {
    CN: "locations/china",
    HK: "locations/hong-kong",
    MO: "locations/macao",
    TW: "locations/taiwan",
  };
  const totals = {};
  for (const [countryCode, path] of Object.entries(paths)) {
    const payload = await postHiltonGraphql(query, { path, language: "en" });
    totals[countryCode] = payload.data?.geocodePage?.hotelSummaryOptions?._hotels?.totalSize ?? null;
    await delay(120);
  }
  return totals;
}

async function fetchHiltonHotels(context) {
  const extract = await fetchJson(sourceUrls.hiltonExtract);
  const hotels = Object.values(extract)
    .filter((hotel) => regionByCountryCode[hotel?.address?.country])
    .map((hotel) => toHiltonRecord(hotel, context.brands));
  return hotels;
}

function toHiltonRecord(hotel, brandsByCode) {
  const regionCode = regionByCountryCode[hotel.address.country];
  const brand = brandsByCode[hotel.brandCode] ?? {
    name: hotel.brandCode,
    canonicalSlug: slugify(hotel.brandCode),
  };
  const display = hotel.display ?? {};
  const address = hotel.address ?? {};
  const coordinates = hotel.localization?.coordinate ?? {};
  const propertySiteURL_en = hotel.facilityOverview?.homeUrlTemplate ?? null;

  return makeHotel({
    chain: "Hilton",
    source: "hilton_official_hotel_summary_extract",
    official_locale_primary: "en-US",
    official_locale_secondary: "zh-Hans",
    spiritCode: `HILTON-${hotel.ctyhocn}`,
    name_en: hotel.name,
    brand_en: brand.name,
    brand_zh: hiltonBrandZh[brand.name] ?? null,
    brandKey: `hilton-${brand.canonicalSlug || slugify(brand.name)}`,
    hotelStatus: display.open === false ? "OPENING_SOON" : "FULLY_BOOKABLE",
    city_en: address.city,
    province_en: address.stateName || address.state,
    regionCode,
    address1_en: address.addressFmt || composeAddress([address.addressLine1, address.city, address.stateName, address.postalCode, address.countryName]),
    zipcode: address.postalCode,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    phone: hotel.contactInfo?.phoneNumber,
    propertySiteURL_en,
    propertySiteURL_zh: toHiltonZhUrl(propertySiteURL_en),
    bookableDate: display.resEnabledDate,
    openDate: display.openDate,
    amenities_en: [],
    amenityKeys: hotel.amenityIds ?? [],
    characteristics_en: display.treatments ?? [],
    thumbnails: collectHiltonImages(hotel.images),
    raw_en: {
      source_url: sourceUrls.hiltonExtract,
      item: sanitizeHiltonHotel(hotel),
      brand,
    },
  });
}

async function fetchIhgHotels() {
  const sourcePages = [];
  const byCode = new Map();

  const mainland = await fetchIhgPage(sourceUrls.ihgMainland, "mainland");
  sourcePages.push(mainland.pageMeta);
  addIhgRecords(byCode, mainland.hotels, sourceUrls.ihgMainland);
  const mainlandSignature = mainland.hotels
    .slice(0, 20)
    .map((hotel) => hotel.code)
    .join("|");

  const cityUrls = extractIhgMainlandLinks(mainland.html);
  let cityPagesUsed = 0;
  let fallbackPagesSkipped = 0;
  let failedPages = 0;
  for (const url of cityUrls) {
    try {
      const page = await fetchIhgPage(url, "mainland_city");
      const signature = page.hotels
        .slice(0, 20)
        .map((hotel) => hotel.code)
        .join("|");
      const isFallbackRecommendationPage = page.hotels.length >= 190 && signature === mainlandSignature;
      sourcePages.push({ ...page.pageMeta, isFallbackRecommendationPage });
      if (isFallbackRecommendationPage) {
        fallbackPagesSkipped += 1;
      } else {
        cityPagesUsed += 1;
        addIhgRecords(byCode, page.hotels, url);
      }
    } catch (error) {
      failedPages += 1;
      sourcePages.push({ url, kind: "mainland_city", error: error.message });
    }
    await delay(90);
  }

  for (const [url, kind] of [
    [sourceUrls.ihgHongKong, "hong_kong"],
    [sourceUrls.ihgMacau, "macau"],
    [sourceUrls.ihgTaiwan, "taiwan"],
  ]) {
    const page = await fetchIhgPage(url, kind);
    sourcePages.push(page.pageMeta);
    addIhgRecords(byCode, page.hotels, url);
    await delay(120);
  }

  return {
    hotels: Array.from(byCode.values()).map(toIhgRecord),
    sourcePages,
    mainland_city_pages_discovered: cityUrls.length,
    mainland_city_pages_used: cityPagesUsed,
    mainland_fallback_pages_skipped: fallbackPagesSkipped,
    failed_pages: failedPages,
  };
}

async function fetchIhgPage(url, kind) {
  const response = await fetch(url, {
    headers: {
      "accept-language": "en-US,en;q=0.9",
      "user-agent": userAgent,
    },
  });
  if (!response.ok) throw new Error(`IHG fetch failed ${response.status} ${url}`);
  const html = await response.text();
  const hotels = parseIhgHotelJsonLd(html);
  return {
    html,
    hotels,
    pageMeta: {
      url,
      kind,
      status: response.status,
      hotel_json_ld_count: hotels.length,
      title: cleanText(firstMatch(html, /<title>([\s\S]*?)<\/title>/i)),
    },
  };
}

function parseIhgHotelJsonLd(html) {
  const hotels = [];
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = decodeHtmlEntities(match[1]).trim();
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.["@type"] !== "Hotel") continue;
      const code = firstMatch(parsed.url, /\/([a-z0-9]{5})\/hoteldetail/i)?.toUpperCase();
      if (!code) continue;
      hotels.push({
        code,
        jsonLd: parsed,
      });
    } catch {
      // Non-critical structured-data blocks can be malformed; hotel blocks parse cleanly.
    }
  }
  return hotels;
}

function addIhgRecords(byCode, hotels, sourceUrl) {
  for (const item of hotels) {
    byCode.set(item.code, { ...item, sourceUrl });
  }
}

function extractIhgMainlandLinks(html) {
  const urls = new Set();
  for (const match of html.matchAll(/href="([^"]*mainland-china[^"]*)"/g)) {
    const url = new URL(decodeHtmlEntities(match[1]), "https://www.ihg.com").toString();
    const pathname = new URL(url).pathname;
    if (pathname === "/mainland-china") continue;
    if (!/-mainland-china(?:\/)?$/i.test(pathname)) continue;
    urls.add(url);
  }
  return Array.from(urls).sort();
}

function toIhgRecord(item) {
  const ld = item.jsonLd;
  const address = ld.address ?? {};
  const brandName = cleanText(ld.brand?.name) ?? "IHG Hotels & Resorts";
  const regionCode = regionByIhgCountry[cleanText(address.addressCountry)] ?? null;
  if (!regionCode) {
    throw new Error(`Unknown IHG country ${address.addressCountry} for ${item.code}`);
  }

  return makeHotel({
    chain: "IHG Hotels & Resorts",
    source: "ihg_official_destination_pages_json_ld",
    official_locale_primary: "en-US",
    official_locale_secondary: "zh-CN",
    spiritCode: `IHG-${item.code}`,
    name_en: cleanText(ld.name),
    brand_en: brandName,
    brand_zh: ihgBrandZh[brandName] ?? null,
    brandKey: `ihg-${slugify(brandName)}`,
    hotelStatus: "FULLY_BOOKABLE",
    city_en: cleanText(address.addressLocality),
    province_en: cleanText(address.addressRegion),
    regionCode,
    address1_en: composeAddress([address.streetAddress, address.addressLocality, address.addressRegion, address.postalCode, address.addressCountry]),
    zipcode: cleanText(address.postalCode),
    latitude: ld.geo?.latitude,
    longitude: ld.geo?.longitude,
    phone: cleanText(ld.telephone),
    propertySiteURL_en: ld.url,
    propertySiteURL_zh: toIhgZhUrl(ld.url),
    thumbnails: [ld.image].filter(Boolean),
    brandlogo: ld.logo ?? ld.brand?.logo ?? null,
    verifiedRating: ld.aggregateRating?.ratingValue,
    verifiedNumReviews: ld.aggregateRating?.ratingCount,
    raw_en: {
      source_url: item.sourceUrl,
      item: sanitizeIhgJsonLd(ld),
    },
  });
}

function makeHotel(input) {
  const regionCode = input.regionCode;
  const region = regionDefinitions[regionCode];
  if (!region) throw new Error(`Unknown regionCode ${regionCode} for ${input.spiritCode}`);
  const city_en = cleanText(input.city_en);
  const province_en = cleanText(input.province_en);

  const record = {
    chain: input.chain,
    source: input.source,
    official_locale_primary: input.official_locale_primary ?? "en-US",
    official_locale_secondary: input.official_locale_secondary ?? null,
    spiritCode: input.spiritCode,
    name_en: cleanText(input.name_en),
    name_zh: cleanText(input.name_zh),
    brand_en: cleanText(input.brand_en),
    brand_zh: cleanText(input.brand_zh),
    brandKey: input.brandKey,
    hotelStatus: input.hotelStatus ?? "FULLY_BOOKABLE",
    propertyType: input.propertyType ?? "Hotel",
    gpCategory: input.gpCategory ?? "Hotel",
    city_en,
    city_zh: cleanText(input.city_zh) ?? cityZh[city_en] ?? null,
    province_en,
    province_zh: cleanText(input.province_zh) ?? cityZh[province_en] ?? null,
    region_en: region.region_en,
    region_zh: region.region_zh,
    regionCode,
    subRegionCode: input.subRegionCode ?? regionCode,
    subRegionLabel_en: input.subRegionLabel_en ?? region.region_en,
    subRegionLabel_zh: input.subRegionLabel_zh ?? region.region_zh,
    country_en: region.country_en,
    country_zh: region.country_zh,
    countryCode: region.countryCode,
    countryDisplay_en: region.countryDisplay_en,
    countryDisplay_zh: region.countryDisplay_zh,
    address1_en: cleanText(input.address1_en),
    address1_zh: cleanText(input.address1_zh),
    zipcode: cleanText(input.zipcode),
    latitude: toNumber(input.latitude),
    longitude: toNumber(input.longitude),
    phone: cleanText(input.phone),
    email: cleanText(input.email),
    propertySiteURL_en: input.propertySiteURL_en ?? null,
    propertySiteURL_zh: input.propertySiteURL_zh ?? null,
    externalBookingURL_en: input.externalBookingURL_en ?? null,
    externalBookingURL_zh: input.externalBookingURL_zh ?? null,
    bookableDate: input.bookableDate ?? null,
    openDate: input.openDate ?? null,
    checkinTime: input.checkinTime ?? null,
    checkoutTime: input.checkoutTime ?? null,
    nonSmoking: input.nonSmoking ?? null,
    excludeFromBrandFilter: input.excludeFromBrandFilter ?? false,
    showBrandLogo: input.showBrandLogo ?? true,
    suppressBrandLogo: input.suppressBrandLogo ?? false,
    description_en: cleanText(input.description_en),
    description_zh: cleanText(input.description_zh),
    amenities_en: Array.isArray(input.amenities_en) ? input.amenities_en.filter(Boolean) : [],
    amenities_zh: Array.isArray(input.amenities_zh) ? input.amenities_zh.filter(Boolean) : [],
    amenityKeys: Array.isArray(input.amenityKeys) ? input.amenityKeys.filter(Boolean) : [],
    characteristics_en: Array.isArray(input.characteristics_en) ? input.characteristics_en.filter(Boolean) : [],
    characteristics_zh: Array.isArray(input.characteristics_zh) ? input.characteristics_zh.filter(Boolean) : [],
    thumbnails: Array.isArray(input.thumbnails) ? Array.from(new Set(input.thumbnails.filter(Boolean))) : [],
    brandlogo: input.brandlogo ?? null,
    flag: input.flag ?? null,
    verifiedRating: toNumber(input.verifiedRating),
    verifiedNumReviews: toNumber(input.verifiedNumReviews),
    lastRenovationDate: input.lastRenovationDate ?? null,
    raw_en: input.raw_en ?? null,
    raw_zh: input.raw_zh ?? null,
  };

  return Object.fromEntries(hotelKeys.map((key) => [key, record[key] ?? null]));
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json,text/plain,*/*",
      "accept-language": "en-US,en;q=0.9",
      "user-agent": userAgent,
    },
  });
  if (!response.ok) throw new Error(`Fetch failed ${response.status} ${url}`);
  return response.json();
}

async function postHiltonGraphql(query, variables) {
  const response = await fetch(sourceUrls.hiltonGraphql, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": userAgent,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(`Hilton GraphQL failed ${response.status}`);
  const payload = await response.json();
  if (payload.errors) throw new Error(`Hilton GraphQL errors: ${JSON.stringify(payload.errors).slice(0, 500)}`);
  return payload;
}

function sanitizeHiltonHotel(hotel) {
  const {
    leadRate,
    distance,
    distanceFmt,
    _id,
    ...rest
  } = hotel;
  return rest;
}

function sanitizeIhgJsonLd(ld) {
  const { sameAs, ...rest } = ld;
  return rest;
}

function collectHiltonImages(images) {
  const urls = [];
  const addRatios = (image) => {
    for (const ratio of image?.ratios ?? []) {
      if (ratio?.url) urls.push(ratio.url);
    }
  };
  addRatios(images?.master);
  for (const image of images?.carousel ?? []) addRatios(image);
  return Array.from(new Set(urls));
}

function composeAddress(parts) {
  return cleanText(parts.filter(Boolean).join(", "));
}

function toHiltonZhUrl(url) {
  if (!url) return null;
  return url.replace("https://www.hilton.com/en/", "https://www.hilton.com/zh-hans/");
}

function toIhgZhUrl(url) {
  if (!url) return null;
  return url.replace("/hotels/us/en/", "/hotels/cn/zh/");
}

function firstMatch(value, pattern) {
  const match = String(value ?? "").match(pattern);
  return match ? decodeHtmlEntities(match[1]) : null;
}

function cleanText(value) {
  if (value === null || value === undefined || value === "") return null;
  const cleaned = decodeHtmlEntities(value)
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

function decodeHtmlEntities(value) {
  return String(value ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function slugify(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function compareHotels(a, b) {
  return (
    (chainOrder.get(a.chain) ?? 99) - (chainOrder.get(b.chain) ?? 99) ||
    a.regionCode.localeCompare(b.regionCode) ||
    String(a.city_en ?? "").localeCompare(String(b.city_en ?? "")) ||
    String(a.name_en ?? a.name_zh ?? "").localeCompare(String(b.name_en ?? b.name_zh ?? ""))
  );
}

function validateRecords(hotels) {
  const seen = new Set();
  for (const hotel of hotels) {
    if (Object.keys(hotel).join("\n") !== hotelKeys.join("\n")) {
      throw new Error(`Schema mismatch for ${hotel.spiritCode}`);
    }
    if (seen.has(hotel.spiritCode)) throw new Error(`Duplicate spiritCode ${hotel.spiritCode}`);
    seen.add(hotel.spiritCode);
    if (!["MAINLAND_CN", "HK", "MO", "TW"].includes(hotel.regionCode)) {
      throw new Error(`Out-of-scope region ${hotel.regionCode} for ${hotel.spiritCode}`);
    }
  }
}

function assertNoRateFields(hotels) {
  const text = JSON.stringify(hotels);
  const forbidden = ["leadRate", "rateAmount", "ratePlanCode", "ratePlanName", "ratePlanDesc", "lowest"];
  const found = forbidden.filter((term) => text.includes(term));
  if (found.length) throw new Error(`Rate fields leaked into output: ${found.join(", ")}`);
}

function buildMetadata(hotels, ihgResult, hiltonContext) {
  return {
    generated_at: fetchedAt,
    scope: "greater_china_ihg_hilton_official_public_lists",
    usage,
    record_count: hotels.length,
    included_regions: ["Mainland China", "Hong Kong", "Macau", "Taiwan"],
    chain_counts: countBy(hotels, "chain"),
    region_counts: countBy(hotels, "regionCode"),
    status_counts: countBy(hotels, "hotelStatus"),
    source_counts: countBy(hotels, "source"),
    brand_counts: countBy(hotels, "brand_en"),
    missing_counts: {
      address1_en: hotels.filter((hotel) => !hotel.address1_en).length,
      coordinates: hotels.filter((hotel) => hotel.latitude === null || hotel.longitude === null).length,
      phone: hotels.filter((hotel) => !hotel.phone).length,
      propertySiteURL_en: hotels.filter((hotel) => !hotel.propertySiteURL_en).length,
    },
    ihg_crawl: {
      mainland_city_pages_discovered: ihgResult.mainland_city_pages_discovered,
      mainland_city_pages_used: ihgResult.mainland_city_pages_used,
      mainland_fallback_pages_skipped: ihgResult.mainland_fallback_pages_skipped,
      failed_pages: ihgResult.failed_pages,
      source_page_count: ihgResult.sourcePages.length,
    },
    hilton_official_location_totals: hiltonContext.locationTotals,
    note:
      "No live booking rates, live inventory, login-only data, or review text were retained. Hilton source extract contains lead-rate fields globally, but those fields are stripped before output.",
  };
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] ?? "null";
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function toCsv(hotels) {
  const rows = [csvColumns, ...hotels.map((hotel) => csvColumns.map((column) => csvValue(hotel[column])))];
  return `${rows.map((row) => row.join(",")).join("\n")}\n`;
}

function csvValue(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value) || typeof value === "object") value = JSON.stringify(value);
  const string = String(value);
  if (/[",\n]/.test(string)) return `"${string.replace(/"/g, '""')}"`;
  return string;
}

function toSummary(metadata) {
  const chainRows = Object.entries(metadata.chain_counts)
    .map(([chain, count]) => `| ${chain} | ${count} |`)
    .join("\n");
  const regionRows = Object.entries(metadata.region_counts)
    .map(([region, count]) => `| ${region} | ${count} |`)
    .join("\n");
  const topBrandRows = Object.entries(metadata.brand_counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([brand, count]) => `| ${brand} | ${count} |`)
    .join("\n");

  return `# IHG and Hilton Greater China Official Hotels

- Generated at: ${metadata.generated_at}
- Scope: Mainland China + Hong Kong + Macau + Taiwan
- Usage: ${metadata.usage}
- Record count: ${metadata.record_count}
- Schema: aligned to Hyatt/Marriott official hotel export field names
- Excluded from output: live booking rates, live inventory, login-only data, review text

## Counts by Chain

| Chain | Count |
| --- | ---: |
${chainRows}

## Counts by Region

| Region | Count |
| --- | ---: |
${regionRows}

## Top Brand Counts

| Brand | Count |
| --- | ---: |
${topBrandRows}

## Missing Field Counts

| Field | Missing |
| --- | ---: |
| address1_en | ${metadata.missing_counts.address1_en} |
| coordinates | ${metadata.missing_counts.coordinates} |
| phone | ${metadata.missing_counts.phone} |
| propertySiteURL_en | ${metadata.missing_counts.propertySiteURL_en} |

## Crawl Notes

- IHG mainland city pages discovered: ${metadata.ihg_crawl.mainland_city_pages_discovered}
- IHG mainland city pages used: ${metadata.ihg_crawl.mainland_city_pages_used}
- IHG fallback recommendation pages skipped: ${metadata.ihg_crawl.mainland_fallback_pages_skipped}
- IHG failed pages: ${metadata.ihg_crawl.failed_pages}
- Hilton official location totals: CN ${metadata.hilton_official_location_totals.CN}, HK ${metadata.hilton_official_location_totals.HK}, MO ${metadata.hilton_official_location_totals.MO}, TW ${metadata.hilton_official_location_totals.TW}
`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
