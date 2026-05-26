import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hotelSourceDir } from "./paths.mjs";

const outputDir = hotelSourceDir;
const outputJsonPath = join(outputDir, "accor-china-official-hotels.json");
const hodContentUrl = "https://repos.accor.com/ota/content.xml";
const userAgent = "michelin-list-personal-research/0.1 (+low-frequency official Accor HOD collection)";
const greaterChinaCountryCodes = new Set(["CN", "HK", "MO", "TW"]);

const brandZhByEn = {
  "Banyan Tree": "悦榕庄",
  Angsana: "悦椿",
  Dhawa: "达瓦",
  Fairmont: "费尔蒙",
  Garrya: "悦柳",
  "Grand Mercure": "美爵",
  HOMM: "HOMM",
  "Handwritten Collection": "翰悦阁精选",
  ibis: "宜必思",
  "ibis Styles": "宜必思尚品",
  "Jo&Joe": "JO&JOE",
  Mercure: "美居",
  MGallery: "美憬阁",
  Mondrian: "梦卓恩",
  Mövenpick: "瑞享",
  Novotel: "诺富特",
  "Novotel Living": "诺富特公寓",
  "Novotel Suites": "诺富特套房",
  "Other Brand": "其他品牌",
  Pullman: "铂尔曼",
  Raffles: "莱佛士",
  Sofitel: "索菲特",
  "Sofitel Legend": "索菲特传奇",
  Swissôtel: "瑞士酒店",
  "Swissôtel Living": "瑞士酒店公寓",
  "The Sebel": "诗铂",
};

let existingHotelsByCode = new Map();

async function main() {
  existingHotelsByCode = existsSync(outputJsonPath)
    ? new Map(JSON.parse(readFileSync(outputJsonPath, "utf8")).hotels.map((hotel) => [hotel.spiritCode, hotel]))
    : new Map();
  const hodXml = await fetchHodContentXml();
  const sourceHotels = parseHodContent(hodXml);
  const generatedAt = cleanText(hodXml.match(/<description>[\s\S]*?generated time ([\s\S]*?)<\/description>/i)?.[1]);
  const hotels = sourceHotels
    .filter((hotel) => greaterChinaCountryCodes.has(hotel.countryCode))
    .filter((hotel) => hotel.hotelStatus === "Open")
    .filter((hotel) => !isTestHotel(hotel))
    .map(toAccorHotelRecord)
    .sort((left, right) => left.spiritCode.localeCompare(right.spiritCode));

  writeFileSync(
    outputJsonPath,
    `${JSON.stringify(
      {
        metadata: {
          source: "accor_official_hod_repository_content_xml",
          source_url: hodContentUrl,
          generatedAt: generatedAt || null,
          fetchedAt: new Date().toISOString(),
          hotel_status_included: ["Open"],
          country_codes_included: [...greaterChinaCountryCodes],
          source_hotel_count: sourceHotels.length,
          greater_china_open_hotel_count: hotels.length,
        },
        hotels,
      },
      null,
      2,
    )}\n`,
  );

  console.log(`Wrote ${hotels.length} Accor Greater China hotels to ${outputJsonPath}`);
}

async function fetchHodContentXml() {
  const response = await fetch(hodContentUrl, {
    headers: {
      "accept-language": "en-US,en;q=0.9",
      "user-agent": userAgent,
    },
  });

  if (!response.ok) {
    throw new Error(`Accor HOD content fetch failed ${response.status}: ${hodContentUrl}`);
  }

  return response.text();
}

function parseHodContent(xml) {
  return [...xml.matchAll(/<hotel>([\s\S]*?)<\/hotel>/g)].map((match) => {
    const block = match[1];
    return {
      hotelCode: tag(block, "hotelCode"),
      hotelName: tag(block, "hotelName"),
      file: tag(block, "file"),
      lastModified: tag(block, "lastModified"),
      creationTime: tag(block, "creationTime"),
      latitude: numberOrNull(tag(block, "latitude")),
      longitude: numberOrNull(tag(block, "longitude")),
      brandCode: tag(block, "brandCode"),
      brandName: tag(block, "brandName"),
      cityName: normalizeCityName(tag(block, "cityName")),
      countryCode: tag(block, "countryCode"),
      countryName: tag(block, "countryName"),
      hotelStatus: tag(block, "hotelStatus"),
    };
  });
}

