import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "node:process";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { hotelBrowserDir, hotelDatabaseDir, hotelSourceDir } from "./paths.mjs";

const outputDir = hotelSourceDir;
const databaseDir = hotelDatabaseDir;
const outputJsonPath = join(outputDir, "hotel-official-rate-window-snapshots.json");
const outputCsvPath = join(outputDir, "hotel-official-rate-window-snapshots.csv");
const outputSummaryPath = join(outputDir, "hotel-official-rate-window-snapshots-summary.md");
const sqlitePath = join(databaseDir, "hotel-rate-snapshots.sqlite");

const fetchedAt = new Date().toISOString();
const userAgent = "michelin-list-personal-research/0.2 (+low-frequency official hotel rate windows)";
const windowNights = positiveInteger(env.RATE_WINDOW_NIGHTS, 7);
const rateDelayMs = positiveInteger(env.RATE_DELAY_MS, 150);
const rateTimeoutMs = positiveInteger(env.RATE_TIMEOUT_MS, 20_000);
const rateLimit = env.RATE_LIMIT ? positiveInteger(env.RATE_LIMIT, 0) : Infinity;
const startDate = env.RATE_START_DATE || tomorrowIsoDate();
const endDate = addDaysIso(startDate, windowNights - 1);
const requestedChainSlugs = parseRequestedChains(env.RATE_CHAINS);
const requestedSpiritCodes = parseRequestedSpiritCodes(env.RATE_SPIRIT_CODES ?? env.RATE_HOTEL_CODES);
const browserHeadless = env.RATE_BROWSER_HEADLESS === "1";
const browserChannel = env.RATE_BROWSER_CHANNEL || "chrome";
const browserSlowMoMs = positiveInteger(env.RATE_BROWSER_SLOW_MO_MS, 0);
const browserLaunchMode = env.RATE_BROWSER_LAUNCH_MODE || "cdp";
const chromeExecutablePath = env.RATE_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const lhwFindRoomsTimeoutMs = positiveInteger(env.LHW_FINDROOMS_TIMEOUT_MS, Math.min(Math.max(rateTimeoutMs, 20_000), 45_000));
const estimatedServiceChargeRate = numberOrNull(env.HOTEL_SERVICE_CHARGE_RATE) ?? 0.1;
const estimatedVatRate = numberOrNull(env.HOTEL_VAT_RATE) ?? 0.06;
const useStandardTaxEstimate = env.HOTEL_USE_OFFICIAL_TAX_TOTAL !== "1";

const hiltonExtractUrl = "https://www.hilton.com/en/cp/hse/hotel-summary-extract.json";
const ihgCalendarUrl = "https://apis.ihg.com.cn/availability/v1/calendar";
const ihgCalendarApiKey = "pQM1YazQwnWi5AWXmoRoA5FSfW0S9x8A";
const marriottHqvUrl = "https://www.marriott.com/mi/query/phoenixShopHQVRateOnly";
const marriottHqvSignature = "68cdff5617743016fd5ceb21249c23ebee159d0d66b1e226b9b0b4269f2ab7a8";
const marriottHqvQuery = `query phoenixShopHQVRateOnly($search: SearchLowestAvailableRatesByPropertyIdsInput!) {
  search {
    lowestAvailableRates {
      searchByPropertyIds(search: $search) {
        edges {
          node {
            rates {
              rateModes {
                ... on SearchLowestAvailableRatesRateModesCash {
                  lowestAverageRate {
                    amount { amount currency decimalPoint }
                    mandatoryFees { amount currency decimalPoint }
                    fees { amount currency decimalPoint }
                    amountPlusMandatoryFees { amount currency decimalPoint }
                    totalAmount { amount currency decimalPoint }
                  }
                }
              }
              rateCategory { code description value }
              sourceOfRate
              status { code description }
            }
            property { basicInformation { name } id }
          }
        }
      }
    }
  }
}`;

const sourceFiles = [
  "marriott-china-hong-kong-macau-taiwan-official-hotels.json",
  "hyatt-mainland-china-official-hotels.json",
  "luxury-hotel-groups-greater-china-official-hotels.json",
  "ihg-hilton-greater-china-official-hotels.json",
];

const csvColumns = [
  "hotelKey",
  "chain",
  "spiritCode",
  "name_en",
  "brand_en",
  "regionCode",
  "countryCode",
  "city_en",
  "rateWindowStartDate",
  "rateWindowEndDate",
  "rateWindowNights",
  "officialDynamicRateAvailable",
  "officialDynamicAverageRateLocal",
  "officialDynamicAverageCurrency",
  "officialDynamicAverageBasis",
  "officialDynamicAverageSampleCount",
  "taxInclusiveAverageRateLocal",
  "preTaxAverageRateLocal",
  "taxAndFeeAverageAmountLocal",
  "taxAndFeeAverageRate",
  "taxBreakdownAvailable",
  "taxInclusiveRateKind",
  "taxEstimateUsed",
  "taxEstimateBasis",
  "tax1Name",
  "tax1Rate",
  "tax1AmountLocal",
  "tax2Name",
  "tax2Rate",
  "tax2AmountLocal",
  "windowAverageRateLocal",
  "windowPreTaxAverageRateLocal",
  "windowMinRateLocal",
  "windowMaxRateLocal",
  "weekdayAverageRateLocal",
  "weekendAverageRateLocal",
  "weekdayPreTaxAverageRateLocal",
  "weekendPreTaxAverageRateLocal",
  "weekdaySampleCount",
  "weekendSampleCount",
  "currentOfficialLeadRateLocal",
  "currentOfficialLeadRateFmt",
  "rateStatus",
  "rateSource",
  "rateCaveat",
  "fetchedAt",
  "propertySiteURL_en",
];

