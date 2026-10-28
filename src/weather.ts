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
