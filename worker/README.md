# RestWay API Worker

轻量查询代理，供 GitHub Pages 上的 RestWay PWA 调用。

## 接口

- `GET /health`
- `GET /api/toilets?lat=40.1499&lon=116.6615&radius=2000`

经纬度被归一到小数点后三位用于共享缓存，查询范围限制为 100–10000 米。新鲜结果缓存 5 分钟；公共数据源失败时，可返回 24 小时内的最后结果并将 `meta.mode` 标为 `stale`。

## 本地启动

```bash
pnpm worker:dev
```

## 部署

```bash
pnpm worker:deploy
```

首次执行时 Wrangler 会打开 Cloudflare 登录页面。部署完成后，将输出的 HTTPS 地址配置为 GitHub Actions 仓库变量 `RESTWAY_API_URL`。
