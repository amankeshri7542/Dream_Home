// "Where is your plot?": a searchable list of Indian cities, plus "Use my
// location" (asked only when tapped, rounded to 0.1°). Picking one gives the
// home a true sun path.
import { useEffect, useState } from "react";
import type { PlotLocation } from "../domain/types";
import { Icon } from "../ui/icons";
import { Button } from "../ui/primitives";
import { findCities, loadCities, nearestCity, type City } from "./cities";
import "./insights.css";

const degrees = (l: PlotLocation) => `${Math.abs(l.lat).toFixed(1)}°${l.lat >= 0 ? "N" : "S"}, ${Math.abs(l.lon).toFixed(1)}°${l.lon >= 0 ? "E" : "W"}`;

export function CityPicker({
  value,
  onPick,
  label = "Your city",
}: {
  value?: PlotLocation;
  onPick: (location: PlotLocation | null) => void;
  label?: string;
}) {
  const [editing, setEditing] = useState(!value);
  const [query, setQuery] = useState("");
  const [cities, setCities] = useState<City[] | null>(null);
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (!editing || cities) return;
    let live = true;
    void loadCities().then((list) => live && setCities(list));
    return () => {
      live = false;
    };
  }, [editing, cities]);
  const pick = (location: PlotLocation) => {
    onPick(location);
    setEditing(false);
    setQuery("");
    setStatus("");
  };
  const here = () => {
    if (!navigator.geolocation) return setStatus("This browser can’t share your location. Type your city instead.");
    setStatus("Finding you…");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        // A city's worth of precision is all the sun needs.
        const lat = Math.round(pos.coords.latitude * 10) / 10,
          lon = Math.round(pos.coords.longitude * 10) / 10;
        const near = nearestCity(cities ?? (await loadCities()), lat, lon);
        pick({ city: near && near.km < 60 ? `Near ${near.city.name}` : "My location", lat, lon });
      },
      () => setStatus("Couldn’t get your location. Type your city instead."),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
    );
  };

  if (value && !editing)
    return (
      <div className="dh-city is-set">
        <Icon.location size={20} aria-hidden />
        <span>
          <strong>{value.city}</strong>
          <small>{degrees(value)}</small>
        </span>
        <Button variant="ghost" onClick={() => setEditing(true)}>
          Change
        </Button>
      </div>
    );
  const results = cities ? findCities(cities, query) : [];
  return (
    <div className="dh-city">
      <label className="dh-field">
        <span>{label}</span>
        <input
          type="search"
          value={query}
          placeholder="Type a city, e.g. Pune"
          aria-label="Find your city"
          enterKeyHint="search"
          autoComplete="off"
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <ul className="dh-city-results" aria-label="Cities">
        {results.map((c) => (
          <li key={c.name}>
            <button type="button" onClick={() => pick({ city: c.name, lat: c.lat, lon: c.lon })}>
              {c.name}
              <small>{c.state}</small>
            </button>
          </li>
        ))}
        {cities && query.trim() && !results.length && <li className="dh-city-none">No city by that name. Try a nearby big city.</li>}
      </ul>
      <div className="dh-city-actions">
        <Button icon={Icon.locate} onClick={here}>
          Use my location
        </Button>
        {value && (
          <Button variant="ghost" onClick={() => setEditing(false)}>
            Keep {value.city}
          </Button>
        )}
      </div>
      {status && (
        <p className="dh-note" role="status">
          {status}
        </p>
      )}
    </div>
  );
}