function toAccorHotelRecord(summary) {
  const existing = existingHotelsByCode.get(summary.hotelCode) ?? {};
  const brandEn = normalizeBrandName(summary.brandName);
  const brandZh = brandZhByEn[brandEn] ?? "";
  const region = regionForCountryCode(summary.countryCode);
  const cityEn = summary.cityName;
  const cityZh = cityZhFor(cityEn, summary.countryCode);
  const provinceZh = provinceZhFor(cityEn, summary.countryCode);
  const nameEn = titleCaseHotelName(existing.name_en || summary.hotelName);
  const nameZh = hasHan(existing.name_zh) ? existing.name_zh : "";

  return {
    chain: "Accor",
    chain_zh: "雅高集团",
    source: "accor_official_hod_repository_content_xml",
    official_locale_primary: "en-US",
    official_locale_secondary: null,
    spiritCode: summary.hotelCode,
    name_en: nameEn,
    name_zh: nameZh,
    brand_en: brandEn,
    brand_zh: brandZh,
    brandKey: slugify(brandEn),
    hotelStatus: "FULLY_BOOKABLE",
    propertyType: "Hotel",
    gpCategory: null,
    city_en: cityEn,
    city_zh: cityZh,
    province_en: region.province_en,
    province_zh: provinceZh,
    region_en: region.region_en,
    region_zh: region.region_zh,
    regionCode: region.regionCode,
    subRegionCode: null,
    subRegionLabel_en: null,
    subRegionLabel_zh: null,
    country_en: region.country_en,
    country_zh: region.country_zh,
    countryCode: summary.countryCode,
    countryDisplay_en: region.countryDisplay_en,
    countryDisplay_zh: region.countryDisplay_zh,
    address1_en: cleanText(existing.address1_en),
    address1_zh: cleanText(existing.address1_zh),
    zipcode: existing.zipcode ?? null,
    latitude: summary.latitude,
    longitude: summary.longitude,
    phone: cleanText(existing.phone) || null,
    email: cleanText(existing.email) || null,
    propertySiteURL_en: `https://all.accor.com/hotel/${summary.hotelCode}/index.en.shtml`,
    propertySiteURL_zh: `https://all.accor.com/hotel/${summary.hotelCode}/index.zh.shtml`,
    externalBookingURL_en: null,
    externalBookingURL_zh: null,
    bookableDate: null,
    openDate: null,
    checkinTime: existing.checkinTime ?? null,
    checkoutTime: existing.checkoutTime ?? null,
    nonSmoking: null,
    excludeFromBrandFilter: false,
    showBrandLogo: true,
    suppressBrandLogo: false,
    description_en: cleanText(existing.description_en) || null,
    description_zh: cleanText(existing.description_zh) || null,
    amenities_en: Array.isArray(existing.amenities_en) ? existing.amenities_en : [],
    amenities_zh: Array.isArray(existing.amenities_zh) ? existing.amenities_zh : [],
    amenityKeys: Array.isArray(existing.amenityKeys) ? existing.amenityKeys : [],
    characteristics_en: Array.isArray(existing.characteristics_en) ? existing.characteristics_en : [],
    characteristics_zh: Array.isArray(existing.characteristics_zh) ? existing.characteristics_zh : [],
    thumbnails: Array.isArray(existing.thumbnails) ? existing.thumbnails : [],
    brandlogo: existing.brandlogo ?? null,
    flag: null,
    verifiedRating: existing.verifiedRating ?? null,
    verifiedNumReviews: existing.verifiedNumReviews ?? null,
    lastRenovationDate: existing.lastRenovationDate ?? null,
    raw_en: {
      source_url: hodContentUrl,
      file_url: `https://repos.accor.com/ota/${summary.file}`,
      content_summary: summary,
    },
    raw_zh: null,
  };
}

function tag(block, name) {
  return decodeXml(block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "i"))?.[1] ?? "");
}

function decodeXml(value) {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}

