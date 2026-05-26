import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hotelPublicDir, hotelSourceDir } from "./paths.mjs";

const sourceFiles = [
  "marriott-china-hong-kong-macau-taiwan-official-hotels.json",
  "hyatt-mainland-china-official-hotels.json",
  "urcove-hyatt-china-official-hotels.json",
  "ihg-hilton-greater-china-official-hotels.json",
  "luxury-hotel-groups-greater-china-official-hotels.json",
  "accor-china-official-hotels.json",
];

const outputPath = join(hotelSourceDir, "hotel-official-geo-overrides.json");
const publicHotelPath = join(hotelPublicDir, "hotels.json");
const requestDelayMs = 650;

const publicHotels = loadPublicHotels();
const missingPositionKeys = new Set(
  publicHotels
    .filter((hotel) => !hasPosition(hotel))
    .map((hotel) => hotel.hotelKey || hotel.id)
    .filter(Boolean),
);

const sourceHotels = loadSourceHotels().filter((hotel) => missingPositionKeys.has(hotelKey(hotel)));
const existingPayload = loadExistingOverrides();
const overrides = { ...existingPayload.overrides };
const failures = [];

for (const hotel of sourceHotels) {
  const key = hotelKey(hotel);
  const sourceUrls = resolveSourceUrls(hotel);
  if (!sourceUrls.length) {
    failures.push({ hotelKey: key, reason: "missing_source_url" });
    continue;
  }

  try {
    const fetched = await fetchGeoFromOfficialUrls(sourceUrls);
    if (!fetched) {
      failures.push({ hotelKey: key, sourceUrl: sourceUrls[0], reason: "geo_not_found" });
      continue;
    }

    const address = extractAddress(fetched.html);
    overrides[key] = {
      hotelKey: key,
      longitude: fetched.geo.longitude,
      latitude: fetched.geo.latitude,
      coordinate_system: "wgs84",
      position_source: "official_page_geo",
      sourceUrl: fetched.sourceUrl,
      address1_zh: address.zh || undefined,
      address1_en: address.en || undefined,
    };
    console.log(`geo ${key}: ${fetched.geo.longitude},${fetched.geo.latitude}`);
  } catch (error) {
    failures.push({ hotelKey: key, sourceUrl: sourceUrls[0], reason: error.message });
  }

  await delay(requestDelayMs);
}

mkdirSync(hotelSourceDir, { recursive: true });
writeFileSync(
  outputPath,
  `${JSON.stringify(
    {
      source: "official_property_pages",
      generatedAt: new Date().toISOString(),
      count: Object.keys(overrides).length,
      failureCount: failures.length,
      overrides,
      failures,
    },
    null,
    2,
  )}\n`,
);

console.log(`Wrote ${Object.keys(overrides).length} geo overrides to ${outputPath}`);
console.log(`Failures: ${failures.length}`);

function loadPublicHotels() {
  const payload = JSON.parse(readFileSync(publicHotelPath, "utf8"));
  return payload.hotels ?? [];
}

function loadExistingOverrides() {
  try {
    return JSON.parse(readFileSync(outputPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return { overrides: {} };
    throw error;
  }
}

function loadSourceHotels() {
  const records = [];
  for (const file of sourceFiles) {
    const payload = JSON.parse(readFileSync(join(hotelSourceDir, file), "utf8"));
    const hotels = Array.isArray(payload) ? payload : payload.hotels;
    if (!Array.isArray(hotels)) throw new Error(`No hotel array in ${file}`);
    for (const hotel of hotels) records.push({ ...hotel, sourceFile: file });
  }
  return records;
}

function hasPosition(hotel) {
  return Array.isArray(hotel.position) && Number.isFinite(hotel.position[0]) && Number.isFinite(hotel.position[1]);
}

function hotelKey(hotel) {
  return `${hotel.chain}:${hotel.spiritCode}`;
}

function resolveSourceUrls(hotel) {
  const zhUrl = cleanText(hotel.propertySiteURL_zh);
  const enUrl = cleanText(hotel.propertySiteURL_en);
  return [zhUrl, enUrl, cleanText(hotel.sourceUrl)]
    .filter((url) => url && !/lhw\.cn\/domestic\/?$/i.test(url))
    .filter((url, index, urls) => urls.indexOf(url) === index);
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
    },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`http_${response.status}`);
  return response.text();
}

