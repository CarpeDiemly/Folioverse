/**
 * Folioverse 服务入口
 *
 * 零第三方依赖，只需要 Node（22.5+ 带内置 sqlite，建议直接用 24）。
 *   node server/index.js
 *
 * 环境变量：
 *   PORT           监听端口，默认 3000
 *   FOLIO_PASSWORD 首次启动时设置管理员密码（不设会自动生成并打印）
 *   FOLIO_DATA_DIR 数据目录，默认 ./data
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApi } from './api.js';
import { ensurePassword } from './auth.js';
import { UPLOAD_DIR } from './db.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 3000;

// 这些目录不对外暴露：服务端代码、数据库、依赖
const DENIED = [/^\/server(\/|$)/, /^\/data(\/|$)/, /^\/node_modules(\/|$)/, /^\/\./];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

function contentType(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  res.end(body);
}

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><meta charset="utf-8"><title>404</title>
<div style="font-family:system-ui;padding:12vh 8vw;color:#242820;background:#f5f3ed;min-height:100vh">
<h1 style="font-size:28px;font-weight:500">这一页不见了</h1>
<p style="color:#73766d">你要找的东西可能被挪走了。<a href="/" style="color:#78826b">回首页</a></p></div>`);
}

function streamFile(req, res, filePath, cacheControl) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return notFound(res);

    const headers = {
      'Content-Type': contentType(filePath),
      'Content-Length': stat.size,
      'Cache-Control': cacheControl,
      'Last-Modified': stat.mtime.toUTCString()
    };

    // 未修改就不用重传
    const since = req.headers['if-modified-since'];
    if (since && new Date(since).getTime() >= Math.floor(stat.mtime.getTime() / 1000) * 1000) {
      res.writeHead(304, { 'Cache-Control': cacheControl, 'Last-Modified': headers['Last-Modified'] });
      return res.end();
    }

    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();

    fs.createReadStream(filePath)
      .on('error', () => res.destroy())
      .pipe(res);
  });
}

function serveUpload(req, res, url) {
  const name = path.basename(decodeURIComponent(url.pathname.slice('/media/'.length)));
  if (!name || name.includes('\0')) return notFound(res);
  // 文件名由服务端生成，这里再兜一层，杜绝 ../ 穿越
  streamFile(req, res, path.join(UPLOAD_DIR, name), 'public, max-age=31536000, immutable');
}

function serveStatic(req, res, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return notFound(res);
  }

  if (DENIED.some((rule) => rule.test(pathname))) return notFound(res);
  if (pathname.endsWith('/')) pathname += 'index.html';

  const filePath = path.join(ROOT, path.normalize(pathname));
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) return notFound(res);

  // HTML 不缓存，方便改完立刻看到；其余静态资源短缓存
  const cache = pathname.endsWith('.html') ? 'no-cache' : 'public, max-age=3600';
  streamFile(req, res, filePath, cache);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  try {
    if (url.pathname.startsWith('/api/')) {
      const handled = await handleApi(req, res, url);
      if (!handled) notFound(res);
      return;
    }

    if (url.pathname.startsWith('/media/')) {
      return serveUpload(req, res, url);
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return send(res, 405, 'Method Not Allowed');
    }

    serveStatic(req, res, url);
  } catch (error) {
    console.error('[server]', error);
    if (!res.headersSent) send(res, 500, '服务器出错了');
    else res.destroy();
  }
});

const passwordState = ensurePassword();

server.listen(PORT, () => {
  console.log(`\n  Folioverse 已启动`);
  console.log(`  本地地址   http://localhost:${PORT}/`);
  console.log(`  后台入口   http://localhost:${PORT}/admin.html`);

  if (passwordState.created && passwordState.password) {
    console.log(`\n  ── 首次启动，已生成管理员密码 ──`);
    console.log(`  密码：${passwordState.password}`);
    console.log(`  （只显示这一次，请立刻记下来；忘记可以运行 node server/set-password.js 新密码）\n`);
  } else if (passwordState.created) {
    console.log(`\n  已用 FOLIO_PASSWORD 设置管理员密码\n`);
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
