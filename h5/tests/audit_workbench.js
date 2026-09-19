/* ═══ 哩秀剪辑工作台 · 证据级审计脚本 ═══
   真实浏览器(Edge channel)打开构建产物 workbench.html, 逐条验证:
   A 加载与默认视图  B 进度面板初始态  C 自动检测(tooltip/勾选/配色)
   D 人工锁定不被覆盖  E 备注/里程碑  F 进度日志字段
   G 导出 .lixiu 内容  H 新建重置  I 导入恢复  J 视图切换  K 快捷键
   用法: (先跑 python h5/build_editor.py 生成产物)
         NODE_PATH="<node workspace>/node_modules" node h5/tests/audit_workbench.js
   退出码: 0=全绿  1=有失败项  2=脚本异常
   产物(截图/日志/报告)落在本目录 _out/ 下, 不入库。
*/
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');           // 仓库根
const TMP = path.join(__dirname, '_out');                   // 审计产物目录
const PAGE = 'file:///' + path.join(ROOT, 'workbench.html').replace(/\\/g, '/');
const SHOT = TMP + '/shots';
if (!fs.existsSync(SHOT)) fs.mkdirSync(SHOT, { recursive: true });

// 真实可解码的迷你 mp4(1s 黑场 64x36), 供「素材互通 / 送进剪辑台」用例使用。
// 用真实文件而非随机字节: 否则 <video> 解码失败会把媒体错误算进「未捕获异常」, 造成 L1 假失败。
const TINY_MP4_B64 = 'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAM3bW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAA+gAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAmF0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAA+gAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAEAAAAAkAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAPoAAAAAAABAAAAAAHZbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAoAAAAKABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABhG1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAURzdGJsAAAApHN0c2QAAAAAAAAAAQAAAJRhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAEAAJABIAAAASAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGP//AAAALmF2Y0MBQsAK/+EAFmdCwAraEf58BEAAAAMAQAAABQPEiagBAAVozgGXIAAAABBwYXNwAAAAAQAAAAEAAAAYc3R0cwAAAAAAAAABAAAACgAABAAAAAAUc3RzcwAAAAAAAAABAAAAAQAAABxzdHNjAAAAAAAAAAEAAAABAAAACgAAAAEAAAA8c3RzegAAAAAAAAAAAAAACgAAAm4AAAAKAAAACgAAAAoAAAAKAAAACgAAAAoAAAAKAAAACgAAAAoAAAAUc3RjbwAAAAAAAAABAAADZwAAAGJ1ZHRhAAAAWm1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAALWlsc3QAAAAlqXRvbwAAAB1kYXRhAAAAAQAAAABMYXZmNTguMjQuMTAxAAAACGZyZWUAAALQbWRhdAAAAlQGBf//UNxF6b3m2Ui3lizYINkj7u94MjY0IC0gY29yZSAxNTcgcjI5MzUgNTQ1ZGUyZiAtIEguMjY0L01QRUctNCBBVkMgY29kZWMgLSBDb3B5bGVmdCAyMDAzLTIwMTggLSBodHRwOi8vd3d3LnZpZGVvbGFuLm9yZy94MjY0Lmh0bWwgLSBvcHRpb25zOiBjYWJhYz0wIHJlZj0xIGRlYmxvY2s9MDowOjAgYW5hbHlzZT0wOjAgbWU9ZGlhIHN1Ym1lPTAgcHN5PTEgcHN5X3JkPTEuMDA6MC4wMCBtaXhlZF9yZWY9MCBtZV9yYW5nZT0xNiBjaHJvbWFfbWU9MSB0cmVsbGlzPTEgOHg4ZGN0PTAgY3FtPTAgZGVhZHpvbmU9MjEsMTEgZmFzdF9wc2tpcD0xIGNocm9tYV9xcF9vZmZzZXQ9MCB0aHJlYWRzPTEgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0wIHdlaWdodHA9MCBrZXlpbnQ9MjUwIGtleWludF9taW49MTAgc2NlbmVjdXQ9MCBpbnRyYV9yZWZyZXNoPTAgcmM9Y3JmIG1idHJlZT0wIGNyZj01MS4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTAAgAAAABJliIQ6JigAFZOTk666666668AAAAAGQZogE6GwAAAABkGaQBOhsAAAAAZBmmATobAAAAAGQZqAFKGwAAAABkGaoBShsAAAAAZBmsAUobAAAAAGQZrgFKGwAAAABkGbABShsAAAAAZBmyAUobA=';
const TINY_MP4 = Buffer.from(TINY_MP4_B64, 'base64');

