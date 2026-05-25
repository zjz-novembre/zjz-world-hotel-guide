import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hotelSourceDir } from "./paths.mjs";

const outputDir = hotelSourceDir;
const hotelListPath = join(outputDir, "ihg-hilton-greater-china-official-hotels.json");
const ratePath = join(outputDir, "ihg-hilton-greater-china-official-lead-rates.json");
const outputJsonPath = join(outputDir, "ihg-hilton-greater-china-hotels-with-average-rate.json");
const outputCsvPath = join(outputDir, "ihg-hilton-greater-china-hotels-with-average-rate.csv");
const outputSummaryPath = join(outputDir, "ihg-hilton-greater-china-hotels-with-average-rate-summary.md");

const generatedAt = new Date().toISOString();

const csvColumns = [
  "chain",
  "spiritCode",
  "name_en",
  "brand_en",
  "regionCode",
  "countryCode",
  "city_en",
  "address1_en",
  "latitude",
  "longitude",
  "propertySiteURL_en",
  "rateDataAvailable",
  "approxAnnualAverageRateLocal",
  "approxAnnualAverageRateCurrency",
  "approxAnnualAverageRateBasis",
  "approxAnnualAverageRateSampleCount",
  "currentOfficialLeadRateLocal",
  "currentOfficialLeadRateFmt",
  "currentOfficialLeadRatePlanCode",
  "currentOfficialLeadRatePlanName",
  "rateDataCaveat",
];

const hotelPayload = JSON.parse(readFileSync(hotelListPath, "utf8"));
const ratePayload = JSON.parse(readFileSync(ratePath, "utf8"));
const rateBySpiritCode = new Map((ratePayload.rates ?? []).map((row) => [row.spiritCode, row]));

const hotels = (hotelPayload.hotels ?? []).map((hotel) => {
  const rate = rateBySpiritCode.get(hotel.spiritCode);
  const rateAvailable = Boolean(rate?.rate_available && Number.isFinite(rate.rate_amount_local));
  const average = rateAvailable ? rate.rate_amount_local : null;
  return {
    ...hotel,
    rateDataAvailable: rateAvailable,
    approxAnnualAverageRateLocal: average,
    approxAnnualAverageRateCurrency: rate?.rate_currency ?? null,
    approxAnnualAverageRateBasis: rateAvailable
      ? "single official current lead-rate proxy; not a true 12-month sampled annual average"
      : "not_available_from_current_official_public_source",
    approxAnnualAverageRateSampleCount: rateAvailable ? 1 : 0,
    currentOfficialLeadRateLocal: rateAvailable ? rate.rate_amount_local : null,
    currentOfficialLeadRateFmt: rate?.rate_amount_fmt ?? null,
    currentOfficialLeadRatePlanCode: rate?.rate_plan_code ?? null,
    currentOfficialLeadRatePlanName: rate?.rate_plan_name ?? null,
    currentOfficialLeadRatePlanDesc: rate?.rate_plan_desc ?? null,
    currentOfficialLeadRateFetchedAt: rate?.fetched_at ?? null,
    rateDataSource: rate?.rate_source ?? null,
    rateDataCaveat: rate?.caveat ?? null,
  };
});

const metadata = buildMetadata(hotels);
const payload = {
  metadata,
  source_files: [hotelListPath, ratePath],
  hotels,
};

writeFileSync(outputJsonPath, `${JSON.stringify(payload, null, 2)}\n`);
writeFileSync(outputCsvPath, toCsv(hotels));
writeFileSync(outputSummaryPath, toSummary(metadata));

console.log(`Wrote ${hotels.length} hotels with per-hotel average-rate fields`);
console.log(outputJsonPath);
console.log(outputCsvPath);
console.log(outputSummaryPath);

function buildMetadata(items) {
  const available = items.filter((hotel) => hotel.rateDataAvailable);
  return {
    generated_at: generatedAt,
    scope: "ihg_hilton_greater_china_hotels_with_per_hotel_average_rate_fields",
    record_count: items.length,
    rate_available_count: available.length,
    rate_unavailable_count: items.length - available.length,
    chain_counts: countBy(items, "chain"),
    rate_available_counts_by_chain: countBy(available, "chain"),
    rate_unavailable_counts_by_chain: countBy(
      items.filter((hotel) => !hotel.rateDataAvailable),
      "chain",
    ),
    averages_by_currency: summarizeBy(available, "approxAnnualAverageRateCurrency"),
    averages_by_region: summarizeBy(available, "regionCode"),
    note:
      "The per-hotel field is present on every hotel. Hilton rows use the official displayed lead rate as a one-sample proxy. IHG rows are null because current public official pages did not expose numeric amounts.",
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
    grouped.get(group).push(item.approxAnnualAverageRateLocal);
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

function toCsv(items) {
  const rows = [csvColumns, ...items.map((item) => csvColumns.map((column) => csvValue(item[column])))];
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

  return `# IHG and Hilton Hotels with Per-Hotel Average Rate Fields

- Generated at: ${metadata.generated_at}
- Records: ${metadata.record_count}
- Per-hotel average-rate field present on every row: approxAnnualAverageRateLocal
- Rate available rows: ${metadata.rate_available_count}
- Rate unavailable rows: ${metadata.rate_unavailable_count}
- Important caveat: Hilton values are one-sample current official lead-rate proxies, not true 12-month sampled annual averages.
- IHG caveat: IHG official public destination/detail pages exposed hotel records, priceRange labels, and Check Rates links, but no numeric amount fields.

## Availability by Chain

| Chain | Available | Unavailable |
| --- | ---: | ---: |
| Hilton | ${metadata.rate_available_counts_by_chain.Hilton ?? 0} | ${metadata.rate_unavailable_counts_by_chain.Hilton ?? 0} |
| IHG Hotels & Resorts | ${metadata.rate_available_counts_by_chain["IHG Hotels & Resorts"] ?? 0} | ${metadata.rate_unavailable_counts_by_chain["IHG Hotels & Resorts"] ?? 0} |

## Available Rate Stats by Currency

| Currency | Count | Average | Median | Min | Max |
| --- | ---: | ---: | ---: | ---: | ---: |
${currencyRows}

## Available Rate Stats by Region

| Region | Count | Average | Median | Min | Max |
| --- | ---: | ---: | ---: | ---: | ---: |
${regionRows}
`;
}