async function main() {
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(databaseDir, { recursive: true });
  mkdirSync(hotelBrowserDir, { recursive: true });

  const hotels = loadHotels();
  const hiltonExtract = hotels.some((hotel) => shouldFetchHotel(hotel) && chainSlug(hotel.chain) === "hilton")
    ? await fetchHiltonExtract()
    : new Map();
  const previousRows = loadPreviousRows();
  const rows = [];
  const toolEvents = [];
  const browserFetchers = {};
  const attemptedByChain = {
    ihg: 0,
    marriott: 0,
    hyatt: 0,
    lhw: 0,
  };

  try {
    for (const hotel of hotels) {
      if (!shouldFetchHotel(hotel)) {
        rows.push(previousRows.get(hotelKey(hotel)) ?? buildSkippedRateRow(hotel, "skipped_by_rate_filter"));
        continue;
      }

      const slug = chainSlug(hotel.chain);
      if (slug === "ihg") {
        if (attemptedByChain.ihg >= rateLimit) {
          rows.push(buildSkippedRateRow(hotel, "ihg_calendar_skipped_by_rate_limit"));
          continue;
        }
        rows.push(await buildIhgWindowRateRow(hotel));
        attemptedByChain.ihg += 1;
        if (attemptedByChain.ihg % 50 === 0) console.log(`IHG calendar rows fetched: ${attemptedByChain.ihg}`);
        if (rateDelayMs > 0) await delay(rateDelayMs);
        continue;
      }

      if (slug === "hilton") {
        rows.push(buildHiltonCurrentLeadRateRow(hotel, hiltonExtract));
        continue;
      }

      if (slug === "marriott") {
        if (attemptedByChain.marriott >= rateLimit) {
          rows.push(buildSkippedRateRow(hotel, "marriott_hqv_skipped_by_rate_limit"));
          continue;
        }
        rows.push(await buildMarriottWindowRateRow(hotel, await getBrowserFetcher(browserFetchers, "marriott")));
        attemptedByChain.marriott += 1;
        if (attemptedByChain.marriott % 25 === 0) console.log(`Marriott HQV rows fetched: ${attemptedByChain.marriott}`);
        if (rateDelayMs > 0) await delay(rateDelayMs);
        continue;
      }

      if (slug === "hyatt") {
        if (attemptedByChain.hyatt >= rateLimit) {
          rows.push(buildSkippedRateRow(hotel, "hyatt_roomrates_skipped_by_rate_limit"));
          continue;
        }
        rows.push(await buildHyattWindowRateRow(hotel, await getBrowserFetcher(browserFetchers, "hyatt")));
        attemptedByChain.hyatt += 1;
        if (attemptedByChain.hyatt % 25 === 0) console.log(`Hyatt roomrates rows fetched: ${attemptedByChain.hyatt}`);
        if (rateDelayMs > 0) await delay(rateDelayMs);
        continue;
      }

      if (slug === "lhw") {
        if (attemptedByChain.lhw >= rateLimit) {
          rows.push(buildSkippedRateRow(hotel, "lhw_findrooms_skipped_by_rate_limit"));
          continue;
        }
        rows.push(await buildLhwWindowRateRow(hotel, await getBrowserFetcher(browserFetchers, "lhw")));
        attemptedByChain.lhw += 1;
        if (attemptedByChain.lhw % 5 === 0) console.log(`LHW findRooms rows fetched: ${attemptedByChain.lhw}`);
        if (rateDelayMs > 0) await delay(rateDelayMs);
        continue;
      }

      rows.push(buildUnsupportedRateRow(hotel));
    }
  } finally {
    await closeBrowserFetchers(browserFetchers);
  }

  const metadata = buildMetadata(rows, hotels, attemptedByChain);
  const payload = {
    metadata,
    source_files: sourceFiles.map((file) => join(outputDir, file)),
    official_rate_sources: [
      hiltonExtractUrl,
      ihgCalendarUrl,
      marriottHqvUrl,
      "https://www.hyatt.com/en-US/shop/service/rooms/roomrates/{spiritCode}",
      "https://www.lhw.com/api/availability/findRooms",
    ],
    rates: rows,
  };

  writeFileSync(outputJsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  writeFileSync(outputCsvPath, toCsv(rows));
  writeFileSync(outputSummaryPath, toSummary(metadata));
  writeSqlite(rows, metadata);

  toolEvents.push({ type: "write", path: outputJsonPath, rows: rows.length });
  toolEvents.push({ type: "write", path: outputCsvPath, rows: rows.length });
  toolEvents.push({ type: "write", path: outputSummaryPath, rows: rows.length });
  toolEvents.push({ type: "write", path: sqlitePath, rows: rows.length });

  console.log(`Wrote ${rows.length} hotel rate snapshot rows`);
  console.log(`IHG calendar API rows attempted: ${attemptedByChain.ihg}`);
  console.log(`Marriott HQV rows attempted: ${attemptedByChain.marriott}`);
  console.log(`Hyatt roomrates rows attempted: ${attemptedByChain.hyatt}`);
  console.log(`LHW findRooms rows attempted: ${attemptedByChain.lhw}`);
  console.log(outputJsonPath);
  console.log(outputCsvPath);
  console.log(outputSummaryPath);
  console.log(sqlitePath);
}

function loadHotels() {
  const records = [];
  for (const file of sourceFiles) {
    const path = join(outputDir, file);
    if (!existsSync(path)) throw new Error(`Missing source file: ${path}`);
    const payload = JSON.parse(readFileSync(path, "utf8"));
    const hotels = Array.isArray(payload) ? payload : payload.hotels;
    if (!Array.isArray(hotels)) throw new Error(`No hotel array in ${path}`);
    for (const hotel of hotels) records.push({ ...hotel, sourceFile: file });
  }

  const seen = new Set();
  const deduped = [];
  for (const hotel of records) {
    const key = hotelKey(hotel);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(hotel);
  }
  return deduped.sort(compareHotels);
}

function loadPreviousRows() {
  if (!existsSync(outputJsonPath)) return new Map();
  try {
    const payload = JSON.parse(readFileSync(outputJsonPath, "utf8"));
    const rows = Array.isArray(payload?.rates) ? payload.rates : [];
    return new Map(rows.map((row) => [row.hotelKey, row]));
  } catch {
    return new Map();
  }
}

async function fetchHiltonExtract() {
  const payload = await fetchJson(hiltonExtractUrl);
  return new Map(Object.values(payload).map((hotel) => [hotel.ctyhocn, hotel]));
}

async function buildIhgWindowRateRow(hotel) {
  const hotelCode = hotel.spiritCode.replace(/^IHG-/, "").toUpperCase();
  const request = {
    hotelMnemonics: [hotelCode],
    startDate,
    endDate,
    lengthOfStay: 1,
    options: {
      identifyLowestOfferPerRatePlan: true,
      returnAmountsAfterTaxForLowestOffer: true,
      lowestOfferPerRatePlan: true,
      returnAverages: true,
    },
  };

  try {
    const payload = await postIhgCalendar(request);
    return buildIhgCalendarRow(hotel, hotelCode, payload);
  } catch (error) {
    return {
      ...baseRateRow(hotel),
      officialDynamicRateAvailable: false,
      officialDynamicAverageRateLocal: null,
      officialDynamicAverageCurrency: currencyForHotel(hotel),
      officialDynamicAverageBasis: "not_available",
      officialDynamicAverageSampleCount: 0,
      rateStatus: "ihg_calendar_fetch_failed",
      rateSource: "ihg_official_availability_calendar_api",
      rateCaveat: error.message,
      rawRateSummary: {
        request,
        error: error.message,
      },
    };
  }
}

function buildIhgCalendarRow(hotel, hotelCode, payload) {
  const responseHotel = payload.data?.hotels?.[0];
  const warnings = (payload.warnings ?? []).map((warning) => ({
    id: warning.id ?? null,
    code: warning.code ?? null,
    message: warning.message ?? null,
  }));
  const entries = (responseHotel?.calendar ?? [])
    .map((entry) => {
      const referencedOffer = selectReferencedLowestOffer(entry);
      const preTaxAmount = numberOrNull(
        entry.lowestRate?.averageDailyAmount ??
          entry.lowestRate?.totalAmount ??
          referencedOffer?.averageDailyAmount ??
          referencedOffer?.totalAmount ??
          referencedOffer?.checkinAmount,
      );
      const taxInclusiveAmount = numberOrNull(
        referencedOffer?.averageDailyAmountAfterFeeTax ??
          referencedOffer?.totalAmountAfterFeeTax ??
          referencedOffer?.checkInAmountAfterFeeTax,
      );
      const taxAndFeeAmount =
        Number.isFinite(preTaxAmount) && Number.isFinite(taxInclusiveAmount)
          ? round(taxInclusiveAmount - preTaxAmount)
          : null;
      return {
        date: entry.start ?? null,
        preTaxAmount,
        taxInclusiveAmount,
        taxAndFeeAmount,
        taxAndFeeRate:
          Number.isFinite(preTaxAmount) && preTaxAmount > 0 && Number.isFinite(taxAndFeeAmount)
            ? round(taxAndFeeAmount / preTaxAmount)
            : null,
        currency: entry.lowestRate?.currency ?? responseHotel?.hotel?.propertyCurrency ?? currencyForHotel(hotel),
        refIds: entry.lowestRate?.refIds ?? [],
        offerCount: Array.isArray(entry.offers) ? entry.offers.length : 0,
        referencedOfferId: referencedOffer?.id ?? null,
        referencedRatePlanCode: referencedOffer?.ratePlanCode ?? null,
      };
    })
    .filter((entry) => entry.date && (Number.isFinite(entry.taxInclusiveAmount) || Number.isFinite(entry.preTaxAmount)));

  const stats = summarizeRateEntries(entries);
  if (!stats.count) {
    return {
      ...baseRateRow(hotel),
      officialDynamicRateAvailable: false,
      officialDynamicAverageRateLocal: null,
      officialDynamicAverageCurrency: responseHotel?.hotel?.propertyCurrency ?? currencyForHotel(hotel),
      officialDynamicAverageBasis: "not_available",
      officialDynamicAverageSampleCount: 0,
      preTaxAverageRateLocal: stats.preTaxAverage,
      taxAndFeeAverageAmountLocal: stats.taxAndFeeAverageAmount,
      taxAndFeeAverageRate: stats.taxAndFeeAverageRate,
      rateStatus: warnings.length ? "ihg_calendar_no_product" : "ihg_calendar_no_tax_inclusive_lowest_rate",
      rateSource: "ihg_official_availability_calendar_api",
      rateCaveat:
        warnings.map((warning) => warning.message).filter(Boolean).join("; ") ||
        "No numeric tax-inclusive lowest-rate calendar entries in official response.",
      rawRateSummary: {
        request: { hotelMnemonics: [hotelCode], startDate, endDate, lengthOfStay: 1 },
        hotel: responseHotel?.hotel ?? null,
        calendarLowestRates: entries,
        warnings,
      },
    };
  }

  return {
    ...baseRateRow(hotel),
    officialDynamicRateAvailable: true,
    officialDynamicAverageRateLocal: stats.taxInclusiveAverage,
    officialDynamicAverageCurrency: stats.currency,
    officialDynamicAverageBasis: "7-night official IHG availability calendar tax-inclusive lowest-rate average; one-night stays; adults=1; rooms=1; public rate not constrained by explicit rate code",
    officialDynamicAverageSampleCount: stats.taxInclusiveCount,
    taxInclusiveAverageRateLocal: stats.taxInclusiveAverage,
    preTaxAverageRateLocal: stats.preTaxAverage,
    taxAndFeeAverageAmountLocal: stats.taxAndFeeAverageAmount,
    taxAndFeeAverageRate: stats.taxAndFeeAverageRate,
    taxBreakdownAvailable: false,
    taxInclusiveRateKind: "official_tax_inclusive",
    taxEstimateUsed: false,
    taxEstimateBasis: null,
    windowAverageRateLocal: stats.taxInclusiveAverage,
    windowPreTaxAverageRateLocal: stats.preTaxAverage,
    windowMinRateLocal: stats.taxInclusiveMin,
    windowMaxRateLocal: stats.taxInclusiveMax,
    weekdayAverageRateLocal: stats.weekdayTaxInclusiveAverage,
    weekendAverageRateLocal: stats.weekendTaxInclusiveAverage,
    weekdayPreTaxAverageRateLocal: stats.weekdayPreTaxAverage,
    weekendPreTaxAverageRateLocal: stats.weekendPreTaxAverage,
    weekdaySampleCount: stats.weekdayCount,
    weekendSampleCount: stats.weekendCount,
    rateStatus: stats.taxInclusiveCount === windowNights ? "available_full_window" : "available_partial_window",
    rateSource: "ihg_official_availability_calendar_api",
    rateCaveat:
      "Final averages use IHG offer averageDailyAmountAfterFeeTax/totalAmountAfterFeeTax when exposed for the referenced lowest-rate offer. Calendar response exposes aggregate tax/fee amount, not individual tax names/rates.",
    rawRateSummary: {
      request: { hotelMnemonics: [hotelCode], startDate, endDate, lengthOfStay: 1 },
      hotel: responseHotel?.hotel ?? null,
      responseLowestRate: payload.data?.lowestRate ?? null,
      ratePlanCodes: (responseHotel?.ratePlans ?? []).map((plan) => plan.code).filter(Boolean),
      calendarLowestRates: entries,
      warnings,
    },
  };
}

async function buildMarriottWindowRateRow(hotel, fetcher) {
  const hotelCode = String(hotel.spiritCode ?? "").toUpperCase();
  const entries = [];
  for (const date of windowStartDates()) {
    try {
      const payload = await fetcher.fetchLowestRate(hotel, date, addDaysIso(date, 1));
      entries.push(buildMarriottRateEntry(hotel, date, payload));
    } catch (error) {
      entries.push({
        date,
        error: error.message,
        preTaxAmount: null,
        taxInclusiveAmount: null,
        taxAndFeeAmount: null,
        taxAndFeeRate: null,
        currency: currencyForHotel(hotel),
      });
    }
    if (rateDelayMs > 0) await delay(rateDelayMs);
  }

  const numericEntries = entries.filter((entry) => Number.isFinite(entry.taxInclusiveAmount) || Number.isFinite(entry.preTaxAmount));
  const stats = summarizeRateEntries(numericEntries);
  const taxStats = summarizeTaxLines(numericEntries);
  if (!stats.taxInclusiveCount) {
    return {
      ...baseRateRow(hotel),
      officialDynamicRateAvailable: false,
      officialDynamicAverageRateLocal: null,
      officialDynamicAverageCurrency: stats.currency ?? currencyForHotel(hotel),
      officialDynamicAverageBasis: "not_available",
      officialDynamicAverageSampleCount: 0,
      preTaxAverageRateLocal: stats.preTaxAverage,
      rateStatus: entries.some((entry) => entry.error) ? "marriott_hqv_fetch_failed_or_blocked" : "marriott_hqv_no_available_rate",
      rateSource: "marriott_official_hqv_graphql",
      rateCaveat:
        entries
          .map((entry) => entry.error || entry.statusDescription || entry.statusCode)
          .filter(Boolean)
          .slice(0, 5)
          .join("; ") || "Official Marriott HQV response did not expose a numeric tax-inclusive cash rate for this window.",
      rawRateSummary: {
        hotelCode,
        startDate,
        endDate,
        nightlyRates: entries,
      },
    };
  }

  return {
    ...baseRateRow(hotel),
    officialDynamicRateAvailable: true,
    officialDynamicAverageRateLocal: stats.taxInclusiveAverage,
    officialDynamicAverageCurrency: stats.currency,
    officialDynamicAverageBasis: useStandardTaxEstimate
      ? "7-night official Marriott HQV pre-tax amount average with standardized 10% service charge plus 6% VAT estimate; one-night stays; adults=1; rooms=1; StandardRates cash rates when exposed"
      : "7-night official Marriott HQV totalAmount average; one-night stays; adults=1; rooms=1; StandardRates cash rates when exposed",
    officialDynamicAverageSampleCount: stats.taxInclusiveCount,
    taxInclusiveAverageRateLocal: stats.taxInclusiveAverage,
    preTaxAverageRateLocal: stats.preTaxAverage,
    taxAndFeeAverageAmountLocal: stats.taxAndFeeAverageAmount,
    taxAndFeeAverageRate: stats.taxAndFeeAverageRate,
    taxBreakdownAvailable: taxStats.hasTaxLines,
    taxInclusiveRateKind: useStandardTaxEstimate ? "estimated_from_official_pretax" : "official_tax_inclusive",
    taxEstimateUsed: useStandardTaxEstimate,
    taxEstimateBasis: useStandardTaxEstimate ? standardTaxEstimateBasis() : null,
    tax1Name: taxStats.tax1Name,
    tax1Rate: taxStats.tax1Rate,
    tax1AmountLocal: taxStats.tax1Amount,
    tax2Name: taxStats.tax2Name,
    tax2Rate: taxStats.tax2Rate,
    tax2AmountLocal: taxStats.tax2Amount,
    windowAverageRateLocal: stats.taxInclusiveAverage,
    windowPreTaxAverageRateLocal: stats.preTaxAverage,
    windowMinRateLocal: stats.taxInclusiveMin,
    windowMaxRateLocal: stats.taxInclusiveMax,
    weekdayAverageRateLocal: stats.weekdayTaxInclusiveAverage,
    weekendAverageRateLocal: stats.weekendTaxInclusiveAverage,
    weekdayPreTaxAverageRateLocal: stats.weekdayPreTaxAverage,
    weekendPreTaxAverageRateLocal: stats.weekendPreTaxAverage,
    weekdaySampleCount: stats.weekdayCount,
    weekendSampleCount: stats.weekendCount,
    rateStatus: stats.taxInclusiveCount === windowNights ? "available_full_window" : "available_partial_window",
    rateSource: "marriott_official_hqv_graphql",
    rateCaveat: useStandardTaxEstimate
      ? "Marriott HQV exposes official pre-tax amount; final/tax-inclusive fields are standardized estimates using 10% service charge plus 6% VAT."
      : "Marriott HQV exposes amount, fees, mandatoryFees, and totalAmount. This row uses official totalAmount as the tax-inclusive value; individual tax names/rates are not exposed in this response.",
    rawRateSummary: {
      hotelCode,
      startDate,
      endDate,
      nightlyRates: entries,
    },
  };
}

function buildMarriottRateEntry(hotel, date, payload) {
  const hotelCode = String(hotel.spiritCode ?? "").toUpperCase();
  const edges = payload?.data?.search?.lowestAvailableRates?.searchByPropertyIds?.edges ?? [];
  const node =
    edges.map((edge) => edge?.node).find((candidate) => String(candidate?.property?.id ?? "").toUpperCase() === hotelCode) ??
    edges[0]?.node;
  const candidates = (node?.rates ?? [])
    .map((rate) => {
      const cash = rate?.rateModes?.lowestAverageRate;
      const preTaxAmount = moneyFromMarriottAmount(cash?.amount);
      const officialTotalAmount = moneyFromMarriottAmount(cash?.totalAmount);
      const amountPlusMandatoryFees = moneyFromMarriottAmount(cash?.amountPlusMandatoryFees);
      const fees = moneyFromMarriottAmount(cash?.fees);
      const mandatoryFees = moneyFromMarriottAmount(cash?.mandatoryFees);
      const estimate = estimateTaxesFromPreTax(preTaxAmount);
      const taxInclusiveAmount = useStandardTaxEstimate
        ? estimate.taxInclusiveAmount
        : officialTotalAmount ?? amountPlusMandatoryFees;
      const taxAndFeeAmount = useStandardTaxEstimate
        ? estimate.taxAndFeeAmount
        : Number.isFinite(preTaxAmount) && Number.isFinite(taxInclusiveAmount)
          ? round(taxInclusiveAmount - preTaxAmount)
          : Number.isFinite(fees) || Number.isFinite(mandatoryFees)
            ? round((fees ?? 0) + (mandatoryFees ?? 0))
            : null;
      return {
        rate,
        preTaxAmount,
        taxInclusiveAmount,
        taxAndFeeAmount,
        taxAndFeeRate:
          Number.isFinite(preTaxAmount) && preTaxAmount > 0 && Number.isFinite(taxAndFeeAmount)
            ? round(taxAndFeeAmount / preTaxAmount)
            : null,
        currency: cash?.totalAmount?.currency ?? cash?.amount?.currency ?? currencyForHotel(hotel),
        statusCode: rate?.status?.code ?? null,
        statusDescription: rate?.status?.description ?? null,
        rateCategoryCode: rate?.rateCategory?.code ?? null,
        sourceOfRate: rate?.sourceOfRate ?? null,
        fees,
        mandatoryFees,
        officialTotalAmount,
        taxInclusiveRateKind: useStandardTaxEstimate ? "estimated_from_official_pretax" : "official_tax_inclusive",
        taxEstimateUsed: useStandardTaxEstimate,
        tax1Name: useStandardTaxEstimate ? estimate.taxes[0]?.name ?? null : null,
        tax1Rate: useStandardTaxEstimate ? estimate.taxes[0]?.rate ?? null : null,
        tax1Amount: useStandardTaxEstimate ? estimate.taxes[0]?.amount ?? null : null,
        tax2Name: useStandardTaxEstimate ? estimate.taxes[1]?.name ?? null : null,
        tax2Rate: useStandardTaxEstimate ? estimate.taxes[1]?.rate ?? null : null,
        tax2Amount: useStandardTaxEstimate ? estimate.taxes[1]?.amount ?? null : null,
      };
    })
    .filter((candidate) => Number.isFinite(candidate.taxInclusiveAmount) || Number.isFinite(candidate.preTaxAmount));

  candidates.sort((a, b) => {
    const aAvailable = a.statusCode === "AvailableForSale" ? 0 : 1;
    const bAvailable = b.statusCode === "AvailableForSale" ? 0 : 1;
    const aStandard = a.rateCategoryCode === "StandardRates" ? 0 : 1;
    const bStandard = b.rateCategoryCode === "StandardRates" ? 0 : 1;
    return (
      aAvailable - bAvailable ||
      aStandard - bStandard ||
      (a.taxInclusiveAmount ?? Number.POSITIVE_INFINITY) - (b.taxInclusiveAmount ?? Number.POSITIVE_INFINITY)
    );
  });

  const selected = candidates[0];
  if (!selected) {
    const statuses = (node?.rates ?? []).map((rate) => rate?.status?.description ?? rate?.status?.code).filter(Boolean);
    return {
      date,
      preTaxAmount: null,
      taxInclusiveAmount: null,
      taxAndFeeAmount: null,
      taxAndFeeRate: null,
      currency: currencyForHotel(hotel),
      statusCode: statuses[0] ?? null,
      statusDescription: statuses.join("; ") || null,
      rateCategoryCode: null,
      sourceOfRate: null,
      propertyName: node?.property?.basicInformation?.name ?? null,
    };
  }

  return {
    date,
    preTaxAmount: selected.preTaxAmount,
    taxInclusiveAmount: selected.taxInclusiveAmount,
    taxAndFeeAmount: selected.taxAndFeeAmount,
    taxAndFeeRate: selected.taxAndFeeRate,
    currency: selected.currency,
    statusCode: selected.statusCode,
    statusDescription: selected.statusDescription,
    rateCategoryCode: selected.rateCategoryCode,
    sourceOfRate: selected.sourceOfRate,
    fees: selected.fees,
    mandatoryFees: selected.mandatoryFees,
    officialTotalAmount: selected.officialTotalAmount,
    taxInclusiveRateKind: selected.taxInclusiveRateKind,
    taxEstimateUsed: selected.taxEstimateUsed,
    tax1Name: selected.tax1Name,
    tax1Rate: selected.tax1Rate,
    tax1Amount: selected.tax1Amount,
    tax2Name: selected.tax2Name,
    tax2Rate: selected.tax2Rate,
    tax2Amount: selected.tax2Amount,
    propertyName: node?.property?.basicInformation?.name ?? null,
  };
}

async function buildHyattWindowRateRow(hotel, fetcher) {
  const hotelCode = String(hotel.spiritCode ?? "").toLowerCase();
  const entries = [];
  for (const date of windowStartDates()) {
    try {
      const payload = await fetcher.fetchRoomRates(hotel, date, addDaysIso(date, 1));
      entries.push(buildHyattRateEntry(hotel, date, payload));
    } catch (error) {
      entries.push({
        date,
        error: error.message,
        preTaxAmount: null,
        taxInclusiveAmount: null,
        taxAndFeeAmount: null,
        taxAndFeeRate: null,
        currency: currencyForHotel(hotel),
      });
    }
    if (rateDelayMs > 0) await delay(rateDelayMs);
  }

  const numericEntries = entries.filter((entry) => Number.isFinite(entry.taxInclusiveAmount) || Number.isFinite(entry.preTaxAmount));
  const stats = summarizeRateEntries(numericEntries);
  const taxStats = summarizeTaxLines(numericEntries);
  const estimateUsed = numericEntries.some((entry) => entry.taxEstimateUsed);
  const officialTaxInclusiveCount = numericEntries.filter((entry) => entry.taxInclusiveRateKind === "official_tax_inclusive").length;
  if (!stats.taxInclusiveCount) {
    return {
      ...baseRateRow(hotel),
      officialDynamicRateAvailable: false,
      officialDynamicAverageRateLocal: null,
      officialDynamicAverageCurrency: stats.currency ?? currencyForHotel(hotel),
      officialDynamicAverageBasis: "not_available",
      officialDynamicAverageSampleCount: 0,
      preTaxAverageRateLocal: stats.preTaxAverage,
      rateStatus: entries.some((entry) => entry.error) ? "hyatt_roomrates_fetch_failed_or_blocked" : "hyatt_roomrates_no_available_public_rate",
      rateSource: "hyatt_official_roomrates_api",
      rateCaveat:
        entries
          .map((entry) => entry.error || entry.ratePlanName || entry.ratePlanCode)
          .filter(Boolean)
          .slice(0, 5)
          .join("; ") || "Official Hyatt roomrates response did not expose a numeric public cash rate for this window.",
      rawRateSummary: {
        hotelCode,
        startDate,
        endDate,
        nightlyRates: entries,
      },
    };
  }

  return {
    ...baseRateRow(hotel),
    officialDynamicRateAvailable: true,
    officialDynamicAverageRateLocal: stats.taxInclusiveAverage,
    officialDynamicAverageCurrency: stats.currency,
    officialDynamicAverageBasis:
      estimateUsed
        ? "7-night Hyatt official public Standard-rate pre-tax average with standardized 10% service charge plus 6% VAT estimate; one-night stays; adults=1; rooms=1"
        : "7-night official Hyatt public Standard-rate after-tax average; one-night stays; adults=1; rooms=1",
    officialDynamicAverageSampleCount: stats.taxInclusiveCount,
    taxInclusiveAverageRateLocal: stats.taxInclusiveAverage,
    preTaxAverageRateLocal: stats.preTaxAverage,
    taxAndFeeAverageAmountLocal: stats.taxAndFeeAverageAmount,
    taxAndFeeAverageRate: stats.taxAndFeeAverageRate,
    taxBreakdownAvailable: taxStats.hasTaxLines,
    taxInclusiveRateKind:
      estimateUsed && officialTaxInclusiveCount !== numericEntries.length ? "estimated_from_official_pretax" : "official_tax_inclusive",
    taxEstimateUsed: estimateUsed,
    taxEstimateBasis: estimateUsed ? standardTaxEstimateBasis() : null,
    tax1Name: taxStats.tax1Name,
    tax1Rate: taxStats.tax1Rate,
    tax1AmountLocal: taxStats.tax1Amount,
    tax2Name: taxStats.tax2Name,
    tax2Rate: taxStats.tax2Rate,
    tax2AmountLocal: taxStats.tax2Amount,
    windowAverageRateLocal: stats.taxInclusiveAverage,
    windowPreTaxAverageRateLocal: stats.preTaxAverage,
    windowMinRateLocal: stats.taxInclusiveMin,
    windowMaxRateLocal: stats.taxInclusiveMax,
    weekdayAverageRateLocal: stats.weekdayTaxInclusiveAverage,
    weekendAverageRateLocal: stats.weekendTaxInclusiveAverage,
    weekdayPreTaxAverageRateLocal: stats.weekdayPreTaxAverage,
    weekendPreTaxAverageRateLocal: stats.weekendPreTaxAverage,
    weekdaySampleCount: stats.weekdayCount,
    weekendSampleCount: stats.weekendCount,
    rateStatus: stats.taxInclusiveCount === windowNights ? "available_full_window" : "available_partial_window",
    rateSource: "hyatt_official_roomrates_api",
    rateCaveat:
      estimateUsed
        ? "Hyatt roomrates exposed official pre-tax public Standard rates; final/tax-inclusive fields are standardized estimates using 10% service charge plus 6% VAT."
        : "Hyatt roomrates response exposed the selected public Standard-rate after-tax total and tax lines where available.",
    rawRateSummary: {
      hotelCode,
      startDate,
      endDate,
      nightlyRates: entries,
    },
  };
}

function buildHyattRateEntry(hotel, date, payload) {
  const selected = selectHyattPublicRate(payload);
  if (!selected) {
    return {
      date,
      preTaxAmount: null,
      taxInclusiveAmount: null,
      taxAndFeeAmount: null,
      taxAndFeeRate: null,
      currency: currencyForHotel(hotel),
    };
  }

  let preTaxAmount = selected.preTaxAmount;
  let taxInclusiveAmount = selected.taxInclusiveAmount;
  let taxAndFeeAmount = selected.taxAndFeeAmount;
  let taxAndFeeRate = selected.taxAndFeeRate;
  let taxEstimateUsed = false;
  let taxInclusiveRateKind = selected.taxInclusiveRateKind;
  let taxes = selected.taxes;

  if (useStandardTaxEstimate && Number.isFinite(preTaxAmount)) {
    const estimate = estimateTaxesFromPreTax(preTaxAmount);
    taxInclusiveAmount = estimate.taxInclusiveAmount;
    taxAndFeeAmount = estimate.taxAndFeeAmount;
    taxAndFeeRate = estimate.taxAndFeeRate;
    taxEstimateUsed = true;
    taxInclusiveRateKind = "estimated_from_official_pretax";
    taxes = estimate.taxes;
  } else if (!Number.isFinite(taxInclusiveAmount) && Number.isFinite(preTaxAmount)) {
    const estimate = estimateTaxesFromPreTax(preTaxAmount);
    taxInclusiveAmount = estimate.taxInclusiveAmount;
    taxAndFeeAmount = estimate.taxAndFeeAmount;
    taxAndFeeRate = estimate.taxAndFeeRate;
    taxEstimateUsed = true;
    taxInclusiveRateKind = "estimated_from_official_pretax";
    taxes = estimate.taxes;
  }

  return {
    date,
    preTaxAmount,
    taxInclusiveAmount,
    taxAndFeeAmount,
    taxAndFeeRate,
    currency: selected.currency ?? currencyForHotel(hotel),
    taxInclusiveRateKind,
    taxEstimateUsed,
    roomTypeCode: selected.roomTypeCode,
    roomTitle: selected.roomTitle,
    ratePlanCode: selected.ratePlanCode,
    ratePlanName: selected.ratePlanName,
    ratePlanCategory: selected.ratePlanCategory,
    tax1Name: taxes[0]?.name ?? null,
    tax1Rate: taxes[0]?.rate ?? null,
    tax1Amount: taxes[0]?.amount ?? null,
    tax2Name: taxes[1]?.name ?? null,
    tax2Rate: taxes[1]?.rate ?? null,
    tax2Amount: taxes[1]?.amount ?? null,
  };
}

function selectHyattPublicRate(payload) {
  const rooms = Object.values(payload?.roomRates ?? {});
  const candidates = [];
  for (const room of rooms) {
    const plans = Array.isArray(room?.ratePlans) ? room.ratePlans : [];
    const publicPlanCode = room?.lowestPublicRatePlanCode ?? null;
    const preferredPlans = plans.filter((plan) => plan?.id === publicPlanCode || plan?.id === "RACK");
    const publicPlans = preferredPlans.length
      ? preferredPlans
      : plans.filter((plan) => !String(plan?.name ?? "").toLowerCase().includes("member"));

    for (const plan of publicPlans) {
      const preTaxAmount = numberOrNull(plan?.totalBeforeTax ?? plan?.rate ?? room?.lowestPublicRate);
      const taxInclusiveAmount = numberOrNull(plan?.totalAfterTax ?? plan?.rateAfterTax);
      const taxes = normalizeHyattTaxes(plan?.taxes);
      const taxAndFeeAmount = Number.isFinite(taxInclusiveAmount) && Number.isFinite(preTaxAmount)
        ? round(taxInclusiveAmount - preTaxAmount)
        : taxes.length
          ? round(taxes.reduce((sum, tax) => sum + (tax.amount ?? 0), 0))
          : null;
      candidates.push({
        preTaxAmount,
        taxInclusiveAmount,
        taxAndFeeAmount,
        taxAndFeeRate:
          Number.isFinite(preTaxAmount) && preTaxAmount > 0 && Number.isFinite(taxAndFeeAmount)
            ? round(taxAndFeeAmount / preTaxAmount)
            : null,
        currency: plan?.currencyCode ?? room?.currencyCode ?? null,
        taxes,
        taxInclusiveRateKind: Number.isFinite(taxInclusiveAmount) ? "official_tax_inclusive" : null,
        roomTypeCode: room?.roomTypeCode ?? room?.roomType?.code ?? null,
        roomTitle: room?.roomType?.title ?? null,
        ratePlanCode: plan?.id ?? null,
        ratePlanName: plan?.name ?? null,
        ratePlanCategory: plan?.ratePlanCategory ?? null,
        publicRank: plan?.id === publicPlanCode || plan?.id === "RACK" ? 0 : 1,
      });
    }

    if (!publicPlans.length && Number.isFinite(numberOrNull(room?.lowestPublicRate))) {
      candidates.push({
        preTaxAmount: numberOrNull(room.lowestPublicRate),
        taxInclusiveAmount: numberOrNull(room.totalAfterTax ?? room.rateAfterTax),
        taxAndFeeAmount: null,
        taxAndFeeRate: null,
        currency: room.currencyCode ?? null,
        taxes: [],
        taxInclusiveRateKind: Number.isFinite(numberOrNull(room.totalAfterTax ?? room.rateAfterTax))
          ? "official_tax_inclusive"
          : null,
        roomTypeCode: room.roomTypeCode ?? room.roomType?.code ?? null,
        roomTitle: room.roomType?.title ?? null,
        ratePlanCode: room.lowestPublicRatePlanCode ?? null,
        ratePlanName: "Public Rate",
        ratePlanCategory: "CASH",
        publicRank: 0,
      });
    }
  }

  return candidates
    .filter((candidate) => Number.isFinite(candidate.taxInclusiveAmount) || Number.isFinite(candidate.preTaxAmount))
    .sort(
      (a, b) =>
        a.publicRank - b.publicRank ||
        (a.taxInclusiveAmount ?? estimateTaxesFromPreTax(a.preTaxAmount).taxInclusiveAmount ?? Number.POSITIVE_INFINITY) -
          (b.taxInclusiveAmount ?? estimateTaxesFromPreTax(b.preTaxAmount).taxInclusiveAmount ?? Number.POSITIVE_INFINITY),
    )[0];
}

async function buildLhwWindowRateRow(hotel, fetcher) {
  const entries = [];
  const errors = [];
  for (let night = 0; night < windowNights; night += 1) {
    const checkinDate = addDaysIso(startDate, night);
    const checkoutDate = addDaysIso(checkinDate, 1);
    try {
      const payload = await fetcher.fetchRooms(hotel, checkinDate, checkoutDate);
      entries.push(buildLhwRateEntry(hotel, checkinDate, payload));
    } catch (error) {
      entries.push({
        date: checkinDate,
        preTaxAmount: null,
        taxInclusiveAmount: null,
        taxAndFeeAmount: null,
        taxAndFeeRate: null,
        currency: currencyForHotel(hotel),
        error: error.message,
      });
      errors.push({ date: checkinDate, error: error.message });
      if (isFatalLhwHotelError(error)) break;
    }
    if (rateDelayMs > 0) await delay(rateDelayMs);
  }

  const numericEntries = entries.filter((entry) => Number.isFinite(entry.taxInclusiveAmount) || Number.isFinite(entry.preTaxAmount));
  if (!numericEntries.length) {
    return {
      ...baseRateRow(hotel),
      officialDynamicRateAvailable: false,
      officialDynamicAverageRateLocal: null,
      officialDynamicAverageCurrency: currencyForHotel(hotel),
      officialDynamicAverageBasis: "not_available",
      officialDynamicAverageSampleCount: 0,
      rateStatus: errors.length ? "lhw_findrooms_fetch_failed" : "lhw_findrooms_no_numeric_rate",
      rateSource: "lhw_official_findrooms_api",
      rateCaveat: errors[0]?.error ?? "LHW official findRooms response did not expose a numeric public room rate in the requested window.",
      rawRateSummary: {
        startDate,
        endDate,
        errors,
        nightlyRates: entries,
      },
    };
  }

  const stats = summarizeRateEntries(numericEntries);
  const taxStats = summarizeTaxLines(numericEntries);
  return {
    ...baseRateRow(hotel),
    officialDynamicRateAvailable: true,
    officialDynamicAverageRateLocal: stats.taxInclusiveAverage,
    officialDynamicAverageCurrency: stats.currency ?? currencyForHotel(hotel),
    officialDynamicAverageBasis: "official_tax_inclusive",
    officialDynamicAverageSampleCount: stats.taxInclusiveCount,
    taxInclusiveAverageRateLocal: stats.taxInclusiveAverage,
    preTaxAverageRateLocal: stats.preTaxAverage,
    taxAndFeeAverageAmountLocal: stats.taxAndFeeAverageAmount,
    taxAndFeeAverageRate: stats.taxAndFeeAverageRate,
    taxBreakdownAvailable: taxStats.hasTaxLines,
    taxInclusiveRateKind: "official_tax_inclusive",
    taxEstimateUsed: false,
    taxEstimateBasis: null,
    tax1Name: taxStats.tax1Name,
    tax1Rate: taxStats.tax1Rate,
    tax1AmountLocal: taxStats.tax1Amount,
    tax2Name: taxStats.tax2Name,
    tax2Rate: taxStats.tax2Rate,
    tax2AmountLocal: taxStats.tax2Amount,
    windowAverageRateLocal: stats.taxInclusiveAverage,
    windowPreTaxAverageRateLocal: stats.preTaxAverage,
    windowMinRateLocal: stats.taxInclusiveMin,
    windowMaxRateLocal: stats.taxInclusiveMax,
    weekdayAverageRateLocal: stats.weekdayTaxInclusiveAverage,
    weekendAverageRateLocal: stats.weekendTaxInclusiveAverage,
    weekdayPreTaxAverageRateLocal: stats.weekdayPreTaxAverage,
    weekendPreTaxAverageRateLocal: stats.weekendPreTaxAverage,
    weekdaySampleCount: stats.weekdayCount,
    weekendSampleCount: stats.weekendCount,
    currentOfficialLeadRateLocal: numericEntries[0]?.taxInclusiveAmount ?? null,
    currentOfficialLeadRateFmt: numericEntries[0]?.taxInclusiveAmount ? `${stats.currency ?? currencyForHotel(hotel)} ${numericEntries[0].taxInclusiveAmount}` : null,
    rateStatus: stats.taxInclusiveCount === windowNights ? "available_full_window" : "available_partial_window",
    rateSource: "lhw_official_findrooms_api",
    rateCaveat:
      "LHW official findRooms response exposes native hotel-currency pre-tax rate, tax/fee lines, and tax-inclusive room total. Dynamic averages use one-night stays across the requested 7-day window.",
    rawRateSummary: {
      startDate,
      endDate,
      errors,
      nightlyRates: entries,
    },
  };
}

function buildLhwRateEntry(hotel, date, payload) {
  const selected = selectLhwPublicRate(payload);
  if (!selected) {
    return {
      date,
      preTaxAmount: null,
      taxInclusiveAmount: null,
      taxAndFeeAmount: null,
      taxAndFeeRate: null,
      currency: payload?.data?.hotelCurrency ?? currencyForHotel(hotel),
    };
  }

  return {
    date,
    preTaxAmount: selected.preTaxAmount,
    taxInclusiveAmount: selected.taxInclusiveAmount,
    taxAndFeeAmount: selected.taxAndFeeAmount,
    taxAndFeeRate: selected.taxAndFeeRate,
    currency: selected.currency ?? payload?.data?.hotelCurrency ?? currencyForHotel(hotel),
    taxInclusiveRateKind: "official_tax_inclusive",
    taxEstimateUsed: false,
    roomTypeCode: selected.roomTypeCode,
    roomTitle: selected.roomTitle,
    ratePlanCode: selected.ratePlanCode,
    ratePlanName: selected.ratePlanName,
    tax1Name: selected.taxes[0]?.name ?? null,
    tax1Rate: selected.taxes[0]?.rate ?? null,
    tax1Amount: selected.taxes[0]?.amount ?? null,
    tax2Name: selected.taxes[1]?.name ?? null,
    tax2Rate: selected.taxes[1]?.rate ?? null,
    tax2Amount: selected.taxes[1]?.amount ?? null,
  };
}

function selectLhwPublicRate(payload) {
  const rooms = Array.isArray(payload?.data?.rooms) ? payload.data.rooms : [];
  const candidates = [];
  for (const room of rooms) {
    for (const rate of room.roomRates ?? []) {
      const preTaxAmount = numberOrNull(rate.rateTotalValNative ?? parseFormattedAmount(rate.rateTotalNative));
      const taxInclusiveAmount = numberOrNull(rate.roomTotalValNative ?? parseFormattedAmount(rate.roomTotalNative));
      const taxAndFeeAmount = numberOrNull(
        rate.roomTotalFeeValNative ??
          parseFormattedAmount(rate.roomTotalFeeNative) ??
          (Number.isFinite(taxInclusiveAmount) && Number.isFinite(preTaxAmount) ? taxInclusiveAmount - preTaxAmount : null),
      );
      const taxes = normalizeLhwTaxes(rate.taxes, preTaxAmount);
      candidates.push({
        preTaxAmount,
        taxInclusiveAmount,
        taxAndFeeAmount,
        taxAndFeeRate:
          Number.isFinite(preTaxAmount) && preTaxAmount > 0 && Number.isFinite(taxAndFeeAmount)
            ? round(taxAndFeeAmount / preTaxAmount)
            : null,
        currency: payload?.data?.hotelCurrency ?? null,
        roomTypeCode: room.roomCode ?? null,
        roomTitle: room.name ?? null,
        ratePlanCode: rate.roomRateCode ?? null,
        ratePlanName: rate.name ?? null,
        taxes,
      });
    }
  }

  return candidates
    .filter((candidate) => Number.isFinite(candidate.taxInclusiveAmount) || Number.isFinite(candidate.preTaxAmount))
    .sort(
      (a, b) =>
        (a.taxInclusiveAmount ?? Number.POSITIVE_INFINITY) - (b.taxInclusiveAmount ?? Number.POSITIVE_INFINITY) ||
        (a.preTaxAmount ?? Number.POSITIVE_INFINITY) - (b.preTaxAmount ?? Number.POSITIVE_INFINITY),
    )[0];
}

function normalizeLhwTaxes(taxes, preTaxAmount) {
  return (Array.isArray(taxes) ? taxes : [])
    .map((tax) => {
      const amount = numberOrNull(tax.amountValNative ?? parseFormattedAmount(tax.amountNative) ?? tax.amountVal ?? parseFormattedAmount(tax.amount));
      return {
        name: tax.description ?? tax.typeName ?? tax.code ?? null,
        amount,
        rate: Number.isFinite(preTaxAmount) && preTaxAmount > 0 && Number.isFinite(amount) ? round(amount / preTaxAmount) : null,
      };
    })
    .filter((tax) => tax.name || Number.isFinite(tax.amount));
}

function isFatalLhwHotelError(error) {
  return /LHW hotel page mismatch|LHW hotel page redirected|Missing LHW propertySiteURL/i.test(String(error?.message ?? error ?? ""));
}

function buildHiltonCurrentLeadRateRow(hotel, hiltonExtract) {
  const code = hotel.spiritCode.replace(/^HILTON-/, "");
  const extractHotel = hiltonExtract.get(code);
  const lowest = extractHotel?.leadRate?.lowest;
  const amount = numberOrNull(parseFormattedAmount(lowest?.rateAmountFmt) ?? lowest?.rateAmount);
  const currency = currencyForHotel(hotel) ?? extractHotel?.localization?.currencyCode ?? null;

  if (!amount) {
    return {
      ...baseRateRow(hotel),
      officialDynamicRateAvailable: false,
      officialDynamicAverageRateLocal: null,
      officialDynamicAverageCurrency: currency,
      officialDynamicAverageBasis: "not_available",
      officialDynamicAverageSampleCount: 0,
      rateStatus: "hilton_extract_no_numeric_lead_rate",
      rateSource: "hilton_official_hotel_summary_extract",
      rateCaveat: "Hilton official extract row has no numeric leadRate.lowest amount.",
      rawRateSummary: {
        hotelCode: code,
        hasExtractHotel: Boolean(extractHotel),
      },
    };
  }

  return {
    ...baseRateRow(hotel),
    officialDynamicRateAvailable: false,
    officialDynamicAverageRateLocal: null,
    officialDynamicAverageCurrency: currency,
    officialDynamicAverageBasis: "not_available_tax_inclusive",
    officialDynamicAverageSampleCount: 0,
    preTaxAverageRateLocal: amount,
    currentOfficialLeadRateLocal: amount,
    currentOfficialLeadRateFmt: lowest?.rateAmountFmt ?? null,
    rateStatus: "available_current_lead_rate_tax_unknown",
    rateSource: "hilton_official_hotel_summary_extract_leadRate.lowest",
    rateCaveat:
      "This is a daily official current lead-rate snapshot, but the extract does not expose stay dates or tax-inclusive final price. It is retained as preTaxAverageRateLocal/currentOfficialLeadRateLocal and excluded from the final tax-inclusive average.",
    rawRateSummary: {
      hotelCode: code,
      leadRateLowest: lowest
        ? {
            rateAmountFmt: lowest.rateAmountFmt ?? null,
            rateAmount: numberOrNull(lowest.rateAmount),
            ratePlanCode: lowest.ratePlanCode ?? null,
            ratePlanName: lowest.ratePlan?.ratePlanName ?? null,
          }
        : null,
    },
  };
}

function buildUnsupportedRateRow(hotel) {
  const chain = String(hotel.chain ?? "");
  const statusByChain = {
    Marriott: {
      status: "adapter_pending_marriott_booking_flow",
      caveat:
        "Marriott official hotel list is present, but a date-specific official rate adapter has not been confirmed in this script. Direct machine fetches of Marriott pages can return Access Denied.",
    },
    "IHG Hotels & Resorts": {
      status: "ihg_calendar_skipped_by_rate_limit",
      caveat:
        "IHG has a confirmed official availability-calendar adapter, but this row was not fetched because RATE_LIMIT was set for a partial run.",
    },
    hyatt: {
      status: "adapter_pending_hyatt_booking_flow",
      caveat:
        "Hyatt official hotel list is present, but a date-specific official rate adapter has not been confirmed in this script. Direct machine fetches of Hyatt pages can return KPSDK/429 protection.",
    },
  };
  const configured = statusByChain[chain] ?? {
    status: "adapter_pending_luxury_group_booking_flow",
    caveat:
      "This luxury-group hotel list is present, but a date-specific official rate adapter has not been implemented yet. It remains in the snapshot output so coverage gaps are explicit.",
  };

  return {
    ...baseRateRow(hotel),
    officialDynamicRateAvailable: false,
    officialDynamicAverageRateLocal: null,
    officialDynamicAverageCurrency: currencyForHotel(hotel),
    officialDynamicAverageBasis: "not_available",
    officialDynamicAverageSampleCount: 0,
    rateStatus: configured.status,
    rateSource: null,
    rateCaveat: configured.caveat,
    rawRateSummary: null,
  };
}

function buildSkippedRateRow(hotel, status) {
  const caveatByStatus = {
    skipped_by_rate_filter:
      "This row was not re-fetched in the current run because RATE_CHAINS or RATE_SPIRIT_CODES limited the official-rate refresh scope.",
    ihg_calendar_skipped_by_rate_limit:
      "IHG has a confirmed official availability-calendar adapter, but this row was not fetched because RATE_LIMIT was set for a partial run.",
    marriott_hqv_skipped_by_rate_limit:
      "Marriott has a confirmed official HQV adapter, but this row was not fetched because RATE_LIMIT was set for a partial run.",
    hyatt_roomrates_skipped_by_rate_limit:
      "Hyatt has a confirmed official roomrates adapter, but this row was not fetched because RATE_LIMIT was set for a partial run.",
    lhw_findrooms_skipped_by_rate_limit:
      "LHW has a confirmed official findRooms adapter, but this row was not fetched because RATE_LIMIT was set for a partial run.",
  };
  return {
    ...baseRateRow(hotel),
    officialDynamicRateAvailable: false,
    officialDynamicAverageRateLocal: null,
    officialDynamicAverageCurrency: currencyForHotel(hotel),
    officialDynamicAverageBasis: "not_available",
    officialDynamicAverageSampleCount: 0,
    rateStatus: status,
    rateSource: null,
    rateCaveat: caveatByStatus[status] ?? "This row was not re-fetched in the current run.",
    rawRateSummary: null,
  };
}

function baseRateRow(hotel) {
  return {
    hotelKey: hotelKey(hotel),
    chain: hotel.chain ?? null,
    sourceFile: hotel.sourceFile ?? null,
    spiritCode: hotel.spiritCode ?? null,
    name_en: hotel.name_en ?? null,
    name_zh: hotel.name_zh ?? null,
    brand_en: hotel.brand_en ?? null,
    brand_zh: hotel.brand_zh ?? null,
    regionCode: hotel.regionCode ?? null,
    countryCode: hotel.countryCode ?? null,
    city_en: hotel.city_en ?? null,
    city_zh: hotel.city_zh ?? null,
    latitude: hotel.latitude ?? null,
    longitude: hotel.longitude ?? null,
    propertySiteURL_en: hotel.propertySiteURL_en ?? null,
    propertySiteURL_zh: hotel.propertySiteURL_zh ?? null,
    rateWindowStartDate: startDate,
    rateWindowEndDate: endDate,
    rateWindowNights: windowNights,
    officialDynamicRateAvailable: false,
    officialDynamicAverageRateLocal: null,
    officialDynamicAverageCurrency: null,
    officialDynamicAverageBasis: null,
    officialDynamicAverageSampleCount: 0,
    taxInclusiveAverageRateLocal: null,
    preTaxAverageRateLocal: null,
    taxAndFeeAverageAmountLocal: null,
    taxAndFeeAverageRate: null,
    taxBreakdownAvailable: false,
    taxInclusiveRateKind: null,
    taxEstimateUsed: false,
    taxEstimateBasis: null,
    tax1Name: null,
    tax1Rate: null,
    tax1AmountLocal: null,
    tax2Name: null,
    tax2Rate: null,
    tax2AmountLocal: null,
    windowAverageRateLocal: null,
    windowPreTaxAverageRateLocal: null,
    windowMinRateLocal: null,
    windowMaxRateLocal: null,
    weekdayAverageRateLocal: null,
    weekendAverageRateLocal: null,
    weekdayPreTaxAverageRateLocal: null,
    weekendPreTaxAverageRateLocal: null,
    weekdaySampleCount: 0,
    weekendSampleCount: 0,
    currentOfficialLeadRateLocal: null,
    currentOfficialLeadRateFmt: null,
    rateStatus: "not_processed",
    rateSource: null,
    rateCaveat: null,
    fetchedAt,
  };
}

async function postIhgCalendar(body) {
  return fetchJson(ihgCalendarUrl, {
    method: "POST",
    headers: {
      accept: "application/json, text/plain, */*",
      "content-type": "application/json; charset=UTF-8",
      "ihg-language": "en-US",
      origin: "https://www.ihg.com",
      referer: "https://www.ihg.com/",
      "user-agent": userAgent,
      "x-ihg-api-key": ihgCalendarApiKey,
    },
    body: JSON.stringify(body),
  });
}

async function fetchJson(url, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(rateTimeoutMs),
        headers: {
          accept: "application/json,text/plain,*/*",
          "user-agent": userAgent,
          ...(options.headers ?? {}),
        },
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`Fetch failed ${response.status} ${response.statusText}: ${text.slice(0, 240)}`);
      }
      return JSON.parse(text);
    } catch (error) {
      lastError = error;
      if (attempt < 3) await delay(500 * attempt);
    }
  }
  throw lastError;
}

