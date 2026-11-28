'use client';

import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useEffect, useMemo } from 'react';
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';

import { roundCoordinate } from '@/lib/contact-links';

/**
 * نقشهٔ موقعیت مکانی سالن (OpenStreetMap + Leaflet).
 *
 * فقط به‌صورت dynamic با `ssr: false` بارگذاری می‌شود (leaflet به `window`
 * نیاز دارد)؛ بنابراین این فایل هرگز وارد سمت سرور نمی‌شود. pin با
 * `L.divIcon` ساخته می‌شود تا مشکل مسیر آیکون‌های پیش‌فرض leaflet در
 * bundler پیش نیاید.
 *
 * رفتار:
 *   - روی نقشه کلیک → انتخاب موقعیت
 *   - pin قابل drag → جابه‌جایی موقعیت
 *   - تغییر مقدار از بیرون (مکان‌یابی/لینک گوگل‌مپ) → پرواز نقشه روی pin
 */

const TEHRAN: [number, number] = [35.6892, 51.389];

const pinIcon = L.divIcon({
  className: '',
  html: '<div style="width:26px;height:26px;border-radius:9999px;background:#0f766e;border:3px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></div>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

export type LocationMapProps = {
  latitude: number | null;
  longitude: number | null;
  onChange: (latitude: number, longitude: number) => void;
};

/** کلیک روی نقشه → انتخاب موقعیت (با گردکردن همان مقیاس دیتابیس). */
function ClickSetter({
  onChange,
}: {
  onChange: (latitude: number, longitude: number) => void;
}) {
  useMapEvents({
    click: event => {
      onChange(
        roundCoordinate(event.latlng.lat),
        roundCoordinate(event.latlng.lng),
      );
    },
  });
  return null;
}

/** پرواز نقشه به موقعیتِ جدیدِ ثبت‌شده (مکان‌یابی/لینک/جرّ پین). */
function Recenter({ target }: { target: [number, number] | null }) {
  const map = useMap();
  const [targetLat, targetLng] = target ?? [];
  useEffect(() => {
    if (targetLat === undefined || targetLng === undefined) return;
    const current = map.getCenter();
    if (
      Math.abs(current.lat - targetLat) > 1e-7 ||
      Math.abs(current.lng - targetLng) > 1e-7
    ) {
      map.flyTo([targetLat, targetLng], Math.max(map.getZoom(), 14), {
        duration: 0.4,
      });
    }
  }, [map, targetLat, targetLng]);
  return null;
}

export default function LocationMap({
  latitude,
  longitude,
  onChange,
}: LocationMapProps) {
  const hasPosition =
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude);

  const position = useMemo<[number, number] | null>(
    () => (hasPosition ? [latitude as number, longitude as number] : null),
    [hasPosition, latitude, longitude],
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-input">
      <MapContainer
        center={position ?? TEHRAN}
        zoom={position ? 15 : 11}
        className="h-64 w-full"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickSetter onChange={onChange} />
        <Recenter target={position} />
        {position && (
          <Marker
            position={position}
            icon={pinIcon}
            draggable
            eventHandlers={{
              dragend: event => {
                const latLng = (event.target as L.Marker).getLatLng();
                onChange(
                  roundCoordinate(latLng.lat),
                  roundCoordinate(latLng.lng),
                );
              },
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}
