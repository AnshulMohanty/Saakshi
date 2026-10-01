"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Circle, CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import type { SpotPageData } from "./spot-page";

/** The site radius and each photo's recorded location (OpenStreetMap tiles). */
export default function SpotMap({ map }: { map: NonNullable<SpotPageData["map"]> }) {
  const bounds = L.latLng(map.lat, map.lng).toBounds(Math.max(map.radiusM * 4, 200));
  return (
    <MapContainer bounds={bounds} scrollWheelZoom={false} style={{ height: "256px", width: "100%", borderRadius: "12px", isolation: "isolate" }} attributionControl>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Circle center={[map.lat, map.lng]} radius={map.radiusM} pathOptions={{ color: "var(--primary)", weight: 2, fillOpacity: 0.1 }} />
      {map.pins.map((p) => (
        <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={5} pathOptions={{ color: "var(--measured)", weight: 1, fillOpacity: 0.8 }}>
          <Tooltip>{p.label}</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
