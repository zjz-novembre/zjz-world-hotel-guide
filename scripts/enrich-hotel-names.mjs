import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { hotelSourceDir } from "./paths.mjs";

const publicHotelsPath = join("public", "hotels.json");
const outputPath = join(hotelSourceDir, "hotel-name-overrides.json");
const userAgent = "hotel-guide-personal-research/0.1 (+low-frequency public hotel name completion)";
const fetchConcurrency = 8;

const manualOverrides = {
  "Hilton:HILTON-SHAQQQQ": { name_zh: "上海柏景希尔顿格芮精选酒店", source: "manual_known_chinese_name" },
  "Hilton:HILTON-NAYNAHX": { name_zh: "北京新国展希尔顿欢朋酒店", source: "manual_known_chinese_name" },
  "Hilton:HILTON-SZXDMGI": { name_zh: "深圳大梅沙希尔顿花园酒店", source: "manual_known_chinese_name" },
  "Hilton:HILTON-IQNQNHX": { name_zh: "清远凤城希尔顿欢朋酒店", source: "manual_known_chinese_name" },
  "Hilton:HILTON-CZXZYLX": { name_zh: "常州紫云玄清度假酒店", source: "manual_known_chinese_name" },
  "Hilton:HILTON-YBPCNHT": { name_zh: "宜宾高县希尔顿惠庭酒店", source: "manual_known_chinese_name" },
  "Hilton:HILTON-JINNAHX": { name_zh: "泉州南安水头希尔顿欢朋酒店", source: "manual_known_chinese_name" },
  "Hilton:HILTON-CSXSCHX": { name_zh: "长沙东盈广场希尔顿欢朋酒店", source: "manual_known_chinese_name" },
  "Hilton:HILTON-KMGYLLX": { name_zh: "昆明玉龙湾湖景酒店", source: "manual_known_chinese_name" },
  "Hilton:HILTON-SJWSCGI": { name_zh: "石家庄高新区希尔顿花园酒店", source: "manual_known_chinese_name" },
  "Hilton:HILTON-KHNANHX": { name_zh: "南昌青山湖希尔顿欢朋酒店", source: "manual_known_chinese_name" },
  "Hilton:HILTON-BHYBEHI": { name_zh: "北海希尔顿酒店", source: "manual_known_chinese_name" },
  "Hilton:HILTON-LXATTHX": { name_zh: "拉萨纳金路希尔顿欢朋酒店", source: "manual_known_chinese_name" },
  "Hilton:HILTON-YNTLVLX": { name_zh: "烟台龙亭葡萄酒庄酒店", source: "manual_known_chinese_name" },
  "Hilton:HILTON-DATSZHX": { name_zh: "朔州希尔顿欢朋酒店", source: "manual_known_chinese_name" },
  "Hilton:HILTON-XIYYHLX": { name_zh: "西安云和夜泊酒店", source: "manual_known_chinese_name" },
  "IHG Hotels & Resorts:IHG-NKGNH": { name_zh: "南京滨江假日酒店", source: "manual_known_chinese_name" },
  "IHG Hotels & Resorts:IHG-ZHECH": { name_zh: "镇江皇冠假日酒店", source: "manual_known_chinese_name" },
  "IHG Hotels & Resorts:IHG-CTUFC": { name_zh: "成都金融城英迪格酒店", source: "manual_known_chinese_name" },
  "IHG Hotels & Resorts:IHG-CTULE": { name_zh: "乐山华邑酒店", source: "manual_known_chinese_name" },
  "IHG Hotels & Resorts:IHG-LQSCL": { name_zh: "海南清水湾金普顿Aqeos酒店", source: "manual_known_chinese_name" },
  "IHG Hotels & Resorts:IHG-TPERG": { name_zh: "台北晶华酒店", source: "manual_known_chinese_name" },
  "Small Luxury Hotels of the World:SLH-98865": { name_zh: "上海沐舍朱泾酒店", source: "manual_known_chinese_name" },
  "Small Luxury Hotels of the World:SLH-79724": { name_zh: "上海素凯泰酒店", source: "manual_known_chinese_name" },
  "Small Luxury Hotels of the World:SLH-78722": { name_zh: "北京怡亨酒店", source: "manual_known_chinese_name" },
  "Small Luxury Hotels of the World:SLH-42117": { name_zh: "北京雁柏山庄", source: "manual_known_chinese_name" },
  "Small Luxury Hotels of the World:SLH-78346": { name_zh: "广州岭南五号酒店", source: "manual_known_chinese_name" },
  "Small Luxury Hotels of the World:SLH-9717": { name_zh: "杭州木守西溪酒店", source: "manual_known_chinese_name" },
  "Small Luxury Hotels of the World:SLH-33092": { name_zh: "杭州秋水山庄", source: "manual_known_chinese_name" },
  "Small Luxury Hotels of the World:SLH-35891": { name_zh: "杭州未迟酒店", source: "manual_known_chinese_name" },
  "Small Luxury Hotels of the World:SLH-41707": { name_zh: "绍兴璞祺艺境酒店", source: "manual_known_chinese_name" },
  "Small Luxury Hotels of the World:SLH-96738": { name_zh: "常州紫云玄清度假酒店", source: "manual_known_chinese_name" },
  "Small Luxury Hotels of the World:SLH-8997": { name_zh: "南京新晶丽酒店", source: "manual_known_chinese_name" },
  "Small Luxury Hotels of the World:SLH-47180": { name_zh: "苏州涵玉晓筑园林酒店", source: "manual_known_chinese_name" },
  "Small Luxury Hotels of the World:SLH-10782": { name_zh: "成都尧棠公馆", source: "manual_known_chinese_name" },
  "Small Luxury Hotels of the World:SLH-78828": { name_zh: "安溪悦泉行馆", source: "manual_known_chinese_name" },
  "Small Luxury Hotels of the World:SLH-44058": { name_zh: "泉州开璞府钟楼", source: "manual_known_chinese_name" },
  "Small Luxury Hotels of the World:SLH-44194": { name_zh: "泉州开璞海丝酒店", source: "manual_known_chinese_name" },
  "Small Luxury Hotels of the World:SLH-48281": { name_zh: "厦门黄岩三十六酒店", source: "manual_known_chinese_name" },
  "Small Luxury Hotels of the World:SLH-96876": { name_zh: "烟台龙亭葡萄酒庄酒店", source: "manual_known_chinese_name" },
  "Small Luxury Hotels of the World:SLH-96196": { name_zh: "西安云和夜泊酒店", source: "manual_known_chinese_name" },
  "Small Luxury Hotels of the World:SLH-46482": { name_zh: "赤壁水岸隐入酒店", source: "manual_known_chinese_name" },
  "Small Luxury Hotels of the World:SLH-3136": { name_zh: "大理云墅海景度假酒店", source: "manual_known_chinese_name" },
  "Small Luxury Hotels of the World:SLH-34720": { name_zh: "昆明玉龙湾湖景酒店", source: "manual_known_chinese_name" },
  "Small Luxury Hotels of the World:SLH-40850": { name_zh: "大理曙光酒店", source: "manual_known_chinese_name" },
  "Small Luxury Hotels of the World:SLH-47640": { name_zh: "腾冲月泊半山温泉度假酒店", source: "manual_known_chinese_name" },
  "Small Luxury Hotels of the World:SLH-35649": { name_zh: "敦煌碧玥酒店", source: "manual_known_chinese_name" },
  "Small Luxury Hotels of the World:SLH-78405": { name_zh: "香港逸兰铜锣湾酒店", source: "manual_known_chinese_name" },
  "Small Luxury Hotels of the World:SLH-42356": { name_zh: "苗栗格拉斯行馆", source: "manual_known_chinese_name" },
  "Small Luxury Hotels of the World:SLH-42090": { name_zh: "南投日月潭承亿文旅潭日月", source: "manual_known_chinese_name" },
  "Small Luxury Hotels of the World:SLH-78810": { name_zh: "南投老英格兰庄园", source: "manual_known_chinese_name" },
  "Small Luxury Hotels of the World:SLH-42066": { name_zh: "台北维多丽亚酒店", source: "manual_known_chinese_name" },
  "Accor:B622": { name_zh: "康定宜必思酒店", source: "manual_known_chinese_name" },
  "Marriott:XIYCW": { name_zh: "西安西部万怡酒店", source: "manual_known_chinese_name" },
};

