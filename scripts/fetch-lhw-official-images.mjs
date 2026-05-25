import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { join } from "node:path";
import { env } from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { hotelBrowserDir, hotelPublicDir, hotelSourceDir } from "./paths.mjs";

const sourcePath = join(hotelSourceDir, "luxury-hotel-groups-greater-china-official-hotels.json");
const outputJsonPath = join(hotelSourceDir, "lhw-official-images.json");
const outputSummaryPath = join(hotelSourceDir, "lhw-official-images-summary.md");
const browserProfileDir = join(hotelBrowserDir, "lhw-images");
const publicMediaDir = join(hotelPublicDir, "media", "lhw");

const fetchedAt = new Date().toISOString();
const usage = "personal_noncommercial_low_frequency";
const limit = env.LHW_IMAGE_LIMIT ? positiveInteger(env.LHW_IMAGE_LIMIT, 0) : Infinity;
const filterText = (env.LHW_IMAGE_FILTER || "").trim().toLowerCase();
const delayMs = positiveInteger(env.LHW_IMAGE_DELAY_MS, 3_000);
const navigationTimeoutMs = positiveInteger(env.LHW_IMAGE_NAVIGATION_TIMEOUT_MS, 60_000);
const contentWaitMs = positiveInteger(env.LHW_IMAGE_CONTENT_WAIT_MS, 45_000);
const browserLaunchMode = env.LHW_IMAGE_BROWSER_LAUNCH_MODE || "cdp";
const browserHeadless =
  env.LHW_IMAGE_BROWSER_HEADLESS === undefined ? browserLaunchMode !== "cdp" : env.LHW_IMAGE_BROWSER_HEADLESS !== "0";
const browserChannel = env.LHW_IMAGE_BROWSER_CHANNEL || "chrome";
const browserSlowMoMs = positiveInteger(env.LHW_IMAGE_BROWSER_SLOW_MO_MS, 0);
const chromeExecutablePath = env.LHW_IMAGE_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const userAgent =
  env.LHW_IMAGE_USER_AGENT ||
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

const lhwChainName = "The Leading Hotels of the World";
const officialListSource = "https://www.lhw.com/find-a-hotel/browse-by-list/hotels-in-asia";
const classificationPolicy =
  "Only official page URLs and official text attributes are stored. Bathroom images are populated only when an official URL/alt/title/caption contains an explicit bathroom signal; otherwise standard-room and suite-room candidates are preserved without image-content guessing.";

async function main() {
  mkdirSync(hotelSourceDir, { recursive: true });
  mkdirSync(browserProfileDir, { recursive: true });
  mkdirSync(publicMediaDir, { recursive: true });

  const hotels = loadLhwHotels()
    .filter((hotel) => {
      if (!filterText) return true;
      return [hotel.name_en, hotel.name_zh, hotel.spiritCode, hotel.city_en, hotel.city_zh].some((value) =>
        String(value || "").toLowerCase().includes(filterText),
      );
    })
    .slice(0, limit);
  const browserSession = await launchImageBrowser();
  const context = browserSession.context;
  await context.addInitScript({ content: browserHelperScript() });

  const page = context.pages()[0] ?? (await context.newPage());
  const records = [];

  try {
    for (const [index, hotel] of hotels.entries()) {
      const label = `${index + 1}/${hotels.length} ${hotel.name_en}`;
      console.log(`Fetching LHW official images: ${label}`);
      records.push(await fetchHotelImages(page, hotel));
      if (index < hotels.length - 1 && delayMs > 0) await delay(delayMs);
    }
    await cacheOfficialImages(page, context, records);
  } finally {
    await browserSession.close();
  }

  const metadata = buildMetadata(records, hotels.length);
  const payload = {
    metadata,
    classificationPolicy,
    sourceFile: sourcePath,
    officialSources: [officialListSource, ...records.map((record) => record.propertySiteURL_en).filter(Boolean)],
    hotels: records,
  };

  writeFileSync(outputJsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  writeFileSync(outputSummaryPath, toSummary(metadata, records));
  console.log(`Wrote ${records.length} LHW official image records to ${outputJsonPath}`);
  console.log(`Wrote summary to ${outputSummaryPath}`);
}

async function fetchHotelImages(page, hotel) {
  const notes = [];
  const sourceUrl = hotel.propertySiteURL_en;

  if (!sourceUrl) {
    return buildFailedRecord(hotel, "missing_propertySiteURL_en", notes);
  }

  const record = {
    chain: hotel.chain,
    spiritCode: hotel.spiritCode,
    name_en: hotel.name_en,
    name_zh: hotel.name_zh,
    city_en: hotel.city_en,
    city_zh: hotel.city_zh,
    province_en: hotel.province_en,
    province_zh: hotel.province_zh,
    propertySiteURL_en: sourceUrl,
    propertySiteURL_zh: hotel.propertySiteURL_zh ?? null,
    fetchedAt,
    status: "ok",
    coverImage: null,
    ogImage: null,
    description: null,
    coverCandidates: [],
    baseRoom: null,
    standardRoom: null,
    suiteRoom: null,
    pageDiagnostics: {},
    notes,
  };

  try {
    const overviewNavigation = await gotoOfficialPage(page, sourceUrl, hotel.name_en);
    record.pageDiagnostics.overview = overviewNavigation;

    if (!overviewNavigation.officialContentLoaded) {
      record.status = "partial";
      notes.push("overview_page_not_confirmed_as_official_content_after_wait");
    }
    if (!overviewNavigation.expectedTextFound) {
      record.status = "partial";
      notes.push("overview_page_did_not_contain_expected_hotel_name");
    }

    const overview = await extractOverviewPage(page);
    record.ogImage = overview.ogImage;
    record.description = overview.description;
    record.coverCandidates = overview.coverCandidates;
    record.coverImage = chooseCoverImage(overview);

    if (!overviewNavigation.expectedTextFound) {
      record.baseRoom = buildEmptyBaseRoom("overview_page_not_matching_hotel_skip_room_gallery");
      if (!record.coverImage) notes.push("cover_image_not_found");
      notes.push("room_gallery_skipped_because_overview_page_did_not_match_hotel");
      return record;
    }

    const roomLink = chooseBaseRoomLink(overview.roomLinks, sourceUrl);
    if (!roomLink) {
      record.status = "partial";
      record.baseRoom = buildEmptyBaseRoom("no_official_room_link_found");
      notes.push("no_official_room_link_found");
      return record;
    }

    if (delayMs > 0) await delay(Math.min(delayMs, 2_000));

    const roomsNavigation = await gotoOfficialPage(page, roomLink.href, hotel.name_en);
    record.pageDiagnostics.rooms = roomsNavigation;

    if (!roomsNavigation.officialContentLoaded) {
      record.status = "partial";
      notes.push("rooms_page_not_confirmed_as_official_content_after_wait");
    }

    const baseRoom = await extractBaseRoom(page, roomLink);
    record.baseRoom = baseRoom;
    record.standardRoom = displayRoomFromBaseRoom(baseRoom);
    record.suiteRoom = chooseSuiteRoom(baseRoom.roomImageCandidates, sourceUrl, baseRoom.roomCode);

    if (!record.coverImage) {
      record.status = "partial";
      notes.push("cover_image_not_found");
    }
    if (!baseRoom.officialGalleryImages.length) {
      record.status = "partial";
      notes.push("base_room_gallery_images_not_found");
    }
    if (!baseRoom.bathroomImage) {
      notes.push("bathroom_image_not_populated_without_official_bathroom_signal");
    }

    return record;
  } catch (error) {
    record.status = "failed";
    record.notes.push(error instanceof Error ? error.message : String(error));
    return record;
  }
}

async function gotoOfficialPage(page, url, expectedText) {
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: navigationTimeoutMs });
  const contentState = await waitForOfficialContent(page, expectedText);
  await dismissKnownOverlays(page);

  return {
    requestedUrl: url,
    finalUrl: page.url(),
    httpStatus: response?.status() ?? null,
    title: await page.title().catch(() => ""),
    officialContentLoaded: contentState.officialContentLoaded,
    expectedTextFound: contentState.expectedTextFound,
  };
}

