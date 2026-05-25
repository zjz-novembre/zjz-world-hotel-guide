import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { exit } from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { hotelSourceDir } from "./paths.mjs";

const outputDir = hotelSourceDir;
const outputJsonPath = join(outputDir, "mainland-china-marriott-hyatt-hotels.json");
const outputCsvPath = join(outputDir, "mainland-china-marriott-hyatt-hotels.csv");
const outputSummaryPath = join(outputDir, "mainland-china-marriott-hyatt-hotels-summary.md");

const userAgent = "michelin-list-personal-mvp/0.1 (OSM-Wikidata hotel POI sync)";
const fetchedAt = new Date().toISOString();

const overpassEndpoints = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const mainlandExcludeBoxes = [
  { name: "Hong Kong", minLng: 113.8, maxLng: 114.5, minLat: 22.1, maxLat: 22.6 },
  { name: "Macau", minLng: 113.52, maxLng: 113.66, minLat: 22.08, maxLat: 22.25 },
  { name: "Taiwan", minLng: 119.0, maxLng: 122.3, minLat: 21.7, maxLat: 25.6 },
];

const brandDefinitions = [
  brand("marriott", "The Ritz-Carlton", "luxury", true, [
    "The Ritz-Carlton",
    "Ritz-Carlton",
    "Ritz Carlton",
    "丽思卡尔顿",
    "麗思卡爾頓",
  ]),
  brand("marriott", "St. Regis", "luxury", true, ["St. Regis", "St Regis", "瑞吉"]),
  brand("marriott", "JW Marriott", "luxury", true, ["JW Marriott", "JW万豪", "JW萬豪"]),
  brand("marriott", "W Hotels", "luxury", true, ["W Hotels", "W Hotel", "W酒店"]),
  brand("marriott", "EDITION", "luxury", true, ["EDITION", "艾迪逊", "艾迪遜"]),
  brand("marriott", "The Luxury Collection", "luxury", true, [
    "The Luxury Collection",
    "Luxury Collection",
    "豪华精选",
    "豪華精選",
  ]),
  brand("marriott", "Bvlgari Hotels & Resorts", "luxury", true, [
    "Bvlgari",
    "Bulgari",
    "宝格丽",
    "寶格麗",
  ]),
  brand("marriott", "Marriott Hotels", "premium", false, ["Marriott Hotel", "Marriott", "万豪酒店", "萬豪酒店", "万豪", "萬豪"]),
  brand("marriott", "Sheraton", "premium", false, ["Sheraton", "喜来登", "喜來登"]),
  brand("marriott", "Westin", "premium", false, ["Westin", "威斯汀"]),
  brand("marriott", "Le Meridien", "premium", false, ["Le Meridien", "Le Méridien", "艾美"]),
  brand("marriott", "Renaissance Hotels", "premium", false, ["Renaissance", "万丽", "萬麗"]),
  brand("marriott", "Autograph Collection", "collection", false, ["Autograph Collection", "傲途格"]),
  brand("marriott", "Tribute Portfolio", "collection", false, ["Tribute Portfolio", "臻品之选", "臻品之選"]),
  brand("marriott", "Design Hotels", "collection", false, ["Design Hotels"]),
  brand("marriott", "Delta Hotels", "premium", false, ["Delta Hotels", "Delta Hotel", "德尔塔", "德爾塔"]),
  brand("marriott", "Courtyard by Marriott", "select", false, ["Courtyard by Marriott", "Courtyard", "万怡", "萬怡"]),
  brand("marriott", "Four Points by Sheraton", "select", false, [
    "Four Points by Sheraton",
    "Four Points",
    "福朋喜来登",
    "福朋喜來登",
    "福朋",
  ]),
  brand("marriott", "Fairfield by Marriott", "select", false, ["Fairfield by Marriott", "Fairfield", "万枫", "萬楓"]),
  brand("marriott", "AC Hotels by Marriott", "select", false, ["AC Hotels", "AC Hotel"]),
  brand("marriott", "Aloft Hotels", "select", false, ["Aloft", "雅乐轩", "雅樂軒"]),
  brand("marriott", "Moxy Hotels", "select", false, ["Moxy", "MOXY", "慕奇夕"]),
  brand("marriott", "Residence Inn by Marriott", "extended_stay", false, [
    "Residence Inn by Marriott",
    "Residence Inn",
    "万豪居家",
    "萬豪居家",
  ]),
  brand("marriott", "TownePlace Suites by Marriott", "extended_stay", false, ["TownePlace Suites"]),
  brand("marriott", "Element by Westin", "extended_stay", false, ["Element by Westin", "Element", "源宿"]),
  brand("marriott", "Marriott Executive Apartments", "extended_stay", false, [
    "Marriott Executive Apartments",
    "Marriott Executive Apartment",
    "万豪行政公寓",
    "萬豪行政公寓",
  ]),

  brand("hyatt", "Park Hyatt", "luxury", true, ["Park Hyatt", "柏悦", "柏悅"]),
  brand("hyatt", "Grand Hyatt", "luxury", true, ["Grand Hyatt", "君悦", "君悅"]),
  brand("hyatt", "Andaz", "luxury", true, ["Andaz", "安达仕", "安達仕"]),
  brand("hyatt", "Alila", "luxury", true, ["Alila", "阿丽拉", "阿麗拉"]),
  brand("hyatt", "The Unbound Collection by Hyatt", "collection", true, [
    "The Unbound Collection by Hyatt",
    "Unbound Collection",
    "凯悦臻选",
    "凱悅臻選",
  ]),
  brand("hyatt", "JdV by Hyatt", "collection", true, ["JdV by Hyatt", "JdV", "凯悦尚选", "凱悅尚選"]),
  brand("hyatt", "Hyatt Regency", "premium", false, [
    "Hyatt Regency",
    "凯悦酒店",
    "凱悅酒店",
    "凯悦",
    "凱悅",
  ]),
  brand("hyatt", "Hyatt Centric", "premium", false, ["Hyatt Centric", "凯悦尚萃", "凱悅尚萃"]),
  brand("hyatt", "Hyatt Place", "select", false, ["Hyatt Place", "凯悦嘉轩", "凱悅嘉軒"]),
  brand("hyatt", "Hyatt House", "extended_stay", false, ["Hyatt House", "凯悦嘉寓", "凱悅嘉寓"]),
  brand("hyatt", "UrCove by Hyatt", "select", false, ["UrCove by Hyatt", "UrCove", "逸扉"]),
];

