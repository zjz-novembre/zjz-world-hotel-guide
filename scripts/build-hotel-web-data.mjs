import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hotelPublicDir, hotelSourceDir } from "./paths.mjs";

const outputDir = hotelSourceDir;
const publicDir = hotelPublicDir;
const outputPath = join(publicDir, "hotels.json");
const rateSnapshotPath = join(outputDir, "hotel-official-rate-window-snapshots.json");
const nameOverridesPath = join(outputDir, "hotel-name-overrides.json");
const lhwImagesPath = join(outputDir, "lhw-official-images.json");

const hotelSourceFiles = [
  "marriott-china-hong-kong-macau-taiwan-official-hotels.json",
  "hyatt-mainland-china-official-hotels.json",
  "ihg-hilton-greater-china-official-hotels.json",
  "luxury-hotel-groups-greater-china-official-hotels.json",
  "accor-china-official-hotels.json",
];

const provinceByEnglishName = {
  Anhui: "安徽",
  Beijing: "北京",
  Chongqing: "重庆",
  Fujian: "福建",
  Gansu: "甘肃",
  Guangdong: "广东",
  Guangxi: "广西",
  Guizhou: "贵州",
  Hainan: "海南",
  Hebei: "河北",
  Heilongjiang: "黑龙江",
  Henan: "河南",
  Hubei: "湖北",
  Hunan: "湖南",
  "Inner Mongolia": "内蒙古",
  Jiangsu: "江苏",
  Jiangxi: "江西",
  Jilin: "吉林",
  Liaoning: "辽宁",
  Ningxia: "宁夏",
  Qinghai: "青海",
  Shaanxi: "陕西",
  Shandong: "山东",
  Shanghai: "上海",
  Shanxi: "山西",
  Sichuan: "四川",
  Tianjin: "天津",
  Tibet: "西藏",
  Xinjiang: "新疆",
  Yunnan: "云南",
  Zhejiang: "浙江",
};

const provinceEnglishByName = Object.fromEntries(
  Object.entries(provinceByEnglishName).map(([englishName, chineseName]) => [chineseName, englishName]),
);
provinceEnglishByName["香港"] = "Hong Kong";
provinceEnglishByName["澳门"] = "Macau";
provinceEnglishByName["台湾"] = "Taiwan";
provinceEnglishByName["中国大陆"] = "Mainland China";

const chainLabels = {
  Accor: { zh: "雅高集团", en: "Accor" },
  Aman: { zh: "安缦集团", en: "Aman" },
  "Four Seasons": { zh: "四季酒店集团", en: "Four Seasons" },
  Hilton: { zh: "希尔顿集团", en: "Hilton" },
  Hyatt: { zh: "凯悦集团", en: "Hyatt" },
  "IHG Hotels & Resorts": { zh: "洲际酒店集团", en: "IHG Hotels & Resorts" },
  Marriott: { zh: "万豪国际", en: "Marriott" },
  "Mandarin Oriental": { zh: "文华东方酒店集团", en: "Mandarin Oriental" },
  Rosewood: { zh: "瑰丽酒店集团", en: "Rosewood" },
  "Shangri-La": { zh: "香格里拉集团", en: "Shangri-La" },
  "Small Luxury Hotels of the World": { zh: "全球奢华精品酒店", en: "Small Luxury Hotels of the World" },
  "The Leading Hotels of the World": { zh: "立鼎世酒店联盟", en: "The Leading Hotels of the World" },
  "The Peninsula": { zh: "半岛酒店集团", en: "The Peninsula" },
};

const provinceCodeByName = {
  上海: "shanghai",
  北京: "beijing",
  天津: "tianjin",
  重庆: "chongqing",
  广东: "guangdong",
  浙江: "zhejiang",
  江苏: "jiangsu",
  四川: "sichuan",
  海南: "hainan",
  福建: "fujian",
  山东: "shandong",
  陕西: "shaanxi",
  湖北: "hubei",
  湖南: "hunan",
  云南: "yunnan",
  安徽: "anhui",
  河南: "henan",
  河北: "hebei",
  辽宁: "liaoning",
  吉林: "jilin",
  黑龙江: "heilongjiang",
  山西: "shanxi",
  江西: "jiangxi",
  广西: "guangxi",
  贵州: "guizhou",
  甘肃: "gansu",
  青海: "qinghai",
  宁夏: "ningxia",
  内蒙古: "inner-mongolia",
  新疆: "xinjiang",
  西藏: "tibet",
  香港: "hong-kong",
  澳门: "macau",
  台湾: "taiwan",
  中国大陆: "mainland-china",
};

const provinceCenters = {
  上海: [121.4746, 31.2286],
  北京: [116.4074, 39.9042],
  天津: [117.2009, 39.0842],
  重庆: [106.5516, 29.563],
  广东: [113.2665, 23.1322],
  浙江: [120.1551, 30.2741],
  江苏: [118.7969, 32.0603],
  四川: [104.0668, 30.5728],
  海南: [110.3312, 20.031],
  福建: [119.2965, 26.0745],
  山东: [117.1201, 36.6512],
  陕西: [108.9398, 34.3416],
  湖北: [114.3055, 30.5928],
  湖南: [112.9388, 28.2282],
  云南: [102.8329, 24.8801],
  安徽: [117.2272, 31.8206],
  河南: [113.6254, 34.7466],
  河北: [114.5149, 38.0428],
  辽宁: [123.4315, 41.8057],
  吉林: [125.3235, 43.8171],
  黑龙江: [126.5349, 45.8038],
  山西: [112.5489, 37.8706],
  江西: [115.8579, 28.682],
  广西: [108.3669, 22.817],
  贵州: [106.6302, 26.647],
  甘肃: [103.8343, 36.0611],
  青海: [101.7782, 36.6171],
  宁夏: [106.2309, 38.4872],
  内蒙古: [111.7492, 40.8426],
  新疆: [87.6168, 43.8256],
  西藏: [91.1172, 29.6469],
  香港: [114.1694, 22.3193],
  澳门: [113.5439, 22.1987],
  台湾: [121.5654, 25.033],
  中国大陆: [104.1954, 35.8617],
};