async function waitForOfficialContent(page, expectedText) {
  const started = Date.now();
  let lastState = { challengeText: true, hasLhwScaffold: false, hasExpected: false, bodyLength: 0, title: "" };
  while (Date.now() - started < contentWaitMs) {
    const state = await page
      .evaluate((needle) => {
        const title = document.title || "";
        const body = document.body?.innerText || "";
        const challengeText = /performing security verification|verify you are not a bot|just a moment/i.test(`${title}\n${body}`);
        const hasLhwScaffold = /THE LEADING HOTELS OF THE WORLD|LEADERS CLUB|FIND A HOTEL|ROOMS|OVERVIEW/i.test(body);
        const hasExpected = needle ? body.toLowerCase().includes(String(needle).toLowerCase().slice(0, 36)) : false;
        return { challengeText, hasLhwScaffold, hasExpected, bodyLength: body.length, title };
      }, expectedText)
      .catch(() => ({ challengeText: true, hasLhwScaffold: false, hasExpected: false, bodyLength: 0, title: "" }));
    lastState = state;

    if (!state.challengeText && state.bodyLength > 200 && (state.hasLhwScaffold || state.hasExpected)) {
      return { officialContentLoaded: true, expectedTextFound: state.hasExpected };
    }
    await delay(3_000);
  }
  return { officialContentLoaded: false, expectedTextFound: lastState.hasExpected };
}

async function dismissKnownOverlays(page) {
  const selectors = [
    "#onetrust-accept-btn-handler",
    "button:has-text('Accept All Cookies')",
    "button:has-text('Accept Cookies')",
    "button:has-text('I Accept')",
    "button:has-text('Agree')",
  ];

  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count().catch(() => 0)) > 0) {
      await locator.click({ timeout: 1_500 }).catch(() => {});
    }
  }
}

