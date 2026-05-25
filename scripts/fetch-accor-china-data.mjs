import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "node:process";
import { hotelSourceDir } from "./paths.mjs";

const outputDir = hotelSourceDir;
const linkPath = join(outputDir, "accor-china-official-hotel-links.json");
const outputJsonPath = join(outputDir, "accor-china-official-hotels.json");
const userAgent = "michelin-list-personal-research/0.1 (+low-frequency official Accor hotel detail collection)";

const brandZhByEn = {
  "Banyan Tree": "悦榕庄",
  Angsana: "悦椿",
  Dhawa: "达瓦",
  Fairmont: "费尔蒙",
  Garrya: "悦柳",
  "Grand Mercure": "美爵",
  Ibis: "宜必思",
  ibis: "宜必思",
  "Ibis Styles": "宜必思尚品",
  "ibis Styles": "宜必思尚品",
  Mercure: "美居",
  MGallery: "美憬阁",
  Mgallery: "美憬阁",
  Mondrian: "梦卓恩",
  Mövenpick: "瑞享",
  Novotel: "诺富特",
  "Novotel Living": "诺富特公寓",
  Pullman: "铂尔曼",
  Raffles: "莱佛士",
  Sofitel: "索菲特",
  "Sofitel Legend": "索菲特传奇",
  Swissôtel: "瑞士酒店",
  "Swissôtel Hotels & Resorts": "瑞士酒店",
  "The Sebel": "诗铂",
  "Jo&Joe": "JO&JOE",
  TRIBE: "芮族",
};

const zhOverridesBySpiritCode = {
  3562: { name_zh: "香港世纪诺富特酒店" },
  3563: { name_zh: "宜必思香港北角酒店" },
  6239: { name_zh: "香港诺富特东荟城酒店" },
  6480: { name_zh: "澳门十六浦索菲特大酒店" },
  7606: { name_zh: "宜必思香港中上环酒店" },
  B1U0: { name_zh: "澳门悦榕庄" },
  B5L5: { name_zh: "香港明怡美憬阁精选酒店" },
  B7J3: { name_zh: "香港梦卓恩酒店" },
  B824: { name_zh: "澳门银河莱佛士" },
};