async function getBrowserFetcher(fetchers, slug) {
  if (!fetchers[slug]) {
    if (slug === "marriott") fetchers[slug] = await createMarriottBrowserFetcher();
    else if (slug === "hyatt") fetchers[slug] = await createHyattBrowserFetcher();
    else if (slug === "lhw") fetchers[slug] = await createLhwBrowserFetcher();
    else throw new Error(`Unsupported browser fetcher: ${slug}`);
  }
  return fetchers[slug];
}

async function closeBrowserFetchers(fetchers) {
  await Promise.all(
    Object.values(fetchers).map(async (fetcher) => {
      try {
        await fetcher.close();
      } catch {
        // Ignore browser shutdown errors after the useful scraping work is already captured.
      }
    }),
  );
}

async function createMarriottBrowserFetcher() {
  const browserSession = await launchRateBrowser("marriott-rates");
  const context = browserSession.context;
  const page = context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(rateTimeoutMs);
  let warmed = false;

  async function warm(hotel) {
    const code = String(hotel.spiritCode ?? "").toUpperCase();
    const url = marriottCalendarUrl(code, currencyForHotel(hotel) ?? "CNY");
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: rateTimeoutMs });
    await page.waitForTimeout(1_500);
    warmed = true;
  }

  async function fetchLowestRate(hotel, checkinDate, checkoutDate) {
    if (!warmed) await warm(hotel);
    const code = String(hotel.spiritCode ?? "").toUpperCase();
    const body = {
      operationName: "phoenixShopHQVRateOnly",
      variables: {
        search: {
          ids: [code],
          options: {
            startDate: checkinDate,
            endDate: checkoutDate,
            quantity: 1,
            numberInParty: 1,
            rateRequestTypes: [{ value: "", type: "STANDARD" }],
            includeMandatoryFees: true,
            childAges: [],
            includeUnavailableProperties: true,
          },
        },
      },
      query: marriottHqvQuery,
    };

    let response;
    try {
      response = await postMarriottHqvInPage(page, body);
    } catch {
      await page.waitForTimeout(2_000);
      response = await postMarriottHqvInPage(page, body);
    }
    if (response.status === 401 || response.status === 403 || response.status === 429) {
      warmed = false;
      await warm(hotel);
      response = await postMarriottHqvInPage(page, body);
    }
    if (!response.ok) {
      throw new Error(`Marriott HQV failed ${response.status}: ${response.text.slice(0, 240)}`);
    }
    return JSON.parse(response.text);
  }

  return {
    fetchLowestRate,
    close: () => browserSession.close(),
  };
}

