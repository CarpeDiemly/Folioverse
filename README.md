# Folioverse

李伯檀的个人网站，部署在 GitHub Pages，并绑定自定义域名 `www.folioverse.cn`。

整个站点是**单页**的：一个 `index.html` 承载全部内容，不构建、不依赖框架。

## 页面构成

- **实时信息条**：北京时间（精确到秒）+ 访问者 IP 所在城市与当地天气。
  - 定位：`ipwho.is` → `api.ip.sb` → `ipinfo.io`（依次兜底）
  - 中文地名：`api.bigdatacloud.net` 逆地理编码，失败时用内置城市字典
  - 天气：`api.open-meteo.com`（WMO 天气代码转中文描述）
- **首屏**：标题、简介、水墨感主图。
- **小站的其他角落**：三个功能入口。
  - **历次更新**：已上线，点击弹出时间线面板，内容来自 `script.js` 顶部的 `CHANGELOG` 数组。发版时在最前面加一条即可（数组第一项会自动标成「最新」）。
  - **我的日志**、**照片墙**：目前是占位，点击弹出「功能暂未上线，敬请期待哦」。
- **拾光**：精选照片 + 引言卡片。
- **关于**：自我介绍。
- **深浅色模式**：手动切换后记忆在 `localStorage`，未切换时跟随系统偏好。

## 项目结构

- `index.html`：唯一页面。
- `style.css`：全部样式（变量集中在 `:root`，深色模式为 `body.dark`）。
- `script.js`：时钟、定位天气、占位弹窗、主题与滚动动效。
- `favicon.svg`：站点图标。
- `materials/images/`：页面素材。
- `CNAME`：GitHub Pages 自定义域名配置。

## 本地预览

`script.js` 里调用了几个 HTTPS 接口，直接用 `file://` 打开时部分浏览器会因 CORS 拦截天气请求。建议起一个本地静态服务器：

```bash
python -m http.server 8000
# 然后访问 http://localhost:8000
```
