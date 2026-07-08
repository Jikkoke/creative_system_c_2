import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');
const XLSX_PATH = path.join(DATA_DIR, 'nago_spot.xlsx');
const RESOLVED_PATH = path.join(DATA_DIR, 'nago_spot_resolved.json');
const SPOTS_PATH = path.join(DATA_DIR, 'spots.json');
const UNRESOLVED_PATH = path.join(DATA_DIR, 'unresolved-spots.json');
const EXCLUDED_PATH = path.join(DATA_DIR, 'excluded-spots.json');
const DUPLICATE_URL_PATH = path.join(DATA_DIR, 'duplicate-map-urls.json');
const DUPLICATE_COORDINATE_PATH = path.join(DATA_DIR, 'duplicate-coordinates.json');

const PYTHON = 'C:/Users/yuya0/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';

const HITOHAKO_NAME = 'ヒトハコ　-HITOHAKO-';
const HITOHAKO = {
  id: 'hitohako',
  category: 'shop',
  name: HITOHAKO_NAME,
  lat: 26.589995011181713,
  lng: 127.98421113068441,
  emoji: '🎁',
  desc: 'Chura Freshの受取スポットです。',
  tag: '#受取',
  address: '沖縄県名護市大中1丁目2-1',
  goodsPickup: true,
  googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=26.589995011181713,127.98421113068441',
  verificationGoogleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=26.589995011181713,127.98421113068441',
};

const PARKING = {
  id: 'p1',
  category: 'parking',
  primary: true,
  name: '名護市営駐車場',
  lat: 26.58940706978775,
  lng: 127.9836665070875,
  emoji: '🟥',
  desc: '名護商店街エリアのメイン駐車場です。',
  tag: '#駐車場',
};

const GOODS_SPOTS = [
  {
    id: 'f7',
    category: 'food',
    name: 'なかむら製菓',
    lat: 26.5896,
    lng: 127.9837,
    emoji: '🍰',
    desc: '60年続く名護の老舗菓子店。市営市場内で琉球菓子・お祝い菓子を販売。',
    tag: '#菓子',
    address: '沖縄県名護市城1-4-11 名護市営市場内',
    goodsPickup: true,
    hours: '09:00-18:00',
    googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=26.5896,127.9837',
    verificationGoogleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=26.5896,127.9837',
  },
  {
    id: 'f9',
    category: 'food',
    name: '宮城菓子店',
    lat: 26.5896,
    lng: 127.9828,
    emoji: '🍰',
    desc: '70年続く名護の老舗菓子店。市営市場内で500円のケーキセットを販売。',
    tag: '#菓子',
    address: '沖縄県名護市城1-4-11 名護市営市場内',
    goodsPickup: true,
    hours: '08:00-20:00',
    googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=26.5896,127.9828',
    verificationGoogleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=26.5896,127.9828',
  },
  {
    id: 'f8',
    category: 'food',
    name: 'HEY BURGER',
    lat: 26.5895,
    lng: 127.9844,
    emoji: '🍔',
    desc: '沖縄県産豆肉を使った絶品ローカルバーガー。名護十字路の商店街に2022年オープン。',
    tag: '#ハンバーガー',
    address: '沖縄県名護市城1-2-3 2F',
    goodsPickup: true,
    hours: '11:00-18:00',
    closedDays: [0],
    googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=26.5895,127.9844',
    verificationGoogleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=26.5895,127.9844',
  },
];

const ALLOWED_DISTANCE_M = 1000;
const EARTH_RADIUS_M = 6_371_000;
const HITOHAKO_LATLNG = { lat: HITOHAKO.lat, lng: HITOHAKO.lng };
const API_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || null;

