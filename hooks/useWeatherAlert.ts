// hooks/useWeatherAlert.ts
import { useState, useEffect } from 'react';

const WARNING_LABELS: Record<string, string> = {
  '02': '暴風警報', '03': '大雨警報', '04': '洪水警報', '05': '暴風雨警報',
  '08': '高潮警報', '10': '大雨注意報', '13': '強風注意報', '14': '波浪注意報',
  '15': '高潮注意報', '16': '濃霧注意報', '17': '雷注意報'
};

interface JmaWarning {
  code: string;
  status: string;
}

interface JmaArea {
  code: string;
  warnings?: JmaWarning[];
}

interface JmaAreaType {
  areas?: JmaArea[];
}

interface JmaWarningData {
  areaTypes?: JmaAreaType[];
}

const NAGO_AREA_CODE = '4720900';

export const useWeatherAlert = (isDisasterMode: boolean) => {
  const [weatherAlert, setWeatherAlert] = useState<string | null>(null);

  useEffect(() => {
    if (!isDisasterMode) return;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading state before async fetch
    setWeatherAlert('最新の気象情報を取得中...');

    fetch('https://www.jma.go.jp/bosai/warning/data/warning/471000.json')
      .then((res) => res.json() as Promise<JmaWarningData>)
      .then((data) => {
        if (cancelled) return;

        let nago: JmaArea | null = null;
        for (const areaType of data?.areaTypes ?? []) {
          const target = areaType.areas?.find((a) => a.code === NAGO_AREA_CODE);
          if (target) {
            nago = target;
            break;
          }
        }

        const warnings = nago?.warnings ?? [];
        const activeLabels = warnings
          .filter((w) => w.status !== '解除' && w.status !== '発表警報・注意報はなし')
          .map((w) => WARNING_LABELS[w.code] ?? '警報・注意報');

        if (activeLabels.length > 0) {
          const unique = Array.from(new Set(activeLabels));
          setWeatherAlert(`【発表中】${unique.join('、')}`);
        } else {
          setWeatherAlert('現在、名護市に発表されている気象警報・注意報はありません。');
        }
      })
      .catch(() => {
        if (cancelled) return;
        setWeatherAlert('通信エラー：オフラインマップと避難所データを表示しています。');
      });

    return () => {
      cancelled = true;
    };
  }, [isDisasterMode]);

  return { weatherAlert };
};
