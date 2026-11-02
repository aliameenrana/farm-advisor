export async function forecast(lat: number, lon: number): Promise<string | null> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max' +
    '&timezone=Asia%2FKarachi&forecast_days=4';
  const res = await fetch(url);
  if (!res.ok) return null;
  const d = ((await res.json()) as {
    daily?: {
      time: string[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_sum: number[];
      precipitation_probability_max: number[];
      wind_speed_10m_max: number[];
    };
  }).daily;
  if (!d) return null;
  return d.time
    .map(
      (day, i) =>
        `${day}: ${d.temperature_2m_min[i]}–${d.temperature_2m_max[i]}°C, rain ${d.precipitation_sum[i]} mm ` +
        `(chance ${d.precipitation_probability_max[i]}%), wind up to ${d.wind_speed_10m_max[i]} km/h`,
    )
    .join('\n');
}

// Open-Meteo's geocoder needs no key; limited to Pakistan so "Sahiwal" is
// not resolved to a namesake elsewhere.
export async function findPlace(name: string): Promise<{ lat: number; lon: number; label: string } | null> {
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&countryCode=PK&language=en`,
  );
  if (!res.ok) return null;
  const r = ((await res.json()) as { results?: { latitude: number; longitude: number; name: string; admin1?: string; admin2?: string }[] })
    .results?.[0];
  return r ? { lat: r.latitude, lon: r.longitude, label: [r.name, r.admin2, r.admin1].filter(Boolean).join(', ') } : null;
}

// Nominatim's policy asks for an identifying User-Agent and at most one
// request a second; this runs once per shared location.
export async function placeName(lat: number, lon: number): Promise<string | null> {
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=10&accept-language=en&lat=${lat}&lon=${lon}`, {
    headers: { 'User-Agent': 'farm-advisor prototype (WhatsApp potato advisor)' },
  });
  if (!res.ok) return null;
  const a = ((await res.json()) as { address?: Record<string, string> }).address ?? {};
  return [a.city ?? a.town ?? a.village ?? a.county, a.state_district ?? a.district, a.state].filter(Boolean).join(', ') || null;
}
