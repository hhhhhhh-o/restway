const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const ALLOWED_ORIGINS = new Set([
  'https://hhhhhhh-o.github.io',
  'http://localhost:8081',
  'http://localhost:19006',
]);

const FRESH_TTL_SECONDS = 5 * 60;
const STALE_TTL_SECONDS = 24 * 60 * 60;

function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  const allowedOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://hhhhhhh-o.github.io';

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function json(request, body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
  });
}

function parseSearch(url) {
  const latitude = Number(url.searchParams.get('lat'));
  const longitude = Number(url.searchParams.get('lon'));
  const radius = Math.round(Number(url.searchParams.get('radius') ?? 2000));

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error('lat must be between -90 and 90');
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error('lon must be between -180 and 180');
  }
  if (!Number.isFinite(radius) || radius < 100 || radius > 10_000) {
    throw new Error('radius must be between 100 and 10000 metres');
  }

  return {
    latitude: Number(latitude.toFixed(3)),
    longitude: Number(longitude.toFixed(3)),
    radius,
  };
}

function buildQuery({ latitude, longitude, radius }) {
  const paddedRadius = Math.min(radius + 150, 10_150);
  return `[out:json][timeout:20];
nwr["amenity"="toilets"](around:${paddedRadius},${latitude},${longitude});
out center;`;
}

function cacheRequest(requestUrl, search, tier) {
  const url = new URL(requestUrl);
  url.pathname = `/__cache/toilets/${tier}`;
  url.search = new URLSearchParams({
    lat: search.latitude.toFixed(3),
    lon: search.longitude.toFixed(3),
    radius: String(search.radius),
  }).toString();
  return new Request(url, { method: 'GET' });
}

async function fetchOverpass(query) {
  let lastError;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'User-Agent': 'RestWay/0.1 (https://github.com/hhhhhhh-o/restway)',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`Overpass returned ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('All Overpass endpoints failed');
}

async function handleToilets(request, ctx) {
  let search;
  try {
    search = parseSearch(new URL(request.url));
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : 'Invalid query' }, 400);
  }

  const cache = caches.default;
  const freshKey = cacheRequest(request.url, search, 'fresh');
  const staleKey = cacheRequest(request.url, search, 'stale');
  const fresh = await cache.match(freshKey);

  if (fresh) {
    const data = await fresh.json();
    return json(request, { ...data, meta: { ...data.meta, mode: 'cache' } }, 200, {
      'X-RestWay-Data': 'cache',
    });
  }

  try {
    const overpassData = await fetchOverpass(buildQuery(search));
    const payload = {
      elements: overpassData.elements ?? [],
      meta: { mode: 'live', updatedAt: new Date().toISOString() },
    };

    ctx.waitUntil(Promise.all([
      cache.put(freshKey, json(request, payload, 200, { 'Cache-Control': `public, max-age=${FRESH_TTL_SECONDS}` })),
      cache.put(staleKey, json(request, payload, 200, { 'Cache-Control': `public, max-age=${STALE_TTL_SECONDS}` })),
    ]));

    return json(request, payload, 200, { 'X-RestWay-Data': 'live' });
  } catch {
    const stale = await cache.match(staleKey);
    if (stale) {
      const data = await stale.json();
      return json(request, { ...data, meta: { ...data.meta, mode: 'stale' } }, 200, {
        'X-RestWay-Data': 'stale',
      });
    }

    return json(request, { error: 'Toilet data providers are temporarily unavailable' }, 503, {
      'Retry-After': '60',
    });
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/api/toilets') {
      return handleToilets(request, ctx);
    }
    if (request.method === 'GET' && url.pathname === '/health') {
      return json(request, { status: 'ok', service: 'restway-api' });
    }

    return json(request, { error: 'Not found' }, 404);
  },
};
