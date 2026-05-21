// hooks/useWeatherAlert.ts
import { useState, useEffect } from 'react';

const WARNING_LABELS: Record<string, string> = {
  '02': '暴風警報', '03': '大雨警報', '04': '洪水警報', '05': '暴風雨警報',
  '08': '高潮警報', '10': '大雨注意報', '13': '強風注意報', '14': '波浪注意報',
  '15': '高潮注意報', '16': '濃霧注意報', '17': '雷注意報'
};

export const useWeatherAlert = (isDisasterMode: boolean) => {
  const [weatherAlert, setWeatherAlert] = useState<string | null>(null);

  useEffect(() => {
    if (!isDisasterMode) {
      setWeatherAlert(null);
      return;
    }

    setWeatherAlert("最新の気象情報を取得中...");
    fetch('https://www.jma.go.jp/bosai/warning/data/warning/471000.json')
      .then(res => res.json())
      .then(data => {
        try {
          let nago = null;
          if (data && data.areaTypes) {
            for (const areaType of data.areaTypes) {
              if (areaType.areas) {
                const target = areaType.areas.find((a: any) => a.code === '4720900');
                if (target) { nago = target; break; }
              }
            }
          }

          if (nago && nago.warnings) {
            const activeWarnings = nago.warnings
              .filter((w: any) => w.status !== '解除' && w.status !== '発表警報・注意報はなし')
              .map((w: any) => WARNING_LABELS[w.code] || '警報・注意報');

            if (activeWarnings.length > 0) {
              const uniqueWarnings = Array.from(new Set(activeWarnings));
              setWeatherAlert(`【発表中】${uniqueWarnings.join('、')}`);
            } else {
              setWeatherAlert("現在、名護市に発表されている気象警報・注意報はありません。");
            }
          } else {
            setWeatherAlert("現在、名護市に発表されている気象警報・注意報はありません。");
          }
        } catch (e) {
          setWeatherAlert("気象情報の解析に失敗しました。");
        }
      })
      .catch(() => {
        setWeatherAlert("通信エラー：オフラインマップと避難所データを表示しています。");
      });
  }, [isDisasterMode]);

  return { weatherAlert };
};