function normalizeBrandName(value) {
  const normalized = cleanText(decodeXml(value)).toLocaleUpperCase();
  const brandMap = {
    ANGSANA: "Angsana",
    "BANYAN TREE": "Banyan Tree",
    DHAWA: "Dhawa",
    FAIRMONT: "Fairmont",
    GARRYA: "Garrya",
    "GRAND MERCURE": "Grand Mercure",
    HANDWRITTEN: "Handwritten Collection",
    HOMM: "HOMM",
    "IBIS HOTELS": "ibis",
    "IBIS STYLES": "ibis Styles",
    "JO&JOE": "Jo&Joe",
    MERCURE: "Mercure",
    MGALLERY: "MGallery",
    MONDRIAN: "Mondrian",
    MOVENPICK: "Mövenpick",
    NOVOTEL: "Novotel",
    "NOVOTEL LIVING": "Novotel Living",
    "NOVOTEL SUITES": "Novotel Suites",
    PULLMAN: "Pullman",
    RAFFLES: "Raffles",
    SOFITEL: "Sofitel",
    "SOFITEL LEGEND": "Sofitel Legend",
    SWISSOTEL: "Swissôtel",
    "SWISSOTEL LIVING": "Swissôtel Living",
    "THE SEBEL": "The Sebel",
  };
  return brandMap[normalized] ?? titleCaseHotelName(normalized);
}

function normalizeCityName(value) {
  const city = titleCaseHotelName(cleanText(value).replace(/\s+/g, " "));
  const aliases = {
    "Aba Sichuan Provice": "Aba",
    "Guangdong Huizhou": "Huizhou",
    "Haikou City Hainan Province": "Haikou",
    "Hang Zhou": "Hangzhou",
    Huaian: "Huai'an",
    "Huai An": "Huai'an",
    Huhhot: "Hohhot",
    Jinan: "Jinan",
    "Ji'Nan": "Jinan",
    "Ji'Ning": "Jining",
    "Jin Jiang": "Jinjiang",
    "Jing Hong": "Jinghong",
    Kangdingganzizhou: "Kangding",
    "Li Jiang": "Lijiang",
    "Shanghai City": "Shanghai",
    Taian: "Tai'an",
    "Tibetan Autonomous Prefecture": "Aba",
    "Xi An": "Xi'an",
    "Xi'An": "Xi'an",
    Xian: "Xi'an",
    "Ya'An": "Ya'an",
    "Yan'An": "Yan'an",
    Yongdengxianlanzhou: "Yongdeng",
    Zhangbeixian: "Zhangbei",
    Zhejiang: "Hangzhou",
  };
  return aliases[city] ?? city;
}

