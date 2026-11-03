/* Folioverse · 子页公共脚本
   主题切换、顶栏阴影、日期格式化、接口封装、轻提示
   暴露到 window.Folio 上供各页面使用。 */
(() => {
  'use strict';

  document.documentElement.classList.add('js');

  /* ---------- 主题 ---------- */
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* 忽略 */ } }
  };

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
  const themeButton = document.querySelector('.theme-toggle');
  const themeIcon = document.querySelector('.theme-icon');
  const themeColor = document.getElementById('theme-color');

  function applyTheme(isDark, persist) {
    document.body.classList.toggle('dark', isDark);
    if (themeIcon) themeIcon.textContent = isDark ? '☀' : '◐';
    if (themeButton) {
      themeButton.setAttribute('aria-label', isDark ? '切换到浅色模式' : '切换到深色模式');
      themeButton.title = themeButton.getAttribute('aria-label');
      themeButton.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    }
    if (themeColor) themeColor.setAttribute('content', isDark ? '#20231e' : '#f5f3ed');
    if (persist) store.set('folioverse-theme', isDark ? 'dark' : 'light');
  }

  const stored = store.get('folioverse-theme');
  applyTheme(stored ? stored === 'dark' : prefersDark.matches, false);

  themeButton?.addEventListener('click', () => {
    applyTheme(!document.body.classList.contains('dark'), true);
  });

  prefersDark.addEventListener?.('change', (event) => {
    if (!store.get('folioverse-theme')) applyTheme(event.matches, false);
  });

  /* ---------- 顶栏与年份 ---------- */
  const header = document.querySelector('.site-header');
  const onScroll = () => header?.classList.toggle('is-scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- 接口 ---------- */
  async function api(path, { method = 'GET', json, body, headers = {} } = {}) {
    const init = { method, credentials: 'same-origin', headers: { ...headers } };
    if (json !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(json);
    } else if (body !== undefined) {
      init.body = body;
    }

    const res = await fetch(path, init);
    const type = res.headers.get('content-type') || '';
    const data = type.includes('application/json') ? await res.json() : await res.text();

    if (!res.ok) {
      const message = (data && data.error) || `出错了（${res.status}）`;
      throw Object.assign(new Error(message), { status: res.status });
    }
    return data;
  }

  /* ---------- 日期（统一按北京时间显示，和首页时钟保持一致） ---------- */
  const partsFmt = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });

  function fmtDate(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const parts = {};
    for (const part of partsFmt.formatToParts(date)) {
      if (part.type !== 'literal') parts[part.type] = part.value;
    }
    return `${parts.year}.${parts.month}.${parts.day}`;
  }

  function fmtDateTime(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const hh = String((date.getUTCHours() + 8) % 24).padStart(2, '0');
    const mm = String(date.getUTCMinutes()).padStart(2, '0');
    return `${fmtDate(iso)} ${hh}:${mm}`;
  }

  /* ---------- 轻提示 ---------- */
  let toastEl = null;
  let toastTimer = 0;

  function toast(message) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), 2400);
  }

  window.Folio = { api, fmtDate, fmtDateTime, toast, applyTheme };
})();
