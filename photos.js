/* 照片墙：瀑布流 + 灯箱 */
(() => {
  'use strict';

  const { api } = window.Folio;

  const galleryEl = document.getElementById('gallery');
  const loadingEl = document.getElementById('loading');
  const emptyEl = document.getElementById('empty');

  const lightbox = document.getElementById('lightbox');
  const lbImg = document.getElementById('lb-img');
  const lbCaption = document.getElementById('lb-caption');
  const lbCount = document.getElementById('lb-count');

  let items = [];
  let index = 0;

  function render(photos) {
    items = photos;
    galleryEl.replaceChildren(...photos.map((photo, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'gallery-item';
      button.setAttribute('aria-label', photo.caption ? `查看：${photo.caption}` : `查看第 ${i + 1} 张`);

      const img = document.createElement('img');
      img.src = photo.src;
      img.alt = photo.caption || '';
      img.loading = i < 4 ? 'eager' : 'lazy';
      img.decoding = 'async';
      if (photo.width) img.width = photo.width;
      if (photo.height) img.height = photo.height;

      button.append(img);

      if (photo.caption) {
        const cap = document.createElement('figcaption');
        cap.textContent = photo.caption;
        button.append(cap);
      }

      button.addEventListener('click', () => open(i));
      return button;
    }));

    emptyEl.hidden = photos.length > 0;
    emptyEl.textContent = '还没有照片，去后台传一张吧。';
  }

  /* ---------- 灯箱 ---------- */
  let lastFocus = null;

  function open(i) {
    index = i;
    lastFocus = document.activeElement;
    lightbox.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    paint();
    document.getElementById('lb-close').focus();
  }

  function close() {
    lightbox.classList.remove('is-open');
    document.body.style.overflow = '';
    lastFocus?.focus();
  }

  function paint() {
    const photo = items[index];
    if (!photo) return;
    lbImg.src = photo.src;
    lbImg.alt = photo.caption || '';
    lbCaption.textContent = photo.caption || '';
    lbCount.textContent = `${index + 1} / ${items.length}`;
    document.getElementById('lb-prev').disabled = items.length < 2;
    document.getElementById('lb-next').disabled = items.length < 2;
  }

  function step(delta) {
    if (items.length < 2) return;
    index = (index + delta + items.length) % items.length;
    paint();
  }

  document.getElementById('lb-close').addEventListener('click', close);
  document.getElementById('lb-prev').addEventListener('click', () => step(-1));
  document.getElementById('lb-next').addEventListener('click', () => step(1));

  lightbox.addEventListener('click', (event) => {
    if (event.target === lightbox) close();
  });

  document.addEventListener('keydown', (event) => {
    if (!lightbox.classList.contains('is-open')) return;
    if (event.key === 'Escape') close();
    if (event.key === 'ArrowLeft') step(-1);
    if (event.key === 'ArrowRight') step(1);
  });

  /* ---------- 读取 ---------- */
  (async () => {
    try {
      const { photos } = await api('/api/photos');
      loadingEl.hidden = true;
      render(photos);
    } catch (error) {
      loadingEl.textContent = '没读出来：' + error.message;
    }
  })();
})();