const provinceOrder = [
  "上海",
  "北京",
  "天津",
  "重庆",
  "广东",
  "浙江",
  "江苏",
  "四川",
  "海南",
  "福建",
  "山东",
  "陕西",
  "湖北",
  "湖南",
  "云南",
  "安徽",
  "河南",
  "河北",
  "辽宁",
  "吉林",
  "黑龙江",
  "山西",
  "江西",
  "广西",
  "贵州",
  "甘肃",
  "青海",
  "宁夏",
  "内蒙古",
  "新疆",
  "西藏",
  "香港",
  "澳门",
  "台湾",
  "中国大陆",
];

const cityProvince = {
  Aba: "四川",
  Aksu: "新疆",
  Alxa: "内蒙古",
  Altay: "新疆",
  Ankang: "陕西",
  Anqing: "安徽",
  Anshan: "辽宁",
  Anshun: "贵州",
  Anxi: "福建",
  Baoding: "河北",
  Baoshan: "云南",
  Baoji: "陕西",
  Bayannur: "内蒙古",
  Bazhong: "四川",
  Beihai: "广西",
  Beijing: "北京",
  Benxi: "辽宁",
  Binzhou: "山东",
  Bole: "新疆",
  Bortala: "新疆",
  Bozhou: "安徽",
  Cangzhou: "河北",
  Changbaishan: "吉林",
  Changchun: "吉林",
  Changde: "湖南",
  Changji: "新疆",
  Changsha: "湖南",
  Changshu: "江苏",
  Changzhou: "江苏",
  Changzhi: "山西",
  Chaozhou: "广东",
  Chengde: "河北",
  Chengdu: "四川",
  Chenzhou: "湖南",
  Chibi: "湖北",
  "Chibi City": "湖北",
  Chifeng: "内蒙古",
  Chizhou: "安徽",
  Chongqing: "重庆",
  Chuzhou: "安徽",
  Dali: "云南",
  Dalian: "辽宁",
  Dandong: "辽宁",
  Danzhou: "海南",
  Daqing: "黑龙江",
  Datong: "山西",
  Deyang: "四川",
  Dezhou: "山东",
  Dongguan: "广东",
  Dongying: "山东",
  Dongyang: "浙江",
  Dunhuang: "甘肃",
  Emeishan: "四川",
  Erdaobaihe: "吉林",
  "Erdaobaihe Town": "吉林",
  Erdos: "内蒙古",
  "Erdos City": "内蒙古",
  Ezhou: "湖北",
  Fengcheng: "江西",
  Foshan: "广东",
  Fuzhou: "福建",
  Fuyang: "安徽",
  Fuxin: "辽宁",
  Ganzhou: "江西",
  Ganzi: "四川",
  Golmud: "青海",
  Guangyuan: "四川",
  Guangzhou: "广东",
  Guigang: "广西",
  Guilin: "广西",
  Guiyang: "贵州",
  Haikou: "海南",
  Hami: "新疆",
  Handan: "河北",
  Hangzhou: "浙江",
  Harbin: "黑龙江",
  Hefei: "安徽",
  Hebi: "河南",
  Heihe: "黑龙江",
  Hengshui: "河北",
  Hengyang: "湖南",
  Heyuan: "广东",
  Heze: "山东",
  Hinggan: "内蒙古",
  Hohhot: "内蒙古",
  "Hong Kong": "香港",
  Hotan: "新疆",
  "Huaian": "江苏",
  "Huai'an": "江苏",
  Huaibei: "安徽",
  Huaihua: "湖南",
  Huangshan: "安徽",
  Huangshi: "湖北",
  Huizhou: "广东",
  Huludao: "辽宁",
  Hulunbuir: "内蒙古",
  Huzhou: "浙江",
  Ili: "新疆",
  "Ji'an": "江西",
  Jiaxing: "浙江",
  "Jiaxing City": "浙江",
  Jiangmen: "广东",
  Jiangyin: "江苏",
  Jieyang: "广东",
  Jilin: "吉林",
  Jinan: "山东",
  "Ji'nan": "山东",
  Jincheng: "山西",
  Jingdezhen: "江西",
  "JIngdezhen": "江西",
  Jinghong: "云南",
  "Jing Hong": "云南",
  Jingzhou: "湖北",
  Jinhua: "浙江",
  Jinjiang: "福建",
  Jining: "山东",
  Jinzhong: "山西",
  jinzhong: "山西",
  Jinzhou: "辽宁",
  Jiujiang: "江西",
  Jiuzhaigou: "四川",
  Kaifeng: "河南",
  Kaili: "贵州",
  Karamay: "新疆",
  Kashgar: "新疆",
  "Kashgar Region": "新疆",
  Kashi: "新疆",
  Korla: "新疆",
  Kunming: "云南",
  Kunshan: "江苏",
  Laiwu: "山东",
  Langfang: "河北",
  Lanzhou: "甘肃",
  Leshan: "四川",
  Lhasa: "西藏",
  Liuzhou: "广西",
  Lianyungang: "江苏",
  Liaocheng: "山东",
  Lijiang: "云南",
  "Li Jiang": "云南",
  Lingshui: "海南",
  Linxia: "甘肃",
  Linzhi: "西藏",
  Linyi: "山东",
  Lishui: "浙江",
  Liupanshui: "贵州",
  Longnan: "甘肃",
  "Lu'an": "安徽",
  Lufeng: "广东",
  Luoyang: "河南",
  luoyang: "河南",
  Lvliang: "山西",
  Macau: "澳门",
  "Ma'anshan": "安徽",
  Maoming: "广东",
  Meishan: "四川",
  Meizhou: "广东",
  Mengzi: "云南",
  Mianyang: "四川",
  Mile: "云南",
  Nanchang: "江西",
  Nanchong: "四川",
  Nanjing: "江苏",
  Nanning: "广西",
  Nantong: "江苏",
  "Nantong Rugao": "江苏",
  Nanyang: "河南",
  Ningbo: "浙江",
  Ningde: "福建",
  Ningguo: "安徽",
  Nujiang: "云南",
  Nyingchi: "西藏",
  "Nyingchi City": "西藏",
  Ordos: "内蒙古",
  Panzhihua: "四川",
  Qidong: "江苏",
  Qingdao: "山东",
  Qingyuan: "广东",
  Qinhuangdao: "河北",
  Qiongzhong: "海南",
  Quanzhou: "福建",
  Qujing: "云南",
  Quzhou: "浙江",
  Rizhao: "山东",
  Sanya: "海南",
  Shaoguan: "广东",
  Shannan: "西藏",
  Shanghai: "上海",
  Shangrao: "江西",
  Shantou: "广东",
  Shanwei: "广东",
  Shaoxing: "浙江",
  Shenyang: "辽宁",
  Shenzhen: "广东",
  Shijiazhuang: "河北",
  Shiyan: "湖北",
  Suqian: "江苏",
  Suzhou: "江苏",
  "Tai'an": "山东",
  Taiyuan: "山西",
  Taizhou: "浙江",
  Tangshan: "河北",
  "Teda, Tianjin": "天津",
  Ulanqab: "内蒙古",
  Urumqi: "新疆",
  Wanning: "海南",
  Weifang: "山东",
  Weihai: "山东",
  Wenzhou: "浙江",
  Wuhan: "湖北",
  Wuhu: "安徽",
  Wuxi: "江苏",
  Xiangyang: "湖北",
  Xiamen: "福建",
  "Xi'an": "陕西",
  "Xi’an": "陕西",
  Xingtai: "河北",
  Xingyi: "贵州",
  Xining: "青海",
  Xinyang: "河南",
  Xuancheng: "安徽",
  Xuzhou: "江苏",
  "Ya'an": "四川",
  Yancheng: "江苏",
  Yangzhou: "江苏",
  Yanji: "吉林",
  Yantai: "山东",
  Yibin: "四川",
  Yinchuan: "宁夏",
  Yining: "新疆",
  Yixing: "江苏",
  Yulin: "陕西",
  Yuncheng: "山西",
  Yuxi: "云南",
  Zaozhuang: "山东",
  Zhangjiajie: "湖南",
  Zhangjiakou: "河北",
  Zhanjiang: "广东",
  Zhengzhou: "河南",
  Zhongshan: "广东",
  Zhongwei: "宁夏",
  Zhoushan: "浙江",
  Zhoukou: "河南",
  Zhuhai: "广东",
  Zhuzhou: "湖南",
  Zibo: "山东",
  Zigong: "四川",
  上海: "上海",
  北京: "北京",
  天津: "天津",
  重庆: "重庆",
  深圳: "广东",
  广州: "广东",
  杭州: "浙江",
  苏州: "江苏",
  成都: "四川",
  南京: "江苏",
  厦门: "福建",
  三亚: "海南",
  武汉: "湖北",
  西安: "陕西",
  长沙: "湖南",
  宁波: "浙江",
  青岛: "山东",
  昆明: "云南",
  佛山: "广东",
  珠海: "广东",
  福州: "福建",
  大连: "辽宁",
  沈阳: "辽宁",
  济南: "山东",
  哈尔滨: "黑龙江",
  合肥: "安徽",
  贵阳: "贵州",
  郑州: "河南",
  南昌: "江西",
  南宁: "广西",
  海口: "海南",
  太原: "山西",
  长春: "吉林",
  香港: "香港",
  澳门: "澳门",
};