function titleCaseHotelName(value) {
  return cleanText(value)
    .toLocaleLowerCase()
    .split(/(\s+|-|')/)
    .map((part) => (/^[a-z]/.test(part) ? part.charAt(0).toLocaleUpperCase() + part.slice(1) : part))
    .join("")
    .replace(/\bIbis\b/g, "ibis")
    .replace(/\bMgallery\b/g, "MGallery")
    .replace(/\bMovenpick\b/g, "Mövenpick")
    .replace(/\bNovotel\b/g, "Novotel")
    .replace(/\bSofitel\b/g, "Sofitel")
    .replace(/\bSwissotel\b/g, "Swissôtel")
    .replace(/\bNecc\b/g, "NECC")
    .replace(/\bCbd\b/g, "CBD")
    .replace(/\bCny\b/g, "CNY")
    .replace(/\bHr\b/g, "HR")
    .replace(/\bJw\b/g, "JW")
    .replace(/\bR&f\b/gi, "R&F");
}

function cityZhFor(cityEn, countryCode) {
  if (countryCode === "HK") return "香港";
  if (countryCode === "MO") return "澳门";
  if (countryCode === "TW") return cityZhByEn[cityEn] ?? "台湾";
  return cityZhByEn[cityEn] ?? "";
}

function provinceZhFor(cityEn, countryCode) {
  if (countryCode === "HK") return "香港";
  if (countryCode === "MO") return "澳门";
  if (countryCode === "TW") return "台湾";
  return cityProvinceZhByEn[cityEn] ?? "";
}

const cityZhByEn = {
  Aba: "阿坝",
  Anji: "安吉",
  Ankang: "安康",
  Anqing: "安庆",
  Anshan: "鞍山",
  Anshun: "安顺",
  Anxi: "安溪",
  Anyang: "安阳",
  Baishan: "白山",
  Baotou: "包头",
  Beihai: "北海",
  Beijing: "北京",
  Bengbu: "蚌埠",
  Bijie: "毕节",
  Bozhou: "亳州",
  Changchun: "长春",
  Changde: "常德",
  Changsha: "长沙",
  Changshu: "常熟",
  Changzhou: "常州",
  Chaozhou: "潮州",
  Chengdu: "成都",
  Chenzhou: "郴州",
  Chifeng: "赤峰",
  Chizhou: "池州",
  Chongqing: "重庆",
  Dali: "大理",
  Dalian: "大连",
  Daqing: "大庆",
  Dazhou: "达州",
  Datong: "大同",
  Deqing: "德清",
  Diqing: "迪庆",
  Dongtai: "东台",
  Dongguan: "东莞",
  Dujiangyan: "都江堰",
  Emeishan: "峨眉山",
  Enshi: "恩施",
  Foshan: "佛山",
  Fuzhou: "福州",
  Ganzhou: "赣州",
  Golmud: "格尔木",
  Guangzhou: "广州",
  Guilin: "桂林",
  Guiyang: "贵阳",
  Guanyunxian: "灌云",
  Haikou: "海口",
  Haimen: "海门",
  Hainan: "海南",
  Haining: "海宁",
  Handan: "邯郸",
  Hangzhou: "杭州",
  Harbin: "哈尔滨",
  Hefei: "合肥",
  Hohhot: "呼和浩特",
  "Hong Kong": "香港",
  "Huai'an": "淮安",
  Huangshan: "黄山",
  Huayin: "华阴",
  Huizhou: "惠州",
  Huzhou: "湖州",
  Jinghong: "景洪",
  Jingjiang: "靖江",
  Jinhua: "金华",
  Jinjiang: "晋江",
  Jining: "济宁",
  Jinan: "济南",
  Jilin: "吉林",
  Kaifeng: "开封",
  Kangding: "康定",
  Kashgar: "喀什",
  Korla: "库尔勒",
  Kunming: "昆明",
  Kunshan: "昆山",
  Kuitun: "奎屯",
  Jiayuguan: "嘉峪关",
  Jiuquan: "酒泉",
  Lanzhou: "兰州",
  Lijiang: "丽江",
  Lianyungang: "连云港",
  Linfen: "临汾",
  Linyi: "临沂",
  Lushan: "庐山",
  Luoyang: "洛阳",
  Macau: "澳门",
  Nanchang: "南昌",
  Nanjing: "南京",
  Nanning: "南宁",
  Nantong: "南通",
  Neijiang: "内江",
  Ningbo: "宁波",
  Ordos: "鄂尔多斯",
  Panjin: "盘锦",
  Pingyao: "平遥",
  Pingliang: "平凉",
  Qidong: "启东",
  Qiannan: "黔南",
  Qingdao: "青岛",
  Qinhuangdao: "秦皇岛",
  Qionghai: "琼海",
  Qiongzhong: "琼中",
  Quanzhou: "泉州",
  Rizhao: "日照",
  Rugao: "如皋",
  Sanya: "三亚",
  Shaoguan: "韶关",
  Shaoxing: "绍兴",
  Shangqiu: "商丘",
  Shanghai: "上海",
  Shangrao: "上饶",
  Shigatse: "日喀则",
  Shenyang: "沈阳",
  Shenzhen: "深圳",
  Shijiazhuang: "石家庄",
  Shishi: "石狮",
  Suqian: "宿迁",
  Suzhou: "苏州",
  Taipei: "台北",
  Taicang: "太仓",
  "Tai'an": "泰安",
  Taizhou: "台州",
  Taiyuan: "太原",
  Tangshan: "唐山",
  Tengchong: "腾冲",
  Tianjin: "天津",
  Tiantai: "天台",
  Tianshui: "天水",
  Tonghua: "通化",
  Tongliao: "通辽",
  Turpan: "吐鲁番",
  Urumqi: "乌鲁木齐",
  Wanning: "万宁",
  Weinan: "渭南",
  Weifang: "潍坊",
  Wenzhou: "温州",
  Wuhan: "武汉",
  Wuhu: "芜湖",
  Wuxi: "无锡",
  Xiamen: "厦门",
  Xichang: "西昌",
  "Xi'an": "西安",
  Xianyang: "咸阳",
  Xinzhou: "忻州",
  Xining: "西宁",
  Xinyang: "信阳",
  Xishuangbanna: "西双版纳",
  Xuzhou: "徐州",
  "Ya'an": "雅安",
  Yancheng: "盐城",
  Yangzhou: "扬州",
  Yangquan: "阳泉",
  Yangshuo: "阳朔",
  "Yan'an": "延安",
  Yantai: "烟台",
  Yueyang: "岳阳",
  Yichang: "宜昌",
  Yinchuan: "银川",
  Yining: "伊宁",
  Yiwu: "义乌",
  Yongdeng: "永登",
  Zhangjiajie: "张家界",
  Zhangbei: "张北",
  Zhengzhou: "郑州",
  Zhenjiang: "镇江",
  Zhoukou: "周口",
  Zhoushan: "舟山",
  Zhuhai: "珠海",
  Zibo: "淄博",
  Zunyi: "遵义",
};

const cityProvinceZhByEn = {
  Aba: "四川",
  Anji: "浙江",
  Ankang: "陕西",
  Anqing: "安徽",
  Anshan: "辽宁",
  Anshun: "贵州",
  Anxi: "福建",
  Anyang: "河南",
  Baishan: "吉林",
  Baotou: "内蒙古",
  Beihai: "广西",
  Beijing: "北京",
  Bengbu: "安徽",
  Bijie: "贵州",
  Bozhou: "安徽",
  Changchun: "吉林",
  Changde: "湖南",
  Changsha: "湖南",
  Changshu: "江苏",
  Changzhou: "江苏",
  Chaozhou: "广东",
  Chengdu: "四川",
  Chenzhou: "湖南",
  Chifeng: "内蒙古",
  Chizhou: "安徽",
  Chongqing: "重庆",
  Dali: "云南",
  Dalian: "辽宁",
  Daqing: "黑龙江",
  Dazhou: "四川",
  Datong: "山西",
  Deqing: "浙江",
  Diqing: "云南",
  Dongtai: "江苏",
  Dongguan: "广东",
  Dujiangyan: "四川",
  Emeishan: "四川",
  Enshi: "湖北",
  Foshan: "广东",
  Fuzhou: "福建",
  Ganzhou: "江西",
  Golmud: "青海",
  Guangzhou: "广东",
  Guilin: "广西",
  Guiyang: "贵州",
  Guanyunxian: "江苏",
  Haikou: "海南",
  Haimen: "江苏",
  Hainan: "海南",
  Haining: "浙江",
  Handan: "河北",
  Hangzhou: "浙江",
  Harbin: "黑龙江",
  Hefei: "安徽",
  Hohhot: "内蒙古",
  "Huai'an": "江苏",
  Huangshan: "安徽",
  Huayin: "陕西",
  Huizhou: "广东",
  Huzhou: "浙江",
  Jinghong: "云南",
  Jingjiang: "江苏",
  Jinhua: "浙江",
  Jinjiang: "福建",
  Jining: "山东",
  Jinan: "山东",
  Jilin: "吉林",
  Kaifeng: "河南",
  Kangding: "四川",
  Kashgar: "新疆",
  Korla: "新疆",
  Kunming: "云南",
  Kunshan: "江苏",
  Kuitun: "新疆",
  Jiayuguan: "甘肃",
  Jiuquan: "甘肃",
  Lanzhou: "甘肃",
  Lijiang: "云南",
  Lianyungang: "江苏",
  Linfen: "山西",
  Linyi: "山东",
  Lushan: "江西",
  Luoyang: "河南",
  Nanchang: "江西",
  Nanjing: "江苏",
  Nanning: "广西",
  Nantong: "江苏",
  Neijiang: "四川",
  Ningbo: "浙江",
  Ordos: "内蒙古",
  Panjin: "辽宁",
  Pingyao: "山西",
  Pingliang: "甘肃",
  Qidong: "江苏",
  Qiannan: "贵州",
  Qingdao: "山东",
  Qinhuangdao: "河北",
  Qionghai: "海南",
  Qiongzhong: "海南",
  Quanzhou: "福建",
  Rizhao: "山东",
  Rugao: "江苏",
  Sanya: "海南",
  Shaoguan: "广东",
  Shaoxing: "浙江",
  Shangqiu: "河南",
  Shanghai: "上海",
  Shangrao: "江西",
  Shigatse: "西藏",
  Shenyang: "辽宁",
  Shenzhen: "广东",
  Shijiazhuang: "河北",
  Shishi: "福建",
  Suqian: "江苏",
  Suzhou: "江苏",
  Taicang: "江苏",
  "Tai'an": "山东",
  Taizhou: "浙江",
  Taiyuan: "山西",
  Tangshan: "河北",
  Tengchong: "云南",
  Tianjin: "天津",
  Tiantai: "浙江",
  Tianshui: "甘肃",
  Tonghua: "吉林",
  Tongliao: "内蒙古",
  Turpan: "新疆",
  Urumqi: "新疆",
  Wanning: "海南",
  Weinan: "陕西",
  Weifang: "山东",
  Wenzhou: "浙江",
  Wuhan: "湖北",
  Wuhu: "安徽",
  Wuxi: "江苏",
  Xiamen: "福建",
  Xichang: "四川",
  "Xi'an": "陕西",
  Xianyang: "陕西",
  Xinzhou: "山西",
  Xining: "青海",
  Xinyang: "河南",
  Xishuangbanna: "云南",
  Xuzhou: "江苏",
  "Ya'an": "四川",
  Yancheng: "江苏",
  Yangzhou: "江苏",
  Yangquan: "山西",
  Yangshuo: "广西",
  "Yan'an": "陕西",
  Yantai: "山东",
  Yueyang: "湖南",
  Yichang: "湖北",
  Yinchuan: "宁夏",
  Yining: "新疆",
  Yiwu: "浙江",
  Yongdeng: "甘肃",
  Zhangjiajie: "湖南",
  Zhangbei: "河北",
  Zhengzhou: "河南",
  Zhenjiang: "江苏",
  Zhoukou: "河南",
  Zhoushan: "浙江",
  Zhuhai: "广东",
  Zibo: "山东",
  Zunyi: "贵州",
};

function regionForCountryCode(countryCode) {
  if (countryCode === "HK") {
    return {
      region_en: "Hong Kong",
      region_zh: "中国香港",
      regionCode: "HK",
      province_en: "Hong Kong",
      country_en: "Hong Kong SAR, China",
      country_zh: "中国香港",
      countryDisplay_en: "Hong Kong SAR, China",
      countryDisplay_zh: "中国香港",
    };
  }

  if (countryCode === "MO") {
    return {
      region_en: "Macau",
      region_zh: "中国澳门",
      regionCode: "MO",
      province_en: "Macau",
      country_en: "Macau SAR, China",
      country_zh: "中国澳门",
      countryDisplay_en: "Macau SAR, China",
      countryDisplay_zh: "中国澳门",
    };
  }

  if (countryCode === "TW") {
    return {
      region_en: "Taiwan",
      region_zh: "中国台湾",
      regionCode: "TW",
      province_en: "Taiwan",
      country_en: "Taiwan, China",
      country_zh: "中国台湾",
      countryDisplay_en: "Taiwan, China",
      countryDisplay_zh: "中国台湾",
    };
  }

  return {
    region_en: "Mainland China",
    region_zh: "中国大陆",
    regionCode: "MAINLAND_CN",
    province_en: "",
    country_en: "China",
    country_zh: "中国",
    countryDisplay_en: "China",
    countryDisplay_zh: "中国",
  };
}

function isTestHotel(hotel) {
  return /TEST|DO NOT TOUCH/i.test(`${hotel.hotelName} ${hotel.brandName}`);
}

function cleanText(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function slugify(value) {
  return cleanText(value)
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function hasHan(value) {
  return /[\u3400-\u9fff]/u.test(String(value ?? ""));
}

await main();
