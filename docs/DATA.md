# 离线数据构建指南（DATA.md）

仓库只含代码与小体积数据；大资源用本目录脚本从开源源头构建。全部脚本仅依赖 Node ≥18，无第三方包。

## 一、数据总览

| 资源 | 产物 | 大小 | 脚本 | 来源 |
|------|------|------|------|------|
| 离线瓦片 | `assets/tiles/{z}/{x}/{y}.png` | ~390MB | `download-tiles.js` | openstreetmap.de 渲染 |
| 轨道/城际/渡轮线路 | `transit/metro.js` | ~0.5MB | `fetch-transit.js metro` + `build-transit.js` | Overpass API |
| 公交走廊 | `transit/corridors.js` | ~0.2MB | `fetch-transit.js bus all` + `build-transit.js` | Overpass API |
| 通勤站点 | `transit/stations.js` | ~0.5MB | `build-housing.js`（含）或自备 JSON | 公开网页采集 |
| 干线图 | `transit/tgraph.js` | ~36KB | `build-traffic-graph.js` | 站点数据派生 |
| 路网图（导航） | `transit/roads.js` | ~31MB | `fetch-roads.js all` + `build-roads.js` | Overpass API |
| 街景点位 | `transit/streetview.js` | ~16KB | Panoramax API（脚本内联于 build-transit） | Panoramax |
| 房源/镇街均价 | `transit/housing.js` | ~4.7MB | `build-housing.js` | 个人采集 JSON（可选） |

> Overpass API 高峰期常返回 502/504：脚本已内置多镜像轮换重试，仍失败请错峰再跑。

## 二、路径配置

脚本默认使用作者机器上的绝对路径（`C:/Users/ted/...`）， fork 后请改每个脚本顶部的
`OUT` / `RAW` / `H` 常量为你本地路径，或全局搜索替换。瓦片覆盖范围在
`download-tiles.js` 的 `CHINA / GUANGDONG / PRD_*` bbox 数组里按需修改。

## 三、标准构建流程

```bash
# 瓦片（约 25 分钟，零失败重试内置）
node tools/download-tiles.js
cp -r <瓦片输出目录> web/transit/../tiles   # 放到 web/mobile/apk-build/assets 三处

# 公共交通（线路→走廊→街景）
node tools/fetch-transit.js metro          # 轨道线路+站点
node tools/fetch-transit.js bus all        # 8 城公交线网
node tools/fetch-transit.js intercity      # 城际/大巴/水上巴士
node tools/build-transit.js                # 生成 metro/corridors/streetview（自动写三端目录）

# 路网图
node tools/fetch-roads.js all              # 7 框主干路网（重跑自动跳过已有框）
node tools/build-roads.js                  # CSR 图 + 反向表（自动写三端目录）

# 房价/通勤（可选）
node tools/build-housing.js                # 需要个人房源采集 JSON（脚本头部列出文件名）
node tools/build-traffic-graph.js          # 干线站点图
```

构建完成后的 `transit/` 产物清单见 `web/transit/`。

## 四、安卓 APK 构建

无 Gradle，使用 Android build-tools 手工链（需要 JDK 17+ 与 Android SDK build-tools 34/35）：

```bash
bash apk-build/build-apk.sh
# 步骤：aapt2 compile/link → javac → d8 → 注入 classes.dex → zipalign → apksigner
# 注意：Windows 版 aapt2 会把 asset 路径写成反斜杠，脚本内置 tools/fix-asset-paths.js 字节级修复
```

签名密钥首次运行自动生成（`build/release.keystore`，口令 openmap123，仅测试用途——正式发布请更换）。

## 五、已知边界

- 莞惠之间西向个别 OD 因 OSM 西向车道数据缺口可能不通（东向正常）
- Overpass API 高峰期不稳定：错峰构建
- 公交"班次密度"为线路覆盖数代理，非实时时刻表