const officialDetailSupplementBySpiritCode = {
  3562: {
    name_en: "Novotel Century Hong Kong",
    name_zh: "香港世纪诺富特酒店",
    brand_en: "Novotel",
    countryCode: "HK",
    city_en: "Hong Kong",
    address1_en: "238 Jaffe Road, WANCHAI",
    latitude: 22.278836,
    longitude: 114.176504,
  },
  3563: {
    name_en: "ibis Hong Kong North Point",
    name_zh: "宜必思香港北角酒店",
    brand_en: "ibis",
    countryCode: "HK",
    city_en: "Hong Kong",
    address1_en: "138 Java Road, NORTH POINT",
    latitude: 22.292323,
    longitude: 114.200432,
    phone: "+852 2588 1111",
    email: "h3563@accor.com",
  },
  6239: {
    name_en: "Novotel Hong Kong Citygate",
    name_zh: "香港诺富特东荟城酒店",
    brand_en: "Novotel",
    countryCode: "HK",
    city_en: "Hong Kong",
    address1_en: "51 Man Tung Road, Tung Chung",
    latitude: 22.291456,
    longitude: 113.943207,
    phone: "+852 3602 8888",
    email: "H6239@accor.com",
  },
  6480: {
    name_en: "Sofitel Macau at Ponte 16",
    name_zh: "澳门十六浦索菲特大酒店",
    brand_en: "Sofitel",
    countryCode: "MO",
    city_en: "Macau",
    address1_en: "Rua do Visconde Paco de Arcos",
    latitude: 22.196944,
    longitude: 113.535833,
  },
  7606: {
    name_en: "ibis Hong Kong Central & Sheung Wan",
    name_zh: "宜必思香港中上环酒店",
    brand_en: "ibis",
    countryCode: "HK",
    city_en: "Hong Kong",
    address1_en: "No 28 Des Voeux Road West, Sheung Wan",
    latitude: 22.287697,
    longitude: 114.147558,
    phone: "+852 2252 2929",
    email: "H7606-RE10@accor.com",
  },
  A4A4: {
    name_en: "The Silveri Hotel Hong Kong - MGallery Collection",
    name_zh: "香港银樾美憬阁精选酒店",
    brand_en: "MGallery",
    countryCode: "HK",
    city_en: "Hong Kong",
    address1_en: "16 Tat Tung Road, Tung Chung",
    latitude: 22.290521,
    longitude: 113.941118,
    phone: "+852 3602 8989",
    email: "ha4a4@accor.com",
  },
  B1U0: {
    name_en: "Banyan Tree Macau",
    name_zh: "澳门悦榕庄",
    brand_en: "Banyan Tree",
    countryCode: "MO",
    city_en: "Macau",
    address1_en: "Avenida Marginal Flor de Lotus, Cotai, Macau, China",
    latitude: 22.148687,
    longitude: 113.552715,
    phone: "+853 8883 6888",
    email: "macau@banyantree.com",
  },
  B5L5: {
    name_en: "AKI Hotel Hong Kong - MGallery Collection",
    name_zh: "香港明怡美憬阁精选酒店",
    brand_en: "MGallery",
    countryCode: "HK",
    city_en: "Hong Kong",
    address1_en: "239 Jaffe Road",
    latitude: 22.279171,
    longitude: 114.176875,
    phone: "+852 2121 5000",
    email: "HB5L5@accor.com",
  },
  B7J3: {
    name_en: "Mondrian Hong Kong",
    name_zh: "香港梦卓恩酒店",
    brand_en: "Mondrian",
    countryCode: "HK",
    city_en: "Hong Kong",
    address1_en: "8A Hart Avenue, Tsim Sha Tsui",
    latitude: 22.297716,
    longitude: 114.174763,
    phone: "+852 3550 0388",
    email: "hongkong@mondrianhotels.com",
  },
  B824: {
    name_en: "Raffles at Galaxy Macau",
    name_zh: "澳门银河莱佛士",
    brand_en: "Raffles",
    countryCode: "MO",
    city_en: "Macau",
    address1_en: "Galaxy Macau Estrada Da Baia, Da Nossa Senhora, Da Esperance Cotai",
    latitude: 22.150363,
    longitude: 113.553726,
    phone: "+853 8886 3388",
    email: "info@rafflesmacau.com",
  },
};

const linksPayload = JSON.parse(readFileSync(linkPath, "utf8"));
const links = [...(linksPayload.hotels ?? [])].sort((left, right) =>
  left.code.localeCompare(right.code),
);
const existingHotelsByCode = env.ACCOR_USE_CACHE === "1" && existsSync(outputJsonPath)
  ? new Map(JSON.parse(readFileSync(outputJsonPath, "utf8")).hotels.map((hotel) => [hotel.spiritCode, hotel]))
  : new Map();
const hotels = [];

for (const [index, link] of links.entries()) {
  const hotel = existingHotelsByCode.has(link.code)
    ? normalizeCachedHotel(existingHotelsByCode.get(link.code))
    : officialDetailSupplementBySpiritCode[link.code]
      ? supplementHotel(link)
      : await fetchHotel(link);
  hotels.push(hotel);
  console.log(`${index + 1}/${links.length} ${hotel.spiritCode} ${hotel.name_zh || hotel.name_en}`);
  await sleep(120);
}

writeFileSync(
  outputJsonPath,
  `${JSON.stringify(
    {
      metadata: {
        source: "accor_official_greater_china_destination_and_hotel_json_ld",
        official_sites: linksPayload.metadata?.source_urls ?? {
          list_en: "https://all.accor.com/a/en/destination/country/hotels-china-pcn.html",
        },
        source_link_count: links.length,
        fetchedAt: new Date().toISOString(),
      },
      hotels: hotels.sort((left, right) => left.spiritCode.localeCompare(right.spiritCode)),
    },
    null,
    2,
  )}\n`,
);

