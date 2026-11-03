/* 日志页：列表 / 详情 */
(() => {
  'use strict';

  const { api, fmtDate } = window.Folio;
  const params = new URLSearchParams(location.search);
  const postId = params.get('id');

  /* ---------- 详情 ---------- */
  if (postId) {
    showDetail(postId);
    return;
  }

  /* ---------- 列表 ---------- */
  const listEl = document.getElementById('entries');
  const loadingEl = document.getElementById('loading');
  const emptyEl = document.getElementById('empty');
  const chips = [...document.querySelectorAll('.chip')];

  let allPosts = [];
  let filter = 'all';

  function entryFor(post) {
    const li = document.createElement('li');
    li.className = `entry entry--${post.type}`;

    const meta = document.createElement('div');
    meta.className = 'entry-meta';

    const kind = document.createElement('span');
    kind.className = 'entry-kind';
    kind.textContent = post.type === 'article' ? '长文' : '随笔';

    const date = document.createElement('time');
    date.dateTime = post.created_at;
    date.textContent = fmtDate(post.created_at);

    meta.append(kind, date);

    if (post.status === 'draft') {
      const draft = document.createElement('span');
      draft.className = 'entry-kind entry-kind--draft';
      draft.textContent = '草稿';
      meta.append(draft);
    }

    li.append(meta);

    if (post.type === 'article') {
      const link = document.createElement('a');
      link.className = 'entry-link';
      link.href = `./journal.html?id=${post.id}`;

      const title = document.createElement('h2');
      title.className = 'entry-title';
      title.textContent = post.title || '（无标题）';

      const excerptEl = document.createElement('p');
      excerptEl.className = 'entry-excerpt';
      excerptEl.textContent = post.excerpt || '';

      const more = document.createElement('span');
      more.className = 'entry-more';
      more.append(document.createTextNode('阅读全文'), Object.assign(document.createElement('span'), { textContent: '→' }));

      link.append(title, excerptEl, more);
      li.append(link);
    } else {
      const body = document.createElement('div');
      body.className = 'md entry-body';
      body.innerHTML = post.html;          // 服务端已做转义
      li.append(body);
    }

    return li;
  }

  function render() {
    const visible = filter === 'all' ? allPosts : allPosts.filter((p) => p.type === filter);

    listEl.replaceChildren(...visible.map(entryFor));
    emptyEl.hidden = visible.length > 0;
    emptyEl.textContent = allPosts.length
      ? '这一类还没有内容。'
      : '这里还空着，等第一句话落下来。';
  }

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      filter = chip.dataset.filter;
      chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      render();
    });
  });

  (async () => {
    try {
      const { posts } = await api('/api/posts?limit=50');
      allPosts = posts;
      loadingEl.hidden = true;
      render();
    } catch (error) {
      loadingEl.textContent = '没读出来：' + error.message;
    }
  })();

  /* ---------- 详情渲染 ---------- */
  async function showDetail(id) {
    document.getElementById('list-view').hidden = true;
    const view = document.getElementById('detail-view');
    view.hidden = false;

    const titleEl = document.getElementById('post-title');
    const metaEl = document.getElementById('post-meta');
    const bodyEl = document.getElementById('post-body');
    const statusEl = document.getElementById('post-status');

    try {
      const { post } = await api(`/api/posts/${encodeURIComponent(id)}`);

      if (post.type === 'article') {
        titleEl.textContent = post.title || '（无标题）';
        document.title = `${post.title || '日志'} · Folioverse`;
      } else {
        titleEl.hidden = true;
        document.title = `${fmtDate(post.created_at)} 的随笔 · Folioverse`;
      }

      const kind = post.type === 'article' ? '长文' : '随笔';
      metaEl.textContent = `${fmtDate(post.created_at)} · ${kind}`;

      bodyEl.innerHTML = post.html;        // 服务端已做转义
      if (post.status === 'draft') statusEl.textContent = '（这是一篇草稿，只有你能看到）';
    } catch (error) {
      titleEl.textContent = '找不到这一篇';
      metaEl.textContent = '';
      bodyEl.innerHTML = '';
      statusEl.textContent = '';
      const note = document.createElement('p');
      note.className = 'page-sub';
      note.textContent = error.status === 404 ? '它可能已经被删掉，或者改了地址。' : error.message;
      bodyEl.append(note);
    }
  }
})();
