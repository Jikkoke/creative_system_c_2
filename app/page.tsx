'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  GoogleMap,
  useJsApiLoader,
  DirectionsRenderer,
  Marker,
  InfoWindow,
} from '@react-google-maps/api';
import sheltersData from '@/data/shelters.json';
import spotsData from '@/data/spots.json';
import { useWeatherAlert } from '@/hooks/useWeatherAlert';

// ─── 静的データ ──────────────────────────────────────────────────────────────

const KYODA_ORIGIN = { lat: 26.6478, lng: 128.0196 }; // 道の駅許田（起点）
const NAGO_PARKING = { lat: 26.5915, lng: 127.9845 }; // 名護市営駐車場（目的地）

// ─── 型定義 ──────────────────────────────────────────────────────────────────

type Category = 'parking' | 'food' | 'shop';

type Spot = {
  id: string;
  category: Category;
  primary?: boolean;
  name: string;
  lat: number;
  lng: number;
  emoji: string;
  desc: string;
  tag: string;
  imageUrl?: string;
  address?: string;
};

type Shelter = {
  id: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
};

type Status = 'initial' | 'navigating' | 'completed';
type Genre = 'food' | 'shop';
type ParkingStatus = 'loading' | 'open' | 'full' | 'error';

// ─── spots.json バリデーター ─────────────────────────────────────────────────

const NAGO_BOUNDS = { latMin: 26.4, latMax: 26.7, lngMin: 127.9, lngMax: 128.1 };

function isValidSpot(s: unknown): s is Spot {
  if (!s || typeof s !== 'object') return false;
  const sp = s as Spot;
  return (
    typeof sp.id === 'string' && sp.id.length > 0 &&
    typeof sp.name === 'string' && sp.name.length > 0 &&
    typeof sp.lat === 'number' && typeof sp.lng === 'number' &&
    sp.lat >= NAGO_BOUNDS.latMin && sp.lat <= NAGO_BOUNDS.latMax &&
    sp.lng >= NAGO_BOUNDS.lngMin && sp.lng <= NAGO_BOUNDS.lngMax &&
    ['parking', 'food', 'shop'].includes(sp.category)
  );
}

function loadValidSpots(raw: { spots: unknown[] }): Spot[] {
  const valid: Spot[] = [];
  for (const e of raw.spots ?? []) {
    if (isValidSpot(e)) valid.push(e);
    else console.warn('[spots.json] invalid entry skipped:', e);
  }
  return valid;
}

const ALL_SPOTS: Spot[] = loadValidSpots(spotsData as { spots: unknown[] });
const SPOTS_BY_CATEGORY = {
  food: ALL_SPOTS.filter((s) => s.category === 'food'),
  shop: ALL_SPOTS.filter((s) => s.category === 'shop'),
  parking: ALL_SPOTS.filter((s) => s.category === 'parking'),
};

const SHELTERS: Shelter[] = sheltersData;

// ─── GAS エンドポイント（環境変数） ────────────────────────────────────────

const GAS_LOG_URL = process.env.NEXT_PUBLIC_GAS_LOG_URL ?? '';
const GAS_PARKING_URL = process.env.NEXT_PUBLIC_GAS_PARKING_URL ?? '';

// ─── ユーティリティ ──────────────────────────────────────────────────────────

type LatLng = { lat: number; lng: number };

function haversine(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function nearestShelter(loc: LatLng): Shelter {
  return SHELTERS.reduce((best, s) =>
    haversine(loc, s) < haversine(loc, best) ? s : best
  , SHELTERS[0]);
}

const WALKING_SPEED_M_PER_MIN = 80;

function walkMinutes(from: LatLng, to: LatLng): number {
  return haversine(from, to) / WALKING_SPEED_M_PER_MIN;
}

async function logEvent(
  event: 'LAUNCH' | 'GOODS_RECEIVED' | 'SPOT_SELECT' | 'APPROACH_200M',
  payload?: Record<string, unknown>
) {
  if (!GAS_LOG_URL) return;
  try {
    await fetch(GAS_LOG_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, ts: Date.now(), ...payload }),
    });
  } catch {
    // fire-and-forget
  }
}

// ─── マーカースタイル ────────────────────────────────────────────────────────

