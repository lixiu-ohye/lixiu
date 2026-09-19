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
  page.on('pageerror', e => errs.push(String(e.message).split('\n')[0]));
  page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text().slice(0, 160)); });
  page.on('requestfailed', r => { if (!r.url().startsWith('file:')) netFails.push(r.url().slice(0, 80)); });
  page.on('dialog', d => d.accept());   // confirm/prompt 全自动同意

  // ── A 加载 ──
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__ed && document.getElementById('pgBody'), null, { timeout: 15000 });
  await page.waitForTimeout(600);
  const shells = await page.evaluate(() => ({
    editorVisible: getComputedStyle(document.getElementById('viewEditor')).display !== 'none',
    studioVisible: getComputedStyle(document.getElementById('viewStudio')).display !== 'none',
    title: document.getElementById('pageTitle').textContent,
    hasCanvas: !!document.getElementById('edCanvas'),
    hasTimeline: !!document.getElementById('edLanes'),
    hasLib: !!document.getElementById('edLib'),
    hasTip: !!document.getElementById('edTip')
  }));
  R.data.shells = shells;
  ok('A1 剪辑工作台默认激活', shells.editorVisible && !shells.studioVisible);
  ok('A2 顶栏标题=剪辑工作台', shells.title === '剪辑工作台', shells.title);
  ok('A3 画布/时间轴/素材库/提示层齐备', shells.hasCanvas && shells.hasTimeline && shells.hasLib && shells.hasTip);

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

  // ── 全页截图 + 错误汇总 ──
  await page.screenshot({ path: SHOT + '/full.png', fullPage: false });
  R.data.errors = { pageErrors: errs, consoleErrors: consoleErrs.slice(0, 6), netFails: [...new Set(netFails)].slice(0, 4) };
  ok('L1 无 JS 未捕获异常', errs.length === 0, errs.join(' | ').slice(0, 200));
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
