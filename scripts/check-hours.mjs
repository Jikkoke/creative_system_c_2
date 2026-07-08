import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');
const SPOTS_PATH = path.join(DATA_DIR, 'spots.json');
const HOURS_REVIEW_PATH = path.join(DATA_DIR, 'hours-review.json');
const ENV_PATH = path.join(ROOT, '.env.local');
const CHECKED_AT = '2026-07-08';

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

function normalizeText(value) {
  return String(value ?? '').normalize('NFKC').trim();
}

function namesMatch(expected, actual) {
  const a = normalizeText(expected).replace(/\s+/g, '').toLowerCase();
  const b = normalizeText(actual).replace(/\s+/g, '').toLowerCase();
  return a === b || a.includes(b) || b.includes(a);
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function textSearch(name, apiKey) {
  const query = `${name} 名護市`;
  const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
  url.searchParams.set('query', query);
  url.searchParams.set('language', 'ja');
  url.searchParams.set('region', 'jp');
  url.searchParams.set('key', apiKey);
  const payload = await fetchJson(url);
  const results = Array.isArray(payload.results) ? payload.results : [];
  return results.find((result) => {
    const address = normalizeText(result.formatted_address);
    return address.includes('名護') && namesMatch(name, result.name);
  }) ?? null;
}

async function placeDetails(placeId, apiKey) {
  const url = new URL('https://places.googleapis.com/v1/places/' + placeId);
  url.searchParams.set('languageCode', 'ja');
  return fetchJson(url, {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'id,displayName,formattedAddress,location,googleMapsUri,regularOpeningHours,currentOpeningHours,businessStatus,types',
    },
  });
}

function formatHours(weekdayText) {
  if (!Array.isArray(weekdayText) || weekdayText.length === 0) return '';
  return weekdayText.join(' / ');
}

async function main() {
  const apiKey = await loadApiKey();
  const data = JSON.parse(await readFile(SPOTS_PATH, 'utf8'));
  const spots = Array.isArray(data.spots) ? data.spots : [];
  const review = [];

  if (!apiKey) {
    for (const spot of spots) {
      if (spot.category === 'parking') continue;
      review.push({
        name: spot.name,
        status: 'needs_manual_review',
        oldHours: spot.hours ?? '',
        newHours: '',
        businessStatus: '',
        placeId: spot.placeId ?? null,
        formattedAddress: spot.address ?? null,
        checkedAt: CHECKED_AT,
        reason: 'Google Places API を利用できないため営業時間を確認できなかった',
        googleMapsUrl: spot.googleMapsUrl ?? null,
      });
    }
    await writeFile(HOURS_REVIEW_PATH, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
    console.log(`checked=${review.length}`);
    console.log('updated=0');
    console.log(`manualReview=${review.length}`);
    return;
  }

  let updated = 0;
  let manualReview = 0;

  for (const spot of spots) {
    if (spot.category === 'parking') continue;

    try {
      const search = await textSearch(spot.name, apiKey);
      if (!search?.place_id) {
        manualReview += 1;
        review.push({
          name: spot.name,
          status: 'needs_manual_review',
          oldHours: spot.hours ?? '',
          newHours: '',
          businessStatus: '',
          placeId: null,
          formattedAddress: spot.address ?? null,
          checkedAt: CHECKED_AT,
          reason: 'Google Places API の検索結果から一致する店舗を特定できなかった',
          googleMapsUrl: spot.googleMapsUrl ?? null,
        });
        continue;
      }

      const details = await placeDetails(search.place_id, apiKey);
      const displayName = details.displayName?.text ?? search.name ?? '';
      if (!namesMatch(spot.name, displayName)) {
        manualReview += 1;
        review.push({
          name: spot.name,
          status: 'needs_manual_review',
          oldHours: spot.hours ?? '',
          newHours: '',
          businessStatus: details.businessStatus ?? '',
          placeId: details.id ?? search.place_id,
          formattedAddress: details.formattedAddress ?? search.formatted_address ?? null,
          checkedAt: CHECKED_AT,
          reason: 'Google Places API の結果とスポット名の一致が曖昧だった',
          googleMapsUrl: spot.googleMapsUrl ?? null,
        });
        continue;
      }

      const weekdayText =
        details.regularOpeningHours?.weekdayDescriptions ??
        details.currentOpeningHours?.weekdayDescriptions ??
        [];
      const newHours = formatHours(weekdayText);
      const oldHours = spot.hours ?? '';

      if (!newHours) {
        manualReview += 1;
        review.push({
          name: spot.name,
          status: 'no_hours_available',
          oldHours: spot.hours ?? '',
          newHours: '',
          businessStatus: details.businessStatus ?? '',
          placeId: details.id ?? search.place_id,
          formattedAddress: details.formattedAddress ?? search.formatted_address ?? null,
          checkedAt: CHECKED_AT,
          reason: 'Google Places APIから営業時間が返らなかった',
          googleMapsUrl: spot.googleMapsUrl ?? details.googleMapsUri ?? null,
        });
        continue;
      }

      const status = spot.hours === newHours ? 'unchanged' : 'updated';
      if (status === 'updated') {
        updated += 1;
        spot.hours = newHours;
      }

      spot.openingHours = {
        source: 'google_places',
        weekdayText,
        businessStatus: details.businessStatus ?? '',
        checkedAt: CHECKED_AT,
      };
      review.push({
        name: spot.name,
        status,
        oldHours,
        newHours,
        businessStatus: details.businessStatus ?? '',
        placeId: details.id ?? search.place_id,
        formattedAddress: details.formattedAddress ?? search.formatted_address ?? null,
        checkedAt: CHECKED_AT,
        reason: '',
        googleMapsUrl: spot.googleMapsUrl ?? details.googleMapsUri ?? null,
      });
    } catch (error) {
      manualReview += 1;
      review.push({
        name: spot.name,
        status: 'needs_manual_review',
        oldHours: spot.hours ?? '',
        newHours: '',
        businessStatus: '',
        placeId: spot.placeId ?? null,
        formattedAddress: spot.address ?? null,
        checkedAt: CHECKED_AT,
        reason: `Google Places API の確認に失敗した: ${error.message}`,
        googleMapsUrl: spot.googleMapsUrl ?? null,
      });
    }
  }

  await writeFile(SPOTS_PATH, `${JSON.stringify({ spots }, null, 2)}\n`, 'utf8');
  await writeFile(HOURS_REVIEW_PATH, `${JSON.stringify(review, null, 2)}\n`, 'utf8');

  console.log(`checked=${review.length}`);
  console.log(`updated=${updated}`);
  console.log(`manualReview=${manualReview}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
