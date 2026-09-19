#!/usr/bin/env node
/**
 * verify_live.js —— 部署后线上校验（可复跑，证据级）
 *
 * 作用：把线上文件拉下来，与本地文件做「字节级」比对（CRLF 归一后逐字节比），
 *       轮询等待 GitHub Pages 的 CDN 刷新，直到一致或超时。
 *
 * 为什么需要它：推送到 GitHub Pages 后 CDN 有几分钟延迟，
 *   "我刚 push 成功了" 并不等于 "线上真的换新了"。只有字节比对才算证据。
 *
 * 用法：
 *   node h5/tests/verify_live.js                 # 默认校验 workbench.html
 *   node h5/tests/verify_live.js workbench.html index.html
 *   node h5/tests/verify_live.js --tries 15 --wait 12 workbench.html
 *
 * 退出码：0=全部一致   1=超时未一致   2=本地文件缺失
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SITE = process.env.LIXIU_SITE || 'https://lixiu-ohye.github.io/lixiu';
const REPO = path.resolve(__dirname, '..', '..');

// ── 参数解析 ──────────────────────────────────────────────
const argv = process.argv.slice(2);
let tries = 12, wait = 12;
const targets = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--tries') { tries = parseInt(argv[++i], 10) || 12; continue; }
  if (a === '--wait') { wait = parseInt(argv[++i], 10) || 12; continue; }
  if (a.startsWith('--')) continue;
  targets.push(a);
}
if (!targets.length) targets.push('workbench.html');

const md5 = (buf) => crypto.createHash('md5').update(buf).digest('hex');
const norm = (buf) => Buffer.from(buf.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');

function localInfo(rel) {
  const p = path.join(REPO, rel);
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p);
  return { path: p, raw, n: norm(raw) };
}

async function fetchLive(rel, attempt) {
  const url = SITE + '/' + rel + '?t=' + Date.now() + '_' + attempt;
  const res = await fetch(url, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('线上地址: ' + SITE);
  console.log('本地仓库: ' + REPO);
  console.log('');

  // 先本地预检
  const locals = {};
  let missing = 0;
  for (const rel of targets) {
    const li = localInfo(rel);
    if (!li) { console.log('❌ 本地缺少文件: ' + rel); missing++; continue; }
    locals[rel] = li;
    console.log('本地 ' + rel + '  ' + li.n.length + ' 字节  md5:' + md5(li.n).slice(0, 10));
  }
  if (missing) { console.log('\n本地文件缺失，无法比对。'); process.exit(2); }
  console.log('');

  const pending = new Set(Object.keys(locals));

  for (let attempt = 1; attempt <= tries; attempt++) {
    if (!pending.size) break;
    // 并发拉所有还没一致的
    for (const rel of Array.from(pending)) {
      let live = null, err = null;
      try { live = norm(await fetchLive(rel, attempt)); } catch (e) { err = e.message; }
      const li = locals[rel];
      if (err) {
        console.log('  第' + attempt + '次  ' + rel + '  拉取失败: ' + err);
        continue;
      }
      const same = live.equals(li.n);
      if (same) {
        pending.delete(rel);
        console.log('✅ ' + rel + '  线上已一致  ' + live.length + ' 字节  md5:' + md5(live).slice(0, 10)
          + '  (第 ' + attempt + ' 次尝试)');
      } else {
        // 给出首个差异位置，便于定位是不是内容落后
        let i = 0;
        const max = Math.min(live.length, li.n.length);
        while (i < max && live[i] === li.n[i]) i++;
        console.log('  第' + attempt + '次  ' + rel + '  线上 ' + live.length + ' 字节 / 本地 ' + li.n.length
          + ' 字节  首个差异@' + i + '  线上仍是旧版或 CDN 未刷新');
      }
    }
    if (pending.size) await sleep(wait * 1000);
  }

  console.log('');
  if (pending.size) {
    console.log('❌ 超时: ' + Array.from(pending).join(', ') + ' 仍未与本地一致');
    console.log('   可能原因: GitHub Pages 构建排队 / CDN 缓存未过期。稍后重跑本脚本即可。');
    process.exit(1);
  }
  console.log('🎉 线上校验通过: ' + targets.length + ' 个文件全部与本地字节一致');
  process.exit(0);
})().catch((e) => {
  console.log('校验中断: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
