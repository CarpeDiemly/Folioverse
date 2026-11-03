# 部署说明

两条路：本地跑起来看效果，或者部署到自己的服务器。

---

## 一、本地运行

需要 **Node.js 22.5 以上**（推荐 24 LTS）。不需要 `npm install`，因为没有任何第三方依赖。

```bash
cd Folioverse
node server/index.js
```

第一次启动会自动生成管理员密码并打印出来：

```
  ── 首次启动，已生成管理员密码 ──
  密码：x7Kq2mB9pL
  （只显示这一次，请立刻记下来）
```

打开 <http://localhost:3000/> 是首页，<http://localhost:3000/admin.html> 是写作后台。

想自己指定密码，用环境变量：

```bash
# Windows PowerShell
$env:FOLIO_PASSWORD="你的密码"; node server/index.js

# macOS / Linux
FOLIO_PASSWORD="你的密码" node server/index.js
```

> 注意：一旦 `data/config.json` 存在，`FOLIO_PASSWORD` 就不会再生效。要改密码用下面的脚本。

### 改密码

```bash
node server/set-password.js 新密码
```

### 数据在哪

全部在 `data/` 目录，且已在 `.gitignore` 里：

| 路径 | 内容 |
|---|---|
| `data/folio.db` | SQLite 数据库（日志、照片记录） |
| `data/uploads/` | 上传的图片 |
| `data/config.json` | 管理员密码哈希 |

**备份就是备份这一个目录。** 删掉 `data/` 等于恢复出厂设置。

---

## 二、部署到服务器

### 0. 前置条件

- 一台服务器（阿里云轻量 2C2G 足够）
- 域名已解析到这台服务器
- **中国大陆的服务器必须先完成 ICP 备案**，否则 80/443 会被拦

### 1. 装 Node

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version    # 确认 >= 22.5
```

### 2. 把代码放上去

```bash
sudo mkdir -p /var/www/folioverse
sudo chown $USER /var/www/folioverse

git clone https://github.com/CarpeDiemly/Folioverse.git /var/www/folioverse
cd /var/www/folioverse
```

### 3. 数据目录放到仓库外面

推荐把数据和代码分开，这样更新代码不会碰数据：

```bash
sudo mkdir -p /var/lib/folioverse
sudo chown www-data:www-data /var/lib/folioverse
```

### 4. 交给 systemd 托管

新建 `/etc/systemd/system/folioverse.service`：

```ini
[Unit]
Description=Folioverse
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/folioverse
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=3
Environment=PORT=3000
Environment=FOLIO_DATA_DIR=/var/lib/folioverse
Environment=FOLIO_PASSWORD=换成你自己的密码

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now folioverse
sudo systemctl status folioverse        # 看是否 active
sudo journalctl -u folioverse -f        # 看日志
```

> 首次启动想在日志里看自动生成的密码，就把 `FOLIO_PASSWORD` 那行删掉，启动后从 `journalctl` 里捞。

### 5. nginx 反向代理

```bash
sudo apt install -y nginx
```

`/etc/nginx/sites-available/folioverse`：

```nginx
# 80 全部跳 https
server {
    listen 80;
    server_name www.folioverse.cn folioverse.cn;
    return 301 https://www.folioverse.cn$request_uri;
}

server {
    listen 443 ssl http2;
    server_name www.folioverse.cn;

    # certbot 会自动填这两行
    ssl_certificate     /etc/letsencrypt/live/www.folioverse.cn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/www.folioverse.cn/privkey.pem;

    # 重要：不放开的话上传图片会 413
    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/folioverse /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 6. HTTPS 证书

```bash
sudo apt install -y certbot
sudo certbot certonly --nginx -d www.folioverse.cn
```

certbot 会自动装好续期定时任务，`systemctl list-timers | grep certbot` 可以确认。

### 7. DNS

在阿里云云解析里：

| 记录 | 类型 | 值 |
|---|---|---|
| `www` | A | 服务器公网 IP |
| `@` | A | 服务器公网 IP（由 nginx 做 301 到 www） |

---

## 三、日常维护

### 更新代码

```bash
cd /var/www/folioverse
git pull
sudo systemctl restart folioverse
```

### 备份

```bash
# 数据库 + 图片，一条命令拷走
sudo tar czf folioverse-backup-$(date +%F).tar.gz -C /var/lib folioverse
```

建议加到 crontab，每天凌晨跑一次，并同步到本地或对象存储（OSS）。

### 渲染器改过之后

正文 HTML 是存在库里的缓存，改了 Markdown 渲染规则后要刷新一遍：

```bash
node server/rerender.js
```

### 安全清单

- [ ] 密码不要用弱口令，登录接口已有 15 分钟 8 次的限流
- [ ] 服务器安全组只开 22 / 80 / 443
- [ ] `data/` 不在 Web 目录下（用 `FOLIO_DATA_DIR` 指到 `/var/lib`）
- [ ] 定期 `sudo apt update && sudo apt upgrade`
- [ ] 首次上线后去 [全国互联网安全管理服务平台](https://beian.gov.cn) 做公安联网备案
- [ ] 网站底部按备案要求展示 ICP 备案号

---

## 四、常见问题

**打不开 / 502**
`sudo systemctl status folioverse` 看进程，`sudo journalctl -u folioverse -n 50` 看报错。

**上传图片报 413**
nginx 的 `client_max_body_size` 没放开，默认只有 1MB。

**登录后刷新又退出了**
服务器重启会让内存里的 session 失效，重新登录即可。cookie 有效期 7 天。

**忘记密码**
```bash
cd /var/www/folioverse
sudo -u www-data FOLIO_DATA_DIR=/var/lib/folioverse node server/set-password.js 新密码
sudo systemctl restart folioverse
```

**想换端口**
`Environment=PORT=3001`，同时改 nginx 的 `proxy_pass`。
