"use client";

import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";
import L from "leaflet";
import { useEffect, useMemo } from "react";
import { Circle, MapContainer, Marker, TileLayer, Tooltip, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import type { LibraryData } from "@/lib/library";
import { pinClass } from "./status";

type Item = LibraryData["items"][number];

function icon(status: string, failed: boolean) {
  return L.divIcon({
    className: "",
    html: `<span class="block size-4 rounded-full border-2 border-background shadow ${pinClass(status, failed)}"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

/** Fits the view to the data once, when it first has points. */
function FitBounds({ points }: { points: Array<[number, number]> }) {
  const map = useMap();
  const key = points.length > 0;
  useEffect(() => {
    if (!key) return;
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 15 });
    // Only on first data: don't fight the user while live updates arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

export default function LibraryMap({
  items,
  projects,
  spots,
  onSelect,
}: {
  items: Item[];
  projects: LibraryData["projects"];
  spots: LibraryData["spots"];
  onSelect: (id: string) => void;
}) {
  const located = items.filter((i) => i.location);
  const points = useMemo(() => located.map((i) => [i.location!.lat, i.location!.lng] as [number, number]), [located]);

  return (
    <div className="h-[65vh] overflow-hidden rounded-lg border" data-testid="library-map">
      <MapContainer center={[20.6, 79]} zoom={5} className="size-full" scrollWheelZoom>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
        {projects
          .filter((p) => p.centerLat !== null && p.centerLng !== null && p.radiusM)
          .map((p) => (
            <Circle key={p.id} center={[p.centerLat!, p.centerLng!]} radius={p.radiusM!} pathOptions={{ weight: 1, fillOpacity: 0.05 }}>
              <Tooltip>{p.name}</Tooltip>
            </Circle>
          ))}
        {spots.map((s) => (
          <Circle key={s.id} center={[s.lat, s.lng]} radius={s.radiusM} pathOptions={{ weight: 1, dashArray: "4 4", fillOpacity: 0.08 }}>
            <Tooltip>{s.name}</Tooltip>
          </Circle>
        ))}
        <MarkerClusterGroup chunkedLoading>
          {located.map((i) => (
            <Marker key={i.id} position={[i.location!.lat, i.location!.lng]} icon={icon(i.status, i.failed)} eventHandlers={{ click: () => onSelect(i.id) }}>
              <Tooltip>{i.caption ?? i.status}</Tooltip>
            </Marker>
          ))}
        </MarkerClusterGroup>
        <FitBounds points={points} />
      </MapContainer>
    </div>
  );
}
