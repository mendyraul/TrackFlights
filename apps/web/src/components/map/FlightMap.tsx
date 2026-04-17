"use client";

import { memo, useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import type { Flight } from "@/types/database";
import "leaflet/dist/leaflet.css";

const MIA_CENTER: [number, number] = [25.7959, -80.287];
const DEFAULT_ZOOM = 7;

interface FlightMapProps {
  flights: Flight[];
  onSelect: (flight: Flight) => void;
  selectedId: string | null;
  routeLine: {
    origin: [number, number];
    destination: [number, number];
  } | null;
  recentlyChanged: Set<string>;
}

// ── Aircraft Icon ──────────────────────────────────────────────────────

function createAircraftIcon(
  heading: number | null,
  isSelected: boolean,
  isChanged: boolean
): L.DivIcon {
  const rotation = heading ?? 0;
  const color = isSelected ? "#00d4ff" : isChanged ? "#f97316" : "#facc15";
  const size = isSelected ? 28 : 22;
  const glow = isChanged ? "drop-shadow(0 0 6px #f97316)" : "drop-shadow(0 1px 2px rgba(0,0,0,0.6))";

  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="transform:rotate(${rotation}deg);width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;transition:transform 1s ease;">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="${color}" style="filter:${glow};transition:fill 0.5s ease;">
        <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
      </svg>
    </div>`,
  });
}

// ── MIA Airport Marker ─────────────────────────────────────────────────

const MIA_ICON = L.divIcon({
  className: "",
  iconSize: [14, 14],
  iconAnchor: [7, 7],
  html: `<div style="width:14px;height:14px;background:#00d4ff;border-radius:50%;border:2px solid #fff;box-shadow:0 0 10px #00d4ff;"></div>`,
});

// ── Smooth Marker (animates position changes) ──────────────────────────

function SmoothMarker({
  flight,
  isSelected,
  isChanged,
  onSelect,
}: {
  flight: Flight;
  isSelected: boolean;
  isChanged: boolean;
  onSelect: () => void;
}) {
  const markerRef = useRef<L.Marker>(null);
  const prevPos = useRef<[number, number]>([flight.latitude!, flight.longitude!]);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;

    const newPos: [number, number] = [flight.latitude!, flight.longitude!];

    // Animate if position changed
    if (prevPos.current[0] !== newPos[0] || prevPos.current[1] !== newPos[1]) {
      const start = prevPos.current;
      const end = newPos;
      const duration = 1000; // 1 second transition
      const startTime = performance.now();

      function animate(now: number) {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / duration, 1);
        // Ease-out cubic
        const ease = 1 - Math.pow(1 - t, 3);
        const lat = start[0] + (end[0] - start[0]) * ease;
        const lng = start[1] + (end[1] - start[1]) * ease;
        marker!.setLatLng([lat, lng]);
        if (t < 1) requestAnimationFrame(animate);
      }

      requestAnimationFrame(animate);
      prevPos.current = newPos;
    }

    // Update icon (heading/selection/change state may have changed)
    marker.setIcon(createAircraftIcon(flight.heading, isSelected, isChanged));
  }, [flight.latitude, flight.longitude, flight.heading, isSelected, isChanged]);

  return (
    <Marker
      ref={markerRef}
      position={[flight.latitude!, flight.longitude!]}
      icon={createAircraftIcon(flight.heading, isSelected, isChanged)}
      eventHandlers={{ click: onSelect }}
    >
      <Popup>
        <div style={{ fontSize: 12 }}>
          <strong>{flight.flight_iata}</strong> — {flight.airline_name}
          <br />
          {flight.origin_iata} → {flight.destination_iata}
          <br />
          {flight.altitude_ft ? `${flight.altitude_ft.toLocaleString()} ft` : ""}
          {flight.ground_speed_knots ? ` · ${flight.ground_speed_knots} kts` : ""}
        </div>
      </Popup>
    </Marker>
  );
}

// ── Bounds Updater ─────────────────────────────────────────────────────

function MapBoundsUpdater({ flights }: { flights: Flight[] }) {
  const map = useMap();
  const hasFitted = useRef(false);
  const flightCount = flights.length;

  useEffect(() => {
    if (hasFitted.current || flightCount === 0) return;

    const bounds = L.latLngBounds(
      flights.map((f) => [f.latitude!, f.longitude!] as [number, number])
    );
    bounds.extend(MIA_CENTER);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 });
    hasFitted.current = true;
  }, [flightCount, flights, map]);

  return null;
}

// ── Cluster Icon ───────────────────────────────────────────────────────

function createClusterIcon(cluster: any): L.DivIcon {
  const count = cluster.getChildCount();
  const size = count < 10 ? 36 : count < 50 ? 44 : 52;

  return L.divIcon({
    html: `<div style="
      width:${size}px;height:${size}px;
      background:rgba(250,204,21,0.15);
      border:2px solid rgba(250,204,21,0.6);
      border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      color:#facc15;font-weight:700;font-size:13px;
      box-shadow:0 0 12px rgba(250,204,21,0.3);
    ">${count}</div>`,
    className: "",
    iconSize: [size, size],
  });
}

// ── Main Component ─────────────────────────────────────────────────────

function FlightMapInner({
  flights,
  onSelect,
  selectedId,
  routeLine,
  recentlyChanged,
}: FlightMapProps) {
  return (
    <MapContainer
      center={MIA_CENTER}
      zoom={DEFAULT_ZOOM}
      className="h-full w-full"
      style={{ background: "#0a0a1a" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />

      {/* MIA airport marker */}
      <Marker position={MIA_CENTER} icon={MIA_ICON}>
        <Popup>
          <strong>MIA</strong><br />Miami International Airport
        </Popup>
      </Marker>

      {routeLine && (
        <Polyline
          positions={[routeLine.origin, routeLine.destination]}
          pathOptions={{
            color: "#22d3ee",
            weight: 3,
            opacity: 0.9,
            dashArray: "8 8",
          }}
        />
      )}

      {/* Aircraft markers with clustering */}
      <MarkerClusterGroup
        chunkedLoading
        iconCreateFunction={createClusterIcon}
        maxClusterRadius={60}
        spiderfyOnMaxZoom
        disableClusteringAtZoom={10}
      >
        {flights.map((flight) => (
          <SmoothMarker
            key={flight.id}
            flight={flight}
            isSelected={flight.id === selectedId}
            isChanged={recentlyChanged.has(flight.id)}
            onSelect={() => onSelect(flight)}
          />
        ))}
      </MarkerClusterGroup>

      <MapBoundsUpdater flights={flights} />
    </MapContainer>
  );
}

export default memo(FlightMapInner);
