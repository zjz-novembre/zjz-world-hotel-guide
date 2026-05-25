import { wgs84ToGcj02 } from "./coordinates";
import type { HotelsPayload } from "../types";

export async function loadHotels() {
  const response = await fetch(new URL("hotels.json", getAppBaseUrl()), {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Hotel dataset failed: ${response.status}`);
  }

  const payload = (await response.json()) as HotelsPayload;
  if (payload.count !== payload.hotels.length) {
    throw new Error("Hotel dataset returned an invalid payload");
  }

  return {
    ...payload,
    hotels: payload.hotels.map((hotel) => ({
      ...hotel,
      position: hotel.position ? wgs84ToGcj02(hotel.position) : undefined,
    })),
    provinces: payload.provinces.map((province) => ({
      ...province,
      center: wgs84ToGcj02(province.center),
    })),
    cities: (payload.cities ?? payload.provinces).map((city) => ({
      ...city,
      center: wgs84ToGcj02(city.center),
    })),
  };
}

function getAppBaseUrl() {
  return new URL(import.meta.env.BASE_URL || "./", window.location.href);
}