async function extractOverviewPage(page) {
  await scrollForLazyImages(page, [0, 450, 900, 1350, 0]);

  return page.evaluate(() => {
    const { cleanText, dedupeByHref, dedupeByUrl, isLikelyImageUrl, isNavigationImage, normalizeImageUrl, normalizeUrl, pickImageUrl } =
      window.__lhwScrape;
    const ogImage = normalizeImageUrl(
      document.querySelector('meta[property="og:image"]')?.getAttribute("content") ||
        document.querySelector('meta[name="twitter:image"]')?.getAttribute("content") ||
        "",
    );

    const imageCandidates = collectImageCandidates();
    const coverCandidates = imageCandidates
      .filter((image) => {
        const text = `${image.url} ${image.alt} ${image.className} ${image.nearText}`.toLowerCase();
        return text.includes("/hotelimages/final/") && !text.includes("/hotelimages/rooms/") && !isNavigationImage(text);
      })
      .map((image) => ({ ...image, source: "overview_hotel_image" }));

    if (ogImage && ogImage.toLowerCase().includes("/hotelimages/final/") && !coverCandidates.some((image) => image.url === ogImage)) {
      coverCandidates.unshift({
        url: ogImage,
        alt: "",
        title: "",
        className: "",
        width: null,
        height: null,
        naturalWidth: null,
        naturalHeight: null,
        y: null,
        nearText: "",
        source: "og:image",
      });
    }

    const roomLinks = [...document.querySelectorAll("a[href]")]
      .map((anchor, index) => ({
        index,
        text: cleanText(anchor.innerText || anchor.getAttribute("aria-label") || anchor.getAttribute("title") || ""),
        href: normalizeUrl(anchor.getAttribute("href") || ""),
        className: String(anchor.className || ""),
      }))
      .filter((anchor) => {
        try {
          const parsed = new URL(anchor.href);
          return parsed.pathname.endsWith("/rooms") && parsed.searchParams.has("rnum");
        } catch {
          return false;
        }
      });

    return {
      ogImage: ogImage
        ? {
            url: ogImage,
            source: "og:image",
          }
        : null,
      description: extractOfficialDescription(),
      coverCandidates: dedupeByUrl(coverCandidates),
      roomLinks: dedupeByHref(roomLinks),
    };

    function extractOfficialDescription() {
      const metaDescription = cleanText(
        document.querySelector('meta[name="description"]')?.getAttribute("content") ||
          document.querySelector('meta[property="og:description"]')?.getAttribute("content") ||
          "",
      );
      const lines = cleanText(document.body?.innerText || "")
        .split(/\n+/)
        .map((line) => cleanText(line))
        .filter(Boolean);
      const overviewIndex = lines.findIndex((line) => /^property overview$/i.test(line));
      if (overviewIndex >= 0) {
        const collected = [];
        for (const line of lines.slice(overviewIndex + 1)) {
          if (/^(rooms|dining|offers|location|hotel details|amenities|awards|reviews|map)$/i.test(line)) break;
          if (/^(view rooms|book now|check availability)$/i.test(line)) continue;
          collected.push(line);
          if (collected.join(" ").length > 700) break;
        }
        const overviewText = cleanText(collected.join(" "));
        if (overviewText.length > 80) {
          return {
            text: overviewText,
            source: "property_overview",
          };
        }
      }
      return metaDescription
        ? {
            text: metaDescription,
            source: "meta_description",
          }
        : null;
    }

    function collectImageCandidates() {
      return [...document.images]
        .map((image, index) => {
          const rect = image.getBoundingClientRect();
          return {
            index,
            url: pickImageUrl(image),
            alt: cleanText(image.alt || ""),
            title: cleanText(image.getAttribute("title") || ""),
            className: String(image.className || ""),
            width: Math.round(rect.width) || null,
            height: Math.round(rect.height) || null,
            naturalWidth: image.naturalWidth || null,
            naturalHeight: image.naturalHeight || null,
            y: Math.round(rect.top + window.scrollY) || null,
            nearText: cleanText(image.closest("section,article,li,div")?.innerText || "").slice(0, 320),
          };
        })
        .filter((image) => isLikelyImageUrl(image.url));
    }
  });
}

async function extractBaseRoom(page, roomLink) {
  await scrollForLazyImages(page, [0, 700, 1_250, 1_850, 0]);
  await dismissKnownOverlays(page);

  const roomListData = await extractRoomListData(page);
  const galleryImages = await openAndExtractFirstRoomGallery(page);
  const officialGalleryImages = dedupeByUrl(galleryImages.length ? galleryImages : roomListData.roomImageCandidates);
  const roomName =
    roomListData.selectedRoomName ||
    galleryImages.find((image) => image.alt)?.alt ||
    galleryImages.find((image) => image.caption)?.caption ||
    roomLink.text ||
    null;
  const roomCode = extractRoomCode(roomLink.href) || roomListData.selectedRoomCode || extractRoomCode(officialGalleryImages[0]?.url || "");
  const classified = classifyBaseRoomImages(officialGalleryImages);
  const notes = [];

  if (!classified.bathroomImage) {
    notes.push("no_image_specific_bathroom_signal_found_in_official_room_gallery");
  }
  if (!classified.bedroomImage && officialGalleryImages.length) {
    notes.push("bedroom_image_not_populated_without_official_bedroom_signal");
  }

  return {
    name: roomName,
    roomCode,
    sourceUrl: roomLink.href,
    sourceText: roomLink.text,
    representativeImage: officialGalleryImages[0] ?? null,
    bedroomImage: classified.bedroomImage,
    bathroomImage: classified.bathroomImage,
    officialGalleryImages,
    roomImageCandidates: roomListData.roomImageCandidates,
    notes,
  };
}

