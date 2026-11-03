/**
 * 鉴权：单管理员密码 + 内存 session
 *
 * 为什么不做用户表：这个站只有你自己写作，多用户/注册系统只会增加攻击面和维护成本。
 * 将来真要多作者，把 config.passwordHash 换成 users 表即可，接口不用动。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './db.js';

const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const SESSION_COOKIE = 'folio_sid';
const SESSION_TTL_MS = 7 * 24 * 3600 * 1000;   // 7 天

/* ---------- 密码 ---------- */

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [algo, saltHex, hashHex] = String(stored).split('$');
    if (algo !== 'scrypt' || !saltHex || !hashHex) return false;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), expected.length);
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return null;
  }
}

export function writeConfig(config) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
}

/**
 * 首次启动时准备密码：
 * - 优先用环境变量 FOLIO_PASSWORD
 * - 否则生成一个随机密码并打印到控制台（只打印这一次）
 */
export function ensurePassword() {
  const existing = readConfig();
  if (existing?.passwordHash) return { created: false };

  const fromEnv = process.env.FOLIO_PASSWORD;
  const password = fromEnv || crypto.randomBytes(6).toString('base64url');

  writeConfig({ passwordHash: hashPassword(password), createdAt: new Date().toISOString() });
  return { created: true, fromEnv: Boolean(fromEnv), password: fromEnv ? null : password };
}

export function setPassword(password) {
  const existing = readConfig() || {};
  writeConfig({ ...existing, passwordHash: hashPassword(password), updatedAt: new Date().toISOString() });
}

/* ---------- 会话 ---------- */

const sessions = new Map();   // token -> 过期时间戳

export function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

export function readSession(token) {
  if (!token) return null;
  const expires = sessions.get(token);
  if (!expires) return null;
  if (expires < Date.now()) {
    sessions.delete(token);
    return null;
  }
  sessions.set(token, Date.now() + SESSION_TTL_MS);   // 滑动续期
  return token;
}

export function destroySession(token) {
  if (token) sessions.delete(token);
}

/* ---------- Cookie ---------- */

export function parseCookies(header = '') {
  const out = {};
  for (const piece of header.split(';')) {
    const eq = piece.indexOf('=');
    if (eq < 0) continue;
    const key = piece.slice(0, eq).trim();
    const value = piece.slice(eq + 1).trim();
    if (key) {
      try { out[key] = decodeURIComponent(value); } catch { out[key] = value; }
    }
  }
  return out;
}

export function sessionFromRequest(req) {
  return readSession(parseCookies(req.headers.cookie || '')[SESSION_COOKIE]);
}

export function sessionCookie(token, { secure }) {
  return [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    secure ? 'Secure' : null
  ].filter(Boolean).join('; ');
}

export function clearCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/* ---------- 登录限流 ---------- */

const failures = new Map();   // ip -> { count, firstAt }
const MAX_FAILURES = 8;
const WINDOW_MS = 15 * 60 * 1000;

export function loginBlocked(ip) {
  const record = failures.get(ip);
  if (!record) return false;
  if (Date.now() - record.firstAt > WINDOW_MS) {
    failures.delete(ip);
    return false;
  }
  return record.count >= MAX_FAILURES;
}

export function noteFailure(ip) {
  const record = failures.get(ip);
  if (!record || Date.now() - record.firstAt > WINDOW_MS) {
    failures.set(ip, { count: 1, firstAt: Date.now() });
  } else {
    record.count += 1;
  }
}

export function clearFailures(ip) {
  failures.delete(ip);
}
