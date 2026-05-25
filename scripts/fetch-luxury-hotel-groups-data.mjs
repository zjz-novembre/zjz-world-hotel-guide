import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { hotelSourceDir } from "./paths.mjs";

const outputDir = hotelSourceDir;
const outputJsonPath = join(outputDir, "luxury-hotel-groups-greater-china-official-hotels.json");
const outputCsvPath = join(outputDir, "luxury-hotel-groups-greater-china-official-hotels.csv");
const outputSummaryPath = join(outputDir, "luxury-hotel-groups-greater-china-official-hotels-summary.md");

const fetchedAt = new Date().toISOString();
const usage = "personal_noncommercial_low_frequency";
const userAgent = "michelin-list-personal-research/0.1 (+low-frequency official hotel list collection)";

const hotelKeys = [
  "chain",
  "source",
  "official_locale_primary",
  "official_locale_secondary",
  "spiritCode",
  "name_en",
  "name_zh",
  "brand_en",
  "brand_zh",
  "brandKey",
  "hotelStatus",
  "propertyType",
  "gpCategory",
  "city_en",
  "city_zh",
  "province_en",
  "province_zh",
  "region_en",
  "region_zh",
  "regionCode",
  "subRegionCode",
  "subRegionLabel_en",
  "subRegionLabel_zh",
  "country_en",
  "country_zh",
  "countryCode",
  "countryDisplay_en",
  "countryDisplay_zh",
  "address1_en",
  "address1_zh",
  "zipcode",
  "latitude",
  "longitude",
  "phone",
  "email",
  "propertySiteURL_en",
  "propertySiteURL_zh",
  "externalBookingURL_en",
  "externalBookingURL_zh",
  "bookableDate",
  "openDate",
  "checkinTime",
  "checkoutTime",
  "nonSmoking",
  "excludeFromBrandFilter",
  "showBrandLogo",
  "suppressBrandLogo",
  "description_en",
  "description_zh",
  "amenities_en",
  "amenities_zh",
  "amenityKeys",
  "characteristics_en",
  "characteristics_zh",
  "thumbnails",
  "brandlogo",
  "flag",
  "verifiedRating",
  "verifiedNumReviews",
  "lastRenovationDate",
  "raw_en",
  "raw_zh",
];

const csvColumns = [
  "spiritCode",
  "name_en",
  "name_zh",
  "brand_en",
  "brand_zh",
  "brandKey",
  "hotelStatus",
  "propertyType",
  "gpCategory",
  "city_en",
  "city_zh",
  "province_en",
  "province_zh",
  "address1_en",
  "address1_zh",
  "zipcode",
  "latitude",
  "longitude",
  "phone",
  "propertySiteURL_en",
  "propertySiteURL_zh",
  "bookableDate",
  "openDate",
  "checkinTime",
  "checkoutTime",
  "nonSmoking",
];

const sourceUrls = {
  lhw: "https://www.lhw.com/find-a-hotel/browse-by-list/hotels-in-asia",
  lhwCnDomestic: "https://www.lhw.cn/domestic",
  slhChina: "https://slh.com/api/slh/hotelsearchresults/gethotelsearchresults?query=China&pageIndex=0",
  slhTaiwan: "https://slh.com/api/slh/hotelsearchresults/gethotelsearchresults?query=Taiwan&pageIndex=0",
  slhBrowseChina: "https://slh.com/asia/china",
  fourSeasonsChina: "https://www.fourseasons.com/china/",
  amanChina: "https://www.aman.com/destinations/country/china",
  shangriLaFind: "https://www.shangri-la.com/cn/find-a-hotel/",
  mandarinSitemap: "https://www.mandarinoriental.com/sitemap-en.xml",
  rosewoodSitemap: "https://www.rosewoodhotels.com/sitemap-en.xml",
  peninsulaBeijing: "https://www.peninsula.com/en/beijing/5-star-luxury-hotel-wangfujing",
  peninsulaShanghai: "https://www.peninsula.com/en/shanghai/5-star-luxury-hotel-bund",
  peninsulaHongKong: "https://www.peninsula.com/en/hong-kong/5-star-luxury-hotel-kowloon",
};

const chainOrder = new Map(
  [
    "The Leading Hotels of the World",
    "Small Luxury Hotels of the World",
    "Four Seasons",
    "Aman",
    "Shangri-La",
    "Mandarin Oriental",
    "Rosewood",
    "The Peninsula",
  ].map((chain, index) => [chain, index]),
);

const brandZh = {
  "The Leading Hotels of the World": "立鼎世酒店联盟",
  "Small Luxury Hotels of the World": "全球奢华精品酒店",
  "Four Seasons": "四季酒店",
  Aman: "安缦",
  "Shangri-La": "香格里拉",
  "JEN Hotels": "JEN 酒店",
  "Kerry Hotels": "嘉里酒店",
  "Traders Hotels": "盛贸酒店",
  "Mandarin Oriental": "文华东方",
  Rosewood: "瑰丽酒店",
  "The Peninsula": "半岛酒店",
};

const regionDefinitions = {
  MAINLAND_CN: {
    region_en: "Mainland China",
    region_zh: "中国大陆",
    country_en: "China",
    country_zh: "中国",
    countryCode: "CN",
    countryDisplay_en: "Mainland China",
    countryDisplay_zh: "中国大陆",
  },
  HK: {
    region_en: "Hong Kong",
    region_zh: "中国香港",
    country_en: "Hong Kong SAR China",
    country_zh: "中国香港",
    countryCode: "HK",
    countryDisplay_en: "Hong Kong",
    countryDisplay_zh: "中国香港",
  },
  MO: {
    region_en: "Macau",
    region_zh: "中国澳门",
    country_en: "Macau SAR China",
    country_zh: "中国澳门",
    countryCode: "MO",
    countryDisplay_en: "Macau",
    countryDisplay_zh: "中国澳门",
  },
  TW: {
    region_en: "Taiwan",
    region_zh: "中国台湾",
    country_en: "Taiwan",
    country_zh: "中国台湾",
    countryCode: "TW",
    countryDisplay_en: "Taiwan",
    countryDisplay_zh: "中国台湾",
  },
};