async function extractRoomListData(page) {
  return page.evaluate(() => {
    const { cleanText, dedupeByUrl, extractRoomCodeFromUrl, isLikelyImageUrl, pickImageUrl } = window.__lhwScrape;
    const headings = [...document.querySelectorAll("h1,h2,h3,h4")]
      .map((heading) => cleanText(heading.innerText || ""))
      .filter(Boolean);
    const selectedRoomIndex = headings.findIndex((heading) => /^selected room$/i.test(heading));
    const selectedRoomHeading =
      selectedRoomIndex >= 0
        ? headings.slice(selectedRoomIndex + 1).find((heading) => !/other rooms|privacy|manage consent|cookies/i.test(heading)) || ""
        : headings.find((heading) => !/log in|rooms|selected room|other rooms|privacy/i.test(heading)) || "";

    const roomImageCandidates = collectImageCandidates()
      .filter((image) => image.url.toLowerCase().includes("/hotelimages/rooms/"))
      .map((image) => ({ ...image, source: "rooms_page_image" }));

    return {
      headings,
      selectedRoomName: selectedRoomHeading || roomImageCandidates[0]?.alt || null,
      selectedRoomCode: extractRoomCodeFromUrl(roomImageCandidates[0]?.url || ""),
      roomImageCandidates: dedupeByUrl(roomImageCandidates),
    };

    function collectImageCandidates() {
      return [...document.images]
        .map((image, index) => {
          const rect = image.getBoundingClientRect();
          return {
            index,
            url: pickImageUrl(image),
            alt: cleanText(image.alt || ""),
            title: cleanText(image.getAttribute("title") || ""),
            caption: cleanText(image.closest(".swiper-slide,.room-item,.room-detail,article,section,div")?.innerText || "").slice(0, 320),
            className: String(image.className || ""),
            width: Math.round(rect.width) || null,
            height: Math.round(rect.height) || null,
            naturalWidth: image.naturalWidth || null,
            naturalHeight: image.naturalHeight || null,
            y: Math.round(rect.top + window.scrollY) || null,
          };
        })
        .filter((image) => isLikelyImageUrl(image.url));
    }
  });
}

async function openAndExtractFirstRoomGallery(page) {
  const galleryButtons = page.locator(".gallery-icon");
  const galleryButtonCount = await galleryButtons.count().catch(() => 0);
  if (!galleryButtonCount) return [];

  await galleryButtons.first().scrollIntoViewIfNeeded().catch(() => {});
  await galleryButtons.first().click({ timeout: 8_000 }).catch(() => {});
  await page.waitForSelector("#js-modal-gallery img, .modal.show img", { timeout: 8_000 }).catch(() => {});

  const images = await page.evaluate(() => {
    const { cleanText, isLikelyImageUrl, pickImageUrl } = window.__lhwScrape;
    const modal = document.querySelector("#js-modal-gallery") || document.querySelector(".modal.show");
    if (!modal) return [];

    return [...modal.querySelectorAll("img")]
      .map((image, index) => {
        const rect = image.getBoundingClientRect();
        const slide = image.closest(".swiper-slide,.slide-image,div");
        return {
          index,
          url: pickImageUrl(image),
          alt: cleanText(image.alt || ""),
          title: cleanText(image.getAttribute("title") || ""),
          caption: cleanText(slide?.innerText || image.closest(".modal-body")?.innerText || "").slice(0, 320),
          className: String(image.className || ""),
          width: Math.round(rect.width) || null,
          height: Math.round(rect.height) || null,
          naturalWidth: image.naturalWidth || null,
          naturalHeight: image.naturalHeight || null,
          y: Math.round(rect.top + window.scrollY) || null,
          source: "base_room_gallery_modal",
        };
      })
      .filter((image) => isLikelyImageUrl(image.url) && image.url.toLowerCase().includes("/hotelimages/rooms/"));
  });

  await page.keyboard.press("Escape").catch(() => {});
  return dedupeByUrl(images);
}

async function scrollForLazyImages(page, positions) {
  for (const y of positions) {
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y).catch(() => {});
    await page.waitForTimeout(450).catch(() => {});
  }
}

function chooseCoverImage(overview) {
  const candidates = overview.coverCandidates ?? [];
  return (
    candidates.find((image) => image.source === "overview_hotel_image" && (image.width || image.naturalWidth || 0) >= 600) ||
    candidates.find((image) => image.source === "overview_hotel_image") ||
    candidates.find((image) => image.source === "og:image") ||
    null
  );
}

function chooseBaseRoomLink(roomLinks, sourceUrl) {
  if (roomLinks.length) return roomLinks[0];
  const roomsUrl = new URL(sourceUrl);
  roomsUrl.pathname = `${roomsUrl.pathname.replace(/\/$/, "")}/rooms`;
  return {
    index: null,
    text: "ROOMS",
    href: roomsUrl.href,
    className: "",
  };
}

function classifyBaseRoomImages(images) {
  const bathroomImage = images.find((image) => hasBathroomSignal(image)) ?? null;
  const bedroomSignalImage = images.find((image) => hasBedroomSignal(image)) ?? null;
  const bedroomImage = bedroomSignalImage
    ? {
        ...bedroomSignalImage,
        classification: {
          label: "bedroom",
          source: "official_text_signal",
          confidence: "low",
          note: "LHW room galleries often repeat the room name for every image, so this is not image-content classification.",
        },
      }
    : null;

  return {
    bedroomImage,
    bathroomImage: bathroomImage
      ? {
          ...bathroomImage,
          classification: {
            label: "bathroom",
            source: "official_text_signal",
            confidence: "medium",
          },
        }
      : null,
  };
}

