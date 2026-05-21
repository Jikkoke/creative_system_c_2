// update_coordinates.mjs
import fs from 'fs/promises';

// ⚠️ ここにあなたのGoogle Maps APIキーを直接貼り付けてください
const API_KEY = 'AIzaSyCIKDbfdrwfIyq6caobxXlVm60JLRHPf1E'; 

const INPUT_FILE = './data/shelters.json';
const OUTPUT_FILE = './data/shelters_accurate.json'; // 上書きを防ぐため別名で保存します

// 住所から緯度経度を取得する関数
async function geocode(address, name) {
  // 精度を上げるため、住所と施設名を繋げて検索します
  const query = encodeURIComponent(`${address} ${name}`);
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${API_KEY}&language=ja`;
  
  const response = await fetch(url);
  const data = await response.json();
  
  if (data.status === 'OK' && data.results.length > 0) {
    return data.results[0].geometry.location; // { lat: ..., lng: ... }
  } else {
    console.warn(`⚠️ 取得失敗: ${name} (ステータス: ${data.status})`);
    return null;
  }
}

async function main() {
  console.log('🗺️ 座標の取得を開始します...');
  
  try {
    const rawData = await fs.readFile(INPUT_FILE, 'utf-8');
    const shelters = JSON.parse(rawData);

    for (let shelter of shelters) {
      console.log(`⏳ 検索中: ${shelter.name}`);
      const location = await geocode(shelter.address, shelter.name);
      
      if (location) {
        shelter.lat = location.lat;
        shelter.lng = location.lng;
        console.log(`  └ 成功: lat=${location.lat}, lng=${location.lng}`);
      }
      
      // Google APIの利用制限（レートリミット）を避けるため、1件ごとに0.2秒待機します
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // 新しいファイルに書き出し
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(shelters, null, 2), 'utf-8');
    console.log(`\n✅ 完了しました！正確な座標が ${OUTPUT_FILE} に保存されました。`);
    
  } catch (error) {
    console.error('エラーが発生しました:', error.message);
  }
}

main();