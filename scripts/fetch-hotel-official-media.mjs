import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { hotelSourceDir } from "./paths.mjs";

const outputJsonPath = join(hotelSourceDir, "hotel-official-media.json");
const outputSummaryPath = join(hotelSourceDir, "hotel-official-media-summary.md");
const lhwImagesPath = join(hotelSourceDir, "lhw-official-images.json");
const fetchedAt = new Date().toISOString();

const hotelSourceFiles = [
  "marriott-china-hong-kong-macau-taiwan-official-hotels.json",
  "hyatt-mainland-china-official-hotels.json",
  "ihg-hilton-greater-china-official-hotels.json",
  "luxury-hotel-groups-greater-china-official-hotels.json",
  "accor-china-official-hotels.json",
];

const classificationPolicy =
  "Media records keep official image URLs and official text attributes. Room and bathroom roles are assigned only from official alt/title/caption/nearby text, official URL tokens, or verified official CDN category suffixes; no visual guessing is used.";
const urlProbeConcurrency = 16;
const urlProbeTimeoutMs = 1_500;

const rolePatterns = {
  bathroom: /bath|bathroom|shower|tub|vanity|washroom|toilet|powder room|浴|卫生间|洗手间|淋浴|浴缸|浴室/i,
  suite: /suite|villa|residence|presidential|chairman|ambassador|apartment|套房|别墅|公寓|总统/i,
  room: /guest\s*room|guestroom|bedroom|room|king|queen|twin|double|deluxe|superior|standard|客房|卧室|大床|双床|豪华房|高级房|标准房/i,
  nonRoom:
    /restaurant|dining|bar|cafe|lobby|reception|exterior|facade|entrance|pool|spa|fitness|gym|meeting|ballroom|banquet|wedding|terrace|garden|view|exterior|餐厅|大堂|外观|泳池|会议|宴会|酒吧|健身|水疗/i,
};

async function main() {
  mkdirSync(hotelSourceDir, { recursive: true });

  const lhwImagesByKey = loadLhwImages();
  const hotels = hotelSourceFiles.flatMap(loadHotelsFromSource);
  const accorCdnMediaByKey = await buildAccorCdnMedia(hotels);
  const records = hotels.map((hotel) => buildMediaRecord(hotel, lhwImagesByKey.get(hotelKey(hotel)), accorCdnMediaByKey.get(hotelKey(hotel))));
  const metadata = buildMetadata(records);

  writeFileSync(
    outputJsonPath,
    `${JSON.stringify(
      {
        metadata,
        classificationPolicy,
        sourceFiles: hotelSourceFiles,
        records,
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(outputSummaryPath, toSummary(metadata));

  console.log(`Wrote ${records.length} hotel media records to ${outputJsonPath}`);
  console.log(`Wrote summary to ${outputSummaryPath}`);
}

function loadHotelsFromSource(fileName) {
  const payload = JSON.parse(readFileSync(join(hotelSourceDir, fileName), "utf8"));
  return (payload.hotels ?? []).map((hotel) => ({ ...hotel, sourceFile: fileName }));
}

function loadLhwImages() {
  try {
    const payload = JSON.parse(readFileSync(lhwImagesPath, "utf8"));
    return new Map((payload.hotels ?? []).map((record) => [hotelKey(record), record]));
  } catch {
    return new Map();
  }
}

async function buildAccorCdnMedia(hotels) {
  const accorHotels = hotels.filter((hotel) => hotel.chain === "Accor");
  if (accorHotels.length) console.log(`Probing Accor official CDN media for ${accorHotels.length} hotels...`);
  const tasks = accorHotels.map((hotel) => async () => {
    const code = cleanText(hotel.spiritCode).toLowerCase();
    if (!/^[a-z0-9]{3,8}$/.test(code)) return [hotelKey(hotel), null];

    const [coverImage, standardRoom, standardBathroom, suiteRoom] = await Promise.all([
      firstExistingAccorImage(code, ["ho_00"]),
      firstExistingAccorImage(code, rangeSuffixes("ro", 0, 4)),
      firstExistingAccorImage(code, rangeSuffixes("ba", 0, 3)),
      firstExistingAccorImage(code, rangeSuffixes("su", 0, 4)),
    ]);
    const media = stripNullish({
      coverImage,
      standardRoom,
      standardBathroom,
      suiteRoom,
    });
    return [hotelKey(hotel), media];
  });

  const pairs = await runLimited(tasks, urlProbeConcurrency);
  return new Map(pairs.filter(([, media]) => media && Object.keys(media).length));
}

async function firstExistingAccorImage(code, suffixes) {
  for (const suffix of suffixes) {
    const url = `https://www.ahstatic.com/photos/${code}_${suffix}_p_1024x768.jpg`;
    if (await urlExists(url)) return url;
  }
  return null;
}