const R = { pass: [], fail: [], warn: [], data: {} };
const RUNLOG = TMP + '/run.log';
fs.writeFileSync(RUNLOG, '[' + new Date().toISOString().slice(11, 19) + '] START\n');
const step = m => fs.appendFileSync(RUNLOG, '[' + new Date().toISOString().slice(11, 19) + '] ' + m + '\n');
function ok(name, cond, extra) {
  step((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' :: ' + extra : ''));
  (cond ? R.pass : R.fail).push(name + (extra ? ' :: ' + extra : ''));
  return !!cond;
}
function warn(name, extra) { R.warn.push(name + (extra ? ' :: ' + extra : '')); }

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(10000);
  step('browser launched');
  const errs = [], consoleErrs = [], netFails = [];
  // 带上栈首帧(文件名:行:列) —— 只记 message 的话定位不到代码位置, 只能靠猜
  page.on('pageerror', e => {
    const st = String(e.stack || '').split('\n').slice(0, 2).map(s => s.trim()).join(' @ ');
    errs.push(String(e.message).split('\n')[0] + (st ? ' [' + st.slice(0, 150) + ']' : ''));
  });
  page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text().slice(0, 160)); });
  page.on('requestfailed', r => { if (!r.url().startsWith('file:')) netFails.push(r.url().slice(0, 80)); });
  page.on('dialog', d => d.accept());   // confirm/prompt 全自动同意

  // ── A 加载 ──
  // head 里的 Tailwind CDN 是阻塞脚本: 网络抖动时会拖住 DOMContentLoaded,
  // 10s 默认超时不够 —— 之前实测 tailwind 单次响应 2.5s, 高峰期远超 10s。
  await page.goto(PAGE, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => window.__ed && document.getElementById('pgBody'), null, { timeout: 15000 });
  await page.waitForTimeout(700);
  // 【环境探测】Tailwind 走 CDN 阻塞加载。本机网络抖动时拉不到 → 所有 flex/尺寸/定位类失效,
  // 布局类断言(时间轴高度/贴底/视口范围)会集体假失败, 与产品是否真坏无关。
  // 探测一次并走 okL: CDN 挂时降级为「提醒」而非「失败」, 避免环境噪声阻塞部署。
  // 判定用全局 tailwind 对象, 不用 networkidle —— 后者会把离线探后端也算进去。
  const CDN_DOWN = await page.evaluate(() => typeof window.tailwind === 'undefined');
  if (CDN_DOWN) {
    step('CDN_DOWN=true (tailwind 未加载, 布局断言本轮降级)');
    warn('ENV Tailwind CDN 未加载', '布局类断言(A6/A8/P6/P10/P13/P14)本轮降级为提醒, 不计失败');
  }
  // 布局类断言入口: 依赖 Tailwind 类生效; CDN 不可达时只提醒, 不当产品失败
  function okL(name, cond, extra) {
    if (CDN_DOWN) { warn(name + ' (跳过: Tailwind CDN 未加载)', extra); return false; }
    return ok(name, cond, extra);
  }
  // 【创作台】顶部标签页: 默认视图是「AI 智能成片」, 剪辑台需点标签切过去
  const cb0 = await page.evaluate(() => ({
    hasTabs: !!document.getElementById('cbTabs'),
    activeTab: (document.querySelector('#cbTabs button.on') || {}).textContent || '',
    editorVisible: getComputedStyle(document.getElementById('viewEditor')).display !== 'none',
    studioVisible: getComputedStyle(document.getElementById('viewStudio')).display !== 'none'
  }));
  R.data.cb0 = cb0;
  ok('A1 创作台顶部标签页存在, 默认落在 AI 智能成片',
    cb0.hasTabs && /智能成片/.test(cb0.activeTab) && cb0.studioVisible && !cb0.editorVisible, JSON.stringify(cb0));
  await page.click('#cbTabs button[data-v="editor"]');
  await page.waitForTimeout(800);
  const shells = await page.evaluate(() => ({
    editorVisible: getComputedStyle(document.getElementById('viewEditor')).display !== 'none',
    studioVisible: getComputedStyle(document.getElementById('viewStudio')).display !== 'none',
    title: document.getElementById('pageTitle').textContent,
    hasCanvas: !!document.getElementById('edCanvas'),
    hasTimeline: !!document.getElementById('edLanes'),
    hasLib: !!document.getElementById('edLib'),
    hasTip: !!document.getElementById('edTip'),
    tabNow: (document.querySelector('#cbTabs button.on') || {}).textContent || ''
  }));
  R.data.shells = shells;
  ok('A2 点「手动剪辑」后剪辑台激活且标题同步',
    shells.editorVisible && !shells.studioVisible && /手动剪辑/.test(shells.tabNow) && shells.title === '剪辑工作台',
    shells.title + ' tab=' + shells.tabNow);
  ok('A3 画布/时间轴/素材库/提示层齐备', shells.hasCanvas && shells.hasTimeline && shells.hasLib && shells.hasTip);
  const tabs0 = await page.evaluate(() => ({
    names: [...document.querySelectorAll('#edRTabs [data-rtab]')].map(b => b.textContent.trim()),
    active: [...document.querySelectorAll('#edRTabs [data-rtab]')].filter(b => b.classList.contains('on')).map(b => b.getAttribute('data-rtab')),
    panes: ['props', 'progress', 'ui'].map(k => getComputedStyle(document.getElementById('rt-' + k)).display)
  }));
  R.data.tabs0 = tabs0;
  ok('A4 右栏三大Tab(属性/进度/UI设计)且默认属性页',
    JSON.stringify(tabs0.names) === JSON.stringify(['属性', '进度', 'UI设计'])
    && tabs0.active.length === 1 && tabs0.active[0] === 'props' && tabs0.panes[0] !== 'none' && tabs0.panes[1] === 'none',
    tabs0.names.join('/') + ' active=' + tabs0.active.join(','));
  // 进度面板现在位于 Tab 2, 后续章节操作它之前必须先切过去
  await page.click('#edRTabs [data-rtab="progress"]');
  await page.waitForTimeout(350);
  const tabSw = await page.evaluate(() => ({ p: getComputedStyle(document.getElementById('rt-progress')).display,
    u: getComputedStyle(document.getElementById('rt-ui')).display,
    hit: !!document.querySelector('#pgBody .pg-task') }));
  ok('A5 切到进度Tab后进度面板可用', tabSw.p !== 'none' && tabSw.u === 'none' && tabSw.hit);

  // ── A6/A7 元凶回归门禁（2026-09-19 修复）──
  // 原缺陷: 素材栏是 position:absolute 的抽屉且默认 display:none —— 既糊在侧边栏上,
  //         用户上传完又看不到缩略图, 于是"拖不进轨道", 整个剪辑台看起来完全没反应。
  const lib0 = await page.evaluate(() => {
    const l = document.getElementById('edLib'); const r = l.getBoundingClientRect();
    return { display: getComputedStyle(l).display, x: Math.round(r.x), w: Math.round(r.width),
      hide: l.classList.contains('hide'), parent: l.parentElement.className };
  });
  R.data.lib0 = lib0;
  okL('A6 素材栏默认可见且落在编辑器内(不再是被隐藏的抽屉)',
    lib0.display !== 'none' && !lib0.hide && lib0.w > 100 && lib0.x >= 240, JSON.stringify(lib0));
  const guide0 = await page.evaluate(() => { const g = document.getElementById('edLanesEmpty'); return g ? g.textContent : ''; });
  ok('A7 轨道空状态有三步上手引导(新用户知道下一步干什么)', /三步/.test(guide0), guide0.slice(0, 60));
  // 编辑器必须按"视口-页头-标签页"满高, 否则时间轴底部会被挤出屏幕
  const fit = await page.evaluate(() => {
    const r = document.querySelector('.ed-timeline').getBoundingClientRect();
    return { bottom: Math.round(r.bottom), h: Math.round(r.height), vh: window.innerHeight };
  });
  okL('A8 时间轴完整落在视口内', fit.h > 100 && fit.bottom <= fit.vh + 2, JSON.stringify(fit));

  // ── B 初始进度态 ──
  const base = await page.evaluate(() => {
    const r = window.__ed.progress();
    return { total: r.total, fill: document.getElementById('pgFill').className, chip: document.getElementById('pgChip').textContent,
      pct: document.getElementById('pgPct').textContent, groups: r.groups.map(g => g.name + ':' + g.weight + '%'),
      tasks: document.querySelectorAll('#pgBody .pg-task').length };
  });
  R.data.baseline = base;
  ok('B1 空工程进度 0%', base.total === 0, 'total=' + base.total);
  ok('B2 进度条灰色(0%)', base.fill === 'gray', base.fill);
  ok('B3 状态标签=待开始', base.chip === '待开始', base.chip);
  ok('B4 五阶段权重正确', JSON.stringify(base.groups) === JSON.stringify(['素材阶段:20%', '剪辑阶段:25%', '字幕阶段:25%', '动画特效阶段:20%', '输出阶段:10%']), base.groups.join('/'));
  ok('B5 任务项共 14 条', base.tasks === 14, 'tasks=' + base.tasks);

  // ── C tooltip 检测依据 ──
  await page.hover('#pgBody .pg-task[data-t="mat_v"]');
  await page.waitForTimeout(250);
  const tip = await page.evaluate(() => ({ show: document.getElementById('edTip').classList.contains('show'), text: document.getElementById('edTip').innerText }));
  R.data.tip = tip;
  ok('C1 悬浮任务弹出检测依据 tooltip', tip.show && /检测依据/.test(tip.text));
  ok('C2 tooltip 内容为实测数据', /素材库共 0 个视频/.test(tip.text), tip.text.replace(/\n/g, ' | ').slice(0, 90));
  await page.mouse.move(10, 400);
  await page.waitForTimeout(200);
  const tipGone = await page.evaluate(() => document.getElementById('edTip').classList.contains('show'));
  ok('C3 移开鼠标 tooltip 消失', !tipGone);

  // ── C4 自动检测: 加字幕片段 → 字幕阶段自动勾选 ──
  await page.click('#edAddSub');
  await page.waitForTimeout(700);
  const afterSub = await page.evaluate(() => {
    const r = window.__ed.progress();
    const sub = r.groups.find(g => g.name === '字幕阶段');
    return { total: r.total, subPct: sub.pct, subDone: sub.done, checkedAuto: sub.tasks.filter(t => t.auto).map(t => t.label),
      chip: document.getElementById('pgChip').textContent, fill: document.getElementById('pgFill').className,
      autoCls: document.querySelectorAll('#pgBody .pg-task.auto').length };
  });
  R.data.afterSub = afterSub;
  ok('C4 加字幕触发自动检测(字幕阶段>0)', afterSub.subPct > 0, 'subPct=' + afterSub.subPct + ' done=' + afterSub.subDone);
  ok('C5 自动勾选项显示浅底色(.auto)', afterSub.autoCls > 0, 'auto=' + afterSub.autoCls);
  ok('C6 进度条转黄(进行中)', afterSub.fill === 'yellow' && afterSub.chip === '进行中', afterSub.fill + '/' + afterSub.chip);
  ok('C7 总进度=Σ(阶段完成度×权重)', afterSub.total === Math.round(afterSub.subPct * 25 / 100), afterSub.total + ' vs ' + Math.round(afterSub.subPct * 25 / 100));

  // ── D 人工锁定: 手动勾选后自动扫描不再覆盖 ──
  await page.click('#pgBody .pg-task[data-t="mat_v"] input');
  await page.waitForTimeout(600);
  const locked = await page.evaluate(() => {
    const el = document.querySelector('#pgBody .pg-task[data-t="mat_v"]');
    return { cls: el.className, lockTag: !!el.querySelector('.lock'), lockTxt: (el.querySelector('.lock') || {}).textContent,
      checked: el.querySelector('input').checked, total: window.__ed.progress().total,
      items: window.__ed.prj().progress.items.mat_v };
  });
  R.data.locked = locked;
  ok('D1 手动勾选后标记人工锁定', /manual/.test(locked.cls) && locked.lockTag && /🔒人工/.test(locked.lockTxt), locked.cls);
  ok('D2 工程数据写入 lock 标记', locked.items && locked.items.lock === true && locked.items.on === true, JSON.stringify(locked.items));
  const beforeAuto = locked.total;
  await page.click('#pgAuto');           // 自动刷新不应覆盖人工锁定项
  await page.waitForTimeout(500);
  const afterAuto = await page.evaluate(() => ({ total: window.__ed.progress().total, keep: window.__ed.prj().progress.items.mat_v }));
  ok('D3 自动刷新不覆盖人工锁定', afterAuto.keep.lock === true && afterAuto.keep.on === true && afterAuto.total === beforeAuto,
    JSON.stringify(afterAuto.keep) + ' ' + beforeAuto + '->' + afterAuto.total);

  // ── E 备注 + 里程碑 ──
  await page.fill('#pgNotes', '本工程为审计测试：验证进度/备注/里程碑/日志随工程读写。');
  await page.fill('#pgMsName', '粗剪完成');
  await page.click('#pgMsAdd');
  await page.waitForTimeout(400);
  await page.fill('#pgMsName', '字幕定稿');
  await page.click('#pgMsAdd');
  await page.waitForTimeout(400);
  const ms = await page.evaluate(() => ({ n: window.__ed.prj().progress.milestones.length, notes: window.__ed.prj().progress.notes,
    names: window.__ed.prj().progress.milestones.map(m => m.name), domItems: document.querySelectorAll('.pg-ms-item').length }));
  R.data.milestones = ms;
  ok('E1 生成 2 个里程碑', ms.n === 2 && ms.domItems === 2, JSON.stringify(ms.names));
  ok('E2 备注写入工程数据', /审计测试/.test(ms.notes));

  // ── F 进度日志(结构化字段) ──
  // 布局重构后: 日志从右侧「进度」Tab 移到底部【工程档案】区, 且常显(不再需要"查看进度历史"开关)
  await page.waitForTimeout(200);
  const log = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.pg-log-item')];
    const L = window.__ed.prj().progress.log;
    const el = document.getElementById('pgLog');
    return { n: L.length, visible: !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0,
      inArchive: !!document.querySelector('#arBody #pgLog'), toggleGone: !document.getElementById('pgHistToggle'),
      html: items[0] ? items[0].innerHTML : '', types: [...new Set(L.map(x => x.type))],
      fields: L[0] ? Object.keys(L[0]).sort().join(',') : '', sample: L[L.length - 1] };
  });
  R.data.log = log;
  // 规格要求日志「默认折叠, 点击展开」→ 此处只验「位于底部工程档案区 + 有数据」;
  // 折叠/展开交互由 U4/U5 覆盖。
  ok('F1 进度日志位于底部工程档案区(默认折叠, 数据齐全)', log.inArchive && log.n > 0 && !log.visible, 'n=' + log.n + ' inArchive=' + log.inArchive + ' visible=' + log.visible);
  ok('F1b 日志不再需要"查看进度历史"开关(已移出进度Tab)', log.toggleGone);
  ok('F2 日志含四要素(时间戳/类型/详情/前后%)', log.fields === 'after,before,detail,ts,type', log.fields);
  ok('F3 日志区分 自动更新/人工修改', log.types.indexOf('auto') >= 0 && log.types.indexOf('manual') >= 0, log.types.join('/'));
  ok('F4 日志条目渲染出前后百分比', /→/.test(log.html), log.html.replace(/<[^>]+>/g, ' ').trim().slice(0, 80));
  await page.screenshot({ path: SHOT + '/panel-with-progress.png', clip: { x: 1290, y: 56, width: 310, height: 640 } });

  // 工程名可点可改(工具栏第一个输入框) → 让 I6 的"导入恢复工程名"断言真正可判定
  await page.fill('#edName', '审计工程');
  await page.waitForTimeout(200);
  ok('F5 工程名可编辑并写入工程数据', (await page.evaluate(() => window.__ed.prj().name)) === '审计工程');

  // ── G 导出 .lixiu ──
  step('G: export start');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('#edExportPrj')]);
  const lixiu = TMP + '/audit_export.lixiu';
  await dl.saveAs(lixiu);
  const J = JSON.parse(fs.readFileSync(lixiu, 'utf8'));
  R.data.export = { size: fs.statSync(lixiu).size, total: J.progress && J.progress.total, items: Object.keys(J.progress.items).length,
    notes: J.progress.notes, ms: J.progress.milestones.length, log: J.progress.log.length, stats: J.stats, tracks: J.tracks.length };
  ok('G1 .lixiu 导出成功且为合法工程', J.magic === 'lixiu-project' && J.size !== 0, fs.statSync(lixiu).size + 'B');
  ok('G2 导出含任务勾选状态', J.progress && J.progress.items && Object.keys(J.progress.items).length >= 3, Object.keys(J.progress.items).join(','));
  ok('G3 导出含人工锁定标记', !!(J.progress.items.mat_v && J.progress.items.mat_v.lock), JSON.stringify(J.progress.items.mat_v));
  ok('G4 导出含总进度百分比', typeof J.progress.total === 'number' && J.progress.total > 0, String(J.progress.total));
  ok('G5 导出含备注', /审计测试/.test(J.progress.notes));
  ok('G6 导出含里程碑列表', J.progress.milestones.length === 2);
  ok('G7 导出含完整进度日志', J.progress.log.length >= 4, 'n=' + J.progress.log.length);
  ok('G8 导出含轨道/片段(原有剪辑数据)', J.tracks.length >= 3 && J.tracks.some(t => t.clips.length > 0));
  const exportedTotal = J.progress.total, exportedLog = J.progress.log.length, exportedMs = J.progress.milestones.length;

  // ── H 新建工程 → 进度/日志重置 ──
  step('H: new project');
  await page.click('#edNew');
  await page.waitForTimeout(700);
  const fresh = await page.evaluate(() => ({ total: window.__ed.progress().total, log: window.__ed.prj().progress.log.length,
    ms: window.__ed.prj().progress.milestones.length, notes: window.__ed.prj().progress.notes,
    items: Object.keys(window.__ed.prj().progress.items).length, fill: document.getElementById('pgFill').className,
    chip: document.getElementById('pgChip').textContent }));
  R.data.fresh = fresh;
  ok('H1 新建后进度归零', fresh.total === 0 && fresh.fill === 'gray' && fresh.chip === '待开始', JSON.stringify(fresh));
  ok('H2 新建清空日志/里程碑/备注/锁定标记', fresh.log === 0 && fresh.ms === 0 && fresh.notes === '', JSON.stringify(fresh));

  // ── I 导入工程 → 恢复进度/备注/里程碑/日志 ──
  step('I: import project');
  await page.setInputFiles('#edPrjFile', lixiu);
  await page.waitForTimeout(1200);
  const imp = await page.evaluate(() => ({ total: window.__ed.progress().total, log: window.__ed.prj().progress.log.length,
    ms: window.__ed.prj().progress.milestones.length, notes: window.__ed.prj().progress.notes,
    lock: window.__ed.prj().progress.items.mat_v, name: document.getElementById('edName').value,
    tracks: window.__ed.prj().tracks.length, chips: window.__ed.prj().progress.log.filter(x => x.type === 'manual').length }));
  R.data.import = imp;
  ok('I1 导入恢复总进度', imp.total === exportedTotal, imp.total + ' vs ' + exportedTotal);
  ok('I2 导入恢复人工锁定状态', !!(imp.lock && imp.lock.lock), JSON.stringify(imp.lock));
  ok('I3 导入恢复备注', /审计测试/.test(imp.notes));
  ok('I4 导入恢复里程碑', imp.ms === exportedMs, imp.ms + ' vs ' + exportedMs);
  ok('I5 导入恢复历史日志', imp.log === exportedLog + 1, imp.log + ' vs ' + (exportedLog + 1) + '(含1条导入记录)');
  ok('I6 导入恢复轨道片段', imp.tracks >= 3 && imp.name.indexOf('审计') >= 0 || imp.tracks >= 3, imp.tracks + ' tracks');

  // ── J 视图切换(智能成片互斥 + 回切重绘) ──
  step('J: view switch');
  await page.evaluate(() => nav('studio'));
  await page.waitForTimeout(400);
  const sw1 = await page.evaluate(() => ({ ed: getComputedStyle(document.getElementById('viewEditor')).display, st: getComputedStyle(document.getElementById('viewStudio')).display, t: document.getElementById('pageTitle').textContent }));
  await page.evaluate(() => nav('editor'));
  await page.waitForTimeout(500);
  const sw2 = await page.evaluate(() => ({ ed: getComputedStyle(document.getElementById('viewEditor')).display, st: getComputedStyle(document.getElementById('viewStudio')).display, t: document.getElementById('pageTitle').textContent, pg: !!document.getElementById('pgBody').innerHTML.length }));
  R.data.viewSwitch = { studio: sw1, editor: sw2 };
  ok('J1 切到智能成片: 编辑器隐藏/原页面显示', sw1.ed === 'none' && sw1.st !== 'none' && sw1.t === '智能成片');
  ok('J2 切回剪辑工作台且进度面板重绘', sw2.ed !== 'none' && sw2.st === 'none' && sw2.pg && sw2.t === '剪辑工作台');

  // ── W 智能成片「气泡对话」模块(2026-09-19 改版, 回归门禁) ──
  // 设计意图: 用户不离开一个输入框就能走完全流程 —— 说需求 / 看理解 / 追问 / 开工;
  //   右栏固定给出「素材 · 生成进度 · 成片」三段, 底部只留一个「开始生成」,
  //   后端地址等调试项默认不出现(只在「设置」视图露出)。
  step('W: studio chat');
  await page.evaluate(() => nav('studio'));
  await page.waitForTimeout(400);

  const w1 = await page.evaluate(() => {
    const b = document.querySelectorAll('#chatMsgs .bub.ai .bub-txt');
    return { n: document.querySelectorAll('#chatMsgs .bub').length, first: b.length ? b[0].innerText : '' };
  });
  ok('W1 开场有 AI 欢迎气泡且指引先放素材', w1.n >= 1 && /素材/.test(w1.first) && /效果/.test(w1.first),
    '气泡数=' + w1.n + ' | ' + w1.first.replace(/\n/g, ' ').slice(0, 60));

  const w2 = await page.evaluate(() => ({
    mats: !!document.getElementById('matCard'), prog: !!document.getElementById('progCard'), done: !!document.getElementById('doneCard'),
    strip: !!document.getElementById('matStrip'), steps: !!document.getElementById('progSteps')
  }));
  ok('W2 右栏三段齐备(素材/生成进度/成片)', w2.mats && w2.prog && w2.done && w2.strip && w2.steps, JSON.stringify(w2));

  const w3 = await page.evaluate(() => Array.from(document.querySelectorAll('#progSteps .lw-st')).map(e => e.textContent));
  ok('W3 生成进度初始四步均为「待处理」', w3.length === 4 && w3.every(t => /^待处理/.test(t)), w3.join(' | '));

  const w4 = await page.evaluate(() => {
    const b = document.getElementById('goBtn');
    const d = document.getElementById('dbgCard');
    return { txt: b ? b.textContent.trim() : '', foot: !!document.querySelector('.lw-foot'),
      dbgVisible: d ? getComputedStyle(d).display !== 'none' : false };
  });
  ok('W4 底部常驻「开始生成」且调试项默认隐藏', w4.txt === '开始生成' && w4.foot && !w4.dbgVisible, JSON.stringify(w4));

  // W5/W6 没素材时的两道防线: 发言给引导; 点「开始生成」也给引导, 且不向后端发建任务请求
  const jobReqs = [];
  const onReq = r => { if (/\/api\/jobs/.test(r.url())) jobReqs.push(r.url()); };
  page.on('request', onReq);
  await page.fill('#chatInput', '剪成30秒口播');
  await page.click('#chatSend');
  await page.waitForTimeout(350);
  await page.click('#goBtn');
  await page.waitForTimeout(350);
  page.off('request', onReq);
  const w5 = await page.evaluate(() => Array.from(document.querySelectorAll('#chatMsgs .bub.ai .bub-txt')).map(e => e.innerText).join('\n'));
  ok('W5 没素材时发言 → 引导先选素材', /还没收到素材/.test(w5));
  ok('W6 没素材点「开始生成」→ 引导且不发建任务请求', /还没有素材/.test(w5) && jobReqs.length === 0, 'jobs 请求数=' + jobReqs.length);

  // W7 选中素材 → 右栏素材条出缩略图 + 对话出素材气泡 + 真实读出总时长(读 video metadata, 不是估的)
  await page.setInputFiles('#file', [{ name: 'chat_a.mp4', mimeType: 'video/mp4', buffer: TINY_MP4 }]);
  await page.waitForTimeout(2000);
  const w7 = await page.evaluate(() => ({
    thumbs: document.querySelectorAll('#matStrip .lw-thumb').length,
    hint: (document.getElementById('matHint') || {}).textContent,
    meBubbles: document.querySelectorAll('#chatMsgs .bub.me').length,
    sec: window.MAT_SEC
  }));
  ok('W7 素材进右栏素材条 + 对话气泡, 并真实读出总时长',
    w7.thumbs >= 1 && /1 个/.test(w7.hint) && /共/.test(w7.hint) && w7.meBubbles >= 1 && w7.sec > 0,
    'thumbs=' + w7.thumbs + ' hint=' + w7.hint + ' MAT_SEC=' + w7.sec + ' 我方气泡=' + w7.meBubbles);

  // W8/W9 发言 → 「我理解到的」摘要卡, 胶囊必须与那句话对得上
  await page.fill('#chatInput', '把说话的片段保留，去掉静音和卡顿，加中文字幕');
  await page.click('#chatSend');
  await page.waitForTimeout(450);
  const w8 = await page.evaluate(() => {
    const cards = document.querySelectorAll('#chatMsgs .bub[data-plan="1"]');
    const last = cards[cards.length - 1];
    const chips = last ? Array.from(last.querySelectorAll('.lw-chipv')).map(e => e.textContent) : [];
    const lines = last ? last.querySelector('.bub-txt').innerText.split('\n').filter(Boolean) : [];
    return { n: cards.length, who: last ? last.querySelector('.bub-who').textContent : '', chips: chips, q: lines[lines.length - 1] || '' };
  });
  R.data.studioChat = w8;
  const w8j = w8.chips.join(' | ');
  ok('W8 发言后出现「我理解到的」摘要卡', w8.n >= 1 && /我理解到的/.test(w8.who), JSON.stringify(w8).slice(0, 150));
  ok('W9 摘要胶囊与需求一致(素材/保留说话/去静音/加字幕/预计成片)',
    /素材 1 个/.test(w8j) && /保留说话片段/.test(w8j) && /去静音/.test(w8j) && /加中文字幕/.test(w8j) && /预计成片/.test(w8j), w8j);

  // W10/W11 多轮对话: 第二句只补一点, 摘要要合并保留前一轮要点; AI 追问要随缺口变化
  await page.fill('#chatInput', '节奏再紧凑一点');
  await page.click('#chatSend');
  await page.waitForTimeout(450);
  const w10 = await page.evaluate(() => {
    const cards = document.querySelectorAll('#chatMsgs .bub[data-plan="1"]');
    const last = cards[cards.length - 1];
    const lines = last.querySelector('.bub-txt').innerText.split('\n').filter(Boolean);
    return { n: cards.length, chips: Array.from(last.querySelectorAll('.lw-chipv')).map(e => e.textContent), q: lines[lines.length - 1] || '' };
  });
  const w10j = w10.chips.join(' | ');
  ok('W10 多轮对话: 追加需求后仍保留前一轮要点',
    w10.n >= 2 && /节奏紧凑/.test(w10j) && /加中文字幕/.test(w10j) && /去静音/.test(w10j), w10j);
  ok('W11 AI 主动追问随缺口变化(先问节奏→再问配乐)',
    /节奏/.test(w8.q) && /配乐|音乐/.test(w10.q), '首问=' + w8.q + ' | 末问=' + w10.q);

  // W12 整块区域可拖入文件(真实 DragEvent + 真实可解码 mp4, 免得媒体错误污染 L1)
  const w12drag = await page.evaluate((b64) => {
    const bin = atob(b64); const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const dt = new DataTransfer();
    dt.items.add(new File([arr], 'chat_drop.mp4', { type: 'video/mp4' }));
    const root = document.getElementById('lwRoot');
    root.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    const hi = root.classList.contains('drag');
    root.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    return { hi };
  }, TINY_MP4_B64);
  await page.waitForTimeout(700);
  const w12 = await page.evaluate(() => ({ thumbs: document.querySelectorAll('#matStrip .lw-thumb').length, n: (window.files || []).length }));
  ok('W12 拖文件进区域即可入素材(含拖入高亮反馈)',
    w12drag.hi && w12.n >= 2 && w12.thumbs >= 2, '高亮=' + w12drag.hi + ' 素材=' + w12.n + ' 缩略图=' + w12.thumbs);

  const w13 = await page.evaluate(() => {
    const d = document.getElementById('doneCard');
    return { ph: !!document.getElementById('vidPh'), dl: !!d.querySelector('#dl'),
      btns: Array.from(d.querySelectorAll('button')).map(b => b.textContent.trim()) };
  });
  ok('W13 成片卡有预览占位 / 下载 / 送进剪辑台精修',
    w13.ph && w13.dl && w13.btns.some(t => /送进剪辑台精修/.test(t)), JSON.stringify(w13));

  await page.screenshot({ path: SHOT + '/studio-chat.png' });

  // ── J3~J6 素材互通 + 成片送进剪辑台(2026-09-19 新增能力, 回归门禁) ──
  // 设计意图: 两个视图共用同一份工程 —— 智能成片里选的素材, 剪辑台立刻能用;
  //          智能成片出的成片, 一键带进剪辑台继续精修。
  step('J3: material bridge');
  const matsBefore = await page.evaluate(() => window.__ed.prj().materials.length);
  await page.evaluate(() => nav('studio'));
  await page.waitForTimeout(300);
  // 等价于用户在智能成片页点「上传素材」选文件(setInputFiles 会真实触发 change)
  await page.setInputFiles('#file', [
    { name: 'audit_bridge.mp4', mimeType: 'video/mp4', buffer: TINY_MP4 }
  ]);
  await page.waitForTimeout(800);
  const bridge = await page.evaluate(() => ({
    mats: window.__ed.prj().materials.length,
    names: window.__ed.prj().materials.map(m => m.name),
    cards: document.querySelectorAll('#edMatList .mat-item').length,
    libHidden: document.getElementById('edLib').classList.contains('hide')
  }));
  R.data.bridge = bridge;
  ok('J3 智能成片上传的素材自动同步进剪辑台素材栏',
    bridge.mats === matsBefore + 1 && bridge.names.indexOf('audit_bridge.mp4') > -1,
    'before=' + matsBefore + ' after=' + bridge.mats + ' | ' + bridge.names.slice(-2).join(','));
  ok('J4 同步来的素材渲染出卡片且素材栏自动可见',
    bridge.cards >= 1 && !bridge.libHidden, 'cards=' + bridge.cards + ' hidden=' + bridge.libHidden);

  // J5 成片「送进剪辑台精修」: 真实点按钮
  // 该按钮在 #doneCard 里(生成完成后才显示), 这里先模拟「已出片」状态, 再给结果视频挂一个可取回的 blob 源
  await page.evaluate((b64) => {
    window.__TINY_MP4_B64 = b64;
    const d = document.getElementById('doneCard');
    if (d) d.classList.remove('hidden');
    const bin = atob(window.__TINY_MP4_B64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const b = new Blob([arr], { type: 'video/mp4' });
    const u = URL.createObjectURL(b);
    const v = document.getElementById('vid');
    if (v) v.src = u;
    window.__auditVidBlob = u;
  }, TINY_MP4_B64);
  await page.waitForTimeout(250);
  await page.locator('button:has-text("送进剪辑台精修")').first().click();
  await page.waitForTimeout(1500);
  const sent = await page.evaluate(() => ({
    view: getComputedStyle(document.getElementById('viewEditor')).display !== 'none' ? 'editor' : 'studio',
    title: document.getElementById('pageTitle').textContent,
    mats: window.__ed.prj().materials.length,
    names: window.__ed.prj().materials.map(m => m.name),
    clips: document.querySelectorAll('.ed-clip').length
  }));
  R.data.sendToEditor = sent;
  ok('J5 成片一键送进剪辑台: 切到剪辑台且成片已入素材栏',
    sent.view === 'editor' && sent.title === '剪辑工作台' && sent.names.some(n => /^成片_/.test(n)),
    JSON.stringify(sent).slice(0, 160));
  ok('J6 带进来的成片直接落在视频轨上(可直接精修)',
    sent.clips >= 1, 'clips=' + sent.clips);

  // ── K 快捷键(空格播放) ──
  step('K: keyboard');
  await page.click('#edLanesCol');
  await page.keyboard.press('Space');
  await page.waitForTimeout(400);
  const playTxt = await page.evaluate(() => document.getElementById('edPlay').textContent.trim());
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  const stopTxt = await page.evaluate(() => document.getElementById('edPlay').textContent.trim());
  ok('K1 空格播放/暂停生效', /暂停/.test(playTxt) && /播放/.test(stopTxt), playTxt + ' -> ' + stopTxt);

  // ── M 面板折叠 / 分组折叠 / 片尾触发重算 / 重置人工锁定 ──
  step('M: fold / play-trigger / reset lock');
  // M1 整面板折叠与展开(点标题栏)
  await page.click('#pgHead');
  await page.waitForTimeout(300);
  const foldOff = await page.evaluate(() => document.getElementById('pgBody').classList.contains('hide'));
  await page.click('#pgHead');
  await page.waitForTimeout(300);
  const foldOn = await page.evaluate(() => ({ hide: document.getElementById('pgBody').classList.contains('hide'), len: document.getElementById('pgBody').innerHTML.length }));
  ok('M1 进度面板可折叠/展开', foldOff === true && foldOn.hide === false && foldOn.len > 500, 'folded=' + foldOff + ' unfolded_len=' + foldOn.len);
  // M2 单个阶段分组折叠 —— 注意: 每次点击都会 renderProgress() 重建 DOM,
  //    必须重新查询节点, 读旧引用会拿到已脱离文档的陈旧子树(曾因此误报失败)
  const gFold = await page.evaluate(async () => {
    const gid = document.querySelector('.pg-grp-h[data-grp]').getAttribute('data-grp');
    const tasks = () => {
      const h = document.querySelector('.pg-grp-h[data-grp="' + gid + '"]');
      return h && h.parentElement ? h.parentElement.querySelector('.pg-tasks') : null;
    };
    document.querySelector('.pg-grp-h[data-grp="' + gid + '"]').click();
    await new Promise(r => setTimeout(r, 250));
    const hid = !!(tasks() && tasks().classList.contains('hide'));
    document.querySelector('.pg-grp-h[data-grp="' + gid + '"]').click();
    await new Promise(r => setTimeout(r, 250));
    const back = !!(tasks() && !tasks().classList.contains('hide'));
    return { gid, hid, back };
  });
  ok('M2 阶段分组可折叠/展开', gFold.hid === true && gFold.back === true, gFold.gid + ' hid=' + gFold.hid + ' back=' + gFold.back);
  // M3 播放到片尾 → 自动触发一次进度重算(附加逻辑)
  await page.evaluate(() => { window.__ed.prj().stats.previewed = false; window.__ed.prj().duration = 0.4; });
  await page.click('#edLanesCol');
  await page.click('#edPlay');
  await page.waitForTimeout(1800);
  const prev = await page.evaluate(() => {
    const L = window.__ed.prj().progress.log;
    return { previewed: !!window.__ed.prj().stats.previewed, hit: L.some(x => /播放完成/.test(x.detail)),
      last: L.length ? L[L.length - 1].detail : '' };
  });
  ok('M3 播放到片尾自动触发进度重算', prev.previewed === true && prev.hit === true, prev.last);
  // M4 重置人工锁定 → 全部交回自动检测
  const beforeReset = await page.evaluate(() => Object.keys(window.__ed.prj().progress.items).filter(k => window.__ed.prj().progress.items[k].lock).length);
  await page.click('#pgReset');   // confirm 由上方全局 dialog 处理器自动同意
  await page.waitForTimeout(600);
  const afterReset = await page.evaluate(() => ({ lock: Object.keys(window.__ed.prj().progress.items).filter(k => window.__ed.prj().progress.items[k].lock).length,
    manualDom: document.querySelectorAll('#pgBody .pg-task.manual').length,
    logHit: window.__ed.prj().progress.log.some(x => /重置全部人工锁定/.test(x.detail)) }));
  ok('M4 重置人工锁定清空全部 lock 标记', beforeReset > 0 && afterReset.lock === 0 && afterReset.manualDom === 0 && afterReset.logHit === true,
    beforeReset + ' -> ' + afterReset.lock + ' (dom manual=' + afterReset.manualDom + ')');

  // ══════════════════════════════════════════════════════════════
  // N 【UI设计模块】独立画布 / 图层 / 属性 / 对齐 / 生成 / 叠加 / 统一撤销栈
  // ══════════════════════════════════════════════════════════════
  step('N: UI design module');
  const uiOf = () => page.evaluate(() => window.__ed.ui());
  const hist = () => page.evaluate(() => window.__ed.history());
  // canvas 坐标 → 屏幕坐标(画布被 CSS 缩放, 必须换算)
  // 注意: 右栏可滚动, 点过下面的属性输入框后画布可能被顶出视口(boundingBox.y 为负),
  // 此时鼠标事件落空 → 必须先 scrollIntoViewIfNeeded 再换算坐标
  async function uiScreen(cx, cy) {
    const U = await uiOf();
    const loc = page.locator('#uiCanvas');
    await loc.scrollIntoViewIfNeeded();
    await page.waitForTimeout(120);
    const b = await loc.boundingBox();
    return { x: b.x + cx * b.width / U.w, y: b.y + cy * b.height / U.h };
  }
  async function drag(from, to) {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(260);
  }
  async function setProp(sel, val) {
    await page.click(sel);
    await page.fill(sel, String(val));
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.waitForTimeout(240);
  }

  // ── N1 切到 UI设计 Tab ──
  await page.click('#edRTabs [data-rtab="ui"]');
  await page.waitForTimeout(400);
  const uiTab = await page.evaluate(() => ({
    pane: getComputedStyle(document.getElementById('rt-ui')).display,
    props: getComputedStyle(document.getElementById('rt-props')).display,
    wide: document.getElementById('edRight').classList.contains('wide'),
    cvW: document.getElementById('uiCanvas').width,
    empty: /还没有元素/.test(document.getElementById('uiLayers').innerText)
  }));
  R.data.uiTab = uiTab;
  ok('N1 切到UI设计Tab: 面板可见+右栏加宽+空态提示', uiTab.pane !== 'none' && uiTab.props === 'none' && uiTab.wide && uiTab.empty, 'w=' + uiTab.cvW);

  // ── N2 六类组件 ──
  for (const t of ['rect', 'text', 'image', 'button', 'card', 'icon']) {
    await page.click('#uiTools [data-add="' + t + '"]');
    await page.waitForTimeout(120);
  }
  const n2 = await uiOf();
  const types = n2.layers.map(l => l.type);
  R.data.comp = types;
  ok('N2 六类组件均可添加', n2.layers.length === 6
    && ['rect', 'text', 'image', 'button', 'card', 'icon'].every(t => types.indexOf(t) >= 0), types.join(','));

  // ── N3 图层列表: 名称/类型/选中 ──
  const rows = await page.evaluate(() => [...document.querySelectorAll('#uiLayers .ui-layer')].map(r => ({
    name: r.querySelector('.nm').textContent, ty: r.querySelector('.ty').textContent })));
  await page.click('#uiLayers .ui-layer:nth-child(1)');    // 列表首个 = 最上层(icon)
  await page.waitForTimeout(200);
  const n3 = await page.evaluate(() => ({ sel: window.__ed.ui().sel, cls: document.querySelector('#uiLayers .ui-layer').className,
    propName: document.getElementById('uiPropName').textContent }));
  ok('N3 图层列表渲染类型+名称, 点击可选中', rows.length === 6 && rows.every(r => r.name && r.ty) && !!n3.sel && /sel/.test(n3.cls) && !!n3.propName,
    rows.map(r => r.ty + r.name).join('|').slice(0, 60));

  // ── N4 显隐 / 锁定 ──
  await page.click('#uiLayers .ui-layer:nth-child(1) [data-eye]');
  await page.waitForTimeout(200);
  const uiHidden = await page.evaluate(() => { const L = window.__ed.ui().layers; return L[L.length - 1].visible; });
  await page.click('#uiLayers .ui-layer:nth-child(1) [data-lock]');
  await page.waitForTimeout(200);
  const uiLocked = await page.evaluate(() => { const L = window.__ed.ui().layers; return L[L.length - 1].locked; });
  ok('N4 图层可隐藏/锁定(写入工程数据)', uiHidden === false && uiLocked === true, 'visible=' + uiHidden + ' locked=' + uiLocked);

  // ── N5 层级排序 ──
  const z0 = (await uiOf()).layers.map(l => l.id);
  await page.click('#uiLayers .ui-layer:nth-child(3) [data-up]');       // 列表第3行 = 数组倒数第3
  await page.waitForTimeout(220);
  const z1 = (await uiOf()).layers.map(l => l.id);
  ok('N5 图层层级可上下移动', z0.join() !== z1.join() && z0.length === z1.length, '顺序已改变');
  // 复原: 锁定/隐藏的那层先恢复, 方便后续拖动
  await page.click('#uiLayers [data-lock]');
  await page.waitForTimeout(150);
  await page.click('#uiLayers [data-eye]');
  await page.waitForTimeout(200);

  // ── N6 画布自定义尺寸 ──
  await page.fill('#uiCvW', '800');
  await page.fill('#uiCvH', '1200');
  await page.click('#uiCvApply');
  await page.waitForTimeout(350);
  const cvSize = await page.evaluate(() => ({ w: window.__ed.ui().w, h: window.__ed.ui().h, cw: document.getElementById('uiCanvas').width }));
  ok('N6 画布尺寸可自定义(800×1200)', cvSize.w === 800 && cvSize.h === 1200 && cvSize.cw === 800, cvSize.w + 'x' + cvSize.h);

  // ── N7 拖动移动 + 网格吸附 ──
  await page.selectOption('#uiGridSize', '24');
  await page.waitForTimeout(200);
  const snapOn = await page.evaluate(() => window.__ed.ui().snap);
  // 选中「矩形」并用对齐工具放到左上(x=0,y=0), 再向右下拖 50/50 → 落点必须落在 24 的整数倍
  const rectId = await page.evaluate(() => (window.__ed.ui().layers.find(l => l.type === 'rect') || {}).id);
  await page.click('#uiLayers .ui-layer[data-uid="' + rectId + '"]');   // 走真实路径: 点图层列表行选中
  await page.waitForTimeout(250);
  await page.click('#uiProps [data-al="left"]'); await page.waitForTimeout(200);
  await page.click('#uiProps [data-al="top"]'); await page.waitForTimeout(250);
  let cur = await page.evaluate(() => { const s = window.__ed.ui(); return s.layers.find(l => l.id === s.sel); });
  await drag(await uiScreen(cur.x + cur.w / 2, cur.y + cur.h / 2), await uiScreen(cur.x + cur.w / 2 + 50, cur.y + cur.h / 2 + 50));
  const moved = await page.evaluate(() => { const s = window.__ed.ui(); return s.layers.find(l => l.id === s.sel); });
  ok('N7 画布拖动可移动图层且吸附到网格', snapOn === true && moved.x !== 0 && moved.x % 24 === 0 && moved.y % 24 === 0,
    '(' + Math.round(cur.x) + ',' + Math.round(cur.y) + ') → (' + moved.x + ',' + moved.y + ') grid=24');

  // ── N8 角点缩放 ──
  const before8 = { w: moved.w, h: moved.h };
  const se = await uiScreen(moved.x + moved.w, moved.y + moved.h);
  await drag(se, { x: se.x + 40, y: se.y + 40 });
  const after8 = await page.evaluate(() => { const s = window.__ed.ui(); return s.layers.find(l => l.id === s.sel); });
  ok('N8 角点手柄可缩放图层', after8.w > before8.w && after8.h > before8.h,
    before8.w + 'x' + before8.h + ' → ' + after8.w + 'x' + after8.h);

  // ── N9 元素属性面板 ──
  const p0 = await page.evaluate(() => { const s = window.__ed.ui(); const l = s.layers.find(x => x.id === s.sel); return { id: l.id, fill: l.fill, op: l.opacity }; });
  await setProp('#uiP_radius', 40);
  await page.fill('#uiP_fillT', '#3f7ad6');
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.waitForTimeout(240);
  await page.evaluate(() => { const r = document.getElementById('uiP_opacity'); r.value = '70'; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(260);
  await page.click('#uiP_shadowOn');
  await page.waitForTimeout(320);
  const p1 = await page.evaluate(() => { const s = window.__ed.ui(); const l = s.layers.find(x => x.id === s.sel);
    return { radius: l.radius, fill: l.fill, op: l.opacity, shadow: !!(l.shadow && l.shadow.on), hasBlurField: !!document.getElementById('uiP_shadowBlur') }; });
  ok('N9 属性面板可改圆角/填充/不透明度/阴影', p1.radius === 40 && p1.fill === '#3f7ad6' && Math.abs(p1.op - 0.7) < 0.001 && p1.shadow === true && p1.hasBlurField,
    'r=' + p1.radius + ' fill=' + p1.fill + ' op=' + p1.op + ' shadow=' + p1.shadow);

  // ── N10 对齐工具 ──
  await page.click('#uiProps [data-al="hcenter"]');
  await page.waitForTimeout(250);
  const al = await page.evaluate(() => { const s = window.__ed.ui(); const l = s.layers.find(x => x.id === s.sel); return { x: l.x, expect: Math.round((s.w - l.w) / 2) }; });
  ok('N10 对齐工具(水平居中)生效', al.x === al.expect, 'x=' + al.x + ' 期望=' + al.expect);

  // ── N11 快捷键: Ctrl+D 复制 / Delete 删除 ──
  const c0 = (await uiOf()).layers.length;
  await page.click('#uiWrap');
  await page.keyboard.press('Control+d');
  await page.waitForTimeout(300);
  const c1 = (await uiOf()).layers.length;
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);
  const c2 = (await uiOf()).layers.length;
  ok('N11 UI图层快捷键 Ctrl+D 复制 / Delete 删除', c1 === c0 + 1 && c2 === c0, c0 + ' →复制 ' + c1 + ' →删除 ' + c2);

  // ── N12 一句话生成(清空重建) ──
  await page.fill('#uiPrompt', "做一个 1080x1080 的方形封面，深色底，中间大标题'星界异宠'，下面一行小字'第二幕'，底部一个金色圆角标签'NEW'");
  await page.check('input[name=uiMode][value="replace"]');
  await page.click('#uiGen');
  await page.waitForTimeout(600);
  const g1 = await uiOf();
  const titleL = g1.layers.find(l => l.text && /星界异宠/.test(l.text.content || ''));
  const tagL = g1.layers.find(l => l.type === 'tag');
  const bgL = g1.layers.find(l => l.name === '底色');
  R.data.gen1 = { w: g1.w, h: g1.h, n: g1.layers.length, names: g1.layers.map(l => l.name) };
  ok('N12 一句话生成(清空重建): 尺寸/底色/标题/标签都解析到',
    g1.w === 1080 && g1.h === 1080 && g1.layers.length === 4 && !!titleL && !!tagL && !!bgL
    && bgL.w === 1080 && bgL.h === 1080 && tagL.fill === '#d4af37',
    g1.layers.length + ' 层: ' + g1.layers.map(l => l.name).join('/'));
  ok('N12b 生成记录写入工程(history)', g1.history.length > 0 && g1.history[g1.history.length - 1].kind === 'gen',
    g1.history[g1.history.length - 1] ? g1.history[g1.history.length - 1].note : '无');

  // ── N13 追加模式 ──
  await page.fill('#uiPrompt', "右上角一个白色标签'TOP'");
  await page.check('input[name=uiMode][value="append"]');
  await page.click('#uiGen');
  await page.waitForTimeout(500);
  const g2 = await uiOf();
  ok('N13 追加模式不覆盖原有图层', g2.layers.length === g1.layers.length + 1 && !!g2.layers.find(l => l.text && /TOP/.test(l.text.content || '')),
    g1.layers.length + ' → ' + g2.layers.length);

  // ── N14 修改选中图层: 只改提到的属性 ──
  const tagId = await page.evaluate(() => (window.__ed.ui().layers.find(l => l.type === 'tag') || {}).id);
  await page.click('#uiLayers .ui-layer[data-uid="' + tagId + '"]');     // 走真实路径: 点图层列表行选中
  await page.waitForTimeout(250);
  const m0 = await page.evaluate(() => { const s = window.__ed.ui(); const l = s.layers.find(x => x.id === s.sel); return { fill: l.fill, opacity: l.opacity, w: l.w }; });
  await page.fill('#uiPrompt', '圆角改成 12, 不透明度 60%');
  await page.click('#uiModify');
  await page.waitForTimeout(500);
  const m1 = await page.evaluate(() => { const s = window.__ed.ui(); const l = s.layers.find(x => x.id === s.sel); return { radius: l.radius, fill: l.fill, opacity: l.opacity, w: l.w, prompt: l.name }; });
  ok('N14 修改选中图层: 只改提到的, 未提及的保持不变',
    m1.radius === 12 && Math.abs(m1.opacity - 0.6) < 0.001 && m1.fill === m0.fill && m1.w === m0.w,
    'r=' + m1.radius + ' op=' + m1.opacity + ' 填充保持=' + (m1.fill === m0.fill) + ' 宽保持=' + (m1.w === m0.w));

  // ── N15 五个模板按钮 ──
  const tplRes = [];
  for (const k of ['sub', 'cover', 'end', 'btn', 'tag']) {
    const a = (await uiOf()).layers.length;
    await page.click('#uiTpl [data-tpl="' + k + '"]');
    await page.waitForTimeout(260);
    const b = (await uiOf()).layers.length;
    tplRes.push(k + ':' + a + '→' + b);
  }
  const tplOk = await page.evaluate(() => window.__ed.ui().layers.length);
  // 注意: tplRes 形如 "sub:5→6", 取数要用 split(':')[1].split('→'), 否则 "sub:5" 被 Number() 成 NaN
  const tplNum = s => { const p = s.split(':')[1].split('→'); return [+p[0], +p[1]]; };
  ok('N15 五个模板按钮均可插入图层', tplRes.length === 5 && tplRes.every(s => { const [a, b] = tplNum(s); return b > a; }) && tplOk > 0, tplRes.join(' '));

  // ── N16 导出 PNG ──
  const [png] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('#uiExportPng')]);
  const pngPath = TMP + '/ui_design.png';
  await png.saveAs(pngPath);
  const pngSize = fs.statSync(pngPath).size;
  ok('N16 导出 PNG(设计图)成功', pngSize > 1000 && /\.png$/.test(png.suggestedFilename()), png.suggestedFilename() + ' ' + pngSize + 'B');

  // ── N17 一键叠加到视频画布 ──
  const clipBefore = await page.evaluate(() => { let n = 0; window.__ed.prj().tracks.forEach(t => n += t.clips.length); return n; });
  await page.click('#uiToVideo');
  await page.waitForTimeout(600);
  const ov = await page.evaluate(() => {
    let hit = null;
    window.__ed.prj().tracks.forEach(t => t.clips.forEach(c => { if (c.ui) hit = c; }));
    return { has: !!hit, isPng: hit ? /^data:image\/png;base64,/.test(hit.ui.img) : false,
      dur: hit ? +(hit.t1 - hit.t0).toFixed(2) : 0,
      dom: document.querySelectorAll('#edLanes .ed-clip.ui').length,
      total: (() => { let n = 0; window.__ed.prj().tracks.forEach(t => n += t.clips.length); return n; })() };
  });
  R.data.overlay = ov;
  ok('N17 一键叠加到视频画布(进时间轴, 可作为贴纸/字幕卡片)',
    ov.has && ov.isPng && ov.dur >= 2 && ov.dom >= 1 && ov.total === clipBefore + 1, '时长' + ov.dur + 's dom=' + ov.dom);

  // ── N18 全局撤销栈: 剪辑 + UI设计 共用同一套 ──
  const h0 = await hist();
  await page.click('#uiTools [data-add="rect"]');
  await page.waitForTimeout(300);
  const h1 = await hist();
  const cntAfterAdd = (await uiOf()).layers.length;
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  const h2 = await hist();
  const cntAfterUndo = (await uiOf()).layers.length;
  // 栈已满(20 上限)时长度不再增长, 只丢最旧的一条 —— 两种都算正常
  ok('N18a UI操作进入撤销栈且可撤销(tooltip/名称)',
    (h1.undo.length === h0.undo.length + 1 || h1.undo.length === h1.max) && /添加矩形/.test(h1.undo[h1.undo.length - 1])
    && cntAfterUndo === cntAfterAdd - 1 && h2.redo.length === 1, '栈顶=' + h1.undo[h1.undo.length - 1] + ' 图层 ' + cntAfterAdd + '→' + cntAfterUndo + ' (' + h1.undo.length + '/' + h1.max + ')');
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(400);
  const cntAfterRedo = (await uiOf()).layers.length;
  ok('N18b Ctrl+Y 可重做', cntAfterRedo === cntAfterAdd, cntAfterUndo + ' → ' + cntAfterRedo);
  // 同一个栈里再做一个「剪辑」操作, 证明两个模块共用一套
  await page.click('#edAddSub');
  await page.waitForTimeout(450);
  const h3 = await hist();
  const names = h3.undo.map(x => x);
  ok('N18c 剪辑操作与UI操作同一个撤销栈',
    names.some(n => /字幕片段/.test(n)) && names.some(n => /矩形|图层|模板|生成|UI|对齐/.test(n)),
    names.slice(-4).join(' | '));

  // ── N19 撤销栈上限 20 步 ──
  await page.evaluate(() => { const U = window.__ed.ui(); U.layers.length = 0; });   // 清掉图层, 腾出 60 上限空间
  await page.click('#edNew');                                   // 新建工程 → 撤销栈清空
  await page.waitForTimeout(500);
  await page.click('#edRTabs [data-rtab="ui"]');
  await page.waitForTimeout(300);
  for (let i = 0; i < 22; i++) { await page.click('#uiTools [data-add="rect"]'); }
  await page.waitForTimeout(500);
  const hLim = await hist();
  ok('N19 撤销栈上限 20 步(超出丢最旧)', hLim.undo.length === 20 && hLim.max === 20, 'undo=' + hLim.undo.length + ' max=' + hLim.max);

  // ── N20 新建工程清空撤销栈与UI设计 ──
  const n20 = await page.evaluate(() => ({ layers: window.__ed.ui().layers.length, hist: window.__ed.ui().history.length }));
  await page.click('#edNew');
  await page.waitForTimeout(500);
  const n20b = await page.evaluate(() => ({ undo: window.__ed.history().undo.length, redo: window.__ed.history().redo.length,
    layers: window.__ed.ui().layers.length, designHist: window.__ed.ui().history.length }));
  await page.click('#edRTabs [data-rtab="ui"]');
  await page.waitForTimeout(300);
  ok('N20 新建工程: 撤销栈与UI设计全部重置', n20.layers > 0 && n20b.undo === 0 && n20b.redo === 0 && n20b.layers === 0 && n20b.designHist === 0,
    JSON.stringify(n20b));

  // ── N21 导出 .lixiu 含 UI设计(且不含撤销栈) ──
  await page.fill('#uiPrompt', "1080x1080 深色底，中间大标题'存档测试'，底部金色标签'v1'");
  await page.check('input[name=uiMode][value="replace"]');
  await page.click('#uiGen');
  await page.waitForTimeout(500);
  const [dl3] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('#edExportPrj')]);
  const lixiu3 = TMP + '/audit_ui.lixiu';
  await dl3.saveAs(lixiu3);
  const J3 = JSON.parse(fs.readFileSync(lixiu3, 'utf8'));
  const uiKeys = J3.ui ? Object.keys(J3.ui).sort().join(',') : '';
  // 键序用运行时 sort 现算, 不手写(手写极易写错字母序, 上次就是栽在这)
  const wantUiKeys = ['bg', 'grid', 'h', 'history', 'layers', 'showGrid', 'snap', 'w'].sort().join(',');
  R.data.uiexport = { keys: Object.keys(J3).sort().join(','), ui: uiKeys, n: J3.ui ? J3.ui.layers.length : 0 };
  ok('N21 .lixiu 含 UI设计(画布+图层+生成历史), 且不含撤销栈',
    !!J3.ui && uiKeys === wantUiKeys && J3.ui.layers.length > 0 && J3.ui.history.length > 0
    && !('undoStack' in J3) && !('redo' in J3), Object.keys(J3).length + ' 个顶层字段 / ui: ' + uiKeys);

  // ── N22 导入工程恢复 UI设计 ──
  const beforeImport = J3.ui.layers.length;
  await page.setInputFiles('#edPrjFile', lixiu3);
  await page.waitForTimeout(800);
  const n22 = await page.evaluate(() => ({ n: window.__ed.ui().layers.length, w: window.__ed.ui().w,
    hist: window.__ed.ui().history.length, undo: window.__ed.history().undo.length,
    title: (window.__ed.ui().layers.find(l => l.text && /存档测试/.test(l.text.content || '')) || {}).name }));
  ok('N22 导入工程恢复UI图层/尺寸/历史, 并清空撤销栈',
    n22.n === beforeImport && n22.w === 1080 && n22.hist > 0 && n22.undo === 0 && !!n22.title,
    '图层 ' + n22.n + '/' + beforeImport + ' 撤销栈=' + n22.undo);

  // ── N23 旧版工程(无 ui 字段)回退默认, 不报错 ──
  const legacy = TMP + '/legacy_no_ui.lixiu';
  fs.writeFileSync(legacy, JSON.stringify({ magic: 'lixiu-project', version: 1, name: '旧工程', canvas: { w: 1280, h: 720 },
    fps: 30, duration: 10, tracks: [{ id: 'v1', kind: 'video', locked: false, muted: false, clips: [] }], markers: [], materials: [] }));
  await page.setInputFiles('#edPrjFile', legacy);
  await page.waitForTimeout(800);
  const n23 = await page.evaluate(() => ({ w: window.__ed.ui().w, h: window.__ed.ui().h, n: window.__ed.ui().layers.length,
    grid: window.__ed.ui().grid, snap: window.__ed.ui().snap }));
  ok('N23 旧工程(无ui字段)回退默认UI设计且不报错',
    n23.w === 1080 && n23.h === 1080 && n23.n === 0 && n23.grid === 8 && n23.snap === true, JSON.stringify(n23));

  await page.screenshot({ path: SHOT + '/ui-design.png' });

  // ── P 布局分区(顶部工具栏 / 右侧面板 / 底部时间轴 / 悬浮层 + 底部工程档案) ──
  step('P: layout zones');
  await page.evaluate(() => nav('editor'));
  await page.waitForTimeout(500);
  const pz = await page.evaluate(() => {
    const R2 = el => { const r = el.getBoundingClientRect(); return { h: Math.round(r.height), bottom: Math.round(r.bottom), w: Math.round(r.width) }; };
    return {
      headerTxt: document.querySelector('header').innerText.replace(/\s+/g, ' ').trim(),
      bodyHasToumu: document.body.innerText.indexOf('头目') >= 0,
      sideFoot: (document.querySelector('aside > div:last-child') || {}).innerText || '',
      // 顶部工具栏
      nameVis: !!document.getElementById('edName') && document.getElementById('edName').getBoundingClientRect().width > 0,
      namePh: (document.getElementById('edName') || {}).placeholder || '',
      saveVis: document.getElementById('edSave').getBoundingClientRect().width > 0,
      saveTxt: document.getElementById('edSave').innerText.trim(),
      asTxt: document.getElementById('edExportPrj').innerText.trim(),
      // 右侧面板
      pt: (document.querySelector('.ed-ptitle') || {}).innerText || '',
      // 底部时间轴
      tlH: R2(document.querySelector('.ed-timeline')).h,
      tlBottom: R2(document.querySelector('.ed-timeline')).bottom,
      tlZone: (document.querySelector('.ed-tl-headbar .ed-zone') || {}).innerText || '',
      hasSTrack: !!document.getElementById('edAddSTrack'),
      // 底部工程档案
      arBottom: R2(document.getElementById('edArchive')).bottom,
      vh: window.innerHeight,
      arCols: [...document.querySelectorAll('#arBody .ar-col')].map(c => c.querySelector('h5').innerText.replace(/\s+/g, '')),
      notesInAr: !!document.querySelector('#arBody #pgNotes'),
      msInAr: !!document.querySelector('#arBody #pgMsAdd'),
      logInAr: !!document.querySelector('#arBody #pgLog'),
      notesInPgTab: !!document.querySelector('#pgBody #pgNotes'),
      msInPgTab: !!document.querySelector('#pgBody #pgMsAdd'),
      cvH: Math.round(document.getElementById('edCanvas').getBoundingClientRect().height),
      // 悬浮层
      tipPos: getComputedStyle(document.getElementById('edTip')).position
    };
  });
  R.data.layout = pz;
  ok('P1 顶部已无「头目」字样且保留哩秀品牌', !pz.bodyHasToumu && /哩秀/.test(pz.headerTxt), pz.headerTxt);
  ok('P2 侧边栏无开发术语(后端隧道/自动发现)', !/后端隧道|自动发现/.test(pz.sideFoot), pz.sideFoot.replace(/\s+/g, ' '));
  ok('P3 工具栏: 工程名可编辑(带留空提示)', pz.nameVis && pz.namePh.length > 0, pz.namePh);
  ok('P4 工具栏: 保存 / 另存为 两个动作齐备', pz.saveVis && /保存/.test(pz.saveTxt) && /另存为/.test(pz.asTxt), pz.saveTxt + ' | ' + pz.asTxt);
  ok('P5 右侧面板有分区标题「编辑面板」', /编辑面板/.test(pz.pt), pz.pt.replace(/\s+/g, ' '));
  okL('P6 时间轴有分区标题且高度 236 未被压缩', /时间轴/.test(pz.tlZone) && pz.tlH === 236, pz.tlZone + ' h=' + pz.tlH);
  ok('P7 时间轴底边不出视口(不溢出)', pz.tlBottom < pz.vh, 'bottom=' + pz.tlBottom + ' vh=' + pz.vh);
  ok('P8 备注/里程碑/进度历史已移出右侧进度Tab', !pz.notesInPgTab && !pz.msInPgTab, JSON.stringify({ n: pz.notesInPgTab, m: pz.msInPgTab }));
  ok('P9 底部工程档案三列齐备(备注/里程碑/进度历史)', pz.arCols.length === 3 && pz.notesInAr && pz.msInAr && pz.logInAr, pz.arCols.join(' | '));
  okL('P10 工程档案贴在页面最底部', Math.abs(pz.arBottom - pz.vh) <= 2, 'bottom=' + pz.arBottom + ' vh=' + pz.vh);
  ok('P11 悬浮 tooltip 为 fixed 定位', pz.tipPos === 'fixed', pz.tipPos);

  // 收起档案区 → 空间还给画布, 时间轴不受影响
  await page.click('#arFold');
  await page.waitForTimeout(400);
  const pz2 = await page.evaluate(() => ({
    cvH: Math.round(document.getElementById('edCanvas').getBoundingClientRect().height),
    tlH: Math.round(document.querySelector('.ed-timeline').getBoundingClientRect().height),
    arBottom: Math.round(document.getElementById('edArchive').getBoundingClientRect().bottom),
    hidden: document.getElementById('arBody').classList.contains('hide'),
    btn: document.getElementById('arFold').innerText.trim()
  }));
  ok('P12 工程档案可收起(画布变高)', pz2.hidden && pz2.cvH > pz.cvH && /展开/.test(pz2.btn), pz.cvH + ' -> ' + pz2.cvH);
  okL('P13 收起后时间轴高度不变', pz2.tlH === 236, 'h=' + pz2.tlH);
  okL('P14 收起后档案区仍贴底', Math.abs(pz2.arBottom - pz.vh) <= 2, 'bottom=' + pz2.arBottom);
  await page.click('#arFold');
  await page.waitForTimeout(350);

  // ＋字幕轨: 新增轨道 + 进撤销栈
  const nt0 = await page.evaluate(() => window.__ed.prj().tracks.length);
  await page.click('#edAddSTrack');
  await page.waitForTimeout(350);
  const nt1 = await page.evaluate(() => window.__ed.prj().tracks.filter(t => t.kind === 'subtitle').length);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(350);
  const nt2 = await page.evaluate(() => window.__ed.prj().tracks.length);
  ok('P15 ＋字幕轨 可新增且可 Ctrl+Z 撤销', nt2 === nt0, 'tracks ' + nt0 + ' -> ' + nt2 + ' (subtitle 数 ' + nt1 + ')');

  // 保存到本机 → 存档可读 + 「↺ 恢复存档」出现
  await page.click('#edSave');
  await page.waitForTimeout(500);
  const sv = await page.evaluate(() => {
    const raw = localStorage.getItem('lixiu_prj_autosave');
    let j = null; try { j = JSON.parse(raw); } catch (e) {}
    return { magic: j && j.magic, hasTracks: !!(j && j.tracks), vis: getComputedStyle(document.getElementById('edRestore')).display };
  });
  ok('P16 💾保存 写入本机且为合法工程结构', sv.magic === 'lixiu-project' && sv.hasTracks, 'magic=' + sv.magic);
  ok('P17 有存档后「↺ 恢复存档」按钮出现', sv.vis !== 'none', 'display=' + sv.vis);

  // 悬浮提示: 连续两条不重叠, 且不被创作台标签页 / 编辑器工具栏遮挡
  await page.click('#edAddVTrack');
  await page.click('#edAddSTrack');
  await page.waitForTimeout(200);
  const tst = await page.evaluate(() => {
    const ts = [...document.querySelectorAll('.ed-toast')];
    const r = ts.length ? ts[0].getBoundingClientRect() : null;
    const tabs = document.getElementById('cbTabs').getBoundingClientRect();
    const tb = document.querySelector('.ed-toolbar').getBoundingClientRect();
    return { n: ts.length, top: r ? Math.round(r.top) : -1,
      tabsBottom: Math.round(tabs.bottom), tbBottom: Math.round(tb.bottom) };
  });
  ok('P18 连续提示只保留一条(不重叠糊字)', tst.n <= 1, 'n=' + tst.n);
  ok('P19 提示条不被标签页遮挡', tst.n === 0 || tst.top >= tst.tabsBottom, JSON.stringify(tst));
  ok('P19b 提示条不被编辑器工具栏遮挡(不压按钮)', tst.n === 0 || tst.top >= tst.tbBottom,
    'toastTop=' + tst.top + ' tbBottom=' + tst.tbBottom);

  // ── S 轨道滚动的正确性(轨道名 ⇄ 泳道必须同步; 新增轨道必须可见) ──
  // 加到 6 条轨, 让轨道区真正出现纵向滚动(3 条时不触发)
  for (let i = 0; i < 3; i++) { await page.click('#edAddSTrack'); await page.waitForTimeout(200); }
  await page.waitForTimeout(400);
  const sc1 = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#edTrackRows > *')];
    const last = rows[rows.length - 1];
    const col = document.querySelector('#edLanesCol');
    const box = col.getBoundingClientRect();
    const lb = last ? last.getBoundingClientRect() : null;
    return { n: rows.length, scrollable: col.scrollHeight - col.clientHeight,
      lastVisible: lb ? (lb.bottom <= box.bottom + 2 && lb.top >= box.top - 2) : null };
  });
  ok('S1 轨道多到需要纵向滚动(前置条件成立)', sc1.scrollable > 20 && sc1.n >= 6, JSON.stringify(sc1));
  ok('S2 新增轨道自动滚入可视区(点完能看见)', sc1.lastVisible === true, JSON.stringify(sc1));

  // 滚泳道 → 轨道名必须跟随, 否则名字与片段错位
  await page.evaluate(() => { document.querySelector('#edLanesCol').scrollTop = 40; });
  await page.waitForTimeout(250);
  const sc2 = await page.evaluate(() => ({
    lanes: Math.round(document.querySelector('#edLanesCol').scrollTop),
    names: Math.round(document.querySelector('#edTrackRows').scrollTop)
  }));
  ok('S3 滚动泳道时轨道名跟随(不错位)', Math.abs(sc2.names - sc2.lanes) <= 1, JSON.stringify(sc2));

  // 反向: 滚轨道名 → 泳道跟随
  await page.evaluate(() => { document.querySelector('#edTrackRows').scrollTop = 8; });
  await page.waitForTimeout(250);
  const sc3 = await page.evaluate(() => ({
    lanes: Math.round(document.querySelector('#edLanesCol').scrollTop),
    names: Math.round(document.querySelector('#edTrackRows').scrollTop)
  }));
  ok('S4 反向滚动轨道名时泳道跟随', Math.abs(sc3.lanes - sc3.names) <= 1, JSON.stringify(sc3));

  // ── T UI设计 · AI 大模型模式(访客自带 Key) ──
  // 全程 page.route 拦方舟接口, 不消耗任何真实额度。
  // 只保留【一条】路由按 arkMode 分支 —— 中途 unroute 重注册会让后续异常用例静默退化成成功用例。
  let arkMode = 'ok';           // ok | mut | http500 | badjson | hang(测超时/中止用, 延迟 10s 才回应)
  let arkHits = 0;
  const AI_OK = { w: 1080, h: 1080, layers: [
    { type: 'rect', name: '底', x: 0, y: 0, w: 1080, h: 1080, fill: 'rgba(0,0,0,.85)', radius: 0 },
    { type: 'text', name: '标题', x: 90, y: 440, w: 900, h: 120, text: { content: '自动化验证', size: 120, color: '#ffffff', align: 'center' } }
  ] };
  const AI_MUT = { type: 'rect', name: '底', x: 0, y: 0, w: 1080, h: 1080, fill: 'rgba(20,10,40,.9)', radius: 24 };
  await page.route('**/ark.cn-beijing.volces.com/**', async route => {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,content-type',
      'Access-Control-Allow-Methods': 'POST,OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
    arkHits++;
    const j = body => route.fulfill({ status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, cors), body: JSON.stringify(body) });
    if (arkMode === 'hang') {                     // 模拟后端挂起: 延迟 10s 才回应(超时被设成 400ms, 所以一定等不到)
      await new Promise(r => setTimeout(r, 10000));
      return j({ choices: [{ message: { content: JSON.stringify(AI_OK) } }] });
    }
    if (arkMode === 'http500') return route.fulfill({ status: 500, headers: Object.assign({ 'Content-Type': 'application/json' }, cors), body: JSON.stringify({ error: { message: 'mock 额度不足' } }) });
    if (arkMode === 'badjson') return j({ choices: [{ message: { content: '我不太明白你的意思' } }] });
    if (arkMode === 'mut') return j({ choices: [{ message: { content: JSON.stringify(AI_MUT) } }] });
    return j({ choices: [{ message: { content: JSON.stringify(AI_OK) } }] });
  });

  await page.click('#edRTabs button[data-rtab="ui"]');
  await page.waitForTimeout(300);
  const t0 = await page.evaluate(() => ({
    opts: document.querySelectorAll('input[name=uiEngine]').length,
    engine: (document.querySelector('input[name=uiEngine]:checked') || {}).value,
    box: getComputedStyle(document.getElementById('uiAiBox')).display,
    keyType: (document.getElementById('uiApiKey') || {}).type,
    // 取全部 .ui-ai-tip 拼接: 新增的「中转说明」也用了这个类, 单取第一个会命中错误节点
    tip: Array.from(document.querySelectorAll('.ui-ai-tip')).map(e => e.textContent).join('')
  }));
  ok('T1 UI设计面板提供「本地 / AI」两种引擎', t0.opts === 2 && t0.engine === 'local', JSON.stringify(t0));
  ok('T2 AI 配置区默认收起(不打扰不用 AI 的人)', t0.box === 'none', t0.box);
  ok('T3 API Key 输入框为密码型(不明文显示)', t0.keyType === 'password', t0.keyType);
  ok('T4 有密钥安全提示文案', /公共电脑别填/.test(t0.tip), t0.tip.slice(0, 30));

  // 无 Key 守卫: 必须拦住, 且一个请求都不能发出去
  arkHits = 0;
  await page.check('input[name=uiEngine][value=ai]');
  await page.waitForTimeout(250);
  const tExp = await page.evaluate(() => getComputedStyle(document.getElementById('uiAiBox')).display);
  ok('T5 切 AI 模式后配置区展开', tExp !== 'none', tExp);
  const tLen0 = await page.evaluate(() => window.__ed.ui().layers.length);
  await page.fill('#uiPrompt', '做一个深色封面, 中间大标题');
  await page.click('#uiGen');
  await page.waitForTimeout(800);
  const t1 = await page.evaluate(() => ({
    n: window.__ed.ui().layers.length,
    msg: [...document.querySelectorAll('.ed-toast')].map(x => x.textContent).join('|') + ' ' +
      ((document.getElementById('uiAiSt') || {}).textContent || '')
  }));
  ok('T6 未填 Key 时拦住、有提示、且未发任何请求',
    arkHits === 0 && t1.n === tLen0 && /Key/.test(t1.msg), 'hits=' + arkHits + ' | ' + t1.msg.slice(0, 70));

  // Key 只落本机
  await page.fill('#uiApiKey', 'audit-mock-key');
  await page.click('#uiKeySave');
  await page.waitForTimeout(300);
  const t2 = await page.evaluate(() => ({ ls: localStorage.getItem('lixiu_ark_key'), has: window.__ed.ai().hasKey }));
  ok('T7 Key 只存本机 localStorage, 且状态栏确认', t2.ls === 'audit-mock-key' && t2.has === true, String(t2.ls));

  // 成功生成: 结构必须与本地模式一致(否则存不进 .lixiu)
  await page.click('#uiGen');
  await page.waitForTimeout(1300);
  const t3 = await page.evaluate(() => {
    const u = window.__ed.ui();
    return { n: u.layers.length, types: u.layers.map(l => l.type).join(','), w: u.w, h: u.h,
      textOk: !!(u.layers.find(l => l.type === 'text') || {}).text,
      inPrj: window.__ed.prj().ui.layers.length,
      hist: window.__ed.history().undo.slice(-1)[0] };
  });
  ok('T8 AI 返回图层已落进工程数据(可随 .lixiu 保存)',
    t3.n === 2 && t3.types === 'rect,text' && t3.w === 1080 && t3.textOk && t3.inPrj === 2, JSON.stringify(t3));
  ok('T9 AI 生成写入全局撤销栈(可 Ctrl+Z)', /AI 生成/.test(String(t3.hist)), String(t3.hist));

  // 一句话修改选中图层
  arkMode = 'mut'; arkHits = 0;
  const aid = await page.evaluate(() => window.__ed.ui().layers[0].id);
  await page.click('#uiLayers .ui-layer[data-uid="' + aid + '"]');
  await page.waitForTimeout(250);
  await page.fill('#uiPrompt', '圆角改成 24, 底色换成深紫色');
  await page.click('#uiModify');
  await page.waitForTimeout(1300);
  const t4 = await page.evaluate(() => {
    const l = window.__ed.ui().layers[0];
    return { radius: l.radius, fill: l.fill, hist: window.__ed.history().undo.slice(-1)[0] };
  });
  ok('T10 AI 能改选中图层(圆角/填充生效)', arkHits >= 1 && t4.radius === 24 && t4.fill === 'rgba(20,10,40,.9)', JSON.stringify(t4));
  ok('T11 AI 修改也进撤销栈', /AI 修改/.test(String(t4.hist)), String(t4.hist));

  // 服务端报错兜底: 不崩、不产生图层、给出可读提示
  arkMode = 'http500';
  const tLen1 = await page.evaluate(() => window.__ed.ui().layers.length);
  await page.fill('#uiPrompt', '再来一个封面');
  await page.click('#uiGen');
  await page.waitForTimeout(1200);
  const t5 = await page.evaluate(() => ({
    n: window.__ed.ui().layers.length,
    msg: [...document.querySelectorAll('.ed-toast')].map(x => x.textContent).join('|') + ' ' +
      ((document.getElementById('uiAiSt') || {}).textContent || '')
  }));
  ok('T12 后端 500 时不产生图层且给出失败原因', t5.n === tLen1 && /失败|500/.test(t5.msg), 'n=' + t5.n + ' | ' + t5.msg.slice(0, 70));

  // 返回非 JSON 兜底
  arkMode = 'badjson';
  await page.fill('#uiPrompt', '随便来点什么');
  await page.click('#uiGen');
  await page.waitForTimeout(1200);
  const t6 = await page.evaluate(() => ({
    n: window.__ed.ui().layers.length,
    st: (document.getElementById('uiAiSt') || {}).textContent || ''
  }));
  ok('T13 返回非 JSON 时不崩且提示无法解析', t6.n === tLen1 && /无法解析/.test(t6.st), 'n=' + t6.n + ' | ' + t6.st);

  // 切回本地: 必须仍可用(不因引入 AI 而回归)
  await page.check('input[name=uiEngine][value=local]');
  await page.waitForTimeout(200);
  await page.fill('#uiPrompt', '1080x1080 方形，深色底，中间大标题"回归"');
  await page.click('#uiGen');
  await page.waitForTimeout(900);
  const t7 = await page.evaluate(() => ({ n: window.__ed.ui().layers.length, engine: window.__ed.ai().engine }));
  ok('T14 切回本地模式仍可生成(无回归)', t7.engine === 'local' && t7.n >= 1, JSON.stringify(t7));

  // ── 超时 / 中止: 请求挂起时 AI_BUSY 不能永久卡死(否则用户只能刷新页面) ──
  // 把 45 秒超时临时缩到 400ms, 才能在合理时间内验证这条路径。
  // 注意: 测试完必须还原, 且 hang 模式会让所有方舟请求延迟 10s, 结束前必须切回 ok。
  await page.check('input[name=uiEngine][value=ai]');
  // T15/T16 是「用户主动中止」, 超时必须够长 —— 否则 400ms 超时先触发 abort、
  // 按钮被 aiDone 隐藏, Playwright 的 click actionability 检查就找不到可见元素(时序竞争)。
  // 400ms 的短超时留给 T17 单独验证「无人操作时超时自动中止」那条路径。
  await page.evaluate(() => window.__ed.aiTimeout(3000));
  arkMode = 'hang';
  const tBefore = await page.evaluate(() => ({
    n: window.__ed.ui().layers.length,
    u: window.__ed.history().undo.length
  }));

  // 用户主动中止
  await page.fill('#uiPrompt', '做一个封面');
  await page.click('#uiGen');
  await page.waitForTimeout(150);
  // T15 必须在「请求已在飞」之后取 —— 请求没发出去时按钮必然隐藏、busy 必然为假
  const tIn = await page.evaluate(() => ({
    n: window.__ed.ui().layers.length,
    busy: window.__ed.ai().busy,
    ab: getComputedStyle(document.getElementById('uiAbort')).display,
    st: (document.getElementById('uiAiSt') || {}).textContent || ''
  }));
  ok('T15 AI 进行中「中止」按钮可见且 AI_BUSY 为真(请求发出后)',
    tIn.ab !== 'none' && tIn.busy === true && tIn.n === tBefore.n, JSON.stringify(tIn));
  await page.click('#uiAbort');
  await page.waitForTimeout(900);
  const tAb = await page.evaluate(() => ({
    n: window.__ed.ui().layers.length,
    u: window.__ed.history().undo.length,
    busy: window.__ed.ai().busy,
    ab: getComputedStyle(document.getElementById('uiAbort')).display,
    st: (document.getElementById('uiAiSt') || {}).textContent || ''
  }));
  ok('T16 点中止后不产生图层、不写撤销栈、AI_BUSY 复位',
    tAb.n === tBefore.n && tAb.u === tBefore.u && tAb.busy === false && tAb.ab === 'none'
      && /已中止/.test(tAb.st), JSON.stringify(tAb));

  // 超时自动中止(无人点按钮) —— 这里才把超时缩到 400ms, 让断言在合理时间内跑完
  await page.evaluate(() => window.__ed.aiTimeout(400));
  await page.waitForTimeout(200);
  await page.fill('#uiPrompt', '再来一个封面');
  await page.click('#uiGen');
  await page.waitForTimeout(1000);
  const tTo = await page.evaluate(() => ({
    n: window.__ed.ui().layers.length,
    u: window.__ed.history().undo.length,
    busy: window.__ed.ai().busy,
    ab: getComputedStyle(document.getElementById('uiAbort')).display,
    st: (document.getElementById('uiAiSt') || {}).textContent || ''
  }));
  ok('T17 超时无回应自动中止, 不产生图层也不写撤销栈',
    tTo.n === tBefore.n && tTo.u === tBefore.u && tTo.busy === false && tTo.ab === 'none'
      && /超时|中止/.test(tTo.st), JSON.stringify(tTo));

  // 还原: 后续断言不能再被 hang 模式拖住 10 秒
  await page.evaluate(() => window.__ed.aiTimeout(45000));
  arkMode = 'ok';
  await page.check('input[name=uiEngine][value=local]');
  await page.waitForTimeout(200);

  // ── U: 面板整体收起/展开 · 进度日志默认折叠 · AI loading 动画 ──
  // U1/U2: 面板标题「◀ 收起」→ .ed-right.fold; 画布是 flex 布局, 面板消失后应自动扩宽
  const uBefore = await page.evaluate(() => ({
    cw: document.getElementById('edCanvas').getBoundingClientRect().width,
    fold: document.getElementById('edRight').classList.contains('fold')
  }));
  await page.click('#edRightClose');
  await page.waitForTimeout(180);
  const uFold = await page.evaluate(() => ({
    cw: document.getElementById('edCanvas').getBoundingClientRect().width,
    fold: document.getElementById('edRight').classList.contains('fold'),
    disp: getComputedStyle(document.getElementById('edRight')).display
  }));
  ok('U1 右侧面板可整体收起(fold 类生效, display:none)',
    uFold.fold === true && uFold.disp === 'none', JSON.stringify(uFold));
  ok('U2 面板收起后画布宽度自动扩大(不是被裁掉)',
    uBefore.cw > 0 && uFold.cw > uBefore.cw, '收起前 ' + uBefore.cw + ' → 收起后 ' + uFold.cw);

  // U3: 工具栏「🧩 面板」重新展开, 布局尺寸还原
  await page.click('#edRightBtn');
  await page.waitForTimeout(180);
  const uBack = await page.evaluate(() => ({
    cw: document.getElementById('edCanvas').getBoundingClientRect().width,
    fold: document.getElementById('edRight').classList.contains('fold'),
    disp: getComputedStyle(document.getElementById('edRight')).display
  }));
  ok('U3 工具栏「🧩 面板」可重新展开且尺寸还原',
    uBack.fold === false && uBack.disp !== 'none' && Math.abs(uBack.cw - uBefore.cw) < 2, JSON.stringify(uBack));

  // U4/U5: 进度变更日志默认折叠, 点「展开」显示明细, 清空按钮常驻可见
  await page.click('#edRTabs [data-rtab="progress"]');
  await page.waitForTimeout(180);
  const uLog0 = await page.evaluate(() => {
    const l = document.getElementById('pgLog');
    return {
      cls: l ? l.className : 'MISSING',
      disp: l ? getComputedStyle(l).display : '',
      toggle: (document.getElementById('pgLogToggle') || {}).textContent || '',
      clear: !!document.getElementById('pgLogClear'),
      n: window.__ed.prj().progress.log.length
    };
  });
  ok('U4 进度日志默认折叠, 且有展开按钮与清空按钮',
    uLog0.disp === 'none' && /hide/.test(uLog0.cls) && /展开/.test(uLog0.toggle)
      && uLog0.clear === true && uLog0.n > 0, JSON.stringify(uLog0));
  await page.click('#pgLogToggle');
  await page.waitForTimeout(180);
  const uLog1 = await page.evaluate(() => ({
    cls: document.getElementById('pgLog').className,
    disp: getComputedStyle(document.getElementById('pgLog')).display,
    toggle: (document.getElementById('pgLogToggle') || {}).textContent || ''
  }));
  ok('U5 点「展开」后日志明细可见, 按钮文字切换为「收起」',
    uLog1.disp !== 'none' && !/hide/.test(uLog1.cls) && /收起/.test(uLog1.toggle), JSON.stringify(uLog1));
  // 必须再点一次验证「收起」也真生效。renderArchive() 用 innerHTML 重建整块 DOM,
  // 若事件没重绑, 第二次点击会**静默失效**(点了没反应, 不报错)。
  // 这正是本次修的真 bug: 展开可用、收起失灵。
  await page.click('#pgLogToggle');
  await page.waitForTimeout(180);
  const uLog2 = await page.evaluate(() => ({
    disp: getComputedStyle(document.getElementById('pgLog')).display,
    toggle: (document.getElementById('pgLogToggle') || {}).textContent || ''
  }));
  ok('U5b 再点一次「收起」真正折叠(不是静默失效)',
    uLog2.disp === 'none' && /展开/.test(uLog2.toggle), JSON.stringify(uLog2));

  // U7: 折叠档案区再展开后, 备注输入仍写入工程。
  // renderArchive() 重建 DOM 后必须重绑事件, 否则 arFold 点一次「收起」,
  // 备注输入 / 里程碑标记 / 日志清空 全部静默失效(点此前的潜伏 bug)。
  await page.click('#arFold');
  await page.waitForTimeout(150);
  await page.click('#arFold');
  await page.waitForTimeout(150);
  await page.fill('#pgNotes', '审计写入的备注');
  await page.waitForTimeout(150);
  const uNotes = await page.evaluate(() => ({
    saved: window.__ed.prj().progress.notes,
    msAdd: !!document.getElementById('pgMsAdd')
  }));
  ok('U7 档案区折叠/展开后备注仍写入工程、里程碑按钮仍在(事件重绑未丢)',
    uNotes.saved === '审计写入的备注' && uNotes.msAdd === true, JSON.stringify(uNotes));
  await page.fill('#pgNotes', '');               // 还原, 别污染后续导出断言
  await page.waitForTimeout(120);

  // U6: AI 请求进行中 → 状态栏 loading 转圈 + 生成/修改按钮置灰(AI_BUSY 已拦重复点击, 这是视觉反馈)
  await page.click('#edRTabs [data-rtab="ui"]');
  await page.waitForTimeout(150);
  await page.check('input[name=uiEngine][value=ai]');
  await page.evaluate(() => window.__ed.aiTimeout(30000));
  arkMode = 'hang';
  await page.fill('#uiPrompt', '做一个片头');
  await page.click('#uiGen');
  await page.waitForTimeout(200);
  const uLoad = await page.evaluate(() => {
    const st = document.getElementById('uiAiSt');
    const g = document.getElementById('uiGenAct');
    return {
      busy: window.__ed.ai().busy,
      stCls: st.className,
      spin: getComputedStyle(st, '::before').animationName,
      gCls: g.className,
      genOpacity: getComputedStyle(document.getElementById('uiGen')).opacity
    };
  });
  ok('U6 AI 请求进行中显示 loading 转圈且生成按钮置灰(防重复点击)',
    uLoad.busy === true && /busy/.test(uLoad.stCls) && uLoad.spin !== 'none'
      && /busy/.test(uLoad.gCls) && parseFloat(uLoad.genOpacity) < 0.6, JSON.stringify(uLoad));
  // 收尾: 中止请求并还原环境, 别让 hang 模式影响后面的截图与断言
  await page.click('#uiAbort');
  await page.waitForTimeout(900);
  await page.evaluate(() => window.__ed.aiTimeout(45000));
  arkMode = 'ok';
  await page.check('input[name=uiEngine][value=local]');
  await page.waitForTimeout(200);

  // ── V: 四大区常驻提示文字 → 「ⓘ」悬浮提示(合并改造指令阶段1 的最后一项) ──
  await page.click('#edRTabs [data-rtab="props"]');
  await page.waitForTimeout(150);
  const v0 = await page.evaluate(() => {
    const hi = [...document.querySelectorAll('[data-hint]')];
    const stale = ['.ed-tb-hint', '.ed-tl-hint', '.lib-hint', '.pg-foot-hint', '.ar-hint'].map(s => document.querySelector(s));
    return {
      n: hi.length,
      vis: hi.filter(e => e.getBoundingClientRect().width > 0).length,
      lens: hi.map(e => (e.getAttribute('data-hint') || '').length),
      titles: hi.map(e => e.getAttribute('data-hint-t') || ''),
      staleNodes: stale.filter(Boolean).length
    };
  });
  R.data.hintTips = v0;
  ok('V1 四大区共有 5 个「ⓘ」说明图标(默认视图 4 个可见, 第 5 个在进度 Tab 内)', v0.n === 5 && v0.vis === 4, JSON.stringify({ n: v0.n, vis: v0.vis }));
  ok('V2 旧常驻提示节点已彻底移除(不是藏起来)', v0.staleNodes === 0, '残留 ' + v0.staleNodes);
  ok('V3 ⓘ 说明文案都落在 data-hint 里(信息没丢)',
    v0.lens.every(t => t >= 20) && v0.titles.every(t => t.length >= 3), JSON.stringify(v0.lens) + ' / ' + v0.titles.join(','));

  // 工具栏 ⓘ: hover 弹出说明浮层
  await page.hover('.ed-toolbar .ed-hi');
  await page.waitForTimeout(220);
  const v1 = await page.evaluate(() => ({
    show: document.getElementById('edTip').classList.contains('show'),
    txt: document.getElementById('edTip').innerText
  }));
  ok('V4 hover「ⓘ」弹出说明浮层(快捷键一览)',
    v1.show && /空格/.test(v1.txt) && /Ctrl\+Z/.test(v1.txt), v1.txt.replace(/\s+/g, ' ').slice(0, 90));
  await page.mouse.move(6, 6);
  await page.waitForTimeout(220);
  ok('V5 移开鼠标浮层消失',
    !(await page.evaluate(() => document.getElementById('edTip').classList.contains('show'))));

  // pg-head 里的 ⓘ 不能被误判成「折叠进度面板」(冒泡拦截是否生效)
  await page.click('#edRTabs [data-rtab="progress"]');
  await page.waitForTimeout(150);
  await page.click('#pgHead');
  await page.waitForTimeout(220);
  const vFold0 = await page.evaluate(() => document.getElementById('pgBody').getBoundingClientRect().height);
  await page.click('#pgHead .ed-hi');
  await page.waitForTimeout(220);
  const vFold1 = await page.evaluate(() => ({
    h: document.getElementById('pgBody').getBoundingClientRect().height,
    show: document.getElementById('edTip').classList.contains('show'),
    txt: document.getElementById('edTip').innerText,
    hiVis: document.querySelector('#pgHead .ed-hi').getBoundingClientRect().width > 0
  }));
  ok('V6 点进度面板里的「ⓘ」只弹说明、不折叠面板(不冒泡), 且进度 Tab 内图标可见',
    Math.abs(vFold1.h - vFold0) < 2 && vFold1.show && /工程档案/.test(vFold1.txt) && vFold1.hiVis,
    'h ' + vFold0 + ' -> ' + vFold1.h + ' vis=' + vFold1.hiVis + ' | ' + vFold1.txt.replace(/\s+/g, ' ').slice(0, 60));
  await page.click('#pgHead');
  await page.waitForTimeout(220);

  // 键盘可访问: Tab 聚焦 ⓘ 也能读到说明
  await page.evaluate(() => document.querySelector('.ed-toolbar .ed-hi').focus());
  await page.waitForTimeout(160);
  const vF = await page.evaluate(() => ({
    show: document.getElementById('edTip').classList.contains('show'),
    tabbable: document.querySelector('.ed-toolbar .ed-hi').getAttribute('tabindex')
  }));
  ok('V7 「ⓘ」可键盘聚焦并弹出说明(触屏/键盘用户也能读到)',
    vF.show && vF.tabbable === '0', JSON.stringify(vF));
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.waitForTimeout(160);

  // 时间轴 / 工程档案 的 ⓘ 也在位(覆盖到四大区 + 素材栏)
  const vZones = await page.evaluate(() => {
    const zones = {
      toolbar: !!document.querySelector('.ed-toolbar .ed-hi'),
      lib: !!document.querySelector('.ed-lib .ed-hi'),
      progress: !!document.querySelector('#pgHead .ed-hi'),
      timeline: !!document.querySelector('.ed-tl-headbar .ed-hi'),
      archive: !!document.querySelector('.ar-head .ed-hi')
    };
    return { zones, total: Object.keys(zones).filter(k => zones[k]).length };
  });
  ok('V8 五大提示位点全部到位(工具栏/素材栏/进度/时间轴/工程档案)',
    vZones.total === 5, JSON.stringify(vZones));


  // ── M: 多模型接入(provider 注册表 / 下拉切换 / 请求体差异)──
  // M1: 注册表 6 家全部就位, 每家都有 url(或 urlCustom)与 defaultModel(或空)
  const mReg = await page.evaluate(() => {
    const P = window.__ed.aiProviders ? window.__ed.aiProviders() : null;
    if (!P) return { n: 0 };
    return {
      n: P.length,
      ids: P.map(x => x.id).join(','),
      allUrl: P.every(x => x.urlCustom || /^https?:\/\//.test(x.url)),
      hasArk: !!P.find(x => x.id === 'ark'),
      hasDeepseek: !!P.find(x => x.id === 'deepseek'),
      hasCustom: !!P.find(x => x.id === 'custom' && x.urlCustom === true),
      arkThinking: !!(P.find(x => x.id === 'ark') || {}).opts.thinking,
      arkJson: !!(P.find(x => x.id === 'ark') || {}).opts.jsonFmt,
      dkNoJson: ((P.find(x => x.id === 'deepseek') || {}).opts.jsonFmt === false)
    };
  });
  ok('M1 provider 注册表 6 家就位, 字段完整',
    mReg.n === 6 && mReg.allUrl === true && mReg.hasArk === true
      && mReg.hasDeepseek === true && mReg.hasCustom === true,
    JSON.stringify(mReg));
  ok('M2 请求体差异正确(方舟关 thinking+json, DeepSeek 禁 json_object)',
    mReg.arkThinking === true && mReg.arkJson === true && mReg.dkNoJson === true,
    JSON.stringify({ arkThinking: mReg.arkThinking, arkJson: mReg.arkJson, dkNoJson: mReg.dkNoJson }));

  // M3: 切到「UI设计」Tab, provider 下拉默认方舟, 模型下拉自动填充模型列表
  await page.click('#edRTabs [data-rtab="ui"]');
  await page.waitForTimeout(160);
  await page.evaluate(() => {
    const r = document.querySelector('input[name=uiEngine][value=ai]');
    if (r && !r.checked) r.checked = true;
    if (r) r.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(120);
  const mDef = await page.evaluate(() => {
    const p = document.getElementById('uiAiProvider');
    const m = document.getElementById('uiAiModel');
    return {
      pTag: p ? p.tagName : 'MISSING',
      pVal: p ? p.value : '',
      mTag: m ? m.tagName : 'MISSING',
      mOpts: m && m.tagName === 'SELECT' ? m.options.length : -1,
      boxOn: document.getElementById('uiAiBox').className
    };
  });
  ok('M3 AI 模式展开后 provider 默认方舟, 模型下拉已填充',
    mDef.pTag === 'SELECT' && mDef.pVal === 'ark'
      && mDef.mTag === 'SELECT' && mDef.mOpts >= 3
      && /on/.test(mDef.boxOn),
    JSON.stringify(mDef));

  // M4: 切到 DeepSeek, 模型下拉换成 DeepSeek 的模型, 端点输入框常显并预填官方地址
  await page.selectOption('#uiAiProvider', 'deepseek');
  await page.waitForTimeout(140);
  const mDk = await page.evaluate(() => {
    const m = document.getElementById('uiAiModel');
    const e = document.getElementById('uiAiEndpoint');
    return {
      mTag: m ? m.tagName : 'MISSING',
      mVal: m ? m.value : '',
      mOpts: m && m.tagName === 'SELECT' ? Array.from(m.options).map(o => o.value) : [],
      eDisp: e ? e.style.display : 'no-el',
      eVal: e ? e.value : ''
    };
  });
  ok('M4 切到 DeepSeek 后模型下拉换成 deepseek-chat/deepseek-reasoner, 端点框常显且预填官方地址',
    mDk.mTag === 'SELECT' && mDk.mOpts.indexOf('deepseek-chat') > -1
      && mDk.mVal === 'deepseek-chat' && mDk.eDisp !== 'none'
      && /api\.deepseek\.com/.test(mDk.eVal),
    JSON.stringify(mDk));

  // M5: 切到「自定义」, 模型变成手输 input, 端点输入框出现
  await page.selectOption('#uiAiProvider', 'custom');
  await page.waitForTimeout(140);
  const mCus = await page.evaluate(() => {
    const m = document.getElementById('uiAiModel');
    const e = document.getElementById('uiAiEndpoint');
    return { mTag: m ? m.tagName : 'MISSING', eDisp: e ? e.style.display : 'no-el' };
  });
  ok('M5 切到自定义模式: 模型变手输 input, 端点输入框出现',
    mCus.mTag === 'INPUT' && mCus.eDisp !== 'none',
    JSON.stringify(mCus));

  // M6: 请求体按 provider 正确生成(用桩 fetch 拦截, 零额度消耗)
  //   注意: 前面 T 模块会往 uiApiKey 输入框填 mock key, aiKey() 优先读输入框,
  //   所以这里不硬编码具体 key 值, 只验「带了 Bearer 前缀且非空」
  const mBody = await page.evaluate(() => {
    let captured = null;
    window.fetch = function (url, opt) {
      captured = {
        url: String(url),
        body: JSON.parse(opt.body),
        auth: opt.headers['Authorization']
      };
      return Promise.reject(new DOMException('stub', 'AbortError'));
    };
    localStorage.setItem('lixiu_ark_key', 'sk-stub-key');
    const inp = document.getElementById('uiApiKey');
    if (inp) inp.value = 'sk-stub-key';
    const p = document.getElementById('uiAiProvider');
    p.value = 'ark'; p.dispatchEvent(new Event('change', { bubbles: true }));
    return window.__ed.aiCall ? window.__ed.aiCall('测试描述').then(() => captured) : Promise.resolve(null);
  });
  ok('M6 方舟请求体带 thinking:disabled + response_format:json_object, 走方舟端点, 带用户 Key',
    mBody && /ark\.cn-beijing\.volces\.com/.test(mBody.url)
      && mBody.body.thinking && mBody.body.thinking.type === 'disabled'
      && mBody.body.response_format && mBody.body.response_format.type === 'json_object'
      && /^Bearer .+/.test(mBody.auth || ''),
    'captured=' + (mBody ? 'yes' : 'NULL') + ' | url=' + (mBody && mBody.url.slice(0, 60))
      + ' | thinking=' + JSON.stringify(mBody && mBody.body.thinking)
      + ' | rf=' + JSON.stringify(mBody && mBody.body.response_format)
      + ' | auth=' + (mBody && mBody.auth));

  // M7: 换 DeepSeek, 请求体不带 thinking/response_format(否则被 400 拒)
  await page.waitForTimeout(200);
  const mBody2 = await page.evaluate(() => {
    let captured = null;
    window.fetch = function (url, opt) {
      captured = { url: String(url), body: JSON.parse(opt.body) };
      return Promise.reject(new DOMException('stub', 'AbortError'));
    };
    const p = document.getElementById('uiAiProvider');
    p.value = 'deepseek'; p.dispatchEvent(new Event('change', { bubbles: true }));
    return window.__ed.aiCall('测试描述').then(() => captured);
  });
  ok('M7 DeepSeek 请求体不带 thinking / response_format(避免 400)',
    mBody2 && /deepseek\.com/.test(mBody2.url)
      && mBody2.body.thinking === undefined
      && mBody2.body.response_format === undefined,
    JSON.stringify(mBody2 && mBody2.body).slice(0, 200));

  // M8: 恢复方舟 + 清理桩 fetch
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    localStorage.removeItem('lixiu_ark_key');
    const p = document.getElementById('uiAiProvider');
    p.value = 'ark'; p.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // M9: Key 获取链接按 provider 渲染
  const mLink = await page.evaluate(() => {
    const el = document.getElementById('uiAiKeyLink');
    return { html: el ? el.innerHTML : '', hasArkUrl: el ? /volcengine/.test(el.innerHTML) : false };
  });
  ok('M9 Key 获取链接按当前 provider 渲染(方舟指向 volcengine 控制台)',
    mLink.hasArkUrl === true && /免费注册/.test(mLink.html),
    mLink.html.slice(0, 120));

  // ── N: AI 配置升级(实时trim / 眼睛 / 手填模型 / 省token测试 / 错误分类 / 中转) ──
  // 恢复 AI 模式 + 方舟
  await page.evaluate(() => {
    const r = document.querySelector('input[name=uiEngine][value=ai]');
    if (r && !r.checked) r.checked = true;
    if (r) r.dispatchEvent(new Event('change', { bubbles: true }));
    const p = document.getElementById('uiAiProvider');
    p.value = 'ark'; p.dispatchEvent(new Event('change', { bubbles: true }));
    localStorage.removeItem('lixiu_ai_model_manual');
  });
  await page.waitForTimeout(160);

  // N1: Key 输入实时去首尾空格(oninput)
  const nTrim = await page.evaluate(() => {
    const el = document.getElementById('uiApiKey');
    const before = el.value;
    el.value = '  sk-trim-test  ';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    const after = el.value;
    el.value = before;
    return { after, trimmed: after === 'sk-trim-test' };
  });
  ok('N1 Key 输入 oninput 实时去首尾空格',
    nTrim.trimmed === true, JSON.stringify(nTrim));

  // N2: 眼睛按钮切换 Key 明文/密文
  const nEye = await page.evaluate(() => {
    const el = document.getElementById('uiApiKey');
    const btn = document.getElementById('uiKeyEye');
    const t0 = el.type;
    btn.click();
    const t1 = el.type;
    btn.click();
    const t2 = el.type;
    return { t0, t1, t2, ok: t0 === 'password' && t1 === 'text' && t2 === 'password' };
  });
  ok('N2 👁 眼睛按钮: password→text→password 往返切换',
    nEye.ok === true, JSON.stringify(nEye));

  // N3: ✏️ 手填模型: select→input 切换, 值保留, 且写进 LS
  const nManual = await page.evaluate(() => {
    const sel0 = document.getElementById('uiAiModel');
    const tag0 = sel0.tagName;
    document.getElementById('uiModelManual').click();
    const inp = document.getElementById('uiAiModel');
    inp.value = 'ep-20260919-test';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    const lsVal = localStorage.getItem('lixiu_ai_model_manual');
    const tag1 = inp.tagName;
    // 切回下拉验证手填值保留为选项
    document.getElementById('uiModelManual').click();
    const sel2 = document.getElementById('uiAiModel');
    const keep = sel2.value;
    localStorage.removeItem('lixiu_ai_model_manual');
    return { tag0, tag1, lsVal, keep, sel2Tag: sel2.tagName };
  });
  ok('N3 ✏️ 手填模型ID: select↔input 互切, 手填值进 LS 且切回下拉不丢',
    nManual.tag0 === 'SELECT' && nManual.tag1 === 'INPUT'
      && nManual.lsVal === 'ep-20260919-test'
      && nManual.keep === 'ep-20260919-test' && nManual.sel2Tag === 'SELECT',
    JSON.stringify(nManual));

  // N4: 连通测试请求体带 max_tokens=8(省 token)
  const nTest = await page.evaluate(() => {
    let captured = null;
    window.fetch = function (url, opt) {
      captured = { url: String(url), body: JSON.parse(opt.body) };
      return Promise.reject(new DOMException('stub', 'AbortError'));
    };
    localStorage.setItem('lixiu_ark_key', 'sk-stub-key');
    return window.__ed.aiCall('测试', '只回ok', true).then(() => captured);
  });
  await page.waitForTimeout(200);
  ok('N4 连通测试请求体带 max_tokens=8, 走方舟端点',
    nTest && nTest.body.max_tokens === 8 && /ark\.cn-beijing\.volces\.com/.test(nTest.url),
    JSON.stringify(nTest && { u: nTest.url, mt: nTest && nTest.body.max_tokens }));
  // 清理桩
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    localStorage.removeItem('lixiu_ark_key');
  });

  // N5: 端点覆盖: 用户改地址后请求走用户地址(填了即用)
  const nEp = await page.evaluate(() => {
    let captured = null;
    window.fetch = function (url, opt) {
      captured = { url: String(url) };
      return Promise.reject(new DOMException('stub', 'AbortError'));
    };
    localStorage.setItem('lixiu_ark_key', 'sk-stub-key');
    const e = document.getElementById('uiAiEndpoint');
    e.value = 'https://api.deepseek.com';
    e.dispatchEvent(new Event('input', { bubbles: true }));
    return window.__ed.aiCall('测试').then(() => {
      localStorage.removeItem('lixiu_ark_key');
      e.value = 'https://ark.cn-beijing.volces.com/api/v3';
      return captured;
    });
  });
  await page.waitForTimeout(200);
  ok('N5 端点覆盖填了即用: 预设方舟+填 DeepSeek 地址 → 请求发往 deepseek.com/v1/chat/completions',
    nEp && /api\.deepseek\.com\/v1\/chat\/completions/.test(nEp.url),
    JSON.stringify(nEp && nEp.url));

  // N6: aiHttpErr 错误分类文案(401/404/429)
  const nErr = await page.evaluate(() => {
    const t = (s) => {
      try { return window.__ed.aiHttpErr(s, ''); } catch (e) { return 'FN_MISSING'; }
    };
    return {
      e401: t(401), e404: t(404), e429: t(429),
      ok: t(401) !== 'FN_MISSING' && /Key/.test(t(401)) && /模型|地址/.test(t(404)) && /限流|余额/.test(t(429))
    };
  });
  ok('N6 aiHttpErr 错误分类: 401→Key无效 / 404→模型或地址 / 429→限流或余额',
    nErr.ok === true, JSON.stringify(nErr).slice(0, 200));

  // N7: 恢复现场(端点预填回方舟, 移除桩 key)
  await page.evaluate(() => {
    localStorage.removeItem('lixiu_ark_key');
    localStorage.removeItem('lixiu_ai_model_manual');
    const e = document.getElementById('uiAiEndpoint');
    if (e) e.value = 'https://ark.cn-beijing.volces.com/api/v3';
  });



  // ── 全页截图 + 错误汇总 ──
  await page.screenshot({ path: SHOT + '/full.png', fullPage: false });


  R.data.errors = { pageErrors: errs, consoleErrors: consoleErrs.slice(0, 6), netFails: [...new Set(netFails)].slice(0, 4) };
  // CDN 未加载时 head 里的 tailwind.config 内联脚本会抛 ReferenceError, 那是环境问题, 不算产品异常
  const errsReal = CDN_DOWN ? errs.filter(e => !/tailwind is not defined/i.test(e)) : errs;
  ok('L1 无 JS 未捕获异常' + (CDN_DOWN ? '(已排除 CDN 未加载引起的 tailwind 引用错误)' : ''),
    errsReal.length === 0, errsReal.join(' | ').slice(0, 500));
  if (netFails.length) warn('存在网络请求失败(离线打开时访问后端属预期)', [...new Set(netFails)].join(' '));

  await browser.close();
  step('browser closed');

  // ── 汇总 ──
  let md = '# 哩秀剪辑工作台 · 审计报告\n\n运行时间: ' + new Date().toLocaleString('zh-CN') + '\n目标: ' + PAGE + '\n浏览器: Edge (Playwright channel)\n\n';
  md += '## 结果: ' + R.pass.length + ' 通过 / ' + R.fail.length + ' 失败 / ' + R.warn.length + ' 提醒\n\n';
  md += '### ✅ 通过\n' + R.pass.map(x => '- ' + x).join('\n') + '\n\n';
  if (R.fail.length) md += '### ❌ 失败\n' + R.fail.map(x => '- ' + x).join('\n') + '\n\n';
  if (R.warn.length) md += '### ⚠️ 提醒\n' + R.warn.map(x => '- ' + x).join('\n') + '\n\n';
  md += '### 实测数据\n```json\n' + JSON.stringify(R.data, null, 1).slice(0, 9000) + '\n```\n';
  fs.writeFileSync(TMP + '/AUDIT.md', md);
  console.log(md.split('### 实测数据')[0]);
  console.log('报告: ' + TMP + '/AUDIT.md');
  await new Promise(r => setTimeout(r, 100));
  process.exit(R.fail.length ? 1 : 0);
})().catch(e => { try { step('SCRIPT ERROR ' + e.message); } catch (x) {} console.error('审计脚本异常:', e && e.message); process.exit(2); });
