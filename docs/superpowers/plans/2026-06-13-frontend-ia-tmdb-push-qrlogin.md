# Frontend IA 重构 + TMDB 接通 + 推送 + 115 扫码 Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Checkbox steps.
> 跨上下文锚点。用户反馈原文要点见下；调研 agent（Overseerr IA 范式）结果出来后充实 S3 布局细节。

**用户反馈（2026-06-13，全部要收）：**
1. 库页通知面板：3 条同文消息图标却不同（index 写死的 demo 逻辑）+ React duplicate key 报错（key=title）。
2. 媒体库点进去应该先是**海报墙**，不是直接某剧 dashboard。
3. 点剧进入后**所有季在同一页面**（标题级单页），不要每季一卡/一路由；现"全部追踪"每季一卡片"意义不明"。
4. 快速入口：已追踪部分季的剧，库页/搜索页都要能"获取其他季/某一季/剩余全部"。
5. 搜索已库内剧：结果须融合 DB 状态（已获取哪些季集），点进同一标题页给获取按钮——搜索与媒体库收敛同一路由。
6. 接 TMDB API（海报元数据刮削落库），接上即测试。
7. 之后自主实现：通知推送渠道 + 115 扫码登录（调研报告在 docs/research/）。

## S1 通知面板修复（最小）
- dashboard.events 改为携带 {id, kind, title, body}（search-page 从真实 notifications 映射）。
- page.tsx 事件列表：key=id；图标按 kind 映射（复用 notifications 页 kindMeta 语义）。
- demo-workflow 默认 events 同步补 id/kind。

## S2 元数据落库
- MediaTitle 增可选 posterPath/backdropPath/overview（payload JSON 存储，无迁移）。
- tmdb-provider：prepareTrackingTarget/prepareSeriesTarget 从 details 填充。
- 测试：tmdb-provider test 断言 poster 字段透传。

## S3 标题级路由重构（等 Overseerr 调研细化布局）
- 新 `/show/[tmdbId]`：hero（海报+标题+年份+overview）+ 季列表（每季一行：状态徽章
  未追踪/追更中/已完结 + 进度 x/y + 行内集数 chips（tracked 时）+ 未追踪季"获取本季"按钮）
  + 顶部"获取全剧/获取剩余"主按钮。
- 数据：DB tracked states（titleId=tmdb_tv_{id}）+ TMDB details（未追踪季元数据/海报兜底）。
- 旧 `/show/[tmdbId]/[seasonNumber]` 删除，redirect 到 /show/[tmdbId]。
- 媒体库 tab = 海报墙（poster 卡：图、标题、年份、状态徽章 追更中/已完结/部分、x/y 集）。
  删 spotlight dashboard 与"全部追踪"季卡网格。
- 搜索卡：渲染真实海报图，链接 /show/[tmdbId]，已追踪时显示徽章；保留卡上快捷"获取"。

## S4 获取入口命令层
- 任意季获取：web action queueSeasonTracking(tmdbId, seasonNumber)（prepareTrackingTarget 已支持任意季）。
- 获取剩余：series init 的 seasons 数组过滤掉"已完整获取的 completed 季"；幂等锁改挂到数组首季；
  全部已追踪→already_tracked。reconcile（d49f3c9）保证重叠也不重复转存。

## S5 TMDB live 接通 + 测试
- .env / launch.json 加 MEDIA_TRACK_SEARCH_PROVIDER=tmdb。
- 浏览器实测：搜索黑袍纠察队 → 海报渲染 → 进 /show/76479 显示 5 季已完结 + 获取按钮态正确；
  库页海报墙出图。

## S6 推送渠道（自主）
- packages/workflow/src/notify.ts：NotifyChannel 接口 + Bark/Server酱Turbo/企微机器人/通用 webhook
  四个 adapter（全是 fetch POST，fetchJson 可注入测试）。
- env 配置：MEDIA_TRACK_PUSH_BARK_KEY / _SERVERCHAN_SENDKEY / _WECOM_WEBHOOK / _WEBHOOK_URL。
- 派发点：web worker 路由（run-next/run-type3）持久化通知后逐条推送（失败仅日志，不影响 run）。
- 测试：fake fetch 断言 URL/payload 形状。

## S7 115 扫码登录（自主）
- packages/workflow/src/pan115-qrcode-login.ts：三步流（token→长轮询 status→exchange，
  默认 app=alipaymini），fetchJson 注入 + 测试（状态机 0/1/2/-1/-2、长轮询缺 status 字段=等待）。
- cookie 持久化：sqlite 加通用 app_settings(key,value) 表 + repository 接口 get/setSetting；
  storage factory 优先读 DB cookie，回落 env PAN115_COOKIE。UA 与 cookie 一起存（风控绑 UA）。
- web：/settings 页（QR 展示走官方 PNG 代理 route 避免新依赖）+ /api/115/qrcode{,/status,/confirm}；
  侧边栏"115 已连接"卡改真实状态并链到 /settings。

## Status log
- [x] S1 通知面板修复
- [x] S2 元数据落库
- [x] S3 标题级路由重构
- [x] S4 获取入口命令层
- [x] S5 TMDB live 接通 + 浏览器实测
- [x] S6 推送渠道（a8ebd81）
- [x] S7 115 扫码登录（实测到真实二维码渲染+长轮询；扫码确认待用户手机验收）
