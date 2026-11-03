#!/bin/bash
# 开源地图 APK 构建脚本（aapt2 + javac + d8 + zipalign + apksigner）
set -e

WS=/c/Users/ted/.zcode/workspace/1793421192336-da101ef3-ab13-44d1-9332-588a26ebece5
APK=$WS/apk-build
SDK=/c/Users/ted/AppData/Local/Android/Sdk
BT=$SDK/build-tools/35.0.0
PLAT=$SDK/platforms/android-34/android.jar

echo "[1/7] 复制离线瓦片到 assets..."
if [ ! -d "$APK/assets/tiles" ]; then
  cp -r "$WS/downloads/tiles" "$APK/assets/tiles"
fi
TILE_COUNT=$(find "$APK/assets/tiles" -name '*.png' | wc -l)
echo "      瓦片数量: $TILE_COUNT"

echo "[2/7] aapt2 编译资源..."
mkdir -p "$APK/build/gen" "$APK/build/classes" "$APK/build/dex"
"$BT/aapt2.exe" compile --dir "$APK/res" -o "$APK/build/res.zip"

echo "[3/7] aapt2 链接（含 assets，需一点时间）..."
"$BT/aapt2.exe" link -o "$APK/build/base.apk" \
  -I "$PLAT" \
  --manifest "$APK/AndroidManifest.xml" \
  -A "$APK/assets" \
  --java "$APK/build/gen" \
  --min-sdk-version 24 --target-sdk-version 34 \
  --version-code 21 --version-name 3.0 \
  "$APK/build/res.zip"

echo "[3.5/7] 修复 Windows aapt2 的路径分隔符 bug..."
node "$WS/tools/fix-asset-paths.js" "$APK/build/base.apk"

echo "[4/7] javac 编译 Java..."
javac -Xlint:-options -source 8 -target 8 -encoding UTF-8 \
  -cp "$PLAT" \
  -d "$APK/build/classes" \
  "$APK/build/gen/com/ted/openmap/R.java" \
  "$APK/src/com/ted/openmap/MainActivity.java"

echo "[5/7] d8 转 dex..."
java -cp "$BT/lib/d8.jar" com.android.tools.r8.D8 --release --min-api 24 \
  --lib "$PLAT" \
  --output "$APK/build/dex" \
  $(find "$APK/build/classes" -name '*.class')

echo "[6/7] 注入 classes.dex 并对齐..."
jar uf "$APK/build/base.apk" -C "$APK/build/dex" classes.dex
"$BT/zipalign.exe" -f 4 "$APK/build/base.apk" "$APK/build/aligned.apk"

echo "[7/7] 生成密钥并签名..."
if [ ! -f "$APK/build/release.keystore" ]; then
  keytool -genkeypair -keystore "$APK/build/release.keystore" -alias openmap \
    -storepass openmap123 -keypass openmap123 -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=Open Map, OU=Personal, O=Personal, C=CN" >/dev/null 2>&1
fi
mkdir -p /c/Users/ted/Desktop/map/apk
java -jar "$BT/lib/apksigner.jar" sign \
  --ks "$APK/build/release.keystore" --ks-pass pass:openmap123 \
  --out "/c/Users/ted/Desktop/map/apk/开源地图.apk" \
  "$APK/build/aligned.apk"

echo "=== 验签 ==="
java -jar "$BT/lib/apksigner.jar" verify --print-certs "/c/Users/ted/Desktop/map/apk/开源地图.apk" | head -5
echo "=== APK 信息 ==="
"$BT/aapt2.exe" dump badging "/c/Users/ted/Desktop/map/apk/开源地图.apk" | head -4
ls -lh "/c/Users/ted/Desktop/map/apk/开源地图.apk"
echo "=== 构建完成 ==="
