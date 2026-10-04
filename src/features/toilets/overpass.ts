import type { Coordinates, Toilet } from './types';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const RESTWAY_API_URL = process.env.EXPO_PUBLIC_RESTWAY_API_URL?.replace(/\/$/, '');
const LOCAL_CACHE_PREFIX = 'restway:toilets:v1';

const DEFAULT_SEARCH_RADIUS_METERS = 2_000;
const MAX_SEARCH_RADIUS_METERS = 10_000;

type OverpassElement = {
  id: number;
  type: 'node' | 'way' | 'relation';
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

type OverpassResponse = {
  elements?: OverpassElement[];
  meta?: {
    mode?: 'live' | 'cache' | 'stale';
    updatedAt?: string;
  };
};

export type ToiletSearchResult = {
  toilets: Toilet[];
  source: 'live' | 'cache';
  updatedAt: string;
};

function buildQuery(origin: Coordinates, requestedRadiusMeters: number) {
  const { latitude, longitude } = origin;
  const searchRadiusMeters = Math.min(
    Math.max(Math.round(requestedRadiusMeters), 100),
    MAX_SEARCH_RADIUS_METERS,
  );

  return `[out:json][timeout:20];
nwr["amenity"="toilets"](around:${searchRadiusMeters},${latitude},${longitude});
out center;`;
}

function distanceInMeters(from: Coordinates, to: Coordinates) {
  const earthRadius = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);

  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadius * Math.asin(Math.sqrt(a));
}

function getAddress(tags: Record<string, string>) {
  const street = tags['addr:street'];
  const houseNumber = tags['addr:housenumber'];

  if (!street) return undefined;
  return houseNumber ? `${street}${houseNumber}号` : street;
}

function toToilet(element: OverpassElement, origin: Coordinates): Toilet | null {
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;

  if (latitude === undefined || longitude === undefined) return null;

  const tags = element.tags ?? {};
  const operatorName = tags.operator ? `${tags.operator}公共厕所` : undefined;

  return {
    id: `${element.type}-${element.id}`,
    name: tags['name:zh'] ?? tags.name ?? operatorName ?? '公共厕所',
    latitude,
    longitude,
    distanceMeters: Math.round(distanceInMeters(origin, { latitude, longitude })),
    address: getAddress(tags),
    fee: tags.fee,
    openingHours: tags.opening_hours,
    wheelchair: tags.wheelchair,
  };
}

async function requestEndpoint(endpoint: string, query: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Overpass request failed with ${response.status}`);
    }

    return (await response.json()) as OverpassResponse;
  } finally {
    clearTimeout(timeout);
  }
}

function cacheKey(origin: Coordinates, searchRadiusMeters: number) {
  return [
    LOCAL_CACHE_PREFIX,
    origin.latitude.toFixed(3),
    origin.longitude.toFixed(3),
    Math.round(searchRadiusMeters),
  ].join(':');
}

function readLocalCache(origin: Coordinates, searchRadiusMeters: number): ToiletSearchResult | null {
  if (typeof localStorage === 'undefined') return null;

  try {
    const value = localStorage.getItem(cacheKey(origin, searchRadiusMeters));
    if (!value) return null;
    const parsed = JSON.parse(value) as ToiletSearchResult;
    return Array.isArray(parsed.toilets) ? { ...parsed, source: 'cache' } : null;
  } catch {
    return null;
  }
}

function writeLocalCache(origin: Coordinates, searchRadiusMeters: number, result: ToiletSearchResult) {
  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(cacheKey(origin, searchRadiusMeters), JSON.stringify(result));
  } catch {
    // Storage can be unavailable in private browsing. A failed cache write must not fail the search.
  }
}

function parseResponse(data: OverpassResponse, origin: Coordinates) {
  return (data.elements ?? [])
    .map((element) => toToilet(element, origin))
    .filter((toilet): toilet is Toilet => toilet !== null)
    .sort((first, second) => first.distanceMeters - second.distanceMeters);
}

async function requestRestWayApi(origin: Coordinates, searchRadiusMeters: number) {
  if (!RESTWAY_API_URL) return null;

  const url = new URL(`${RESTWAY_API_URL}/api/toilets`);
  url.searchParams.set('lat', String(origin.latitude));
  url.searchParams.set('lon', String(origin.longitude));
  url.searchParams.set('radius', String(searchRadiusMeters));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`RestWay API request failed with ${response.status}`);
    return (await response.json()) as OverpassResponse;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchNearbyToilets(
  origin: Coordinates,
  searchRadiusMeters = DEFAULT_SEARCH_RADIUS_METERS,
): Promise<ToiletSearchResult> {
  const query = buildQuery(origin, searchRadiusMeters);
  let lastError: unknown;

  try {
    const apiData = await requestRestWayApi(origin, searchRadiusMeters);
    if (apiData) {
      const result: ToiletSearchResult = {
        toilets: parseResponse(apiData, origin),
        source: apiData.meta?.mode === 'stale' ? 'cache' : 'live',
        updatedAt: apiData.meta?.updatedAt ?? new Date().toISOString(),
      };
      writeLocalCache(origin, searchRadiusMeters, result);
      return result;
    }
  } catch (error) {
    lastError = error;
  }

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const data = await requestEndpoint(endpoint, query);
      const result: ToiletSearchResult = {
        toilets: parseResponse(data, origin),
        source: 'live',
        updatedAt: new Date().toISOString(),
      };
      writeLocalCache(origin, searchRadiusMeters, result);
      return result;
    } catch (error) {
      lastError = error;
    }
  }

  const cached = readLocalCache(origin, searchRadiusMeters);
  if (cached) return cached;

  throw lastError instanceof Error ? lastError : new Error('Unable to load toilet data');
}
