# creative_system_c

名護商店街周辺スポットを表示する Next.js アプリです。

## スポットデータ更新

今回のスポット更新は `data/nago_spot.xlsx` を正として行います。

```bash
npm run import:spots
npm run check:spots
```

`npm run import:spots` では以下を行います。

- `data/nago_spot.xlsx` を読み込む
- `data/nago_spot_resolved.json` にある Google Maps 展開URLを参照する
- 座標は `!3d<lat>!4d<lng>` を最優先で採用する
- `@lat,lng` しか取れない場合は `data/spots.json` に入れず `data/unresolved-spots.json` へ出力する
- ヒトハコから徒歩回遊しやすい範囲のスポットだけ `data/spots.json` に反映する

`npm run check:spots` では以下を確認します。

- `data/spots.json` の ID / category / 緯度経度
- `food` / `shop` スポットの `googleMapsUrl`
- `coordinateSource` の記録有無
- 旧名称 `名護十字路商店連合` / `名護十字路商店連合会` の残存有無
- 同一座標スポットの検出 (`data/duplicate-coordinates.json`)

## 出力ファイル

- `data/spots.json`
- `data/nago_spot_resolved.json`
- `data/unresolved-spots.json`
- `data/excluded-spots.json`
- `data/duplicate-map-urls.json`
- `data/duplicate-coordinates.json`
