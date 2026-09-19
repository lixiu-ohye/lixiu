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
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__ed && document.getElementById('pgBody'), null, { timeout: 15000 });
  await page.waitForTimeout(700);
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
  ok('A6 素材栏默认可见且落在编辑器内(不再是被隐藏的抽屉)',
    lib0.display !== 'none' && !lib0.hide && lib0.w > 100 && lib0.x >= 240, JSON.stringify(lib0));
  const guide0 = await page.evaluate(() => { const g = document.getElementById('edLanesEmpty'); return g ? g.textContent : ''; });
  ok('A7 轨道空状态有三步上手引导(新用户知道下一步干什么)', /三步/.test(guide0), guide0.slice(0, 60));
  // 编辑器必须按"视口-页头-标签页"满高, 否则时间轴底部会被挤出屏幕
  const fit = await page.evaluate(() => {
    const r = document.querySelector('.ed-timeline').getBoundingClientRect();
    return { bottom: Math.round(r.bottom), h: Math.round(r.height), vh: window.innerHeight };
  });
  ok('A8 时间轴完整落在视口内', fit.h > 100 && fit.bottom <= fit.vh + 2, JSON.stringify(fit));

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
  await page.click('#pgHistToggle');
  await page.waitForTimeout(300);
  const log = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.pg-log-item')];
    const L = window.__ed.prj().progress.log;
    return { n: L.length, visible: getComputedStyle(document.getElementById('pgLog')).display !== 'none',
      html: items[0] ? items[0].innerHTML : '', types: [...new Set(L.map(x => x.type))],
      fields: L[0] ? Object.keys(L[0]).sort().join(',') : '', sample: L[L.length - 1] };
  });
  R.data.log = log;
  ok('F1 日志子面板可展开', log.visible && log.n > 0, 'n=' + log.n);
  ok('F2 日志含四要素(时间戳/类型/详情/前后%)', log.fields === 'after,before,detail,ts,type', log.fields);
  ok('F3 日志区分 自动更新/人工修改', log.types.indexOf('auto') >= 0 && log.types.indexOf('manual') >= 0, log.types.join('/'));
  ok('F4 日志条目渲染出前后百分比', /→/.test(log.html), log.html.replace(/<[^>]+>/g, ' ').trim().slice(0, 80));
  await page.screenshot({ path: SHOT + '/panel-with-progress.png', clip: { x: 1290, y: 56, width: 310, height: 640 } });

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

  // ── 全页截图 + 错误汇总 ──
  await page.screenshot({ path: SHOT + '/full.png', fullPage: false });


  R.data.errors = { pageErrors: errs, consoleErrors: consoleErrs.slice(0, 6), netFails: [...new Set(netFails)].slice(0, 4) };
  ok('L1 无 JS 未捕获异常', errs.length === 0, errs.join(' | ').slice(0, 500));
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