console.log(`Wrote ${hotels.length} Accor hotels to ${outputJsonPath}`);

async function fetchHotel(link) {
  const code = link.code;
  const propertySiteURL_en = `https://all.accor.com/hotel/${code}/index.en.shtml`;
  const propertySiteURL_zh = `https://all.accor.com/hotel/${code}/index.zh.shtml`;
  const isZhOptional = link.destinationKey === "hong_kong" || link.destinationKey === "macau" || link.destinationKey === "taiwan";
  const [enPage, zhPage] = await Promise.all([
    fetchHotelPage(propertySiteURL_en, "en-US,en;q=0.9", { optional: false }),
    fetchHotelPage(propertySiteURL_zh, "zh-CN,zh;q=0.9", { optional: isZhOptional }),
  ]);
  const enHotel = enPage.hotel ?? {};
  const zhHotel = zhPage.hotel ?? {};
  const enBreadcrumb = enPage.breadcrumb?.itemListElement ?? [];
  const zhBreadcrumb = zhPage.breadcrumb?.itemListElement ?? [];
  const brandEn = cleanText(enHotel.brand?.name ?? zhHotel.brand?.name);
  const latitude = numberOrNull(zhHotel.geo?.latitude ?? enHotel.geo?.latitude);
  const longitude = numberOrNull(zhHotel.geo?.longitude ?? enHotel.geo?.longitude);
  const countryCode = cleanText(zhHotel.address?.addressCountry ?? enHotel.address?.addressCountry) || "CN";
  const region = regionForCountryCode(countryCode);
  const zhOverride = zhOverridesBySpiritCode[code] ?? {};

  return {
    chain: "Accor",
    chain_zh: "雅高集团",
    source: "accor_official_greater_china_destination_and_hotel_json_ld",
    official_locale_primary: "zh-CN",
    official_locale_secondary: "en-US",
    spiritCode: code,
    name_en: normalizeAccorName(enHotel.legalName ?? enHotel.name ?? link.name_en_list),
    name_zh: normalizeAccorName(zhHotel.legalName ?? zhHotel.name ?? zhOverride.name_zh ?? zhPage.h1),
    brand_en: brandEn,
    brand_zh: brandZhByEn[brandEn] ?? "",
    brandKey: slugify(brandEn),
    hotelStatus: "FULLY_BOOKABLE",
    propertyType: "Hotel",
    gpCategory: null,
    city_en: titleCase(enHotel.address?.addressLocality ?? enBreadcrumb[4]?.name ?? ""),
    city_zh: cleanText(zhHotel.address?.addressLocality ?? zhBreadcrumb[4]?.name) || region.city_zh,
    province_en: cleanText(enBreadcrumb[3]?.name) || region.province_en,
    province_zh: cleanText(zhBreadcrumb[3]?.name) || region.province_zh,
    region_en: region.region_en,
    region_zh: region.region_zh,
    regionCode: region.regionCode,
    subRegionCode: null,
    subRegionLabel_en: null,
    subRegionLabel_zh: null,
    country_en: region.country_en,
    country_zh: region.country_zh,
    countryCode,
    countryDisplay_en: region.countryDisplay_en,
    countryDisplay_zh: region.countryDisplay_zh,
    address1_en: cleanText(enHotel.address?.streetAddress),
    address1_zh: cleanText(zhHotel.address?.streetAddress),
    zipcode: cleanText(zhHotel.address?.postalCode ?? enHotel.address?.postalCode) || null,
    latitude,
    longitude,
    phone: cleanText(zhHotel.telephone ?? enHotel.telephone) || null,
    email: cleanText(zhHotel.email ?? enHotel.email) || null,
    propertySiteURL_en,
    propertySiteURL_zh: zhPage.hotel ? propertySiteURL_zh : null,
    externalBookingURL_en: null,
    externalBookingURL_zh: null,
    bookableDate: null,
    openDate: null,
    checkinTime: zhHotel.checkinTime ?? enHotel.checkinTime ?? null,
    checkoutTime: zhHotel.checkoutTime ?? enHotel.checkoutTime ?? null,
    nonSmoking: null,
    excludeFromBrandFilter: false,
    showBrandLogo: true,
    suppressBrandLogo: false,
    description_en: cleanText(enHotel.description) || null,
    description_zh: cleanText(zhHotel.description) || null,
    amenities_en: [],
    amenities_zh: [],
    amenityKeys: [],
    characteristics_en: [],
    characteristics_zh: [],
    thumbnails: [zhHotel.image ?? enHotel.image].filter(Boolean),
    brandlogo: zhHotel.logo ?? enHotel.logo ?? enHotel.brand?.logo ?? zhHotel.brand?.logo ?? null,
    flag: null,
    verifiedRating: numberOrNull(zhHotel.aggregateRating?.ratingValue ?? enHotel.aggregateRating?.ratingValue),
    verifiedNumReviews: numberOrNull(zhHotel.aggregateRating?.reviewCount ?? enHotel.aggregateRating?.reviewCount),
    lastRenovationDate: null,
    raw_en: enPage.raw,
    raw_zh: zhPage.raw,
  };
}

