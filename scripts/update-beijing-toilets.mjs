import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const endpoints = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const query = `[out:json][timeout:120];
nwr["amenity"="toilets"](39.4,115.4,41.1,117.6);
out center;`;

async function request(endpoint) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 150_000);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'User-Agent': 'RestWay data updater (https://github.com/hhhhhhh-o/restway)',
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${endpoint} returned ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

let data;
let lastError;
for (const endpoint of endpoints) {
  try {
    data = await request(endpoint);
    break;
  } catch (error) {
    lastError = error;
    console.warn(error instanceof Error ? error.message : error);
  }
}

if (!data) throw lastError ?? new Error('All Overpass endpoints failed');

const outputPath = resolve('public/data/beijing-toilets.json');
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify({
  updatedAt: new Date().toISOString(),
  elements: data.elements ?? [],
}, null, 2)}\n`);

console.log(`Saved ${data.elements?.length ?? 0} Beijing toilet records to ${outputPath}`);