const cityMeta = {
  Anxi: ["安溪", "Fujian", "福建"],
  Baotou: ["包头", "Inner Mongolia", "内蒙古"],
  Beihai: ["北海", "Guangxi", "广西"],
  Beijing: ["北京", "Beijing", "北京"],
  Changchun: ["长春", "Jilin", "吉林"],
  Changzhou: ["常州", "Jiangsu", "江苏"],
  Chengdu: ["成都", "Sichuan", "四川"],
  Chongqing: ["重庆", "Chongqing", "重庆"],
  "Chibi City": ["赤壁", "Hubei", "湖北"],
  Dali: ["大理", "Yunnan", "云南"],
  Dalian: ["大连", "Liaoning", "辽宁"],
  Dunhuang: ["敦煌", "Gansu", "甘肃"],
  Fuzhou: ["福州", "Fujian", "福建"],
  Guangzhou: ["广州", "Guangdong", "广东"],
  Guilin: ["桂林", "Guangxi", "广西"],
  Guiyang: ["贵阳", "Guizhou", "贵州"],
  Hangzhou: ["杭州", "Zhejiang", "浙江"],
  Harbin: ["哈尔滨", "Heilongjiang", "黑龙江"],
  Hefei: ["合肥", "Anhui", "安徽"],
  "Hong Kong": ["香港", "Hong Kong", "香港"],
  Huhhot: ["呼和浩特", "Inner Mongolia", "内蒙古"],
  Jinan: ["济南", "Shandong", "山东"],
  Kunming: ["昆明", "Yunnan", "云南"],
  Lhasa: ["拉萨", "Tibet", "西藏"],
  Lijiang: ["丽江", "Yunnan", "云南"],
  Macau: ["澳门", "Macau", "澳门"],
  Manzhouli: ["满洲里", "Inner Mongolia", "内蒙古"],
  Miaoli: ["苗栗", "Taiwan", "台湾"],
  Nanchang: ["南昌", "Jiangxi", "江西"],
  Nanjing: ["南京", "Jiangsu", "江苏"],
  Nanning: ["南宁", "Guangxi", "广西"],
  Nantou: ["南投", "Taiwan", "台湾"],
  Nanzhao: ["南诏", "Yunnan", "云南"],
  Ningbo: ["宁波", "Zhejiang", "浙江"],
  Putian: ["莆田", "Fujian", "福建"],
  Penglai: ["蓬莱", "Shandong", "山东"],
  Qingdao: ["青岛", "Shandong", "山东"],
  Qinhuangdao: ["秦皇岛", "Hebei", "河北"],
  Quanzhou: ["泉州", "Fujian", "福建"],
  Qufu: ["曲阜", "Shandong", "山东"],
  Sanya: ["三亚", "Hainan", "海南"],
  Shanghai: ["上海", "Shanghai", "上海"],
  ShangriLa: ["香格里拉", "Yunnan", "云南"],
  Shaoxing: ["绍兴", "Zhejiang", "浙江"],
  Shenyang: ["沈阳", "Liaoning", "辽宁"],
  Shenzhen: ["深圳", "Guangdong", "广东"],
  Suzhou: ["苏州", "Jiangsu", "江苏"],
  Taipei: ["台北", "Taiwan", "台湾"],
  Tainan: ["台南", "Taiwan", "台湾"],
  Tangshan: ["唐山", "Hebei", "河北"],
  Tengchong: ["腾冲", "Yunnan", "云南"],
  Tianjin: ["天津", "Tianjin", "天津"],
  Wuhan: ["武汉", "Hubei", "湖北"],
  Wenzhou: ["温州", "Zhejiang", "浙江"],
  Xiamen: ["厦门", "Fujian", "福建"],
  Xian: ["西安", "Shaanxi", "陕西"],
  Yangzhou: ["扬州", "Jiangsu", "江苏"],
  YanTai: ["烟台", "Shandong", "山东"],
  Yiwu: ["义乌", "Zhejiang", "浙江"],
  Zhoushan: ["舟山", "Zhejiang", "浙江"],
};

const citySlugMap = {
  baotou: "Baotou",
  beihai: "Beihai",
  beijing: "Beijing",
  changchun: "Changchun",
  chengdu: "Chengdu",
  chibi: "Chibi City",
  chibicity: "Chibi City",
  chibi_city: "Chibi City",
  chongqing: "Chongqing",
  dalian: "Dalian",
  dali: "Dali",
  dunhuang: "Dunhuang",
  fuzhou: "Fuzhou",
  guangzhou: "Guangzhou",
  guilin: "Guilin",
  guiyang: "Guiyang",
  hangzhou: "Hangzhou",
  harbin: "Harbin",
  hefei: "Hefei",
  hongkong: "Hong Kong",
  huhhot: "Huhhot",
  jinan: "Jinan",
  kunming: "Kunming",
  lhasa: "Lhasa",
  lijiang: "Lijiang",
  macao: "Macau",
  macau: "Macau",
  manzhouli: "Manzhouli",
  miaoli: "Miaoli",
  nanchang: "Nanchang",
  nanjing: "Nanjing",
  nanning: "Nanning",
  nantou: "Nantou",
  nanzhao: "Nanzhao",
  ningbo: "Ningbo",
  penglai: "Penglai",
  putian: "Putian",
  qingdao: "Qingdao",
  qinhuangdao: "Qinhuangdao",
  quanzhou: "Quanzhou",
  qufu: "Qufu",
  sanya: "Sanya",
  shanghai: "Shanghai",
  shangrila: "ShangriLa",
  shaoxing: "Shaoxing",
  shenyang: "Shenyang",
  shenzhen: "Shenzhen",
  suzhou: "Suzhou",
  taipei: "Taipei",
  tainan: "Tainan",
  tangshan: "Tangshan",
  tengchong: "Tengchong",
  tianjin: "Tianjin",
  wenzhou: "Wenzhou",
  wuhan: "Wuhan",
  xiamen: "Xiamen",
  xian: "Xian",
  yangzhou: "Yangzhou",
  yantai: "YanTai",
  yiwu: "Yiwu",
  yunnan: "ShangriLa",
  zhoushan: "Zhoushan",
};

