/**
 * 重新渲染所有日志的正文 HTML
 *
 * 数据库里同时存了 body_md（源码）和 body_html（渲染结果）。
 * 渲染器一旦改过（修 bug、加语法），旧文章还是老结果，跑一次这个脚本即可刷新：
 *
 *   node server/rerender.js
 */
import db from './db.js';
import { renderMarkdown } from './markdown.js';

const rows = db.prepare('SELECT id, body_md, body_html FROM posts').all();

let changed = 0;
const update = db.prepare('UPDATE posts SET body_html = ? WHERE id = ?');

for (const row of rows) {
  const html = renderMarkdown(row.body_md);
  if (html !== row.body_html) {
    update.run(html, row.id);
    changed += 1;
  }
}

console.log(`检查 ${rows.length} 篇，重新渲染 ${changed} 篇。`);
