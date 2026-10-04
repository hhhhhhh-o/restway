# RestWay Architecture

## 当前阶段

```text
Expo / React Native Web PWA
          ↓
RestWay API（Cloudflare Worker）
   ├─ 参数校验与 CORS
   ├─ 5 分钟热点缓存 / 24 小时过期缓存
   └─ OpenStreetMap / Overpass 双节点切换

浏览器还会保存最后一次成功结果。Worker 未配置时，开发版本暂时回退到浏览器直连 Overpass。

北京 MVP 额外包含由 GitHub Actions 定期生成、与网页同源发布的数据快照。北京用户优先使用该快照进行本地距离筛选，从而规避 `workers.dev` 和公共 Overpass 节点在国内网络不可达的问题。
```

## 计划架构

```text
iPhone PWA / React Native
          ↓ REST API
Python API 服务
   ├─ 地理数据适配与缓存
   └─ PyTorch 图像推理
          ↓
PostgreSQL + PostGIS（后续）
```

## 原则

- 第一版优先完成真实可用的查找闭环。
- 北京是首个测试城市；必须先获得用户授权定位再查询真实附近结果，不保存用户的精确位置。
- 用户拒绝定位时可主动选择顺义区测试模式；测试结果必须明确标识，且不得开放依赖真实起点的导航。
- AI 只用于厕所标识、方向箭头和用户图片信息提取。
- 不在客户端或 Git 仓库中保存私密密钥。
- 地点数据必须保留来源、更新时间和可信度状态。
- 公共 Overpass 节点可能过载，查询代理必须具备超时、备用节点、缓存和可重试错误状态。
- 缓存结果必须标注采集时间，不能伪装成实时查询结果。
