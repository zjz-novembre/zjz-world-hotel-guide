import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hotelSourceDir } from "./paths.mjs";

const sourceUrl = "https://www.urcovehyatt.cn/";
const outputPath = join(hotelSourceDir, "urcove-hyatt-china-official-hotels.json");
const summaryPath = join(hotelSourceDir, "urcove-hyatt-china-official-hotels-summary.md");

const provinceByCityZh = {
  上海: "上海",
  北京: "北京",
  天津: "天津",
  重庆: "重庆",
  深圳: "广东",
  广州: "广东",
  东莞: "广东",
  佛山: "广东",
  沧州: "河北",
  杭州: "浙江",
  常山: "浙江",
  潍坊: "山东",
  昌乐: "山东",
  阿勒泰市: "新疆",
  许昌: "河南",
  平潭: "福建",
  喀什市: "新疆",
  武汉: "湖北",
  海口: "海南",
  都江堰: "四川",
  日喀则: "西藏",
  西安: "陕西",
  拉萨: "西藏",
  林芝: "西藏",
  南京: "江苏",
};

const cityEnByCityZh = {
  上海: "Shanghai",
  北京: "Beijing",
  天津: "Tianjin",
  重庆: "Chongqing",
  深圳: "Shenzhen",
  广州: "Guangzhou",
  东莞: "Dongguan",
  佛山: "Foshan",
  沧州: "Cangzhou",
  杭州: "Hangzhou",
  常山: "Changshan",
  潍坊: "Weifang",
  昌乐: "Changle",
  阿勒泰市: "Altay",
  许昌: "Xuchang",
  平潭: "Pingtan",
  喀什市: "Kashgar",
  武汉: "Wuhan",
  海口: "Haikou",
  都江堰: "Dujiangyan",
  日喀则: "Shigatse",
  西安: "Xi'an",
  拉萨: "Lhasa",
  林芝: "Nyingchi",
  南京: "Nanjing",
};

const provinceEnByProvinceZh = {
  上海: "Shanghai",
  北京: "Beijing",
  天津: "Tianjin",
  重庆: "Chongqing",
  广东: "Guangdong",
  河北: "Hebei",
  浙江: "Zhejiang",
  山东: "Shandong",
  新疆: "Xinjiang",
  河南: "Henan",
  福建: "Fujian",
  湖北: "Hubei",
  海南: "Hainan",
  四川: "Sichuan",
  西藏: "Tibet",
  陕西: "Shaanxi",
  江苏: "Jiangsu",
};

const headers = {
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.6",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
};

const delayMs = 180;
const manualCorrections = new Map([
  [
    "深圳:深圳福田CBD逸扉酒店",
    {
      nameEn: "UrCove by Hyatt Shenzhen Futian CBD",
    },
  ],
  [
    "都江堰:TELLUS特澜斯温泉酒店（青城山店）",
    {
      nameEn: "TELLUS Qingchengshan Hot Spring Hotel",
    },
  ],
  [
    "西安:西安经开逸扉酒店",
    {
      addressZh: "陕西省西安市未央区凤城二路经发大厦A座2号楼, 西安, 中国, 710016",
      coordinateSystem: "gcj02",
      email: "Rsvpuc0017@urcove-hotels.com",
      nameEn: "UrCove Xi'an North",
      phone: "+86 29 8961 6108",
      point: [108.9452009484904, 34.31809389877056],
      positionSource: "ctrip_bd09_converted_to_gcj02",
      propertySiteURL_en: "https://www.hyatt.com/en-US/hotel/china/urcove-xian-north/uc017",
      propertySiteURL_zh: "https://www.hyatt.com/zh-CN/hotel/china/urcove-xian-north/uc017",
      raw: {
        ctripHotelURL: "https://hotels.ctrip.com/hotels/80935116.html",
        ctripMapType: "bd",
        ctripMapPoint: [108.951626, 34.324326],
        hyattOfficialURL: "https://www.hyatt.com/zh-CN/hotel/china/urcove-xian-north/uc017",
      },
    },
  ],
]);

async function main() {
  mkdirSync(hotelSourceDir, { recursive: true });
  const indexHtml = await fetchText(sourceUrl);
  const listings = extractHotelListings(indexHtml);
  if (listings.length === 0) {
    throw new Error("No UrCove listings were extracted; source page may be blocked and existing output was left untouched.");
  }
  const hotels = [];

  for (const [index, listing] of listings.entries()) {
    await sleep(delayMs);
    const detail = await fetchHotelDetail(listing, index);
    hotels.push(toHotelRecord(listing, detail, index));
  }

  const payload = {
    metadata: {
      generated_at: new Date().toISOString(),
      scope: "urcove_hyatt_china_official_brand_site",
      usage: "personal_noncommercial_low_frequency",
      official_sites: [sourceUrl],
      record_count: hotels.length,
      note:
        "Extracted from the public UrCoveHyatt.cn brand/city index and each hotel's public traffic page. Traffic-page coordinates are maplibre/OSM-style WGS-84 points; the web dataset builder converts mainland coordinates to GCJ-02 for AMap.",
    },
    hotels,
  };

  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  writeFileSync(summaryPath, buildSummary(payload));
  console.log(`Wrote ${hotels.length} UrCove by Hyatt hotels to ${outputPath}`);
}

