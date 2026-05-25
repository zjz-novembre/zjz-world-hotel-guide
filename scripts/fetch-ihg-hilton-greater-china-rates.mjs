import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hotelSourceDir } from "./paths.mjs";

const outputDir = hotelSourceDir;
const hotelListPath = join(outputDir, "ihg-hilton-greater-china-official-hotels.json");
const outputJsonPath = join(outputDir, "ihg-hilton-greater-china-official-lead-rates.json");
const outputCsvPath = join(outputDir, "ihg-hilton-greater-china-official-lead-rates.csv");
const outputSummaryPath = join(outputDir, "ihg-hilton-greater-china-official-lead-rates-summary.md");

const fetchedAt = new Date().toISOString();
const userAgent = "michelin-list-personal-research/0.1 (+low-frequency official lead-rate collection)";
const hiltonExtractUrl = "https://www.hilton.com/en/cp/hse/hotel-summary-extract.json";

const countryCurrency = {
  CN: "CNY",
  HK: "HKD",
  MO: "MOP",
  TW: "TWD",
};

const csvColumns = [
  "chain",
  "spiritCode",
  "hotelCode",
  "name_en",
  "brand_en",
  "regionCode",
  "countryCode",
  "city_en",
  "rate_available",
  "rate_source",
  "rate_currency",
  "rate_amount_local",
  "rate_amount_fmt",
  "rate_amount_source_value",
  "rate_plan_code",
  "rate_plan_name",
  "rate_plan_desc",
  "points_rate",
  "propertySiteURL_en",
];

