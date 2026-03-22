"use client";

import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect } from "react";
import type { Flight } from "@/types/database";
import "leaflet/dist/leaflet.css";

const MIA_CENTER: [number, number] = [25.7959, -80.287];
const DEFAULT_ZOOM = 7;

interface FlightMapProps {
  flights: Flight[];
  onSelect: (flight: Flight) => void;
  selectedId: string | null;
}

/** Creates a rotated aircraft icon using an SVG data URI. */
function createAircraftIcon(heading: number | null, isSelected: boolean): L.DivIcon {
  const rotation = heading ?? 0;
  const color = isSelected ? "#00d4ff" : "#facc15";
  const size = isSelected ? 28 : 22;

  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="transform: rotate(${rotation}deg); width: ${size}px; height: ${size}px; display: flex; align-items: center; justify-content: center;">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="${color}" style="filter: drop-shadow(0 1px 2px rgba(0,0,0,0.6));">
        <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
      </svg>
    </div>`,
  });
}

/** Fit map bounds to show all flights. */
function MapBoundsUpdater({ flights }: { flights: Flight[] }) {
  const map = useMap();

  useEffect(() => {
    if (flights.length === 0) return;

    const bounds = L.latLngBounds(
      flights.map((f) => [f.latitude!, f.longitude!] as [number, number])
    );
    // Include MIA in bounds
    bounds.extend(MIA_CENTER);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 });
  }, [flights.length > 0]); // Only on first load

  return null;
}

export default function FlightMap({ flights, onSelect, selectedId }: FlightMapProps) {
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
      <Marker
        position={MIA_CENTER}
        icon={L.divIcon({
          className: "",
          iconSize: [12, 12],
          iconAnchor: [6, 6],
          html: `<div style="width:12px;height:12px;background:#00d4ff;border-radius:50%;border:2px solid #fff;box-shadow:0 0 8px #00d4ff;"></div>`,
        })}
      >
        <Popup>
          <strong>MIA</strong>
          <br />
          Miami International Airport
        </Popup>
      </Marker>

      {/* Aircraft markers */}
      {flights.map((flight) => (
        <Marker
          key={flight.id}
          position={[flight.latitude!, flight.longitude!]}
          icon={createAircraftIcon(flight.heading, flight.id === selectedId)}
          eventHandlers={{
            click: () => onSelect(flight),
          }}
        >
          <Popup>
            <div className="text-xs">
              <strong>{flight.flight_iata}</strong> — {flight.airline_name}
              <br />
              {flight.origin_iata} → {flight.destination_iata}
              <br />
              {flight.altitude_ft ? `${flight.altitude_ft.toLocaleString()} ft` : ""}
              {flight.ground_speed_knots ? ` · ${flight.ground_speed_knots} kts` : ""}
            </div>
          </Popup>
        </Marker>
      ))}

      <MapBoundsUpdater flights={flights} />
    </MapContainer>
  );
}
