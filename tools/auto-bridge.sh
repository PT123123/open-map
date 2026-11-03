#!/bin/bash
# 自动化：重试莞惠桥接框 → 成功则全量重建路网并打包 v2.7
WS=/c/Users/ted/.zcode/workspace/1793421192336-da101ef3-ab13-44d1-9332-588a26ebece5
cd "$WS/tools" || exit 1

for i in 1 2 3 4 5 6 7 8; do
  echo "=== 桥接框尝试 $i/8 $(date +%H:%M) ==="
  if node --max-old-space-size=2048 fetch-bridge.js; then
    echo "=== 桥接框成功，重建路网 ==="
    node --max-old-space-size=6144 build-roads.js | tail -2
    cp "$WS/apk-build/assets/transit/roads.js" /c/Users/ted/Desktop/map/web/transit/roads.js
    cp "$WS/apk-build/assets/transit/roads.js" /c/Users/ted/Desktop/map/mobile/transit/roads.js
    sed -i 's/--version-code 17 --version-name 2.6/--version-code 18 --version-name 2.7/' "$WS/apk-build/build-apk.sh"
    sed -i 's/android:versionCode="17"/android:versionCode="18"/; s/android:versionName="2.6"/android:versionName="2.7"/' "$WS/apk-build/AndroidManifest.xml"
    bash "$WS/apk-build/build-apk.sh" | tail -2
    echo "=== V27_DONE ==="
    exit 0
  fi
  sleep 240
done
echo "=== 8 次尝试均失败（Overpass 持续不可用），下次再跑 fetch-bridge.js + build-roads.js + build-apk.sh ==="