function hasBedroomSignal(image) {
  return /(^|[^a-z])(bedroom|bed room|king bed|queen bed|twin bed|bed)([^a-z]|$)|卧室|客房|床/i.test(imageText(image));
}

function hasBathroomSignal(image) {
  return /(^|[^a-z])(bathroom|bath room|bath|bathtub|shower|vanity|toilet|washroom)([^a-z]|$)|卫生间|浴室|浴缸|淋浴|盥洗/i.test(imageText(image));
}

function imageText(image) {
  return [image.url, image.alt, image.title, image.caption, image.nearText, image.className].filter(Boolean).join(" ");
}

function displayRoomFromBaseRoom(baseRoom) {
  if (!baseRoom) return null;
  const standardCandidate =
    baseRoom.roomImageCandidates?.find((candidate) => !/suite|套房|villa|别墅/i.test(imageText(candidate))) ?? null;
  if (standardCandidate) {
    const roomCode = extractRoomCodeFromCandidate(standardCandidate);
    return {
      name: standardCandidate.alt || standardCandidate.caption || null,
      roomCode,
      areaSqm: extractAreaSqm(imageText(standardCandidate)),
      sourceUrl: roomCode && baseRoom.sourceUrl ? roomUrlFor(new URL(baseRoom.sourceUrl).origin + new URL(baseRoom.sourceUrl).pathname.replace(/\/rooms$/, ""), roomCode) : baseRoom.sourceUrl,
      image: standardCandidate,
    };
  }
  const representativeImage = baseRoom.bedroomImage || baseRoom.representativeImage || baseRoom.officialGalleryImages?.[0] || null;
  const text = [baseRoom.name, baseRoom.sourceText, imageText(representativeImage ?? {})].filter(Boolean).join(" ");
  return {
    name: baseRoom.name,
    roomCode: baseRoom.roomCode,
    areaSqm: extractAreaSqm(text),
    sourceUrl: baseRoom.sourceUrl,
    image: representativeImage,
  };
}

function chooseSuiteRoom(roomImageCandidates, sourceUrl, standardRoomCode) {
  const candidates = (roomImageCandidates ?? []).filter((candidate) => candidate.url);
  const suiteCandidate =
    candidates.find((candidate) => /suite|套房/i.test(imageText(candidate)) && extractRoomCodeFromCandidate(candidate) !== standardRoomCode) ??
    candidates.find((candidate) => /villa|别墅/i.test(imageText(candidate)) && extractRoomCodeFromCandidate(candidate) !== standardRoomCode) ??
    null;
  if (!suiteCandidate) return null;

  const roomCode = extractRoomCodeFromCandidate(suiteCandidate);
  return {
    name: suiteCandidate.alt || suiteCandidate.caption || null,
    roomCode,
    areaSqm: extractAreaSqm(imageText(suiteCandidate)),
    sourceUrl: roomCode ? roomUrlFor(sourceUrl, roomCode) : null,
    image: suiteCandidate,
  };
}

function extractRoomCodeFromCandidate(candidate) {
  return windowSafeRoomCode(candidate?.url) || windowSafeRoomCode(candidate?.roomCode);
}

function windowSafeRoomCode(value) {
  const text = String(value ?? "");
  const match = text.match(/_([A-Z0-9]{2,8})_\d+_\d+x\d+\./i) || text.match(/[?&]rnum=([A-Z0-9-]+)/i);
  return match?.[1] ?? null;
}

function roomUrlFor(sourceUrl, roomCode) {
  const roomsUrl = new URL(sourceUrl);
  roomsUrl.pathname = `${roomsUrl.pathname.replace(/\/$/, "")}/rooms`;
  roomsUrl.search = "";
  roomsUrl.searchParams.set("rnum", roomCode);
  return roomsUrl.href;
}