function getMarkerStyle(spot: Spot): { fillColor: string; label: string } {
  if (spot.category === 'parking')
    return { fillColor: '#16a34a', label: spot.primary ? 'P★' : 'P' };
  if (spot.category === 'food') return { fillColor: '#f59e0b', label: '食' };
  return { fillColor: '#2563eb', label: '店' };
}

function buildIcon(fillColor: string): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale: 14,
    fillColor,
    fillOpacity: 0.95,
    strokeColor: '#ffffff',
    strokeWeight: 2.5,
  };
}

const MAP_CONTAINER_STYLE: React.CSSProperties = { width: '100%', height: '100dvh' };

// ─── メインコンポーネント ────────────────────────────────────────────────────

export default function HomePage() {
  // UI 状態
  const [status, setStatus] = useState<Status>('initial');
  const [isDisasterMode, setIsDisasterMode] = useState(false);
  const [activeGenre, setActiveGenre] = useState<Genre>('food');
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [showSpotDetail, setShowSpotDetail] = useState(false);
  const [popupSpot, setPopupSpot] = useState<Spot | null>(null);
  const [maxMinutes, setMaxMinutes] = useState(30);

  // 位置・ルート状態
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [travelDuration, setTravelDuration] = useState<string | null>(null);
  const [isNearDestination, setIsNearDestination] = useState(false);

  // 駐車場状態
  const [parkingStatus, setParkingStatus] = useState<ParkingStatus>('loading');

  // 位置情報エラー状態
  const [geoError, setGeoError] = useState<'denied' | 'unavailable' | null>(null);

  const approachFiredRef = useRef(new Set<string>());
  const mapRef = useRef<google.maps.Map | null>(null);

  // 気象警報フック（P1）
  const { weatherAlert } = useWeatherAlert(isDisasterMode);

  // Google Maps ロード
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY as string,
    language: 'ja',
    region: 'JP',
  });

  // 表示スポット（時間フィルター済み）
  const referencePoint: LatLng = userLocation ?? NAGO_PARKING;
  const visibleSpots = SPOTS_BY_CATEGORY[activeGenre].filter(
    (s) => walkMinutes(referencePoint, s) <= maxMinutes
  );

  // ── 起動ログ ────────────────────────────────────────────────────────────
  useEffect(() => { logEvent('LAUNCH'); }, []);

  // ── 位置情報ウォッチ ────────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const loc: LatLng = { lat: coords.latitude, lng: coords.longitude };
        setUserLocation(loc);

        if (status === 'navigating') {
          setIsNearDestination(haversine(loc, NAGO_PARKING) <= 100);
        }

        if (status === 'completed') {
          [...SPOTS_BY_CATEGORY.food, ...SPOTS_BY_CATEGORY.shop].forEach((spot) => {
            if (!approachFiredRef.current.has(spot.id) && haversine(loc, spot) <= 200) {
              approachFiredRef.current.add(spot.id);
              logEvent('APPROACH_200M', { spotId: spot.id, spotName: spot.name });
            }
          });
        }
      },
      (err) => {
        console.error('Geolocation:', err);
        setGeoError(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable');
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [status]);

  // ── 駐車場ポーリング（30秒間隔） ────────────────────────────────────────
  const fetchParking = useCallback(async () => {
    if (!GAS_PARKING_URL) {
      setParkingStatus('open');
      return;
    }
    try {
      const res = await fetch(GAS_PARKING_URL);
      const data: { status: string } = await res.json();
      setParkingStatus(data.status === 'full' ? 'full' : 'open');
    } catch {
      setParkingStatus('error');
    }
  }, []);

  useEffect(() => {
    fetchParking();
    const id = setInterval(fetchParking, 30_000);
    return () => clearInterval(id);
  }, [fetchParking]);

  // ── ルート計算 ────────────────────────────────────────────────────────
  const calculateRoute = useCallback(() => {
    if (!isLoaded || !userLocation) {
      setDirections(null);
      setTravelDuration(null);
      return;
    }

    let destination: LatLng | null = null;
    let travelMode: google.maps.TravelMode;

    if (isDisasterMode) {
      destination = nearestShelter(userLocation);
      travelMode = google.maps.TravelMode.WALKING;
    } else if (status === 'navigating') {
      destination = NAGO_PARKING;
      travelMode = google.maps.TravelMode.DRIVING;
    } else if (status === 'completed' && selectedSpot) {
      destination = { lat: selectedSpot.lat, lng: selectedSpot.lng };
      travelMode = google.maps.TravelMode.WALKING;
    } else {
      setDirections(null);
      setTravelDuration(null);
      return;
    }

    new google.maps.DirectionsService().route(
      { origin: userLocation, destination, travelMode },
      (result, stat) => {
        if (stat === 'OK' && result) {
          setDirections(result);
          setTravelDuration(result.routes[0]?.legs[0]?.duration?.text ?? null);
          if (mapRef.current && result.routes[0]?.bounds) {
            mapRef.current.fitBounds(result.routes[0].bounds, {
              top: 20, right: 20, bottom: 300, left: 20,
            });
          }
        } else {
          setDirections(null);
          setTravelDuration(null);
        }
      }
    );
  }, [isLoaded, userLocation, isDisasterMode, status, selectedSpot]);

  useEffect(() => { calculateRoute(); }, [calculateRoute]);

  // ── アクションハンドラ ─────────────────────────────────────────────────

  // ホームリセット（P2）
  const handleReset = useCallback(() => {
    setStatus('initial');
    setSelectedSpot(null);
    setShowSpotDetail(false);
    setDirections(null);
    setTravelDuration(null);
    setIsNearDestination(false);
    setPopupSpot(null);
    approachFiredRef.current.clear();
  }, []);

  const handleStartNavigation = () => {
    setStatus('navigating');
    setIsNearDestination(false);
  };

  const handleGoToSpotMode = () => {
    setStatus('completed');
    logEvent('GOODS_RECEIVED');
  };

  const handleGoodsReceived = () => {
    setStatus('completed');
    logEvent('GOODS_RECEIVED');
  };

  const handleSelectSpot = (spot: Spot) => {
    setSelectedSpot(spot);
    setShowSpotDetail(true);
    logEvent('SPOT_SELECT', { spotId: spot.id, spotName: spot.name });
  };

  const handleStartSpotRoute = () => {
    setShowSpotDetail(false);
  };

  const handleGenreChange = (genre: Genre) => {
    setActiveGenre(genre);
    setSelectedSpot(null);
    setShowSpotDetail(false);
    setDirections(null);
    setTravelDuration(null);
  };

  // ─── レンダリング ──────────────────────────────────────────────────────────

  return (
    <main
      className={`relative h-[100dvh] overflow-hidden font-sans transition-colors duration-500 ${
        isDisasterMode ? 'bg-red-50' : 'bg-gray-50'
      }`}
    >
      {/* ── マップレイヤー ─────────────────────────────────────────────── */}
      <div className="absolute inset-0 z-0">
        {isLoaded ? (
          <GoogleMap
            mapContainerStyle={MAP_CONTAINER_STYLE}
            center={userLocation ?? KYODA_ORIGIN}
            zoom={14}
            options={{ disableDefaultUI: true, clickableIcons: false }}
            onLoad={(map) => { mapRef.current = map; }}
          >
            {directions && (
              <DirectionsRenderer
                directions={directions}
                options={{
                  polylineOptions: {
                    strokeColor: isDisasterMode ? '#dc2626' : '#2563eb',
                    strokeWeight: 5,
                  },
                  suppressMarkers: false,
                }}
              />
            )}

            {/* 現在地マーカー */}
            {userLocation && (
              <Marker
                position={userLocation}
                title="現在地"
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 9,
                  fillColor: '#4285F4',
                  fillOpacity: 1,
                  strokeColor: 'white',
                  strokeWeight: 2.5,
                }}
              />
            )}

            {/* 避難所マーカー（防災モード時） */}
            {isDisasterMode &&
              SHELTERS.map((s) => (
                <Marker
                  key={s.id}
                  position={{ lat: s.lat, lng: s.lng }}
                  title={`${s.name}　${s.address}`}
                  icon={buildIcon('#dc2626')}
                  label={{ text: '避', color: 'white', fontWeight: 'bold', fontSize: '12px' }}
                />
              ))}

            {/* スポット・駐車場マーカー（completed 時） */}
            {status === 'completed' && !isDisasterMode && (
              <>
                {/* 駐車場マーカーは常時表示 */}
                {SPOTS_BY_CATEGORY.parking.map((spot) => {
                  const s = getMarkerStyle(spot);
                  return (
                    <Marker
                      key={spot.id}
                      position={{ lat: spot.lat, lng: spot.lng }}
                      icon={buildIcon(s.fillColor)}
                      label={{ text: s.label, color: 'white', fontWeight: 'bold', fontSize: '10px' }}
                      onClick={() => setPopupSpot(spot)}
                    />
                  );
                })}

                {/* ジャンル別スポットマーカー */}
                {visibleSpots.map((spot) => {
                  const s = getMarkerStyle(spot);
                  return (
                    <Marker
                      key={spot.id}
                      position={{ lat: spot.lat, lng: spot.lng }}
                      icon={buildIcon(s.fillColor)}
                      label={{ text: s.label, color: 'white', fontWeight: 'bold', fontSize: '10px' }}
                      onClick={() => setPopupSpot(spot)}
                    />
                  );
                })}

                {/* InfoWindow */}
                {popupSpot && (
                  <InfoWindow
                    position={{ lat: popupSpot.lat, lng: popupSpot.lng }}
                    onCloseClick={() => setPopupSpot(null)}
                  >
                    <div className="text-sm min-w-[120px]">
                      <p className="font-bold">{popupSpot.emoji} {popupSpot.name}</p>
                      {popupSpot.address && (
                        <p className="text-xs text-gray-500 mt-0.5">{popupSpot.address}</p>
                      )}
                      {popupSpot.category !== 'parking' && (
                        <button
                          onClick={() => { handleSelectSpot(popupSpot); setPopupSpot(null); }}
                          className="text-blue-600 text-xs underline mt-1"
                        >
                          詳細を見る →
                        </button>
                      )}
                    </div>
                  </InfoWindow>
                )}
              </>
            )}
          </GoogleMap>
        ) : (
          <div className="w-full h-full bg-gray-200 animate-pulse flex items-center justify-center">
            <p className="text-gray-400 text-sm font-medium">地図を読み込み中...</p>
          </div>
        )}
      </div>

      {/* ── ホームボタン（P2）: 初期状態以外・通常モード時のみ表示 ─────────── */}
      {status !== 'initial' && !isDisasterMode && (
        <button
          onClick={handleReset}
          aria-label="ホームに戻る"
          className="absolute top-4 left-4 z-30 w-11 h-11 flex items-center justify-center rounded-full bg-white text-gray-700 border border-gray-200 shadow-lg hover:bg-gray-50 active:scale-95 transition-all"
        >
          🏠
        </button>
      )}

      {/* ── 防災モード切替ボタン ───────────────────────────────────────── */}
      <button
        onClick={() => setIsDisasterMode((v) => !v)}
        aria-label={isDisasterMode ? '防災モードをオフにする' : '防災モードをオンにする'}
        className={`absolute top-4 right-4 z-20 flex items-center gap-1.5 px-4 py-2 rounded-full font-bold shadow-lg text-sm transition-all ${
          isDisasterMode
            ? 'bg-red-600 text-white animate-pulse border border-red-400'
            : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
        }`}
      >
        {isDisasterMode ? '🚨 防災モードON' : '🛡️ 防災モード'}
      </button>

      {/* ══════════════════════════════════════════════════════════════
          防災モード UI
      ══════════════════════════════════════════════════════════════ */}
      {isDisasterMode && (
        <>
          {/* 緊急バナー */}
          <div className="absolute top-4 left-4 right-20 z-20 bg-red-600 text-white px-4 py-3 rounded-2xl shadow-xl animate-bounce">
            <p className="text-sm font-bold leading-snug">
              ⚠️ 緊急避難警告：現在地付近の高台避難所・AEDを表示中
            </p>
          </div>

          {/* 防災ボトムパネル */}
          <div className="absolute bottom-0 left-0 right-0 z-10 bg-white px-6 pt-6 pb-10 rounded-t-[28px] shadow-[0_-10px_30px_rgba(0,0,0,0.2)]">
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-5 space-y-2">
              <p className="text-red-800 font-bold text-sm leading-relaxed">
                🚨 避難・安全確保を最優先に行動してください。<br />
                落ち着いて、地図上の赤いピン（最寄り避難所）へ向かってください。
              </p>
              {travelDuration && (
                <p className="text-red-700 text-sm font-medium">
                  最寄り避難所まで徒歩{' '}
                  <span className="font-extrabold text-base">{travelDuration}</span>
                </p>
              )}
              {/* 気象警報バナー（P1） */}
              {weatherAlert && (
                <p className="text-red-700 text-xs font-bold leading-snug border-t border-red-200 pt-2">
                  📡 {weatherAlert}
                </p>
              )}
            </div>
            <a
              href="tel:119"
              aria-label="119番に電話する"
              className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl bg-red-600 text-white text-base font-bold shadow-lg hover:bg-red-700 active:scale-95 transition-all"
            >
              📞 救急・緊急通報（119番）
            </a>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════
          通常モード UI
      ══════════════════════════════════════════════════════════════ */}
      {!isDisasterMode && (
        <>
          {/* 駐車場ヘッダー: ホームボタンがある場合は left-20 で衝突回避 */}
          <div className={`absolute top-4 right-20 z-10 ${status !== 'initial' ? 'left-20' : 'left-4'}`}>
            <div
              className={`flex items-center gap-2 px-4 py-3 rounded-2xl shadow-md text-xs font-bold backdrop-blur-sm border ${
                parkingStatus === 'full'
                  ? 'bg-red-50/90 border-red-200 text-red-700'
                  : parkingStatus === 'open'
                  ? 'bg-emerald-50/90 border-emerald-200 text-emerald-700'
                  : 'bg-white/80 border-gray-200 text-gray-500'
              }`}
            >
              {parkingStatus === 'loading' && (
                <><span className="animate-spin inline-block">⏳</span> 駐車場情報を取得中...</>
              )}
              {parkingStatus === 'open' && (
                <>🟢 市営駐車場：空車あり（スムーズに駐車できます）</>
              )}
              {parkingStatus === 'full' && (
                <>🚨 市営駐車場：満車（周辺の臨時駐車場へ向かってください）</>
              )}
              {parkingStatus === 'error' && (
                <div className="flex items-center gap-2 w-full">
                  <span>⚠️ 駐車場情報を取得できませんでした</span>
                  <button
                    onClick={fetchParking}
                    aria-label="駐車場情報を再取得する"
                    className="ml-auto shrink-0 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold px-3 py-1 rounded-full transition-colors"
                  >
                    再試行
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ボトムパネル */}
          <div className="absolute bottom-0 left-0 right-0 z-10 bg-white px-6 pt-6 pb-10 rounded-t-[28px] shadow-[0_-10px_30px_rgba(0,0,0,0.15)]">

            {/* ── ステップインジケーター ────────────────────────────── */}
            <div
              className="flex items-center justify-center gap-2 mb-5"
              role="progressbar"
              aria-label={`ステップ ${status === 'initial' ? 1 : status === 'navigating' ? 2 : 3} / 3`}
              aria-valuenow={status === 'initial' ? 1 : status === 'navigating' ? 2 : 3}
              aria-valuemin={1}
              aria-valuemax={3}
            >
              {(['initial', 'navigating', 'completed'] as Status[]).map((s, i) => {
                const currentStep = status === 'initial' ? 0 : status === 'navigating' ? 1 : 2;
                return (
                  <div
                    key={s}
                    className={`rounded-full transition-all duration-300 ${
                      i === currentStep
                        ? 'w-6 h-2 bg-blue-600'
                        : i < currentStep
                        ? 'w-2 h-2 bg-blue-300'
                        : 'w-2 h-2 bg-gray-200'
                    }`}
                  />
                );
              })}
            </div>

            {/* ── A. 初期状態 ─────────────────────────────────────── */}
            {status === 'initial' && (
              <div key="initial" className="space-y-3 animate-panel-enter">
                <div className="text-center mb-5">
                  <h2 className="text-xl font-extrabold text-gray-800">名護へようこそ！</h2>
                  <p className="text-gray-500 text-sm mt-1">どちらへ向かいますか？</p>
                </div>
                <button
                  onClick={handleStartNavigation}
                  aria-label="名護市営駐車場へのナビを開始する"
                  className="w-full py-4 rounded-2xl bg-blue-600 text-white font-bold shadow-lg hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <span>🎁</span> グッズを受け取りに出発
                </button>
                <button
                  onClick={handleGoToSpotMode}
                  aria-label="グッズ受取をスキップしてスポット観光モードへ"
                  className="w-full py-4 rounded-2xl bg-amber-500 text-white font-bold shadow-lg hover:bg-amber-600 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <span>🗺️</span> 名護市内のおすすめスポット観光
                </button>
              </div>
            )}

            {/* ── B. 駐車場ナビ中 ──────────────────────────────────── */}
            {status === 'navigating' && (
              <div key="navigating" className="space-y-4 animate-panel-enter">
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-2xl px-4 py-3 text-sm font-bold">
                  <span className="mt-0.5 shrink-0">⚠️</span>
                  <span>商店街周辺は路駐禁止です。必ず市営駐車場へ向かってください。</span>
                </div>

                {travelDuration && (
                  <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-4 text-center">
                    <p className="text-xs text-blue-500 font-medium">目的地（市営駐車場）まで</p>
                    <p className="text-3xl font-extrabold text-blue-700 mt-1 tabular-nums">
                      {travelDuration}
                    </p>
                  </div>
                )}

                <button
                  onClick={handleGoodsReceived}
                  disabled={!isNearDestination}
                  aria-label={isNearDestination ? 'グッズを受け取った' : '100m以内に近づくと有効になります'}
                  className={`w-full py-4 rounded-2xl text-white font-bold shadow-lg transition-all flex items-center justify-center gap-2 ${
                    isNearDestination
                      ? 'bg-emerald-500 hover:bg-emerald-600 active:scale-95'
                      : 'bg-gray-300 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  ✅{' '}
                  {isNearDestination
                    ? '店舗に到着・グッズを受け取った'
                    : '到着後に有効になります（100m以内）'}
                </button>
              </div>
            )}

            {/* ── C. グッズ受取完了：スポット一覧 ──────────────────── */}
            {status === 'completed' && !showSpotDetail && (
              <div key="completed-list" className="animate-panel-enter">
                <h2 className="text-lg font-extrabold text-gray-800 mb-4">
                  次はどこへ寄りますか？
                </h2>

                {/* 時間スライダー（P5） */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <label htmlFor="time-slider" className="text-xs font-bold text-gray-600">
                      ⏱ 到達時間で絞り込み
                    </label>
                    <span className="text-xs font-bold text-blue-600 tabular-nums">
                      {maxMinutes}分以内 / {visibleSpots.length}件
                    </span>
                  </div>
                  <input
                    id="time-slider"
                    type="range"
                    min={5}
                    max={60}
                    step={5}
                    value={maxMinutes}
                    onChange={(e) => setMaxMinutes(Number(e.target.value))}
                    aria-label={`徒歩${maxMinutes}分以内のスポットを表示`}
                    className="w-full accent-blue-600"
                  />
                  <div className="flex justify-between text-[10px] text-gray-400 mt-1 tabular-nums">
                    <span>5分</span><span>30分</span><span>60分</span>
                  </div>
                </div>

                {/* ジャンルチップ */}
                <div className="flex gap-2 mb-4">
                  {(['food', 'shop'] as Genre[]).map((g) => (
                    <button
                      key={g}
                      onClick={() => handleGenreChange(g)}
                      aria-label={g === 'food' ? '飲食店を表示' : 'ショップ・施設を表示'}
                      className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${
                        activeGenre === g
                          ? 'bg-blue-600 text-white shadow'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {g === 'food' ? '🍔 飲食' : '🛍️ 施設'}
                    </button>
                  ))}
                </div>

                {/* 横スクロールカード */}
                {visibleSpots.length === 0 ? (
                  <p className="text-sm text-gray-500 py-6 text-center">
                    この時間圏内に該当スポットがありません。スライダーを伸ばしてみてください。
                  </p>
                ) : (
                  <div className="flex gap-3 overflow-x-auto pb-2 snap-x -mx-6 px-6 scrollbar-hide">
                    {visibleSpots.map((spot) => (
                      <button
                        key={spot.id}
                        onClick={() => handleSelectSpot(spot)}
                        aria-label={`${spot.name}の詳細を表示`}
                        className="min-w-[160px] flex-shrink-0 snap-start text-left p-4 bg-gray-50 border border-gray-100 rounded-2xl hover:bg-blue-50 hover:border-blue-200 active:scale-95 transition-all shadow-sm"
                      >
                        <span className="text-3xl">{spot.emoji}</span>
                        <p className="font-bold text-gray-800 text-sm mt-2 leading-tight">{spot.name}</p>
                        <span className="text-xs text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded-md mt-2 inline-block">
                          {spot.tag}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── D. スポット詳細 ───────────────────────────────────── */}
            {status === 'completed' && showSpotDetail && selectedSpot && (
              <div key="completed-detail" className="animate-panel-enter">
                <button
                  onClick={() => setShowSpotDetail(false)}
                  aria-label="スポット一覧に戻る"
                  className="text-gray-500 text-sm mb-4 flex items-center gap-1 hover:text-gray-700 transition-colors"
                >
                  ← 一覧に戻る
                </button>

                {/* 写真エリア */}
                <div className="w-full h-40 bg-gradient-to-br from-blue-100 to-indigo-200 rounded-2xl mb-4 overflow-hidden flex items-center justify-center">
                  {selectedSpot.imageUrl ? (
                    <img
                      src={selectedSpot.imageUrl}
                      alt={selectedSpot.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <span className="text-7xl select-none">{selectedSpot.emoji}</span>
                  )}
                </div>

                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="font-extrabold text-gray-800 text-lg leading-snug">
                    {selectedSpot.name}
                  </h3>
                  <span className="text-xs text-blue-600 font-bold bg-blue-50 px-2 py-1 rounded-md shrink-0">
                    {selectedSpot.tag}
                  </span>
                </div>

                <p className="text-gray-500 text-sm leading-relaxed mb-3">{selectedSpot.desc}</p>

                {travelDuration && (
                  <p className="text-blue-600 text-sm font-bold mb-5">
                    🚶 徒歩 {travelDuration}
                  </p>
                )}

                <button
                  onClick={handleStartSpotRoute}
                  aria-label={`${selectedSpot.name}へのルートを開始する`}
                  className="w-full py-4 rounded-2xl bg-blue-600 text-white font-bold shadow-lg hover:bg-blue-700 active:scale-95 transition-all"
                >
                  🗺️ ここへのルートを案内
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── 位置情報エラーオーバーレイ ────────────────────────────────── */}
      {geoError && (
        <div className="absolute inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setGeoError(null)} />
          <div className="relative w-full bg-white rounded-t-[28px] px-6 pt-6 pb-10 shadow-2xl animate-panel-enter">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
            <h3 className="text-lg font-extrabold text-gray-800 mb-2">
              {geoError === 'denied' ? '📍 位置情報の許可が必要です' : '📍 位置情報を取得できません'}
            </h3>
            <p className="text-sm text-gray-500 leading-relaxed mb-5 whitespace-pre-line">
              {geoError === 'denied'
                ? 'このアプリは現在地を使ってルート案内を行います。ブラウザの設定から位置情報のアクセスを「許可」に変更してください。\n\niOS Safari: 設定 → プライバシー → 位置情報サービス\nAndroid Chrome: アドレスバーの 🔒 → 権限 → 位置情報'
                : '位置情報の取得中にエラーが発生しました。ページを再読み込みするか、しばらく時間をおいて再度お試しください。'}
            </p>
            <button
              aria-label={geoError === 'denied' ? '位置情報エラーダイアログを閉じる' : 'ページを再読み込みする'}
              onClick={() => {
                if (geoError === 'unavailable') {
                  window.location.reload();
                } else {
                  setGeoError(null);
                }
              }}
              className="w-full py-4 rounded-2xl bg-blue-600 text-white font-bold shadow-lg hover:bg-blue-700 active:scale-95 transition-all"
            >
              {geoError === 'denied' ? '設定方法を確認した' : 'ページを再読み込み'}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
