// B 站接口变动时第一时间发现：WBI 签名、sidx 分段、分片路线回退、小工具函数。
// 运行：cd bilibili-tv-2026-10-31 && node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { load, jsonRes, binRes } from './harness.mjs';

const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
// 独立按公开算法再写一遍 WBI（和被测代码不共用代码）
const MIXIN = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52];
const IMG = '7cd084941338484aae1ad9425b84077c', SUB = '4932caff0ff746eab6f01bf08b70ac45';
const mixinKey = (img, sub) => MIXIN.map((i) => (img + sub)[i]).join('').slice(0, 32);

test('WBI：参数排序、特殊字符过滤、w_rid = md5(query + mixinKey)', async () => {
  const { w, calls } = load({
    fetchImpl: (url) => url.includes('/x/web-interface/nav')
      ? jsonRes({ code: 0, data: { wbi_img: { img_url: `https://i0.hdslb.com/bfs/wbi/${IMG}.png`, sub_url: `https://i0.hdslb.com/bfs/wbi/${SUB}.png` } } })
      : jsonRes({ code: 0, data: { item: [] } }),
  });
  await w.API.recommend(true);
  const rcmd = calls.find((c) => c.url.includes('/wbi/index/top/feed/rcmd'));
  assert.ok(rcmd, '应请求推荐接口');
  const qs = rcmd.url.split('?')[1];
  const m = qs.match(/^(.*)&w_rid=([0-9a-f]{32})$/);
  assert.ok(m, 'query 末尾应带 w_rid');
  const [, q, rid] = m;
  assert.equal(rid, md5(q + mixinKey(IMG, SUB)), 'w_rid 与独立实现不一致');
  const keys = q.split('&').map((p) => p.split('=')[0]);
  assert.deepEqual(keys, [...keys].sort(), '参数必须按字母序');
  assert.ok(keys.includes('wts'), '必须带时间戳 wts');
});

test("WBI：搜索词里的 ! ' ( ) * 会被过滤，其余字符照常编码", async () => {
  const { w, calls } = load({
    fetchImpl: (url) => url.includes('/nav')
      ? jsonRes({ code: 0, data: { wbi_img: { img_url: `x/${IMG}.png`, sub_url: `x/${SUB}.png` } } })
      : jsonRes({ code: 0, data: { result: [] } }),
  });
  await w.API.search("a!b'c(d)e*f 周杰伦", 1).catch(() => {});
  const u = calls.find((c) => c.url.includes('/wbi/search/type'));
  assert.ok(u, '搜索应走 WBI 接口');
  const q = u.url.split('?')[1].replace(/&w_rid=.*/, '');
  const kw = new URLSearchParams(q).get('keyword');
  assert.equal(kw, 'abcdef 周杰伦');
  assert.equal(u.url.split('w_rid=')[1], md5(q + mixinKey(IMG, SUB)), '签名要按过滤后的值算');
});

// ---- sidx / 分段 ----
function box(type, payload) {
  const b = new Uint8Array(8 + payload.length), dv = new DataView(b.buffer);
  dv.setUint32(0, b.length); for (let i = 0; i < 4; i++) b[4 + i] = type.charCodeAt(i); b.set(payload, 8); return b;
}
// 造一个 version 0 的 sidx：timescale、earliest、first_offset、每段 [字节数, 时长]
function sidx(timescale, earliest, firstOff, refs, ver = 0) {
  const head = ver === 0 ? 4 + 4 + 4 + 4 + 4 : 4 + 4 + 4 + 8 + 8;
  const p = new Uint8Array(4 + head - 4 + 4 + refs.length * 12), dv = new DataView(p.buffer);
  let o = 0; dv.setUint8(0, ver); o = 4;           // version + flags
  dv.setUint32(o, 1); o += 4;                      // reference_ID
  dv.setUint32(o, timescale); o += 4;
  if (ver === 0) { dv.setUint32(o, earliest); dv.setUint32(o + 4, firstOff); o += 8; }
  else { dv.setBigUint64(o, BigInt(earliest)); dv.setBigUint64(o + 8, BigInt(firstOff)); o += 16; }
  o += 2; dv.setUint16(o, refs.length); o += 2;
  for (const [sz, dur] of refs) { dv.setUint32(o, sz); dv.setUint32(o + 4, dur); dv.setUint32(o + 8, 0x90000000); o += 12; }
  return box('sidx', p.slice(0, o));
}
const ab = (u8) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);

async function segsOf(sidxBox, base, ver) {
  const leading = box('ftyp', new Uint8Array(8)); // sidx 前面还有别的盒子，解析器必须跳过
  const idx = new Uint8Array(leading.length + sidxBox.length); idx.set(leading); idx.set(sidxBox, leading.length);
  const { w } = load({ fetchImpl: (url, o) => binRes(o.headers.Range === `bytes=${base}-${base + idx.length - 1}` ? ab(idx) : new ArrayBuffer(4)) });
  const stream = { url: 'https://cdn.example/a.m4s', mime: 'video/mp4', initRange: '0-99', indexRange: `${base}-${base + idx.length - 1}` };
  const pl = new w.DashPlayer({}, {});
  // load() 会在 prepare 之后去开 MediaSource（测试环境没有），所以捕获那一步的失败，只检查分段
  await pl.load({ video: stream, audio: stream }, 0).catch(() => {});
  return { segs: pl.tracks[0].segs, trackIdxLen: idx.length };
}