function extractAreaSqm(text) {
  const value = String(text ?? "");
  const sqm = value.match(/(\d+(?:\.\d+)?)\s*(?:sqm|sq m|m2|m²)/i);
  if (sqm) return round(Number(sqm[1]));
  const sqft = value.match(/(\d+(?:\.\d+)?)\s*(?:sqf|sq ft|sqft|ft²)/i);
  if (sqft) return round(Number(sqft[1]) * 0.092903);
  return null;
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function buildEmptyBaseRoom(reason) {
  return {
    name: null,
    roomCode: null,
    sourceUrl: null,
    sourceText: null,
    representativeImage: null,
    bedroomImage: null,
    bathroomImage: null,
    officialGalleryImages: [],
    roomImageCandidates: [],
    notes: [reason],
  };
}

function buildFailedRecord(hotel, reason, notes) {
  return {
    chain: hotel.chain,
    spiritCode: hotel.spiritCode,
    name_en: hotel.name_en,
    name_zh: hotel.name_zh,
    city_en: hotel.city_en,
    city_zh: hotel.city_zh,
    province_en: hotel.province_en,
    province_zh: hotel.province_zh,
    propertySiteURL_en: hotel.propertySiteURL_en ?? null,
    propertySiteURL_zh: hotel.propertySiteURL_zh ?? null,
    fetchedAt,
    status: "failed",
    coverImage: null,
    ogImage: null,
    description: null,
    coverCandidates: [],
    baseRoom: buildEmptyBaseRoom(reason),
    standardRoom: null,
    suiteRoom: null,
    pageDiagnostics: {},
    notes: [...notes, reason],
  };
}

function buildMetadata(records, requestedCount) {
  return {
    fetchedAt,
    usage,
    source: "LHW official hotel detail and room pages",
    sourceFile: sourcePath,
    requestedHotelCount: requestedCount,
    recordCount: records.length,
    okCount: records.filter((record) => record.status === "ok").length,
    partialCount: records.filter((record) => record.status === "partial").length,
    failedCount: records.filter((record) => record.status === "failed").length,
    coverImageCount: records.filter((record) => record.coverImage?.url).length,
    cachedPrimaryImageCount: collectPrimaryImageRefs(records).filter(({ image }) => image.cachedPath).length,
    descriptionCount: records.filter((record) => record.description?.text).length,
    baseRoomGalleryCount: records.filter((record) => record.baseRoom?.officialGalleryImages?.length).length,
    standardRoomImageCount: records.filter((record) => record.standardRoom?.image?.url).length,
    suiteRoomImageCount: records.filter((record) => record.suiteRoom?.image?.url).length,
    representativeRoomImageCount: records.filter((record) => record.baseRoom?.representativeImage?.url).length,
    bedroomImageCount: records.filter((record) => record.baseRoom?.bedroomImage?.url).length,
    bathroomImageCount: records.filter((record) => record.baseRoom?.bathroomImage?.url).length,
    delayMs,
    browserLaunchMode,
    browserHeadless,
    classificationPolicy,
  };
}

function toSummary(metadata, records) {
  const lines = [
    "# LHW Official Images Test",
    "",
    `Fetched at: ${metadata.fetchedAt}`,
    `Usage: ${metadata.usage}`,
    `Records: ${metadata.recordCount}`,
    `OK: ${metadata.okCount}`,
    `Partial: ${metadata.partialCount}`,
    `Failed: ${metadata.failedCount}`,
    `Cover images: ${metadata.coverImageCount}`,
    `Cached primary images: ${metadata.cachedPrimaryImageCount}`,
    `Descriptions: ${metadata.descriptionCount}`,
    `Base room galleries: ${metadata.baseRoomGalleryCount}`,
    `Standard room images: ${metadata.standardRoomImageCount}`,
    `Suite room images: ${metadata.suiteRoomImageCount}`,
    `Representative room images: ${metadata.representativeRoomImageCount}`,
    `Bedroom images: ${metadata.bedroomImageCount}`,
    `Bathroom images: ${metadata.bathroomImageCount}`,
    "",
    "Classification policy:",
    metadata.classificationPolicy,
    "",
    "| Hotel | Status | Cover | Description | Standard room | Suite room | Bathroom | Notes |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |",
  ];

  for (const record of records) {
    lines.push(
      [
        record.name_en,
        record.status,
        record.coverImage?.url ? "yes" : "no",
        record.description?.text ? "yes" : "no",
        record.standardRoom?.image?.url ? "yes" : "no",
        record.suiteRoom?.image?.url ? "yes" : "no",
        record.baseRoom?.bathroomImage?.url ? "yes" : "no",
        [...(record.notes ?? []), ...(record.baseRoom?.notes ?? [])].join("; "),
      ].join(" | "),
    );
  }

  return `${lines.join("\n")}\n`;
}

function loadLhwHotels() {
  if (!existsSync(sourcePath)) throw new Error(`Missing source file: ${sourcePath}`);
  const payload = JSON.parse(readFileSync(sourcePath, "utf8"));
  const hotels = Array.isArray(payload.hotels) ? payload.hotels : [];
  return hotels.filter((hotel) => hotel.chain === lhwChainName);
}

function dedupeByUrl(items) {
  const seen = new Set();
  const deduped = [];
  for (const item of items) {
    if (!item?.url || seen.has(item.url)) continue;
    seen.add(item.url);
    deduped.push(item);
  }
  return deduped;
}

function dedupeByHref(items) {
  const seen = new Set();
  const deduped = [];
  for (const item of items) {
    if (!item?.href || seen.has(item.href)) continue;
    seen.add(item.href);
    deduped.push(item);
  }
  return deduped;
}

async function cacheOfficialImages(page, context, records) {
  const imageRefs = collectPrimaryImageRefs(records);
  const cachedByUrl = new Map();

  for (const { image, pageUrl, record } of imageRefs) {
    if (!image?.url) continue;
    if (cachedByUrl.has(image.url)) {
      image.cachedPath = cachedByUrl.get(image.url);
      continue;
    }
    const cachedPath = await cacheImage(context, image.url, record)
      .catch(() => cacheImageScreenshot(page, image.url, record, pageUrl))
      .catch((error) => {
        record.notes.push(`image_cache_failed:${image.url}:${error.message}`);
        return null;
      });
    if (!cachedPath) continue;
    image.cachedPath = cachedPath;
    cachedByUrl.set(image.url, cachedPath);
  }
}

function collectPrimaryImageRefs(records) {
  const refs = [];
  for (const record of records) {
    if (record.coverImage?.url) refs.push({ record, image: record.coverImage, pageUrl: record.propertySiteURL_en });
    if (record.standardRoom?.image?.url) {
      refs.push({ record, image: record.standardRoom.image, pageUrl: record.standardRoom.sourceUrl || record.baseRoom?.sourceUrl || record.propertySiteURL_en });
    }
    if (record.suiteRoom?.image?.url) {
      refs.push({ record, image: record.suiteRoom.image, pageUrl: record.suiteRoom.sourceUrl || record.propertySiteURL_en });
    }
  }
  return refs;
}

async function cacheImage(context, url, record) {
  const response = await context.request.get(url, {
    headers: {
      referer: record.propertySiteURL_en || "https://www.lhw.com/",
      "user-agent": userAgent,
    },
    timeout: 25_000,
  });
  if (!response.ok()) throw new Error(`HTTP ${response.status()}`);
  const buffer = await response.body();
  const extension = imageExtension(url, response.headers()["content-type"]);
  const filename = `${slugify(record.spiritCode || record.name_en)}-${createHash("sha1").update(url).digest("hex").slice(0, 10)}${extension}`;
  writeFileSync(join(publicMediaDir, filename), buffer);
  return `/media/lhw/${filename}`;
}

async function cacheImageScreenshot(page, url, record, pageUrl) {
  if (!pageUrl) throw new Error("missing_page_url_for_image_screenshot_cache");
  const filename = `${slugify(record.spiritCode || record.name_en)}-${createHash("sha1").update(url).digest("hex").slice(0, 10)}.png`;
  const path = join(publicMediaDir, filename);
  await gotoOfficialPage(page, pageUrl, record.name_en);
  await scrollForLazyImages(page, [0, 450, 900, 1350, 1850, 2350]);
  await hideImageOverlays(page);
  const imageHandle = await findRenderedImage(page, url);
  if (!imageHandle) throw new Error(`rendered_image_not_found:${url}`);
  await imageHandle.scrollIntoViewIfNeeded().catch(() => {});
  await imageHandle.screenshot({ path });
  return `/media/lhw/${filename}`;
}

async function hideImageOverlays(page) {
  await page
    .addStyleTag({
      content: `
        .gallery-icon,
        .swiper-button-next,
        .swiper-button-prev,
        .carousel-control-next,
        .carousel-control-prev,
        a[href*="pinterest"],
        a[href*="facebook"],
        a[href*="twitter"],
        [class*="pinterest"],
        [class*="share"],
        [class*="social"] {
          visibility: hidden !important;
        }
      `,
    })
    .catch(() => {});
}

async function findRenderedImage(page, url) {
  const signature = imageSignature(url);
  const handle = await page.evaluateHandle((needle) => {
    const normalize = (value) => String(value || "").toLowerCase().replace(/_\d+x\d+(?=\.)/g, "");
    const sourcesFor = (image) =>
      normalize(
        [
          image.currentSrc,
          image.src,
          image.getAttribute("src"),
          image.getAttribute("data-src"),
          image.getAttribute("data-original"),
          image.getAttribute("data-lazy"),
          image.getAttribute("srcset"),
          image.getAttribute("data-srcset"),
        ]
          .filter(Boolean)
          .join(" "),
      );
    return (
      [...document.images].find((image) => sourcesFor(image).includes(needle) && image.getBoundingClientRect().width > 20) ?? null
    );
  }, signature);
  const element = handle.asElement();
  if (!element) {
    await handle.dispose().catch(() => {});
    return null;
  }
  return element;
}

function imageSignature(url) {
  return String(new URL(url).pathname.split("/").pop() || "")
    .toLowerCase()
    .replace(/_\d+x\d+(?=\.)/, "");
}

function imageExtension(url, contentType) {
  const pathExtension = new URL(url).pathname.match(/\.(jpe?g|png|webp)$/i)?.[0]?.toLowerCase();
  if (pathExtension) return pathExtension === ".jpeg" ? ".jpg" : pathExtension;
  if (/png/i.test(contentType || "")) return ".png";
  if (/webp/i.test(contentType || "")) return ".webp";
  return ".jpg";
}

function slugify(value) {
  return String(value || "lhw")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function extractRoomCode(url) {
  if (!url) return null;
  const fromParam = new URL(url, "https://www.lhw.com").searchParams.get("rnum");
  if (fromParam) return fromParam;
  const fromImage = url.match(/room_[^/]+?_([A-Z0-9]+)_\d+_/i);
  return fromImage?.[1] ?? null;
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

async function launchImageBrowser() {
  if (browserLaunchMode === "cdp") return launchCdpImageBrowser();

  const options = {
    headless: browserHeadless,
    viewport: { width: 1440, height: 1200 },
    userAgent,
    locale: "en-US",
    slowMo: browserSlowMoMs,
    timeout: Math.max(navigationTimeoutMs, 45_000),
  };

  try {
    const context = await chromium.launchPersistentContext(browserProfileDir, {
      ...options,
      channel: browserChannel,
    });
    return { context, close: () => context.close() };
  } catch (error) {
    if (browserChannel === "chromium") throw error;
    const context = await chromium.launchPersistentContext(join(hotelBrowserDir, "lhw-images-chromium"), options);
    return { context, close: () => context.close() };
  }
}

async function launchCdpImageBrowser() {
  if (browserHeadless) {
    throw new Error("LHW_IMAGE_BROWSER_HEADLESS=1 is not compatible with LHW_IMAGE_BROWSER_LAUNCH_MODE=cdp.");
  }
  if (!existsSync(chromeExecutablePath)) {
    throw new Error(`Google Chrome executable not found: ${chromeExecutablePath}`);
  }

  const port = env.LHW_IMAGE_CDP_PORT ? positiveInteger(env.LHW_IMAGE_CDP_PORT, 0) : await getAvailablePort();
  const profilePath = join(hotelBrowserDir, `lhw-images-cdp-${fetchedAt.replace(/[^0-9A-Za-z]/g, "-")}`);
  mkdirSync(profilePath, { recursive: true });
  const chromeProcess = spawn(
    chromeExecutablePath,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profilePath}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--lang=en-US",
      "about:blank",
    ],
    { detached: true, stdio: "ignore" },
  );
  chromeProcess.unref();

  await waitForCdp(port);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = context.pages()[0] ?? (await context.newPage());
  await page.setViewportSize({ width: 1440, height: 1200 }).catch(() => {});

  return {
    context,
    close: async () => {
      await browser.close().catch(() => {});
      if (chromeProcess.pid) {
        try {
          process.kill(-chromeProcess.pid, "SIGTERM");
        } catch {
          try {
            process.kill(chromeProcess.pid, "SIGTERM");
          } catch {
            // Browser already exited.
          }
        }
      }
    },
  };
}

async function waitForCdp(port) {
  let lastError;
  for (let attempt = 1; attempt <= 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw new Error(`Chrome CDP endpoint did not become ready on port ${port}: ${lastError?.message ?? "timeout"}`);
}

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => {
        if (port) resolve(port);
        else reject(new Error("Could not allocate a local CDP port."));
      });
    });
  });
}

