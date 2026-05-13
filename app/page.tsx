'use client';
import { useState } from 'react';
import MapContainer from '@/components/MapContainer';
import data from '@/data/spots.json';

export default function Home() {
  const [status, setStatus] = useState<'idle' | 'navigating' | 'completed'>('idle');

  const handleStart = () => {
    setStatus('navigating');
    // 評価ログ: 許田でのQRスキャン後の開始アクション
  };

  const handleComplete = () => {
    setStatus('completed');
    // 評価指標2: グッズ受取完了（分子のカウント）
    console.log("METRIC: GOODS_RECEIVED", { time: new Date(), location: "Shoutengai" });
  };

  return (
    <main style={{ height: '100vh', backgroundColor: '#f8f9fa', fontFamily: 'sans-serif' }}>
      <MapContainer isStarted={status !== 'idle'} onArrival={() => {}} />

      <div style={{ position: 'fixed', bottom: 0, width: '100%', padding: '24px', backgroundColor: '#fff', borderTopLeftRadius: '30px', boxShadow: '0 -10px 20px rgba(0,0,0,0.1)' }}>
        {status === 'idle' && (
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>Chura Freshを受け取ろう</h2>
            <p style={{ color: '#666', margin: '10px 0 20px' }}>商店街で限定の香りをプレゼント！</p>
            <button onClick={handleStart} style={{ width: '100%', padding: '16px', borderRadius: '15px', backgroundColor: '#0070f3', color: '#fff', border: 'none', fontSize: '1.1rem', fontWeight: 'bold' }}>
              ルートを表示して出発
            </button>
          </div>
        )}

        {status === 'navigating' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ padding: '8px 16px', backgroundColor: '#fff3cd', color: '#856404', borderRadius: '10px', marginBottom: '15px', fontSize: '0.9rem' }}>
              ⚠️ 商店街周辺は路駐禁止です。市営駐車場へ向かってください。
            </div>
            <button onClick={handleComplete} style={{ width: '100%', padding: '16px', borderRadius: '15px', backgroundColor: '#28a745', color: '#fff', border: 'none', fontSize: '1.1rem' }}>
              店舗に到着・グッズを受け取った
            </button>
          </div>
        )}

        {status === 'completed' && (
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ color: '#28a745' }}>受取完了！✨</h2>
            <p style={{ margin: '10px 0' }}>せっかくなので、近くのお店も覗いてみませんか？</p>
            <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', padding: '10px 0' }}>
              {data.shops.map(shop => (
                <div key={shop.id} style={{ minWidth: '150px', padding: '15px', backgroundColor: '#f1f3f5', borderRadius: '15px', fontSize: '0.9rem' }}>
                  <strong>{shop.name}</strong><br/>
                  <span style={{ fontSize: '0.8rem', color: '#0070f3' }}>おすすめ: {shop.scent}の香り</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}