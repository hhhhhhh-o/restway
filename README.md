# RestWay

RestWay 是一个面向旅行者的公共厕所检索与标识识别应用。第一阶段采用 PWA-first、iPhone-first 的方式，用户可以通过 Safari 将应用添加到主屏幕，无需上架 App Store。

首个测试城市为北京。开发阶段会先用北京的公开地点数据验证“定位—检索—查看详情—导航”闭环，再逐步扩展到其他城市。

## 当前状态

项目已进入 M1 附近厕所最小闭环阶段：

- Expo Router + TypeScript 项目结构
- iOS-first 首页视觉原型
- PWA manifest 与主屏幕图标草案
- 北京市中心默认位置与浏览器定位入口
- OpenStreetMap/Overpass 真实厕所数据查询
- 距离排序、免费/无障碍筛选与 Apple 地图导航
- 公共接口双节点容错、超时和重试状态
- Roadmap 和架构文档
- TypeScript 类型检查与 Expo Web 导出验证通过

真实地图底图和 AI 识别尚未接入。厕所记录来自 OpenStreetMap 社区数据，可能存在缺失或标签不完整。

## 计划技术栈

- Expo / React Native / TypeScript
- Expo Router
- OpenStreetMap / Overpass API
- Python API 服务
- PyTorch 目标检测
- PostgreSQL + PostGIS（后续）

## 本地运行

依赖安装成功后：

```bash
pnpm install
pnpm web
```

依赖使用工作区内的 pnpm 缓存安装，避免向用户目录写入包管理缓存。

## 文档

- [开发路线](docs/ROADMAP.md)
- [架构说明](docs/ARCHITECTURE.md)

## 隐私与安全

- 不提交 API Key 或真实用户位置记录。
- 定位功能必须经过用户明确授权。
- 用户照片和位置数据默认最小化保存。
