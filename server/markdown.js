/**
 * 极简 Markdown 渲染
 *
 * 设计取舍：
 * - 先整体转义 HTML，再做替换 —— 所以正文里写 <script> 也只会显示成文字，不会执行
 * - 只支持博客常用的那一小撮语法，够用且没有依赖
 * - 支持围栏代码块、标题、引用、列表、分割线、粗斜体、行内代码、链接、图片
 *
 * 将来想换成 marked / markdown-it，只要保持 renderMarkdown(src) -> html 这个签名即可，
 * 数据库里 body_md 存的是源码，重新渲染一遍就能迁移。
 */

const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** HTML 转义 */
export function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}

/** 只放行安全的链接协议，挡掉 javascript: 之类 */
function isSafeUrl(url = '') {
  const value = url.trim();
  if (!value) return false;
  if (value.startsWith('//')) return false;           // 协议相对地址不走
  return /^(https?:\/\/|mailto:|\/|#)/i.test(value);
}

/** 行内语法（输入必须已经转义过） */
function renderInline(text) {
  const codes = [];

  // 行内代码先摘出来，避免里面的 * 和 _ 被当成强调
  let out = text.replace(/`([^`]+)`/g, (_, code) => {
    codes.push(`<code>${code}</code>`);
    return `\u0001I${codes.length - 1}\u0001`;
  });

  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (whole, alt, url) =>
    isSafeUrl(url) ? `<img src="${url}" alt="${alt}" loading="lazy" decoding="async">` : alt
  );

  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label, url) =>
    isSafeUrl(url) ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>` : label
  );

  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^\w*])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>');
  out = out.replace(/(^|[^\w_])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>');
  out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  return out.replace(/\u0001I(\d+)\u0001/g, (_, i) => codes[Number(i)]);
}

const RE_HEADING = /^(#{1,6})\s+(.*)$/;
const RE_HR = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
// 注意：正文此时已经被 HTML 转义，行首的 > 变成了 &gt;
const RE_QUOTE = /^\s{0,3}&gt;\s?/;
const RE_UL = /^\s{0,3}[-*+]\s+/;
const RE_OL = /^\s{0,3}\d+\.\s+/;
const RE_PLACEHOLDER = /^\u0000C(\d+)\u0000$/;

/**
 * @param {string} source Markdown 源码
 * @returns {string} 安全的 HTML
 */
export function renderMarkdown(source = '') {
  let text = String(source).replace(/\r\n?/g, '\n');

  // 1. 先摘出围栏代码块（内容原样保留，只转义）
  const blocks = [];
  text = text.replace(/^```([^\n]*)\n([\s\S]*?)\n?^```[ \t]*$/gm, (_, lang, code) => {
    blocks.push(
      `<pre class="md-code"><code${lang ? ` data-lang="${escapeHtml(lang.trim())}"` : ''}>${escapeHtml(code)}</code></pre>`
    );
    return `\u0000C${blocks.length - 1}\u0000`;
  });

  // 2. 整体转义，之后所有替换都发生在安全文本上
  text = escapeHtml(text);

  const lines = text.split('\n');
  const html = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*$/.test(line)) { i++; continue; }

    const placeholder = line.match(RE_PLACEHOLDER);
    if (placeholder) {
      html.push(blocks[Number(placeholder[1])]);
      i++;
      continue;
    }

    const heading = line.match(RE_HEADING);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2].trim())}</h${level}>`);
      i++;
      continue;
    }

    if (RE_HR.test(line)) {
      html.push('<hr>');
      i++;
      continue;
    }

    if (RE_QUOTE.test(line)) {
      const buf = [];
      while (i < lines.length && RE_QUOTE.test(lines[i])) {
        buf.push(lines[i].replace(RE_QUOTE, ''));
        i++;
      }
      html.push(`<blockquote>${renderInline(buf.join('\n')).replace(/\n/g, '<br>')}</blockquote>`);
      continue;
    }

    if (RE_UL.test(line) || RE_OL.test(line)) {
      const ordered = RE_OL.test(line);
      const pattern = ordered ? RE_OL : RE_UL;
      const items = [];
      while (i < lines.length && pattern.test(lines[i])) {
        items.push(`<li>${renderInline(lines[i].replace(pattern, '').trim())}</li>`);
        i++;
      }
      html.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
      continue;
    }

    // 普通段落：一直吃到空行或下一个块级语法
    const para = [];
    while (i < lines.length) {
      const current = lines[i];
      if (/^\s*$/.test(current)) break;
      if (para.length && (
        RE_HEADING.test(current) || RE_HR.test(current) ||
        RE_QUOTE.test(current) || RE_UL.test(current) ||
        RE_OL.test(current) || RE_PLACEHOLDER.test(current)
      )) break;
      para.push(current);
      i++;
    }
    html.push(`<p>${renderInline(para.join('\n')).replace(/\n/g, '<br>')}</p>`);
  }

  return html.join('\n');
}

/** 从正文里抽一段纯文本摘要，用于列表页 */
export function excerpt(source = '', max = 120) {
  const plain = String(source)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/^\s{0,3}&gt;\s?/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/^\s{0,3}\d+\.\s+/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > max ? plain.slice(0, max) + '…' : plain;
}