function browserHelperScript() {
  return String.raw`
    window.__lhwScrape = {
      normalizeUrl(url) {
        if (!url) return "";
        try {
          return new URL(url, window.location.href).href;
        } catch {
          return url;
        }
      },
      normalizeImageUrl(url) {
        const normalized = window.__lhwScrape.normalizeUrl(url);
        return window.__lhwScrape.isLikelyImageUrl(normalized) ? normalized : "";
      },
      pickImageUrl(image) {
        const srcset = image.getAttribute("srcset") || image.getAttribute("data-srcset") || "";
        const srcsetUrl = srcset
          .split(",")
          .map((part) => part.trim().split(/\s+/)[0])
          .filter(Boolean)
          .at(-1);
        const candidates = [
          image.currentSrc,
          image.getAttribute("src"),
          image.getAttribute("data-src"),
          image.getAttribute("data-original"),
          image.getAttribute("data-lazy"),
          srcsetUrl,
        ];

        for (const candidate of candidates) {
          const normalized = window.__lhwScrape.normalizeImageUrl(candidate || "");
          if (normalized) return normalized;
        }
        return "";
      },
      isLikelyImageUrl(url) {
        if (!url) return false;
        if (!/^https?:\/\//i.test(url)) return false;
        if (/\/hotel\/[^.]+$/i.test(url)) return false;
        return /\.(avif|gif|jpe?g|png|webp|svg)(\?|#|$)/i.test(url);
      },
      isNavigationImage(text) {
        return /app_themes\/global|facebook_lhw_logo|loyalty\/global\/header|navigation\/leaders-club|offers\/|collections\/|logo|badge|cookielaw|qualtrics/i.test(text);
      },
      cleanText(text) {
        return String(text || "").replace(/\s+/g, " ").trim();
      },
      dedupeByUrl(items) {
        const seen = new Set();
        const deduped = [];
        for (const item of items) {
          if (!item?.url || seen.has(item.url)) continue;
          seen.add(item.url);
          deduped.push(item);
        }
        return deduped;
      },
      dedupeByHref(items) {
        const seen = new Set();
        const deduped = [];
        for (const item of items) {
          if (!item?.href || seen.has(item.href)) continue;
          seen.add(item.href);
          deduped.push(item);
        }
        return deduped;
      },
      extractRoomCodeFromUrl(url) {
        const match = String(url || "").match(/room_[^/]+?_([A-Z0-9]+)_\d+_/i);
        return match?.[1] ?? null;
      },
    };
  `;
}