const lhwHotels = [
  {
    name_en: "Capella Shanghai, Jian Ye Li",
    name_zh: "上海建业里嘉佩乐酒店",
    brand_en: "Capella",
    brand_zh: "嘉佩乐",
    brandKey: "capella",
    city_en: "Shanghai",
    address1_zh: "上海市徐汇区建国西路480号",
    address1_en: "480 West Jianguo Road, Xuhui District, Shanghai, China 200031",
    latitude: 31.2059,
    longitude: 121.4517,
    propertySiteURL_en: "https://www.lhw.com/hotel/Capella-Shanghai-Jian-Ye-Li-Shanghai-China",
    propertySiteURL_zh: "https://www.lhw.cn/hotel/Capella-Shanghai-Jian-Ye-Li/6583",
  },
  {
    name_en: "Hylla Vintage Hotel",
    name_zh: "物与岚 . 设计收藏酒店",
    brand_en: "Hylla Vintage Hotel",
    brand_zh: "物与岚",
    brandKey: "hylla-vintage-hotel",
    city_en: "Lijiang",
    address1_zh: "云南省丽江市玉龙纳西族自治县白沙镇岩脚村99号",
    address1_en: "99 Yanjiao Village, Baisha Town, Lijiang City, Yunnan province",
    latitude: 26.9662,
    longitude: 100.2096,
    propertySiteURL_en: "https://www.lhw.com/hotel/Hylla-Vintage-Hotel-Lijiang-China",
    propertySiteURL_zh: "https://www.lhw.cn/hotel/China-Hylla-Vintage-Hotel/LW2877",
  },
  {
    name_en: "J Hotel, Shanghai Tower",
    name_zh: "上海中心J酒店",
    brand_en: "J Hotel",
    brand_zh: "J酒店",
    brandKey: "j-hotel",
    city_en: "Shanghai",
    address1_zh: "上海市浦东新区东泰路126号上海中心大厦",
    address1_en: "No. 126 Dong Tai Road, Pudong New Area, Shanghai, 200120, China",
    latitude: 31.2357,
    longitude: 121.5016,
    propertySiteURL_en: "https://www.lhw.com/hotel/J-Hotel-Shanghai-Tower-Shanghai-China",
    propertySiteURL_zh: "https://www.jhotelshanghai.com/pc",
  },
  {
    name_en: "Lohkah Hotel & Spa",
    name_zh: "七尚酒店",
    brand_en: "Lohkah",
    brand_zh: "七尚",
    brandKey: "lohkah",
    city_en: "Xiamen",
    address1_zh: "福建省厦门市湖里区槟城道277号",
    address1_en: "No. 277 Penang Road, Huli District, Xiamen, China",
    latitude: 24.5303,
    longitude: 118.1845,
    propertySiteURL_en: "https://www.lhw.com/hotel/Lohkah-Hotel-Spa-Xiamen-China",
    propertySiteURL_zh: "https://www.lhw.cn/domestic",
  },
  {
    name_en: "Pearl Gallery Hotel Guiyang",
    name_zh: "贵阳珍珀酒店",
    brand_en: "Pearl Gallery",
    brand_zh: "珍珀",
    brandKey: "pearl-gallery",
    city_en: "Guiyang",
    address1_zh: "贵州省贵阳市观山湖区长岭北路6号阿云朵仓4号栋",
    address1_en: "Building 4, Ayunduocang, No. 6 Changling North Road, Guanshanhu District, Guiyang, Guizhou, China 550081",
    latitude: 26.6503,
    longitude: 106.6366,
    propertySiteURL_en: "https://www.lhw.com/hotel/Pearl-Gallery-Hotel-Guiyang-Guiyang-China",
    propertySiteURL_zh: "https://www.lhw.cn/hotel/China-Pearl-Gallery-Hotel-Guiyang/50179",
  },
  {
    name_en: "Pushine Jinfoshan Resort Hotel",
    name_zh: "樸鄉金佛山度假酒店",
    brand_en: "Pushine",
    brand_zh: "樸鄉",
    brandKey: "pushine",
    city_en: "Chongqing",
    address1_zh: "重庆市南川区金佛山北坡景区",
    address1_en: "North Slope of Jinfo Mountain, Jinfoshan National Scenic Area, Nanchuan District, Chongqing, China 408400",
    latitude: 29.044,
    longitude: 107.185,
    propertySiteURL_en: "https://www.lhw.com/hotel/Pushine-Jinfoshan-Resort-Hotel-Chongqing-China",
    propertySiteURL_zh: "https://www.lhw.cn/domestic",
  },
  {
    name_en: "The Anandi Hotel and Spa",
    name_zh: "上海阿纳迪酒店",
    brand_en: "The Anandi",
    brand_zh: "阿纳迪",
    brandKey: "the-anandi",
    city_en: "Shanghai",
    address1_zh: "上海市长宁区临虹路7号",
    address1_en: "7 Linhong Road, Changning District, Shanghai, 200335, China",
    latitude: 31.2219,
    longitude: 121.367,
    propertySiteURL_en: "https://www.lhw.com/hotel/Anandi-Hotel-Spa-Hongquiao-Shanghai-China",
    propertySiteURL_zh: "https://www.lhw.cn/hotel/The-Anandi-Hotel-and-Spa/7050",
  },
  {
    name_en: "The Murray Hong Kong, a Niccolo Hotel",
    name_zh: "香港美利酒店",
    brand_en: "Niccolo",
    brand_zh: "尼依格罗",
    brandKey: "niccolo",
    city_en: "Hong Kong",
    regionCode: "HK",
    address1_zh: "香港中环红棉路22号",
    address1_en: "22 Cotton Tree Drive, Central, Hong Kong",
    latitude: 22.2784,
    longitude: 114.1604,
    propertySiteURL_en: "https://www.lhw.com/hotel/The-Murray-Hong-Kong-A-Niccolo-Hotel-Hong-Kong-China",
    propertySiteURL_zh: "https://www.lhw.cn/domestic",
  },
  {
    name_en: "The PuLi Shanghai",
    name_zh: "上海璞丽酒店",
    brand_en: "The PuLi",
    brand_zh: "璞丽",
    brandKey: "the-puli",
    city_en: "Shanghai",
    address1_zh: "上海市静安区常德路1号",
    address1_en: "1 Changde Road, JingAn District, Shanghai 200040 China",
    latitude: 31.2267,
    longitude: 121.4491,
    propertySiteURL_en: "https://www.lhw.com/hotel/The-PuLi-Hotel-Spa-Shanghai-China",
    propertySiteURL_zh: "https://www.lhw.cn/domestic",
  },
  {
    name_en: "The PuXuan Hotel and Spa",
    name_zh: "北京璞瑄酒店",
    brand_en: "The PuXuan",
    brand_zh: "璞瑄",
    brandKey: "the-puxuan",
    city_en: "Beijing",
    address1_zh: "北京市东城区王府井大街1号",
    address1_en: "No.1 WangFuJing Street, Dongcheng District Beijing, China 100006",
    latitude: 39.9234,
    longitude: 116.4103,
    propertySiteURL_en: "https://www.lhw.com/hotel/PuXuan-Hotel-Spa-Beijing-China",
    propertySiteURL_zh: "https://www.lhw.cn/domestic",
  },
  {
    name_en: "Guanyin Yiyuntai Hotel Chengdu",
    name_zh: "成都观隐颐云台酒店",
    brand_en: "Guanyin Yiyuntai",
    brand_zh: "观隐颐云台",
    brandKey: "guanyin-yiyuntai",
    city_en: "Chengdu",
    address1_zh: "四川省成都市青羊区宽窄巷子宽巷子38-39号",
    address1_en: "38 - 39 Kuan Alley, Qingyang District, Chengdu 610015, P. R. China",
    latitude: 30.6684,
    longitude: 104.056,
    propertySiteURL_en: "https://www.lhw.com/hotel/Guanyin-Yiyuntai-Hotel-Chengdu-China",
    propertySiteURL_zh: "https://chengdu.diaoyutai-hotels.cn/",
  },
];

const fourSeasonsSeeds = [
  ["Beijing", "Four Seasons Hotel Beijing", "北京四季酒店", "https://www.fourseasons.com/beijing/"],
  ["Dalian", "Four Seasons Hotel Dalian", "大连四季酒店", "https://www.fourseasons.com/dalian/"],
  ["Guangzhou", "Four Seasons Hotel Guangzhou", "广州四季酒店", "https://www.fourseasons.com/guangzhou/"],
  ["Hangzhou", "Four Seasons Hotel Hangzhou at West Lake", "杭州西子湖四季酒店", "https://www.fourseasons.com/hangzhou/"],
  ["Hangzhou", "Four Seasons Hotel Hangzhou at Hangzhou Centre", "杭州中心四季酒店", "https://www.fourseasons.com/hangzhoucentre/"],
  ["Hong Kong", "Four Seasons Hotel Hong Kong", "香港四季酒店", "https://www.fourseasons.com/hongkong/", "HK"],
  ["Macau", "Four Seasons Hotel Macao, Cotai Strip", "澳门四季酒店", "https://www.fourseasons.com/macao/", "MO"],
  ["Macau", "The Grand Suites at Four Seasons, Macao", "澳门四季名荟", "https://www.fourseasons.com/grandsuitesmacau/", "MO"],
  ["Shenzhen", "Four Seasons Hotel Shenzhen", "深圳四季酒店", "https://www.fourseasons.com/shenzhen/"],
  ["Suzhou", "Four Seasons Hotel Suzhou", "苏州四季酒店", "https://www.fourseasons.com/suzhou/"],
  ["Tianjin", "Four Seasons Hotel Tianjin", "天津四季酒店", "https://www.fourseasons.com/tianjin/"],
].map(([city_en, name_en, name_zh, propertySiteURL_en, regionCode]) => ({
  city_en,
  name_en,
  name_zh,
  propertySiteURL_en,
  regionCode,
}));