const weakAliasKeys = new Set(
  [
    "Marriott",
    "Marriott Hotel",
    "Marriott Hotels",
    "Hyatt",
    "Courtyard",
    "Element",
    "万豪",
    "萬豪",
    "万豪酒店",
    "萬豪酒店",
    "凯悦",
    "凱悅",
    "凯悦酒店",
    "凱悅酒店",
    "君悦",
    "君悅",
    "柏悦",
    "柏悅",
  ].map(aliasKey),
);
const aliasMatchers = brandDefinitions
  .flatMap((item) =>
    item.aliases.map((alias) => ({
      ...item,
      alias,
      aliasKey: aliasKey(alias),
      weakAlias: weakAliasKeys.has(aliasKey(alias)),
    })),
  )
  .sort((a, b) => b.alias.length - a.alias.length);
const overpassRegex = Array.from(new Set(brandDefinitions.flatMap((item) => item.aliases)))
  .sort((a, b) => b.length - a.length)
  .map(escapeOverpassRegex)
  .join("|");

function brand(chain, brandName, brandTier, isLuxury, aliases) {
  return {
    id: `${chain}-${slugify(brandName)}`,
    chain,
    brandName,
    brandTier,
    isLuxury,
    includeInMvp: true,
    aliases,
    maxAliasLength: Math.max(...aliases.map((alias) => alias.length)),
  };
}

