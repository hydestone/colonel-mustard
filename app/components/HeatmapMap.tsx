"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let shift = 0, result = 0, byte;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

interface HeatmapProps {
  polylines: { polyline: string; type: string }[];
}

export default function HeatmapMap({ polylines }: HeatmapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || polylines.length === 0) return;
    if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }

    const map = L.map(mapRef.current, { zoomControl: true });
    mapInstance.current = map;

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; OSM &copy; CARTO",
    }).addTo(map);

    const bounds = L.latLngBounds([]);

    for (const p of polylines) {
      const coords = decodePolyline(p.polyline);
      if (coords.length < 2) continue;
      const color = p.type === "Run" ? "#fc4c02" : p.type === "Ride" ? "#2563eb" : "#16a34a";
      const line = L.polyline(coords, { color, weight: 1.5, opacity: 0.25 }).addTo(map);
      bounds.extend(line.getBounds());
    }

    if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });

    return () => { if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; } };
  }, [polylines]);

  return <div ref={mapRef} className="w-full h-full" />;
}