const amanSeeds = [
  {
    name_en: "Amandayan",
    name_zh: "大研安缦",
    city_en: "Lijiang",
    propertySiteURL_en: "https://www.aman.com/resorts/amandayan",
  },
  {
    name_en: "Amanfayun",
    name_zh: "法云安缦",
    city_en: "Hangzhou",
    propertySiteURL_en: "https://www.aman.com/resorts/amanfayun",
  },
  {
    name_en: "Amanyangyun",
    name_zh: "养云安缦",
    city_en: "Shanghai",
    propertySiteURL_en: "https://www.aman.com/resorts/amanyangyun",
  },
  {
    name_en: "Aman Summer Palace",
    name_zh: "颐和安缦",
    city_en: "Beijing",
    address1_en: "1 Gongmenqian Street, Summer Palace, Beijing, China 100091",
    propertySiteURL_en: "https://www.aman.com/resorts/aman-summer-palace",
    fetchURL: "https://www.aman.com/resorts/aman-summer-palace/contact-us",
  },
];

const mandarinSeeds = [
  ["Beijing", "Mandarin Oriental Wangfujing, Beijing", "北京王府井文华东方酒店", "https://www.mandarinoriental.com/en/beijing/wangfujing"],
  ["Beijing", "Mandarin Oriental Qianmen, Beijing", "北京前门文华东方酒店", "https://www.mandarinoriental.com/en/beijing/qianmen"],
  ["Guangzhou", "Mandarin Oriental, Guangzhou", "广州文华东方酒店", "https://www.mandarinoriental.com/en/guangzhou/tianhe"],
  ["Hong Kong", "The Landmark Mandarin Oriental, Hong Kong", "香港置地文华东方酒店", "https://www.mandarinoriental.com/en/hong-kong/the-landmark", "HK"],
  ["Hong Kong", "Mandarin Oriental, Hong Kong", "香港文华东方酒店", "https://www.mandarinoriental.com/en/hong-kong/victoria-harbour", "HK"],
  ["Macau", "Mandarin Oriental, Macau", "澳门文华东方酒店", "https://www.mandarinoriental.com/en/macau/one-central", "MO"],
  ["Sanya", "Mandarin Oriental, Sanya", "三亚文华东方酒店", "https://www.mandarinoriental.com/en/sanya/dadonghai"],
  ["Shanghai", "Mandarin Oriental Pudong, Shanghai", "上海浦东文华东方酒店", "https://www.mandarinoriental.com/en/shanghai/pudong"],
  ["Shenzhen", "Mandarin Oriental, Shenzhen", "深圳文华东方酒店", "https://www.mandarinoriental.com/en/shenzhen/futian"],
  ["Taipei", "Mandarin Oriental, Taipei", "台北文华东方酒店", "https://www.mandarinoriental.com/en/taipei/songshan", "TW"],
].map(([city_en, name_en, name_zh, propertySiteURL_en, regionCode]) => ({
  city_en,
  name_en,
  name_zh,
  propertySiteURL_en,
  regionCode,
}));

const rosewoodSeeds = [
  ["Hong Kong", "Rosewood Hong Kong", "香港瑰丽酒店", "https://www.rosewoodhotels.com/en/hong-kong", "HK", "FULLY_BOOKABLE"],
  ["Beijing", "Rosewood Beijing", "北京瑰丽酒店", "https://www.rosewoodhotels.com/en/beijing", "MAINLAND_CN", "FULLY_BOOKABLE"],
  ["Guangzhou", "Rosewood Guangzhou", "广州瑰丽酒店", "https://www.rosewoodhotels.com/en/guangzhou", "MAINLAND_CN", "FULLY_BOOKABLE"],
  ["Sanya", "Rosewood Sanya", "三亚瑰丽酒店", "https://www.rosewoodhotels.com/en/sanya", "MAINLAND_CN", "FULLY_BOOKABLE"],
  ["Ningbo", "Rosewood Ningbo", "宁波瑰丽酒店", "https://www.rosewoodhotels.com/en/ningbo", "MAINLAND_CN", "OPENING_SOON"],
  ["Shenzhen", "Rosewood Shenzhen", "深圳瑰丽酒店", "https://www.rosewoodhotels.com/en/shenzhen", "MAINLAND_CN", "OPENING_SOON"],
].map(([city_en, name_en, name_zh, propertySiteURL_en, regionCode, hotelStatus]) => ({
  city_en,
  name_en,
  name_zh,
  propertySiteURL_en,
  regionCode,
  hotelStatus,
}));

const peninsulaHotels = [
  {
    name_en: "The Peninsula Beijing",
    name_zh: "北京王府半岛酒店",
    city_en: "Beijing",
    address1_en: "8 Goldfish Lane, Wangfujing, Beijing",
    propertySiteURL_en: sourceUrls.peninsulaBeijing,
  },
  {
    name_en: "The Peninsula Shanghai",
    name_zh: "上海半岛酒店",
    city_en: "Shanghai",
    address1_en: "No. 32 The Bund, 32 Zhongshan Dong Yi Road, Shanghai 200002",
    propertySiteURL_en: sourceUrls.peninsulaShanghai,
  },
  {
    name_en: "The Peninsula Hong Kong",
    name_zh: "香港半岛酒店",
    city_en: "Hong Kong",
    regionCode: "HK",
    address1_en: "Salisbury Road, Tsim Sha Tsui, Kowloon, Hong Kong",
    propertySiteURL_en: sourceUrls.peninsulaHongKong,
  },
];

