import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');
const SPOTS_PATH = path.join(DATA_DIR, 'spots.json');
const RESOLVED_PATH = path.join(DATA_DIR, 'nago_spot_resolved.json');
const DUPLICATE_COORDINATE_PATH = path.join(DATA_DIR, 'duplicate-coordinates.json');
const FIXES_PATH = path.join(DATA_DIR, 'coordinate-fixes.json');
const HOURS_REVIEW_PATH = path.join(DATA_DIR, 'hours-review.json');

const ALLOWED = new Set(['parking', 'food', 'shop']);
const HITOHAKO_NAME = 'ヒトハコ　-HITOHAKO-';
const OLD_NAMES = ['名護十字路商店連合', '名護十字路商店連合会'];
const DISALLOWED_COORDINATE_SOURCES = new Set(['google_maps_url_at', 'unresolved_at_coordinate_only']);
const HITOHAKO = { lat: 26.589995011181713, lng: 127.98421113068441, address: '沖縄県名護市大中1丁目2-1' };
const EARTH_RADIUS_M = 6_371_000;
const TARGET_FIX_NAMES = ['なかむら製菓', '宮城菓子店', 'HEY BURGER'];

function inNagoBounds(lat, lng) {
  return lat >= 26.4 && lat <= 26.7 && lng >= 127.9 && lng <= 128.1;
}

function verificationUrl(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function haversine(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function buildDuplicateCoordinateEntries(spots) {
  const groups = new Map();
  for (const spot of spots) {
    if (typeof spot.lat !== 'number' || typeof spot.lng !== 'number') continue;
    const key = `${spot.lat},${spot.lng}`;
    const list = groups.get(key) ?? [];
    list.push({
      id: spot.id,
      name: spot.name,
      category: spot.category,
      googleMapsUrl: spot.googleMapsUrl ?? null,
      verificationGoogleMapsUrl: verificationUrl(spot.lat, spot.lng),
    });
    groups.set(key, list);
  }
  return [...groups.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([coordinate, spotsAtCoordinate]) => ({ coordinate, spots: spotsAtCoordinate }));
}

async function readJson(pathname, fallback) {
  try {
    return JSON.parse(await readFile(pathname, 'utf8'));
  } catch {
    return fallback;
  }
}

async function main() {
  const spotsData = await readJson(SPOTS_PATH, { spots: [] });
  const resolvedData = await readJson(RESOLVED_PATH, []);
  const coordinateFixes = await readJson(FIXES_PATH, []);
  const hoursReview = await readJson(HOURS_REVIEW_PATH, []);

  const spots = Array.isArray(spotsData.spots) ? spotsData.spots : [];
  const resolvedRows = Array.isArray(resolvedData) ? resolvedData : resolvedData.rows ?? [];
  const problems = [];
  const ids = new Map();
  const urls = new Map();
  const hoursNames = new Set(hoursReview.map((entry) => entry.name));

  for (const spot of spots) {
    if (ids.has(spot.id)) problems.push(`duplicate id: ${spot.id}`);
    ids.set(spot.id, true);

    if (!ALLOWED.has(spot.category)) {
      problems.push(`invalid category on ${spot.id}: ${spot.category}`);
    }

    if (typeof spot.lat !== 'number' || typeof spot.lng !== 'number' || Number.isNaN(spot.lat) || Number.isNaN(spot.lng)) {
      problems.push(`invalid coordinates on ${spot.id}`);
    } else if (!inNagoBounds(spot.lat, spot.lng)) {
      problems.push(`out-of-bounds coordinates on ${spot.id}: ${spot.lat}, ${spot.lng}`);
    }

    if (spot.category === 'food' || spot.category === 'shop') {
      if (typeof spot.googleMapsUrl !== 'string' || !spot.googleMapsUrl) {
        problems.push(`missing googleMapsUrl on ${spot.id}`);
      } else if (urls.has(spot.googleMapsUrl)) {
        problems.push(`duplicate googleMapsUrl: ${spot.googleMapsUrl}`);
      } else {
        urls.set(spot.googleMapsUrl, spot.id);
      }

      if (spot.name !== HITOHAKO_NAME && !hoursNames.has(spot.name)) {
        problems.push(`missing hours review on ${spot.id}`);
      }
    }

    if (spot.coordinateSource && DISALLOWED_COORDINATE_SOURCES.has(spot.coordinateSource)) {
      problems.push(`disallowed coordinateSource on ${spot.id}: ${spot.coordinateSource}`);
    }

    if (spot.name === '名護市役所' && spot.category === 'food') {
      problems.push('名護市役所 is still food');
    }
    if (spot.name === '名護市役所' && spot.category !== 'shop') {
      problems.push(`名護市役所 category mismatch: ${spot.category}`);
    }
    if (spot.name === '名護市役所' && spot.tag === '#飲食') {
      problems.push('名護市役所 tag is still food');
    }

    if ((spot.category === 'food' || spot.category === 'shop') && !spot.goodsPickup) {
      const distance = haversine(HITOHAKO, spot);
      if (!Number.isFinite(distance)) {
        problems.push(`distance calculation failed on ${spot.id}`);
      } else if (distance > 1200) {
        problems.push(`walkable-area warning on ${spot.id}: ${Math.round(distance)}m from HITOHAKO`);
      }
    }
  }

  for (const row of resolvedRows) {
    if (!row.coordinateSource) {
      problems.push(`missing coordinateSource in resolved row: ${row.name ?? row.no}`);
    }
  }

  for (const name of TARGET_FIX_NAMES) {
    const fix = coordinateFixes.find((entry) => entry.name === name);
    const spot = spots.find((entry) => entry.name === name);
    if (!fix) {
      problems.push(`missing coordinate fix for ${name}`);
      continue;
    }
    if (!spot) {
      problems.push(`missing spot for coordinate fix ${name}`);
      continue;
    }
    if (spot.lat !== fix.newLat || spot.lng !== fix.newLng) {
      problems.push(`coordinate mismatch for ${name}`);
    }
  }

  const duplicateCoordinates = buildDuplicateCoordinateEntries(spots);
  await writeFile(DUPLICATE_COORDINATE_PATH, `${JSON.stringify(duplicateCoordinates, null, 2)}\n`, 'utf8');

  const hito = spots.find((spot) => spot.name === HITOHAKO_NAME);
  if (!hito) {
    problems.push('missing HITOHAKO spot');
  } else {
    if (hito.address !== HITOHAKO.address) {
      problems.push('HITOHAKO address mismatch');
    }
    const latOk = Math.abs(hito.lat - HITOHAKO.lat) < 1e-9;
    const lngOk = Math.abs(hito.lng - HITOHAKO.lng) < 1e-9;
    if (!latOk || !lngOk) {
      problems.push('HITOHAKO coordinates mismatch');
    }
  }

  const haystack = `${JSON.stringify(spotsData)}\n${JSON.stringify(resolvedData)}`;
  for (const oldName of OLD_NAMES) {
    if (haystack.includes(oldName)) {
      problems.push(`old name still present: ${oldName}`);
    }
  }

  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    process.exitCode = 1;
    return;
  }

  console.log(`spots ok: ${spots.length} records`);
  console.log(`resolved rows ok: ${resolvedRows.length} records`);
  console.log(`coordinate fixes ok: ${coordinateFixes.length} records`);
  console.log(`hours review ok: ${hoursReview.length} records`);
  console.log(`duplicate coordinates: ${duplicateCoordinates.length}`);
  if (hito) {
    console.log(`HITOHAKO ok: ${hito.name} @ ${hito.lat}, ${hito.lng}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