async function postMarriottHqvInPage(page, body) {
  return page.evaluate(
    async ({ url, signature, body: requestBody, timeoutMs }) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          method: "POST",
          credentials: "include",
          signal: controller.signal,
          headers: {
            accept: "application/json",
            "accept-language": "en-US",
            "application-name": "shop",
            "apollographql-client-name": "phoenix_shop",
            "apollographql-client-version": "v1",
            "content-type": "application/json",
            "graphql-operation-name": "phoenixShopHQVRateOnly",
            "graphql-operation-signature": signature,
            "graphql-require-safelisting": "true",
            "x-request-id": `/search/availabilityCalendar.mi~X~${crypto.randomUUID()}`,
          },
          body: JSON.stringify(requestBody),
        });
        return { ok: response.ok, status: response.status, text: await response.text() };
      } finally {
        clearTimeout(timer);
      }
    },
    { url: marriottHqvUrl, signature: marriottHqvSignature, body, timeoutMs: rateTimeoutMs },
  );
}

async function createHyattBrowserFetcher() {
  const browserSession = await launchRateBrowser("hyatt-rates");
  const context = browserSession.context;
  const page = context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(Math.max(rateTimeoutMs, 45_000));
  let warmed = false;
  const quickbookFailedCodes = new Set();

  async function fetchRoomRates(hotel, checkinDate, checkoutDate) {
    const code = String(hotel.spiritCode ?? "").toLowerCase();
    let directFailure = null;
    if (warmed) {
      try {
        const directResponse = await fetchHyattRoomratesInPage(page, hotel, checkinDate, checkoutDate);
        if (directResponse.ok) return JSON.parse(directResponse.text);
        directFailure = `Hyatt roomrates direct fetch failed ${directResponse.status}: ${directResponse.text.slice(0, 160)}`;
      } catch {
        directFailure = "Hyatt roomrates direct fetch failed in the active browser session.";
      }
      throw new Error(directFailure);
    }
    if (quickbookFailedCodes.has(code)) {
      throw new Error(directFailure ?? "Hyatt quickbook already failed for this hotel in the current run.");
    }

    let responsePromise;
    let responseError;
    try {
      responsePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/shop/service/rooms/roomrates/${code}`) &&
          response.url().includes(`checkinDate=${checkinDate}`),
        { timeout: Math.max(rateTimeoutMs, 45_000) },
      ).catch((error) => {
        responseError = error;
        return null;
      });
      await page.goto(hyattQuickbookUrl(hotel, checkinDate, checkoutDate), {
        waitUntil: "domcontentloaded",
        timeout: Math.max(rateTimeoutMs, 45_000),
      });
      const bookNow = page.getByRole("button", { name: "Book Now" });
      await bookNow.waitFor({ state: "visible", timeout: Math.max(rateTimeoutMs, 45_000) });
      await bookNow.click({ timeout: Math.max(rateTimeoutMs, 45_000) });
      const response = await responsePromise;
      if (!response) throw responseError;
      const text = await response.text();
      if (!response.ok()) {
        throw new Error(`Hyatt roomrates failed ${response.status()}: ${text.slice(0, 240)}`);
      }
      warmed = true;
      return JSON.parse(text);
    } catch (error) {
      if (responsePromise) await responsePromise.catch(() => {});
      quickbookFailedCodes.add(code);
      throw error;
    }
  }

  return {
    fetchRoomRates,
    close: () => browserSession.close(),
  };
}

async function fetchHyattRoomratesInPage(page, hotel, checkinDate, checkoutDate) {
  return page.evaluate(
    async ({ url, timeoutMs }) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          credentials: "include",
          signal: controller.signal,
          headers: { accept: "application/json,text/plain,*/*" },
        });
        return { ok: response.ok, status: response.status, text: await response.text() };
      } finally {
        clearTimeout(timer);
      }
    },
    { url: hyattRoomratesApiUrl(hotel, checkinDate, checkoutDate), timeoutMs: Math.max(rateTimeoutMs, 45_000) },
  );
}

async function createLhwBrowserFetcher() {
  const browserSession = await launchRateBrowser("lhw-rates");
  const context = browserSession.context;
  const page = context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(Math.max(rateTimeoutMs, 45_000));

  async function fetchRooms(hotel, checkinDate, checkoutDate) {
    const sourceUrl = String(hotel.propertySiteURL_en ?? "").replace(/\/$/, "");
    if (!sourceUrl) throw new Error("Missing LHW propertySiteURL_en.");
    const url = `${sourceUrl}/select-room?indate=${toCompactDate(checkinDate)}&outdate=${toCompactDate(checkoutDate)}&rooms=1&numadult1=2&numchild1=0&editroom=1`;
    let responseError;
    const responsePromise = page
      .waitForResponse((response) => response.url().includes("/api/availability/findRooms"), {
        timeout: lhwFindRoomsTimeoutMs,
      })
      .catch((error) => {
        responseError = error;
        return null;
      });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: Math.max(rateTimeoutMs, 45_000) });
    const finalUrl = page.url();
    if (/\/find-a-hotel\/?(\?|#|$)/i.test(finalUrl)) {
      throw new Error(`LHW hotel page redirected to find-a-hotel: ${finalUrl}`);
    }
    const title = await page.title().catch(() => "");
    if (/Find a Luxury Hotel/i.test(title)) {
      throw new Error(`LHW hotel page mismatch: ${title}`);
    }

    const response = await responsePromise;
    if (!response) throw responseError ?? new Error("LHW findRooms response was not observed.");
    const text = await response.text();
    if (!response.ok()) {
      throw new Error(`LHW findRooms failed ${response.status()}: ${text.slice(0, 240)}`);
    }
    return JSON.parse(text);
  }

  return {
    fetchRooms,
    close: () => browserSession.close(),
  };
}

async function launchRateBrowser(profileName) {
  if (browserLaunchMode === "cdp") return launchCdpRateBrowser(profileName);

  const options = {
    headless: browserHeadless,
    viewport: { width: 1365, height: 900 },
    locale: "en-US",
    timeout: Math.max(rateTimeoutMs, 45_000),
    slowMo: browserSlowMoMs,
  };
  try {
    const context = await chromium.launchPersistentContext(join(hotelBrowserDir, profileName), {
      ...options,
      channel: browserChannel,
    });
    return { context, close: () => context.close() };
  } catch (error) {
    if (browserChannel === "chromium") throw error;
    const context = await chromium.launchPersistentContext(join(hotelBrowserDir, `${profileName}-chromium`), options);
    return { context, close: () => context.close() };
  }
}

async function launchCdpRateBrowser(profileName) {
  if (browserHeadless) {
    throw new Error("RATE_BROWSER_HEADLESS=1 is not compatible with RATE_BROWSER_LAUNCH_MODE=cdp for these official hotel flows.");
  }
  const port = env.RATE_CDP_PORT ? positiveInteger(env.RATE_CDP_PORT, 0) : await getAvailablePort();
  const profilePath = join(hotelBrowserDir, `${profileName}-cdp-${fetchedAt.replace(/[^0-9A-Za-z]/g, "-")}`);
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
            // The browser may have already exited after the CDP connection closed.
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

async function getAvailablePort() {
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

function selectReferencedLowestOffer(entry) {
  const offers = Array.isArray(entry.offers) ? entry.offers : [];
  if (!offers.length) return null;
  const refIds = new Set(entry.lowestRate?.refIds ?? []);
  const candidates = offers
    .filter((offer) => !refIds.size || refIds.has(offer.id))
    .map((offer) => ({
      offer,
      preTax: numberOrNull(offer.averageDailyAmount ?? offer.totalAmount ?? offer.checkinAmount),
      taxInclusive: numberOrNull(
        offer.averageDailyAmountAfterFeeTax ?? offer.totalAmountAfterFeeTax ?? offer.checkInAmountAfterFeeTax,
      ),
    }))
    .filter((candidate) => Number.isFinite(candidate.preTax) || Number.isFinite(candidate.taxInclusive));

  const pool = candidates.length
    ? candidates
    : offers
        .map((offer) => ({
          offer,
          preTax: numberOrNull(offer.averageDailyAmount ?? offer.totalAmount ?? offer.checkinAmount),
          taxInclusive: numberOrNull(
            offer.averageDailyAmountAfterFeeTax ?? offer.totalAmountAfterFeeTax ?? offer.checkInAmountAfterFeeTax,
          ),
        }))
        .filter((candidate) => Number.isFinite(candidate.preTax) || Number.isFinite(candidate.taxInclusive));

  pool.sort((a, b) => {
    const aFinal = Number.isFinite(a.taxInclusive) ? a.taxInclusive : Number.POSITIVE_INFINITY;
    const bFinal = Number.isFinite(b.taxInclusive) ? b.taxInclusive : Number.POSITIVE_INFINITY;
    return aFinal - bFinal || (a.preTax ?? Number.POSITIVE_INFINITY) - (b.preTax ?? Number.POSITIVE_INFINITY);
  });
  return pool[0]?.offer ?? null;
}

function summarizeRateEntries(entries) {
  const taxInclusiveValues = entries.map((entry) => entry.taxInclusiveAmount).filter(Number.isFinite);
  const preTaxValues = entries.map((entry) => entry.preTaxAmount).filter(Number.isFinite);
  const taxAndFeeValues = entries.map((entry) => entry.taxAndFeeAmount).filter(Number.isFinite);
  const weekdayTaxInclusiveValues = [];
  const weekendTaxInclusiveValues = [];
  const weekdayPreTaxValues = [];
  const weekendPreTaxValues = [];
  for (const entry of entries) {
    const weekend = isWeekendNight(entry.date);
    if (Number.isFinite(entry.taxInclusiveAmount)) {
      if (weekend) weekendTaxInclusiveValues.push(entry.taxInclusiveAmount);
      else weekdayTaxInclusiveValues.push(entry.taxInclusiveAmount);
    }
    if (Number.isFinite(entry.preTaxAmount)) {
      if (weekend) weekendPreTaxValues.push(entry.preTaxAmount);
      else weekdayPreTaxValues.push(entry.preTaxAmount);
    }
  }
  const preTaxAverage = average(preTaxValues);
  const taxAndFeeAverageAmount = average(taxAndFeeValues);
  return {
    count: taxInclusiveValues.length,
    taxInclusiveCount: taxInclusiveValues.length,
    preTaxCount: preTaxValues.length,
    currency: entries.find((entry) => entry.currency)?.currency ?? null,
    taxInclusiveAverage: average(taxInclusiveValues),
    preTaxAverage,
    taxAndFeeAverageAmount,
    taxAndFeeAverageRate:
      Number.isFinite(preTaxAverage) && preTaxAverage > 0 && Number.isFinite(taxAndFeeAverageAmount)
        ? round(taxAndFeeAverageAmount / preTaxAverage)
        : null,
    taxInclusiveMin: taxInclusiveValues.length ? round(Math.min(...taxInclusiveValues)) : null,
    taxInclusiveMax: taxInclusiveValues.length ? round(Math.max(...taxInclusiveValues)) : null,
    weekdayTaxInclusiveAverage: average(weekdayTaxInclusiveValues),
    weekendTaxInclusiveAverage: average(weekendTaxInclusiveValues),
    weekdayPreTaxAverage: average(weekdayPreTaxValues),
    weekendPreTaxAverage: average(weekendPreTaxValues),
    weekdayCount: weekdayTaxInclusiveValues.length,
    weekendCount: weekendTaxInclusiveValues.length,
  };
}

function buildMetadata(rows, hotels, attemptedByChain) {
  const available = rows.filter((row) => row.officialDynamicRateAvailable && Number.isFinite(row.officialDynamicAverageRateLocal));
  const ihgWindowAvailable = rows.filter((row) => row.rateSource === "ihg_official_availability_calendar_api" && row.officialDynamicRateAvailable);
  const ihgFullWindowAvailable = ihgWindowAvailable.filter((row) => row.rateStatus === "available_full_window");
  const ihgPartialWindowAvailable = ihgWindowAvailable.filter((row) => row.rateStatus === "available_partial_window");
  const hiltonLeadAvailable = rows.filter((row) => row.rateSource === "hilton_official_hotel_summary_extract_leadRate.lowest" && Number.isFinite(row.currentOfficialLeadRateLocal));
  const marriottWindowAvailable = rows.filter((row) => row.rateSource === "marriott_official_hqv_graphql" && row.officialDynamicRateAvailable);
  const hyattWindowAvailable = rows.filter((row) => row.rateSource === "hyatt_official_roomrates_api" && row.officialDynamicRateAvailable);
  const lhwWindowAvailable = rows.filter((row) => row.rateSource === "lhw_official_findrooms_api" && row.officialDynamicRateAvailable);
  const officialTaxInclusiveAvailable = available.filter((row) => row.taxInclusiveRateKind === "official_tax_inclusive" && !row.taxEstimateUsed);
  const estimatedTaxInclusiveAvailable = available.filter((row) => row.taxEstimateUsed);

  return {
    generated_at: fetchedAt,
    scope: "greater_china_official_hotel_rate_window_snapshots",
    rate_window_start_date: startDate,
    rate_window_end_date: endDate,
    rate_window_nights: windowNights,
    hotel_source_record_count: hotels.length,
    snapshot_row_count: rows.length,
    ihg_calendar_rows_attempted: attemptedByChain.ihg,
    marriott_hqv_rows_attempted: attemptedByChain.marriott,
    hyatt_roomrates_rows_attempted: attemptedByChain.hyatt,
    lhw_findrooms_rows_attempted: attemptedByChain.lhw,
    official_dynamic_rate_available_count: available.length,
    official_tax_inclusive_dynamic_rate_count: officialTaxInclusiveAvailable.length,
    estimated_tax_inclusive_dynamic_rate_count: estimatedTaxInclusiveAvailable.length,
    ihg_7_night_window_available_count: ihgWindowAvailable.length,
    ihg_full_window_available_count: ihgFullWindowAvailable.length,
    ihg_partial_window_available_count: ihgPartialWindowAvailable.length,
    marriott_7_night_window_available_count: marriottWindowAvailable.length,
    hyatt_7_night_window_available_count: hyattWindowAvailable.length,
    lhw_7_night_window_available_count: lhwWindowAvailable.length,
    hilton_current_lead_rate_available_count: hiltonLeadAvailable.length,
    available_counts_by_chain: countBy(available, "chain"),
    status_counts: countBy(rows, "rateStatus"),
    chain_counts: countBy(rows, "chain"),
    average_by_chain_currency: summarizeByChainCurrency(available),
    source_note:
      "IHG rows use the official availability-calendar API for a 7-night one-night-stay window and final averages use tax-inclusive after-fee-tax amounts when exposed. Marriott rows use official HQV GraphQL pre-tax amount values, then estimate final/tax-inclusive fields with 10% service charge plus 6% VAT unless HOTEL_USE_OFFICIAL_TAX_TOTAL=1 is set. Hyatt rows use official roomrates public Standard-rate pre-tax values, then estimate final/tax-inclusive fields with the same 10% + 6% rule. LHW rows use the official findRooms API native hotel-currency totals, including explicit pre-tax and tax/fee line values. Hilton rows retain current lead rates as tax-unknown pre-tax/proxy values and are excluded from final tax-inclusive averages. Other chains are retained with explicit adapter-pending statuses.",
  };
}

function writeSqlite(rows, metadata) {
  const schema = `
CREATE TABLE IF NOT EXISTS hotel_rate_snapshots (
  snapshot_id TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  hotel_key TEXT NOT NULL,
  chain TEXT,
  spirit_code TEXT,
  name_en TEXT,
  brand_en TEXT,
  region_code TEXT,
  country_code TEXT,
  city_en TEXT,
  rate_window_start_date TEXT,
  rate_window_end_date TEXT,
  rate_window_nights INTEGER,
  official_dynamic_rate_available INTEGER,
  official_dynamic_average_rate_local REAL,
  official_dynamic_average_currency TEXT,
  official_dynamic_average_basis TEXT,
  official_dynamic_average_sample_count INTEGER,
  tax_inclusive_average_rate_local REAL,
  pre_tax_average_rate_local REAL,
  tax_and_fee_average_amount_local REAL,
  tax_and_fee_average_rate REAL,
  tax_breakdown_available INTEGER,
  tax_inclusive_rate_kind TEXT,
  tax_estimate_used INTEGER,
  tax_estimate_basis TEXT,
  tax1_name TEXT,
  tax1_rate REAL,
  tax1_amount_local REAL,
  tax2_name TEXT,
  tax2_rate REAL,
  tax2_amount_local REAL,
  window_average_rate_local REAL,
  window_pre_tax_average_rate_local REAL,
  window_min_rate_local REAL,
  window_max_rate_local REAL,
  weekday_average_rate_local REAL,
  weekend_average_rate_local REAL,
  weekday_pre_tax_average_rate_local REAL,
  weekend_pre_tax_average_rate_local REAL,
  weekday_sample_count INTEGER,
  weekend_sample_count INTEGER,
  current_official_lead_rate_local REAL,
  current_official_lead_rate_fmt TEXT,
  rate_status TEXT,
  rate_source TEXT,
  rate_caveat TEXT,
  property_site_url_en TEXT,
  raw_rate_summary_json TEXT,
  PRIMARY KEY (snapshot_id, hotel_key)
);
CREATE TABLE IF NOT EXISTS hotel_rate_snapshot_runs (
  snapshot_id TEXT PRIMARY KEY,
  generated_at TEXT NOT NULL,
  rate_window_start_date TEXT,
  rate_window_end_date TEXT,
  rate_window_nights INTEGER,
  snapshot_row_count INTEGER,
  official_dynamic_rate_available_count INTEGER,
  ihg_7_night_window_available_count INTEGER,
  hilton_current_lead_rate_available_count INTEGER,
  metadata_json TEXT NOT NULL
);
`;
  const snapshotId = `${fetchedAt.slice(0, 10)}__${startDate}__${endDate}`;
  const snapshotColumns = [
    "snapshot_id",
    "fetched_at",
    "hotel_key",
    "chain",
    "spirit_code",
    "name_en",
    "brand_en",
    "region_code",
    "country_code",
    "city_en",
    "rate_window_start_date",
    "rate_window_end_date",
    "rate_window_nights",
    "official_dynamic_rate_available",
    "official_dynamic_average_rate_local",
    "official_dynamic_average_currency",
    "official_dynamic_average_basis",
    "official_dynamic_average_sample_count",
    "tax_inclusive_average_rate_local",
    "pre_tax_average_rate_local",
    "tax_and_fee_average_amount_local",
    "tax_and_fee_average_rate",
    "tax_breakdown_available",
    "tax_inclusive_rate_kind",
    "tax_estimate_used",
    "tax_estimate_basis",
    "tax1_name",
    "tax1_rate",
    "tax1_amount_local",
    "tax2_name",
    "tax2_rate",
    "tax2_amount_local",
    "window_average_rate_local",
    "window_pre_tax_average_rate_local",
    "window_min_rate_local",
    "window_max_rate_local",
    "weekday_average_rate_local",
    "weekend_average_rate_local",
    "weekday_pre_tax_average_rate_local",
    "weekend_pre_tax_average_rate_local",
    "weekday_sample_count",
    "weekend_sample_count",
    "current_official_lead_rate_local",
    "current_official_lead_rate_fmt",
    "rate_status",
    "rate_source",
    "rate_caveat",
    "property_site_url_en",
    "raw_rate_summary_json",
  ];
  runSqlite(["PRAGMA journal_mode=WAL;", schema].join("\n"));
  ensureSqliteColumns("hotel_rate_snapshots", [
    { name: "tax_inclusive_rate_kind", ddl: "ALTER TABLE hotel_rate_snapshots ADD COLUMN tax_inclusive_rate_kind TEXT;" },
    { name: "tax_estimate_used", ddl: "ALTER TABLE hotel_rate_snapshots ADD COLUMN tax_estimate_used INTEGER;" },
    { name: "tax_estimate_basis", ddl: "ALTER TABLE hotel_rate_snapshots ADD COLUMN tax_estimate_basis TEXT;" },
  ]);

  const statements = [
    `INSERT OR REPLACE INTO hotel_rate_snapshot_runs VALUES (${[
      sql(snapshotId),
      sql(metadata.generated_at),
      sql(metadata.rate_window_start_date),
      sql(metadata.rate_window_end_date),
      metadata.rate_window_nights,
      metadata.snapshot_row_count,
      metadata.official_dynamic_rate_available_count,
      metadata.ihg_7_night_window_available_count,
      metadata.hilton_current_lead_rate_available_count,
      sql(JSON.stringify(metadata)),
    ].join(", ")});`,
    ...rows.map((row) => `INSERT OR REPLACE INTO hotel_rate_snapshots (${snapshotColumns.join(", ")}) VALUES (${[
      sql(snapshotId),
      sql(row.fetchedAt),
      sql(row.hotelKey),
      sql(row.chain),
      sql(row.spiritCode),
      sql(row.name_en),
      sql(row.brand_en),
      sql(row.regionCode),
      sql(row.countryCode),
      sql(row.city_en),
      sql(row.rateWindowStartDate),
      sql(row.rateWindowEndDate),
      row.rateWindowNights,
      row.officialDynamicRateAvailable ? 1 : 0,
      sqlNumber(row.officialDynamicAverageRateLocal),
      sql(row.officialDynamicAverageCurrency),
      sql(row.officialDynamicAverageBasis),
      row.officialDynamicAverageSampleCount ?? 0,
      sqlNumber(row.taxInclusiveAverageRateLocal),
      sqlNumber(row.preTaxAverageRateLocal),
      sqlNumber(row.taxAndFeeAverageAmountLocal),
      sqlNumber(row.taxAndFeeAverageRate),
      row.taxBreakdownAvailable ? 1 : 0,
      sql(row.taxInclusiveRateKind),
      row.taxEstimateUsed ? 1 : 0,
      sql(row.taxEstimateBasis),
      sql(row.tax1Name),
      sqlNumber(row.tax1Rate),
      sqlNumber(row.tax1AmountLocal),
      sql(row.tax2Name),
      sqlNumber(row.tax2Rate),
      sqlNumber(row.tax2AmountLocal),
      sqlNumber(row.windowAverageRateLocal),
      sqlNumber(row.windowPreTaxAverageRateLocal),
      sqlNumber(row.windowMinRateLocal),
      sqlNumber(row.windowMaxRateLocal),
      sqlNumber(row.weekdayAverageRateLocal),
      sqlNumber(row.weekendAverageRateLocal),
      sqlNumber(row.weekdayPreTaxAverageRateLocal),
      sqlNumber(row.weekendPreTaxAverageRateLocal),
      row.weekdaySampleCount ?? 0,
      row.weekendSampleCount ?? 0,
      sqlNumber(row.currentOfficialLeadRateLocal),
      sql(row.currentOfficialLeadRateFmt),
      sql(row.rateStatus),
      sql(row.rateSource),
      sql(row.rateCaveat),
      sql(row.propertySiteURL_en),
      sql(JSON.stringify(row.rawRateSummary ?? null)),
    ].join(", ")});`),
  ].join("\n");

  runSqlite(statements);
}

function runSqlite(input) {
  const result = spawnSync("sqlite3", [sqlitePath], {
    input,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 32,
  });
  if (result.status !== 0) {
    throw new Error(`sqlite3 write failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function ensureSqliteColumns(tableName, columns) {
  const existingColumns = new Set(
    runSqlite(`PRAGMA table_info(${tableName});`)
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => line.split("|")[1]),
  );
  for (const column of columns) {
    if (!existingColumns.has(column.name)) runSqlite(column.ddl);
  }
}

function hotelKey(hotel) {
  return `${hotel.chain ?? "unknown"}:${hotel.spiritCode ?? hotel.name_en ?? hotel.name_zh ?? "unknown"}`;
}

function compareHotels(a, b) {
  return (
    String(a.chain ?? "").localeCompare(String(b.chain ?? "")) ||
    String(a.regionCode ?? "").localeCompare(String(b.regionCode ?? "")) ||
    String(a.city_en ?? a.city_zh ?? "").localeCompare(String(b.city_en ?? b.city_zh ?? "")) ||
    String(a.name_en ?? a.name_zh ?? "").localeCompare(String(b.name_en ?? b.name_zh ?? ""))
  );
}

function currencyForHotel(hotel) {
  return {
    CN: "CNY",
    HK: "HKD",
    MO: "MOP",
    TW: "TWD",
  }[hotel.countryCode] ?? null;
}

function marriottCalendarUrl(code, currency) {
  const params = new URLSearchParams({
    isRateCalendar: "true",
    propertyCode: code,
    isSearch: "true",
    currency,
  });
  return `https://www.marriott.com/search/availabilityCalendar.mi?${params.toString()}`;
}

function hyattShopUrl(code, checkinDate, checkoutDate) {
  const params = new URLSearchParams({
    checkinDate,
    checkoutDate,
    rooms: "1",
    adults: "1",
    kids: "0",
    rate: "Standard",
    accessibilityCheck: "false",
  });
  return `https://www.hyatt.com/shop/rooms/${code}?${params.toString()}`;
}

function hyattQuickbookUrl(hotel, checkinDate, checkoutDate) {
  const code = String(hotel.spiritCode ?? "").toLowerCase();
  const brandPath = hyattQuickbookBrandPath(hotel);
  const params = new URLSearchParams({
    spiritCode: code,
    pageName: "home",
    checkinDate,
    checkoutDate,
    rooms: "1",
    adults: "1",
    kids: "0",
  });
  return `https://www.hyatt.com/jse/quickbook/en-US/${brandPath}?${params.toString()}`;
}

function hyattRoomratesApiUrl(hotel, checkinDate, checkoutDate) {
  const code = String(hotel.spiritCode ?? "").toLowerCase();
  const params = new URLSearchParams({
    spiritCode: code,
    rooms: "1",
    adults: "1",
    checkinDate,
    checkoutDate,
    kids: "0",
    accessibilityCheck: "false",
    rate: "Standard",
    suiteUpgrade: "true",
  });
  return `https://www.hyatt.com/en-US/shop/service/rooms/roomrates/${code}?${params.toString()}`;
}

function hyattQuickbookBrandPath(hotel) {
  const brand = String(hotel.brand_en ?? "").toLowerCase();
  if (brand.includes("park hyatt")) return "park";
  if (brand.includes("grand hyatt")) return "grand";
  if (brand.includes("hyatt regency")) return "regency";
  if (brand.includes("hyatt place")) return "place";
  if (brand.includes("hyatt house")) return "house";
  if (brand.includes("hyatt centric")) return "centric";
  if (brand.includes("andaz")) return "andaz";
  if (brand.includes("alila")) return "alila";
  if (brand.includes("the unbound")) return "unbound";
  if (brand.includes("thompson")) return "thompson";
  if (brand.includes("jdv")) return "jdv";
  if (brand.includes("caption")) return "caption";
  if (brand.includes("urcove")) return "urcove";
  return "hyatt";
}

function windowStartDates() {
  return Array.from({ length: windowNights }, (_, index) => addDaysIso(startDate, index));
}

function moneyFromMarriottAmount(value) {
  const amount = numberOrNull(value?.amount);
  const decimalPoint = Number.isInteger(value?.decimalPoint) ? value.decimalPoint : 0;
  return Number.isFinite(amount) ? round(amount / 10 ** decimalPoint) : null;
}

function normalizeHyattTaxes(taxes) {
  return (Array.isArray(taxes) ? taxes : [])
    .map((tax) => ({
      name: tax?.taxDescription ?? tax?.description ?? tax?.taxCode ?? null,
      rate: Number.isFinite(numberOrNull(tax?.taxPercentage)) ? round(numberOrNull(tax.taxPercentage) / 100) : null,
      amount: numberOrNull(tax?.taxAmount),
      code: tax?.taxCode ?? null,
    }))
    .filter((tax) => Number.isFinite(tax.amount) || Number.isFinite(tax.rate) || tax.name);
}

function estimateTaxesFromPreTax(preTaxAmount) {
  if (!Number.isFinite(preTaxAmount)) {
    return {
      taxInclusiveAmount: null,
      taxAndFeeAmount: null,
      taxAndFeeRate: null,
      taxes: [],
    };
  }
  const serviceChargeAmount = round(preTaxAmount * estimatedServiceChargeRate);
  const vatAmount = round((preTaxAmount + serviceChargeAmount) * estimatedVatRate);
  const taxAndFeeAmount = round(serviceChargeAmount + vatAmount);
  return {
    taxInclusiveAmount: round(preTaxAmount + taxAndFeeAmount),
    taxAndFeeAmount,
    taxAndFeeRate: round(taxAndFeeAmount / preTaxAmount),
    taxes: [
      {
        name: "Estimated service charge",
        rate: estimatedServiceChargeRate,
        amount: serviceChargeAmount,
        code: "EST_SC",
      },
      {
        name: "Estimated VAT",
        rate: estimatedVatRate,
        amount: vatAmount,
        code: "EST_VAT",
      },
    ],
  };
}

function standardTaxEstimateBasis() {
  return `Estimated from official pre-tax public rate using ${formatRate(estimatedServiceChargeRate)} service charge plus ${formatRate(estimatedVatRate)} VAT applied after service charge.`;
}

function summarizeTaxLines(entries) {
  const tax1Entries = entries.filter((entry) => Number.isFinite(entry.tax1Amount) || Number.isFinite(entry.tax1Rate));
  const tax2Entries = entries.filter((entry) => Number.isFinite(entry.tax2Amount) || Number.isFinite(entry.tax2Rate));
  return {
    hasTaxLines: Boolean(tax1Entries.length || tax2Entries.length),
    tax1Name: tax1Entries.find((entry) => entry.tax1Name)?.tax1Name ?? null,
    tax1Rate: average(tax1Entries.map((entry) => entry.tax1Rate).filter(Number.isFinite)),
    tax1Amount: average(tax1Entries.map((entry) => entry.tax1Amount).filter(Number.isFinite)),
    tax2Name: tax2Entries.find((entry) => entry.tax2Name)?.tax2Name ?? null,
    tax2Rate: average(tax2Entries.map((entry) => entry.tax2Rate).filter(Number.isFinite)),
    tax2Amount: average(tax2Entries.map((entry) => entry.tax2Amount).filter(Number.isFinite)),
  };
}

function parseRequestedChains(value) {
  if (!value) return null;
  return new Set(
    String(value)
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map(chainSlug),
  );
}

function parseRequestedSpiritCodes(value) {
  if (!value) return null;
  return new Set(
    String(value)
      .split(/[,\s]+/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

function shouldFetchHotel(hotel) {
  const slug = chainSlug(hotel.chain);
  if (requestedChainSlugs && !requestedChainSlugs.has(slug)) return false;
  if (!requestedSpiritCodes) return true;
  const code = String(hotel.spiritCode ?? "").toLowerCase();
  return requestedSpiritCodes.has(code) || requestedSpiritCodes.has(`${slug}:${code}`) || requestedSpiritCodes.has(hotelKey(hotel).toLowerCase());
}

function chainSlug(chain) {
  const value = String(chain ?? "").toLowerCase();
  if (value.includes("marriott")) return "marriott";
  if (value.includes("hyatt")) return "hyatt";
  if (value.includes("ihg") || value.includes("intercontinental")) return "ihg";
  if (value.includes("hilton")) return "hilton";
  if (value.includes("leading hotels")) return "lhw";
  return value.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function formatRate(value) {
  return `${round(value * 100)}%`;
}

function parseFormattedAmount(value) {
  if (!value) return null;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function average(values) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return null;
  return round(clean.reduce((sum, value) => sum + value, 0) / clean.length);
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function isWeekendNight(date) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 5 || day === 6;
}

function tomorrowIsoDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function addDaysIso(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function toCompactDate(dateString) {
  return String(dateString).replaceAll("-", "");
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  return fallback;
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] ?? "null";
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function summarizeByChainCurrency(items) {
  const groups = new Map();
  for (const item of items) {
    const key = `${item.chain} ${item.officialDynamicAverageCurrency ?? "null"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item.officialDynamicAverageRateLocal);
  }
  return Object.fromEntries(
    Array.from(groups.entries()).map(([key, values]) => [
      key,
      {
        count: values.length,
        average: average(values),
        min: values.length ? round(Math.min(...values)) : null,
        max: values.length ? round(Math.max(...values)) : null,
      },
    ]),
  );
}

function toCsv(rows) {
  return `${[csvColumns, ...rows.map((row) => csvColumns.map((column) => csvValue(row[column])))]
    .map((row) => row.join(","))
    .join("\n")}\n`;
}

function csvValue(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value) || typeof value === "object") value = JSON.stringify(value);
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toSummary(metadata) {
  const chainRows = Object.entries(metadata.chain_counts)
    .map(([chain, count]) => `| ${chain} | ${count} | ${metadata.available_counts_by_chain[chain] ?? 0} |`)
    .join("\n");
  const statusRows = Object.entries(metadata.status_counts)
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => `| ${status} | ${count} |`)
    .join("\n");
  const averageRows = Object.entries(metadata.average_by_chain_currency)
    .map(([group, stats]) => `| ${group} | ${stats.count} | ${stats.average} | ${stats.min} | ${stats.max} |`)
    .join("\n");

  return `# Hotel Official Rate Window Snapshots

- Generated at: ${metadata.generated_at}
- Window: ${metadata.rate_window_start_date} to ${metadata.rate_window_end_date} (${metadata.rate_window_nights} one-night stays)
- Snapshot rows: ${metadata.snapshot_row_count}
- Official tax-inclusive dynamic average rows: ${metadata.official_dynamic_rate_available_count}
- Official tax-inclusive rows without tax estimate: ${metadata.official_tax_inclusive_dynamic_rate_count}
- Estimated tax-inclusive rows from official pre-tax rates: ${metadata.estimated_tax_inclusive_dynamic_rate_count}
- IHG 7-night window rows: ${metadata.ihg_7_night_window_available_count}
- IHG full 7-sample rows: ${metadata.ihg_full_window_available_count}
- IHG partial-window rows: ${metadata.ihg_partial_window_available_count}
- Marriott 7-night window rows: ${metadata.marriott_7_night_window_available_count}
- Hyatt 7-night window rows: ${metadata.hyatt_7_night_window_available_count}
- Hilton current lead-rate rows: ${metadata.hilton_current_lead_rate_available_count}
- SQLite: hotel-guide/database/hotel-rate-snapshots.sqlite

## Coverage by Chain

| Chain | Rows | Dynamic rate rows |
| --- | ---: | ---: |
${chainRows}

## Status Counts

| Status | Rows |
| --- | ---: |
${statusRows}

## Average by Chain and Currency

| Chain Currency | Count | Average | Min | Max |
| --- | ---: | ---: | ---: | ---: |
${averageRows}

## Notes

- IHG uses the official availability-calendar API and computes a 7-night average from nightly tax-inclusive lowest rates.
- IHG tax fields: final/tax-inclusive average, pre-tax average, aggregate tax-and-fee amount/rate. The calendar API does not expose individual tax lines.
- Marriott uses the official HQV GraphQL pre-tax amount and estimates tax-inclusive fields with 10% service charge plus 6% VAT by default.
- Hyatt uses official roomrates public Standard-rate pre-tax values and estimates tax-inclusive fields with 10% service charge plus 6% VAT by default.
- Hilton current lead rates are retained as tax-unknown pre-tax/proxy fields and are excluded from the final tax-inclusive average.
- Luxury-group rows without a confirmed rate adapter remain explicit adapter-pending rows in this snapshot.
`;
}

function sql(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlNumber(value) {
  return Number.isFinite(value) ? String(value) : "NULL";
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
