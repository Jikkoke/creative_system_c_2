'use client';
import { useEffect, useState, useCallback } from 'react';
import { GoogleMap, useJsApiLoader, DirectionsRenderer } from '@react-google-maps/api';
import data from '@/data/spots.json';

const containerStyle = { width: '100%', height: '65vh', borderRadius: '0 0 30px 30px' };
const KYODA_STATION = { lat: 26.5478, lng: 127.9675 }; // 許田駅座標

// isDisasterMode（省略可能）を受け取れるように型（Type）を追加
export default function MapContainer({ isStarted, onArrival, isDisasterMode }: { isStarted: boolean, onArrival: () => void, isDisasterMode?: boolean }) {  const { isLoaded } = useJsApiLoader({
  id: 'google-map-script', // ここをエラーメッセージのどちらかに合わせる
  googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY as string,
  libraries: ['places'],
  // 必要に応じて language や region もエラーメッセージと完全に一致させる
  language: 'ja', 
  region: 'JP'
});

  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);

  const calculateRoute = useCallback(() => {
    if (!isLoaded) return;
    const directionsService = new google.maps.DirectionsService();

    directionsService.route(
      {
        origin: KYODA_STATION,
        destination: { lat: data.parking.lat, lng: data.parking.lng },
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === 'OK' && result) {
          setDirections(result);
          // 評価指標1: 誘導開始ログ（分母のカウント）
          console.log("METRIC: INDUCTION_START", { time: new Date(), from: "Kyoda" });
        }
      }
    );
  }, [isLoaded]);

  useEffect(() => {
    if (isStarted) calculateRoute();
  }, [isStarted, calculateRoute]);

  return isLoaded ? (
    <GoogleMap mapContainerStyle={containerStyle} center={KYODA_STATION} zoom={14} options={{ disableDefaultUI: true }}>
      {directions && <DirectionsRenderer directions={directions} />}
    </GoogleMap>
  ) : <div>Loading...</div>;
}