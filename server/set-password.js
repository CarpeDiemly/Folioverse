/**
 * 改管理员密码
 *   node server/set-password.js 你的新密码
 * 不带参数则交互输入。
 */
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { setPassword } from './auth.js';

let password = process.argv[2];

if (!password) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  password = await rl.question('输入新的管理员密码：');
  rl.close();
}

if (!password || String(password).length < 6) {
  console.error('密码至少要 6 位');
  process.exit(1);
}

setPassword(String(password));
console.log('管理员密码已更新。');