const payload = JSON.parse(readFileSync(publicHotelsPath, "utf8"));
const hotels = payload.hotels ?? [];
const existing = loadExistingOverrides();
const overrides = { ...existing.overrides };
let fetched = 0;
let failed = 0;

for (const [hotelKey, override] of Object.entries(manualOverrides)) {
  mergeOverride(hotelKey, override);
}

const tasks = hotels
  .filter((hotel) => needsNameCompletion(hotel))
  .map((hotel) => async () => {
    const override = overrides[hotel.hotelKey] ?? {};
    try {
      if (needsChineseName(hotel) && !hasHan(override.name_zh)) {
        const name_zh = await fetchChineseName(hotel);
        if (hasHan(name_zh)) mergeOverride(hotel.hotelKey, { name_zh, source: sourceForChineseName(hotel) });
      }

      if (needsEnglishName(hotel) && !hasLatin(override.name_en)) {
        const name_en = await fetchEnglishName(hotel);
        if (hasLatin(name_en)) mergeOverride(hotel.hotelKey, { name_en, source: sourceForEnglishName(hotel) });
      }
    } catch (error) {
      failed += 1;
      mergeOverride(hotel.hotelKey, { error: String(error?.message ?? error) });
    }
  });

await runQueue(tasks, fetchConcurrency);

