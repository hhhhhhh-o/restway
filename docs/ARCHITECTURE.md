# RestWay Architecture

## 当前阶段

```text
Expo / React Native Web PWA
          ↓
OpenStreetMap / Overpass API
   ├─ 主节点
   └─ 备用节点与超时降级
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
- 北京是首个测试城市；用户拒绝定位时使用公开的北京市中心坐标进行演示，不保存用户的精确位置。
- AI 只用于厕所标识、方向箭头和用户图片信息提取。
- 不在客户端或 Git 仓库中保存私密密钥。
- 地点数据必须保留来源、更新时间和可信度状态。
- 公共 Overpass 节点可能过载，客户端必须具备超时、备用节点和可重试错误状态。
