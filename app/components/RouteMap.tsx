"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface RouteMapProps {
  route: [number, number][];
}

export default function RouteMap({ route }: RouteMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || route.length === 0) return;
    if (mapInstance.current) {
      mapInstance.current.remove();
      mapInstance.current = null;
    }

    const map = L.map(mapRef.current, { zoomControl: true, attributionControl: true });
    mapInstance.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    const polyline = L.polyline(route, {
      color: "#fc4c02",
      weight: 3,
      opacity: 0.9,
    }).addTo(map);

    // Start and end markers
    const startIcon = L.divIcon({
      className: "",
      html: '<div style="width:12px;height:12px;background:#16a34a;border:2px solid white;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>',
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    });
    const endIcon = L.divIcon({
      className: "",
      html: '<div style="width:12px;height:12px;background:#dc2626;border:2px solid white;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>',
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    });

    L.marker(route[0], { icon: startIcon }).addTo(map);
    L.marker(route[route.length - 1], { icon: endIcon }).addTo(map);

    map.fitBounds(polyline.getBounds(), { padding: [30, 30] });

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [route]);

  return <div ref={mapRef} className="w-full h-full rounded-lg" />;
}