async function fetchGeoFromOfficialUrls(sourceUrls) {
  for (const url of officialGeoCandidateUrls(sourceUrls)) {
    const html = await fetchHtml(url);
    const geo = extractGeo(html);
    if (geo) return { sourceUrl: url, html, geo };
    await delay(150);
  }
  return null;
}

function officialGeoCandidateUrls(sourceUrls) {
  const urls = [...sourceUrls];
  for (const sourceUrl of sourceUrls) {
    try {
      const url = new URL(sourceUrl);
      if (/fourseasons\.com$/i.test(url.hostname)) {
        const propertySlug = url.pathname
          .split("/")
          .filter(Boolean)
          .find((part) => part !== "zh" && part !== "cn" && part !== "en");
        if (propertySlug) {
          urls.push(`${url.origin}/${propertySlug}/getting-here/`);
        }
      }
      if (/shangri-la\.com$/i.test(url.hostname) || /hoteljen\.com$/i.test(url.hostname)) {
        urls.push(sourceUrl.replace("/cn/", "/en/"));
      }
    } catch {
      continue;
    }
  }
  return [...new Set(urls)];
}

function extractGeo(rawHtml) {
  const html = decodeEntities(rawHtml);
  const latitudeValues = [
    ...valuesForKeys(html, ["latitude", "lat", "lbsLatitude"]),
    ...itempropValues(html, "latitude"),
  ];
  const longitudeValues = [
    ...valuesForKeys(html, ["longitude", "lng", "lon", "lbsLongitude"]),
    ...itempropValues(html, "longitude"),
  ];

  for (const latitude of latitudeValues) {
    for (const longitude of longitudeValues) {
      if (isGreaterChinaCoordinate(longitude, latitude)) {
        return {
          longitude: roundCoordinate(longitude),
          latitude: roundCoordinate(latitude),
        };
      }
    }
  }

  return null;
}

function valuesForKeys(html, keys) {
  const values = [];
  for (const key of keys) {
    const pattern = new RegExp(`["']?${escapeRegExp(key)}["']?\\s*[:=]\\s*["']?(-?\\d{1,3}(?:\\.\\d+)?)`, "gi");
    for (const match of html.matchAll(pattern)) {
      const value = Number(match[1]);
      if (Number.isFinite(value)) values.push(value);
    }
  }
  return values;
}

function itempropValues(html, itemprop) {
  const values = [];
  const pattern = new RegExp(
    `<[^>]+itemprop=["']${escapeRegExp(itemprop)}["'][^>]+content=["'](-?\\d{1,3}(?:\\.\\d+)?)["'][^>]*>`,
    "gi",
  );
  for (const match of html.matchAll(pattern)) {
    const value = Number(match[1]);
    if (Number.isFinite(value)) values.push(value);
  }
  return values;
}

function extractAddress(rawHtml) {
  const html = decodeEntities(rawHtml);
  const candidates = [
    ...textValuesForKeys(html, ["address", "streetAddress", "addressLocality"]),
    ...metaValues(html, ["address", "streetAddress"]),
  ].map(cleanText);
  const zh = candidates.find((value) => /[\u3400-\u9fff]/.test(value)) ?? "";
  const en = candidates.find((value) => /[A-Za-z]/.test(value) && !/[\u3400-\u9fff]/.test(value)) ?? "";
  return { zh, en };
}

function textValuesForKeys(html, keys) {
  const values = [];
  for (const key of keys) {
    const pattern = new RegExp(`["']${escapeRegExp(key)}["']\\s*:\\s*["']([^"']{4,240})["']`, "gi");
    for (const match of html.matchAll(pattern)) values.push(match[1]);
  }
  return values;
}

function metaValues(html, keys) {
  const values = [];
  for (const key of keys) {
    const pattern = new RegExp(
      `<[^>]+(?:name|property|itemprop)=["'][^"']*${escapeRegExp(key)}[^"']*["'][^>]+content=["']([^"']{4,240})["'][^>]*>`,
      "gi",
    );
    for (const match of html.matchAll(pattern)) values.push(match[1]);
  }
  return values;
}

function isGreaterChinaCoordinate(longitude, latitude) {
  return longitude >= 73 && longitude <= 137.9 && latitude >= 18 && latitude <= 54;
}

function roundCoordinate(value) {
  return Math.round(value * 1e10) / 1e10;
}

function decodeEntities(value) {
  return String(value ?? "")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\\"/g, '"')
    .replace(/\\u0022/g, '"')
    .replace(/\\u0026/g, "&");
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