async function main() {
  mkdirSync(outputDir, { recursive: true });

  const hotels = [
    ...buildLhwHotels(),
    ...(await fetchSlhHotels()),
    ...(await fetchFourSeasonsHotels()),
    ...(await fetchAmanHotels()),
    ...(await fetchShangriLaHotels()),
    ...(await fetchMandarinOrientalHotels()),
    ...(await fetchRosewoodHotels()),
    ...buildPeninsulaHotels(),
  ].sort(compareHotels);

  validateRecords(hotels);

  const metadata = buildMetadata(hotels);
  const payload = {
    metadata,
    official_sites: [
      sourceUrls.lhw,
      sourceUrls.slhBrowseChina,
      sourceUrls.slhChina,
      sourceUrls.slhTaiwan,
      sourceUrls.fourSeasonsChina,
      sourceUrls.amanChina,
      sourceUrls.shangriLaFind,
      sourceUrls.mandarinSitemap,
      sourceUrls.rosewoodSitemap,
      sourceUrls.peninsulaBeijing,
      sourceUrls.peninsulaShanghai,
      sourceUrls.peninsulaHongKong,
    ],
    hotels,
  };

  writeFileSync(outputJsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  writeFileSync(outputCsvPath, toCsv(hotels));
  writeFileSync(outputSummaryPath, toSummary(metadata));

  console.log(`Wrote ${hotels.length} hotels`);
  console.log(outputJsonPath);
  console.log(outputCsvPath);
  console.log(outputSummaryPath);
}

function buildLhwHotels() {
  return lhwHotels.map((item) =>
    makeHotel({
      chain: "The Leading Hotels of the World",
      source: "lhw_official_browse_by_list_hotels_in_asia",
      brand_en: "The Leading Hotels of the World",
      brandKey: "the-leading-hotels-of-the-world",
      official_locale_primary: "en-US",
      official_locale_secondary: null,
      hotelStatus: "FULLY_BOOKABLE",
      ...item,
      raw_en: {
        source_url: sourceUrls.lhw,
        source_url_cn: sourceUrls.lhwCnDomestic,
        method: "official browse-by-list page; direct machine fetch of detail pages returned 403, so the official list page is the source of truth for membership/name/address",
        item,
      },
    }),
  );
}

async function fetchSlhHotels() {
  const byId = new Map();
  const queries = [
    { query: "China", url: sourceUrls.slhChina },
    { query: "Taiwan", url: sourceUrls.slhTaiwan },
  ];

  for (const query of queries) {
    const payload = await fetchJson(query.url);
    if (!Array.isArray(payload.items)) {
      throw new Error(`SLH response missing items for ${query.query}`);
    }
    for (const item of payload.items) {
      byId.set(item.id, { item, query });
    }
    await delay(250);
  }

  const hotels = [];
  for (const { item, query } of Array.from(byId.values())) {
    const location = String(item.location?.name ?? "");
    const parsedLocation = parseSlhLocation(location);
    const regionCode = parsedLocation.regionCode;
    const city_en = parsedLocation.city_en;
    const features = (item.keyFeatures ?? []).map((feature) => stripHtml(feature?.text ?? feature)).filter(Boolean);
    const thumbnails = (item.images ?? [])
      .map((image) => image?.sources?.s || image?.sources?.m || image?.sources?.l)
      .filter(Boolean);
    const detailUrl = absoluteUrl(item.detailUrl, "https://slh.com");
    const detail = await fetchSlhDetail(detailUrl);

    hotels.push(makeHotel({
      chain: "Small Luxury Hotels of the World",
      source: "slh_official_hotelsearchresults_api",
      official_locale_primary: "en-US",
      official_locale_secondary: null,
      spiritCode: `SLH-${item.id}`,
      name_en: cleanText(item.title),
      brand_en: "Small Luxury Hotels of the World",
      brandKey: "small-luxury-hotels-of-the-world",
      hotelStatus: "FULLY_BOOKABLE",
      city_en,
      regionCode,
      address1_en: detail.address1_en,
      zipcode: detail.zipcode,
      latitude: toNumber(item.location?.coordinates?.lat),
      longitude: toNumber(item.location?.coordinates?.lng),
      propertySiteURL_en: detailUrl,
      description_en: detail.description_en || stripHtml(item.descriptionText || item.shortDescriptionText),
      checkinTime: detail.checkinTime,
      checkoutTime: detail.checkoutTime,
      amenities_en: features,
      amenityKeys: features.map(slugify),
      thumbnails,
      verifiedRating: toNumber(item.rating?.score),
      verifiedNumReviews: parseReviewCount(item.rating?.text),
      raw_en: {
        source_query: query.query,
        source_url: query.url,
        detail_url: detailUrl,
        item: sanitizeSlhItem(item),
        detail: detail.raw,
      },
    }));
    await delay(250);
  }
  return hotels;
}

async function fetchFourSeasonsHotels() {
  const hotels = [];
  const listHtml = await fetchText(sourceUrls.fourSeasonsChina);
  const listEvidence = {
    source_url: sourceUrls.fourSeasonsChina,
    official_destination_count_text: firstMatch(listHtml, /With\s+(\d+)\s+luxury hotel destinations in legendary cities/i),
  };

  for (const seed of fourSeasonsSeeds) {
    const html = await fetchText(seed.propertySiteURL_en);
    const parsedLd = findJsonLd(html, ["Hotel"]) ?? {};
    const looseLd = parseLooseJsonLdHotel(html);
    const ld = { ...looseLd, ...parsedLd };
    if (!ld.address && looseLd.address) ld.address = looseLd.address;
    if (!ld.telephone && looseLd.telephone) ld.telephone = looseLd.telephone;
    if (!ld.name && looseLd.name) ld.name = looseLd.name;
    if (!ld.description && looseLd.description) ld.description = looseLd.description;
    const title = cleanText(firstMatch(html, /<title>([\s\S]*?)<\/title>/i));
    const description = cleanText(ld.description) || metaDescription(html);
    hotels.push(
      makeHotel({
        chain: "Four Seasons",
        source: "four_seasons_official_china_destination_and_property_pages",
        official_locale_primary: "en-US",
        official_locale_secondary: "zh-CN",
        spiritCode: `FS-${slugify(seed.propertySiteURL_en.replace("https://www.fourseasons.com/", ""))}`,
        name_en: cleanText(ld.name) || seed.name_en,
        name_zh: seed.name_zh,
        brand_en: "Four Seasons",
        brandKey: "four-seasons",
        hotelStatus: "FULLY_BOOKABLE",
        city_en: seed.city_en,
        regionCode: seed.regionCode,
        address1_en: parseAddress(ld.address),
        phone: cleanText(ld.telephone),
        propertySiteURL_en: seed.propertySiteURL_en,
        propertySiteURL_zh: `${seed.propertySiteURL_en.replace(/\/$/, "")}/zh/`,
        description_en: description,
        thumbnails: collectImageUrls(ld),
        brandlogo: cleanText(ld.logo),
        raw_en: {
          list_evidence: listEvidence,
          property_title: title,
          json_ld: ld,
        },
      }),
    );
    await delay(250);
  }
  return hotels;
}

async function fetchAmanHotels() {
  const hotels = [];
  for (const seed of amanSeeds) {
    const html = await fetchText(seed.fetchURL || seed.propertySiteURL_en);
    const ld = findJsonLd(html, ["Resort", "Hotel", "LodgingBusiness"]) ?? {};
    const title = cleanText(firstMatch(html, /<title>([\s\S]*?)<\/title>/i));
    hotels.push(
      makeHotel({
        chain: "Aman",
        source: "aman_official_china_country_and_property_pages",
        official_locale_primary: "en-US",
        official_locale_secondary: null,
        spiritCode: `AMAN-${slugify(seed.name_en)}`,
        name_en: cleanText(ld.name) || seed.name_en,
        name_zh: seed.name_zh,
        brand_en: "Aman",
        brandKey: "aman",
        hotelStatus: "FULLY_BOOKABLE",
        city_en: seed.city_en,
        address1_en: parseAddress(ld.address) || seed.address1_en,
        phone: cleanText(ld.telephone),
        email: cleanText(ld.email),
        propertySiteURL_en: seed.propertySiteURL_en,
        description_en: cleanText(ld.description) || metaDescription(html),
        thumbnails: collectImageUrls(ld),
        raw_en: {
          source_country_page: sourceUrls.amanChina,
          source_url: seed.fetchURL || seed.propertySiteURL_en,
          property_title: title,
          json_ld: ld,
        },
      }),
    );
    await delay(250);
  }
  return hotels;
}

async function fetchShangriLaHotels() {
  const html = await fetchText(sourceUrls.shangriLaFind);
  const sections = parseShangriLaSections(html);
  const targetSections = sections.filter((section) => ["中国内地", "港澳台"].includes(section.countryName));
  const hotels = [];

  for (const section of targetSections) {
    for (const item of section.items) {
      const href = absoluteShangriLaUrl(item.href);
      const href_en = toEnglishShangriLaUrl(href);
      const city_en = inferShangriLaCity(item.href);
      const regionCode = section.countryName === "中国内地" ? "MAINLAND_CN" : inferRegionFromCity(city_en);
      const brand_en = inferShangriLaBrand(item.name_zh, href);
      const status = /2026|pre-opening/i.test(`${item.info} ${href}`) ? "OPENING_SOON" : "FULLY_BOOKABLE";
      const codeFromUrl = firstMatch(href, /[?&]hotelCode=([^&]+)/i);
      hotels.push(
        makeHotel({
          chain: "Shangri-La",
          source: "shangri_la_official_find_a_hotel_page",
          official_locale_primary: "zh-CN",
          official_locale_secondary: "en-US",
          spiritCode: codeFromUrl || `SHANGRI-LA-${slugify(city_en)}-${slugify(href.replace(/^https?:\/\//, ""))}`,
          name_zh: item.name_zh,
          brand_en,
          brandKey: slugify(brand_en),
          hotelStatus: status,
          city_en,
          regionCode,
          propertySiteURL_en: href_en,
          propertySiteURL_zh: href,
          openDate: /2026/.test(item.info) ? "2026" : null,
          raw_zh: {
            source_url: sourceUrls.shangriLaFind,
            source_section: section.countryName,
            source_section_declared_count: section.declaredCount,
            item,
          },
        }),
      );
    }
  }
  return hotels;
}

async function fetchMandarinOrientalHotels() {
  const hotels = [];
  for (const seed of mandarinSeeds) {
    const html = await fetchText(seed.propertySiteURL_en);
    const ld = findJsonLd(html, ["Hotel"]) ?? {};
    const address = typeof ld.address === "object" ? ld.address : {};
    hotels.push(
      makeHotel({
        chain: "Mandarin Oriental",
        source: "mandarin_oriental_official_sitemap_and_property_pages",
        official_locale_primary: "en-US",
        official_locale_secondary: "zh-CN",
        spiritCode: `MO-${slugify(seed.propertySiteURL_en.replace("https://www.mandarinoriental.com/en/", ""))}`,
        name_en: cleanText(ld.name) || seed.name_en,
        name_zh: seed.name_zh,
        brand_en: "Mandarin Oriental",
        brandKey: "mandarin-oriental",
        hotelStatus: "FULLY_BOOKABLE",
        city_en: seed.city_en,
        regionCode: seed.regionCode,
        address1_en: parseAddress(address.streetAddress),
        zipcode: cleanText(address.postalCode),
        latitude: toNumber(ld.geo?.latitude),
        longitude: toNumber(ld.geo?.longitude),
        phone: cleanText(ld.telephone),
        email: cleanText(ld.email),
        propertySiteURL_en: seed.propertySiteURL_en,
        propertySiteURL_zh: seed.propertySiteURL_en.replace("/en/", "/zh-cn/"),
        description_en: cleanText(ld.description) || metaDescription(html),
        thumbnails: collectImageUrls(ld),
        brandlogo: cleanText(ld.logo),
        raw_en: {
          source_sitemap: sourceUrls.mandarinSitemap,
          json_ld: ld,
        },
      }),
    );
    await delay(250);
  }
  return hotels;
}

async function fetchRosewoodHotels() {
  const hotels = [];
  for (const seed of rosewoodSeeds) {
    const html = await fetchText(seed.propertySiteURL_en);
    const title = cleanText(firstMatch(html, /<title>([\s\S]*?)<\/title>/i));
    const description = metaDescription(html);
    const ld = findJsonLd(html, ["Hotel", "LodgingBusiness"]) ?? null;
    hotels.push(
      makeHotel({
        chain: "Rosewood",
        source: "rosewood_official_sitemap_and_property_pages",
        official_locale_primary: "en-US",
        official_locale_secondary: null,
        spiritCode: `ROSEWOOD-${slugify(seed.name_en)}`,
        name_en: seed.name_en,
        name_zh: seed.name_zh,
        brand_en: "Rosewood",
        brandKey: "rosewood",
        hotelStatus: seed.hotelStatus,
        city_en: seed.city_en,
        regionCode: seed.regionCode,
        propertySiteURL_en: seed.propertySiteURL_en,
        description_en: description,
        raw_en: {
          source_sitemap: sourceUrls.rosewoodSitemap,
          property_title: title,
          page_description: description,
          json_ld: ld,
        },
      }),
    );
    await delay(250);
  }
  return hotels;
}

function buildPeninsulaHotels() {
  return peninsulaHotels.map((item) =>
    makeHotel({
      chain: "The Peninsula",
      source: "peninsula_official_property_pages_web_indexed",
      official_locale_primary: "en-US",
      official_locale_secondary: item.regionCode === "HK" ? "zh-HK" : "zh-CN",
      brand_en: "The Peninsula",
      brandKey: "the-peninsula",
      hotelStatus: "FULLY_BOOKABLE",
      ...item,
      raw_en: {
        method: "official property pages verified through browser-accessible official pages; direct Node fetch returned 403",
        item,
      },
    }),
  );
}

function makeHotel(input) {
  const regionCode = input.regionCode || inferRegionFromCity(input.city_en);
  if (!regionDefinitions[regionCode]) throw new Error(`Unknown regionCode ${regionCode} for ${input.name_en || input.name_zh}`);
  const city = getCity(input.city_en);
  const region = regionDefinitions[regionCode];
  const brand_en = input.brand_en ?? input.chain;

  const record = {
    chain: input.chain,
    source: input.source,
    official_locale_primary: input.official_locale_primary ?? "en-US",
    official_locale_secondary: input.official_locale_secondary ?? null,
    spiritCode: input.spiritCode || `${slugify(input.chain)}-${slugify(input.name_en || input.name_zh)}`,
    name_en: input.name_en ?? null,
    name_zh: input.name_zh ?? null,
    brand_en,
    brand_zh: input.brand_zh ?? brandZh[brand_en] ?? brandZh[input.chain] ?? null,
    brandKey: input.brandKey ?? slugify(brand_en),
    hotelStatus: input.hotelStatus ?? "FULLY_BOOKABLE",
    propertyType: input.propertyType ?? "Hotel",
    gpCategory: input.gpCategory ?? "Luxury",
    city_en: input.city_en ?? null,
    city_zh: input.city_zh ?? city?.city_zh ?? null,
    province_en: input.province_en ?? city?.province_en ?? null,
    province_zh: input.province_zh ?? city?.province_zh ?? null,
    region_en: region.region_en,
    region_zh: region.region_zh,
    regionCode,
    subRegionCode: input.subRegionCode ?? regionCode,
    subRegionLabel_en: input.subRegionLabel_en ?? region.region_en,
    subRegionLabel_zh: input.subRegionLabel_zh ?? region.region_zh,
    country_en: region.country_en,
    country_zh: region.country_zh,
    countryCode: region.countryCode,
    countryDisplay_en: region.countryDisplay_en,
    countryDisplay_zh: region.countryDisplay_zh,
    address1_en: normalizeWhitespace(input.address1_en),
    address1_zh: normalizeWhitespace(input.address1_zh),
    zipcode: normalizeWhitespace(input.zipcode),
    latitude: toNumber(input.latitude),
    longitude: toNumber(input.longitude),
    phone: normalizeWhitespace(input.phone),
    email: normalizeWhitespace(input.email),
    propertySiteURL_en: input.propertySiteURL_en ?? null,
    propertySiteURL_zh: input.propertySiteURL_zh ?? null,
    externalBookingURL_en: input.externalBookingURL_en ?? null,
    externalBookingURL_zh: input.externalBookingURL_zh ?? null,
    bookableDate: input.bookableDate ?? null,
    openDate: input.openDate ?? null,
    checkinTime: input.checkinTime ?? null,
    checkoutTime: input.checkoutTime ?? null,
    nonSmoking: input.nonSmoking ?? null,
    excludeFromBrandFilter: input.excludeFromBrandFilter ?? false,
    showBrandLogo: input.showBrandLogo ?? true,
    suppressBrandLogo: input.suppressBrandLogo ?? false,
    description_en: normalizeWhitespace(input.description_en),
    description_zh: normalizeWhitespace(input.description_zh),
    amenities_en: Array.isArray(input.amenities_en) ? input.amenities_en.filter(Boolean) : [],
    amenities_zh: Array.isArray(input.amenities_zh) ? input.amenities_zh.filter(Boolean) : [],
    amenityKeys: Array.isArray(input.amenityKeys) ? input.amenityKeys.filter(Boolean) : [],
    characteristics_en: Array.isArray(input.characteristics_en) ? input.characteristics_en.filter(Boolean) : [],
    characteristics_zh: Array.isArray(input.characteristics_zh) ? input.characteristics_zh.filter(Boolean) : [],
    thumbnails: Array.isArray(input.thumbnails) ? Array.from(new Set(input.thumbnails.filter(Boolean))) : [],
    brandlogo: input.brandlogo ?? null,
    flag: input.flag ?? null,
    verifiedRating: toNumber(input.verifiedRating),
    verifiedNumReviews: toNumber(input.verifiedNumReviews),
    lastRenovationDate: input.lastRenovationDate ?? null,
    raw_en: input.raw_en ?? null,
    raw_zh: input.raw_zh ?? null,
  };

  return Object.fromEntries(hotelKeys.map((key) => [key, record[key] ?? null]));
}

function parseSlhLocation(location) {
  const parts = location.split(",").map((part) => cleanText(part)).filter(Boolean);
  const countryPart = parts.at(-1) ?? "";
  const cityPart = parts[0] ?? null;
  const city_en = normalizeSlhCity(cityPart);
  let regionCode = "MAINLAND_CN";
  if (/Hong Kong/i.test(countryPart) || /Hong Kong SAR/i.test(location)) regionCode = "HK";
  if (/Taiwan/i.test(countryPart)) regionCode = "TW";
  return { city_en, regionCode };
}

async function fetchSlhDetail(url) {
  const html = await fetchText(url);
  const addressBlock = firstMatch(
    html,
    /<h2[^>]*>\s*Hotel Address\s*<\/h2>([\s\S]*?)<div\s+class="sc-hotel-location__check-in-out-container"/i,
  );
  const addressParts = addressBlock
    ? Array.from(addressBlock.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g))
        .map((match) => cleanText(match[1]))
        .filter(Boolean)
    : [];
  const addressLines = addressParts.slice(1);
  const zipcode = addressLines.find((line) => /^\d{4,8}$/.test(line)) ?? null;
  const checkinTime = formatTimeCode(
    firstMatch(html, /<p>\s*Check in:\s*<\/p>\s*<h5[^>]*>\s*([\s\S]*?)<\/h5>/i),
  );
  const checkoutTime = formatTimeCode(
    firstMatch(html, /<p>\s*Check out:\s*<\/p>\s*<h5[^>]*>\s*([\s\S]*?)<\/h5>/i),
  );
  return {
    address1_en: addressLines.length ? addressLines.join(", ") : null,
    zipcode,
    checkinTime,
    checkoutTime,
    description_en: metaDescription(html),
    raw: {
      property_title: cleanText(firstMatch(html, /<title>([\s\S]*?)<\/title>/i)),
      parsed_address_lines: addressLines,
      checkinTime,
      checkoutTime,
    },
  };
}

