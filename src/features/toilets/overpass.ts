import type { Coordinates, Toilet } from './types';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

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

export async function fetchNearbyToilets(
  origin: Coordinates,
  searchRadiusMeters = DEFAULT_SEARCH_RADIUS_METERS,
) {
  const query = buildQuery(origin, searchRadiusMeters);
  let lastError: unknown;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const data = await requestEndpoint(endpoint, query);
      return (data.elements ?? [])
        .map((element) => toToilet(element, origin))
        .filter((toilet): toilet is Toilet => toilet !== null)
        .sort((first, second) => first.distanceMeters - second.distanceMeters);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unable to load toilet data');
}
