/* ============================================================
   Folioverse · 单页脚本
   1. 北京时间时钟（精确到秒）
   2. 访问者 IP 定位 + 当地实时天气
   3. 功能入口：历次更新面板 + 占位弹窗
   4. 深浅色主题
   5. 滚动显现 / 顶栏阴影 / 年份
   ============================================================ */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  document.documentElement.classList.add('js');

  /* ---------- 1. 北京时间 ---------- */
  const TIME_ZONE = 'Asia/Shanghai';
  const dateEl = $('clock-date');
  const timeEl = $('clock-time');
  const clockEl = $('clock');

  const clockFormat = new Intl.DateTimeFormat('zh-CN', {
    timeZone: TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });

  function tickClock() {
    const now = new Date();
    const p = {};
    for (const part of clockFormat.formatToParts(now)) {
      if (part.type !== 'literal') p[part.type] = part.value;
    }
    if (dateEl) dateEl.textContent = `${p.year}年${p.month}月${p.day}日 ${p.weekday}`;
    if (timeEl) timeEl.textContent = `${p.hour}:${p.minute}:${p.second}`;
    if (clockEl) clockEl.setAttribute('datetime', now.toISOString());

    // 对齐到下一个整秒，避免长时间运行后累积漂移
    const drift = Date.now() % 1000;
    setTimeout(tickClock, 1000 - drift + 8);
  }
  tickClock();

  /* ---------- 2. 城市与天气 ---------- */
  const weatherEl = $('weather');
  const cityEl = $('weather-city');
  const iconEl = $('weather-icon');
  const descEl = $('weather-desc');
  const tempEl = $('weather-temp');

  // WMO 天气代码 → [中文描述, 图标]
  const WMO = {
    0: ['晴', '☀️'], 1: ['晴间多云', '🌤️'], 2: ['多云', '⛅'], 3: ['阴', '☁️'],
    45: ['雾', '🌫️'], 48: ['雾凇', '🌫️'],
    51: ['毛毛雨', '🌦️'], 53: ['毛毛雨', '🌦️'], 55: ['浓毛毛雨', '🌧️'],
    56: ['冻毛毛雨', '🌧️'], 57: ['冻毛毛雨', '🌧️'],
    61: ['小雨', '🌦️'], 63: ['中雨', '🌧️'], 65: ['大雨', '🌧️'],
    66: ['冻雨', '🌧️'], 67: ['冻雨', '🌧️'],
    71: ['小雪', '🌨️'], 73: ['中雪', '🌨️'], 75: ['大雪', '❄️'], 77: ['米雪', '🌨️'],
    80: ['阵雨', '🌦️'], 81: ['阵雨', '🌧️'], 82: ['强阵雨', '⛈️'],
    85: ['阵雪', '🌨️'], 86: ['强阵雪', '❄️'],
    95: ['雷阵雨', '⛈️'], 96: ['雷阵雨伴冰雹', '⛈️'], 99: ['雷阵雨伴冰雹', '⛈️']
  };

  // 反查失败时的常见城市兜底（英文 → 中文）
  const CITY_ZH = {
    'Beijing': '北京', 'Shanghai': '上海', 'Tianjin': '天津', 'Chongqing': '重庆',
    'Guangzhou': '广州', 'Shenzhen': '深圳', 'Wuhan': '武汉', 'Hangzhou': '杭州',
    'Nanjing': '南京', 'Chengdu': '成都', 'Suzhou': '苏州', 'Changsha': '长沙',
    'Zhengzhou': '郑州', 'Qingdao': '青岛', 'Xiamen': '厦门', 'Fuzhou': '福州',
    'Hefei': '合肥', 'Jinan': '济南', 'Shenyang': '沈阳', 'Dalian': '大连',
    'Harbin': '哈尔滨', 'Kunming': '昆明', 'Nanchang': '南昌', 'Guiyang': '贵阳',
    'Nanning': '南宁', 'Haikou': '海口', 'Lanzhou': '兰州', 'Taiyuan': '太原',
    'Shijiazhuang': '石家庄', 'Urumqi': '乌鲁木齐', 'Hohhot': '呼和浩特',
    'Hong Kong': '香港', 'Macau': '澳门', 'Taipei': '台北', 'Tokyo': '东京',
    'Singapore': '新加坡', 'Seoul': '首尔', 'Bangkok': '曼谷', 'London': '伦敦',
    'New York': '纽约', 'Los Angeles': '洛杉矶', 'San Francisco': '旧金山',
    'Paris': '巴黎', 'Berlin': '柏林', 'Sydney': '悉尼', 'Toronto': '多伦多'
  };

  const IP_SOURCES = [
    'https://ipwho.is/',
    'https://api.ip.sb/geoip',
    'https://ipinfo.io/json'
  ];

  function getJSON(url, ms = 9000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return fetch(url, {
      signal: controller.signal,
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer'
    }).then((res) => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).finally(() => clearTimeout(timer));
  }

  // 不同服务商的字段名不一样，统一成 { lat, lon, city }
  function normalizeGeo(data) {
    if (!data || typeof data !== 'object') return null;
    if (data.success === false) return null;

    let lat = Number(data.latitude ?? data.lat);
    let lon = Number(data.longitude ?? data.lon);

    if ((!isFinite(lat) || !isFinite(lon)) && typeof data.loc === 'string') {
      const pair = data.loc.split(',').map(Number);
      lat = pair[0]; lon = pair[1];
    }
    if (!isFinite(lat) || !isFinite(lon)) return null;

    return {
      lat, lon,
      city: data.city || data.region || data.province || '',
      country: data.country_code || data.countryCode || data.country || ''
    };
  }

  // 用坐标反查中文地名；失败就返回空串，交给兜底字典
  async function chineseCityName(geo) {
    try {
      const data = await getJSON(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${geo.lat}&longitude=${geo.lon}&localityLanguage=zh`,
        6000
      );
      return data.city || data.principalSubdivision || data.locality || '';
    } catch (err) {
      return '';
    }
  }

  function renderWeather(current) {
    if (!current || typeof current.temperature_2m !== 'number') throw new Error('no data');
    const code = Number(current.weather_code);
    const [text, emoji] = WMO[code] || ['天气', '🌡️'];

    if (descEl) descEl.textContent = text;
    if (iconEl) iconEl.textContent = emoji;
    if (tempEl) tempEl.textContent = Math.round(current.temperature_2m) + '°';

    const bits = [];
    if (typeof current.apparent_temperature === 'number') bits.push('体感 ' + Math.round(current.apparent_temperature) + '°C');
    if (typeof current.relative_humidity_2m === 'number') bits.push('湿度 ' + Math.round(current.relative_humidity_2m) + '%');
    if (weatherEl) {
      weatherEl.dataset.state = 'ready';
      weatherEl.title = bits.join(' · ') || '当地实时天气';
    }
  }

  function renderWeatherError() {
    if (cityEl) cityEl.textContent = '位置未知';
    if (iconEl) iconEl.textContent = '';
    if (descEl) descEl.textContent = '天气暂不可用';
    if (tempEl) tempEl.textContent = '';
    if (weatherEl) {
      weatherEl.dataset.state = 'error';
      weatherEl.title = '点击重新获取';
    }
  }

  async function loadWeather() {
    if (!weatherEl) return;
    weatherEl.dataset.state = 'loading';
    if (cityEl) cityEl.textContent = '定位中';
    if (descEl) descEl.textContent = '天气获取中';
    if (iconEl) iconEl.textContent = '';
    if (tempEl) tempEl.textContent = '';
    weatherEl.title = '正在获取你所在的城市和天气';

    for (const source of IP_SOURCES) {
      let geo;
      try {
        geo = normalizeGeo(await getJSON(source));
      } catch (err) {
        continue; // 换下一个服务商
      }
      if (!geo) continue;

      try {
        // 中文地名与天气互不依赖，并发请求
        const [cityName, weather] = await Promise.all([
          chineseCityName(geo),
          getJSON(
            `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}` +
            `&current=temperature_2m,weather_code,apparent_temperature,relative_humidity_2m&timezone=auto`,
            9000
          )
        ]);

        if (cityEl) {
          cityEl.textContent = cityName || CITY_ZH[geo.city] || geo.city || '你的城市';
        }
        renderWeather(weather && weather.current);
        return;
      } catch (err) {
        continue; // 天气失败也换下一个定位源再试
      }
    }
    renderWeatherError();
  }

  if (weatherEl) {
    weatherEl.addEventListener('click', () => {
      if (weatherEl.dataset.state === 'error') loadWeather();
    });
    loadWeather();
  }

  /* ---------- 3. 功能入口：历次更新 + 占位弹窗 ---------- */

  // 更新手记。发版时在最前面加一条即可（数组第一项会被标成「最新」）。
  const CHANGELOG = [
    {
      version: 'v0.5',
      date: '2026.11.03',
      iso: '2026-11-03',
      title: '能写日志了',
      notes: [
        '加了写作后台：密码登录，写长文或随笔，也能先存草稿',
        '照片墙上线，图片在浏览器里先压缩再上传，省流量也省空间',
        '首页三张卡片接上了真实页面',
        '后端零第三方依赖，一台装了 Node 的机器就能跑起来'
      ]
    },
    {
      version: 'v0.4',
      date: '2026.11.03',
      iso: '2026-11-03',
      title: '时间、天气与三扇门',
      notes: [
        '站点收拢为单页，首页直接落在根目录',
        '顶部加了一条实时信息：北京时间精确到秒，还有你所在城市的天气',
        '摆好三扇门：我的日志、照片墙、历次更新',
        '补上站点图标与分享预览，深色模式改为跟随系统'
      ]
    },
    {
      version: 'v0.3',
      date: '2026.10.30',
      iso: '2026-10-30',
      title: '一页式主页',
      notes: [
        '改版成完整的一页式主页：首屏、拾光、关于',
        '换上东湖岸花的水墨主图与实景照片',
        '中英混排引入宋体，加入深浅色切换'
      ]
    },
    {
      version: 'v0.2',
      date: '2025.07.13',
      iso: '2025-07-13',
      title: '域名与第一批照片',
      notes: [
        '绑定自定义域名 www.folioverse.cn',
        '放上东湖岸边的第一批照片',
        '页面路径调整到 html/ 目录'
      ]
    },
    {
      version: 'v0.1',
      date: '2025.07.05',
      iso: '2025-07-05',
      title: '起站',
      notes: [
        '第一次提交，留下 LICENSE 与 README',
        '写下第一版页面'
      ]
    }
  ];

  const changelogDialog = $('changelog');
  const timeline = $('timeline');

  function openChangelog() {
    if (!changelogDialog) return;
    if (typeof changelogDialog.showModal === 'function') {
      if (!changelogDialog.open) changelogDialog.showModal();
    } else {
      changelogDialog.setAttribute('open', '');
    }
    // 每次打开都从最新一条开始看
    const body = changelogDialog.querySelector('.sheet-body');
    if (body) body.scrollTop = 0;
  }

  // 用 DOM 拼装，避免 innerHTML 拼接
  function renderChangelog() {
    if (!timeline) return;
    const frag = document.createDocumentFragment();

    CHANGELOG.forEach((entry, index) => {
      const item = document.createElement('li');
      item.className = 'timeline-item' + (index === 0 ? ' is-latest' : '');

      const top = document.createElement('div');
      top.className = 'timeline-top';

      const version = document.createElement('span');
      version.className = 'timeline-version';
      version.textContent = entry.version;

      const date = document.createElement('time');
      date.className = 'timeline-date';
      date.dateTime = entry.iso;
      date.textContent = entry.date;

      top.append(version, date);

      if (index === 0) {
        const badge = document.createElement('span');
        badge.className = 'timeline-badge';
        badge.textContent = '最新';
        top.append(badge);
      }

      const title = document.createElement('p');
      title.className = 'timeline-title';
      title.textContent = entry.title;

      const notes = document.createElement('ul');
      notes.className = 'timeline-notes';
      entry.notes.forEach((text) => {
        const note = document.createElement('li');
        note.textContent = text;
        notes.append(note);
      });

      item.append(top, title, notes);
      frag.append(item);
    });

    timeline.replaceChildren(frag);
  }
  renderChangelog();

  document.querySelectorAll('.feature-card').forEach((card) => {
    if (card.dataset.kind !== 'changelog') return;   // 日志和照片墙是真链接，交给浏览器跳转
    card.addEventListener('click', () => openChangelog());
  });

  // 点遮罩、点关闭按钮都能关掉更新面板
  if (changelogDialog) {
    changelogDialog.addEventListener('click', (event) => {
      if (event.target === changelogDialog) changelogDialog.close();
    });
    changelogDialog.querySelectorAll('[data-close]').forEach((button) => {
      button.addEventListener('click', () => changelogDialog.close());
    });
  }

  /* ---------- 4. 深浅色主题 ---------- */
  const themeButton = document.querySelector('.theme-toggle');
  const themeIcon = document.querySelector('.theme-icon');
  const themeColor = $('theme-color');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

  // 隐私模式下 localStorage 可能直接抛错，包一层兜底
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch (err) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (err) { /* 忽略 */ } }
  };

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

  if (themeButton) {
    themeButton.addEventListener('click', () => {
      applyTheme(!document.body.classList.contains('dark'), true);
    });
  }

  // 用户没手动选过时，跟随系统切换
  prefersDark.addEventListener?.('change', (event) => {
    if (!store.get('folioverse-theme')) applyTheme(event.matches, false);
  });

  /* ---------- 5. 滚动显现 / 顶栏阴影 / 年份 ---------- */
  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

    reveals.forEach((el) => observer.observe(el));

    // 兜底：万一观察器没触发，别把内容永久藏起来
    setTimeout(() => {
      if (!document.querySelector('.reveal.is-in')) {
        reveals.forEach((el) => el.classList.add('is-in'));
      }
    }, 3000);
  } else {
    reveals.forEach((el) => el.classList.add('is-in'));
  }

  const header = document.querySelector('.site-header');
  const onScroll = () => header?.classList.toggle('is-scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const yearEl = $('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();
