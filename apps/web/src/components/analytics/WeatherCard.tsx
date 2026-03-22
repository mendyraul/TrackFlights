"use client";

import type { WeatherSnapshot } from "@/types/database";

interface Props {
  weather: WeatherSnapshot | null;
}

function windDirection(deg: number | null): string {
  if (deg == null) return "--";
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}

export function WeatherCard({ weather }: Props) {
  if (!weather) {
    return (
      <div className="rounded-lg border border-gray-800 bg-mia-panel p-4">
        <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500">
          Current Weather — MIA
        </h3>
        <p className="mt-4 text-center text-sm text-gray-600">
          No weather data available
        </p>
      </div>
    );
  }

  const items = [
    {
      label: "Temperature",
      value: weather.temperature_c != null ? `${weather.temperature_c}°C` : "--",
      sub: weather.feels_like_c != null ? `Feels ${weather.feels_like_c}°C` : "",
    },
    {
      label: "Wind",
      value: weather.wind_speed_knots != null ? `${weather.wind_speed_knots} kts` : "--",
      sub: `${windDirection(weather.wind_direction_deg)}${
        weather.wind_gust_knots ? ` G${weather.wind_gust_knots}` : ""
      }`,
    },
    {
      label: "Visibility",
      value: weather.visibility_km != null ? `${weather.visibility_km} km` : "--",
    },
    {
      label: "Precipitation",
      value: weather.precipitation_mm != null ? `${weather.precipitation_mm} mm` : "0 mm",
    },
    {
      label: "Clouds",
      value: weather.cloud_coverage_pct != null ? `${weather.cloud_coverage_pct}%` : "--",
    },
    {
      label: "Humidity",
      value: weather.humidity_pct != null ? `${weather.humidity_pct}%` : "--",
    },
  ];

  const alerts: string[] = [];
  if (weather.is_thunderstorm) alerts.push("Thunderstorm");
  if (weather.is_fog) alerts.push("Fog");
  if (weather.is_freezing) alerts.push("Freezing");
  if ((weather.wind_speed_knots ?? 0) > 25) alerts.push("High winds");

  return (
    <div className="rounded-lg border border-gray-800 bg-mia-panel p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500">
          Current Weather — MIA
        </h3>
        <span className="text-xs text-gray-600">
          {weather.weather_description}
        </span>
      </div>

      {alerts.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {alerts.map((alert) => (
            <span
              key={alert}
              className="rounded-full bg-red-500/10 border border-red-500/30 px-2 py-0.5 text-xs text-red-400"
            >
              {alert}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 grid grid-cols-3 gap-3 md:grid-cols-6">
        {items.map((item) => (
          <div key={item.label}>
            <p className="text-xs text-gray-500">{item.label}</p>
            <p className="text-sm font-semibold text-gray-200">{item.value}</p>
            {item.sub && (
              <p className="text-xs text-gray-600">{item.sub}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
