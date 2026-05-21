'use client';
import { useState } from 'react';
import MapContainer from '@/components/MapContainer';
import data from '@/data/spots.json';

// 💡 外部に切り出したカスタムフックをインポート
import { useGeolocation } from '@/hooks/useGeolocation';
import { useWeatherAlert } from '@/hooks/useWeatherAlert';

export default function Home() {
  const [status, setStatus] = useState<'idle' | 'navigating' | 'completed'>('idle');
  const [isDisasterMode, setIsDisasterMode] = useState(false);
  const [detourTime, setDetourTime] = useState(15);
  const [activeTag, setActiveTag] = useState<string | null>(null);

  // 💡 カスタムフックを呼び出すだけで、複雑な処理が完了する
  const { userLocation, isLocating } = useGeolocation();
  const { weatherAlert } = useWeatherAlert(isDisasterMode);

  const tags = ['#海が見たい', '#静かな場所', '#地元グルメ', '#歴史'];

  const handleStart = () => {
    if (!userLocation) {
      alert('現在地がまだ取得できていません。しばらくお待ちください。');
      return;
    }
    setStatus('navigating');
  };

  const handleComplete = () => setStatus('completed');
  const toggleDisasterMode = () => setIsDisasterMode(!isDisasterMode);

  return (
    <main className={`relative h-[100dvh] font-sans overflow-hidden transition-colors duration-500 ${isDisasterMode ? 'bg-red-900' : 'bg-gray-50'}`}>
      
      {/* 防災モード切替ボタン */}
      <div className="absolute top-4 right-4 z-20">
        <button
          onClick={toggleDisasterMode}
          className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold shadow-lg transition-all ${
            isDisasterMode ? 'bg-red-600 text-white animate-pulse border border-red-400' : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          <span className="text-xl">{isDisasterMode ? '🚨' : '🛡️'}</span>
          {isDisasterMode ? '防災モードON' : '防災モード切替'}
        </button>
      </div>

      {/* 緊急バナー */}
      {isDisasterMode && (
        <div className="absolute top-16 left-4 right-4 z-20 bg-red-600/95 backdrop-blur-md text-white p-5 rounded-2xl shadow-2xl animate-in slide-in-from-top-4 fade-in">
          <h3 className="font-bold text-lg mb-3 flex items-center gap-2"><span className="text-2xl">⚠️</span> 緊急避難情報</h3>
          <div className="bg-white/20 border border-white/30 rounded-xl p-3 mb-3">
            <div className="text-xs text-white/80 mb-1 font-bold">名護市の気象情報 (気象庁発表)</div>
            <div className="text-sm font-bold leading-tight">{weatherAlert || "情報取得中..."}</div>
          </div>
          <p className="text-xs font-medium opacity-90">落ち着いて、地図上の赤いピン（最も近い避難所）へ向かってください。</p>
        </div>
      )}

      {/* マップエリア */}
      <div className="absolute inset-0 z-0">
        <MapContainer 
          isStarted={status !== 'idle'} 
          onArrival={handleComplete} 
          isDisasterMode={isDisasterMode} 
          userLocation={userLocation}
        />
      </div>

      {/* ボトムシート */}
      <div className={`absolute w-full bg-white px-6 pt-8 pb-10 rounded-t-[30px] shadow-[0_-15px_30px_rgba(0,0,0,0.15)] z-10 transition-transform duration-500 ease-in-out ${isDisasterMode ? 'translate-y-full bottom-[-20px]' : 'translate-y-0 bottom-0'}`}>
        
        {status === 'idle' && (
          <div>
            <div className="text-center mb-6">
              <h2 className="text-2xl font-extrabold text-gray-800">名護を散策しよう</h2>
              <p className="text-gray-500 mt-1 font-medium text-sm">商店街に向かう前に、少し寄り道しませんか？</p>
            </div>
            
            <div className="mb-6">
              <div className="flex justify-between items-end mb-2">
                <span className="text-sm font-bold text-gray-600">寄り道できる時間</span>
                <span className="text-2xl font-extrabold text-blue-600">{detourTime}<span className="text-base text-gray-500 ml-1">分</span></span>
              </div>
              <input type="range" min="5" max="60" step="5" value={detourTime} onChange={(e) => setDetourTime(Number(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
            </div>

            <div className="mb-6 flex gap-2 overflow-x-auto hide-scrollbar pb-2">
              {tags.map(tag => (
                <button key={tag} onClick={() => setActiveTag(activeTag === tag ? null : tag)} className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-bold transition-all ${activeTag === tag ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {tag}
                </button>
              ))}
            </div>

            <button onClick={handleStart} disabled={isLocating} className={`w-full py-4 rounded-2xl text-white text-lg font-bold shadow-lg transition-all flex justify-center items-center gap-2 ${isLocating ? 'bg-gray-400 cursor-not-allowed animate-pulse' : 'bg-blue-600 hover:bg-blue-700 active:scale-95'}`}>
              <span>{isLocating ? '⏳' : '🚶‍♂️'}</span> 
              {isLocating ? '現在地を特定中...' : 'ルートを表示して出発'}
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
            <div className="flex gap-4 overflow-x-auto pb-2 snap-x hide-scrollbar mt-5">
              {data.shops.map((shop: any) => (
                <div key={shop.id} className="min-w-[160px] p-4 bg-gray-50 border border-gray-100 rounded-2xl text-left snap-start shadow-sm">
                  <strong className="block text-gray-800 text-base">{shop.name}</strong>
                  <span className="text-xs text-blue-600 font-bold mt-1 inline-block bg-blue-50 px-2 py-1 rounded-md">{shop.scent}の香り</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}