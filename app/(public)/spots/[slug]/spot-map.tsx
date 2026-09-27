"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Circle, CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import type { SpotView } from "@/lib/measure/views";

export default function SpotMap({ spot, photos }: { spot: SpotView["spot"]; photos: SpotView["latest"] }) {
  const bounds = L.latLng(spot.lat, spot.lng).toBounds(Math.max(spot.radiusM * 4, 200));
  return (
    <MapContainer bounds={bounds} scrollWheelZoom={false} className="h-64 w-full rounded-lg border" attributionControl>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Circle center={[spot.lat, spot.lng]} radius={spot.radiusM} pathOptions={{ color: "var(--color-primary)", weight: 2, fillOpacity: 0.1 }} />
      {photos
        .filter((p) => p.location)
        .map((p) => (
          <CircleMarker key={p.id} center={[p.location!.lat, p.location!.lng]} radius={5} pathOptions={{ weight: 1, fillOpacity: 0.8 }}>
            <Tooltip>
              {p.date} · {p.source}
            </Tooltip>
          </CircleMarker>
        ))}
    </MapContainer>
  );
}
