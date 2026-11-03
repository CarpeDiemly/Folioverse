/**
 * 接口层
 *
 * 所有响应都是 JSON；图片文件本身走 /media/<文件名>，不经过这里。
 * 约定：出错时返回 { error: '给用户看的说明' } 和合适的 HTTP 状态码。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { posts, photos, UPLOAD_DIR } from './db.js';
import { renderMarkdown, excerpt } from './markdown.js';
import {
  verifyPassword, readConfig, createSession, destroySession, sessionFromRequest,
  sessionCookie, clearCookie, loginBlocked, noteFailure, clearFailures
} from './auth.js';

const MAX_JSON = 2 * 1024 * 1024;
const MAX_UPLOAD = 15 * 1024 * 1024;

const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

/* ---------- HTTP 小工具 ---------- */

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function readRaw(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, '内容太大了');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req) {
  const raw = await readRaw(req, MAX_JSON);
  if (!raw.length) return {};
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    throw new HttpError(400, '请求格式不正确');
  }
}

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket.remoteAddress
    || 'unknown';
}

function isSecure(req) {
  return (req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https'
    || Boolean(req.socket.encrypted);
}

/** 只接受同源请求，挡住跨站伪造 */
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;                  // curl / 同源导航
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

/* ---------- 数据整形 ---------- */

function publicPost(post, { includeMarkdown = false } = {}) {
  const result = {
    id: post.id,
    type: post.type,
    title: post.title,
    html: post.body_html,
    cover: post.cover,
    status: post.status,
    created_at: post.created_at,
    updated_at: post.updated_at
  };
  if (includeMarkdown) result.body_md = post.body_md;   // 只有作者本人编辑时才需要原文
  return result;
}

function listPost(post) {
  const base = {
    id: post.id,
    type: post.type,
    title: post.title,
    status: post.status,
    created_at: post.created_at
  };
  // 短句内容通常很短，直接内联返回；长文只给摘要，点进去再取全文
  return post.type === 'note'
    ? { ...base, html: post.body_html }
    : { ...base, excerpt: excerpt(post.body_md, 140) };
}

function publicPhoto(row) {
  return {
    id: row.id,
    src: `/media/${row.file}`,
    caption: row.caption || '',
    width: row.width,
    height: row.height,
    taken_at: row.taken_at
  };
}

/* ---------- 参数校验 ---------- */

function normalizePostInput(input) {
  const type = input.type === 'article' ? 'article' : 'note';
  const body_md = String(input.body_md ?? '').trim();

  if (!body_md) throw new HttpError(400, '内容不能为空');

  let title = String(input.title ?? '').trim() || null;
  if (type === 'article' && !title) throw new HttpError(400, '长文需要一个标题');

  let created_at = new Date().toISOString();
  if (input.created_at) {
    const parsed = new Date(input.created_at);
    if (!Number.isNaN(parsed.getTime())) created_at = parsed.toISOString();
  }

  return {
    type,
    title,
    body_md,
    body_html: renderMarkdown(body_md),
    cover: input.cover ? String(input.cover) : null,
    status: input.status === 'draft' ? 'draft' : 'published',
    created_at
  };
}

/* ---------- 路由 ---------- */

export async function handleApi(req, res, url) {
  const segments = url.pathname.split('/').filter(Boolean);   // ['api', 'posts', '12']
  if (segments[0] !== 'api') return false;

  const resource = segments[1] || '';
  const idPart = segments[2];
  const method = req.method;

  if (method !== 'GET' && method !== 'HEAD' && !sameOrigin(req)) {
    sendJson(res, 403, { error: '来源不被允许' });
    return true;
  }

  const session = sessionFromRequest(req);
  const authed = Boolean(session);

  try {
    /* --- 登录相关 --- */
    if (resource === 'login' && method === 'POST') {
      const ip = clientIp(req);
      if (loginBlocked(ip)) throw new HttpError(429, '尝试次数太多，请 15 分钟后再来');

      const { password } = await readJson(req);
      const config = readConfig();
      if (!config?.passwordHash || !verifyPassword(password, config.passwordHash)) {
        noteFailure(ip);
        throw new HttpError(401, '密码不对');
      }

      clearFailures(ip);
      const token = createSession();
      res.setHeader('Set-Cookie', sessionCookie(token, { secure: isSecure(req) }));
      sendJson(res, 200, { ok: true });
      return true;
    }

    if (resource === 'logout' && method === 'POST') {
      destroySession(session);
      res.setHeader('Set-Cookie', clearCookie());
      sendJson(res, 200, { ok: true });
      return true;
    }

    if (resource === 'session' && method === 'GET') {
      sendJson(res, 200, { authenticated: authed });
      return true;
    }

    if (resource === 'password' && method === 'POST') {
      if (!authed) throw new HttpError(401, '请先登录');
      // 预留：将来在后台改密码用。MVP 先用 set-password.js
      throw new HttpError(501, '暂时请在服务器上运行 set-password 脚本改密码');
    }

    // 后台写作时的实时预览，复用服务端渲染器，保证预览和最终效果一致
    if (resource === 'preview' && method === 'POST') {
      if (!authed) throw new HttpError(401, '请先登录');
      const { markdown } = await readJson(req);
      sendJson(res, 200, { html: renderMarkdown(String(markdown ?? '')) });
      return true;
    }

    /* --- 日志 --- */
    if (resource === 'posts') {
      if (!idPart) {
        if (method === 'GET') {
          const type = url.searchParams.get('type');
          const wantAll = url.searchParams.get('status') === 'all';
          const status = wantAll && authed ? null : 'published';
          const limit = Math.min(Number(url.searchParams.get('limit')) || 30, 100);
          const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);

          const rows = status
            ? posts.list({ status, type: type === 'article' || type === 'note' ? type : null, limit, offset })
            : posts.listAll({ limit, offset });

          sendJson(res, 200, { posts: rows.map(listPost) });
          return true;
        }

        if (method === 'POST') {
          if (!authed) throw new HttpError(401, '请先登录');
          const post = posts.create(normalizePostInput(await readJson(req)));
          sendJson(res, 201, { post: publicPost(post) });
          return true;
        }

        throw new HttpError(405, '不支持的方法');
      }

      const id = Number(idPart);
      if (!Number.isInteger(id)) throw new HttpError(400, '编号不对');

      if (method === 'GET') {
        const post = posts.get(id);
        if (!post || (post.status !== 'published' && !authed)) throw new HttpError(404, '找不到这篇');
        sendJson(res, 200, { post: publicPost(post, { includeMarkdown: authed }) });
        return true;
      }

      if (method === 'PUT') {
        if (!authed) throw new HttpError(401, '请先登录');
        const existing = posts.get(id);
        if (!existing) throw new HttpError(404, '找不到这篇');
        const post = posts.update(id, normalizePostInput(await readJson(req)));
        sendJson(res, 200, { post: publicPost(post) });
        return true;
      }

      if (method === 'DELETE') {
        if (!authed) throw new HttpError(401, '请先登录');
        if (!posts.remove(id)) throw new HttpError(404, '找不到这篇');
        sendJson(res, 200, { ok: true });
        return true;
      }

      throw new HttpError(405, '不支持的方法');
    }

    /* --- 照片 --- */
    if (resource === 'photos') {
      if (!idPart) {
        if (method === 'GET') {
          const wantAll = url.searchParams.get('status') === 'all';
          const status = wantAll && authed ? null : 'published';
          const rows = status ? photos.list({ status }) : photos.listAll();
          sendJson(res, 200, { photos: rows.map(publicPhoto) });
          return true;
        }

        if (method === 'POST') {
          if (!authed) throw new HttpError(401, '请先登录');

          const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
          const ext = MIME_EXT[type];
          if (!ext) throw new HttpError(415, '只支持 JPEG / PNG / WebP / GIF');

          const buffer = await readRaw(req, MAX_UPLOAD);
          if (!buffer.length) throw new HttpError(400, '文件是空的');

          const name = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
          await fs.promises.writeFile(path.join(UPLOAD_DIR, name), buffer);

          const number = (value) => {
            const n = Number(value);
            return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
          };

          const photo = photos.create({
            file: name,
            caption: (url.searchParams.get('caption') || '').slice(0, 200),
            width: number(url.searchParams.get('w')),
            height: number(url.searchParams.get('h'))
          });

          sendJson(res, 201, { photo: publicPhoto(photo) });
          return true;
        }

        throw new HttpError(405, '不支持的方法');
      }

      if (method === 'DELETE') {
        if (!authed) throw new HttpError(401, '请先登录');
        const id = Number(idPart);
        const photo = photos.get(id);
        if (!photo) throw new HttpError(404, '找不到这张照片');

        photos.remove(id);
        fs.promises.unlink(path.join(UPLOAD_DIR, photo.file)).catch(() => {});
        sendJson(res, 200, { ok: true });
        return true;
      }

      throw new HttpError(405, '不支持的方法');
    }

    throw new HttpError(404, '接口不存在');
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(res, error.status, { error: error.message });
      return true;
    }
    console.error('[api]', error);
    sendJson(res, 500, { error: '服务器出错了，稍后再试' });
    return true;
  }
}
