import { createLogger } from '@dead-air/core';

const log = createLogger('weather-client');

export interface WeatherData {
  tempMaxC: number;
  tempMinC: number;
  precipitationMm: number;
  weatherCode: number;
  description: string;
}

/**
 * Map WMO weather codes to human-readable descriptions.
 */
function describeWeatherCode(code: number): string {
  const descriptions: Record<number, string> = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Foggy',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    71: 'Slight snow',
    73: 'Moderate snow',
    75: 'Heavy snow',
    77: 'Snow grains',
    80: 'Slight rain showers',
    81: 'Moderate rain showers',
    82: 'Violent rain showers',
    85: 'Slight snow showers',
    86: 'Heavy snow showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with slight hail',
    99: 'Thunderstorm with heavy hail',
  };
  return descriptions[code] ?? `Weather code ${code}`;
}

/**
 * Fetch historical weather for a date and location from Open-Meteo.
 * Returns null on failure (non-critical data).
 */
export async function fetchWeather(
  date: string,
  latitude: number,
  longitude: number,
): Promise<WeatherData | null> {
  if (!latitude || !longitude) {
    log.warn('No coordinates provided, skipping weather fetch');
    return null;
  }

  const url =
    `https://archive-api.open-meteo.com/v1/archive` +
    `?latitude=${latitude}&longitude=${longitude}` +
    `&start_date=${date}&end_date=${date}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode` +
    `&timezone=America/New_York`;

  log.info(`Fetching weather for ${date} at ${latitude},${longitude}...`);

  try {
    const res = await fetch(url);
    if (!res.ok) {
      log.warn(`Open-Meteo API error: ${res.status}`);
      return null;
    }

    const data = (await res.json()) as {
      daily?: {
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        precipitation_sum?: number[];
        weathercode?: number[];
      };
    };

    const daily = data.daily;
    if (!daily) {
      log.warn('No daily weather data returned');
      return null;
    }

    const tempMax = daily.temperature_2m_max?.[0] ?? 0;
    const tempMin = daily.temperature_2m_min?.[0] ?? 0;
    const precipitation = daily.precipitation_sum?.[0] ?? 0;
    const weatherCode = daily.weathercode?.[0] ?? 0;
    const description = describeWeatherCode(weatherCode);

    log.info(
      `Weather: ${tempMax}°C high, ${tempMin}°C low, ${description}`,
    );

    return {
      tempMaxC: tempMax,
      tempMinC: tempMin,
      precipitationMm: precipitation,
      weatherCode,
      description,
    };
  } catch (err) {
    log.warn(`Weather fetch failed: ${(err as Error).message}`);
    return null;
  }
}