function sanitizeSlhItem(item) {
  const {
    availabilitySummary,
    available,
    conversionCurrency,
    convertedPrice,
    currency,
    hideConversion,
    price,
    promotionalOffer,
    ...stableItem
  } = item;
  return stableItem;
}

function normalizeSlhCity(city) {
  if (!city) return null;
  const cleaned = city.replace(/\s+City$/i, " City").trim();
  if (/^Xi'?an$/i.test(cleaned)) return "Xian";
  if (/^Nanzhao Town$/i.test(cleaned)) return "Nanzhao";
  if (/^Shaoxing City$/i.test(cleaned)) return "Shaoxing";
  return cleaned;
}

function parseShangriLaSections(html) {
  const sections = [];
  const sectionPattern =
    /<div class="country-name[^"]*"><a[^>]*>([\s\S]*?)<\/a>\((\d+)\)<\/div><ul class="hotel-items sl_clear">([\s\S]*?)<\/ul>/g;
  for (const match of html.matchAll(sectionPattern)) {
    const countryName = cleanText(match[1]);
    const declaredCount = Number(match[2]);
    const items = [];
    const itemPattern = /<li><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>(?:<span class="info">([\s\S]*?)<\/span>)?<\/li>/g;
    for (const itemMatch of match[3].matchAll(itemPattern)) {
      items.push({
        href: decodeHtmlEntities(itemMatch[1]),
        name_zh: cleanText(itemMatch[2]),
        info: cleanText(itemMatch[3]),
      });
    }
    sections.push({ countryName, declaredCount, items });
  }
  return sections;
}

