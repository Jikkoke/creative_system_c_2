'use client';
import { useEffect, useState, useCallback } from 'react';
import { GoogleMap, useJsApiLoader, DirectionsRenderer, Marker } from '@react-google-maps/api';
import sheltersData from '@/data/shelters.json';

const containerStyle = { width: '100%', height: '100dvh' };

export default function MapContainer({ 
  isStarted, 
  onArrival, 
  isDisasterMode,
  userLocation 
}: { 
  isStarted: boolean; 
  onArrival: () => void; 
  isDisasterMode?: boolean;
  userLocation?: { lat: number, lng: number } | null;
}) {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY as string,
    language: 'ja',
    region: 'JP'
  });

  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);

  // 💡 ルート計算・表示ロジックの厳格化
  const calculateRoute = useCallback(() => {
    if (!isLoaded || !userLocation) {
      setDirections(null);
      return;
    }
    
    const directionsService = new google.maps.DirectionsService();

    // 🚨 1. 防災モードONのとき：即座に最も近い避難所への「徒歩ルート」を計算
    if (isDisasterMode) {
      if (sheltersData.length === 0) {
        setDirections(null);
        return;
      }

      let closestShelter = sheltersData[0];
      let minDistance = Infinity;

      sheltersData.forEach(shelter => {
        const dLat = shelter.lat - userLocation.lat;
        const dLng = shelter.lng - userLocation.lng;
        const distance = dLat * dLat + (dLng * dLng) * Math.pow(Math.cos(26.5 * Math.PI / 180), 2);

        if (distance < minDistance) {
          minDistance = distance;
          closestShelter = shelter;
        }
      });

      directionsService.route(
        {
          origin: userLocation,
          destination: { lat: closestShelter.lat, lng: closestShelter.lng },
          travelMode: google.maps.TravelMode.WALKING, // 徒歩
        },
        (result, status) => {
          if (status === 'OK' && result) {
            setDirections(result);
          } else {
            console.error('避難所経路の取得に失敗しました:', status);
            setDirections(null);
          }
        }
      );
    } 
    // 🚗 2. 通常モードで、かつ出発ボタン（isStarted）が押されているとき：お店へのルートを計算
    else if (isStarted) {
      directionsService.route(
        {
          origin: userLocation,
          destination: { lat: 26.5915, lng: 127.9845 }, // 市営駐車場
          travelMode: google.maps.TravelMode.DRIVING, // 車
        },
        (result, status) => {
          if (status === 'OK' && result) {
            setDirections(result);
          } else {
            console.error('店舗経路の取得に失敗しました:', status);
            setDirections(null);
          }
        }
      );
    } 
    // 🗺️ 3. 通常モードで、出発ボタンが押されていないとき：ルート線はすべて消去
    else {
      setDirections(null);
    }
  }, [isLoaded, userLocation, isDisasterMode, isStarted]);

  // 状態（現在地、出発フラグ、防災モード）が変化したら、毎回ルートを正しく再計算する
  useEffect(() => {
    calculateRoute();
  }, [calculateRoute]);

  const defaultCenter = userLocation || { lat: 26.5915, lng: 127.9845 };

  return isLoaded ? (
    <GoogleMap 
      mapContainerStyle={containerStyle} 
      center={defaultCenter} 
      zoom={14} 
      options={{ disableDefaultUI: true }}
    >
      {/* ルートが存在する場合のみ描画（不要なときはクリアされます） */}
      {directions && <DirectionsRenderer directions={directions} />}
      
      {/* 避難所のピンを描画（防災モード時のみ） */}
      {isDisasterMode && sheltersData.map((place) => (
        <Marker 
          key={place.id} 
          position={{ lat: place.lat, lng: place.lng }} 
          title={place.name}
          label="避" 
        />
      ))}

      {/* 現在地マーカー */}
      {userLocation && (
        <Marker
          position={userLocation}
          icon={{
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: '#4285F4',
            fillOpacity: 1,
            strokeColor: 'white',
            strokeWeight: 2,
          }}
          title="現在地"
        />
      )}
    </GoogleMap>
  ) : <div>Loading...</div>;
}