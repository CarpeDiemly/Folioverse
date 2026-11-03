/* 写作后台 */
(() => {
  'use strict';

  const { api, fmtDate, toast } = window.Folio;

  const loginView = document.getElementById('login-view');
  const appView = document.getElementById('app-view');
  const loginForm = document.getElementById('login-form');
  const loginBtn = document.getElementById('login-btn');
  const passwordInput = document.getElementById('password');

  const titleField = document.getElementById('title-field');
  const titleInput = document.getElementById('post-title');
  const bodyInput = document.getElementById('post-body');
  const previewBox = document.getElementById('preview');
  const saveHint = document.getElementById('save-hint');
  const previewBtn = document.getElementById('toggle-preview');

  const adminPosts = document.getElementById('admin-posts');
  const postsEmpty = document.getElementById('posts-empty');
  const thumbs = document.getElementById('thumbs');
  const uploadStatus = document.getElementById('upload-status');
  const photoCaption = document.getElementById('photo-caption');
  const fileInput = document.getElementById('file-input');
  const dropZone = document.getElementById('drop');

  let postType = 'article';
  let editingId = null;
  let previewOn = false;
  let previewTimer = 0;

  /* ---------- 会话 ---------- */

  async function boot() {
    try {
      const { authenticated } = await api('/api/session');
      authenticated ? showApp() : showLogin();
    } catch {
      showLogin();
    }
  }

  function showLogin() {
    loginView.hidden = false;
    appView.hidden = true;
    setTimeout(() => passwordInput.focus(), 60);
  }

  function showApp() {
    loginView.hidden = true;
    appView.hidden = false;
    loadPosts();
    loadPhotos();
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    loginBtn.disabled = true;
    try {
      await api('/api/login', { method: 'POST', json: { password: passwordInput.value } });
      passwordInput.value = '';
      showApp();
    } catch (error) {
      toast(error.message);
      passwordInput.select();
    } finally {
      loginBtn.disabled = false;
    }
  });

  document.getElementById('logout').addEventListener('click', async () => {
    try { await api('/api/logout', { method: 'POST' }); } catch { /* 忽略 */ }
    location.href = './index.html';
  });

  /** 统一处理登录态失效 */
  async function call(path, options) {
    try {
      return await api(path, options);
    } catch (error) {
      if (error.status === 401) {
        showLogin();
        throw new Error('登录状态过期了，请重新登录');
      }
      throw error;
    }
  }

  /* ---------- 分区切换 ---------- */

  const tabs = [...document.querySelectorAll('.tabs button')];
  const panels = { write: 'tab-write', posts: 'tab-posts', photos: 'tab-photos' };

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
      for (const [key, id] of Object.entries(panels)) {
        document.getElementById(id).hidden = key !== tab.dataset.tab;
      }
    });
  });

  /* ---------- 编辑器 ---------- */

  const typeButtons = [...document.querySelectorAll('.segmented button')];

  function setType(type) {
    postType = type;
    typeButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.type === type)));
    titleField.hidden = type === 'note';
  }

  typeButtons.forEach((button) => {
    button.addEventListener('click', () => setType(button.dataset.type));
  });

  function setEditing(post) {
    editingId = post ? post.id : null;
    if (!post) {
      titleInput.value = '';
      bodyInput.value = '';
      setType('article');
      saveHint.textContent = '';
      document.getElementById('publish').textContent = '发布';
      return;
    }
    setType(post.type);
    titleInput.value = post.title || '';
    bodyInput.value = post.body_md || '';
    saveHint.textContent = `正在编辑：${post.title || fmtDate(post.created_at) + ' 的随笔'}`;
    document.getElementById('publish').textContent = '保存修改';
  }

  document.getElementById('reset-editor').addEventListener('click', () => {
    setEditing(null);
    previewBox.hidden = true;
    previewOn = false;
    previewBtn.setAttribute('aria-pressed', 'false');
    toast('已清空');
  });

  async function refreshPreview() {
    if (!previewOn) return;
    const markdown = bodyInput.value;
    if (!markdown.trim()) { previewBox.textContent = ''; return; }
    try {
      const { html } = await call('/api/preview', { method: 'POST', json: { markdown } });
      previewBox.innerHTML = html;          // 服务端已转义
    } catch (error) {
      previewBox.textContent = error.message;
    }
  }

  previewBtn.addEventListener('click', () => {
    previewOn = !previewOn;
    previewBtn.setAttribute('aria-pressed', String(previewOn));
    previewBtn.textContent = previewOn ? '收起预览' : '预览';
    previewBox.hidden = !previewOn;
    if (previewOn) refreshPreview();
  });

  bodyInput.addEventListener('input', () => {
    if (!previewOn) return;
    clearTimeout(previewTimer);
    previewTimer = setTimeout(refreshPreview, 400);
  });

  async function save(status) {
    const body_md = bodyInput.value.trim();
    if (!body_md) { toast('正文还是空的'); bodyInput.focus(); return; }

    const payload = { type: postType, title: titleInput.value.trim(), body_md, status };
    if (postType === 'article' && !payload.title) {
      toast('长文需要一个标题');
      titleInput.focus();
      return;
    }

    const buttons = [document.getElementById('publish'), document.getElementById('save-draft')];
    buttons.forEach((b) => { b.disabled = true; });

    try {
      if (editingId) await call(`/api/posts/${editingId}`, { method: 'PUT', json: payload });
      else {
        const { post } = await call('/api/posts', { method: 'POST', json: payload });
        editingId = post.id;
        document.getElementById('publish').textContent = '保存修改';
      }
      toast(status === 'draft' ? '已存为草稿' : '已发布');
      loadPosts();
    } catch (error) {
      toast(error.message);
    } finally {
      buttons.forEach((b) => { b.disabled = false; });
    }
  }

  document.getElementById('publish').addEventListener('click', () => save('published'));
  document.getElementById('save-draft').addEventListener('click', () => save('draft'));

  /* ---------- 日志管理 ---------- */

  async function loadPosts() {
    try {
      const { posts } = await call('/api/posts?status=all&limit=100');
      postsEmpty.hidden = posts.length > 0;
      adminPosts.replaceChildren(...posts.map(renderAdminPost));
    } catch (error) {
      toast(error.message);
    }
  }

  function renderAdminPost(post) {
    const li = document.createElement('li');
    li.className = 'admin-item';

    const main = document.createElement('div');
    main.className = 'admin-item-main';

    const title = document.createElement('p');
    title.className = 'admin-item-title';
    title.textContent = post.type === 'article' ? (post.title || '（无标题）') : post.excerpt || '（短句）';

    const meta = document.createElement('p');
    meta.className = 'admin-item-meta';
    meta.textContent = `${fmtDate(post.created_at)} · ${post.type === 'article' ? '长文' : '随笔'}${post.status === 'draft' ? ' · 草稿' : ''}`;

    main.append(title, meta);

    const actions = document.createElement('div');
    actions.className = 'admin-item-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn--sm';
    editBtn.type = 'button';
    editBtn.textContent = '编辑';
    editBtn.addEventListener('click', () => editPost(post.id));

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn--sm btn--danger';
    delBtn.type = 'button';
    delBtn.textContent = '删除';
    delBtn.addEventListener('click', () => removePost(post));

    actions.append(editBtn, delBtn);
    li.append(main, actions);
    return li;
  }

  async function editPost(id) {
    try {
      const { post } = await call(`/api/posts/${id}`);
      setEditing(post);
      tabs[0].click();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      bodyInput.focus();
    } catch (error) {
      toast(error.message);
    }
  }

  async function removePost(post) {
    const label = post.type === 'article' ? post.title || '这篇' : '这条随笔';
    if (!confirm(`删掉「${label}」？删了就找不回来了。`)) return;
    try {
      await call(`/api/posts/${post.id}`, { method: 'DELETE' });
      if (editingId === post.id) setEditing(null);
      toast('已删除');
      loadPosts();
    } catch (error) {
      toast(error.message);
    }
  }

  /* ---------- 照片 ---------- */

  async function loadPhotos() {
    try {
      const { photos } = await call('/api/photos?status=all');
      thumbs.replaceChildren(...photos.map(renderThumb));
    } catch (error) {
      toast(error.message);
    }
  }

  function renderThumb(photo) {
    const wrap = document.createElement('div');
    wrap.className = 'thumb';

    const img = document.createElement('img');
    img.src = photo.src;
    img.alt = photo.caption || '';
    img.loading = 'lazy';

    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = '✕';
    del.setAttribute('aria-label', '删除这张');
    del.addEventListener('click', async () => {
      if (!confirm('删掉这张照片？')) return;
      try {
        await call(`/api/photos/${photo.id}`, { method: 'DELETE' });
        toast('已删除');
        loadPhotos();
      } catch (error) {
        toast(error.message);
      }
    });

    wrap.append(img, del);
    return wrap;
  }

  /** 在浏览器里把图缩小，减少上传体积；解不开的格式就原样上传 */
  async function shrink(file) {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const max = 2000;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86));
    return blob ? { blob, width, height } : { blob: file, width: null, height: null };
  }

  async function uploadOne(file, caption) {
    let payload = { blob: file, width: null, height: null };
    try {
      payload = await shrink(file);
    } catch {
      payload = { blob: file, width: null, height: null };   // 比如 HEIC，交给服务端判断
    }

    const query = new URLSearchParams();
    if (caption) query.set('caption', caption);
    if (payload.width) query.set('w', payload.width);
    if (payload.height) query.set('h', payload.height);

    await call(`/api/photos${query.toString() ? '?' + query : ''}`, {
      method: 'POST',
      body: payload.blob,
      headers: { 'Content-Type': payload.blob.type || 'application/octet-stream' }
    });
  }

  async function handleFiles(fileList) {
    const files = [...fileList].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;

    const caption = photoCaption.value.trim();
    for (let i = 0; i < files.length; i++) {
      uploadStatus.textContent = `正在上传 ${i + 1} / ${files.length}…`;
      try {
        await uploadOne(files[i], caption);
      } catch (error) {
        toast(`${files[i].name}：${error.message}`);
      }
    }
    uploadStatus.textContent = '传完了';
    setTimeout(() => { uploadStatus.textContent = ''; }, 2200);
    fileInput.value = '';
    loadPhotos();
  }

  fileInput.addEventListener('change', () => handleFiles(fileInput.files));

  ['dragenter', 'dragover'].forEach((type) => {
    dropZone.addEventListener(type, (event) => {
      event.preventDefault();
      dropZone.classList.add('is-over');
    });
  });

  ['dragleave', 'drop'].forEach((type) => {
    dropZone.addEventListener(type, (event) => {
      event.preventDefault();
      dropZone.classList.remove('is-over');
    });
  });

  dropZone.addEventListener('drop', (event) => {
    if (event.dataTransfer?.files?.length) handleFiles(event.dataTransfer.files);
  });

  document.getElementById('refresh-photos').addEventListener('click', loadPhotos);

  /* ---------- 启动 ---------- */
  setType('article');
  boot();
})();