function extractHotelListings(html) {
  const listings = [];
  const sectionPattern =
    /<div class="hotel-category">\s*<h2 class="hotel-category-title">([^<]+?)\s+-\s*逸扉酒店酒店<\/h2>\s*<ul class="hotel-category-list">([\s\S]*?)<\/ul>\s*<\/div>/g;
  let sectionMatch;
  while ((sectionMatch = sectionPattern.exec(html))) {
    const cityZh = decodeHtml(stripTags(sectionMatch[1])).trim();
    const linkPattern = /<a\s+href="([^"]+)"\s+title="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let linkMatch;
    while ((linkMatch = linkPattern.exec(sectionMatch[2]))) {
      const url = absoluteHttpsUrl(decodeHtml(linkMatch[1]));
      const title = decodeHtml(linkMatch[2]).trim();
      const label = decodeHtml(stripTags(linkMatch[3])).trim();
      const nameZh = title || label;
      if (!url || !nameZh) continue;
      listings.push({ cityZh, nameZh, sourceUrl: url });
    }
  }

  const seen = new Set();
  return listings.filter((listing) => {
    const key = `${listing.cityZh}:${listing.nameZh}:${listing.sourceUrl.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchHotelDetail(listing) {
  const [homeHtml, trafficHtml] = await Promise.all([
    fetchText(listing.sourceUrl).catch((error) => errorToText(error)),
    fetchText(new URL("/traffic.html", listing.sourceUrl).href).catch((error) => errorToText(error)),
  ]);

  return {
    addressZh: firstMatch(homeHtml, /<p class="inn-title__address">\s*([\s\S]*?)\s*<\/p>/),
    descriptionZh:
      firstMatch(homeHtml, /<meta\s+name="description"\s+content="([^"]*)"/i) ||
      firstMatch(homeHtml, /<div class="description-text">([\s\S]*?)<\/div>/i),
    detailNameZh: firstMatch(homeHtml, /<h1 class="inn-title__name">\s*([\s\S]*?)\s*<\/h1>/),
    email: firstMatch(homeHtml, /邮箱[：:]\s*([^<\s]+)/),
    nameEn: extractEnglishName(trafficHtml) || englishNameFromUrl(listing.sourceUrl, listing.cityZh),
    phone:
      firstMatch(homeHtml, /咨询电话[：:]\s*([^<（(]+)/) ||
      firstMatch(homeHtml, /订房电话[：:]\s*([^<（(]+)/),
    point: extractTrafficPoint(trafficHtml),
    trafficHtmlStatus: trafficHtml.startsWith("FETCH_ERROR:") ? trafficHtml : undefined,
  };
}

function toHotelRecord(listing, detail, index) {
  const cityZh = listing.cityZh;
  const provinceZh = provinceByCityZh[cityZh] ?? "中国大陆";
  const correction = manualCorrections.get(`${cityZh}:${listing.nameZh}`) ?? {};
  const point = correction.point ?? detail.point ?? [null, null];
  const nameZh = listing.nameZh || decodeHtml(stripTags(detail.detailNameZh));
  const source = (correction.propertySiteURL_zh ?? listing.sourceUrl).replace(/^http:/i, "https:");
  const nameEn =
    correction.nameEn ||
    detail.nameEn ||
    `UrCove by Hyatt ${cityEnByCityZh[cityZh] ?? nameZh}`;

  return stripUndefined({
    chain: "hyatt",
    source: "urcovehyatt_official_brand_site",
    official_locale_primary: "zh-CN",
    official_locale_secondary: "en-US",
    spiritCode: `URCOVE-${slugify(`${cityZh}-${nameZh}-${new URL(source).hostname}-${index + 1}`)}`,
    name_en: nameEn,
    name_zh: nameZh,
    brand_en: "UrCove by Hyatt",
    brand_zh: "逸扉酒店",
    brandKey: "URCOVE",
    hotelStatus: "OPEN",
    propertyType: "HYATT_PARTNER",
    city_en: cityEnByCityZh[cityZh] ?? "",
    city_zh: cityZh,
    province_en: provinceEnByProvinceZh[provinceZh] ?? "",
    province_zh: provinceZh,
    region_en: "Asia",
    region_zh: "亚洲",
    country_en: "Chinese Mainland",
    country_zh: "中国大陆",
    countryCode: "CN",
    countryDisplay_en: "Greater China",
    countryDisplay_zh: "大中华地区",
    address1_en: "",
    address1_zh: cleanDetailText(correction.addressZh ?? detail.addressZh),
    latitude: point[1],
    longitude: point[0],
    coordinate_system: correction.coordinateSystem ?? "wgs84",
    position_source: correction.positionSource ?? (detail.point ? "official_traffic_page_map" : "missing"),
    phone: cleanDetailText(correction.phone ?? detail.phone),
    email: cleanDetailText(correction.email ?? detail.email),
    propertySiteURL_en: correction.propertySiteURL_en ?? (source.endsWith("/") ? `${source}en` : `${source}/en`),
    propertySiteURL_zh: source,
    description_en: "",
    description_zh: cleanDescription(detail.descriptionZh, nameZh),
    amenityKeys: [],
    thumbnails: [],
    raw_zh: {
      city_index_url: sourceUrl,
      property_url: source,
      traffic_url: new URL("/traffic.html", source).href,
      detail_name_zh: cleanDetailText(detail.detailNameZh),
      traffic_status: detail.trafficHtmlStatus,
      correction: correction.raw,
    },
  });
}

function extractEnglishName(html) {
  const marker = firstMatch(html, /name:\s*'([^']+)'/);
  if (!marker) return "";
  const lines = decodeHtml(marker)
    .replace(/\\n/g, "\n")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.find(usableEnglishName) ?? "";
}

function usableEnglishName(value) {
  const text = String(value ?? "").trim();
  const latinCount = (text.match(/[A-Za-z]/g) ?? []).length;
  const hanCount = (text.match(/[\u3400-\u9fff]/g) ?? []).length;
  return latinCount >= 8 && latinCount >= hanCount;
}

function extractTrafficPoint(html) {
  const match = html.match(/var\s+point\s*=\s*\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/);
  if (!match) return null;
  const longitude = Number(match[1]);
  const latitude = Number(match[2]);
  return Number.isFinite(longitude) && Number.isFinite(latitude) ? [longitude, latitude] : null;
}

async function fetchText(url) {
  const response = await fetch(url, { headers, redirect: "follow" });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.text();
}

function absoluteHttpsUrl(href) {
  try {
    const url = new URL(href, sourceUrl);
    url.protocol = "https:";
    return url.href;
  } catch {
    return "";
  }
}

function firstMatch(html, pattern) {
  const match = html.match(pattern);
  return match ? decodeHtml(stripTags(match[1])).trim() : "";
}

function cleanDescription(value, nameZh) {
  return cleanDetailText(value)
    .replace(new RegExp(`${escapeRegExp(nameZh)}是一家四星级豪华酒店，?`), "")
    .trim();
}

function cleanDetailText(value) {
  return decodeHtml(stripTags(value))
    .replace(/\s+/g, " ")
    .replace(/\s+([，。；：、])/g, "$1")
    .trim();
}

function englishNameFromUrl(url, cityZh) {
  const host = new URL(url).hostname.replace(/\.urcovehyatt\.cn$/i, "");
  const words = host
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\burcove\b/gi, "UrCove")
    .replace(/\bhyatt\b/gi, "Hyatt")
    .replace(/\byifei\b/gi, "YiFei")
    .trim();
  if (/[A-Za-z]/.test(words)) return titleCase(words);
  return `UrCove by Hyatt ${cityEnByCityZh[cityZh] ?? ""}`.trim();
}

function titleCase(value) {
  return value
    .split(/\s+/)
    .map((word) => {
      if (/^urcove$/i.test(word)) return "UrCove";
      if (/^hyatt$/i.test(word)) return "Hyatt";
      if (/^(CBD|TELLUS)$/i.test(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function buildSummary(payload) {
  const cityCounts = payload.hotels.reduce((acc, hotel) => {
    acc.set(hotel.city_zh, (acc.get(hotel.city_zh) ?? 0) + 1);
    return acc;
  }, new Map());
  const missingCoordinates = payload.hotels.filter((hotel) => hotel.longitude === null || hotel.latitude === null);

  return [
    "# UrCove by Hyatt China Official Hotel List",
    "",
    `Generated: ${payload.metadata.generated_at}`,
    `Source: ${payload.metadata.official_sites.join(", ")}`,
    `Hotels: ${payload.hotels.length}`,
    `Missing coordinates: ${missingCoordinates.length}`,
    "",
    "## City Counts",
    "",
    ...[...cityCounts.entries()].map(([city, count]) => `- ${city}: ${count}`),
    "",
  ].join("\n");
}

function stripTags(value) {
  return String(value ?? "").replace(/<[^>]*>/g, " ");
}

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function slugify(value) {
  return String(value)
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u3400-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function stripUndefined(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorToText(error) {
  return `FETCH_ERROR: ${error.message}`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