mkdirSync(hotelSourceDir, { recursive: true });
writeFileSync(
  outputPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      usage: "personal_noncommercial_low_frequency_name_completion",
      fetched,
      failed,
      overrides,
    },
    null,
    2,
  )}\n`,
);

const completed = hotels.filter((hotel) => {
  const override = overrides[hotel.hotelKey] ?? {};
  const nameZh = hasHan(hotel.nameZh) ? hotel.nameZh : override.name_zh;
  const nameEn = hasLatin(hotel.nameEn) ? hotel.nameEn : override.name_en;
  return hasHan(nameZh) && hasLatin(nameEn);
}).length;

console.log(`Wrote ${Object.keys(overrides).length} name overrides to ${outputPath}`);
console.log(`Name-complete hotels after overrides: ${completed}/${hotels.length}`);
console.log(`Fetched: ${fetched}; failed: ${failed}`);

function loadExistingOverrides() {
  if (!existsSync(outputPath)) return { overrides: {} };
  const parsed = JSON.parse(readFileSync(outputPath, "utf8"));
  return { ...parsed, overrides: parsed.overrides ?? {} };
}

function mergeOverride(hotelKey, next) {
  overrides[hotelKey] = { ...(overrides[hotelKey] ?? {}), ...next };
}

function needsNameCompletion(hotel) {
  return needsChineseName(hotel) || needsEnglishName(hotel);
}

function needsChineseName(hotel) {
  return !hasHan(hotel.nameZh);
}

function needsEnglishName(hotel) {
  return !hasLatin(hotel.nameEn);
}

async function fetchChineseName(hotel) {
  if (hotel.chain === "Hilton") {
    return extractHiltonChinaName(await fetchText(toHiltonChinaUrl(hotel.sourceUrl)));
  }

  if (hotel.chain === "IHG Hotels & Resorts") {
    return extractIhgChinaName(await fetchText(hotel.sourceUrl));
  }

  return "";
}

async function fetchEnglishName(hotel) {
  if (hotel.chain === "Shangri-La") {
    return extractEnglishNameFromTitle(
      await fetchText(toShangriLaEnglishUrl(hotel.sourceUrl), "en-US,en;q=0.9"),
    );
  }

  return "";
}

function sourceForChineseName(hotel) {
  if (hotel.chain === "Hilton") return "hilton_cn_official_detail_title";
  if (hotel.chain === "IHG Hotels & Resorts") return "ihg_cn_official_detail_og_title";
  return "manual_or_generated";
}

function sourceForEnglishName(hotel) {
  if (hotel.chain === "Shangri-La") return "shangri_la_official_en_title";
  return "manual_or_generated";
}

async function fetchText(url, acceptLanguage = "zh-CN,zh;q=0.9,en;q=0.7") {
  if (!url) throw new Error("missing URL");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      headers: {
        "accept-language": acceptLanguage,
        "user-agent": userAgent,
      },
      signal: controller.signal,
    });
    fetched += 1;
    if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
    await delay(80);
  }
}

function toHiltonChinaUrl(url) {
  const pathname = new URL(url).pathname;
  const match = pathname.match(/\/hotels\/([^/]+)/);
  if (!match) return url;
  return `https://www.hilton.com.cn/zh-CN/hotels/${match[1]}`;
}

