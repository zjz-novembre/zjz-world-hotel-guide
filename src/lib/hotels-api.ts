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
    cities: payload.cities ?? payload.provinces,
  };
}

function getAppBaseUrl() {
  return new URL(import.meta.env.BASE_URL || "./", window.location.href);
}
