'use client';
import { useState } from 'react';
import MapContainer from '@/components/MapContainer';
import data from '@/data/spots.json';

export default function Home() {
  const [status, setStatus] = useState<'idle' | 'navigating' | 'completed'>('idle');
  // 💡 追加: 防災モードのオンオフ状態を管理するState
  const [isDisasterMode, setIsDisasterMode] = useState(false);

  const handleStart = () => {
    setStatus('navigating');
    sendLog('INDUCTION_START', { from: 'Kyoda' });
  };

  const handleComplete = () => {
    setStatus('completed');
    sendLog('GOODS_RECEIVED', { location: 'Shoutengai' });
  };

  const sendLog = (metric: string, details: any) => {
    console.log(`METRIC: ${metric}`, { time: new Date(), ...details });
  };

  // 防災モードの切り替え処理
  const toggleDisasterMode = () => {
    setIsDisasterMode(!isDisasterMode);
  };

  return (
    <main className={`relative h-[100dvh] font-sans overflow-hidden transition-colors duration-500 ${isDisasterMode ? 'bg-red-50' : 'bg-gray-50'}`}>
      
      {/* --- 🛡️ 防災モード切替ボタン（画面右上に固定） --- */}
      <div className="absolute top-4 right-4 z-20">
        <button
          onClick={toggleDisasterMode}
          className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold shadow-lg transition-all ${
            isDisasterMode 
              ? 'bg-red-600 text-white animate-pulse' 
              : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          <span className="text-xl">{isDisasterMode ? '🚨' : '🛡️'}</span>
          {isDisasterMode ? '防災モードON' : '防災モード切替'}
        </button>
      </div>

      {/* --- ⚠️ 災害時の緊急バナー --- */}
      {isDisasterMode && (
        <div className="absolute top-16 left-4 right-4 z-20 bg-red-600/90 backdrop-blur text-white p-4 rounded-xl shadow-xl animate-in slide-in-from-top-4 fade-in">
          <h3 className="font-bold text-lg mb-1 flex items-center gap-2">
            <span>⚠️</span> 避難所・AEDを表示中
          </h3>
          <p className="text-sm font-medium">落ち着いて、最も近い高台の避難所へ向かってください。</p>
        </div>
      )}

      {/* --- マップエリア --- */}
      <div className="absolute inset-0 z-0">
        {/* 担当Bのマップコンポーネントに isDisasterMode の状態を渡す */}
        <MapContainer 
          isStarted={status !== 'idle'} 
          onArrival={handleComplete} 
          isDisasterMode={isDisasterMode} 
        />
      </div>

      {/* --- ボトムシート --- */}
      <div className={`absolute bottom-0 w-full bg-white px-6 pt-8 pb-10 rounded-t-[30px] shadow-[0_-15px_30px_rgba(0,0,0,0.15)] z-10 transition-transform duration-500 ${isDisasterMode ? 'border-t-4 border-red-500' : ''}`}>
        
        {/* 【通常モード】 */}
        {!isDisasterMode && (
          <>
            {status === 'idle' && (
              <div className="text-center">
                <h2 className="text-2xl font-extrabold text-gray-800">Chura Freshを受け取ろう</h2>
                <p className="text-gray-500 mt-2 mb-6 font-medium">商店街で限定の香りをプレゼント！</p>
                <button onClick={handleStart} className="w-full py-4 rounded-2xl bg-blue-600 text-white text-lg font-bold shadow-lg hover:bg-blue-700 active:scale-95 transition-all">
                  ルートを表示して出発
                </button>
              </div>
            )}

            {status === 'navigating' && (
              <div className="text-center">
                <div className="px-4 py-3 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl mb-5 text-sm font-bold flex items-center justify-center gap-2">
                  <span>⚠️</span>商店街周辺は路駐禁止です。市営駐車場へ向かってください。
                </div>
                <button onClick={handleComplete} className="w-full py-4 rounded-2xl bg-emerald-500 text-white text-lg font-bold shadow-lg hover:bg-emerald-600 active:scale-95 transition-all">
                  店舗に到着・グッズを受け取った
                </button>
              </div>
            )}

            {status === 'completed' && (
              <div className="text-center">
                <h2 className="text-2xl font-extrabold text-emerald-500 mb-2">受取完了！✨</h2>
                <p className="text-gray-600 mb-5 font-medium">せっかくなので、近くのお店も覗いてみませんか？</p>
                <div className="flex gap-4 overflow-x-auto pb-2 snap-x hide-scrollbar">
                  {data.shops.map((shop: any) => (
                    <div key={shop.id} className="min-w-[160px] p-4 bg-gray-50 border border-gray-100 rounded-2xl text-left snap-start shadow-sm">
                      <strong className="block text-gray-800 text-base">{shop.name}</strong>
                      <span className="text-xs text-blue-600 font-bold mt-1 inline-block bg-blue-50 px-2 py-1 rounded-md">{shop.scent}の香り</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* 【防災モード】の緊急ボトムシート */}
        {isDisasterMode && (
          <div className="text-center animate-in fade-in zoom-in-95 duration-300">
            <h2 className="text-2xl font-extrabold text-red-600 mb-2">緊急アクション</h2>
            <p className="text-gray-600 mb-6 font-medium">現在地の送信や、安全確保を行ってください</p>
            
            <button className="w-full py-4 mb-3 rounded-2xl bg-red-600 text-white text-lg font-bold shadow-lg hover:bg-red-700 active:scale-95 transition-all flex justify-center items-center gap-2">
              <span className="text-xl">📍</span> 家族に「無事です」と送る
            </button>
            
            <button className="w-full py-4 rounded-2xl bg-gray-100 text-gray-800 text-lg font-bold shadow hover:bg-gray-200 active:scale-95 transition-all flex justify-center items-center gap-2">
              <span className="text-xl">📻</span> 防災ラジオ・周辺情報を確認
            </button>
          </div>
        )}

      </div>
    </main>
  );
}