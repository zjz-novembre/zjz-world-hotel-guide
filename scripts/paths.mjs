import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const hotelGuideDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const projectRoot = resolve(hotelGuideDir, "..");
export const hotelBrowserDir = join(hotelGuideDir, ".browser");
export const hotelDatabaseDir = join(hotelGuideDir, "database");
export const hotelPublicDir = join(hotelGuideDir, "public");
export const hotelSourceDir = join(hotelGuideDir, "output", "sources");