function toShangriLaEnglishUrl(url) {
  if (!url) return url;
  return url
    .replace("https://www.shangri-la.com/cn/", "https://www.shangri-la.com/en/")
    .replace("https://www.hoteljen.com/cn/", "https://www.hoteljen.com/en/");
}

function extractHiltonChinaName(html) {
  const title = htmlTitle(html);
  const titleName = title
    .replace(/\s*-\s*希[尔爾]顿酒店集团.*$/u, "")
    .replace(/\s*-\s*希[尔爾]顿.*$/u, "")
    .trim();
  if (hasHan(titleName) && !/404|页面不存在|SOMETHING WENT WRONG/i.test(titleName)) return titleName;

  const h1 = cleanHtml(firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i));
  return hasHan(h1) ? h1 : "";
}

function extractIhgChinaName(html) {
  const candidates = [
    metaContent(html, "property", "og:title"),
    metaContent(html, "name", "title"),
    htmlTitle(html),
    firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i),
  ];

  for (const candidate of candidates) {
    const clean = cleanIhgTitle(candidate);
    if (hasHan(clean)) return clean;
  }

  return "";
}

function cleanIhgTitle(value) {
  return cleanHtml(value)
    .replace(/\s*-\s*.+$/u, "")
    .replace(/^(Atwell Suites|Crowne Plaza|EVEN Hotel|Garner Hotel|HUALUXE|Holiday Inn Express|Holiday Inn Resort|Holiday Inn & Suites|Holiday Inn|Hotel Indigo|InterContinental|Kimpton|Regent|Vignette Collection|voco)\s+/iu, "")
    .replace(/\s*,?\s*中国（中华人民共和国）.*$/u, "")
    .replace(/\s*,?\s*中國.*$/u, "")
    .trim();
}

function extractEnglishNameFromTitle(html) {
  const title = htmlTitle(html);
  const afterPipe = title.includes("|") ? title.split("|").at(-1).trim() : title;
  const clean = afterPipe
    .replace(/\s*-\s*Shangri-La.*$/i, "")
    .replace(/\s*-\s*JEN.*$/i, "")
    .trim();
  return hasLatin(clean) ? clean : "";
}

function htmlTitle(html) {
  return cleanHtml(firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i));
}

function metaContent(html, attrName, attrValue) {
  const pattern = new RegExp(`<meta[^>]+${attrName}=["']${escapeRegExp(attrValue)}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
  const reversePattern = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attrName}=["']${escapeRegExp(attrValue)}["'][^>]*>`, "i");
  return firstMatch(html, pattern) || firstMatch(html, reversePattern);
}

function cleanHtml(value) {
  return decodeHtml(String(value ?? "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)));
}

function firstMatch(value, pattern) {
  return String(value ?? "").match(pattern)?.[1] ?? "";
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasHan(value) {
  return /[\u3400-\u9fff]/u.test(String(value ?? ""));
}

function hasLatin(value) {
  return /[A-Za-z]/.test(String(value ?? ""));
}

async function runQueue(tasks, concurrency) {
  let index = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (index < tasks.length) {
      const task = tasks[index];
      index += 1;
      await task();
    }
  });
  await Promise.all(workers);
}