// Browser-context helpers used inside page.evaluate.
function normalizeUrl(url) {
  if (!url) return "";
  try {
    return new URL(url, window.location.href).href;
  } catch {
    return url;
  }
}

function normalizeImageUrl(url) {
  const normalized = normalizeUrl(url);
  return isLikelyImageUrl(normalized) ? normalized : "";
}

function pickImageUrl(image) {
  const srcset = image.getAttribute("srcset") || image.getAttribute("data-srcset") || "";
  const srcsetUrl = srcset
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0])
    .filter(Boolean)
    .at(-1);
  const candidates = [
    image.currentSrc,
    image.getAttribute("src"),
    image.getAttribute("data-src"),
    image.getAttribute("data-original"),
    image.getAttribute("data-lazy"),
    srcsetUrl,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeImageUrl(candidate || "");
    if (normalized) return normalized;
  }
  return "";
}

function isLikelyImageUrl(url) {
  if (!url) return false;
  if (!/^https?:\/\//i.test(url)) return false;
  if (/\/hotel\/[^.]+$/i.test(url)) return false;
  return /\.(avif|gif|jpe?g|png|webp|svg)(\?|#|$)/i.test(url);
}

function isNavigationImage(text) {
  return /app_themes\/global|facebook_lhw_logo|loyalty\/global\/header|navigation\/leaders-club|offers\/|collections\/|logo|badge|cookielaw|qualtrics/i.test(text);
}

function cleanText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function extractRoomCodeFromUrl(url) {
  const match = String(url || "").match(/room_[^/]+?_([A-Z0-9]+)_\d+_/i);
  return match?.[1] ?? null;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
