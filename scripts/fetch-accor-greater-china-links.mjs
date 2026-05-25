import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "node:process";
import { hotelSourceDir } from "./paths.mjs";

const outputDir = hotelSourceDir;
const outputPath = join(outputDir, "accor-china-official-hotel-links.json");
const userAgent = "michelin-list-personal-research/0.1 (+low-frequency official Accor hotel list collection)";

const destinations = [
  {
    key: "mainland_china",
    label: "Mainland China",
    url: "https://all.accor.com/a/en/destination/country/hotels-china-pcn.html",
    maxPages: 80,
  },
  {
    key: "hong_kong",
    label: "Hong Kong",
    url: "https://all.accor.com/a/en/destination/city/hotels-hong-kong-v7750.html",
    maxPages: 6,
  },
  {
    key: "macau",
    label: "Macau",
    url: "https://all.accor.com/a/en/destination/city/hotels-macau-v178205.html",
    maxPages: 6,
  },
  {
    key: "taiwan",
    label: "Taiwan",
    url: "https://all.accor.com/a/en/destination/region/hotels-taiwan-ptw.html",
    maxPages: 6,
    allowNotFound: true,
  },
];

const seen = new Set();
const hotels = [];
const pageReports = [];

mkdirSync(outputDir, { recursive: true });

for (const destination of destinations) {
  let emptyPageCount = 0;

  for (let pageIndex = 1; pageIndex <= destination.maxPages; pageIndex += 1) {
    const url = withPageIndex(destination.url, pageIndex);
    const page = await fetchDestinationPage(url, { allowNotFound: Boolean(destination.allowNotFound) });
    const pageHotels = page.hotels.map((hotel) => ({
      ...hotel,
      destinationKey: destination.key,
      destinationLabel: destination.label,
    }));
    let added = 0;

    for (const hotel of pageHotels) {
      if (seen.has(hotel.code)) continue;
      seen.add(hotel.code);
      hotels.push(hotel);
      added += 1;
    }

    pageReports.push({
      destinationKey: destination.key,
      destinationLabel: destination.label,
      pageIndex,
      status: page.status,
      count: pageHotels.length,
      added,
      total: hotels.length,
      title: page.title,
      url,
    });

    console.log(`${destination.key} page ${pageIndex}: ${pageHotels.length} found, ${added} added`);

    if (page.status === 404) break;
    if (pageHotels.length === 0) emptyPageCount += 1;
    if (emptyPageCount >= 3) break;

    await sleep(120);
  }
}

writeFileSync(
  outputPath,
  `${JSON.stringify(
    {
      metadata: {
        source: "all_accor_official_greater_china_destination_pages",
        source_urls: destinations.map(({ key, label, url }) => ({ key, label, url })),
        fetchedAt: new Date().toISOString(),
        pageReports,
      },
      hotels: hotels.sort((left, right) => left.code.localeCompare(right.code)),
    },
    null,
    2,
  )}\n`,
);

console.log(`Wrote ${hotels.length} Accor hotel links to ${outputPath}`);

async function fetchDestinationPage(url, { allowNotFound }) {
  const response = await fetch(url, {
    headers: {
      "accept-language": "en-US,en;q=0.9",
      ...(env.ACCOR_COOKIE ? { cookie: env.ACCOR_COOKIE } : {}),
      "user-agent": userAgent,
    },
  });
  const html = await response.text();
  if (!response.ok) {
    const title = cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, " "));
    if (allowNotFound && response.status === 404) return { status: response.status, title, hotels: [] };
    throw new Error(`Accor destination fetch failed ${response.status}: ${url}`);
  }
  const jsonLd = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => safeJson(match[1]))
    .filter(Boolean);
  const listItems = jsonLd
    .flatMap((item) => (Array.isArray(item.itemListElement) ? item.itemListElement : []))
    .filter((item) => item?.item?.["@type"] === "Hotel");
  const title = cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, " "));

  return {
    status: response.status,
    title,
    hotels: listItems.map((listItem) => {
      const hotel = listItem.item;
      const code = cleanText(hotel["@id"]) || codeFromUrl(hotel.url);
      return {
        code,
        name_en_list: cleanText(hotel.name),
        propertySiteURL_en: hotel.url,
        officialListItem: hotel,
      };
    }).filter((hotel) => hotel.code && hotel.propertySiteURL_en),
  };
}

function withPageIndex(url, pageIndex) {
  if (pageIndex === 1) return url;
  const nextUrl = new URL(url);
  nextUrl.searchParams.set("pageIndex", String(pageIndex));
  return nextUrl.toString();
}

function codeFromUrl(url) {
  return cleanText(url).match(/\/hotel\/([A-Z0-9]+)\//i)?.[1] ?? "";
}

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function cleanText(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