function supplementHotel(link) {
  const supplement = officialDetailSupplementBySpiritCode[link.code];
  const region = regionForCountryCode(supplement.countryCode);
  const brandEn = supplement.brand_en;

  return {
    chain: "Accor",
    chain_zh: "雅高集团",
    source: "accor_official_greater_china_public_page_supplement",
    official_locale_primary: "en-US",
    official_locale_secondary: null,
    spiritCode: link.code,
    name_en: supplement.name_en,
    name_zh: supplement.name_zh,
    brand_en: brandEn,
    brand_zh: brandZhByEn[brandEn] ?? "",
    brandKey: slugify(brandEn),
    hotelStatus: "FULLY_BOOKABLE",
    propertyType: "Hotel",
    gpCategory: null,
    city_en: supplement.city_en,
    city_zh: region.city_zh,
    province_en: region.province_en,
    province_zh: region.province_zh,
    region_en: region.region_en,
    region_zh: region.region_zh,
    regionCode: region.regionCode,
    subRegionCode: null,
    subRegionLabel_en: null,
    subRegionLabel_zh: null,
    country_en: region.country_en,
    country_zh: region.country_zh,
    countryCode: supplement.countryCode,
    countryDisplay_en: region.countryDisplay_en,
    countryDisplay_zh: region.countryDisplay_zh,
    address1_en: supplement.address1_en,
    address1_zh: "",
    zipcode: null,
    latitude: supplement.latitude,
    longitude: supplement.longitude,
    phone: supplement.phone ?? null,
    email: supplement.email ?? null,
    propertySiteURL_en: `https://all.accor.com/hotel/${link.code}/index.en.shtml`,
    propertySiteURL_zh: null,
    externalBookingURL_en: null,
    externalBookingURL_zh: null,
    bookableDate: null,
    openDate: null,
    checkinTime: null,
    checkoutTime: null,
    nonSmoking: null,
    excludeFromBrandFilter: false,
    showBrandLogo: true,
    suppressBrandLogo: false,
    description_en: null,
    description_zh: null,
    amenities_en: [],
    amenities_zh: [],
    amenityKeys: [],
    characteristics_en: [],
    characteristics_zh: [],
    thumbnails: [],
    brandlogo: null,
    flag: null,
    verifiedRating: null,
    verifiedNumReviews: null,
    lastRenovationDate: null,
    raw_en: {
      source_url: `https://all.accor.com/hotel/${link.code}/index.en.shtml`,
      source: "official_public_page_supplement",
    },
    raw_zh: null,
  };
}

