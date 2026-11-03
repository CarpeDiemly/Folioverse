# Folioverse

李伯檀的个人网站。一个静态首页 + 一套轻量博客后端，可以自己写日志、传照片。

## 页面

| 页面 | 说明 |
|---|---|
| `index.html` | 首页。实时北京时间 + 访客所在地天气，三张功能入口卡片，拾光与关于 |
| `journal.html` | 日志列表 / 详情。长文与随笔混排，按时间倒序 |
| `photos.html` | 照片墙。瀑布流 + 灯箱 |
| `admin.html` | 写作后台。密码登录，写日志、传照片 |

## 技术形态

- **前端**：手写 HTML / CSS / 原生 JS，无框架、无构建步骤
- **后端**：Node.js 原生 `http` + 内置 `node:sqlite`，**零第三方依赖**，不需要 `npm install`
- **图片**：上传前在浏览器里缩到长边 2000px 并转 WebP，服务端只存文件

接口都在 `/api/` 下，图片通过 `/media/<文件名>` 提供。

## 快速开始

需要 Node.js 22.5+（推荐 24 LTS）：

```bash
node server/index.js
```

首次启动会自动生成管理员密码并打印在控制台。然后访问：

- 首页 <http://localhost:3000/>
- 后台 <http://localhost:3000/admin.html>

详细部署（服务器、nginx、HTTPS、备案、备份）见 [DEPLOY.md](./DEPLOY.md)。

## 项目结构

```
index.html  style.css  script.js      首页
journal.html  journal.js              日志
photos.html   photos.js               照片墙
admin.html    admin.js                写作后台
common.js  pages.css                  子页共用的脚本与样式
favicon.svg
materials/images/                     首页用的图片素材

server/
  index.js        服务入口：静态文件 + 路由分发
  api.js          接口实现
  db.js           SQLite 表结构与查询
  auth.js         密码、session、登录限流
  markdown.js     Markdown 渲染（先转义，防 XSS）
  rerender.js     渲染器变更后刷新旧文章
  set-password.js 改管理员密码

data/            运行时数据，已 gitignore
```

## 几个设计取舍

- **零依赖**：不需要 `npm install`，不用担心供应链和原生模块编译，拷过去就能跑。
- **SQLite 而不是 MySQL**：只有一个作者，SQLite 足够，还省下几百 MB 内存。
- **图片在浏览器端压缩**：省服务器 CPU，也省用户上传流量。原图不上传，需要存档的话自行留底。
- **正文存两份**：`body_md` 存源码，`body_html` 存渲染结果。将来换渲染器只跑一次 `rerender.js`。
- **单管理员密码**：不做注册和用户表，减少攻击面。将来要多作者，把密码字段换成 users 表即可。

## 历次更新

首页「历次更新」卡片里的内容来自 `script.js` 顶部的 `CHANGELOG` 数组，发版时在最前面加一条，第一项会自动标成「最新」。
