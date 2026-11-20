// 测试脚手架：这些前端脚本是浏览器里的 IIFE（挂在 window 上），
// 这里用 node:vm 造一个假 window，按页面里的顺序把它们载入，不需要浏览器。
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const JS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../app/js');

// fetchImpl(url, opts) → 返回 {status, json(), arrayBuffer()} 的 Promise；测试里按需换
export function load({ fetchImpl, search = '' } = {}) {
  const calls = [];
  const ctx = {
    console, URL, URLSearchParams, Promise, setTimeout, clearTimeout, setInterval, clearInterval,
    AbortController, DataView, ArrayBuffer, Uint8Array, Math, Date, JSON, Object, Array, String, Number, Error,
    location: { search },
    localStorage: { getItem: () => null, setItem() {} },
    document: {},
    fetch: (url, opts) => { calls.push({ url: String(url), opts }); return fetchImpl(String(url), opts); },
  };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  // 顺序同 index.html：md5 → config → util → api → player
  for (const f of ['md5.min.js', 'config.js', 'util.js', 'api.js', 'player.js']) {
    vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f });
  }
  return { w: ctx, calls };
}

export const jsonRes = (data, status = 200) => Promise.resolve({ status, ok: status < 400, json: () => Promise.resolve(data) });
export const binRes = (buf, status = 206) => Promise.resolve({ status, ok: true, arrayBuffer: () => Promise.resolve(buf) });