async function main() {
  const hotelPayload = JSON.parse(readFileSync(hotelListPath, "utf8"));
  const hotels = hotelPayload.hotels ?? [];
  const hiltonExtract = await fetchJson(hiltonExtractUrl);
  const hiltonByCode = new Map(Object.values(hiltonExtract).map((hotel) => [hotel.ctyhocn, hotel]));

  const rates = hotels.map((hotel) => {
    if (hotel.chain === "Hilton") {
      const code = hotel.spiritCode.replace(/^HILTON-/, "");
      return buildHiltonRateRow(hotel, hiltonByCode.get(code));
    }
    return buildUnavailableRateRow(
      hotel,
      "ihg_destination_pages_no_amount",
      "IHG public destination pages expose Check Rates links, but no concrete amount in the page JSON-LD/list source.",
    );
  });

  const metadata = buildMetadata(rates);
  const payload = {
    metadata,
    official_sites: [hiltonExtractUrl, ...hotelPayload.official_sites.filter((url) => /ihg\.com/.test(url))],
    rates,
  };

  writeFileSync(outputJsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  writeFileSync(outputCsvPath, toCsv(rates));
  writeFileSync(outputSummaryPath, toSummary(metadata));

  console.log(`Wrote ${rates.length} lead-rate rows`);
  console.log(outputJsonPath);
  console.log(outputCsvPath);
  console.log(outputSummaryPath);
}

function buildHiltonRateRow(hotel, extractHotel) {
  if (!extractHotel?.leadRate?.lowest) {
    return buildUnavailableRateRow(hotel, "hilton_extract_no_lowest_rate", "Hilton extract row has no leadRate.lowest object.");
  }

  const lowest = extractHotel.leadRate.lowest;
  const amountLocal = parseFormattedAmount(lowest.rateAmountFmt);
  const pointsRate = extractHotel.leadRate.hhonors?.lead?.dailyRmPointsRate ?? null;

  return {
    chain: hotel.chain,
    spiritCode: hotel.spiritCode,
    hotelCode: extractHotel.ctyhocn,
    name_en: hotel.name_en,
    brand_en: hotel.brand_en,
    regionCode: hotel.regionCode,
    countryCode: hotel.countryCode,
    city_en: hotel.city_en,
    rate_available: amountLocal !== null || lowest.rateAmount != null,
    rate_source: "hilton_official_hotel_summary_extract_leadRate.lowest",
    rate_currency: countryCurrency[hotel.countryCode] ?? extractHotel.localization?.currencyCode ?? null,
    rate_amount_local: amountLocal,
    rate_amount_fmt: lowest.rateAmountFmt ?? null,
    rate_amount_source_value: numericOrNull(lowest.rateAmount),
    rate_plan_code: lowest.ratePlanCode ?? null,
    rate_plan_name: lowest.ratePlan?.ratePlanName ?? null,
    rate_plan_desc: lowest.ratePlan?.ratePlanDesc ?? null,
    points_rate: numericOrNull(pointsRate),
    points_rate_fmt: extractHotel.leadRate.hhonors?.lead?.dailyRmPointsRateNumFmt ?? null,
    propertySiteURL_en: hotel.propertySiteURL_en,
    fetched_at: fetchedAt,
    caveat:
      "Hilton extract does not expose the stay dates in this row; averages use the displayed local-currency rateAmountFmt, not the raw rateAmount value.",
  };
}

function buildUnavailableRateRow(hotel, rateSource, caveat) {
  return {
    chain: hotel.chain,
    spiritCode: hotel.spiritCode,
    hotelCode: hotel.spiritCode.replace(/^[^-]+-/, ""),
    name_en: hotel.name_en,
    brand_en: hotel.brand_en,
    regionCode: hotel.regionCode,
    countryCode: hotel.countryCode,
    city_en: hotel.city_en,
    rate_available: false,
    rate_source: rateSource,
    rate_currency: countryCurrency[hotel.countryCode] ?? null,
    rate_amount_local: null,
    rate_amount_fmt: null,
    rate_amount_source_value: null,
    rate_plan_code: null,
    rate_plan_name: null,
    rate_plan_desc: null,
    points_rate: null,
    points_rate_fmt: null,
    propertySiteURL_en: hotel.propertySiteURL_en,
    fetched_at: fetchedAt,
    caveat,
  };
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

function parseFormattedAmount(value) {
  if (!value) return null;
  const numeric = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function numericOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function buildMetadata(rates) {
  const available = rates.filter((rate) => rate.rate_available && Number.isFinite(rate.rate_amount_local));
  return {
    generated_at: fetchedAt,
    scope: "greater_china_ihg_hilton_official_lead_rates",
    source_note:
      "Hilton lead rates come from the official hotel-summary extract. IHG public destination pages do not expose concrete amount fields; IHG rows are retained with rate_available=false.",
    row_count: rates.length,
    available_rate_count: available.length,
    unavailable_rate_count: rates.length - available.length,
    chain_counts: countBy(rates, "chain"),
    available_rate_counts_by_chain: countBy(available, "chain"),
    available_rate_counts_by_region: countBy(available, "regionCode"),
    averages_by_currency: summarizeBy(available, "rate_currency"),
    averages_by_region: summarizeBy(available, "regionCode"),
    averages_by_brand_top: Object.fromEntries(
      Object.entries(summarizeBy(available, "brand_en"))
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 30),
    ),
  };
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] ?? "null";
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function summarizeBy(items, key) {
  const grouped = new Map();
  for (const item of items) {
    const group = item[key] ?? "null";
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group).push(item.rate_amount_local);
  }
  return Object.fromEntries(
    Array.from(grouped.entries()).map(([group, values]) => {
      const sorted = values.slice().sort((a, b) => a - b);
      const sum = values.reduce((acc, value) => acc + value, 0);
      return [
        group,
        {
          count: values.length,
          average: round(sum / values.length),
          median: round(sorted[Math.floor(sorted.length / 2)]),
          min: round(sorted[0]),
          max: round(sorted.at(-1)),
        },
      ];
    }),
  );
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function toCsv(rates) {
  const rows = [csvColumns, ...rates.map((rate) => csvColumns.map((column) => csvValue(rate[column])))];
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
  const currencyRows = Object.entries(metadata.averages_by_currency)
    .map(([currency, stats]) => `| ${currency} | ${stats.count} | ${stats.average} | ${stats.median} | ${stats.min} | ${stats.max} |`)
    .join("\n");
  const regionRows = Object.entries(metadata.averages_by_region)
    .map(([region, stats]) => `| ${region} | ${stats.count} | ${stats.average} | ${stats.median} | ${stats.min} | ${stats.max} |`)
    .join("\n");
  const brandRows = Object.entries(metadata.averages_by_brand_top)
    .map(([brand, stats]) => `| ${brand} | ${stats.count} | ${stats.average} | ${stats.median} | ${stats.min} | ${stats.max} |`)
    .join("\n");

  return `# IHG and Hilton Greater China Official Lead Rates

- Generated at: ${metadata.generated_at}
- Rows: ${metadata.row_count}
- Available amount rows: ${metadata.available_rate_count}
- Unavailable amount rows: ${metadata.unavailable_rate_count}
- Hilton: official hotel-summary extract leadRate.lowest
- IHG: public destination pages currently expose links, not concrete amount fields
- Average basis: parsed local-currency amount from Hilton rateAmountFmt
- Date caveat: Hilton extract does not expose stay dates in each lead-rate row

## Average by Currency

| Currency | Count | Average | Median | Min | Max |
| --- | ---: | ---: | ---: | ---: | ---: |
${currencyRows}

## Average by Region

| Region | Count | Average | Median | Min | Max |
| --- | ---: | ---: | ---: | ---: | ---: |
${regionRows}

## Top Brand Averages

| Brand | Count | Average | Median | Min | Max |
| --- | ---: | ---: | ---: | ---: | ---: |
${brandRows}
`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