test('sidx v0：分段时间和字节偏移', async () => {
  const { segs, trackIdxLen } = await segsOf(sidx(1000, 0, 0, [[500, 4000], [300, 2000], [200, 1000]]), 100, 0);
  assert.equal(segs.length, 3);
  assert.deepEqual([segs[0].s, segs[0].e], [0, 4]);
  assert.deepEqual([segs[2].s, segs[2].e], [6, 7]);
  // 偏移锚点 = sidx 盒子结束后的第一个字节：base + ftyp(16) + sidx 盒长
  const sidxLen = trackIdxLen - 16;
  assert.equal(segs[0].off, 100 + 16 + sidxLen);
  assert.equal(segs[1].off, segs[0].off + 500);
  assert.equal(segs[2].off, segs[1].off + 300);
  assert.equal(segs[2].size, 200);
});

test('sidx v1（64 位时间）也能解析，first_offset 会被计入', async () => {
  const { segs, trackIdxLen } = await segsOf(sidx(90000, 90000, 40, [[1000, 180000]], 1), 0, 1);
  assert.equal(segs.length, 1);
  assert.deepEqual([segs[0].s, segs[0].e], [1, 3]);
  assert.equal(segs[0].off, 16 + (trackIdxLen - 16) + 40);
});

test('没有 sidx 盒子会明确报错，不会死循环', async () => {
  const { w } = load({ fetchImpl: () => binRes(ab(box('ftyp', new Uint8Array(8)))) });
  const stream = { url: 'https://cdn.example/a.m4s', mime: 'video/mp4', initRange: '0-9', indexRange: '10-30' };
  const pl = new w.DashPlayer({}, {});
  await assert.rejects(pl.load({ video: stream, audio: stream }, 0), /sidx not found/);
});

test('segAt：返回包含时间点的分段下标，超出返回 segs.length', async () => {
  const idx = sidx(1, 0, 0, [[1, 4], [1, 2], [1, 1]]); // 分段 [0,4) [4,6) [6,7)
  const { w } = load({ fetchImpl: () => binRes(ab(idx)) });
  const stream = { url: 'https://cdn.example/a.m4s', mime: 'video/mp4', initRange: '0-9', indexRange: '10-60' };
  const pl = new w.DashPlayer({}, {});
  await pl.load({ video: stream, audio: stream }, 0).catch(() => {});
  const t = pl.tracks[0];
  assert.equal(t.segAt(0), 0); assert.equal(t.segAt(3.99), 0); assert.equal(t.segAt(4), 1);
  assert.equal(t.segAt(6.5), 2); assert.equal(t.segAt(7), 3);
  assert.equal(t.duration(), 7);
});

// ---- 分片路线回退 ----
test('路线回退：直连失败后走 hub，成功路线被记住', async () => {
  const seen = [];
  const { w } = load({
    fetchImpl: (url) => {
      seen.push(url);
      if (url.startsWith('https://cdn1.example/')) return binRes(new ArrayBuffer(0), 403); // 默认节点被拒
      return binRes(ab(sidx(1, 0, 0, [[1, 1]])));
    },
  });
  w.API.useHub('http://hub.local:9', 'k');
  const stream = { urls: ['https://cdn1.example/a.m4s', 'https://cdn2.example/a.m4s'], mime: 'video/mp4', initRange: '0-9', indexRange: '10-60' };
  const pl = new w.DashPlayer({}, {});
  await pl.load({ video: stream, audio: stream }, 0).catch(() => {});
  assert.ok(seen.some((u) => u.startsWith('http://hub.local:9/hub/cdn?u=')), '直连被拒后应改走 hub');
  assert.equal(stream.good, 1, '成功的路线下标应被记住');
});

// ---- 小工具 ----
test('U：时间、计数、解析、去标签、封面', () => {
  const { w } = load({ fetchImpl: () => jsonRes({}) });
  const U = w.U;
  assert.equal(U.fmtTime(0), '0:00'); assert.equal(U.fmtTime(65), '1:05'); assert.equal(U.fmtTime(3725), '1:02:05');
  assert.equal(U.fmtCount(9999), '9999'); assert.equal(U.fmtCount(12345), '1.2万'); assert.equal(U.fmtCount(250000000), '2.5亿'); assert.equal(U.fmtCount('x'), '');
  assert.equal(U.parseDur('3:20'), 200); assert.equal(U.parseDur('01:03:20'), 3800); assert.equal(U.parseDur(42), 42);
  assert.equal(U.stripHtml('<em class="keyword">周杰伦</em> &amp; 方文山 &quot;青花瓷&quot;'), '周杰伦 & 方文山 "青花瓷"');
  assert.equal(U.pic('//i0.hdslb.com/bfs/archive/x.jpg', 320, 180), 'https://i0.hdslb.com/bfs/archive/x.jpg@320w_180h_1c.webp');
  assert.equal(U.pic('http://i0.hdslb.com/bfs/a.jpg@100w.jpg', 1, 1), 'https://i0.hdslb.com/bfs/a.jpg@100w.jpg');
  assert.equal(U.pic('', 1, 1), '');
});