function inferShangriLaCity(href) {
  const url = new URL(absoluteShangriLaUrl(href));
  const parts = url.pathname.split("/").filter(Boolean);
  const slug = url.hostname.includes("hoteljen.com") ? parts[1] : parts[1];
  return citySlugMap[slug] ?? titleCase(slug);
}

function inferShangriLaBrand(name, href) {
  if (/hoteljen\.com|jen/i.test(href) || /JEN/i.test(name)) return "JEN Hotels";
  if (/kerry/i.test(href) || /嘉里/.test(name)) return "Kerry Hotels";
  if (/traders/i.test(href) || /盛贸/.test(name)) return "Traders Hotels";
  return "Shangri-La";
}

function absoluteShangriLaUrl(href) {
  if (href.startsWith("//")) return `https:${href}`;
  return absoluteUrl(href, "https://www.shangri-la.com");
}

function toEnglishShangriLaUrl(url) {
  return url.replace("/cn/", "/en/");
}

function inferRegionFromCity(city_en) {
  if (city_en === "Hong Kong") return "HK";
  if (city_en === "Macau") return "MO";
  if (["Taipei", "Tainan", "Nantou", "Miaoli"].includes(city_en)) return "TW";
  return "MAINLAND_CN";
}

function getCity(city_en) {
  const value = cityMeta[city_en];
  if (!value) return null;
  return {
    city_zh: value[0],
    province_en: value[1],
    province_zh: value[2],
  };
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "accept-language": "en-US,en;q=0.9,zh-CN;q=0.7,zh;q=0.6",
      "user-agent": userAgent,
    },
  });
  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status} ${url}`);
  }
  return response.text();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json,text/plain,*/*",
      "accept-language": "en-US,en;q=0.9,zh-CN;q=0.7,zh;q=0.6",
      "user-agent": userAgent,
    },
  });
  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status} ${url}`);
  }
  return response.json();
}

function findJsonLd(html, types) {
  const candidates = [];
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const text = decodeHtmlEntities(match[1]).trim();
    try {
      const parsed = JSON.parse(text);
      candidates.push(...flattenJsonLd(parsed));
    } catch {
      // Some pages include non-critical malformed structured data. Ignore those blocks.
    }
  }
  return candidates.find((item) => {
    const itemTypes = Array.isArray(item?.["@type"]) ? item["@type"] : [item?.["@type"]];
    return itemTypes.some((type) => types.includes(type));
  });
}