function haversine(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function normalizeText(value) {
  return String(value ?? '').normalize('NFKC').trim();
}

function verificationUrl(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function readWorkbookRows() {
  const py = [
    'import json, sys',
    'from openpyxl import load_workbook',
    'wb = load_workbook(sys.argv[1], data_only=True)',
    'ws = wb[wb.sheetnames[0]]',
    'rows = []',
    'for row in ws.iter_rows(min_row=2, values_only=True):',
    '    if not row[0] and not row[1] and not row[2]:',
    '        continue',
    '    rows.append({',
    '        "no": row[0],',
    '        "name": row[1],',
    '        "url": row[2],',
    '        "rank": row[3],',
    '        "unvisited": row[4],',
    '    })',
    'print(json.dumps(rows, ensure_ascii=True))',
  ].join('\n');

  const res = spawnSync(PYTHON, ['-X', 'utf8', '-c', py, XLSX_PATH], {
    encoding: 'utf8',
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
  });
  if (res.status !== 0) {
    throw new Error(res.stderr || 'Failed to read workbook');
  }
  return JSON.parse(res.stdout);
}

async function readResolvedRows() {
  const text = await readFile(RESOLVED_PATH, 'utf8');
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : parsed.rows ?? [];
}

function normalizedRank(rank) {
  const value = normalizeText(rank);
  return value || null;
}

function classifyCategory(name, placeName) {
  const text = `${normalizeText(name)} ${normalizeText(placeName)}`.toLowerCase();
  const shopHints = ['市場', '公園', '神社', '博物館', '広場', '展望台', '体験', 'bouldering', 'パーク', '工房', '館', 'ダイビング', '製造', '装飾'];
  const foodHints = ['ラーメン', 'そば', '食堂', '酒バル', '酒場', '居酒屋', 'タコス', 'burger', 'カフェ', 'coffee', 'cafe', 'アイス', 'スイーツ', 'ケーキ', '飲食', '焼肉', 'レストラン'];
  if (shopHints.some((hint) => text.includes(hint.toLowerCase()))) return 'shop';
  if (foodHints.some((hint) => text.includes(hint.toLowerCase()))) return 'food';
  return 'food';
}

function emojiFor(name, category) {
  const text = normalizeText(name).toLowerCase();
  if (category === 'parking') return '🟥';
  if (/市場/.test(name)) return '🛒';
  if (/公園|神社|博物館|広場|展望台/.test(name)) return '🏙️';
  if (/bouldering|dive|diving|ダイビング/i.test(text)) return '🪵';
  if (/cafe|coffee|カフェ/.test(text)) return '☕';
  if (/アイス|スイーツ|ケーキ|パン/.test(text)) return '🍰';
  if (/ラーメン|そば|食堂|酒場|酒バル|居酒屋|タコス|焼肉/.test(text)) return '🍜';
  if (/burger/.test(text)) return '🍔';
  if (category === 'shop') return '🏠';
  return '🍽️';
}

function tagFor(name, category) {
  if (category === 'parking') return '#駐車場';
  if (/市場/.test(name)) return '#市場';
  if (/公園|神社|博物館|広場|展望台/.test(name)) return '#観光';
  if (/bouldering|体験|ダイビング|工房/.test(name)) return '#体験';
  if (category === 'food') return '#飲食';
  return '#施設';
}

function descFor(category) {
  const kind = category === 'food' ? '飲食スポット' : category === 'shop' ? 'スポット' : '駐車場';
  return `名護商店街周辺の${kind}です。Google Maps URL を正として登録しました。`;
}

function extract3d4d(url) {
  const match = String(url ?? '').match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  return { lat: Number(match[1]), lng: Number(match[2]) };
}

function extractAtLatLng(url) {
  const match = String(url ?? '').match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,|$)/);
  if (!match) return null;
  return { lat: Number(match[1]), lng: Number(match[2]) };
}

function extractPlaceId(url) {
  const text = String(url ?? '');
  const candidates = [
    text.match(/[?&]query_place_id=([^&]+)/),
    text.match(/[?&]place_id=([^&]+)/),
    text.match(/[?&]ftid=([^&]+)/),
  ];
  for (const candidate of candidates) {
    if (candidate?.[1]) return decodeURIComponent(candidate[1]);
  }
  return null;
}

async function fetchPlaceDetails(placeId) {
  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  url.searchParams.set('place_id', placeId);
  url.searchParams.set('fields', 'place_id,name,formatted_address,geometry');
  url.searchParams.set('language', 'ja');
  url.searchParams.set('key', API_KEY);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Places API failed: ${res.status}`);
  }
  const payload = await res.json();
  if (payload.status !== 'OK' || !payload.result?.geometry?.location) return null;
  return {
    placeId: payload.result.place_id,
    name: payload.result.name ?? null,
    formattedAddress: payload.result.formatted_address ?? null,
    lat: payload.result.geometry.location.lat,
    lng: payload.result.geometry.location.lng,
    coordinateSource: 'places_api_place_id',
  };
}

async function fetchGeocodingPlaceId(placeId) {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('place_id', placeId);
  url.searchParams.set('language', 'ja');
  url.searchParams.set('key', API_KEY);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Geocoding API failed: ${res.status}`);
  }
  const payload = await res.json();
  const result = payload.results?.[0];
  if (payload.status !== 'OK' || !result?.geometry?.location) return null;
  return {
    placeId,
    name: result.address_components?.[0]?.long_name ?? null,
    formattedAddress: result.formatted_address ?? null,
    lat: result.geometry.location.lat,
    lng: result.geometry.location.lng,
    coordinateSource: 'geocoding_api_place_id',
  };
}

