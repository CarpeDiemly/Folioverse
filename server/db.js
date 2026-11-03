/**
 * 数据库层：node:sqlite（Node 22.5+ 内置，免编译、免安装）
 *
 * 表结构按「先能跑，后面好加」设计：
 * - posts.type  区分长文 article 与短句 note，同一张表，将来加新类型不用改结构
 * - posts.status 支持草稿，现在用不上但先留着
 * - posts.body_md / body_html 同时存源码和渲染结果，将来换渲染器不用重新生成
 * - photos.thumb 现在为空，将来加缩略图不用迁移
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const DATA_DIR = process.env.FOLIO_DATA_DIR || join(process.cwd(), 'data');
export const UPLOAD_DIR = join(DATA_DIR, 'uploads');

mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(join(DATA_DIR, 'folio.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS posts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    type       TEXT NOT NULL DEFAULT 'note',
    title      TEXT,
    body_md    TEXT NOT NULL DEFAULT '',
    body_html  TEXT NOT NULL DEFAULT '',
    cover      TEXT,
    status     TEXT NOT NULL DEFAULT 'published',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_posts_feed
    ON posts (status, created_at DESC, id DESC);

  CREATE TABLE IF NOT EXISTS photos (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    file       TEXT NOT NULL,
    thumb      TEXT,
    caption    TEXT,
    width      INTEGER,
    height     INTEGER,
    taken_at   TEXT,
    status     TEXT NOT NULL DEFAULT 'published',
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_photos_feed
    ON photos (status, taken_at DESC, id DESC);
`);

const now = () => new Date().toISOString();

/* ---------- 日志 ---------- */

const SELECT_POST = `SELECT id, type, title, body_md, body_html, cover, status, created_at, updated_at FROM posts`;

export const posts = {
  list({ status = 'published', type = null, limit = 30, offset = 0 } = {}) {
    if (type) {
      return db.prepare(`${SELECT_POST} WHERE status = ? AND type = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
        .all(status, type, limit, offset);
    }
    return db.prepare(`${SELECT_POST} WHERE status = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
      .all(status, limit, offset);
  },

  get(id) {
    return db.prepare(`${SELECT_POST} WHERE id = ?`).get(id) ?? null;
  },

  /** 后台用：含草稿 */
  listAll({ limit = 100, offset = 0 } = {}) {
    return db.prepare(`${SELECT_POST} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
      .all(limit, offset);
  },

  create(data) {
    const stamp = now();
    const info = db.prepare(`
      INSERT INTO posts (type, title, body_md, body_html, cover, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.type, data.title, data.body_md, data.body_html,
      data.cover, data.status, data.created_at || stamp, stamp
    );
    return this.get(Number(info.lastInsertRowid));
  },

  update(id, data) {
    db.prepare(`
      UPDATE posts SET type = ?, title = ?, body_md = ?, body_html = ?, cover = ?, status = ?, updated_at = ?
      WHERE id = ?
    `).run(
      data.type, data.title, data.body_md, data.body_html,
      data.cover, data.status, now(), id
    );
    return this.get(id);
  },

  remove(id) {
    return db.prepare('DELETE FROM posts WHERE id = ?').run(id).changes > 0;
  },

  count(status = 'published') {
    return db.prepare('SELECT COUNT(*) AS n FROM posts WHERE status = ?').get(status).n;
  }
};

/* ---------- 照片 ---------- */

export const photos = {
  list({ status = 'published', limit = 200, offset = 0 } = {}) {
    return db.prepare(`
      SELECT id, file, thumb, caption, width, height, taken_at, status, created_at
      FROM photos WHERE status = ? ORDER BY taken_at DESC, id DESC LIMIT ? OFFSET ?
    `).all(status, limit, offset);
  },

  get(id) {
    return db.prepare('SELECT * FROM photos WHERE id = ?').get(id) ?? null;
  },

  /** 后台用：含隐藏照片 */
  listAll({ limit = 500, offset = 0 } = {}) {
    return db.prepare(`
      SELECT id, file, thumb, caption, width, height, taken_at, status, created_at
      FROM photos ORDER BY taken_at DESC, id DESC LIMIT ? OFFSET ?
    `).all(limit, offset);
  },

  create(data) {
    const info = db.prepare(`
      INSERT INTO photos (file, thumb, caption, width, height, taken_at, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.file, data.thumb ?? null, data.caption ?? '',
      data.width ?? null, data.height ?? null,
      data.taken_at || now(), data.status || 'published', now()
    );
    return this.get(Number(info.lastInsertRowid));
  },

  remove(id) {
    return db.prepare('DELETE FROM photos WHERE id = ?').run(id).changes > 0;
  },

  count(status = 'published') {
    return db.prepare('SELECT COUNT(*) AS n FROM photos WHERE status = ?').get(status).n;
  }
};

export default db;