function parseLooseJsonLdHotel(html) {
  const marker = html.search(/"@type"\s*:\s*"Hotel"/);
  if (marker === -1) return {};
  const block = html.slice(Math.max(0, marker - 400), marker + 3500);
  return {
    name: cleanText(firstMatch(block, /"name"\s*:\s*"([\s\S]*?)"/)),
    description: cleanText(firstMatch(block, /"description"\s*:\s*"([\s\S]*?)"/)),
    address: cleanText(firstMatch(block, /"address"\s*:\s*"([\s\S]*?)"\s*,\s*"telephone"/)),
    telephone: cleanText(firstMatch(block, /"telephone"\s*:\s*"([^"]+)"/)),
    logo: cleanText(firstMatch(block, /"logo"\s*:\s*"([^"]+)"/)),
  };
}

function flattenJsonLd(value) {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (value?.["@graph"]) return flattenJsonLd(value["@graph"]);
  return value && typeof value === "object" ? [value] : [];
}

function parseAddress(address) {
  if (!address) return null;
  if (typeof address === "string") return normalizeWhitespace(address);
  if (typeof address !== "object") return null;
  return normalizeWhitespace(
    [
      address.streetAddress,
      address.addressLocality,
      address.addressRegion && address.addressRegion !== "Asia-Pacific" ? address.addressRegion : null,
      address.postalCode,
      address.addressCountry,
    ]
      .filter(Boolean)
      .join(", "),
  );
}

function collectImageUrls(ld) {
  const images = [];
  for (const key of ["image", "photo", "logo"]) {
    const value = ld?.[key];
    if (!value) continue;
    if (typeof value === "string") images.push(value);
    else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") images.push(item);
        else if (item?.url) images.push(item.url);
        else if (item?.contentUrl) images.push(item.contentUrl);
      }
    } else if (value.url) images.push(value.url);
    else if (value.contentUrl) images.push(value.contentUrl);
  }
  return Array.from(new Set(images.filter(Boolean)));
}

function metaDescription(html) {
  return cleanText(
    firstMatch(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i) ||
      firstMatch(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i) ||
      firstMatch(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["'][^>]*>/i),
  );
}

function firstMatch(value, pattern) {
  const match = String(value ?? "").match(pattern);
  return match ? decodeHtmlEntities(match[1]) : null;
}

function stripHtml(value) {
  return cleanText(String(value ?? "").replace(/<[^>]+>/g, " "));
}

function cleanText(value) {
  return normalizeWhitespace(decodeHtmlEntities(value));
}

function normalizeWhitespace(value) {
  if (value === undefined || value === null || value === "") return null;
  const cleaned = String(value)
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

function decodeHtmlEntities(value) {
  return String(value ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function absoluteUrl(value, base) {
  if (!value) return null;
  return new URL(value, base).toString();
}

function slugify(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function titleCase(value) {
  return String(value ?? "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatTimeCode(value) {
  const text = cleanText(value);
  if (!text) return null;
  const digits = text.replace(/\D/g, "");
  if (digits.length === 4) return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  return text;
}

function parseReviewCount(value) {
  const match = String(value ?? "").match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function compareHotels(a, b) {
  return (
    (chainOrder.get(a.chain) ?? 99) - (chainOrder.get(b.chain) ?? 99) ||
    a.regionCode.localeCompare(b.regionCode) ||
    String(a.city_en ?? "").localeCompare(String(b.city_en ?? "")) ||
    String(a.name_en ?? a.name_zh ?? "").localeCompare(String(b.name_en ?? b.name_zh ?? ""))
  );
}

function validateRecords(hotels) {
  const seen = new Set();
  for (const hotel of hotels) {
    const keys = Object.keys(hotel);
    if (keys.join("\n") !== hotelKeys.join("\n")) {
      throw new Error(`Schema mismatch for ${hotel.spiritCode}`);
    }
    if (seen.has(hotel.spiritCode)) {
      throw new Error(`Duplicate spiritCode ${hotel.spiritCode}`);
    }
    seen.add(hotel.spiritCode);
    if (!["MAINLAND_CN", "HK", "MO", "TW"].includes(hotel.regionCode)) {
      throw new Error(`Out-of-scope region ${hotel.regionCode} for ${hotel.spiritCode}`);
    }
  }
}

function buildMetadata(hotels) {
  return {
    generated_at: fetchedAt,
    scope: "greater_china_luxury_hotel_groups_official_public_lists",
    usage,
    record_count: hotels.length,
    included_regions: ["Mainland China", "Hong Kong", "Macau", "Taiwan"],
    group_scope: [
      "The Leading Hotels of the World",
      "Small Luxury Hotels of the World",
      "Four Seasons",
      "Aman",
      "Shangri-La",
      "Mandarin Oriental",
      "Rosewood",
      "The Peninsula",
    ],
    chain_counts: countBy(hotels, "chain"),
    region_counts: countBy(hotels, "regionCode"),
    status_counts: countBy(hotels, "hotelStatus"),
    source_counts: countBy(hotels, "source"),
    missing_counts: {
      address1_en: hotels.filter((hotel) => !hotel.address1_en).length,
      coordinates: hotels.filter((hotel) => hotel.latitude === null || hotel.longitude === null).length,
      phone: hotels.filter((hotel) => !hotel.phone).length,
      propertySiteURL_en: hotels.filter((hotel) => !hotel.propertySiteURL_en).length,
    },
    note:
      "No prices, inventory, login-only data, user reviews, or live booking availability were fetched. LHW and Peninsula membership/name/address rows are based on official browser-accessible pages because direct Node requests returned anti-bot 403 responses.",
  };
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] ?? "null";
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function toCsv(hotels) {
  const rows = [csvColumns, ...hotels.map((hotel) => csvColumns.map((column) => csvValue(hotel[column])))];
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
  const chainRows = Object.entries(metadata.chain_counts)
    .map(([chain, count]) => `| ${chain} | ${count} |`)
    .join("\n");
  const regionRows = Object.entries(metadata.region_counts)
    .map(([region, count]) => `| ${region} | ${count} |`)
    .join("\n");
  const statusRows = Object.entries(metadata.status_counts)
    .map(([status, count]) => `| ${status} | ${count} |`)
    .join("\n");

  return `# Luxury Hotel Groups Greater China Official Hotels

- Generated at: ${metadata.generated_at}
- Scope: Mainland China + Hong Kong + Macau + Taiwan
- Usage: ${metadata.usage}
- Record count: ${metadata.record_count}
- Schema: aligned to Hyatt/Marriott official hotel export field names
- Excluded: prices, inventory, login-only data, user reviews, live booking availability

## Counts by Chain

| Chain | Count |
| --- | ---: |
${chainRows}

## Counts by Region

| Region | Count |
| --- | ---: |
${regionRows}

## Counts by Status

| Status | Count |
| --- | ---: |
${statusRows}

## Missing Field Counts

| Field | Missing |
| --- | ---: |
| address1_en | ${metadata.missing_counts.address1_en} |
| coordinates | ${metadata.missing_counts.coordinates} |
| phone | ${metadata.missing_counts.phone} |
| propertySiteURL_en | ${metadata.missing_counts.propertySiteURL_en} |

## Source Notes

- LHW: official browse-by-list Asia page plus official Chinese domestic page.
- SLH: official hotel search results API for China and Taiwan queries.
- Four Seasons: official China destination page plus property pages.
- Aman: official China destination and property pages.
- Shangri-La: official Chinese "find a hotel" page.
- Mandarin Oriental: official sitemap-confirmed property pages.
- Rosewood: official sitemap-confirmed property pages.
- The Peninsula: official property pages verified via browser-accessible pages; direct Node requests returned anti-bot 403.
`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