function nameLooksSimilar(expected, actual) {
  const a = normalizeText(expected).replace(/\s+/g, '').toLowerCase();
  const b = normalizeText(actual).replace(/\s+/g, '').toLowerCase();
  return Boolean(a && b && (a.includes(b) || b.includes(a)));
}

async function fetchVerifiedTextSearch(row) {
  const query = `${normalizeText(row.name)} 名護市`;
  const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
  url.searchParams.set('query', query);
  url.searchParams.set('language', 'ja');
  url.searchParams.set('region', 'jp');
  url.searchParams.set('key', API_KEY);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Text Search API failed: ${res.status}`);
  }
  const payload = await res.json();
  const candidates = Array.isArray(payload.results) ? payload.results : [];
  for (const candidate of candidates) {
    const location = candidate.geometry?.location;
    if (!location) continue;
    const distance = haversine(HITOHAKO_LATLNG, { lat: location.lat, lng: location.lng });
    const address = normalizeText(candidate.formatted_address);
    const sameName = nameLooksSimilar(row.name, candidate.name);
    const inNago = address.includes('名護');
    const walkable = distance <= 1200;
    if (!sameName || !inNago || !walkable) continue;
    return {
      placeId: candidate.place_id ?? null,
      name: candidate.name ?? null,
      formattedAddress: candidate.formatted_address ?? null,
      lat: location.lat,
      lng: location.lng,
      coordinateSource: 'text_search_verified',
    };
  }
  return null;
}

async function resolveCoordinate(row, cached) {
  const resolvedUrl = cached?.resolvedUrl ?? cached?.finalUrl ?? null;
  const placeName = cached?.placeName ?? null;

  const from3d4d = extract3d4d(resolvedUrl);
  if (from3d4d) {
    return {
      lat: from3d4d.lat,
      lng: from3d4d.lng,
      coordinateSource: 'google_maps_url_3d4d',
      resolvedUrl,
      googleMapsUrl: row.url,
      placeName,
      placeId: extractPlaceId(resolvedUrl),
      formattedAddress: null,
      candidateLat: null,
      candidateLng: null,
      reason: null,
    };
  }

  const placeId = extractPlaceId(resolvedUrl) ?? cached?.placeId ?? null;
  if (API_KEY && placeId) {
    try {
      const placeDetails = await fetchPlaceDetails(placeId);
      if (placeDetails) {
        return {
          ...placeDetails,
          resolvedUrl,
          googleMapsUrl: row.url,
          placeName: placeDetails.name ?? placeName,
          candidateLat: null,
          candidateLng: null,
          reason: null,
        };
      }
      const geocoded = await fetchGeocodingPlaceId(placeId);
      if (geocoded) {
        return {
          ...geocoded,
          resolvedUrl,
          googleMapsUrl: row.url,
          placeName: geocoded.name ?? placeName,
          candidateLat: null,
          candidateLng: null,
          reason: null,
        };
      }
    } catch (error) {
      return {
        lat: null,
        lng: null,
        coordinateSource: 'unresolved_no_coordinate',
        resolvedUrl,
        googleMapsUrl: row.url,
        placeName,
        placeId,
        formattedAddress: null,
        candidateLat: null,
        candidateLng: null,
        reason: `Place ID APIで座標を取得できなかった: ${error.message}`,
      };
    }
  }

  if (API_KEY) {
    try {
      const textSearch = await fetchVerifiedTextSearch(row);
      if (textSearch) {
        return {
          ...textSearch,
          resolvedUrl,
          googleMapsUrl: row.url,
          placeName: textSearch.name ?? placeName,
          candidateLat: null,
          candidateLng: null,
          reason: null,
        };
      }
    } catch (error) {
      return {
        lat: null,
        lng: null,
        coordinateSource: 'unresolved_no_coordinate',
        resolvedUrl,
        googleMapsUrl: row.url,
        placeName,
        placeId,
        formattedAddress: null,
        candidateLat: null,
        candidateLng: null,
        reason: `Text Search APIで座標を取得できなかった: ${error.message}`,
      };
    }
  }

  const atCoordinate = extractAtLatLng(resolvedUrl);
  if (atCoordinate) {
    return {
      lat: null,
      lng: null,
      coordinateSource: 'unresolved_at_coordinate_only',
      resolvedUrl,
      googleMapsUrl: row.url,
      placeName,
      placeId,
      formattedAddress: null,
      candidateLat: atCoordinate.lat,
      candidateLng: atCoordinate.lng,
      reason: '@lat,lng しか取得できず、これは地図表示中心の可能性があるため採用しない',
    };
  }

  return {
    lat: null,
    lng: null,
    coordinateSource: 'unresolved_no_coordinate',
    resolvedUrl,
    googleMapsUrl: row.url,
    placeName,
    placeId,
    formattedAddress: null,
    candidateLat: null,
    candidateLng: null,
    reason: API_KEY
      ? 'Google Maps URLとAPIから座標を取得できなかった'
      : 'Google Maps URLから !3d!4d を取得できず、APIも利用できなかった',
  };
}

function makeSpot(row, resolved) {
  const category = classifyCategory(row.name, resolved.placeName);
  return {
    id: `nago-${String(row.no).padStart(3, '0')}`,
    category,
    name: normalizeText(row.name),
    lat: resolved.lat,
    lng: resolved.lng,
    emoji: emojiFor(row.name, category),
    desc: descFor(category),
    tag: tagFor(row.name, category),
    rank: normalizedRank(row.rank),
    googleMapsUrl: row.url,
    resolvedUrl: resolved.resolvedUrl,
    coordinateSource: resolved.coordinateSource,
    verificationGoogleMapsUrl: verificationUrl(resolved.lat, resolved.lng),
    placeId: resolved.placeId ?? undefined,
    address: resolved.formattedAddress ?? undefined,
  };
}

function makeExcluded(row, resolved, reason) {
  return {
    no: row.no,
    name: normalizeText(row.name),
    googleMapsUrl: row.url ?? null,
    resolvedUrl: resolved.resolvedUrl ?? null,
    distanceFromHitohakoMeters: resolved.lat != null && resolved.lng != null ? Math.round(haversine(HITOHAKO_LATLNG, resolved)) : null,
    verificationGoogleMapsUrl: resolved.lat != null && resolved.lng != null ? verificationUrl(resolved.lat, resolved.lng) : null,
    reason,
  };
}

function buildDuplicateCoordinateEntries(spots) {
  const groups = new Map();
  for (const spot of spots) {
    if (typeof spot.lat !== 'number' || typeof spot.lng !== 'number') continue;
    const key = `${spot.lat},${spot.lng}`;
    const existing = groups.get(key) ?? [];
    existing.push({
      id: spot.id,
      name: spot.name,
      category: spot.category,
      googleMapsUrl: spot.googleMapsUrl ?? null,
      verificationGoogleMapsUrl: verificationUrl(spot.lat, spot.lng),
    });
    groups.set(key, existing);
  }
  return [...groups.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([coordinate, spotsAtCoordinate]) => ({ coordinate, spots: spotsAtCoordinate }));
}

async function main() {
  const rows = readWorkbookRows();
  const cachedRows = await readResolvedRows();
  const cachedByUrl = new Map(cachedRows.filter((row) => row.url).map((row) => [row.url, row]));

  const urlGroups = rows.reduce((acc, row) => {
    if (!row.url) return acc;
    acc[row.url] = acc[row.url] ?? [];
    acc[row.url].push(row);
    return acc;
  }, {});
  const duplicates = Object.entries(urlGroups)
    .filter(([, entries]) => entries.length > 1)
    .map(([googleMapsUrl, entries]) => ({
      googleMapsUrl,
      rows: entries.map((entry) => entry.no).filter((value) => value != null),
      names: entries.map((entry) => normalizeText(entry.name)),
    }));
  const duplicateUrlSet = new Set(duplicates.map((entry) => entry.googleMapsUrl));

  const unresolved = [];
  const excluded = [];
  const acceptedRows = [];
  const resolvedRows = [];

  for (const row of rows) {
    const name = normalizeText(row.name);
    if (!row.url) {
      const unresolvedRow = {
        no: row.no,
        name,
        rank: normalizedRank(row.rank),
        googleMapsUrl: null,
        resolvedUrl: null,
        coordinateSource: 'unresolved_no_coordinate',
        candidateLat: null,
        candidateLng: null,
        verificationGoogleMapsUrl: null,
        reason: 'ExcelのURL列が空のため座標を取得できなかった',
      };
      unresolved.push(unresolvedRow);
      resolvedRows.push(unresolvedRow);
      continue;
    }

    const resolved = await resolveCoordinate(row, cachedByUrl.get(row.url));
    const resolvedRow = {
      no: row.no,
      name,
      rank: normalizedRank(row.rank),
      googleMapsUrl: row.url,
      resolvedUrl: resolved.resolvedUrl ?? null,
      lat: resolved.lat,
      lng: resolved.lng,
      candidateLat: resolved.candidateLat ?? null,
      candidateLng: resolved.candidateLng ?? null,
      coordinateSource: resolved.coordinateSource,
      placeId: resolved.placeId ?? null,
      placeName: resolved.placeName ?? null,
      formattedAddress: resolved.formattedAddress ?? null,
      verificationGoogleMapsUrl: resolved.lat != null && resolved.lng != null ? verificationUrl(resolved.lat, resolved.lng) : null,
      reason: resolved.reason ?? null,
    };
    resolvedRows.push(resolvedRow);

    if (resolved.lat == null || resolved.lng == null) {
      unresolved.push({
        no: row.no,
        name,
        rank: normalizedRank(row.rank),
        googleMapsUrl: row.url,
        resolvedUrl: resolved.resolvedUrl ?? null,
        candidateLat: resolved.candidateLat ?? null,
        candidateLng: resolved.candidateLng ?? null,
        coordinateSource: resolved.coordinateSource,
        reason: resolved.reason ?? 'Google Maps URLから座標を取得できなかった',
      });
      continue;
    }

    const distance = haversine(HITOHAKO_LATLNG, resolved);
    if (duplicateUrlSet.has(row.url)) {
      excluded.push(makeExcluded(row, resolved, 'Google Maps URLが重複しているため採用対象外'));
      continue;
    }

    if (distance > ALLOWED_DISTANCE_M) {
      excluded.push(makeExcluded(row, resolved, 'ヒトハコから1000m以上離れており、徒歩回遊エリア外のため'));
      continue;
    }

    acceptedRows.push({ row, resolved: { ...resolved, distanceFromHitohakoMeters: Math.round(distance) } });
  }

  const importedSpots = acceptedRows.map(({ row, resolved }) => makeSpot(row, resolved));
  const spots = [PARKING, ...GOODS_SPOTS, HITOHAKO, ...importedSpots];
  const duplicateCoordinates = buildDuplicateCoordinateEntries(spots);

  await writeFile(SPOTS_PATH, `${JSON.stringify({ spots }, null, 2)}\n`, 'utf8');
  await writeFile(RESOLVED_PATH, `${JSON.stringify(resolvedRows, null, 2)}\n`, 'utf8');
  await writeFile(UNRESOLVED_PATH, `${JSON.stringify(unresolved, null, 2)}\n`, 'utf8');
  await writeFile(EXCLUDED_PATH, `${JSON.stringify(excluded, null, 2)}\n`, 'utf8');
  await writeFile(DUPLICATE_URL_PATH, `${JSON.stringify(duplicates, null, 2)}\n`, 'utf8');
  await writeFile(DUPLICATE_COORDINATE_PATH, `${JSON.stringify(duplicateCoordinates, null, 2)}\n`, 'utf8');

  const countsBySource = resolvedRows.reduce((acc, row) => {
    const key = row.coordinateSource ?? 'unknown';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`rows=${rows.length}`);
  console.log(`accepted=${acceptedRows.length}`);
  console.log(`excluded=${excluded.length}`);
  console.log(`unresolved=${unresolved.length}`);
  console.log(`duplicateUrls=${duplicates.length}`);
  console.log(`duplicateCoordinates=${duplicateCoordinates.length}`);
  console.log(`sources=${JSON.stringify(countsBySource)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
