# 开源地图（Open Map）

基于 **OpenStreetMap** 开源数据的离线优先地图应用，一次构建、四端可用：

- 🖥️ **电脑版**（Electron）
- 🌐 **网页版**（浏览器直开）
- 📱 **手机版**（PWA / 局域网）
- 📦 **安卓 APK**（离线数据全内置）

## 功能

- 🗺️ 离线瓦片（广东优先策略：珠三角街道/建筑级 + 全省县市 + 全国行政轮廓），在线时自动回退 OSM/Esri/OpenTopoMap
- 🔍 中文地点搜索（Nominatim）
- 🚇 地铁/城际铁路/水上巴士线路图（OSM 公交线网，官方配色）
- 🚌 公交走廊热力（同路段公交线路数 → 班次密度 → 通勤宜居度）
- 📷 开放街景点位（Panoramax，CC-BY-SA）
- 🧭 离线路线规划：**A\* / Dijkstra / 双向 Dijkstra** 三算法 + 最快/最短/避开高速三策略 + 转向指令
- 🧮 多模式通勤分析：**接驳（电动车/步行）+ 干线大巴**全链路时间，房源按总通勤分色 + 等时圈站点可视化
- 💎 性价比排行：通勤可达 × 价格排序 + 镇街统计 + 一键复制
- 🏠 低价房源 + 🚏 通勤站点 + 🌍 低价城市参考 + 🌡️ 镇街均价气泡图

## 快速开始

### 网页版
直接用浏览器打开 `web/index.html`（或 `python -m http.server` 后访问，PWA 功能更完整）。

### 电脑版
```bash
cd desktop && npm install && npx electron .
```

### 局域网服务（手机扫码）
双击 `lanpub`（或 `node lanpub/server.js`），浏览器打开管理页扫码。

### 安卓 APK
从 [Releases](../../releases) 下载（含全部离线数据），或按 `docs/DATA.md` 自行构建。

## 离线数据构建（重要）

仓库内**只含代码与小体积数据**；瓦片（~390MB）、路网图（~31MB）等大资源用脚本从开源源头（Overpass API / OSM）按需构建：

```bash
# 1. 瓦片（覆盖范围在脚本顶部 bbox 配置里改）
node tools/download-tiles.js

# 2. 公共交通（轨道+公交走廊+街景）
node tools/fetch-transit.js metro
node tools/fetch-transit.js bus all
node tools/fetch-transit.js intercity
node tools/build-transit.js

# 3. 路网图（A*/Dijkstra 用）
node tools/fetch-roads.js all
node tools/build-roads.js

# 4. 房价/通勤数据（可选：需自行准备的房源采集 JSON，见脚本头部说明）
node tools/build-housing.js

# 5. 同步到各端
#    build-transit.js / build-roads.js 已自动输出到 web/mobile/apk-build 三处
```

详见 [docs/DATA.md](docs/DATA.md)（数据来源、目录结构、脚本参数）。

## 目录结构

```
web/ mobile/ desktop/   三端界面（结构相近，数据层共享）
lanpub/                 局域网发布服务（管理页+二维码）
apk-build/              安卓工程（无 Gradle：aapt2+javac+d8+apksigner 手工链）
tools/                  数据抓取与构建脚本（全部无第三方依赖，Node ≥18）
docs/DATA.md            数据来源与构建说明
```

## 数据来源与许可

| 来源 | 用途 | 许可 |
|------|------|------|
| © OpenStreetMap 贡献者 | 地图数据/路网/公交线网/地名索引 | ODbL |
| openstreetmap.de | 瓦片渲染（离线镜像） | OSM 社区镜像 |
| Panoramax 贡献者 | 开放街景照片 | CC-BY-SA 4.0 |
| Esri / OpenTopoMap | 卫星 / 地形在线图层 | 各自条款 |
| 房源/站点采集 | 来自公开网页的个人采集 | 仅个人研究用途 |

本仓库代码以 [MIT](LICENSE) 许可发布；构建产物中的地图数据遵循上述来源许可。