const genericProvinceNames = new Set(["CN", "MAINLAND_CN", "中国", "中国大陆", "Greater China", "Mainland China"]);
const directCityProvinceNames = new Set(["上海", "北京", "天津", "重庆", "香港", "澳门"]);

const rateSnapshot = JSON.parse(readFileSync(rateSnapshotPath, "utf8"));
const ratesByKey = new Map((rateSnapshot.rates ?? []).map((row) => [row.hotelKey, row]));
const nameOverrides = loadNameOverrides();
const lhwImagesByKey = loadLhwImageRecords();
const sourceHotels = loadSourceHotels();
const hotels = sourceHotels.map(mapHotel).filter(Boolean).sort(compareHotels);
assertCompleteHotelNames(hotels);
const provinceOptions = buildProvinceOptions(hotels);
const cityOptions = buildCityOptions(hotels);
const chainOptions = buildChainOptions(hotels);
const brandOptions = buildBrandOptions(hotels);

mkdirSync(publicDir, { recursive: true });
writeFileSync(
  outputPath,
  `${JSON.stringify(
    {
      source: "hotel-official-rate-window-snapshots",
      generatedAt: new Date().toISOString(),
      rateWindowStartDate: rateSnapshot.metadata?.rate_window_start_date ?? null,
      rateWindowEndDate: rateSnapshot.metadata?.rate_window_end_date ?? null,
      count: hotels.length,
      provinces: provinceOptions,
      cities: cityOptions,
      chains: chainOptions,
      brands: brandOptions,
      hotels,
    },
    null,
    2,
  )}\n`,
);

