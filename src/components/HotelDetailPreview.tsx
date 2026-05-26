import { ExternalLinkIcon } from "./icons";
import { formatHotelRate, type RankedHotel } from "../lib/hotel-filtering";

type HotelDetailPreviewProps = {
  hotel: RankedHotel;
  onClose: () => void;
};

export function HotelDetailPreview({ hotel, onClose }: HotelDetailPreviewProps) {
  return (
    <div className="hotel-preview" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="hotel-preview__stack" onClick={(event) => event.stopPropagation()}>
        <section className="hotel-preview__card">
          {hotel.hotelImageUrl && (
            <div className="hotel-preview__hero">
              <img alt={hotel.hotelImageAlt || hotel.name} src={hotel.hotelImageUrl} />
            </div>
          )}
          <div className="hotel-preview__body">
            <div className="hotel-preview__title-row">
              <div>
                <h2>{hotel.nameZh || hotel.name}</h2>
                <p>{[hotel.brandZh || hotel.brandEn, hotel.cityNameZh].filter(Boolean).join(" / ")}</p>
              </div>
              <strong>{formatHotelRate(hotel)}</strong>
            </div>
            {Boolean(hotel.descriptionZh || hotel.descriptionEn) && <p className="hotel-preview__intro">{hotel.descriptionZh || hotel.descriptionEn}</p>}
            {Boolean(
              hotel.standardRoomImageUrl ||
                hotel.standardRoomName ||
                hotel.standardBathroomImageUrl ||
                hotel.standardBathroomName ||
                hotel.suiteRoomImageUrl ||
                hotel.suiteRoomName ||
                hotel.suiteBathroomImageUrl ||
                hotel.suiteBathroomName,
            ) && (
              <div className="hotel-preview__rooms">
                <RoomTile imageUrl={hotel.standardRoomImageUrl} name={hotel.standardRoomName} areaSqm={hotel.standardRoomAreaSqm} />
                <RoomTile
                  imageUrl={hotel.standardBathroomImageUrl}
                  name={hotel.standardBathroomName || (hotel.standardBathroomImageUrl ? "客房浴室" : undefined)}
                />
                <RoomTile imageUrl={hotel.suiteRoomImageUrl} name={hotel.suiteRoomName} areaSqm={hotel.suiteRoomAreaSqm} />
                <RoomTile
                  imageUrl={hotel.suiteBathroomImageUrl}
                  name={hotel.suiteBathroomName || (hotel.suiteBathroomImageUrl ? "套房浴室" : undefined)}
                />
              </div>
            )}
          </div>
        </section>
        {hotel.sourceUrl && (
          <a className="hotel-preview__action" href={hotel.sourceUrl} rel="noreferrer" target="_blank">
            <ExternalLinkIcon />
            <span>{hotel.nameEn}</span>
          </a>
        )}
      </div>
    </div>
  );
}

function RoomTile({ areaSqm, imageUrl, name }: { areaSqm?: number; imageUrl?: string; name?: string }) {
  if (!imageUrl && !name) return <span className="hotel-preview__room hotel-preview__room--empty" />;
  return (
    <span className="hotel-preview__room">
      {imageUrl && <img alt={name || ""} src={imageUrl} />}
      <span>
        <b>{name || ""}</b>
        <em>{formatArea(areaSqm)}</em>
      </span>
    </span>
  );
}

function formatArea(areaSqm: number | undefined) {
  if (!Number.isFinite(areaSqm)) return "";
  return `${Math.round(areaSqm!)} sqm`;
}