function normalizeCachedHotel(hotel) {
  const brandEn = cleanText(hotel.brand_en);
  const region = regionForCountryCode(hotel.countryCode);

  return {
    ...hotel,
    chain_zh: "雅高集团",
    source: "accor_official_greater_china_destination_and_hotel_json_ld",
    brand_zh: cleanText(hotel.brand_zh) || brandZhByEn[brandEn] || "",
    region_en: hotel.region_en || region.region_en,
    region_zh: hotel.region_zh || region.region_zh,
    regionCode: hotel.regionCode || region.regionCode,
    province_en: hotel.province_en || region.province_en,
    province_zh: hotel.province_zh || region.province_zh,
    city_zh: hotel.city_zh || region.city_zh,
    country_en: hotel.country_en || region.country_en,
    country_zh: hotel.country_zh || region.country_zh,
    countryDisplay_en: hotel.countryDisplay_en || region.countryDisplay_en,
    countryDisplay_zh: hotel.countryDisplay_zh || region.countryDisplay_zh,
  };
}

async function fetchHotelPage(url, acceptLanguage, { optional }) {
  const response = await fetch(url, {
    headers: {
      "accept-language": acceptLanguage,
      ...(env.ACCOR_COOKIE ? { cookie: env.ACCOR_COOKIE } : {}),
      "user-agent": userAgent,
    },
  });

  if (!response.ok) {
    if (optional) return { hotel: null, breadcrumb: null, h1: "", raw: { source_url: url, status: response.status } };
    throw new Error(`Accor detail fetch failed ${response.status}: ${url}`);
  }

  const html = await response.text();
  const jsonLd = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => safeJson(match[1]))
    .filter(Boolean);
  const hotel = jsonLd.find((item) => item["@type"] === "Hotel") ?? null;
  const breadcrumb = jsonLd.find((item) => item["@type"] === "BreadcrumbList") ?? null;
  const h1 = cleanText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, " "));

  return {
    hotel,
    breadcrumb,
    h1,
    raw: {
      source_url: url,
      status: response.status,
      hotel,
      breadcrumb,
    },
  };
}

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeAccorName(value) {
  return cleanText(value)
    .replace(/\s+-\s+ALL$/i, "")
    .replace(/\s+\d+\s*星$/i, "")
    .replace(/\s+\d+\s*stars?$/i, "")
    .trim();
}

function cleanText(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function titleCase(value) {
  return cleanText(value)
    .toLocaleLowerCase()
    .replace(/\b\w/g, (character) => character.toLocaleUpperCase());
}

function regionForCountryCode(countryCode) {
  if (countryCode === "HK") {
    return {
      region_en: "Hong Kong",
      region_zh: "中国香港",
      regionCode: "HK",
      province_en: "Hong Kong",
      province_zh: "香港",
      city_zh: "香港",
      country_en: "Hong Kong SAR, China",
      country_zh: "中国香港",
      countryDisplay_en: "Hong Kong SAR, China",
      countryDisplay_zh: "中国香港",
    };
  }

  if (countryCode === "MO") {
    return {
      region_en: "Macau",
      region_zh: "中国澳门",
      regionCode: "MO",
      province_en: "Macau",
      province_zh: "澳门",
      city_zh: "澳门",
      country_en: "Macau SAR, China",
      country_zh: "中国澳门",
      countryDisplay_en: "Macau SAR, China",
      countryDisplay_zh: "中国澳门",
    };
  }

  if (countryCode === "TW") {
    return {
      region_en: "Taiwan",
      region_zh: "中国台湾",
      regionCode: "TW",
      province_en: "Taiwan",
      province_zh: "台湾",
      city_zh: "台湾",
      country_en: "Taiwan, China",
      country_zh: "中国台湾",
      countryDisplay_en: "Taiwan, China",
      countryDisplay_zh: "中国台湾",
    };
  }

  return {
    region_en: "Mainland China",
    region_zh: "中国大陆",
    regionCode: "MAINLAND_CN",
    province_en: "",
    province_zh: "",
    city_zh: "",
    country_en: "China",
    country_zh: "中国",
    countryDisplay_en: "China",
    countryDisplay_zh: "中国",
  };
}

function slugify(value) {
  return cleanText(value)
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