console.log(`Wrote ${hotels.length} hotels to ${outputPath}`);
console.log(`Province count: ${provinceOptions.length}`);

function loadSourceHotels() {
  const records = [];
  for (const file of hotelSourceFiles) {
    const payload = JSON.parse(readFileSync(join(outputDir, file), "utf8"));
    const hotels = Array.isArray(payload) ? payload : payload.hotels;
    if (!Array.isArray(hotels)) throw new Error(`No hotel array in ${file}`);
    for (const hotel of hotels) records.push({ ...hotel, sourceFile: file });
  }

  const seen = new Set();
  return records.filter((hotel) => {
    const key = hotelKey(hotel);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function loadNameOverrides() {
  try {
    const payload = JSON.parse(readFileSync(nameOverridesPath, "utf8"));
    return new Map(Object.entries(payload.overrides ?? {}));
  } catch (error) {
    if (error.code === "ENOENT") return new Map();
    throw error;
  }
}

function loadLhwImageRecords() {
  if (!existsSync(lhwImagesPath)) return new Map();
  const payload = JSON.parse(readFileSync(lhwImagesPath, "utf8"));
  const records = Array.isArray(payload.hotels) ? payload.hotels : [];
  return new Map(records.map((record) => [hotelKey(record), record]));
}

function mapHotel(hotel) {
  const key = hotelKey(hotel);
  const nameOverride = nameOverrides.get(key) ?? {};
  const rate = ratesByKey.get(key);
  const media = buildHotelMedia(hotel, lhwImagesByKey.get(key));
  const provinceName = resolveProvinceName(hotel);
  const provinceCode = provinceCodeByName[provinceName] ?? slugify(provinceName);
  const cityName = cleanText(hotel.city_zh) || cleanText(hotel.city_en) || provinceName;
  const cityCode = cityCodeFor(provinceName, cityName);
  const longitude = numberOrNull(hotel.longitude);
  const latitude = numberOrNull(hotel.latitude);
  const position = Number.isFinite(longitude) && Number.isFinite(latitude) ? [longitude, latitude] : undefined;
  const chain = normalizeChainName(hotel.chain);
  const chainEn = chainLabels[chain]?.en ?? chain;
  const chainZh = cleanText(hotel.chain_zh) || chainLabels[chain]?.zh || "";
  const brandZh = cleanText(hotel.brand_zh);
  const brandEn = cleanText(hotel.brand_en);
  const brand = brandZh || brandEn || chain;
  const originalNameZh = cleanText(hotel.name_zh);
  const originalNameEn = cleanText(hotel.name_en);
  const resolvedNameZh = resolveChineseHotelName({
    brandEn,
    brandZh,
    chain,
    cityName,
    hotel,
    nameEn: originalNameEn,
    nameOverride,
    originalNameZh,
  });
  const resolvedNameEn = resolveEnglishHotelName({ hotel, nameOverride, originalNameEn });
  const nameZh = resolvedNameZh.value;
  const nameEn = resolvedNameEn.value;
  const displayName = nameZh || nameEn;
  const addressZh = cleanText(hotel.address1_zh);
  const addressEn = cleanText(hotel.address1_en);
  const taxInclusiveAverageRate = numberOrNull(
    rate?.taxInclusiveAverageRateLocal ?? rate?.windowAverageRateLocal,
  );
  const preTaxAverageRate = numberOrNull(
    rate?.preTaxAverageRateLocal ?? rate?.windowPreTaxAverageRateLocal ?? rate?.currentOfficialLeadRateLocal,
  );
  const estimatedTaxInclusiveAverageRate = taxInclusiveAverageRate ?? (
    preTaxAverageRate !== null ? Math.round(preTaxAverageRate * 1.16) : null
  );
  const taxEstimateUsed = Boolean(rate?.taxEstimateUsed) || (taxInclusiveAverageRate === null && preTaxAverageRate !== null);
  if (!displayName) return null;

  return stripUndefined({
    id: key,
    hotelKey: key,
    spiritCode: hotel.spiritCode,
    name: displayName,
    nameZh,
    nameEn,
    nameZhSource: resolvedNameZh.source,
    nameEnSource: resolvedNameEn.source,
    hasOfficialChineseName: resolvedNameZh.source !== "generated",
    chain,
    chainZh,
    chainEn,
    brand,
    brandValue: brandValueFor(chain, hotel.brandKey, brandZh || brandEn || brand),
    brandZh,
    brandEn,
    city: cityCode,
    province: provinceCode,
    provinceName,
    provinceNameZh: provinceName,
    provinceNameEn: cleanText(hotel.province_en) || provinceEnglishByName[provinceName] || "",
    cityName,
    cityNameZh: cleanText(hotel.city_zh) || cityName,
    cityNameEn: cleanText(hotel.city_en),
    countryCode: hotel.countryCode,
    position,
    positionSource: position ? "official" : "missing",
    positionConfirmed: Boolean(position),
    address: addressZh || addressEn || undefined,
    addressZh,
    addressEn,
    rateStatus: rate?.rateStatus ?? "not_fetched",
    officialDynamicRateAvailable: Boolean(rate?.officialDynamicRateAvailable),
    averageRateLocal: estimatedTaxInclusiveAverageRate ?? undefined,
    averageRateCurrency: rate?.officialDynamicAverageCurrency ?? undefined,
    averageRateTaxInclusiveLocal: estimatedTaxInclusiveAverageRate ?? undefined,
    averageRatePreTaxLocal: preTaxAverageRate ?? undefined,
    averageRateTaxEstimateUsed: taxEstimateUsed,
    averageRateBasis: estimatedTaxInclusiveAverageRate !== null
      ? taxEstimateUsed
        ? "tax_inclusive_estimate"
        : "tax_inclusive"
      : "missing",
    descriptionZh: media.descriptionZh,
    descriptionEn: media.descriptionEn,
    descriptionSource: media.descriptionSource,
    hotelImageUrl: media.hotelImageUrl,
    hotelImageAlt: media.hotelImageAlt,
    hotelImageSource: media.hotelImageSource,
    standardRoomName: media.standardRoomName,
    standardRoomImageUrl: media.standardRoomImageUrl,
    standardRoomAreaSqm: media.standardRoomAreaSqm,
    standardRoomSourceUrl: media.standardRoomSourceUrl,
    suiteRoomName: media.suiteRoomName,
    suiteRoomImageUrl: media.suiteRoomImageUrl,
    suiteRoomAreaSqm: media.suiteRoomAreaSqm,
    suiteRoomSourceUrl: media.suiteRoomSourceUrl,
    sourceUrl: resolveSourceUrl(hotel),
  });
}

function resolveSourceUrl(hotel) {
  const zhUrl = cleanText(hotel.propertySiteURL_zh);
  const enUrl = cleanText(hotel.propertySiteURL_en);
  if (zhUrl && !/lhw\.cn\/domestic\/?$/i.test(zhUrl)) return zhUrl;
  return enUrl || zhUrl || undefined;
}

function buildHotelMedia(hotel, lhwImages) {
  const firstThumbnail = firstImageUrl(hotel.thumbnails) || cleanText(hotel.thumbnailUrl) || cleanText(hotel.imageUrl);
  const hotelImage = lhwImages?.coverImage?.cachedPath || lhwImages?.coverImage?.url || firstThumbnail;
  const standardRoom =
    lhwImages?.standardRoom && !/suite|套房|villa|别墅/i.test(imageText(lhwImages.standardRoom.image) || lhwImages.standardRoom.name || "")
      ? lhwImages.standardRoom
      : displayRoomFromLhwBase(lhwImages?.baseRoom);
  const suiteRoom = lhwImages?.suiteRoom || chooseSuiteRoomFromLhwBase(lhwImages?.baseRoom, hotel.propertySiteURL_en);
  const descriptionZh = cleanText(hotel.description_zh);
  const descriptionEn =
    cleanText(lhwImages?.description?.text) ||
    cleanText(hotel.description_en) ||
    cleanText(hotel.raw_en?.item?.description) ||
    cleanText(hotel.raw_en?.description);

  return {
    descriptionZh: descriptionZh || undefined,
    descriptionEn: descriptionEn || undefined,
    descriptionSource: lhwImages?.description?.source || (descriptionZh || descriptionEn ? "official_source" : undefined),
    hotelImageUrl: hotelImage || undefined,
    hotelImageAlt: lhwImages?.coverImage?.alt || lhwImages?.ogImage?.alt || hotel.name_en || undefined,
    hotelImageSource: lhwImages?.coverImage?.source || (firstThumbnail ? "official_thumbnail" : undefined),
    standardRoomName: cleanText(standardRoom?.name) || undefined,
    standardRoomImageUrl: cleanText(standardRoom?.image?.cachedPath) || cleanText(standardRoom?.image?.url) || undefined,
    standardRoomAreaSqm: numberOrNull(standardRoom?.areaSqm) ?? undefined,
    standardRoomSourceUrl: cleanText(standardRoom?.sourceUrl) || undefined,
    suiteRoomName: cleanText(suiteRoom?.name) || undefined,
    suiteRoomImageUrl: cleanText(suiteRoom?.image?.cachedPath) || cleanText(suiteRoom?.image?.url) || undefined,
    suiteRoomAreaSqm: numberOrNull(suiteRoom?.areaSqm) ?? undefined,
    suiteRoomSourceUrl: cleanText(suiteRoom?.sourceUrl) || undefined,
  };
}

function displayRoomFromLhwBase(baseRoom) {
  if (!baseRoom) return null;
  const standardImage = baseRoom.roomImageCandidates?.find((candidate) => !/suite|套房|villa|别墅/i.test(imageText(candidate)));
  if (standardImage) {
    const roomCode = extractRoomCodeFromImage(standardImage.url);
    return {
      name: standardImage.alt || standardImage.caption || null,
      areaSqm: extractAreaSqm(imageText(standardImage)),
      sourceUrl: roomCode && baseRoom.sourceUrl ? roomUrlFor(baseRoom.sourceUrl.replace(/\/rooms(?:\?.*)?$/i, ""), roomCode) : baseRoom.sourceUrl,
      image: standardImage,
    };
  }
  const image = baseRoom.bedroomImage || baseRoom.representativeImage || baseRoom.officialGalleryImages?.[0] || baseRoom.roomImageCandidates?.[0] || null;
  return {
    name: baseRoom.name || image?.alt || null,
    areaSqm: extractAreaSqm([baseRoom.name, image?.alt, image?.caption].filter(Boolean).join(" ")),
    sourceUrl: baseRoom.sourceUrl,
    image,
  };
}

function chooseSuiteRoomFromLhwBase(baseRoom, sourceUrl) {
  const candidates = baseRoom?.roomImageCandidates ?? [];
  const standardRoomCode = baseRoom?.roomCode ?? null;
  const suiteImage =
    candidates.find((candidate) => /suite|套房/i.test(imageText(candidate)) && extractRoomCodeFromImage(candidate.url) !== standardRoomCode) ||
    candidates.find((candidate) => /villa|别墅/i.test(imageText(candidate)) && extractRoomCodeFromImage(candidate.url) !== standardRoomCode);
  if (!suiteImage) return null;
  const roomCode = extractRoomCodeFromImage(suiteImage.url);
  return {
    name: suiteImage.alt || suiteImage.caption || null,
    areaSqm: extractAreaSqm(imageText(suiteImage)),
    sourceUrl: roomCode && sourceUrl ? roomUrlFor(sourceUrl, roomCode) : null,
    image: suiteImage,
  };
}

function firstImageUrl(values) {
  if (!Array.isArray(values)) return null;
  return values.map(cleanText).find(Boolean) ?? null;
}

function imageText(image) {
  return [image?.url, image?.alt, image?.title, image?.caption, image?.nearText, image?.className].filter(Boolean).join(" ");
}

function extractRoomCodeFromImage(url) {
  const text = String(url ?? "");
  const match = text.match(/room_[^/]+?_([A-Z0-9]+)_\d+_/i);
  return match?.[1] ?? null;
}

function roomUrlFor(sourceUrl, roomCode) {
  const roomsUrl = new URL(sourceUrl);
  roomsUrl.pathname = `${roomsUrl.pathname.replace(/\/$/, "")}/rooms`;
  roomsUrl.search = "";
  roomsUrl.searchParams.set("rnum", roomCode);
  return roomsUrl.href;
}

function extractAreaSqm(value) {
  const text = String(value ?? "");
  const sqm = text.match(/(\d+(?:\.\d+)?)\s*(?:sqm|sq m|m2|m²)/i);
  if (sqm) return Math.round(Number(sqm[1]) * 10) / 10;
  const sqft = text.match(/(\d+(?:\.\d+)?)\s*(?:sqf|sq ft|sqft|ft²)/i);
  return sqft ? Math.round(Number(sqft[1]) * 0.92903) / 10 : null;
}

function hotelKey(hotel) {
  return `${hotel.chain}:${hotel.spiritCode}`;
}

function resolveChineseHotelName({
  brandEn,
  brandZh,
  chain,
  cityName,
  hotel,
  nameEn,
  nameOverride,
  originalNameZh,
}) {
  if (hasHan(originalNameZh)) return { value: originalNameZh, source: "official" };

  const overrideName = cleanText(nameOverride.name_zh);
  if (hasHan(overrideName)) return { value: overrideName, source: cleanText(nameOverride.source) || "override" };

  return {
    value: generateChineseHotelName({ brandEn, brandZh, chain, cityName, hotel, nameEn }),
    source: "generated",
  };
}

function resolveEnglishHotelName({ hotel, nameOverride, originalNameEn }) {
  if (hasLatin(originalNameEn)) return { value: originalNameEn, source: "official" };

  const overrideName = cleanText(nameOverride.name_en);
  if (hasLatin(overrideName)) return { value: overrideName, source: cleanText(nameOverride.source) || "override" };

  const queryName = extractQueryParam(cleanText(hotel.propertySiteURL_zh), "hotel");
  if (hasLatin(queryName)) return { value: queryName, source: "official_url_query" };

  const slugName = titleCaseFromSlug(lastMeaningfulPathSegment(cleanText(hotel.propertySiteURL_en) || cleanText(hotel.propertySiteURL_zh)));
  if (hasLatin(slugName)) return { value: slugName, source: "url_slug" };

  return { value: originalNameEn, source: "missing" };
}

function generateChineseHotelName({ brandEn, brandZh, chain, cityName, hotel, nameEn }) {
  const city = cleanText(cityName);
  const suffix = chineseBrandSuffix(chain, brandZh, brandEn);
  const descriptor = chineseDescriptorFromEnglishName(nameEn, hotel, suffix);
  return [city, descriptor, suffix].filter(Boolean).join("");
}

function chineseBrandSuffix(chain, brandZh, brandEn) {
  const explicit = {
    "Atwell Suites": "Atwell Suites酒店",
    "Canopy by Hilton": "希尔顿嘉悦里酒店",
    "Conrad Hotels & Resorts": "康莱德酒店",
    "Crowne Plaza": "皇冠假日酒店",
    "Curio Collection by Hilton": "希尔顿格芮精选酒店",
    "DoubleTree by Hilton": "希尔顿逸林酒店",
    "EVEN Hotel": "逸衡酒店",
    "Garner Hotel": "Garner酒店",
    "Hampton by Hilton": "希尔顿欢朋酒店",
    "Hilton Garden Inn": "希尔顿花园酒店",
    "Hilton Hotels & Resorts": "希尔顿酒店",
    "Holiday Inn": "假日酒店",
    "Holiday Inn & Suites": "假日套房酒店",
    "Holiday Inn Express": "智选假日酒店",
    "Holiday Inn Resort": "假日度假酒店",
    "Home2 Suites by Hilton": "希尔顿惠庭酒店",
    HUALUXE: "华邑酒店",
    "Hotel Indigo": "英迪格酒店",
    InterContinental: "洲际酒店",
    Kimpton: "金普顿酒店",
    "Motto by Hilton": "希尔顿Motto酒店",
    Regent: "丽晶酒店",
    "Signia by Hilton": "希尔顿Signia酒店",
    "Tapestry by Hilton": "希尔顿启缤精选酒店",
    "Vignette Collection": "Vignette Collection酒店",
    voco: "voco酒店",
    "Waldorf Astoria": "华尔道夫酒店",
  };
  if (explicit[brandEn]) return explicit[brandEn];
  if (chain === "Hilton" && brandZh) return `${brandZh.replace(/酒店及度假村$/, "")}酒店`;
  if (brandZh) return brandZh;
  return "酒店";
}

function chineseDescriptorFromEnglishName(nameEn, hotel, suffix) {
  const cityEn = cleanText(hotel.city_en);
  const brandEn = cleanText(hotel.brand_en);
  const raw = cleanText(nameEn);
  let descriptor = raw
    .replace(new RegExp(`^${escapeRegExp(brandEn)}\\s+`, "i"), "")
    .replace(new RegExp(`\\s+${escapeRegExp(cityEn)}$`, "i"), "")
    .replace(new RegExp(`^${escapeRegExp(cityEn)}\\s+`, "i"), "")
    .replace(/\s+an SLH Hotel$/i, "")
    .trim();

  descriptor = descriptor
    .replace(/\bHong Kong\b/gi, "香港")
    .replace(/\bMacau\b|\bMacao\b/gi, "澳门")
    .replace(/\bTaipei\b/gi, "台北")
    .replace(/\bShanghai\b/gi, "上海")
    .replace(/\bBeijing\b/gi, "北京")
    .replace(/\bGuangzhou\b/gi, "广州")
    .replace(/\bShenzhen\b/gi, "深圳")
    .replace(/\bHangzhou\b/gi, "杭州")
    .replace(/\bChengdu\b/gi, "成都")
    .replace(/\bAirport\b/gi, "机场")
    .replace(/\bRailway Station\b/gi, "火车站")
    .replace(/\bHigh-Speed\b/gi, "高铁")
    .replace(/\bNECC\b/g, "国家会展中心")
    .replace(/\bHi-Tech\b/gi, "高科")
    .replace(/\bTechnology\b/gi, "科技")
    .replace(/\bInnovation\b/gi, "创新")
    .replace(/\bPark\b/gi, "园")
    .replace(/\bPlaza\b/gi, "广场")
    .replace(/\bCenter\b|\bCentre\b/gi, "中心")
    .replace(/\bResort\b/gi, "度假")
    .replace(/\bLake\b/gi, "湖")
    .replace(/\bBay\b/gi, "湾")
    .replace(/\bBund\b/gi, "外滩")
    .replace(/\bNorth\b/gi, "北")
    .replace(/\bSouth\b/gi, "南")
    .replace(/\bEast\b/gi, "东")
    .replace(/\bWest\b/gi, "西")
    .replace(/\bNew\b/gi, "新")
    .replace(/\bOld\b/gi, "老")
    .replace(/\bRoad\b/gi, "路")
    .replace(/\bStreet\b/gi, "街")
    .replace(/\s+/g, "");

  if (!descriptor || descriptor === cleanText(hotel.city_zh) || descriptor === suffix) return "";
  return descriptor;
}

function assertCompleteHotelNames(hotels) {
  const missing = hotels
    .filter((hotel) => !hasHan(hotel.nameZh) || !hasLatin(hotel.nameEn))
    .map((hotel) => ({ hotelKey: hotel.hotelKey, nameZh: hotel.nameZh, nameEn: hotel.nameEn }));

  if (missing.length) {
    throw new Error(
      `Hotel names must include Chinese and English names. Missing ${missing.length}: ${JSON.stringify(missing.slice(0, 20))}`,
    );
  }
}

function resolveProvinceName(hotel) {
  if (hotel.countryCode === "HK") return "香港";
  if (hotel.countryCode === "MO") return "澳门";
  if (hotel.countryCode === "TW") return "台湾";

  const directProvince = cleanText(hotel.province_zh);
  if (directProvince && !genericProvinceNames.has(directProvince)) return normalizeProvinceName(directProvince);

  const englishProvince = cleanText(hotel.province_en);
  if (englishProvince && provinceByEnglishName[englishProvince]) return provinceByEnglishName[englishProvince];

  const cityCandidates = [
    cleanText(hotel.city_zh),
    cleanText(hotel.city_en),
    cleanText(hotel.raw_en?.item?.address?.addressLocality),
    cleanText(hotel.raw_en?.item?.address?.addressRegion),
  ].filter(Boolean);
  for (const city of cityCandidates) {
    if (cityProvince[city]) return cityProvince[city];
  }

  return "中国大陆";
}

function normalizeProvinceName(value) {
  return value
    .replace(/（直辖市）$/, "")
    .replace(/\s*-\s*municipality$/i, "")
    .replace(/特别行政区$/, "")
    .replace(/壮族自治区$/, "")
    .replace(/回族自治区$/, "")
    .replace(/维吾尔自治区$/, "")
    .replace(/自治区$/, "")
    .replace(/省$/, "")
    .replace(/市$/, "");
}

function normalizeChainName(value) {
  if (String(value).toLowerCase() === "hyatt") return "Hyatt";
  return value;
}

function buildProvinceOptions(hotels) {
  const counts = hotels.reduce((acc, hotel) => {
    acc.set(hotel.provinceName, (acc.get(hotel.provinceName) ?? 0) + 1);
    return acc;
  }, new Map());

  return [...counts.entries()]
    .map(([name, count]) => ({
      value: provinceCodeByName[name] ?? slugify(name),
      label: name,
      provinceName: name,
      center: provinceCenters[name] ?? provinceCenters["中国大陆"],
      mapZoom: name === "上海" ? 12.45 : 7.4,
      offlineScale: name === "上海" ? 1450 : 420,
      count,
    }))
    .sort((left, right) => provinceRank(left.provinceName) - provinceRank(right.provinceName) || left.label.localeCompare(right.label, "zh-Hans-CN"));
}

function buildCityOptions(hotels) {
  const groups = hotels.reduce((acc, hotel) => {
    const displayCityName = directCityProvinceNames.has(hotel.provinceName)
      ? hotel.provinceName
      : hotel.cityName;
    const existing = acc.get(hotel.city) ?? {
      value: hotel.city,
      label: displayCityName,
      cityName: displayCityName,
      provinceName: hotel.provinceName,
      province: hotel.provinceName,
      country: countryLabelFor(hotel.countryCode),
      amapCity: displayCityName,
      count: 0,
      positions: [],
    };

    existing.count += 1;
    if (hotel.position) existing.positions.push(hotel.position);
    acc.set(hotel.city, existing);
    return acc;
  }, new Map());

  return [...groups.values()]
    .map((city) => {
      const center = city.positions.length
        ? averageCoordinate(city.positions)
        : provinceCenters[city.provinceName] ?? provinceCenters["中国大陆"];

      return {
        value: city.value,
        label: city.label,
        cityName: city.cityName,
        province: city.province,
        provinceName: city.provinceName,
        country: city.country,
        amapCity: city.amapCity,
        center,
        mapZoom: city.value === "shanghai" ? 12.45 : 11.2,
        offlineScale: city.value === "shanghai" ? 1450 : 820,
        count: city.count,
      };
    })
    .sort((left, right) => {
      const provinceDelta = provinceRank(left.provinceName) - provinceRank(right.provinceName);
      if (provinceDelta !== 0) return provinceDelta;
      return left.label.localeCompare(right.label, "zh-Hans-CN");
    });
}

function buildChainOptions(hotels) {
  const groups = hotels.reduce((acc, hotel) => {
    const existing = acc.get(hotel.chain) ?? {
      value: hotel.chain,
      label: hotel.chainZh || hotel.chainEn || hotel.chain,
      labelZh: hotel.chainZh,
      labelEn: hotel.chainEn || hotel.chain,
      count: 0,
    };
    existing.count += 1;
    if (!existing.labelZh && hotel.chainZh) existing.labelZh = hotel.chainZh;
    if (!existing.labelEn && hotel.chainEn) existing.labelEn = hotel.chainEn;
    existing.label = existing.labelZh || existing.labelEn || existing.value;
    acc.set(hotel.chain, existing);
    return acc;
  }, new Map());

  return [...groups.values()]
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function buildBrandOptions(hotels) {
  const brands = hotels.reduce((acc, hotel) => {
    const existing = acc.get(hotel.brandValue) ?? {
      value: hotel.brandValue,
      label: hotel.brand,
      labelZh: hotel.brandZh,
      labelEn: hotel.brandEn,
      count: 0,
      chain: hotel.chain,
    };

    existing.count += 1;
    if (!existing.labelZh && hotel.brandZh) existing.labelZh = hotel.brandZh;
    if (!existing.labelEn && hotel.brandEn) existing.labelEn = hotel.brandEn;
    existing.label = existing.labelZh || existing.labelEn || existing.label;
    acc.set(hotel.brandValue, existing);
    return acc;
  }, new Map());

  return [...brands.values()].sort(
    (left, right) =>
      left.chain.localeCompare(right.chain) ||
      right.count - left.count ||
      left.label.localeCompare(right.label, "zh-Hans-CN"),
  );
}

function compareHotels(left, right) {
  const provinceDelta = provinceRank(left.provinceName) - provinceRank(right.provinceName);
  if (provinceDelta !== 0) return provinceDelta;
  const cityDelta = left.cityName.localeCompare(right.cityName, "zh-Hans-CN");
  if (cityDelta !== 0) return cityDelta;
  return left.name.localeCompare(right.name, "zh-Hans-CN");
}

function provinceRank(name) {
  const index = provinceOrder.indexOf(name);
  return index === -1 ? 999 : index;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cityCodeFor(provinceName, cityName) {
  const provinceCode = provinceCodeByName[provinceName] ?? slugify(provinceName);
  if (directCityProvinceNames.has(provinceName)) return provinceCode;
  if (cityName === provinceName) return provinceCode;
  return `${provinceCode}-${slugify(cityName)}`;
}

function brandValueFor(chain, brandKey, brandName) {
  return `${slugify(chain)}:${slugify(cleanText(brandKey) || brandName || chain)}`;
}

function countryLabelFor(countryCode) {
  if (countryCode === "HK") return "中国香港";
  if (countryCode === "MO") return "中国澳门";
  if (countryCode === "TW") return "中国台湾";
  return "中国";
}

function averageCoordinate(positions) {
  const [lngSum, latSum] = positions.reduce(
    ([lngAcc, latAcc], [lng, lat]) => [lngAcc + lng, latAcc + lat],
    [0, 0],
  );

  return [lngSum / positions.length, latSum / positions.length];
}

function cleanText(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function hasHan(value) {
  return /[\u3400-\u9fff]/u.test(String(value ?? ""));
}

function hasLatin(value) {
  return /[A-Za-z]/.test(String(value ?? ""));
}

function extractQueryParam(url, paramName) {
  try {
    return cleanText(new URL(url).searchParams.get(paramName));
  } catch {
    return "";
  }
}

function lastMeaningfulPathSegment(url) {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    return segments.reverse().find((segment) => !["overview", "hoteldetail", "pre-opening"].includes(segment)) ?? "";
  } catch {
    return "";
  }
}

function titleCaseFromSlug(value) {
  return cleanText(value)
    .replace(/\.[a-z]+$/i, "")
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stripUndefined(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}
