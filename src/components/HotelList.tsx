import { useRef } from "react";
import { formatDistance, formatHotelRate, type RankedHotel } from "../lib/hotel-filtering";

type HotelListProps = {
  hotels: RankedHotel[];
  selectedId: string | null;
  onSelect: (hotelId: string) => void;
  onPreview: (hotelId: string, anchor?: PreviewAnchor) => void;
};

export type PreviewAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function HotelList({ hotels, selectedId, onPreview, onSelect }: HotelListProps) {
  const longPressTimer = useRef<number | null>(null);
  const longPressTriggered = useRef(false);

  const clearLongPress = () => {
    if (longPressTimer.current !== null) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };

  const startLongPress = (hotelId: string, anchor: PreviewAnchor) => {
    clearLongPress();
    longPressTriggered.current = false;
    longPressTimer.current = window.setTimeout(() => {
      longPressTriggered.current = true;
      onPreview(hotelId, anchor);
    }, 520);
  };

  return (
    <div className="hotel-list" role="table" aria-label="酒店列表">
      <div className="hotel-list__head" role="row">
        <span role="columnheader">酒店</span>
        <span role="columnheader">人均</span>
        <span role="columnheader">客房</span>
      </div>

      <div className="hotel-list__body">
        {hotels.map((hotel) => (
          <button
            key={hotel.id}
            className={hotel.id === selectedId ? "hotel-row hotel-row--active" : "hotel-row"}
            role="row"
            type="button"
            onClick={() => {
              if (longPressTriggered.current) {
                longPressTriggered.current = false;
                return;
              }
              onSelect(hotel.id);
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              onPreview(hotel.id, rectAnchor(event.currentTarget));
            }}
            onPointerCancel={clearLongPress}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              startLongPress(hotel.id, rectAnchor(event.currentTarget));
            }}
            onPointerLeave={clearLongPress}
            onPointerUp={clearLongPress}
          >
            <span className="hotel-row__thumb" role="cell">
              {hotel.hotelImageUrl ? (
                <img alt={hotel.hotelImageAlt || hotel.name} src={hotel.hotelImageUrl} />
              ) : (
                <span>{hotel.nameZh.slice(0, 1) || hotel.nameEn.slice(0, 1)}</span>
              )}
            </span>
            <span className="hotel-row__name-cell" role="cell">
              <span className="hotel-row__name">{hotel.nameZh || hotel.name}</span>
              <span className="hotel-row__meta">{formatDistance(hotel.distanceKm)}</span>
            </span>
            <span className="hotel-row__rate" role="cell">
              {formatHotelRate(hotel)}
            </span>
            <span className="hotel-row__room" role="cell">
              {hotel.standardRoomImageUrl && <img alt={hotel.standardRoomName || hotel.name} src={hotel.standardRoomImageUrl} />}
              <span>{formatRoomArea(hotel.standardRoomAreaSqm)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function rectAnchor(element: HTMLElement): PreviewAnchor {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

function formatRoomArea(areaSqm: number | undefined) {
  if (!Number.isFinite(areaSqm)) return "";
  return `${Math.round(areaSqm!)} sqm`;
}