function escapeOverpassRegex(value) {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function slugify(value) {
  return normalizeAscii(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeAscii(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hash(value) {
  return createHash("sha1").update(stableJson(value)).digest("hex");
}

function detectBrand(...texts) {
  const haystack = texts
    .filter(Boolean)
    .map((text) => normalizeAscii(text).toLowerCase())
    .join("\n");
  const rawHaystack = texts.filter(Boolean).join("\n");

  for (const item of aliasMatchers) {
    if (matchesAlias(rawHaystack, haystack, item.alias)) {
      return {
        chain: item.chain,
        brandName: item.brandName,
        brandId: item.id,
        brandTier: item.brandTier,
        isLuxury: item.isLuxury,
        brandConfidence: item.weakAlias ? 0.72 : 0.95,
        matchedAlias: item.alias,
        brandEvidence: item.weakAlias ? "weak_alias" : "strong_alias",
      };
    }
  }

  return null;
}

function aliasKey(value) {
  return normalizeAscii(value).toLowerCase().replace(/\s+/g, "");
}

function matchesAlias(rawHaystack, normalizedHaystack, alias) {
  if (/[\u4e00-\u9fff]/.test(alias)) return rawHaystack.includes(alias);
  const normalizedAlias = normalizeLatinPhrase(alias);
  if (!normalizedAlias) return false;
  const normalizedText = normalizeLatinPhrase(normalizedHaystack);
  const pattern = new RegExp(`(^| )${escapeRegExp(normalizedAlias)}($| )`, "i");
  return pattern.test(normalizedText);
}

function normalizeLatinPhrase(value) {
  return normalizeAscii(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value) {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function normalizeHotelName(value) {
  return normalizeAscii(value)
    .toLowerCase()
    .replace(/[\u2018\u2019']/g, "")
    .replace(/&/g, " and ")
    .replace(/\b(the|hotel|hotels|resort|resorts|and|by|at|in|of|china)\b/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

function canonicalUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    url.hostname = url.hostname.replace(/^www\./, "").toLowerCase();
    return url.toString().replace(/\/$/, "");
  } catch {
    return String(value).trim().replace(/\/$/, "");
  }
}

function isMainlandCoordinate(lng, lat) {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return true;
  if (lng < 73 || lng > 135.2 || lat < 18 || lat > 54.5) return false;
  return !mainlandExcludeBoxes.some(
    (box) => lng >= box.minLng && lng <= box.maxLng && lat >= box.minLat && lat <= box.maxLat,
  );
}

function looksNonMainlandText(...values) {
  const text = values.filter(Boolean).join(" ");
  return /香港|Hong Kong|澳门|澳門|Macau|Macao|台湾|臺灣|Taiwan|Taipei|台北/.test(text);
}

function overpassQuery() {
  return `[out:json][timeout:180];
area["ISO3166-1"="CN"]["admin_level"="2"]->.china;
(
  nwr["tourism"="hotel"]["name"~"${overpassRegex}", i](area.china);
  nwr["tourism"="hotel"]["name:en"~"${overpassRegex}", i](area.china);
  nwr["tourism"="hotel"]["name:zh"~"${overpassRegex}", i](area.china);
  nwr["tourism"="hotel"]["brand"~"${overpassRegex}", i](area.china);
  nwr["tourism"="hotel"]["operator"~"${overpassRegex}", i](area.china);
  nwr["tourism"="hotel"]["website"~"marriott|hyatt|ritzcarlton|st-regis|westin|sheraton", i](area.china);
  nwr["tourism"="hotel"]["contact:website"~"marriott|hyatt|ritzcarlton|st-regis|westin|sheraton", i](area.china);
);
out center tags;`;
}

async function fetchOverpass() {
  let lastError = null;
  for (const endpoint of overpassEndpoints) {
    try {
      const body = new URLSearchParams({ data: overpassQuery() });
      const response = await fetchWithTimeout(
        endpoint,
        {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            "user-agent": userAgent,
          },
          body,
        },
        210_000,
      );
      const text = await response.text();
      if (!response.ok) throw new Error(`${endpoint} returned ${response.status}: ${text.slice(0, 240)}`);
      return {
        endpoint,
        payload: JSON.parse(text),
      };
    } catch (error) {
      lastError = error;
      await delay(1000);
    }
  }
  throw lastError ?? new Error("Overpass request failed");
}

function overpassRecords(payload) {
  return (payload.elements ?? [])
    .map((element) => {
      const tags = element.tags ?? {};
      const lat = element.lat ?? element.center?.lat ?? null;
      const lng = element.lon ?? element.center?.lon ?? null;
      const detection = detectBrand(
        tags.name,
        tags["name:en"],
        tags["name:zh"],
        tags.brand,
        tags.operator,
        tags.website,
        tags["contact:website"],
      );
      if (!detection || !isMainlandCoordinate(lng, lat)) return null;
      if (!hasAcceptableOsmBrandEvidence(tags, detection)) return null;

      const rawName = tags.name ?? tags["name:en"] ?? tags["name:zh"] ?? detection.brandName;
      const website = tags.website ?? tags["contact:website"] ?? null;
      const rawAddress = formatOsmAddress(tags);
      const aliases = unique([
        tags["name:en"],
        tags["name:zh"],
        tags["name:zh-Hans"],
        tags["alt_name"],
        tags["old_name"],
      ]);
      return {
        id: `osm:${element.type}:${element.id}`,
        source: "osm",
        source_record_id: `${element.type}/${element.id}`,
        source_url: `https://www.openstreetmap.org/${element.type}/${element.id}`,
        raw_name: rawName,
        raw_brand: tags.brand ?? null,
        raw_chain: tags.operator ?? null,
        raw_address: rawAddress,
        raw_lat: lat,
        raw_lng: lng,
        raw_coordinate_system: "wgs84",
        raw_phone: tags.phone ?? tags["contact:phone"] ?? null,
        raw_website: website,
        raw_status: "open_or_exists_in_osm",
        fetched_at: fetchedAt,
        hash: hash({ type: element.type, id: element.id, tags, lat, lng }),
        merge_status: "unmerged",
        merge_reason: null,
        raw_payload: {
          type: element.type,
          id: element.id,
          tags,
          center: element.center ?? null,
        },
        mapped: {
          ...detection,
          displayName: rawName,
          localName: tags["name:zh"] ?? tags.name ?? null,
          aliases,
          city: tags["addr:city"] ?? tags["addr:county"] ?? null,
          region: tags["addr:province"] ?? null,
          district: tags["addr:district"] ?? tags["addr:county"] ?? null,
          postalCode: tags["addr:postcode"] ?? null,
          formattedAddress: rawAddress,
          officialUrl: website,
          osmType: element.type,
          osmId: String(element.id),
          wikidataQid: extractQid(tags.wikidata),
          brandWikidataQid: extractQid(tags["brand:wikidata"]),
          phone: tags.phone ?? tags["contact:phone"] ?? null,
          coordinatePrecision: element.type === "node" ? "exact" : "building",
        },
      };
    })
    .filter(Boolean);
}

function hasAcceptableOsmBrandEvidence(tags, detection) {
  if (hasOfficialChainDomain(tags.website) || hasOfficialChainDomain(tags["contact:website"])) return true;
  if (hasConflictingHotelBrand(tags)) return false;
  if (detection.brandEvidence === "strong_alias") return true;

  const structuredDetection = detectBrand(tags.brand, tags.operator, tags["name:en"], tags["brand:en"], tags["operator:en"]);
  if (structuredDetection?.brandEvidence === "strong_alias") return true;
  if (structuredDetection && hasStructuredTargetTag(tags)) return true;
  if (structuredDetection && (hasOfficialChainDomain(tags.website) || hasOfficialChainDomain(tags["contact:website"]))) {
    return true;
  }
  return false;
}

function hasOfficialChainDomain(value) {
  if (!value) return false;
  const text = String(value).toLowerCase();
  return /(^|[./-])(marriott|hyatt|ritzcarlton|ritz-carlton|st-regis|starwoodhotels|whotels|editionhotels|luxurycollection|sheraton|westin|lemeridien|alofthotels|urcovehyatt)([./-]|$)/.test(
    text,
  );
}

function hasStructuredTargetTag(tags) {
  const text = [tags.brand, tags.operator, tags["brand:en"], tags["operator:en"]].filter(Boolean).join(" ");
  return /\b(marriott|hyatt)\b/i.test(text) || /万豪国际|萬豪國際|凯悦酒店集团|凱悅酒店集團/.test(text);
}

function hasConflictingHotelBrand(tags) {
  const text = [tags.name, tags["name:en"], tags["name:zh"], tags.brand, tags.operator].filter(Boolean).join(" ");
  return /Hilton|希尔顿|希爾頓|Wyndham|温德姆|溫德姆|InterContinental|洲际|洲際|Holiday Inn|假日酒店|Accor|雅高|Sofitel|索菲特|Shangri-La|香格里拉|DoubleTree|Conrad|康莱德|康萊德|Kempinski|凯宾斯基|凱賓斯基|Four Seasons|四季酒店|Mandarin Oriental|文华东方|文華東方/i.test(
    text,
  );
}

function formatOsmAddress(tags) {
  const parts = [
    tags["addr:province"],
    tags["addr:city"],
    tags["addr:district"] ?? tags["addr:county"],
    tags["addr:street"],
    tags["addr:housenumber"],
  ].filter(Boolean);
  return parts.length ? parts.join("") : null;
}

function extractQid(value) {
  if (!value) return null;
  const match = String(value).match(/Q\d+/i);
  return match ? match[0].toUpperCase() : null;
}

async function fetchWikidata() {
  const query = `
SELECT ?item ?itemLabel ?coord ?official ?countryLabel ?adminLabel WHERE {
  ?item wdt:P31/wdt:P279* wd:Q27686.
  ?item wdt:P17 wd:Q148.
  ?item rdfs:label ?label.
  FILTER(LANG(?label) IN ("en", "zh", "zh-cn", "zh-hans", "zh-hant"))
  FILTER(REGEX(STR(?label), "${sparqlRegex()}", "i"))
  OPTIONAL { ?item wdt:P625 ?coord. }
  OPTIONAL { ?item wdt:P856 ?official. }
  OPTIONAL { ?item wdt:P131 ?admin. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "zh,en". }
}
LIMIT 1000`;
  const response = await fetchWithTimeout(
    "https://query.wikidata.org/sparql",
    {
      method: "POST",
      headers: {
        accept: "application/sparql-results+json",
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": userAgent,
      },
      body: new URLSearchParams({ query, format: "json" }),
    },
    90_000,
  );
  const text = await response.text();
  if (!response.ok) throw new Error(`Wikidata returned ${response.status}: ${text.slice(0, 240)}`);
  return JSON.parse(text);
}

function sparqlRegex() {
  return [
    "Hyatt",
    "Marriott",
    "Ritz",
    "Carlton",
    "Sheraton",
    "Westin",
    "Regis",
    "EDITION",
    "Courtyard",
    "Aloft",
    "Moxy",
    "万豪",
    "萬豪",
    "凯悦",
    "凱悅",
    "丽思",
    "麗思",
    "卡尔顿",
    "卡爾頓",
    "喜来登",
    "喜來登",
    "威斯汀",
    "瑞吉",
    "柏悦",
    "柏悅",
    "君悦",
    "君悅",
    "安达仕",
    "安達仕",
    "阿丽拉",
    "阿麗拉",
  ]
    .map((value) => value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&"))
    .join("|");
}

function wikidataRecords(payload) {
  const byQid = new Map();
  for (const binding of payload.results?.bindings ?? []) {
    const qid = binding.item?.value?.match(/Q\d+$/)?.[0];
    if (!qid) continue;
    const label = binding.itemLabel?.value ?? qid;
    const adminLabel = binding.adminLabel?.value ?? null;
    const official = binding.official?.value ?? null;
    const coord = parseWktPoint(binding.coord?.value);
    if (looksNonMainlandText(label, adminLabel, official)) continue;
    if (coord && !isMainlandCoordinate(coord.lng, coord.lat)) continue;

    const current = byQid.get(qid) ?? {
      qid,
      labels: [],
      adminLabels: [],
      officialUrls: [],
      coord,
      rawBindings: [],
    };
    current.labels.push(label);
    if (adminLabel) current.adminLabels.push(adminLabel);
    if (official) current.officialUrls.push(official);
    if (!current.coord && coord) current.coord = coord;
    current.rawBindings.push(binding);
    byQid.set(qid, current);
  }

  return Array.from(byQid.values())
    .map((item) => {
      const labels = unique(item.labels);
      const adminLabels = unique(item.adminLabels);
      const officialUrls = unique(item.officialUrls);
      const detection = detectBrand(...labels, ...adminLabels, ...officialUrls);
      if (!detection) return null;
      if (detection.brandEvidence === "weak_alias" && !officialUrls.some(hasOfficialChainDomain)) return null;
      const displayName = chooseDisplayName(labels);
      const officialUrl = officialUrls[0] ?? null;
      return {
        id: `wikidata:${item.qid}`,
        source: "wikidata",
        source_record_id: item.qid,
        source_url: `https://www.wikidata.org/wiki/${item.qid}`,
        raw_name: displayName,
        raw_brand: detection.brandName,
        raw_chain: detection.chain,
        raw_address: adminLabels.join(", ") || null,
        raw_lat: item.coord?.lat ?? null,
        raw_lng: item.coord?.lng ?? null,
        raw_coordinate_system: item.coord ? "wgs84" : null,
        raw_phone: null,
        raw_website: officialUrl,
        raw_status: "open_or_exists_in_wikidata",
        fetched_at: fetchedAt,
        hash: hash(item),
        merge_status: "unmerged",
        merge_reason: null,
        raw_payload: {
          labels,
          adminLabels,
          officialUrls,
          bindings: item.rawBindings,
        },
        mapped: {
          ...detection,
          displayName,
          localName: labels.find((label) => /[\u4e00-\u9fff]/.test(label)) ?? null,
          aliases: labels.filter((label) => label !== displayName),
          city: adminLabels[0] ?? null,
          region: adminLabels[1] ?? null,
          district: null,
          postalCode: null,
          formattedAddress: adminLabels.join(", ") || null,
          officialUrl,
          osmType: null,
          osmId: null,
          wikidataQid: item.qid,
          phone: null,
          coordinatePrecision: item.coord ? "exact" : "unknown",
        },
      };
    })
    .filter(Boolean);
}

function parseWktPoint(value) {
  if (!value) return null;
  const match = String(value).match(/Point\(([-\d.]+)\s+([-\d.]+)\)/);
  if (!match) return null;
  return {
    lng: Number(match[1]),
    lat: Number(match[2]),
  };
}

function chooseDisplayName(labels) {
  return (
    labels.find((label) => /[\u4e00-\u9fff]/.test(label)) ??
    labels.find((label) => /^[A-Za-z0-9 .,'&-]+$/.test(label)) ??
    labels[0]
  );
}

function mergeRecords(sourceRecords) {
  const hotels = [];
  for (const record of sourceRecords) {
    const match = findMergeTarget(hotels, record);
    if (match) {
      match.sourceRecords.push(record.id);
      match.source_count = match.sourceRecords.length;
      match.confidence_score = Math.max(match.confidence_score, confidenceFor(record));
      match.needs_review = match.needs_review || needsReview(record);
      match.review_reason = unique([match.review_reason, reviewReason(record)]).filter(Boolean).join("; ") || null;
      record.merge_status = "merged";
      record.merge_reason = `matched ${match.id}`;
      fillMissingHotelFields(match, record);
    } else {
      const hotel = hotelFromRecord(record);
      hotels.push(hotel);
      record.merge_status = "merged";
      record.merge_reason = `created ${hotel.id}`;
    }
  }
  return hotels.sort(compareHotels);
}

function findMergeTarget(hotels, record) {
  const mapped = record.mapped;
  const qid = mapped.wikidataQid;
  const url = canonicalUrl(mapped.officialUrl);
  const nameKey = normalizeHotelName(mapped.displayName);
  for (const hotel of hotels) {
    if (qid && hotel.wikidata_qid === qid) return hotel;
    if (url && hotel.official_url_canonical === url) return hotel;
    if (record.raw_lat && record.raw_lng && hotel.lat_wgs84 && hotel.lng_wgs84) {
      const distance = haversineMeters(record.raw_lat, record.raw_lng, hotel.lat_wgs84, hotel.lng_wgs84);
      if (
        distance <= 80 &&
        hotel.chain === mapped.chain &&
        hotel.brand_name === mapped.brandName &&
        namesLikelySame(nameKey, hotel.normalized_name)
      ) {
        return hotel;
      }
    }
  }
  return null;
}

function namesLikelySame(a, b) {
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function confidenceFor(record) {
  let score = 0.55;
  if (record.source === "osm") score += 0.1;
  if (record.source === "wikidata") score += 0.05;
  if (record.raw_lat && record.raw_lng) score += 0.1;
  if (record.raw_website) score += 0.08;
  if (record.mapped.wikidataQid) score += 0.07;
  score += Math.min(0.1, Math.max(0, record.mapped.brandConfidence - 0.7) / 3);
  return Math.min(0.95, Number(score.toFixed(2)));
}

function needsReview(record) {
  return (
    record.mapped.brandConfidence < 0.9 ||
    !record.raw_lat ||
    !record.raw_lng ||
    !record.raw_website ||
    record.mapped.brandEvidence === "weak_alias"
  );
}

function reviewReason(record) {
  const reasons = [];
  if (record.mapped.brandConfidence < 0.9) reasons.push("generic_brand_match");
  if (record.mapped.brandEvidence === "weak_alias") reasons.push("weak_brand_alias");
  if (!record.raw_lat || !record.raw_lng) reasons.push("missing_coordinates");
  if (!record.raw_website) reasons.push("missing_official_url");
  if (!record.mapped.city && !record.mapped.region) reasons.push("missing_city_region");
  return reasons.join(",");
}

function hotelFromRecord(record) {
  const mapped = record.mapped;
  const [gcjLng, gcjLat] =
    record.raw_lng && record.raw_lat ? wgs84ToGcj02([record.raw_lng, record.raw_lat]) : [null, null];
  const [bdLng, bdLat] = gcjLng && gcjLat ? gcj02ToBd09([gcjLng, gcjLat]) : [null, null];
  const slug = `${mapped.chain}-${slugify(mapped.displayName)}-${slugify(mapped.city ?? mapped.region ?? mapped.osmId ?? mapped.wikidataQid ?? record.source_record_id)}`;
  return {
    id: `hotel_${hash({ source: record.source, id: record.source_record_id }).slice(0, 16)}`,
    canonical_name: mapped.displayName,
    display_name: mapped.displayName,
    local_name: mapped.localName,
    chain: mapped.chain,
    brand_id: mapped.brandId,
    brand_name: mapped.brandName,
    brand_confidence: mapped.brandConfidence,
    brand_tier: mapped.brandTier,
    hotel_aliases: mapped.aliases,
    slug,
    dedupe_key: hash({
      chain: mapped.chain,
      brand: mapped.brandName,
      name: normalizeHotelName(mapped.displayName),
      lat: roundCoord(record.raw_lat),
      lng: roundCoord(record.raw_lng),
    }).slice(0, 20),
    status: "unknown",
    status_confidence: 0.45,
    opening_period: null,
    opening_date: null,
    closed_date: null,
    last_seen_open_at: null,
    first_seen_at: fetchedAt,
    last_checked_at: fetchedAt,
    country_code: "CN",
    country_name: "中国",
    region: mapped.region,
    city: mapped.city ?? mapped.region ?? "待确认",
    metro_area: null,
    district: mapped.district,
    neighborhood: null,
    address_line1: null,
    address_line2: null,
    postal_code: mapped.postalCode,
    formatted_address: mapped.formattedAddress,
    lat_wgs84: record.raw_lat,
    lng_wgs84: record.raw_lng,
    lat_gcj02: gcjLat,
    lng_gcj02: gcjLng,
    lat_bd09: bdLat,
    lng_bd09: bdLng,
    coordinate_source: record.source,
    coordinate_precision: mapped.coordinatePrecision,
    official_url: mapped.officialUrl,
    official_url_canonical: canonicalUrl(mapped.officialUrl),
    booking_url: null,
    google_place_id: null,
    google_maps_url: null,
    osm_type: mapped.osmType,
    osm_id: mapped.osmId,
    wikidata_qid: mapped.wikidataQid,
    phone_international: null,
    phone_local: mapped.phone,
    hotel_type: "city_hotel",
    is_luxury: mapped.isLuxury,
    loyalty_program: mapped.chain === "marriott" ? "marriott_bonvoy" : "world_of_hyatt",
    tags: [],
    best_for: [],
    map_visibility: "private",
    source_count: 1,
    confidence_score: confidenceFor(record),
    needs_review: needsReview(record),
    review_reason: reviewReason(record) || null,
    created_at: fetchedAt,
    updated_at: fetchedAt,
    created_by: "system",
    updated_by: "system",
    sourceRecords: [record.id],
    normalized_name: normalizeHotelName(mapped.displayName),
  };
}

function fillMissingHotelFields(hotel, record) {
  const mapped = record.mapped;
  hotel.local_name ||= mapped.localName;
  hotel.region ||= mapped.region;
  hotel.city = hotel.city === "待确认" ? mapped.city ?? mapped.region ?? hotel.city : hotel.city;
  hotel.district ||= mapped.district;
  hotel.postal_code ||= mapped.postalCode;
  hotel.formatted_address ||= mapped.formattedAddress;
  hotel.official_url ||= mapped.officialUrl;
  hotel.official_url_canonical ||= canonicalUrl(mapped.officialUrl);
  hotel.osm_type ||= mapped.osmType;
  hotel.osm_id ||= mapped.osmId;
  hotel.wikidata_qid ||= mapped.wikidataQid;
  hotel.phone_local ||= mapped.phone;
  hotel.hotel_aliases = unique([...(hotel.hotel_aliases ?? []), ...(mapped.aliases ?? [])]);
  if (!hotel.lat_wgs84 && record.raw_lat && record.raw_lng) {
    const [gcjLng, gcjLat] = wgs84ToGcj02([record.raw_lng, record.raw_lat]);
    const [bdLng, bdLat] = gcj02ToBd09([gcjLng, gcjLat]);
    hotel.lat_wgs84 = record.raw_lat;
    hotel.lng_wgs84 = record.raw_lng;
    hotel.lat_gcj02 = gcjLat;
    hotel.lng_gcj02 = gcjLng;
    hotel.lat_bd09 = bdLat;
    hotel.lng_bd09 = bdLng;
    hotel.coordinate_source = record.source;
    hotel.coordinate_precision = mapped.coordinatePrecision;
  }
}

function compareHotels(a, b) {
  return (
    a.chain.localeCompare(b.chain) ||
    a.brand_name.localeCompare(b.brand_name) ||
    String(a.city).localeCompare(String(b.city), "zh") ||
    a.display_name.localeCompare(b.display_name, "zh")
  );
}

function roundCoord(value) {
  return Number.isFinite(value) ? Number(value.toFixed(5)) : null;
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const radius = 6371000;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function radians(value) {
  return (value * Math.PI) / 180;
}

const CHINA_MIN_LNG = 72.004;
const CHINA_MAX_LNG = 137.8347;
const CHINA_MIN_LAT = 0.8293;
const CHINA_MAX_LAT = 55.8271;
const EARTH_AXIS = 6378245.0;
const ECCENTRICITY = 0.006693421622965943;

function wgs84ToGcj02(position) {
  const [longitude, latitude] = position;
  if (
    longitude < CHINA_MIN_LNG ||
    longitude > CHINA_MAX_LNG ||
    latitude < CHINA_MIN_LAT ||
    latitude > CHINA_MAX_LAT
  ) {
    return position;
  }

  let dLat = transformLatitude(longitude - 105.0, latitude - 35.0);
  let dLng = transformLongitude(longitude - 105.0, latitude - 35.0);
  const radLat = (latitude / 180.0) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - ECCENTRICITY * magic * magic;
  const sqrtMagic = Math.sqrt(magic);

  dLat = (dLat * 180.0) / (((EARTH_AXIS * (1 - ECCENTRICITY)) / (magic * sqrtMagic)) * Math.PI);
  dLng = (dLng * 180.0) / ((EARTH_AXIS / sqrtMagic) * Math.cos(radLat) * Math.PI);
  return [longitude + dLng, latitude + dLat];
}

function gcj02ToBd09(position) {
  const [longitude, latitude] = position;
  const z = Math.sqrt(longitude * longitude + latitude * latitude) + 0.00002 * Math.sin(latitude * Math.PI * 3000.0 / 180.0);
  const theta = Math.atan2(latitude, longitude) + 0.000003 * Math.cos(longitude * Math.PI * 3000.0 / 180.0);
  return [z * Math.cos(theta) + 0.0065, z * Math.sin(theta) + 0.006];
}

function transformLatitude(x, y) {
  let result =
    -100.0 +
    2.0 * x +
    3.0 * y +
    0.2 * y * y +
    0.1 * x * y +
    0.2 * Math.sqrt(Math.abs(x));
  result += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0;
  result += ((20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin((y / 3.0) * Math.PI)) * 2.0) / 3.0;
  result += ((160.0 * Math.sin((y / 12.0) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30.0)) * 2.0) / 3.0;
  return result;
}

function transformLongitude(x, y) {
  let result =
    300.0 +
    x +
    2.0 * y +
    0.1 * x * x +
    0.1 * x * y +
    0.1 * Math.sqrt(Math.abs(x));
  result += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0;
  result += ((20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin((x / 3.0) * Math.PI)) * 2.0) / 3.0;
  result += ((150.0 * Math.sin((x / 12.0) * Math.PI) + 300.0 * Math.sin((x / 30.0) * Math.PI)) * 2.0) / 3.0;
  return result;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function unique(values) {
  return Array.from(new Set(values.filter((value) => value !== null && value !== undefined && value !== "")));
}

function toCsv(rows) {
  const columns = [
    "id",
    "chain",
    "brand_name",
    "display_name",
    "local_name",
    "region",
    "city",
    "district",
    "formatted_address",
    "lat_wgs84",
    "lng_wgs84",
    "lat_gcj02",
    "lng_gcj02",
    "official_url",
    "osm_type",
    "osm_id",
    "wikidata_qid",
    "source_count",
    "confidence_score",
    "needs_review",
    "review_reason",
  ];
  return [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\n");
}

function csvCell(value) {
  if (Array.isArray(value)) value = value.join("|");
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function summarize(hotels, sourceRecords, overpassMeta) {
  const byChain = countBy(hotels, (hotel) => hotel.chain);
  const byBrand = countBy(hotels, (hotel) => `${hotel.chain} / ${hotel.brand_name}`);
  const reviewCount = hotels.filter((hotel) => hotel.needs_review).length;
  const lines = [
    "# Mainland China Marriott + Hyatt Hotels",
    "",
    `Generated: ${fetchedAt}`,
    "",
    "## Scope",
    "",
    "- Geography: Mainland China only; Hong Kong, Macau, and Taiwan are excluded.",
    "- Sources: OpenStreetMap Overpass and Wikidata SPARQL.",
    "- Official Marriott/Hyatt sites were not scraped.",
    "",
    "## Counts",
    "",
    `- Hotels: ${hotels.length}`,
    `- Source records: ${sourceRecords.length}`,
    `- Needs review: ${reviewCount}`,
    `- OSM timestamp: ${overpassMeta?.osm3s?.timestamp_osm_base ?? "unknown"}`,
    "",
    "## By Chain",
    "",
    ...Object.entries(byChain).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## By Brand",
    "",
    ...Object.entries(byBrand).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Files",
    "",
    `- JSON: ${outputJsonPath}`,
    `- CSV: ${outputCsvPath}`,
  ];
  return `${lines.join("\n")}\n`;
}

function countBy(rows, getKey) {
  return rows.reduce((acc, row) => {
    const key = getKey(row) || "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

try {
  mkdirSync(outputDir, { recursive: true });

  console.log("Fetching OSM Overpass...");
  const overpass = await fetchOverpass();
  const osmRecords = overpassRecords(overpass.payload);
  console.log(`OSM records: ${osmRecords.length}`);

  console.log("Fetching Wikidata...");
  const wikidata = await fetchWikidata();
  const wdRecords = wikidataRecords(wikidata);
  console.log(`Wikidata records: ${wdRecords.length}`);

  const sourceRecords = [...osmRecords, ...wdRecords].sort((a, b) => a.id.localeCompare(b.id));
  const hotels = mergeRecords(sourceRecords).map(({ sourceRecords: sourceRecordIds, normalized_name, official_url_canonical, ...hotel }) => ({
    ...hotel,
    source_record_ids: sourceRecordIds,
  }));

  const payload = {
    metadata: {
      generated_at: fetchedAt,
      scope: "mainland_china",
      chains: ["marriott", "hyatt"],
      sources: [
        {
          source: "osm",
          endpoint: overpass.endpoint,
          timestamp_osm_base: overpass.payload.osm3s?.timestamp_osm_base ?? null,
          license: "OpenStreetMap data is available under ODbL; credit OpenStreetMap contributors.",
        },
        {
          source: "wikidata",
          endpoint: "https://query.wikidata.org/sparql",
          license: "Wikidata structured data is available under CC0.",
        },
      ],
      official_sites_scraped: false,
      excluded_regions: ["Hong Kong", "Macau", "Taiwan"],
    },
    hotel_brands: brandDefinitions.map(({ maxAliasLength, ...item }) => item),
    hotels,
    hotel_source_records: sourceRecords,
  };

  writeFileSync(outputJsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  writeFileSync(outputCsvPath, `${toCsv(hotels)}\n`);
  writeFileSync(outputSummaryPath, summarize(hotels, sourceRecords, overpass.payload));

  console.log(`Wrote ${hotels.length} hotels to ${outputJsonPath}`);
  console.log(`Wrote CSV to ${outputCsvPath}`);
  console.log(`Wrote summary to ${outputSummaryPath}`);
} catch (error) {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  exit(1);
}
