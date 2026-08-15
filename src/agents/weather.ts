import { AIRPORT_NAMES } from '../lib/config';

const WEATHER_CITIES: Record<string, string> = {
  HND: 'Tokyo',
  NRT: 'Tokyo',
  HKG: 'Hong Kong',
  ICN: 'Seoul',
  SIN: 'Singapore',
  BKK: 'Bangkok',
};

interface DailyWeather {
  date: string;
  maxTemp: number;
  minTemp: number;
  precipitation: number;
  condition: string;
}

function wmoCodeToCondition(code: number): string {
  if (code === 0) return 'Clear sky';
  if ([1, 2, 3].includes(code)) return 'Partly cloudy';
  if ([45, 48].includes(code)) return 'Foggy';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow';
  if ([95, 96, 99].includes(code)) return 'Thunderstorm';
  return 'Unknown';
}

export async function getWeatherForecast(destinationCode: string, startDate: Date, endDate: Date): Promise<string | null> {
  const city = WEATHER_CITIES[destinationCode] || AIRPORT_NAMES[destinationCode] || destinationCode;

  try {
    const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`);
    if (!geoRes.ok) return null;
    const geoData = await geoRes.json() as any;
    if (!geoData.results || geoData.results.length === 0) return null;

    const { latitude, longitude, name, country } = geoData.results[0];
    const start = startDate.toISOString().split('T')[0];
    const end = endDate.toISOString().split('T')[0];

    const forecastRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&start_date=${start}&end_date=${end}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&timezone=auto`
    );
    if (!forecastRes.ok) return null;
    const data = await forecastRes.json() as any;
    if (!data.daily) return null;

    const days: DailyWeather[] = data.daily.time.map((date: string, i: number) => ({
      date,
      maxTemp: data.daily.temperature_2m_max[i],
      minTemp: data.daily.temperature_2m_min[i],
      precipitation: data.daily.precipitation_sum[i],
      condition: wmoCodeToCondition(data.daily.weathercode[i])
    }));

    const summary = days.map(d => {
      const rain = d.precipitation > 0 ? `, ${d.precipitation}mm rain` : '';
      return `- **${d.date}**: ${d.condition}, high ${Math.round(d.maxTemp)}°C / low ${Math.round(d.minTemp)}°C${rain}`;
    }).join('\n');

    return `## 🌤️ Weather Outlook for ${name}${country ? `, ${country}` : ''}\n\n${summary}`;
  } catch (error) {
    console.log('Weather lookup failed:', (error as Error).message);
    return null;
  }
}