async function urlExists(url) {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(urlProbeTimeoutMs),
      headers: { "user-agent": "hotel-guide-personal-research/0.1 (+low-frequency official media probe)" },
    });
    return response.ok;
  } catch {
    return false;
  }
}

function rangeSuffixes(prefix, start, end) {
  const suffixes = [];
  for (let index = start; index <= end; index += 1) suffixes.push(`${prefix}_${String(index).padStart(2, "0")}`);
  return suffixes;
}

async function runLimited(tasks, concurrency) {
  const results = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await tasks[index]();
      await delay(25);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

function buildMediaRecord(hotel, lhwImages, accorCdnMedia) {
  const candidates = [];
  const notes = [];
  const key = hotelKey(hotel);
  const sourceUrl = resolveSourceUrl(hotel);

  addSourceImages(candidates, hotel, sourceUrl);
  addLhwImages(candidates, lhwImages, sourceUrl);
  addAccorCdnImages(candidates, accorCdnMedia, sourceUrl);

  const coverImage = chooseCoverImage(candidates);
  const standardRoom = chooseRoomMedia(candidates, { suite: false, bathroom: false });
  const standardBathroom = chooseRoomMedia(candidates, { suite: false, bathroom: true });
  const suiteRoom = chooseRoomMedia(candidates, { suite: true, bathroom: false });
  const suiteBathroom = chooseRoomMedia(candidates, { suite: true, bathroom: true });
  const description = buildDescription(hotel, lhwImages);

  if (!coverImage) notes.push("cover_image_missing_from_official_media_source");
  if (!standardRoom) notes.push("standard_room_image_missing_from_official_media_source");
  if (!standardBathroom) notes.push("standard_bathroom_image_missing_from_official_media_source");
  if (!suiteRoom) notes.push("suite_room_image_missing_from_official_media_source");
  if (!suiteBathroom) notes.push("suite_bathroom_image_missing_from_official_media_source");

  return stripNullish({
    hotelKey: key,
    chain: normalizeChainName(hotel.chain),
    spiritCode: hotel.spiritCode,
    name_en: hotel.name_en,
    name_zh: hotel.name_zh,
    brand_en: hotel.brand_en,
    brand_zh: hotel.brand_zh,
    city_en: hotel.city_en,
    city_zh: hotel.city_zh,
    sourceUrl,
    fetchedAt,
    status: coverImage || standardRoom || standardBathroom || suiteRoom || suiteBathroom ? "partial" : "missing",
    description,
    coverImage,
    standardRoom,
    standardBathroom,
    suiteRoom,
    suiteBathroom,
    candidateCount: candidates.length,
    candidates: candidates.slice(0, 30),
    notes,
  });
}

function addAccorCdnImages(candidates, accorCdnMedia, sourceUrl) {
  if (!accorCdnMedia) return;

  addImageCandidate(candidates, {
    url: accorCdnMedia.coverImage,
    text: "Accor official hotel cover image",
    source: "accor_official_photo_cdn_verified_head",
    sourceUrl,
    explicitRole: "cover",
  });
  addImageCandidate(candidates, {
    url: accorCdnMedia.standardRoom,
    text: "Accor official guest room image",
    source: "accor_official_photo_cdn_verified_head",
    sourceUrl,
    explicitRole: "standard_room",
  });
  addImageCandidate(candidates, {
    url: accorCdnMedia.standardBathroom,
    text: "Accor official bathroom image",
    source: "accor_official_photo_cdn_verified_head",
    sourceUrl,
    explicitRole: "standard_bathroom",
  });
  addImageCandidate(candidates, {
    url: accorCdnMedia.suiteRoom,
    text: "Accor official suite image",
    source: "accor_official_photo_cdn_verified_head",
    sourceUrl,
    explicitRole: "suite_room",
  });
  addImageCandidate(candidates, {
    url: accorCdnMedia.suiteBathroom,
    text: "Accor official suite bathroom image",
    source: "accor_official_photo_cdn_verified_head",
    sourceUrl,
    explicitRole: "suite_bathroom",
  });
}

function addSourceImages(candidates, hotel, sourceUrl) {
  if (hotel.chain === "Hilton") {
    addHiltonImages(candidates, hotel, sourceUrl);
    return;
  }

  for (const url of imageUrlsFromUnknownShape(hotel.thumbnails)) {
    addImageCandidate(candidates, {
      url,
      text: [hotel.name_en, hotel.name_zh, hotel.brand_en, hotel.brand_zh].filter(Boolean).join(" "),
      source: "official_source_thumbnail",
      sourceUrl,
      explicitRole: "cover",
    });
  }

  for (const url of [hotel.thumbnailUrl, hotel.imageUrl, hotel.raw_en?.item?.image, hotel.raw_en?.image].filter(Boolean)) {
    addImageCandidate(candidates, {
      url,
      text: [hotel.name_en, hotel.name_zh, hotel.brand_en, hotel.brand_zh].filter(Boolean).join(" "),
      source: "official_source_image",
      sourceUrl,
      explicitRole: "cover",
    });
  }
}

function addHiltonImages(candidates, hotel, sourceUrl) {
  const images = hotel.raw_en?.item?.images ?? {};
  addHiltonImage(candidates, images.master, "hilton_official_master_image", sourceUrl, "cover");

  for (const image of images.carousel ?? []) {
    addHiltonImage(candidates, image, "hilton_official_carousel_image", sourceUrl);
  }
}

function addHiltonImage(candidates, image, source, sourceUrl, explicitRole) {
  const text = cleanText(image?.altText);
  for (const ratio of image?.ratios ?? []) {
    addImageCandidate(candidates, {
      url: ratio?.url,
      text,
      source,
      sourceUrl,
      explicitRole,
    });
  }
}

function addLhwImages(candidates, lhwImages, sourceUrl) {
  if (!lhwImages) return;

  addImageCandidate(candidates, {
    ...imageFields(lhwImages.coverImage),
    source: lhwImages.coverImage?.source || "lhw_official_cover_image",
    sourceUrl,
    explicitRole: "cover",
  });

  addImageCandidate(candidates, {
    ...imageFields(lhwImages.standardRoom?.image),
    text: [lhwImages.standardRoom?.name, imageText(lhwImages.standardRoom?.image)].filter(Boolean).join(" "),
    source: "lhw_official_standard_room_image",
    sourceUrl: lhwImages.standardRoom?.sourceUrl || sourceUrl,
    explicitRole: "standard_room",
    areaSqm: numberOrNull(lhwImages.standardRoom?.areaSqm),
  });

  addImageCandidate(candidates, {
    ...imageFields(lhwImages.baseRoom?.bathroomImage),
    text: [lhwImages.baseRoom?.name, imageText(lhwImages.baseRoom?.bathroomImage), "bathroom"].filter(Boolean).join(" "),
    source: "lhw_official_standard_bathroom_image",
    sourceUrl: lhwImages.baseRoom?.sourceUrl || sourceUrl,
    explicitRole: "standard_bathroom",
  });

  addImageCandidate(candidates, {
    ...imageFields(lhwImages.suiteRoom?.image),
    text: [lhwImages.suiteRoom?.name, imageText(lhwImages.suiteRoom?.image)].filter(Boolean).join(" "),
    source: "lhw_official_suite_room_image",
    sourceUrl: lhwImages.suiteRoom?.sourceUrl || sourceUrl,
    explicitRole: "suite_room",
    areaSqm: numberOrNull(lhwImages.suiteRoom?.areaSqm),
  });

  for (const image of lhwImages.baseRoom?.roomImageCandidates ?? []) {
    addImageCandidate(candidates, {
      ...imageFields(image),
      source: image?.source || "lhw_official_room_candidate",
      sourceUrl: lhwImages.baseRoom?.sourceUrl || sourceUrl,
    });
  }
}

function addImageCandidate(candidates, input) {
  const url = cleanUrl(input.url);
  if (!url || !/^https?:\/\//i.test(url) && !url.startsWith("/")) return;

  const text = cleanText(input.text || [input.alt, input.title, input.caption, input.nearText, url].filter(Boolean).join(" "));
  const roles = classifyImage(text, input.explicitRole);
  const candidate = stripNullish({
    url,
    alt: cleanText(input.alt || input.text),
    title: cleanText(input.title),
    caption: cleanText(input.caption),
    text,
    source: cleanText(input.source),
    sourceUrl: cleanText(input.sourceUrl),
    explicitRole: cleanText(input.explicitRole),
    areaSqm: numberOrNull(input.areaSqm) ?? extractAreaSqm(text),
    ...roles,
  });

  const key = `${candidate.url}|${candidate.explicitRole ?? ""}|${candidate.source ?? ""}`;
  if (candidates.some((existing) => `${existing.url}|${existing.explicitRole ?? ""}|${existing.source ?? ""}` === key)) return;
  candidates.push(candidate);
}

function classifyImage(text, explicitRole) {
  if (explicitRole === "cover") return { isCover: true };
  if (explicitRole === "standard_room") return { isRoom: true, isSuite: false, isBathroom: false };
  if (explicitRole === "standard_bathroom") return { isRoom: true, isSuite: false, isBathroom: true };
  if (explicitRole === "suite_room") return { isRoom: true, isSuite: true, isBathroom: false };
  if (explicitRole === "suite_bathroom") return { isRoom: true, isSuite: true, isBathroom: true };

  const value = cleanText(text);
  const hasBathroomSignal = rolePatterns.bathroom.test(value);
  const hasBedroomSceneSignal = /bed|bedroom|guest\s*room|guestroom|room with|客房|卧室|大床|双床/i.test(value);
  const isBathroom = hasBathroomSignal && !hasBedroomSceneSignal;
  const isSuite = rolePatterns.suite.test(value);
  const isRoom = isBathroom || isSuite || rolePatterns.room.test(value);
  const isNonRoom = rolePatterns.nonRoom.test(value) && !isRoom;
  return { isBathroom, isSuite, isRoom, isNonRoom };
}

function chooseCoverImage(candidates) {
  return toImageChoice(
    candidates.find((candidate) => candidate.isCover) ??
      candidates.find((candidate) => !candidate.isRoom && !candidate.isNonRoom) ??
      candidates[0],
  );
}

function chooseRoomMedia(candidates, { suite, bathroom }) {
  const candidate = candidates.find(
    (item) => item.isRoom && Boolean(item.isSuite) === suite && Boolean(item.isBathroom) === bathroom,
  );
  if (!candidate) return null;

  return stripNullish({
    name: roomName(candidate, { suite, bathroom }),
    image: toImageChoice(candidate),
    areaSqm: candidate.areaSqm,
    sourceUrl: candidate.sourceUrl,
  });
}

function toImageChoice(candidate) {
  if (!candidate) return null;
  return stripNullish({
    url: candidate.url,
    alt: candidate.alt || candidate.text,
    source: candidate.source,
    sourceUrl: candidate.sourceUrl,
  });
}

function roomName(candidate, { suite, bathroom }) {
  const text = cleanText(candidate.alt || candidate.title || candidate.caption || candidate.text);
  if (text && text.length <= 90) return text;
  if (suite && bathroom) return "Suite Bathroom";
  if (suite) return "Suite";
  if (bathroom) return "Guest Room Bathroom";
  return "Guest Room";
}

function buildDescription(hotel, lhwImages) {
  const textZh = cleanText(hotel.description_zh);
  const textEn =
    cleanText(lhwImages?.description?.text) ||
    cleanText(hotel.description_en) ||
    cleanText(hotel.raw_en?.item?.description) ||
    cleanText(hotel.raw_en?.description);
  if (!textZh && !textEn) return null;

  return stripNullish({
    textZh,
    textEn,
    source: lhwImages?.description?.source || "official_source_description",
  });
}

function imageUrlsFromUnknownShape(value) {
  if (!value) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(imageUrlsFromUnknownShape);
  if (typeof value === "object") {
    return Object.values(value).flatMap(imageUrlsFromUnknownShape);
  }
  return [];
}

function imageFields(image) {
  if (!image) return {};
  return {
    url: image.cachedPath || image.url,
    alt: image.alt,
    title: image.title,
    caption: image.caption,
    nearText: image.nearText,
    text: imageText(image),
  };
}

function imageText(image) {
  return cleanText([image?.alt, image?.title, image?.caption, image?.nearText, image?.className, image?.url].filter(Boolean).join(" "));
}

function resolveSourceUrl(hotel) {
  const zhUrl = cleanText(hotel.propertySiteURL_zh);
  const enUrl = cleanText(hotel.propertySiteURL_en);
  if (zhUrl && !/lhw\.cn\/domestic\/?$/i.test(zhUrl)) return zhUrl;
  return enUrl || zhUrl || null;
}

function buildMetadata(records) {
  return {
    generatedAt: fetchedAt,
    usage: "personal_noncommercial_low_frequency_official_media_index",
    recordCount: records.length,
    classificationPolicy,
    counts: {
      description: records.filter((record) => record.description?.textZh || record.description?.textEn).length,
      coverImage: records.filter((record) => record.coverImage?.url).length,
      standardRoom: records.filter((record) => record.standardRoom?.image?.url).length,
      standardBathroom: records.filter((record) => record.standardBathroom?.image?.url).length,
      suiteRoom: records.filter((record) => record.suiteRoom?.image?.url).length,
      suiteBathroom: records.filter((record) => record.suiteBathroom?.image?.url).length,
    },
    chainCounts: countBy(records, "chain"),
    chainCoverage: Object.fromEntries(
      Object.entries(groupBy(records, "chain")).map(([chain, rows]) => [
        chain,
        {
          count: rows.length,
          description: rows.filter((record) => record.description?.textZh || record.description?.textEn).length,
          coverImage: rows.filter((record) => record.coverImage?.url).length,
          standardRoom: rows.filter((record) => record.standardRoom?.image?.url).length,
          standardBathroom: rows.filter((record) => record.standardBathroom?.image?.url).length,
          suiteRoom: rows.filter((record) => record.suiteRoom?.image?.url).length,
          suiteBathroom: rows.filter((record) => record.suiteBathroom?.image?.url).length,
        },
      ]),
    ),
  };
}

function toSummary(metadata) {
  const rows = Object.entries(metadata.chainCoverage)
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(
      ([chain, row]) =>
        `| ${chain} | ${row.count} | ${row.coverImage} | ${row.description} | ${row.standardRoom} | ${row.standardBathroom} | ${row.suiteRoom} | ${row.suiteBathroom} |`,
    )
    .join("\n");

  return `# Hotel Official Media

- Generated at: ${metadata.generatedAt}
- Records: ${metadata.recordCount}
- Policy: ${metadata.classificationPolicy}

## Total Coverage

| Field | Count |
| --- | ---: |
| coverImage | ${metadata.counts.coverImage} |
| description | ${metadata.counts.description} |
| standardRoom | ${metadata.counts.standardRoom} |
| standardBathroom | ${metadata.counts.standardBathroom} |
| suiteRoom | ${metadata.counts.suiteRoom} |
| suiteBathroom | ${metadata.counts.suiteBathroom} |

## Chain Coverage

| Chain | Hotels | Cover | Description | Standard Room | Standard Bathroom | Suite Room | Suite Bathroom |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${rows}
`;
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] ?? "null";
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function groupBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] ?? "null";
    (acc[value] ??= []).push(item);
    return acc;
  }, {});
}

function hotelKey(hotel) {
  return `${hotel.chain}:${hotel.spiritCode}`;
}

function normalizeChainName(value) {
  return String(value).toLowerCase() === "hyatt" ? "Hyatt" : value;
}

function cleanText(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanUrl(value) {
  return cleanText(value).replace(/\\u0026/g, "&");
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function extractAreaSqm(value) {
  const text = String(value ?? "");
  const sqm = text.match(/(\d+(?:\.\d+)?)\s*(?:sqm|sq m|m2|m²|平方米)/i);
  if (sqm) return Math.round(Number(sqm[1]) * 10) / 10;
  const sqft = text.match(/(\d+(?:\.\d+)?)\s*(?:sqf|sq ft|sqft|ft²)/i);
  return sqft ? Math.round(Number(sqft[1]) * 0.92903) / 10 : null;
}

function stripNullish(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => {
      if (fieldValue === null || fieldValue === undefined || fieldValue === "") return false;
      if (Array.isArray(fieldValue) && fieldValue.length === 0) return false;
      return true;
    }),
  );
}

await main();
