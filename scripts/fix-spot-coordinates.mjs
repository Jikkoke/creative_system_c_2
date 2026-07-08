import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');
const SPOTS_PATH = path.join(DATA_DIR, 'spots.json');
const RESOLVED_PATH = path.join(DATA_DIR, 'nago_spot_resolved.json');
const UNRESOLVED_PATH = path.join(DATA_DIR, 'unresolved-spots.json');
const FIXES_PATH = path.join(DATA_DIR, 'coordinate-fixes.json');
const ENV_PATH = path.join(ROOT, '.env.local');

const TARGETS = [
  {
    name: 'なかむら製菓',
    aliases: ['なかむら製菓', 'なかむら製菓 名護市'],
    addressHint: '名護市',
  },
  {
    name: '宮城菓子店',
    aliases: ['宮城菓子店', '宮城菓子店 名護市'],
    addressHint: '名護市',
  },
  {
    name: 'HEY BURGER',
    aliases: ['HEY BURGER', 'HEYバーガー', 'HEY BURGER 名護市', 'HEYバーガー 名護市'],
    addressHint: '名護市',
  },
];
const HITOHAKO_NAME = 'ヒトハコ　-HITOHAKO-';
const HITOHAKO_ADDRESS = '沖縄県名護市大中1丁目2-1';

function verificationUrl(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function normalizeText(value) {
  return String(value ?? '').normalize('NFKC').trim();
}

function parseDotEnv(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

async function loadApiKey() {
  if (process.env.GOOGLE_MAPS_API_KEY) return process.env.GOOGLE_MAPS_API_KEY;
  if (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  try {
    const text = await readFile(ENV_PATH, 'utf8');
    const env = parseDotEnv(text);
    return env.GOOGLE_MAPS_API_KEY || env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || null;
  } catch {
    return null;
  }
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function namesMatch(expected, actual) {
  const a = normalizeText(expected).replace(/\s+/g, '').toLowerCase();
  const b = normalizeText(actual).replace(/\s+/g, '').toLowerCase();
  return a === b || a.includes(b) || b.includes(a);
}

async function findPlace(target, apiKey) {
  for (const query of target.aliases) {
    const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
    url.searchParams.set('query', query);
    url.searchParams.set('language', 'ja');
    url.searchParams.set('region', 'jp');
    url.searchParams.set('key', apiKey);
    const payload = await fetchJson(url);
    const results = Array.isArray(payload.results) ? payload.results : [];
    for (const result of results) {
      const address = normalizeText(result.formatted_address);
      if (!address.includes(target.addressHint)) continue;
      if (!namesMatch(target.name, result.name)) continue;
      return result;
    }
  }
  return null;
}

async function fetchPlaceDetails(placeId, apiKey) {
  const url = new URL('https://places.googleapis.com/v1/places/' + placeId);
  url.searchParams.set('languageCode', 'ja');
  const payload = await fetchJson(url, {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,googleMapsUri',
    },
  });
  return payload;
}

async function main() {
  const apiKey = await loadApiKey();
  if (!apiKey) {
    throw new Error('GOOGLE_MAPS_API_KEY が見つからなかったため、3件の座標修正を実行できません。');
  }

  const spotsData = JSON.parse(await readFile(SPOTS_PATH, 'utf8'));
  const resolvedRows = JSON.parse(await readFile(RESOLVED_PATH, 'utf8'));
  const unresolvedRows = JSON.parse(await readFile(UNRESOLVED_PATH, 'utf8'));
  const spots = Array.isArray(spotsData.spots) ? spotsData.spots : [];
  const fixes = [];
  const unresolved = [...unresolvedRows];

  for (const target of TARGETS) {
    const spot = spots.find((entry) => entry.name === target.name);
    if (!spot) {
      unresolved.push({
        name: target.name,
        googleMapsUrl: null,
        reason: 'data/spots.json に対象スポットが見つからなかった',
      });
      continue;
    }

    const result = await findPlace(target, apiKey);
    if (!result?.place_id || !result.geometry?.location) {
      unresolved.push({
        name: target.name,
        googleMapsUrl: spot.googleMapsUrl ?? null,
        reason: 'Google Places API で一致する店舗を特定できなかった',
      });
      continue;
    }

    const details = await fetchPlaceDetails(result.place_id, apiKey);
    const location = details.location ?? result.geometry.location;
    if (!location?.latitude || !location?.longitude) {
      unresolved.push({
        name: target.name,
        googleMapsUrl: spot.googleMapsUrl ?? null,
        reason: 'Place Details から location を取得できなかった',
      });
      continue;
    }

    const oldLat = spot.lat;
    const oldLng = spot.lng;
    const newLat = location.latitude;
    const newLng = location.longitude;

    spot.lat = newLat;
    spot.lng = newLng;
    spot.googleMapsUrl = details.googleMapsUri ?? spot.googleMapsUrl;
    spot.coordinateSource = 'google_places_location';
    spot.placeId = details.id ?? result.place_id;
    spot.address = details.formattedAddress ?? spot.address;
    spot.verificationGoogleMapsUrl = verificationUrl(newLat, newLng);

    const resolved = resolvedRows.find((entry) => entry.name === target.name);
    if (resolved) {
      resolved.lat = newLat;
      resolved.lng = newLng;
      resolved.coordinateSource = 'google_places_location';
      resolved.placeId = details.id ?? result.place_id;
      resolved.placeName = details.displayName?.text ?? result.name ?? resolved.placeName ?? target.name;
      resolved.formattedAddress = details.formattedAddress ?? result.formatted_address ?? null;
      resolved.googleMapsUrl = spot.googleMapsUrl;
      resolved.verificationGoogleMapsUrl = verificationUrl(newLat, newLng);
      resolved.reason = null;
    }

    fixes.push({
      name: target.name,
      oldLat,
      oldLng,
      newLat,
      newLng,
      coordinateSource: 'google_places_location',
      placeId: details.id ?? result.place_id,
      formattedAddress: details.formattedAddress ?? result.formatted_address ?? null,
      googleMapsUrl: spot.googleMapsUrl,
      checkUrl: verificationUrl(newLat, newLng),
    });
  }

  const cityHall = spots.find((entry) => entry.name === '名護市役所');
  if (cityHall) {
    cityHall.category = 'shop';
    cityHall.emoji = '🏢';
    cityHall.tag = '#公共施設';
    cityHall.desc = '名護市の行政施設。飲食スポットではありません。';
  }

  const hitohako = spots.find((entry) => entry.name === HITOHAKO_NAME);
  if (hitohako) {
    hitohako.address = HITOHAKO_ADDRESS;
  }

  await writeFile(SPOTS_PATH, `${JSON.stringify({ spots }, null, 2)}\n`, 'utf8');
  await writeFile(RESOLVED_PATH, `${JSON.stringify(resolvedRows, null, 2)}\n`, 'utf8');
  await writeFile(UNRESOLVED_PATH, `${JSON.stringify(unresolved, null, 2)}\n`, 'utf8');
  await writeFile(FIXES_PATH, `${JSON.stringify(fixes, null, 2)}\n`, 'utf8');

  console.log(`fixed=${fixes.length}`);
  console.log(`cityHallCategory=${cityHall?.category ?? 'missing'}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
