/* ═══════════ 【剪辑工作台】编辑器 JS(数据模型/时间轴/画布/字幕/工程IO/快捷键) ═══════════
   架构: 单文件编辑器, 零依赖, 数据模型 PRJ 与 DOM 分离
   视图切换由壳层 nav() 驱动: viewEditor / viewStudio
*/
(function () {
'use strict';

// ── 数据模型 ─────────────────────────────────────────────
// 素材库: {id, name, type: video|image|audio, url(ObjectURL), el(video/img), w, h, dur, missing}
// 工程: PRJ = {name, canvas:{w,h}, fps, duration, tracks:[], materials:[refs], markers:[],
//              stats:{cuts,previewed,exported}, progress:{items,notes,milestones,log}}
// 轨道: {id, kind: video|subtitle|audio, locked, muted, clips:[]}
// 片段: {id, matId, t0, t1, in/out(素材内), subtitle:{...}, kf:[...], fx:{...}, ui:{img,w,h}}
var PRJ = blankProject();
var MATS = [];                     // 素材池(会话级, ObjectURL 不入工程)
var sel = { clip: null, track: null };   // 当前选中
var UI_SEL = null;                 // 【UI设计】当前选中图层 id(会话级, 不入工程)
var cur = 0;                       // 播放头时间(秒)
var playing = false;
var PPS = 60;                      // 每秒像素(时间轴缩放)
var UID = 1; function uid(p) { return (p || 'c') + '_' + Date.now().toString(36) + '_' + (UID++); }

function blankProject() {
  return {
    name: '', canvas: { w: 1280, h: 720 }, fps: 30, duration: 10,   // 工程名允许留空(输入框显示占位提示)
    tracks: [
      { id: 'sub1', kind: 'subtitle', locked: false, muted: false, clips: [] },
      { id: 'v1', kind: 'video', locked: false, muted: false, clips: [] },
      { id: 'a1', kind: 'audio', locked: false, muted: false, clips: [] }
    ],
    materials: [], markers: [],
    // 【半自动智能进度模块】工程内持久化数据(随 .lixiu 读写)
    stats: freshStats(),      // 单调累计的行为事实: 分割次数 / 是否预览全片 / 是否导出过工程
    progress: freshProgress(), // 任务勾选明细 + 人工锁定 + 备注 + 里程碑 + 进度日志
    // 【UI设计模块】工程内持久化数据(随 .lixiu 读写)
    ui: freshUI()
  };
}
function freshStats() { return { cuts: 0, previewed: false, exported: false }; }
function freshProgress() { return { items: {}, notes: '', milestones: [], log: [] }; }
// 【UI设计模块】画布配置 + 图层 + 生成/修改历史
//  图层类型: rect(矩形) / text(文本) / image(图片) / button(按钮) / card(卡片容器) / icon(图标)
//  图层字段: id,name,type,x,y,w,h,radius,fill,stroke,strokeW,shadow{on,blur,x,y,color},opacity,visible,locked
//            text:{content,size,weight,color,align,font,lineHeight}   icon:{shape}
function freshUI() {
  return {
    w: 1080, h: 1080,          // 画布尺寸(自定义)
    bg: 'transparent',         // 画布底色(导出 PNG 用, 设计态显示棋盘格)
    grid: 8, snap: true, showGrid: true,   // 网格吸附 / 网格与参考线显示
    layers: [],                // 图层栈: 数组末位 = 视觉最上层
    history: []                // 生成/修改历史(随 .lixiu 持久化; 与撤销栈无关)
  };
}
// 兼容旧版 .lixiu(缺 ui 字段)与半截数据: 字段缺失补默认, 不覆盖已有值
function ensureUI() {
  if (!PRJ.ui) PRJ.ui = freshUI();
  var u = PRJ.ui, d = freshUI();
  Object.keys(d).forEach(function (k) { if (u[k] == null) u[k] = d[k]; });
  if (!Array.isArray(u.layers)) u.layers = [];
  if (!Array.isArray(u.history)) u.history = [];
  return u;
}
function uiFind(id) { var u = ensureUI(); return u.layers.find(function (l) { return l.id === id; }) || null; }
// 兼容旧版 .lixiu(缺 progress/stats 字段) 与半截数据
function ensureProgress() {
  if (!PRJ.stats) PRJ.stats = freshStats();
  if (!PRJ.progress) PRJ.progress = freshProgress();
  var p = PRJ.progress;
  if (!p.items) p.items = {};
  if (typeof p.notes !== 'string') p.notes = '';
  if (!p.milestones) p.milestones = [];
  if (!p.log) p.log = [];
}

// ── 工具函数 ─────────────────────────────────────────────
function fmt(t) { var m = Math.floor(t / 60), s = t - m * 60; return (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s.toFixed(1) : s.toFixed(1)); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function eachClip(fn) { PRJ.tracks.forEach(function (tr) { tr.clips.forEach(function (c) { fn(c, tr); }); }); }
function findClip(id) { var r = null; eachClip(function (c, tr) { if (c.id === id) r = { clip: c, track: tr }; }); return r; }
function toast(msg, ms) {
  // 同一坐标只留一条: 否则连续两条提示会重叠糊在一起(实测截图发现)
  var old = document.querySelectorAll('.ed-toast');
  Array.prototype.forEach.call(old, function (o) { o.remove(); });
  var t = document.createElement('div'); t.className = 'ed-toast'; t.textContent = msg;
  document.body.appendChild(t);
  // 【定位】顶部这一排控件(创作台标签页 / 编辑器工具栏)高度会随窗口宽度换行变化,
  // 写死 top 会盖住按钮(实测截图里「📁 另存为」被提示条压掉一半)。
  // 所以量它们此刻的真实底边, 把提示条放到最下面那一条之下。
  var y = 0;
  var tabs = document.getElementById('cbTabs');
  if (tabs && tabs.getBoundingClientRect().height > 1) y = Math.max(y, tabs.getBoundingClientRect().bottom);
  var tb = document.querySelector('.ed-toolbar');
  if (tb && tb.getBoundingClientRect().height > 1) y = Math.max(y, tb.getBoundingClientRect().bottom);
  if (y > 0) t.style.top = Math.round(y + 10) + 'px';
  setTimeout(function () { t.remove(); }, ms || 2200);
}
function $id(x) { return document.getElementById(x); }

// ═══════════ 【全局统一撤销栈】剪辑时间轴 + UI设计 共用同一套 ═══════════
// 对齐需求:
//  · 每次操作只存「操作前后快照 + 操作名」; 栈只在内存里, 绝不写进 .lixiu
//  · 上限 20 步, 超出丢最旧的
//  · 新建 / 导入工程时清空
//  · 撤销/重做按钮 hover 显示即将操作的名称
var HISTORY = {
  undo: [], redo: [], MAX: 20,
  clear: function () { this.undo.length = 0; this.redo.length = 0; updateUndoBtns(); }
};
// 入栈时机: 修改数据「之前」调用 → 栈里存的是该操作的「前」快照;
// 执行撤销时当前状态即该操作的「后」快照, 一并压进重做栈 → 前后快照成对。
function pushUndo(name) {
  HISTORY.undo.push({ name: name || '编辑操作', snap: snapshot(), at: Date.now() });
  if (HISTORY.undo.length > HISTORY.MAX) HISTORY.undo.shift();
  HISTORY.redo.length = 0;                    // 新操作产生 → 重做链断开
  updateUndoBtns();
}
function snapshot() { return JSON.stringify({ prj: PRJ, mats: PRJ.materials }); }
// 用于「已知操作前快照」的场景(拖拽/连续输入): 手势或聚焦开始时存一份快照, 结束时若真的
// 有变化才入栈 —— 这样不会产生一堆空操作的撤销记录
function pushUndoSnap(name, snap) {
  HISTORY.undo.push({ name: name || '编辑操作', snap: snap, at: Date.now() });
  if (HISTORY.undo.length > HISTORY.MAX) HISTORY.undo.shift();
  HISTORY.redo.length = 0;
  updateUndoBtns();
}
function restore(s) {
  var o = JSON.parse(s);
  PRJ = o.prj;
  MATS.forEach(function (m) { var hit = PRJ.materials.find(function (x) { return x.id === m.id; }); if (hit) hit._live = m; });
  sel.clip = null;
  ensureUI();                                  // 快照可能来自旧版数据, 兜底补 ui 字段
  if (UI_SEL && !uiFind(UI_SEL)) UI_SEL = null;
  renderAll();
}
function undo() {
  if (!HISTORY.undo.length) return toast('没有可撤销的操作');
  var it = HISTORY.undo.pop();
  HISTORY.redo.push({ name: it.name, snap: snapshot(), at: Date.now() });   // 当前状态 = 该操作的「后」快照
  restore(it.snap); updateUndoBtns(); toast('已撤销: ' + it.name);
}
function redo() {
  if (!HISTORY.redo.length) return toast('没有可重做的操作');
  var it = HISTORY.redo.pop();
  HISTORY.undo.push({ name: it.name, snap: snapshot(), at: Date.now() });
  restore(it.snap); updateUndoBtns(); toast('已重做: ' + it.name);
}
function updateUndoBtns() {
  var u = $id('edUndo'), r = $id('edRedo');
  if (u) {
    u.disabled = !HISTORY.undo.length;
    u.title = HISTORY.undo.length ? '撤销「' + HISTORY.undo[HISTORY.undo.length - 1].name + '」(Ctrl+Z) · ' + HISTORY.undo.length + '/' + HISTORY.MAX : '没有可撤销的操作';
  }
  if (r) {
    r.disabled = !HISTORY.redo.length;
    r.title = HISTORY.redo.length ? '重做「' + HISTORY.redo[HISTORY.redo.length - 1].name + '」(Ctrl+Y) · ' + HISTORY.redo.length + '/' + HISTORY.MAX : '没有可重做的操作';
  }
}

// ── 素材库 ───────────────────────────────────────────────
function addMaterial(file) {
  var url = URL.createObjectURL(file);
  var type = file.type.indexOf('video') === 0 ? 'video' : file.type.indexOf('audio') === 0 ? 'audio' : 'image';
  var m = { id: uid('m'), name: file.name, type: type, url: url, missing: false };
  MATS.push(m);
  // 工程引用表(仅记元数据, 不嵌素材本体; 导入后按名字找回)
  PRJ.materials.push({ id: m.id, name: m.name, type: m.type });
  if (type === 'video' || type === 'audio') {
    var v = document.createElement(type === 'video' ? 'video' : 'audio');
    v.preload = 'metadata'; v.src = url; m.el = v;
    v.onloadedmetadata = function () { m.dur = v.duration; m.w = v.videoWidth || 0; m.h = v.videoHeight || 0; renderMatList(); };
  } else {
    var im = new Image(); im.onload = function () { m.w = im.naturalWidth; m.h = im.naturalHeight; m.el = im; renderMatList(); }; im.src = url;
  }
  renderMatList();
  return m;
}

function renderMatList() {
  var box = $id('edMatList'); if (!box) return;
  if (!MATS.length) {
    box.innerHTML = '<div class="ed-guide">'
      + '<div class="row"><span class="st">1</span>还没有素材</div>'
      + '<div style="color:#8a7f66">点上面「＋ 上传素材」选视频/图片/音乐</div>'
      + '<div style="margin-top:8px;color:#5f6675">上传后把缩略图<b>拖到下方轨道</b>就会变成片段</div>'
      + '</div>';
    return;
  }
  var html = '';
  MATS.forEach(function (m) {
    html += '<div class="mat-item" draggable="true" data-mid="' + m.id + '" title="拖到下方时间轴轨道上">'
      + '<div class="mn">' + m.name + '</div>'
      + '<div class="mt"><span>' + ({ video: '视频', image: '图片', audio: '音频' }[m.type]) + '</span><span>' + (m.dur ? m.dur.toFixed(1) + 's' : (m.w ? m.w + '×' + m.h : '')) + '</span></div>'
      + '</div>';
  });
  box.innerHTML = html;
  // 拖拽: 素材 -> 时间轴轨道
  Array.prototype.forEach.call(box.querySelectorAll('.mat-item'), function (el) {
    el.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/x-mat', el.getAttribute('data-mid')); });
  });
}

// ── 时间轴渲染 ───────────────────────────────────────────
function trackIcon(tr) {
  var lockBtn = '<button class="ic' + (tr.locked ? ' on' : '') + '" data-act="lock" data-t="' + tr.id + '" title="锁定">' + (tr.locked ? '🔒' : '🔓') + '</button>';
  var muteBtn = tr.kind === 'audio' ? '<button class="ic' + (tr.muted ? ' warn' : '') + '" data-act="mute" data-t="' + tr.id + '" title="静音">' + (tr.muted ? '🔇' : '🔊') + '</button>' : '';
  var delBtn = '<button class="ic" data-act="deltrack" data-t="' + tr.id + '" title="删除轨道(清空片段)">✕</button>';
  return lockBtn + muteBtn + delBtn;
}

// ═══════════ 【轨道滚动同步】左列轨道名 ⇄ 右侧泳道 ═══════════
// 左右两列是各自独立的滚动容器(左列不横向滚动)。不同步的话, 竖向滚动之后
// 「轨道名」会和「片段」错位, 用户会把素材放进错误的轨道 —— 这是正确性问题。
// 实测: 左列比泳道少一条 26px 标尺(内容与可视区各少 26px), 可滚动高度恰好相等, 故 1:1 同步即可。
var _trackSyncLock = false;
function syncTrackScroll(lanes, names) {
  if (!lanes || !names) return;
  function pair(src, dst) {
    src.addEventListener('scroll', function () {
      if (_trackSyncLock) return;          // 防回环: 互相触发会抖
      _trackSyncLock = true;
      dst.scrollTop = src.scrollTop;
      _trackSyncLock = false;
    });
  }
  pair(lanes, names); pair(names, lanes);
}
function scrollTracksToEnd() {
  var lc = $id('edLanesCol'), nr = $id('edTrackRows');
  if (lc) lc.scrollTop = lc.scrollHeight;
  if (nr) nr.scrollTop = nr.scrollHeight;
}

// 【新增轨道】三个「＋轨道」按钮共用。轨道是追加到最下面的, 而时间轴高度固定,
// 不主动滚过去的话用户点完看不到任何变化(实测: 加到 6 条时新轨全在可视区外) —— 会被当成「点了没反应」。
function addTrack(kind) {
  var label = { video: '视频轨', audio: '音频轨', subtitle: '字幕轨' }[kind] || '轨道';
  var pre = { video: 'v', audio: 'a', subtitle: 'sub' }[kind] || 'tr';
  pushUndo('添加' + label);
  PRJ.tracks.push({ id: uid(pre), kind: kind, locked: false, muted: false, clips: [] });
  renderTracks();
  scrollTracksToEnd();
  toast('已加' + label + '（左侧列表底部）');
}

function renderTracks() {
  // 左列
  var rows = '';
  PRJ.tracks.forEach(function (tr) {
    rows += '<div class="ed-track-row ' + tr.kind + '">'
      + '<span class="tname">' + ({ video: '视频轨', subtitle: '字幕轨', audio: '音频轨' }[tr.kind]) + ' · ' + tr.id + '</span>'
      + trackIcon(tr) + '</div>';
  });
  $id('edTrackRows').innerHTML = rows;
  // 右侧泳道
  var lanes = '';
  PRJ.tracks.forEach(function (tr) {
    lanes += '<div class="ed-lane' + (tr.locked ? ' locked' : '') + (tr.muted ? ' dim' : '') + '" data-track="' + tr.id + '">';
    tr.clips.forEach(function (c) {
      var x0 = c.t0 * PPS, w = Math.max(8, (c.t1 - c.t0) * PPS);
      var miss = c.matId && !matAlive(c.matId);
      lanes += '<div class="ed-clip ' + clipKind(c) + (sel.clip === c.id ? ' sel' : '') + (miss ? ' missing' : '') + '" '
        + 'style="left:' + x0 + 'px;width:' + w + 'px" data-clip="' + c.id + '" title="' + clipTitle(c) + '">'
        + '<span class="hL"></span><span class="hR"></span>' + clipLabel(c) + '</div>';
    });
    lanes += '</div>';
  });
  $id('edLanes').innerHTML = lanes;
  // 【空状态引导】轨道上还没有任何片段 → 浮一层三步上手提示(告诉用户下一步做什么)
  var _tot = 0; PRJ.tracks.forEach(function (t) { _tot += t.clips.length; });
  var eg = $id('edLanesEmpty');
  if (_tot === 0) {
    if (!eg) {
      eg = document.createElement('div');
      eg.className = 'ed-lanes-empty'; eg.id = 'edLanesEmpty';
      $id('edLanes').appendChild(eg);
    }
    eg.innerHTML = '轨道还是空的 —— 按这三步就能出片<br>'
      + '<b>① 左边素材栏上传素材</b> 　<b>② 把缩略图拖到这条轨道上</b> 　<b>③ 点 ▶ 播放 / ✂ 分割 精修</b><br>'
      + '快捷键：空格播放 · S 分割 · Del 删除 · Ctrl+Z/Y 撤销重做';
  } else if (eg) {
    eg.remove();
  }
  renderRuler();
  bindClipEvents();
}

function clipKind(c) {
  if (c.ui) return 'ui';                                   // 【UI设计】叠加的贴纸/字幕卡片
  if (!c.matId) return 'subtitle';
  var m = MATS.find(function (x) { return x.id === c.matId; });
  return m ? m.type : (c._matType || 'video');
}
function matAlive(id) { return !!MATS.find(function (m) { return m.id === id; }); }
function clipTitle(c) {
  if (c.ui) return 'UI设计叠加 (' + c.t0.toFixed(1) + 's-' + c.t1.toFixed(1) + 's) · ' + c.ui.w + '×' + c.ui.h;
  if (!c.matId) return (c.subtitle && c.subtitle.text ? c.subtitle.text : '字幕') + ' (' + c.t0.toFixed(1) + 's-' + c.t1.toFixed(1) + 's)';
  var m = MATS.find(function (x) { return x.id === c.matId; });
  return (m ? m.name : '缺失素材') + ' (' + c.t0.toFixed(1) + 's-' + c.t1.toFixed(1) + 's)';
}
function clipLabel(c) {
  if (c.ui) return '🎨 UI叠加 ' + c.ui.w + '×' + c.ui.h;
  if (!c.matId) return '💬 ' + ((c.subtitle && c.subtitle.text) || '字幕').slice(0, 14);
  var m = MATS.find(function (x) { return x.id === c.matId; });
  return (m ? m.name : '⚠ 缺失') .slice(0, 16);
}

function renderRuler() {
  var total = Math.max(PRJ.duration, cur / PPS * 1 + 10); // 至少 10s 视野
  var W = Math.max($id('edLanesCol').clientWidth, total * PPS);
  var html = '';
  var step = PPS > 90 ? 0.5 : (PPS > 40 ? 1 : 2);   // 刻度步长(秒)
  for (var t = 0; t <= W / PPS; t += step) {
    var x = t * PPS;
    var isMajor = Math.abs(t % (step * 5)) < 0.001;
    html += '<div style="position:absolute;left:' + x + 'px;top:' + (isMajor ? 8 : 16) + ';width:1px;height:' + (isMajor ? 18 : 10) + 'px;background:' + (isMajor ? '#565d6e' : '#3a3f4c') + '"></div>';
    if (isMajor) html += '<div style="position:absolute;left:' + (x + 3) + 'px;top:4px;font-size:9px;color:#7b8294">' + (t < 60 ? t.toFixed(0) + 's' : fmt(t)) + '</div>';
  }
  // 标记
  PRJ.markers.forEach(function (mk) {
    html += '<div class="ed-marker" style="left:' + (mk.t * PPS) + 'px" title="' + (mk.note || '') + '"></div>';
  });
  var r = $id('edRuler'); r.style.width = W + 'px'; r.innerHTML = html;
  $id('edLanes').style.width = W + 'px';
  // 播放头
  var ph = document.getElementById('edPlayhead');
  if (!ph) { ph = document.createElement('div'); ph.id = 'edPlayhead'; $id('edLanesCol').appendChild(ph); }
  ph.style.left = (26 * 0 + cur * PPS) + 'px';
}

// ── 片段交互(选中/拖动/拉伸/分割) ────────────────────────
function bindClipEvents() {
  Array.prototype.forEach.call(document.querySelectorAll('.ed-clip'), function (el) {
    var id = el.getAttribute('data-clip');
    el.addEventListener('mousedown', function (e) {
      e.stopPropagation();
      var hit = findClip(id); if (!hit) return;
      if (hit.track.locked) { toast('轨道已锁定'); return; }
      selectClip(id);
      var mode = e.target.classList.contains('hL') ? 'L' : e.target.classList.contains('hR') ? 'R' : 'M';
      dragClip(hit, mode, e);
    });
  });
}

function dragClip(hit, mode, e0) {
  var c = hit.clip, startX = e0.clientX, ot0 = c.t0, ot1 = c.t1;
  var lane = document.querySelector('.ed-lane[data-track="' + hit.track.id + '"]');
  function onMove(e) {
    var dt = (e.clientX - startX) / PPS;
    if (mode === 'M') { var len = ot1 - ot0; c.t0 = Math.max(0, ot0 + dt); c.t1 = c.t0 + len; }
    else if (mode === 'L') { c.t0 = clamp(ot0 + dt, 0, ot1 - 0.1); }
    else { c.t1 = Math.max(ot0 + 0.1, ot1 + dt); }
    PRJ.duration = Math.max(PRJ.duration, c.t1);
    renderTracks(); updateTime();
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp);
    pushUndo();
  }
  document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
}

function selectClip(id) {
  sel.clip = id;
  var hit = findClip(id); sel.track = hit ? hit.track.id : null;
  renderTracks(); renderProps();
}

// 分割: 在播放头处切开选中片段(或播放头下的片段)
function splitClip() {
  var target = null;
  if (sel.clip) { var h = findClip(sel.clip); if (h && !h.track.locked && cur > h.clip.t0 + 0.05 && cur < h.clip.t1 - 0.05) target = h; }
  if (!target) { eachClip(function (c, tr) { if (!tr.locked && cur > c.t0 + 0.05 && cur < c.t1 - 0.05) target = { clip: c, track: tr }; }); }
  if (!target) return toast('播放头没压在任何片段上');
  pushUndo();
  ensureProgress(); PRJ.stats.cuts = (PRJ.stats.cuts || 0) + 1;   // 供进度模块「片段分割」自动检测
  var b = JSON.parse(JSON.stringify(target.clip)); b.id = uid('c');
  b.t0 = cur; target.clip.t1 = cur;
  // 素材片段同步推进 in 点
  if (b.in != null && b.out != null) { b.in = (b.in || 0) + (cur - target.clip.t1 + (target.clip.t1 - target.clip.t0)); }
  target.track.clips.push(b);
  renderTracks(); toast('已分割'); touchProgress();
}

function delClip() {
  if (!sel.clip) return toast('先选中一个片段');
  var hit = findClip(sel.clip); if (!hit) return;
  if (hit.track.locked) return toast('轨道已锁定');
  pushUndo();
  hit.track.clips = hit.track.clips.filter(function (c) { return c.id !== sel.clip; });
  sel.clip = null; renderTracks(); renderProps(); toast('已删除'); touchProgress();
}

function copyClip() {
  if (!sel.clip) return toast('先选中一个片段');
  var hit = findClip(sel.clip); if (!hit) return;
  pushUndo();
  var b = JSON.parse(JSON.stringify(hit.clip)); b.id = uid('c');
  var len = b.t1 - b.t0; b.t0 = hit.clip.t1 + 0.2; b.t1 = b.t0 + len;
  hit.track.clips.push(b); sel.clip = b.id;
  renderTracks(); renderProps(); toast('已复制到片段右侧'); touchProgress();
}

function addSubClip() {
  var tr = PRJ.tracks.find(function (t) { return t.kind === 'subtitle'; });
  if (!tr) { tr = { id: uid('sub'), kind: 'subtitle', locked: false, muted: false, clips: [] }; PRJ.tracks.push(tr); }
  if (tr.locked) return toast('字幕轨已锁定');
  pushUndo('添加字幕片段');
  var c = { id: uid('c'), matId: null, t0: cur, t1: cur + 3, subtitle: defSub() };
  tr.clips.push(c); sel.clip = c.id;
  renderTracks(); renderProps(); toast('已添加字幕片段(3秒)'); touchProgress();
}
function defSub() {
  return { text: '双击右侧属性面板编辑文字', font: 'sans-serif', size: 42, color: '#ffffff', stroke: '#000000', strokeW: 2,
    x: 0.5, y: 0.82, align: 'center', opacity: 1, shadow: true, bgColor: 'rgba(0,0,0,0)', bgRadius: 8, bgPad: 8, bgBorder: 'none' };
}

// ── 播放引擎(requestAnimationFrame + video.currentTime 同步) ──
var playT0 = 0, playCur0 = 0;
function play() {
  if (playing) return pause();
  playing = true; playT0 = performance.now(); playCur0 = cur;
  $id('edPlay').textContent = '⏸ 暂停';
  // 视频素材播放
  eachClip(function (c, tr) {
    if (c.matId && !tr.muted) { var m = MATS.find(function (x) { return x.id === c.matId; }); if (m && m.el && m.el.play && cur >= c.t0 && cur <= c.t1) { try { m.el.currentTime = (c.in || 0) + (cur - c.t0); var pr = m.el.play(); if (pr && pr.catch) pr.catch(function () {}); } catch (e) {} } }
  });
  requestAnimationFrame(tick);
}
function pause() {
  playing = false; $id('edPlay').textContent = '▶ 播放';
  MATS.forEach(function (m) { if (m.el && m.el.pause) try { m.el.pause(); } catch (e) {} });
}
function tick(now) {
  if (!playing) return;
  cur = playCur0 + (now - playT0) / 1000;
  if (cur >= PRJ.duration) { cur = PRJ.duration; pause(); markPreviewDone(); }
  // 同步视频素材播放位置
  eachClip(function (c, tr) {
    if (!c.matId) return;
    var m = MATS.find(function (x) { return x.id === c.matId; });
    if (!m || !m.el) return;
    var active = cur >= c.t0 && cur < c.t1;
    if (m.type === 'video') {
      var want = (c.in || 0) + (cur - c.t0);
      if (active) { if (Math.abs(m.el.currentTime - want) > 0.3) m.el.currentTime = want; if (m.el.paused && !tr.muted) m.el.play().catch(function(){}); }
      else if (!m.el.paused) m.el.pause();
    } else if (m.type === 'audio') {
      var wantA = (c.in || 0) + (cur - c.t0);
      if (active) { if (Math.abs(m.el.currentTime - wantA) > 0.3) m.el.currentTime = wantA; if (m.el.paused && !tr.muted) m.el.play().catch(function(){}); }
      else if (!m.el.paused) m.el.pause();
    }
  });
  updateTime(); renderRuler(); drawFrame();
  requestAnimationFrame(tick);
}
function updateTime() { $id('edTime').textContent = fmt(cur) + ' / ' + fmt(PRJ.duration); }

// ── 画布渲染(Canvas 图层合成: 视频→图片→字幕→特效→动画) ──
var ZOOM = 1, PANX = 0, PANY = 0;
function drawFrame() {
  var cv = $id('edCanvas'); if (!cv) return;
  var ctx = cv.getContext('2d');
  if (!ctx) return;                       // 无 2D 上下文(如测试环境)时静默跳过, 不影响其余功能
  var W = PRJ.canvas.w, H = PRJ.canvas.h;
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.save();
  // 画布缩放平移(预览用, 不影响导出参数)
  ctx.translate(cv.width / 2 + PANX, cv.height / 2 + PANY);
  ctx.scale(ZOOM * cv.width / W, ZOOM * cv.height / H);
  ctx.translate(-W / 2, -H / 2);
  // 黑底
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  // 图层: 轨道从下往上(数组后面的轨道先画, 视觉在上层? —— 这里从后往前, 后画的盖前面)
  for (var i = PRJ.tracks.length - 1; i >= 0; i--) {
    var tr = PRJ.tracks[i];
    if (tr.muted && tr.kind === 'audio') continue;
    tr.clips.forEach(function (c) {
      if (cur < c.t0 || cur >= c.t1) return;
      if (c.matId) drawMediaClip(ctx, c, W, H);
      else if (c.subtitle) drawSubClip(ctx, c, W, H);
      else if (c.ui) drawUiClip(ctx, c, W, H);
    });
  }
  ctx.restore();
}

function kfVal(c, prop, t, dft) {
  // 关键帧插值: kf = [{prop,t,v}], 无关键帧返回 dft
  var kfs = (c.kf || []).filter(function (k) { return k.prop === prop; }).sort(function (a, b) { return a.t - b.t; });
  if (!kfs.length) return dft;
  if (t <= kfs[0].t) return kfs[0].v;
  if (t >= kfs[kfs.length - 1].t) return kfs[kfs.length - 1].v;
  for (var i = 0; i < kfs.length - 1; i++) {
    var a = kfs[i], b = kfs[i + 1];
    if (t >= a.t && t <= b.t) { var r = (t - a.t) / (b.t - a.t); return a.v + (b.v - a.v) * r; } // 线性, 缓动在 UI 层选择存 k.ease
  }
  return dft;
}

function drawMediaClip(ctx, c, W, H) {
  var m = MATS.find(function (x) { return x.id === c.matId; });
  if (!m || !m.el) { drawMissing(ctx, W,2); return; }
  // 动画: 位置/缩放/透明度(相对 0-1)
  var px = kfVal(c, 'px', cur, 0.5), py = kfVal(c, 'py', cur, 0.5);
  var sc = kfVal(c, 'scale', cur, 1), op = kfVal(c, 'opacity', cur, 1);
  var rot = kfVal(c, 'rot', cur, 0);
  var mw = m.w || m.el.videoWidth || 640, mh = m.h || m.el.videoHeight || 360;
  var fit = Math.min(W / mw, H / mh);
  var dw = mw * fit * sc, dh = mh * fit * sc;
  ctx.save();
  ctx.globalAlpha = clamp(op, 0, 1);
  // 特效 filter
  var f = fxFilter(c, cur);
  if (f) ctx.filter = f;
  ctx.translate(px * W, py * H);
  if (rot) ctx.rotate(rot * Math.PI / 180);
  try { ctx.drawImage(m.el, -dw / 2, -dh / 2, dw, dh); } catch (e) {}
  ctx.restore();
}
function drawMissing(ctx, W) { ctx.fillStyle = '#333'; ctx.fillRect(0, 0, W, 20); ctx.fillStyle = '#e0a34e'; ctx.font = '14px sans-serif'; ctx.fillText('⚠ 素材缺失, 请重新上传', 12, 15); }

function fxFilter(c, t) {
  var fx = c.fx; if (!fx) return '';
  // 特效生效区间: 绑定片段的 fx.t0~fx.t1, 区间外不生效
  if (fx.t0 != null && fx.t1 != null && (t < fx.t0 || t > fx.t1)) return '';
  var parts = [];
  if (fx.brightness != null && fx.brightness !== 100) parts.push('brightness(' + fx.brightness + '%)');
  if (fx.contrast != null && fx.contrast !== 100) parts.push('contrast(' + fx.contrast + '%)');
  if (fx.saturate != null && fx.saturate !== 100) parts.push('saturate(' + fx.saturate + '%)');
  if (fx.hue != null && fx.hue !== 0) parts.push('hue-rotate(' + fx.hue + 'deg)');
  if (fx.blur) parts.push('blur(' + fx.blur + 'px)');
  return parts.join(' ');
}

function drawSubClip(ctx, c, W, H) {
  var s = c.subtitle;
  var px = kfVal(c, 'px', cur, s.x), py = kfVal(c, 'py', cur, s.y);
  var sc = kfVal(c, 'scale', cur, 1), op = kfVal(c, 'opacity', cur, s.opacity != null ? s.opacity : 1);
  ctx.save();
  ctx.globalAlpha = clamp(op, 0, 1);
  ctx.font = s.size + 'px ' + s.font;
  ctx.textAlign = s.align || 'center';
  ctx.textBaseline = 'middle';
  var x = px * W, y = py * H;
  // 背景框
  var tw = ctx.measureText(s.text).width;
  if (s.bgColor && s.bgColor !== 'rgba(0,0,0,0)') {
    ctx.fillStyle = s.bgColor;
    var bw = tw + s.bgPad * 2, bh = s.size * 1.5 + s.bgPad;
    var bx = s.align === 'left' ? x : s.align === 'right' ? x - bw : x - bw / 2;
    roundRect(ctx, bx, y - bh / 2, bw, bh, s.bgRadius || 0); ctx.fill();
    if (s.bgBorder && s.bgBorder !== 'none') { ctx.strokeStyle = s.bgBorder; ctx.lineWidth = 2; roundRect(ctx, bx, y - bh / 2, bw, bh, s.bgRadius || 0); ctx.stroke(); }
  }
  // 阴影
  if (s.shadow) { ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2; }
  // 描边
  if (s.strokeW > 0) { ctx.strokeStyle = s.stroke; ctx.lineWidth = s.strokeW; ctx.strokeText(s.text, x, y); }
  ctx.fillStyle = s.color;
  ctx.fillText(s.text, x, y);
  ctx.restore();
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

// 【UI设计模块】把「叠加到时间轴」的 UI 设计图当贴纸/字幕卡片合成进视频画布
//   clip.ui = { img: dataURL, w, h } —— 光栅化快照随工程保存, 保证与设计时效果一致
var UI_IMG_CACHE = {};
function drawUiClip(ctx, c, W, H) {
  if (!c.ui || !c.ui.img) return;
  var img = UI_IMG_CACHE[c.id];
  if (!img) {
    img = new Image();
    img.onload = function () { drawFrame(); };          // 解码完成补画一帧
    img.src = c.ui.img;
    UI_IMG_CACHE[c.id] = img;
    return;
  }
  if (!img.complete || !img.width) return;
  var px = kfVal(c, 'px', cur, 0.5), py = kfVal(c, 'py', cur, 0.5);
  var sc = kfVal(c, 'scale', cur, 1), op = kfVal(c, 'opacity', cur, 1);
  var rot = kfVal(c, 'rot', cur, 0);
  var fit = Math.min(W / c.ui.w, H / c.ui.h);
  var dw = c.ui.w * fit * sc, dh = c.ui.h * fit * sc;
  ctx.save();
  ctx.globalAlpha = clamp(op, 0, 1);
  var f = fxFilter(c, cur);
  if (f) ctx.filter = f;
  ctx.translate(px * W, py * H);
  if (rot) ctx.rotate(rot * Math.PI / 180);
  try { ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh); } catch (e) {}
  ctx.restore();
}

// ── 右侧属性面板(选中片段动态渲染) ────────────────────────
function renderProps() {
  var R = $id('edProps');
  if (!sel.clip) {
    R.innerHTML = '<h4>工程属性</h4>'
      + '<div class="grp"><div class="ed-field"><label>画布宽</label><input type="number" id="pW" value="' + PRJ.canvas.w + '"></div>'
      + '<div class="ed-field"><label>画布高</label><input type="number" id="pH" value="' + PRJ.canvas.h + '"></div>'
      + '<div class="ed-field"><label>总时长</label><input type="number" id="pD" value="' + PRJ.duration + '" step="0.5"></div></div>'
      + '<div class="ed-hint">选中一个片段后, 这里显示它的<br>字幕 / 动画 / 特效参数</div>';
    bindProjProps();
    return;
  }
  var hit = findClip(sel.clip); if (!hit) { sel.clip = null; return renderProps(); }
  var c = hit.clip;
  var html = '<h4>片段 · ' + (c.matId ? clipLabel(c) : '字幕') + '</h4>'
    + '<div class="grp"><div class="ed-field"><label>开始</label><input type="number" id="cT0" value="' + (+c.t0.toFixed(2)) + '" step="0.1"></div>'
    + '<div class="ed-field"><label>结束</label><input type="number" id="cT1" value="' + (+c.t1.toFixed(2)) + '" step="0.1"></div></div>';
  if (c.ui) {
    // 【UI设计模块】叠加到视频画布的贴纸 / 字幕卡片: 没有字幕参数, 只提示可用关键帧加动效
    html += '<h4>UI 贴纸 / 卡片</h4><div class="grp">'
      + '<div class="ed-hint">来自「UI设计」画布的设计图 (' + c.ui.w + '×' + c.ui.h + ')<br>'
      + '可用下面的关键帧做位移 / 缩放 / 淡入淡出</div>'
      + '<button class="ed-btn" id="cUiBack" style="width:100%">回到 UI设计画布继续编辑</button></div>';
  } else if (!c.matId) {
    // 字幕属性
    var s = c.subtitle;
    html += '<h4>字幕 · 基础</h4><div class="grp">'
      + ftxt('文字', 'sText', s.text)
      + '<div class="ed-field"><label>字体</label><select id="sFont">' + ['sans-serif', 'serif', 'monospace', '"Microsoft YaHei"', '"PingFang SC"'].map(function (f) { return '<option' + (s.font === f ? ' selected' : '') + '>' + f + '</option>'; }).join('') + '</select></div>'
      + fnum('字号', 'sSize', s.size, 8, 200)
      + '<div class="ed-field"><label>颜色</label><input type="color" id="sColor" value="' + s.color + '"></div>'
      + '<div class="ed-field"><label>描边色</label><input type="color" id="sStroke" value="' + s.stroke + '"><input type="number" id="sStrokeW" value="' + (s.strokeW || 0) + '" min="0" max="12" style="width:44px"></div>'
      + fnum('位置X', 'sX', +(s.x.toFixed(2)), 0, 1, 0.01) + fnum('位置Y', 'sY', +(s.y.toFixed(2)), 0, 1, 0.01)
      + '<div class="ed-field"><label>对齐</label><select id="sAlign">' + ['center', 'left', 'right'].map(function (a) { return '<option' + (s.align === a ? ' selected' : '') + '>' + a + '</option>'; }).join('') + '</select></div></div>'
      + '<h4>字幕 · 高级</h4><div class="grp">'
      + fsld('透明度', 'sOp', (s.opacity != null ? s.opacity : 1) * 100, 0, 100)
      + '<div class="ed-field"><label>阴影</label><input type="checkbox" id="sShadow"' + (s.shadow ? ' checked' : '') + '></div>'
      + '<div class="ed-field"><label>底色</label><input type="color" id="sBg" value="' + (s.bgColor && s.bgColor !== 'rgba(0,0,0,0)' ? s.bgColor : '#000000') + '"><button class="ed-btn" id="sBgOff" style="padding:2px 8px;font-size:11px">无</button></div>'
      + fnum('底圆角', 'sBgR', s.bgRadius || 0, 0, 40)
      + '<div class="ed-field"><label>底边框</label><input type="color" id="sBgB" value="#ffffff"><button class="ed-btn" id="sBgBOff" style="padding:2px 8px;font-size:11px">无</button></div></div>';
  }
  // 动画/特效(所有片段通用)
  html += '<h4>关键帧动画</h4><div class="grp">'
    + '<div style="font-size:11px;color:#8b93a5;margin-bottom:6px">属性: 位置X/Y(0-1) · 缩放 · 旋转 · 透明度<br>在播放头位置添加关键帧</div>'
    + '<div class="ed-field"><label>属性</label><select id="kfProp"><option value="px">位置X</option><option value="py">位置Y</option><option value="scale">缩放</option><option value="rot">旋转</option><option value="opacity">透明度</option></select></div>'
    + '<div class="ed-field"><label>值</label><input type="number" id="kfVal" step="0.05" value="1"></div>'
    + '<button class="ed-btn" id="kfAdd" style="width:100%;margin-bottom:4px">＋ 在播放头加关键帧</button>'
    + '<div id="kfList" style="max-height:120px;overflow-y:auto"></div>'
    + '<div class="ed-field" style="margin-top:6px"><label>预设</label><select id="kfPreset"><option value="">选择预设动画…</option><option value="fade">淡入淡出</option><option value="slideL">左滑入</option><option value="zoomIn">缩放入场</option></select></div></div>'
    + '<h4>画面特效</h4><div class="grp">'
    + fsld('亮度', 'fxB', c.fx && c.fx.brightness != null ? c.fx.brightness : 100, 0, 200)
    + fsld('对比度', 'fxC', c.fx && c.fx.contrast != null ? c.fx.contrast : 100, 0, 200)
    + fsld('饱和度', 'fxS', c.fx && c.fx.saturate != null ? c.fx.saturate : 100, 0, 200)
    + fsld('色相', 'fxH', c.fx && c.fx.hue != null ? c.fx.hue : 0, -180, 180)
    + fsld('模糊', 'fxBl', c.fx && c.fx.blur || 0, 0, 20)
    + '<div class="ed-field"><label>起止</label><input type="number" id="fxT0" value="' + (c.fx && c.fx.t0 != null ? c.fx.t0 : c.t0) + '" step="0.1" style="width:60px"><span style="color:#6f7686">→</span><input type="number" id="fxT1" value="' + (c.fx && c.fx.t1 != null ? c.fx.t1 : c.t1) + '" step="0.1" style="width:60px"></div></div>';
  R.innerHTML = html;
  bindClipProps(c, hit);
  renderKfList(c);
}

function ftxt(lab, id, v) { return '<div class="ed-field"><label>' + lab + '</label><input type="text" id="' + id + '" value="' + String(v).replace(/"/g, '&quot;') + '"></div>'; }
function fnum(lab, id, v, min, max, step) { return '<div class="ed-field"><label>' + lab + '</label><input type="number" id="' + id + '" value="' + v + '" min="' + min + '" max="' + max + '" step="' + (step || 1) + '"></div>'; }
function fsld(lab, id, v, min, max) { return '<div class="ed-field"><label>' + lab + '</label><input type="range" id="' + id + '" min="' + min + '" max="' + max + '" value="' + v + '"><span id="' + id + 'V" style="width:34px;text-align:right;color:#8b93a5;font-size:11px">' + v + '</span></div>'; }

function bindProjProps() {
  $id('pW').onchange = function () { PRJ.canvas.w = +this.value || 1280; drawFrame(); };
  $id('pH').onchange = function () { PRJ.canvas.h = +this.value || 720; drawFrame(); };
  $id('pD').onchange = function () { PRJ.duration = Math.max(1, +this.value || 10); renderRuler(); updateTime(); };
}

function bindClipProps(c, hit) {
  $id('cT0').onchange = function () { c.t0 = clamp(+this.value || 0, 0, c.t1 - 0.1); renderTracks(); };
  $id('cT1').onchange = function () { c.t1 = Math.max(c.t0 + 0.1, +this.value || 1); PRJ.duration = Math.max(PRJ.duration, c.t1); renderTracks(); };
  if (c.ui) {
    // 【UI设计模块】叠加片段: 「回到画布」按钮 + 不做字幕/素材分支
    var cub = $id('cUiBack');
    if (cub) cub.onclick = function () { setRTab('ui'); renderUi(); toast('已切到 UI设计画布'); };
  } else if (!c.matId) {
    var s = c.subtitle;
    $id('sText').oninput = function () { s.text = this.value; renderTracks(); drawFrame(); };
    $id('sFont').onchange = function () { s.font = this.value; drawFrame(); };
    $id('sSize').oninput = function () { s.size = +this.value; drawFrame(); };
    $id('sColor').oninput = function () { s.color = this.value; drawFrame(); };
    $id('sStroke').oninput = function () { s.stroke = this.value; drawFrame(); };
    $id('sStrokeW').oninput = function () { s.strokeW = +this.value; drawFrame(); };
    $id('sX').oninput = function () { s.x = +this.value; drawFrame(); };
    $id('sY').oninput = function () { s.y = +this.value; drawFrame(); };
    $id('sAlign').onchange = function () { s.align = this.value; drawFrame(); };
    $id('sOp').oninput = function () { s.opacity = +this.value / 100; $id('sOpV').textContent = this.value; drawFrame(); };
    $id('sShadow').onchange = function () { s.shadow = this.checked; drawFrame(); };
    $id('sBg').oninput = function () { s.bgColor = this.value; drawFrame(); };
    $id('sBgOff').onclick = function () { s.bgColor = 'rgba(0,0,0,0)'; toast('底色已清除'); drawFrame(); };
    $id('sBgR').oninput = function () { s.bgRadius = +this.value; drawFrame(); };
    $id('sBgB').oninput = function () { s.bgBorder = this.value; drawFrame(); };
    $id('sBgBOff').onclick = function () { s.bgBorder = 'none'; toast('边框已清除'); drawFrame(); };
  }
  // 关键帧
  $id('kfAdd').onclick = function () {
    pushUndo();
    c.kf = c.kf || [];
    c.kf.push({ prop: $id('kfProp').value, t: +cur.toFixed(2), v: +($id('kfVal').value || 0), ease: 'linear' });
    renderKfList(c); drawFrame(); toast('关键帧已添加 @ ' + fmt(cur)); touchProgress();
  };
  $id('kfPreset').onchange = function () {
    var p = this.value; if (!p) return;
    pushUndo(); c.kf = c.kf || [];
    var d = c.t1 - c.t0;
    if (p === 'fade') { c.kf.push({ prop: 'opacity', t: c.t0, v: 0 }, { prop: 'opacity', t: c.t0 + Math.min(0.8, d / 3), v: 1 }, { prop: 'opacity', t: c.t1 - Math.min(0.8, d / 3), v: 1 }, { prop: 'opacity', t: c.t1, v: 0 }); }
    if (p === 'slideL') { c.kf.push({ prop: 'px', t: c.t0, v: -0.3 }, { prop: 'px', t: c.t0 + Math.min(0.8, d / 3), v: 0.5 }, { prop: 'opacity', t: c.t0, v: 0 }, { prop: 'opacity', t: c.t0 + 0.3, v: 1 }); }
    if (p === 'zoomIn') { c.kf.push({ prop: 'scale', t: c.t0, v: 0.3 }, { prop: 'scale', t: c.t0 + Math.min(1, d / 2), v: 1 }, { prop: 'opacity', t: c.t0, v: 0 }, { prop: 'opacity', t: c.t0 + 0.4, v: 1 }); }
    renderKfList(c); drawFrame(); toast('预设动画已应用'); touchProgress();
  };
  // 特效
  function fx() { if (!c.fx) c.fx = {}; return c.fx; }
  function bindSld(id, key, suffix) {
    var el = $id(id); if (!el) return;
    el.oninput = function () { fx()[key] = +this.value; var lab = $id(id + 'V'); if (lab) lab.textContent = this.value; drawFrame(); touchProgress(); };
  }
  bindSld('fxB', 'brightness'); bindSld('fxC', 'contrast'); bindSld('fxS', 'saturate'); bindSld('fxH', 'hue'); bindSld('fxBl', 'blur');
  $id('fxT0').onchange = function () { fx().t0 = +this.value; };
  $id('fxT1').onchange = function () { fx().t1 = +this.value; };
}

function renderKfList(c) {
  var box = $id('kfList'); if (!box) return;
  if (!c.kf || !c.kf.length) { box.innerHTML = '<div style="color:#6f7686;font-size:11px">暂无关键帧</div>'; return; }
  var names = { px: '位置X', py: '位置Y', scale: '缩放', rot: '旋转', opacity: '透明度' };
  var html = '';
  c.kf.slice().sort(function (a, b) { return a.t - b.t; }).forEach(function (k, i) {
    html += '<div style="display:flex;gap:4px;align-items:center;font-size:11px;padding:2px 0">'
      + '<span style="flex:1;color:#aab0be">' + (names[k.prop] || k.prop) + ' @ ' + k.t.toFixed(1) + 's = ' + k.v + '</span>'
      + '<button class="ed-btn" data-kfdel="' + i + '" style="padding:1px 7px;font-size:10px">✕</button></div>';
  });
  box.innerHTML = html;
  Array.prototype.forEach.call(box.querySelectorAll('[data-kfdel]'), function (b) {
    b.onclick = function () { pushUndo(); c.kf.splice(+this.getAttribute('data-kfdel'), 1); renderKfList(c); drawFrame(); };
  });
}

// ═══════════ 【工程IO】.lixiu 文件导入导出(核心模块) ═══════════
// 【保存到本机】存档键名: 写进浏览器本地存储, 刷新/误关页面都不丢
var LS_KEY = 'lixiu_prj_autosave';
var LS_KEY_AT = 'lixiu_prj_autosave_at';

function exportProject() {
  ensureProgress();
  // 导出即视为达成「输出阶段 · 导出工程文件」→ 先置标记再算进度, 保证写进文件的进度是最新的
  var before = calcProgress().total;
  PRJ.stats.exported = true;
  applyAuto(true);
  var pg = calcProgress();
  pushLog('auto', '导出 .lixiu 工程文件', before, pg.total);
  var data = buildProjectData();
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (PRJ.name || '工程') + '.lixiu';
  a.click();
  renderProgress();
  toast('工程已另存为: ' + a.download + ' (进度 ' + pg.total + '% / UI图层 ' + PRJ.ui.layers.length
    + ' 个 / 里程碑 ' + PRJ.progress.milestones.length + ' 个 / ' + PRJ.progress.log.length + ' 条日志)', 3400);
}

// 组装工程 JSON —— 「另存为 .lixiu」与「保存到本机」共用这一份结构, 不会有第二套字段
function buildProjectData() {
  var pg = calcProgress();
  var data = {
    magic: 'lixiu-project', version: 1, exportedAt: new Date().toISOString(),
    name: PRJ.name, canvas: PRJ.canvas, fps: PRJ.fps, duration: PRJ.duration,
    tracks: PRJ.tracks, markers: PRJ.markers,
    // 【半自动智能进度模块】随工程持久化: 勾选状态 + 人工锁定 + 总进度 + 备注 + 里程碑 + 完整日志
    stats: PRJ.stats,
    progress: {
      items: PRJ.progress.items,
      notes: PRJ.progress.notes,
      milestones: PRJ.progress.milestones,
      log: PRJ.progress.log,
      total: pg.total,
      savedAt: tsNow()
    },
    // 【UI设计模块】画布尺寸配置 + 全部图层 + 生成/修改历史
    //   注意: 全局撤销栈(HISTORY)不在这里 —— 它是会话态, 绝不写进工程文件
    ui: {
      w: PRJ.ui.w, h: PRJ.ui.h, bg: PRJ.ui.bg,
      grid: PRJ.ui.grid, snap: PRJ.ui.snap, showGrid: PRJ.ui.showGrid,
      layers: PRJ.ui.layers,
      history: PRJ.ui.history
    },
    // 素材只存引用(名字+类型), 不嵌素材本体 —— 导入后按名提示重传
    materials: (PRJ.materials || []).map(function (m) { return { name: m.name, type: m.type }; })
  };
  return data;
}

/* 【保存到本机】把工程写进浏览器本地存储 —— 用户不需要懂"导出文件"就能保住进度;
   「↺ 恢复存档」按存档存在与否动态出现, 不常驻工具栏堆按钮。 */
function saveLocal() {
  ensureProgress();
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(buildProjectData()));
    localStorage.setItem(LS_KEY_AT, tsNow());
    updateSaveBtn();
    toast('已保存到本机浏览器（刷新或误关都不会丢）');
  } catch (e) {
    toast('保存失败：浏览器存储空间不足或被禁用', 2600);
  }
}

function updateSaveBtn() {
  var b = $id('edRestore'); if (!b) return;
  var at = '';
  try { at = localStorage.getItem(LS_KEY_AT) || ''; } catch (e) {}
  if (at) { b.style.display = ''; b.title = '本机有一份存档（' + at + '），点这里取回来'; }
  else { b.style.display = 'none'; }
}

// 取回本机存档: 复用 importProject 的完整恢复逻辑(含轨道/进度/UI设计/素材缺失提示)
function restoreLocal() {
  var raw = null, at = '';
  try { raw = localStorage.getItem(LS_KEY); at = localStorage.getItem(LS_KEY_AT) || ''; } catch (e) {}
  if (!raw) return toast('本机还没有存档');
  if (!confirm('取回本机存档' + (at ? '（' + at + '）' : '') + '？\n当前工程会被覆盖，素材需要重新上传。')) return;
  importProject(new File([raw], '本机存档.lixiu', { type: 'application/json' }));
}

function importProject(file) {
  var rd = new FileReader();
  rd.onload = function () {
    try {
      var d = JSON.parse(rd.result);
      if (d.magic !== 'lixiu-project') throw new Error('不是 .lixiu 工程文件');
      var impBefore = calcProgress().total;                    // 导入前(旧工程)的百分比
      PRJ = { name: d.name, canvas: d.canvas, fps: d.fps || 30, duration: d.duration, tracks: d.tracks,
        materials: d.materials || [], markers: d.markers || [],
        // 进度配置: 新工程读 progress, 旧工程(无该字段)回退到默认空进度
        stats: d.stats || freshStats(),
        progress: d.progress ? { items: d.progress.items || {}, notes: d.progress.notes || '',
          milestones: d.progress.milestones || [], log: d.progress.log || [] } : freshProgress(),
        // 【UI设计模块】: 新工程读 ui, 旧工程(无该字段)回退到默认空白设计(只取已知字段, 防脏数据)
        ui: d.ui ? { w: d.ui.w, h: d.ui.h, bg: d.ui.bg, grid: d.ui.grid,
          snap: d.ui.snap, showGrid: d.ui.showGrid,
          layers: d.ui.layers || [], history: d.ui.history || [] } : freshUI() };
      // 素材引用标记缺失, 等用户重传同名素材自动绑定
      PRJ.tracks.forEach(function (tr) { tr.clips.forEach(function (c) { if (c.matId) c._miss = true; }); });
      $id('edName').value = PRJ.name;
      sel.clip = null; cur = 0;
      ensureProgress(); ensureUI();
      UI_SEL = null;
      HISTORY.clear();                                         // 【全局撤销栈】导入工程自动清空
      renderAll(); renderMatList(); updateUndoBtns();
      // 导入后不自动覆盖(恢复历史配置优先), 仅提示
      var r = calcProgress();
      pushLog('auto', '导入工程「' + prjName() + '」· 恢复进度 ' + r.total + '%', impBefore, r.total);
      renderProgress();
      var missCnt = 0; eachClip(function (c) { if (c.matId && !matAlive(c.matId)) missCnt++; });
      toast('工程已恢复: ' + prjName() + ' · 进度 ' + r.total + '% / UI图层 ' + PRJ.ui.layers.length
        + ' 个 / 备注 / 里程碑 ' + PRJ.progress.milestones.length + ' 个 / 日志 ' + PRJ.progress.log.length + ' 条'
        + (missCnt ? ' · ⚠ ' + missCnt + ' 个片段素材缺失, 请重传同名文件' : ''), 4600);
    } catch (e) { toast('导入失败: ' + e.message, 3500); }
  };
  rd.readAsText(file);
}

// 重传素材时按名字自动绑定缺失引用
function tryBindMat(m) {
  var bound = 0;
  eachClip(function (c) {
    if (c.matId && !matAlive(c.matId)) {
      // 工程引用表里同名的旧 id -> 新素材 id
      var ref = (PRJ.materials || []).find(function (x) { return x.name === m.name; });
      if (ref && c.matId === ref.id) { /* 旧id */ }
    }
  });
  // 简化: 按名字匹配轨道上「缺失」片段
  PRJ.tracks.forEach(function (tr) { tr.clips.forEach(function (c) {
    if (c._miss || (c.matId && !matAlive(c.matId))) {
      var old = (PRJ.materials || []).find(function (x) { return x.id === c.matId; });
      if (old && old.name === m.name) { c.matId = m.id; c._miss = false; bound++; }
    }
  }); });
  if (bound) { renderTracks(); toast('✅ ' + bound + ' 个缺失片段已自动绑定「' + m.name + '」'); }
  return bound;
}
// addMaterial 后自动尝试绑定 + 静默刷新进度预估
var _addMaterial = addMaterial;
addMaterial = function (file) { var m = _addMaterial(file); tryBindMat(m); touchProgress(); return m; };

// ═══════════ 【半自动智能进度模块】五阶段权重 × 自动检测依据 × 人工锁定 ═══════════
// 权重分配: 素材 20% / 剪辑 25% / 字幕 25% / 动画特效 20% / 输出 10% = 100%
// 规则: 每项先由自动扫描给出「是否达成 + 检测依据」, 用户一旦手动勾选该条即标记【人工锁定】,
//       后续自动扫描(含静默预估)不再覆盖; 总进度 = Σ(各阶段完成度 × 该阶段权重)
var PG_GROUPS = [
  { id: 'mat', name: '素材阶段', weight: 20, tasks: [
    { id: 'mat_v', label: '上传视频素材', ok: function (s) { return s.matVideo > 0; },
      basis: function (s) { return '素材库共 ' + s.matVideo + ' 个视频 / ' + s.matImage + ' 张图片 / ' + s.matAudio + ' 个音频；本项要求视频素材 ≥1，当前 ' + s.matVideo + ' 个'; } },
    { id: 'mat_i', label: '上传图片素材', ok: function (s) { return s.matImage > 0; },
      basis: function (s) { return '素材库共 ' + s.matVideo + ' 个视频 / ' + s.matImage + ' 张图片 / ' + s.matAudio + ' 个音频；本项要求图片素材 ≥1，当前 ' + s.matImage + ' 张'; } },
    { id: 'mat_a', label: '上传音频素材', ok: function (s) { return s.matAudio > 0; },
      basis: function (s) { return '素材库共 ' + s.matVideo + ' 个视频 / ' + s.matImage + ' 张图片 / ' + s.matAudio + ' 个音频；本项要求音频素材 ≥1，当前 ' + s.matAudio + ' 个'; } }
  ] },
  { id: 'cut', name: '剪辑阶段', weight: 25, tasks: [
    { id: 'cut_rough', label: '粗剪时间轴', ok: function (s) { return s.mediaClips > 0; },
      basis: function (s) { return '检测到时间轴存在 ' + s.mediaClips + ' 个媒体片段（视频轨 ' + s.videoClips + ' 个）；本项要求至少 1 个片段落轨'; } },
    { id: 'cut_split', label: '片段分割', ok: function (s) { return s.cuts > 0; },
      basis: function (s) { return '记录到 ' + s.cuts + ' 次分割操作，同轨接缝 ' + s.seams + ' 处；本项要求至少完成 1 次分割'; } },
    { id: 'cut_track', label: '轨道整理', ok: function (s) { return s.usedTracks >= 2; },
      basis: function (s) { return s.trackCount + ' 条轨道中有 ' + s.usedTracks + ' 条已排布片段；本项要求至少 2 条轨道上有内容'; } }
  ] },
  { id: 'sub', name: '字幕阶段', weight: 25, tasks: [
    { id: 'sub_add', label: '添加字幕', ok: function (s) { return s.subClips > 0; },
      basis: function (s) { return '检测到时间轴存在 ' + s.subClips + ' 条字幕片段'; } },
    { id: 'sub_text', label: '校对字幕文本', ok: function (s) { return s.subClips > 0 && s.subEmpty === 0; },
      basis: function (s) { return s.subClips + ' 条字幕中 ' + (s.subClips - s.subEmpty) + ' 条已有文本、' + s.subEmpty + ' 条为空；本项要求所有字幕均有文本'; } },
    { id: 'sub_style', label: '调整字幕样式', ok: function (s) { return s.subStyled > 0; },
      basis: function (s) { return s.subStyled + ' 条字幕使用了非默认样式（字号/颜色/底色/描边/位置）；本项要求至少 1 条已调整'; } }
  ] },
  { id: 'anim', name: '动画特效阶段', weight: 20, tasks: [
    { id: 'anim_kf', label: '添加关键帧动画', ok: function (s) { return s.kf > 0; },
      basis: function (s) { return '检测到 ' + s.kfClips + ' 个片段配置关键帧动画，共 ' + s.kf + ' 个关键帧'; } },
    { id: 'anim_fx', label: '添加画面特效', ok: function (s) { return s.fx > 0; },
      basis: function (s) { return '检测到 ' + s.fx + ' 个片段配置画面特效（亮度/对比度/饱和度/色相/模糊）'; } }
  ] },
  { id: 'out', name: '输出阶段', weight: 10, tasks: [
    { id: 'out_preview', label: '预览全片', ok: function (s) { return s.previewed; },
      basis: function (s) { return s.previewed ? '已完成一次从片头到片尾的完整预览' : '尚未从头播放到片尾；播放到结尾会自动标记'; } },
    { id: 'out_prj', label: '导出工程文件', ok: function (s) { return s.exported; },
      basis: function (s) { return s.exported ? '已导出过 .lixiu 工程文件（含进度/备注/里程碑/日志）' : '尚未导出 .lixiu 工程文件；Ctrl+S 导出后自动标记'; } },
    { id: 'out_video', label: '导出成片视频', ok: function () { return false; },
      basis: function () { return '成片导出依赖 FFmpeg 转码（本期未接入，后续版本实现）；当前只能人工勾选标记'; } }
  ] }
];

var PG_SUB_DEF = null;            // 默认字幕样式快照(判断"是否调整过样式")
var PG_PANEL_FOLD = false;        // 面板折叠态
var PG_HIST_OPEN = false;         // 【进度变更日志】默认折叠, 点击展开查看明细(带清空日志按钮)
var AR_FOLD = false;              // 【底部·工程档案】折叠态(收起后画布变高, 时间轴空间不受影响)
var RP_FOLD = false;              // 【右侧编辑面板】整体收起态(属性/进度/UI设计三 Tab 一起隐藏, 画布扩满)
var PG_GRP_FOLD = {};             // 分组折叠态
var _pgTimer = null;              // 静默预估防抖句柄

function scanState() {
  ensureProgress();
  var s = { matVideo: 0, matImage: 0, matAudio: 0, mediaClips: 0, videoClips: 0, subClips: 0, subEmpty: 0, subStyled: 0,
    kf: 0, kfClips: 0, fx: 0, usedTracks: 0, trackCount: PRJ.tracks.length, cuts: PRJ.stats.cuts || 0, seams: 0,
    previewed: !!PRJ.stats.previewed, exported: !!PRJ.stats.exported };
  MATS.forEach(function (m) { if (m.type === 'video') s.matVideo++; else if (m.type === 'audio') s.matAudio++; else s.matImage++; });
  PRJ.tracks.forEach(function (tr) {
    if (tr.clips.length) s.usedTracks++;
    var sorted = tr.clips.slice().sort(function (a, b) { return a.t0 - b.t0; });
    for (var i = 1; i < sorted.length; i++) if (Math.abs(sorted[i].t0 - sorted[i - 1].t1) < 0.06) s.seams++;
    tr.clips.forEach(function (c) {
      if (c.matId) {
        s.mediaClips++;
        var m = MATS.find(function (x) { return x.id === c.matId; });
        if (!m || m.type === 'video') s.videoClips++;
      } else if (c.subtitle) {
        s.subClips++;
        if (!String(c.subtitle.text || '').trim()) s.subEmpty++;
        else if (subStyled(c.subtitle)) s.subStyled++;
      }
      if (c.kf && c.kf.length) { s.kfClips++; s.kf += c.kf.length; }
      if (c.fx) s.fx++;
    });
  });
  return s;
}
// 「调整过样式」判定: 与默认字幕样式逐字段比对
function subStyled(sub) {
  if (!PG_SUB_DEF) PG_SUB_DEF = defSub();
  var d = PG_SUB_DEF, keys = ['font', 'size', 'color', 'stroke', 'strokeW', 'align', 'x', 'y', 'shadow', 'bgColor', 'bgRadius'];
  for (var i = 0; i < keys.length; i++) if (String(sub[keys[i]]) !== String(d[keys[i]])) return true;
  return false;
}

function findTask(id) {
  for (var i = 0; i < PG_GROUPS.length; i++) for (var j = 0; j < PG_GROUPS[i].tasks.length; j++)
    if (PG_GROUPS[i].tasks[j].id === id) return { group: PG_GROUPS[i], task: PG_GROUPS[i].tasks[j] };
  return null;
}

function calcProgress() {
  ensureProgress();
  var s = scanState(), P = PRJ.progress;
  var groups = PG_GROUPS.map(function (g) {
    var done = 0;
    var tasks = g.tasks.map(function (t) {
      var it = P.items[t.id] || {};
      var locked = !!it.lock;
      var on = locked ? !!it.on : !!t.ok(s);       // 人工锁定优先于自动检测
      if (on) done++;
      return { id: t.id, label: t.label, on: on, lock: locked, basis: t.basis(s), auto: !locked && on };
    });
    return { id: g.id, name: g.name, weight: g.weight, done: done, total: g.tasks.length,
      pct: Math.round(done / g.tasks.length * 100), tasks: tasks };
  });
  // 总进度 = Σ(阶段完成度 × 阶段权重) / 100
  var total = 0;
  groups.forEach(function (g) { total += g.pct * g.weight; });
  return { groups: groups, total: clamp(Math.round(total / 100), 0, 100), state: s };
}

function tsNow() {
  var d = new Date();
  var p = function (n) { return (n < 10 ? '0' : '') + n; };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}
// 【进度日志模块】单条字段: 时间戳 / 操作类型 / 变更详情 / 变更前后百分比
function pushLog(type, detail, before, after) {
  ensureProgress();
  // 兜底: 需求要求每条日志都带「变更前后百分比」, 缺省时退化为与 after 相同(即本次未改变进度)
  if (typeof after !== 'number') after = calcProgress().total;
  if (typeof before !== 'number') before = after;
  PRJ.progress.log.push({ ts: tsNow(), type: type, detail: detail, before: before, after: after });
  if (PRJ.progress.log.length > 200) PRJ.progress.log.shift();   // 防止工程文件膨胀
}
var PG_TYPE_NAME = { auto: '自动更新', manual: '人工修改', reset: '重置锁定' };

// 自动扫描并回填未锁定的任务; writeLog=true 时把本次变动写入日志
function applyAuto(writeLog) {
  ensureProgress();
  var before = calcProgress().total;
  var s = scanState();
  var changed = [];
  PG_GROUPS.forEach(function (g) {
    g.tasks.forEach(function (t) {
      var it = PRJ.progress.items[t.id];
      if (it && it.lock) return;                    // 人工锁定: 自动扫描绝不覆盖
      var ok = !!t.ok(s);
      if (!it) { PRJ.progress.items[t.id] = { on: ok, lock: false }; if (ok) changed.push('√ ' + t.label); }
      else if (!!it.on !== ok) { it.on = ok; changed.push((ok ? '√ ' : '× ') + t.label); }
    });
  });
  var after = calcProgress().total;
  if (writeLog !== false && changed.length) pushLog('auto', '自动预估更新: ' + changed.join('、'), before, after);
  renderProgress();
  return { before: before, after: after, changed: changed };
}
// 【静默预估】增删素材/字幕/关键帧/特效后防抖触发(不打断操作、不覆盖人工锁定)
function touchProgress() {
  if (_pgTimer) clearTimeout(_pgTimer);
  _pgTimer = setTimeout(function () { _pgTimer = null; applyAuto(true); }, 300);
}

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function fmtT(t) { return fmt(t); }
// 工程名只用于界面文案/文件名: 用户留空时回落到统一称呼, 不强行把名字写进工程数据
function prjName() { return (PRJ.name || '').trim() || '未命名工程'; }

function renderProgress() {
  ensureProgress();
  var box = $id('pgBody'); if (!box) return;
  var r = calcProgress();
  var tone = r.total <= 0 ? 'gray' : (r.total >= 100 ? 'green' : 'yellow');
  var label = r.total <= 0 ? '待开始' : (r.total >= 100 ? '已完成' : '进行中');
  var pctEl = $id('pgPct'), chip = $id('pgChip'), fill = $id('pgFill');
  if (pctEl) { pctEl.textContent = r.total + '%'; pctEl.className = 'pg-pct' + (tone === 'gray' ? '' : ' ' + tone); }
  if (chip) { chip.textContent = label; chip.className = 'pg-chip' + (tone === 'gray' ? '' : (tone === 'green' ? ' done' : ' doing')); }
  if (fill) { fill.className = tone; fill.style.width = r.total + '%'; }
  box.classList.toggle('hide', PG_PANEL_FOLD);

  var html = '<div class="pg-acts">'
    + '<button id="pgAuto" title="立即按当前工程数据重新预估(不覆盖人工锁定项)">🔄 自动刷新预估进度</button>'
    + '<button id="pgReset" title="清除全部人工锁定与人工勾选, 全部交回自动检测">🔓 重置人工锁定</button>'
    + '</div>';
  // ── 五阶段任务清单(可折叠) ──
  r.groups.forEach(function (g) {
    var folded = !!PG_GRP_FOLD[g.id];
    html += '<div class="pg-grp">'
      + '<div class="pg-grp-h" data-grp="' + g.id + '">'
      + '<span>' + (folded ? '▸' : '▾') + ' ' + g.name + '</span>'
      + '<span class="cp">' + g.done + '/' + g.total + '</span>'
      + '<span class="w">权重 ' + g.weight + '% · ' + g.pct + '%</span>'
      + '</div>'
      + '<div class="pg-grp-bar"><i style="width:' + g.pct + '%"></i></div>'
      + '<div class="pg-tasks' + (folded ? ' hide' : '') + '">';
    g.tasks.forEach(function (t) {
      var cls = 'pg-task' + (t.lock ? ' manual' : (t.auto ? ' auto' : '')) + (t.on ? ' done' : '');
      html += '<label class="' + cls + '" data-t="' + t.id + '" data-tip="' + esc(t.basis) + '" data-tipname="' + esc(t.label) + '">'
        + '<input type="checkbox" data-chk="' + t.id + '"' + (t.on ? ' checked' : '') + '>'
        + '<span class="lb">' + t.label + '</span>'
        + (t.lock ? '<span class="lock" data-unlock="' + t.id + '" title="人工锁定中 · 点击此标记恢复自动检测">🔒人工</span>' : '')
        + '</label>';
    });
    html += '</div></div>';
  });
  // 备注/里程碑/进度历史已移到底部【工程档案】区(见 renderArchive), 这里只留任务清单

  box.innerHTML = html;
  renderArchive();          // 同步刷新底部「工程档案」(备注/里程碑/进度历史)
  bindProgress(r);
}

/* ══════════════ 【底部·工程档案】项目备注 / 里程碑 / 进度历史 ══════════════
   原先这三块挤在右侧「进度」Tab 里, 和 14 项任务清单混在一起, 位置不合理;
   现独立成页面底部一条, 三列横排, 随工程保存 / Ctrl+S 导出 / 导入一并带走。 */
function renderArchive() {
  ensureProgress();
  var box = $id('arBody'); if (!box) return;
  var ms = PRJ.progress.milestones, log = PRJ.progress.log;
  var cnt = $id('arCnt');
  if (cnt) cnt.textContent = '📝 备注 · 🚩 里程碑 ' + ms.length + ' 个 · 🧾 日志 ' + log.length + ' 条';

  var html = '';
  // ── 第 1 列: 项目备注(实时写入工程) ──
  html += '<div class="ar-col"><h5>📝 项目备注</h5>'
    + '<textarea class="pg-notes" id="pgNotes" placeholder="记录本项目制作说明 / 交付要求 / 待办…(随工程保存)">' + esc(PRJ.progress.notes) + '</textarea></div>';
  // ── 第 2 列: 里程碑(点时间可定位播放头) ──
  html += '<div class="ar-col"><h5>🚩 里程碑<span class="n">' + ms.length + ' 个</span></h5>'
    + '<div class="pg-ms-row"><input id="pgMsName" placeholder="如: 粗剪完成 / 字幕定稿">'
    + '<button id="pgMsAdd" title="以当前播放头时间记录里程碑">标记</button></div>'
    + '<div class="ar-scroll" id="pgMsList">'
    + (ms.length ? ms.map(function (m, i) {
      return '<div class="pg-ms-item"><span class="tt" data-msgo="' + m.t + '" title="点击定位到该时间">' + fmtT(m.t) + '</span>'
        + '<span class="nn">' + esc(m.name) + '</span>'
        + '<button data-msdel="' + i + '" title="删除该里程碑">✕</button></div>';
    }).join('') : '<div class="pg-empty">还没有里程碑</div>')
    + '</div></div>';
  // ── 第 3 列: 进度变更日志(可折叠: 默认收起, 点击展开看明细; 带清空按钮) ──
  html += '<div class="ar-col"><h5>🧾 进度历史<span class="n">' + log.length + ' 条</span>'
    + '<button id="pgLogToggle" title="' + (PG_HIST_OPEN ? '收起日志明细' : '展开日志明细') + '">'
    + (PG_HIST_OPEN ? '▾ 收起' : '▸ 展开') + '</button>'
    + (log.length ? '<button id="pgLogClear" title="清空进度日志(备注与里程碑保留)">🗑 清空</button>' : '')
    + '</h5>'
    + '<div class="pg-log' + (PG_HIST_OPEN ? '' : ' hide') + '" id="pgLog">'
    + (log.length ? log.slice().reverse().map(function (l) {
      return '<div class="pg-log-item"><span class="pg-tag t-' + l.type + '">' + (PG_TYPE_NAME[l.type] || l.type) + '</span>'
        + '<span class="tm">' + esc(l.ts) + '</span><br>'
        + '<span class="dt">' + esc(l.detail) + '</span><br>'
        + '<span class="df">' + (l.before != null ? l.before + '% → ' + l.after + '%' : '') + '</span></div>';
    }).join('') : '<div class="pg-empty">暂无进度记录</div>')
    + '</div></div>';

  box.innerHTML = html;
  box.classList.toggle('hide', AR_FOLD);
  var fb = $id('arFold');
  if (fb) fb.textContent = AR_FOLD ? '▴ 展开' : '▾ 收起';
  bindArchive();              // DOM 是 innerHTML 重建的, 必须在重建后立刻重绑
}

/* 【底部·工程档案】事件绑定。
   renderArchive() 用 innerHTML 重建整块 DOM, 旧节点上的事件全丢。
   所以 renderArchive() 自己负责重绑, 而不是依赖调用方再调 bindProgress ——
   否则「折叠档案区」「展开/收起进度日志」之后, 备注输入、里程碑标记/删除、
   日志清空 会**静默失效**(点了没反应, 不报错, 极难查)。
   这个坑此前是潜伏的: 点一次「收起」档案区, 上面这些控件就全死了。 */
function bindArchive() {
  // 备注(实时写入工程)
  var nt = $id('pgNotes');
  if (nt) nt.oninput = function () { ensureProgress(); PRJ.progress.notes = this.value; };
  // 里程碑
  var bMsAdd = $id('pgMsAdd'), iMs = $id('pgMsName');
  if (bMsAdd) bMsAdd.onclick = function () {
    var name = (iMs.value || '').trim();
    if (!name) return toast('先填里程碑名称');
    ensureProgress();
    var msB = calcProgress().total;                            // 变更前百分比
    PRJ.progress.milestones.push({ t: +cur.toFixed(2), name: name, at: tsNow() });
    PRJ.progress.milestones.sort(function (a, b) { return a.t - b.t; });
    pushLog('manual', '新增里程碑「' + name + '」@ ' + fmt(cur), msB, calcProgress().total);
    renderProgress(); toast('已标记里程碑: ' + name);
  };
  if (iMs) iMs.onkeydown = function (e) { if (e.key === 'Enter') bMsAdd.click(); };
  Array.prototype.forEach.call(document.querySelectorAll('#arBody [data-msdel]'), function (el) {
    el.onclick = function () {
      ensureProgress();
      var i = +this.getAttribute('data-msdel'), m = PRJ.progress.milestones[i];
      var msB2 = calcProgress().total;                         // 变更前百分比
      PRJ.progress.milestones.splice(i, 1);
      if (m) pushLog('manual', '删除里程碑「' + m.name + '」', msB2, calcProgress().total);
      renderProgress();
    };
  });
  Array.prototype.forEach.call(document.querySelectorAll('#arBody [data-msgo]'), function (el) {
    el.onclick = function () {
      cur = clamp(+this.getAttribute('data-msgo') || 0, 0, PRJ.duration);
      updateTime(); renderRuler(); drawFrame();
    };
  });
  // 进度变更日志: 默认折叠, 点「展开/收起」切换明细可见性
  var lg = $id('pgLogToggle');
  if (lg) lg.onclick = function () { PG_HIST_OPEN = !PG_HIST_OPEN; renderArchive(); };
  var lc = $id('pgLogClear');
  if (lc) lc.onclick = function () {
    ensureProgress();
    if (!PRJ.progress.log.length) return toast('日志已为空');
    if (!confirm('清空全部 ' + PRJ.progress.log.length + ' 条进度日志?')) return;
    PRJ.progress.log.length = 0;
    var clrT = calcProgress().total;                           // 清空日志不改变进度, 前后一致
    pushLog('reset', '清空进度日志', clrT, clrT);
    renderProgress(); toast('日志已清空');
  };
}

/* 【右侧编辑面板】整体收起/展开: .fold 直接 display:none,
   画布与时间轴是 flex 布局, 面板消失后自动扩满剩余宽度。
   收起/展开后重绘画布(预览区尺寸变了, 缓存的帧要按新宽度重算)。 */
function toggleRightPanel(msg) {
  var r = $id('edRight');
  if (r) r.classList.toggle('fold', RP_FOLD);
  toast(msg || (RP_FOLD ? '编辑面板已收起（点工具栏「🧩 面板」再展开）' : '编辑面板已展开'));
  drawFrame();
}

function bindProgress(r) {
  // 任务勾选 → 标记人工锁定 + 写日志
  Array.prototype.forEach.call(document.querySelectorAll('#pgBody [data-chk]'), function (chk) {
    chk.onchange = function () {
      var id = this.getAttribute('data-chk'), on = this.checked;
      var ft = findTask(id);
      var before = calcProgress().total;
      PRJ.progress.items[id] = { on: on, lock: true };          // 【人工锁定】
      var after = calcProgress().total;
      pushLog('manual', '人工' + (on ? '勾选' : '取消勾选') + '「' + (ft ? ft.task.label : id) + '」', before, after);
      this.classList.add('pop');                                 // 勾选动画
      var self = this;
      setTimeout(function () { self.classList.remove('pop'); renderProgress(); }, 300);
      if (ft) toast('已人工锁定「' + ft.task.label + '」· 自动扫描不再覆盖', 1600);
      // 立即刷新其余未锁定项与总进度
      setTimeout(function () { applyAuto(true); }, 0);
    };
  });
  // 解锁: 点 🔒人工 恢复自动检测
  Array.prototype.forEach.call(document.querySelectorAll('#pgBody [data-unlock]'), function (el) {
    el.onclick = function (e) {
      e.preventDefault(); e.stopPropagation();
      var id = this.getAttribute('data-unlock'), ft = findTask(id);
      var before = calcProgress().total;
      delete PRJ.progress.items[id];
      var s = scanState(), ok = ft ? !!ft.task.ok(s) : false;
      PRJ.progress.items[id] = { on: ok, lock: false };
      var after = calcProgress().total;
      pushLog('reset', '解除人工锁定「' + (ft ? ft.task.label : id) + '」→ 恢复自动检测(' + (ok ? '已达成' : '未达成') + ')', before, after);
      renderProgress();
    };
  });
  // 分组折叠
  Array.prototype.forEach.call(document.querySelectorAll('#pgBody [data-grp]'), function (el) {
    el.onclick = function () {
      var id = this.getAttribute('data-grp');
      PG_GRP_FOLD[id] = !PG_GRP_FOLD[id];
      renderProgress();
    };
  });
  var bAuto = $id('pgAuto');
  if (bAuto) bAuto.onclick = function () { applyAuto(true); toast('已按当前工程数据刷新预估进度'); };
  var bReset = $id('pgReset');
  if (bReset) bReset.onclick = function () {
    ensureProgress();
    var before = calcProgress().total, n = 0;
    Object.keys(PRJ.progress.items).forEach(function (k) { if (PRJ.progress.items[k].lock) n++; });
    if (!n) return toast('当前没有人工锁定项');
    if (!confirm('重置 ' + n + ' 项人工锁定?\n勾选状态将全部交回自动检测(备注/里程碑/日志保留)。')) return;
    Object.keys(PRJ.progress.items).forEach(function (k) { PRJ.progress.items[k].lock = false; PRJ.progress.items[k] = { on: PRJ.progress.items[k].on, lock: false }; });
    var s = scanState();
    Object.keys(PRJ.progress.items).forEach(function (k) { PRJ.progress.items[k].on = false; });
    PG_GROUPS.forEach(function (g) { g.tasks.forEach(function (t) { PRJ.progress.items[t.id] = { on: !!t.ok(s), lock: false }; }); });
    var after = calcProgress().total;
    pushLog('reset', '重置全部人工锁定(' + n + ' 项) → 全部恢复自动检测', before, after);
    renderProgress(); toast('已重置 ' + n + ' 项人工锁定');
  };
  // 底部「工程档案」区的控件(备注/里程碑/日志)由 bindArchive() 负责,
  // 它在 renderArchive() 末尾调用 —— 那里才是 DOM 重建的确切位置。
  // 悬浮 tooltip: 展示本项检测依据
  Array.prototype.forEach.call(document.querySelectorAll('#pgBody .pg-task'), function (el) {
    el.addEventListener('mouseenter', function () {
      showTip(this.getAttribute('data-tipname'), this.getAttribute('data-tip'), this.classList.contains('manual'));
    });
    el.addEventListener('mousemove', moveTip);
    el.addEventListener('mouseleave', hideTip);
  });
}
// 【悬浮tooltip】暗色, 悬浮显示 / 移开消失
// showTipRaw 是通用出口: 进度任务的「检测依据」与四大区的「ⓘ 说明」共用同一个浮层元素
function showTipRaw(title, bodyHtml) {
  var tip = $id('edTip'); if (!tip) return;
  tip.innerHTML = '<span class="tp-h">' + esc(title) + '</span>' + bodyHtml;
  tip.classList.add('show');
}
function showTip(title, body, locked) {
  showTipRaw('检测依据 · ' + title, esc(body)
    + (locked ? '<br><b>该项已人工锁定, 自动检测不再覆盖</b>' : ''));
}

function moveTip(e) {
  var tip = $id('edTip'); if (!tip || !tip.classList.contains('show')) return;
  var w = 270, h = tip.offsetHeight || 60;
  var x = e.clientX + 14, y = e.clientY + 16;
  if (x + w > window.innerWidth - 8) x = e.clientX - w - 14;
  if (y + h > window.innerHeight - 8) y = Math.max(8, e.clientY - h - 10);
  tip.style.left = x + 'px'; tip.style.top = y + 'px';
}
function hideTip() { var tip = $id('edTip'); if (tip) tip.classList.remove('show'); }

/* 【ⓘ 说明图标】四大区原来的常驻提示文字改成悬浮提示(改造指令: 用 tooltip 替代常驻文字)。
   说明文案写在元素自身的 data-hint 属性里, hover / focus 时复用同一个 .ed-tip 浮层;
   ⓘ 本身不响应点击(拦掉冒泡), 避免它在 pg-head 里被误判成「折叠进度面板」。
   键盘可聚焦(tabindex=0) ⇒ 触屏 / 键盘用户也能读到说明。 */
function bindHintTips() {
  Array.prototype.forEach.call(document.querySelectorAll('[data-hint]'), function (el) {
    var title = el.getAttribute('data-hint-t') || '操作说明';
    var body = esc(el.getAttribute('data-hint') || '');
    if (!el.getAttribute('tabindex')) el.setAttribute('tabindex', '0');
    el.onmouseenter = function (e) { showTipRaw(title, body); moveTip(e); };
    el.onmousemove = moveTip;
    el.onmouseleave = hideTip;
    el.onfocus = function () {
      showTipRaw(title, body);
      var r = el.getBoundingClientRect();
      moveTip({ clientX: r.left + r.width / 2, clientY: r.bottom + 6 });
    };
    el.onblur = hideTip;
    el.onclick = function (e) { if (e && e.stopPropagation) e.stopPropagation(); };
  });
}

// 面板折叠(点标题栏)
function togglePgPanel() { PG_PANEL_FOLD = !PG_PANEL_FOLD; renderProgress(); }

// 【输出阶段】播放到片尾 = 完成一次全片预览 → 自动触发一次进度重算
function markPreviewDone() {
  if (PRJ.stats && PRJ.stats.previewed) return;
  ensureProgress();
  var before = calcProgress().total;
  PRJ.stats.previewed = true;
  applyAuto(true);
  pushLog('auto', '播放完成 · 检测到已完成全片预览', before, calcProgress().total);
  renderProgress();
  toast('已完成全片预览 · 进度模块已重算', 2200);
}

// ═══════════════════════════════════════════════════════════════════
// 【UI设计模块】独立画布设计器
//   · 独立画布 + 自定义尺寸, 图层列表(显隐/锁定/层级)
//   · 六类组件: 矩形 / 文本 / 图片 / 按钮 / 卡片容器 / 图标
//   · 属性: x/y/w/h/圆角/填充/阴影/边框/透明度 + 文本样式
//   · 对齐工具 / 网格吸附 / 参考线; 复制删除快捷键; 导出 PNG
//   · 一句话生成 UI / 修改选中图层(纯本地 JS 解析, 不依赖后端)
//   · 一键叠加到视频画布 → 作为贴纸/字幕卡片进时间轴
//   · 全部操作走【全局统一撤销栈】
// ═══════════════════════════════════════════════════════════════════
var UI_TYPE_NAME = { rect: '矩形', text: '文本', image: '图片', button: '按钮', card: '卡片容器', icon: '图标', tag: '标签' };
var UI_SHORT = { rect: '矩', text: '字', image: '图', button: '钮', card: '卡', icon: '标', tag: '签' };
var UI_CLIP = null;                       // UI 图层剪贴板(会话级)
var RTAB = 'props';                       // 当前右栏 Tab

// 图层类型默认值(新建元素 / 解析器落值都从这里取)
var UI_TYPE_DEF = {
  rect:   { w: 320, h: 180, radius: 16, fill: '#7a4d63' },
  text:   { w: 520, h: 96, radius: 0, fill: 'transparent', text: { content: '文本', size: 48, weight: 600, color: '#ffffff', align: 'center', font: 'sans-serif', lineHeight: 1.25 } },
  image:  { w: 320, h: 320, radius: 12, fill: '#2c303a' },
  button: { w: 300, h: 92, radius: 46, fill: '#d4af37', text: { content: '开始', size: 36, weight: 600, color: '#1a1d24', align: 'center' } },
  card:   { w: 800, h: 220, radius: 24, fill: 'rgba(0,0,0,.55)', text: { content: '', size: 40, weight: 500, color: '#ffffff', align: 'center' } },
  icon:   { w: 96, h: 96, radius: 0, fill: '#d4af37', icon: { shape: 'star' } },
  tag:    { w: 220, h: 72, radius: 36, fill: '#d4af37', text: { content: 'NEW', size: 34, weight: 600, color: '#1a1d24', align: 'center' } }
};
var UI_ICON_SHAPES = { star: '五角星', heart: '爱心', play: '播放', check: '对勾', arrow: '箭头', pin: '定位', spark: '闪光', dot: '圆点' };

// 新建一个图层(浅拷贝默认值, text/icon 深拷贝防止串改)
function uiNewLayer(type, patch) {
  var d = UI_TYPE_DEF[type] || UI_TYPE_DEF.rect;
  var L = {
    id: uid('ui'), name: UI_TYPE_NAME[type] || '元素', type: type,
    x: 0, y: 0, w: d.w, h: d.h, radius: d.radius || 0,
    fill: d.fill, stroke: '#ffffff', strokeW: 0,
    shadow: { on: false, blur: 18, x: 0, y: 8, color: 'rgba(0,0,0,.45)' },
    opacity: 1, visible: true, locked: false
  };
  if (d.text) L.text = JSON.parse(JSON.stringify(d.text));
  if (d.icon) L.icon = JSON.parse(JSON.stringify(d.icon));
  if (patch) Object.keys(patch).forEach(function (k) {
    if (k === 'text' || k === 'icon' || k === 'shadow') {
      L[k] = L[k] || {};
      Object.keys(patch[k]).forEach(function (kk) { L[k][kk] = patch[k][kk]; });
    } else L[k] = patch[k];
  });
  return L;
}

// ── 工具: 颜色/取整/吸附/命中 ─────────────────────────────
function uiHex(v) {
  var s = String(v == null ? '' : v).trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s;
  if (/^#[0-9a-f]{3}$/i.test(s)) return '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
  var m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(s);
  if (m) return '#' + [1, 2, 3].map(function (i) { var h = (+m[i]).toString(16); return h.length < 2 ? '0' + h : h; }).join('');
  return '#000000';
}
function uiQ(v, u) { return u.snap ? Math.round(v / u.grid) * u.grid : Math.round(v); }
// 吸附到网格, 同时若已靠近画布中线则直接对齐中线(参考线所提示的位置)
function uiSnapAxis(v, center, u) { return Math.abs(v - center) <= Math.max(3, u.grid * 0.8) ? Math.round(center) : uiQ(v, u); }
function uiPt(e) {
  var cv = $id('uiCanvas'); if (!cv) return { x: 0, y: 0 };
  var r = cv.getBoundingClientRect(), u = ensureUI();
  return { x: (e.clientX - r.left) * (u.w / (r.width || 1)), y: (e.clientY - r.top) * (u.h / (r.height || 1)) };
}
function uiHandleSize(cv) { var u = ensureUI(); return Math.max(6, 10 * (u.w / (cv.clientWidth || 1))); }
function uiHandlePts(l) {
  var x1 = l.x, y1 = l.y, x2 = l.x + l.w, y2 = l.y + l.h, mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  return { nw: { x: x1, y: y1 }, n: { x: mx, y: y1 }, ne: { x: x2, y: y1 }, e: { x: x2, y: my },
    se: { x: x2, y: y2 }, s: { x: mx, y: y2 }, sw: { x: x1, y: y2 }, w: { x: x1, y: my } };
}
function uiHitHandle(l, pt, hs) {
  var pts = uiHandlePts(l);
  for (var k in pts) { if (Math.abs(pt.x - pts[k].x) <= hs && Math.abs(pt.y - pts[k].y) <= hs) return k; }
  return null;
}

// ── 画布绘制 ─────────────────────────────────────────────
function uiDrawChecker(ctx, W, H) {
  var s = Math.max(12, Math.round(Math.min(W, H) / 40));
  ctx.save();
  ctx.fillStyle = '#22252e'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1a1d24';
  for (var y = 0; y < H; y += s) for (var x = 0; x < W; x += s) if (((x / s) + (y / s)) % 2 < 1) ctx.fillRect(x, y, s, s);
  ctx.restore();
}
function uiDrawGrid(ctx, W, H, g) {
  if (!g || g < 4) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 1;
  for (var x = 0; x <= W; x += g) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (var y = 0; y <= H; y += g) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.restore();
}
function uiDrawGuides(ctx, W, H) {
  ctx.save();
  ctx.strokeStyle = 'rgba(140,200,255,.45)'; ctx.lineWidth = Math.max(1, W / 900);
  ctx.setLineDash([Math.round(W / 90), Math.round(W / 90)]);
  ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.14)';
  [1 / 3, 2 / 3].forEach(function (f) {
    ctx.beginPath(); ctx.moveTo(W * f, 0); ctx.lineTo(W * f, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, H * f); ctx.lineTo(W, H * f); ctx.stroke();
  });
  ctx.restore();
}
function uiDrawText(ctx, l) {
  var t = l.text || {};
  var size = t.size || Math.max(12, Math.round(l.h * 0.4));
  ctx.font = (t.weight || 400) + ' ' + size + 'px ' + (t.font || 'sans-serif');
  ctx.fillStyle = t.color || '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = t.align || 'center';
  var cx = t.align === 'left' ? l.x + size * 0.4 : t.align === 'right' ? l.x + l.w - size * 0.4 : l.x + l.w / 2;
  var lines = String(t.content == null ? '' : t.content).split('\n');
  var lh = size * (t.lineHeight || 1.25);
  var y0 = l.y + l.h / 2 - (lines.length - 1) * lh / 2;
  lines.forEach(function (ln, i) { ctx.fillText(ln, cx, y0 + i * lh); });
}
function uiDrawIcon(ctx, l) {
  var cx = l.x + l.w / 2, cy = l.y + l.h / 2, s = Math.min(l.w, l.h) / 2;
  var col = l.fill && l.fill !== 'transparent' ? l.fill : '#d4af37';
  var sh = (l.icon && l.icon.shape) || 'star', i, ang, rr;
  ctx.fillStyle = col; ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(3, s * 0.22); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (sh === 'star' || sh === 'spark') {
    ctx.beginPath();
    for (i = 0; i < 10; i++) { ang = -Math.PI / 2 + i * Math.PI / 5; rr = (sh === 'spark' ? (i % 2 ? s * 0.35 : s) : (i % 2 ? s * 0.45 : s)); ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr); }
    ctx.closePath(); ctx.fill();
  } else if (sh === 'heart') {
    var hh = s * 0.9;
    ctx.beginPath(); ctx.moveTo(cx, cy + hh * 0.75);
    ctx.bezierCurveTo(cx - hh * 1.6, cy - hh * 0.25, cx - hh * 0.5, cy - hh * 1.2, cx, cy - hh * 0.35);
    ctx.bezierCurveTo(cx + hh * 0.5, cy - hh * 1.2, cx + hh * 1.6, cy - hh * 0.25, cx, cy + hh * 0.75);
    ctx.fill();
  } else if (sh === 'play') {
    ctx.beginPath(); ctx.moveTo(cx - s * 0.5, cy - s * 0.75); ctx.lineTo(cx + s * 0.85, cy); ctx.lineTo(cx - s * 0.5, cy + s * 0.75); ctx.closePath(); ctx.fill();
  } else if (sh === 'check') {
    ctx.beginPath(); ctx.moveTo(cx - s * 0.7, cy); ctx.lineTo(cx - s * 0.15, cy + s * 0.55); ctx.lineTo(cx + s * 0.75, cy - s * 0.6); ctx.stroke();
  } else if (sh === 'arrow') {
    ctx.beginPath(); ctx.moveTo(cx - s * 0.7, cy); ctx.lineTo(cx + s * 0.5, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + s * 0.15, cy - s * 0.45); ctx.lineTo(cx + s * 0.72, cy); ctx.lineTo(cx + s * 0.15, cy + s * 0.45); ctx.stroke();
  } else if (sh === 'pin') {
    ctx.beginPath(); ctx.arc(cx, cy - s * 0.15, s * 0.55, Math.PI, 0); ctx.lineTo(cx, cy + s * 0.9); ctx.closePath(); ctx.fill();
  } else {
    ctx.beginPath(); ctx.arc(cx, cy, s * 0.8, 0, Math.PI * 2); ctx.fill();
  }
}
// 单个图层绘制。opts.clean=true 时用于导出/叠加(不降透明度、不画占位提示)
function uiDrawLayer(ctx, l, isSel, clean) {
  if (!l.visible) return;
  var a = clamp(l.opacity == null ? 1 : l.opacity, 0, 1);
  // 需求: 非选中图层半透明 —— 仅在「有选中」时降透明度, 未选中任何元素时全部正常显示
  if (!clean && !isSel && UI_SEL) a *= 0.45;
  ctx.save();
  ctx.globalAlpha = a;
  if (l.shadow && l.shadow.on) {
    ctx.shadowColor = l.shadow.color || 'rgba(0,0,0,.5)';
    ctx.shadowBlur = l.shadow.blur || 12;
    ctx.shadowOffsetX = l.shadow.x || 0;
    ctx.shadowOffsetY = l.shadow.y || 0;
  }
  if (l.type === 'text') { uiDrawText(ctx, l); ctx.restore(); return; }
  if (l.type === 'icon') { uiDrawIcon(ctx, l); ctx.restore(); return; }
  var r = Math.min(l.radius || 0, Math.min(l.w, l.h) / 2);
  if (l.fill && l.fill !== 'transparent') { ctx.fillStyle = l.fill; roundRect(ctx, l.x, l.y, l.w, l.h, r); ctx.fill(); }
  if (l.strokeW > 0 && l.stroke && l.stroke !== 'none') { ctx.strokeStyle = l.stroke; ctx.lineWidth = l.strokeW; roundRect(ctx, l.x, l.y, l.w, l.h, r); ctx.stroke(); }
  if (l.type === 'image') {                       // 图片占位: 叉线标记(真实图片后续版本接入)
    ctx.save(); ctx.shadowBlur = 0; ctx.globalAlpha = a * 0.5;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(2, Math.min(l.w, l.h) / 40);
    ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(l.x + l.w, l.y + l.h);
    ctx.moveTo(l.x + l.w, l.y); ctx.lineTo(l.x, l.y + l.h); ctx.stroke(); ctx.restore();
  }
  if (l.type === 'button' || l.type === 'card' || l.type === 'tag') {
    if (l.text && String(l.text.content || '').length) uiDrawText(ctx, l);
  }
  ctx.restore();
}
function uiDrawSelBox(ctx, l, hs) {
  ctx.save();
  ctx.strokeStyle = '#6fb3ff'; ctx.lineWidth = Math.max(1, hs * 0.16);
  ctx.setLineDash([hs * 1.4, hs * 0.9]);
  ctx.strokeRect(l.x, l.y, l.w, l.h);
  ctx.setLineDash([]);
  ctx.fillStyle = '#6fb3ff'; ctx.strokeStyle = '#0f1116'; ctx.lineWidth = Math.max(1, hs * 0.12);
  var pts = uiHandlePts(l);
  for (var k in pts) {
    var p = pts[k];
    ctx.beginPath(); ctx.rect(p.x - hs / 2, p.y - hs / 2, hs, hs); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}
function renderUiCanvas() {
  var cv = $id('uiCanvas'); if (!cv) return;
  var u = ensureUI();
  if (cv.width !== u.w) cv.width = u.w;
  if (cv.height !== u.h) cv.height = u.h;
  var ctx = cv.getContext('2d'); if (!ctx) return;      // 无 2D 上下文(测试环境)时静默跳过
  ctx.clearRect(0, 0, u.w, u.h);
  if (u.bg && u.bg !== 'transparent') { ctx.fillStyle = u.bg; ctx.fillRect(0, 0, u.w, u.h); }
  else uiDrawChecker(ctx, u.w, u.h);
  if (u.showGrid) uiDrawGrid(ctx, u.w, u.h, u.grid);
  var selL = uiFind(UI_SEL);
  u.layers.forEach(function (l) { uiDrawLayer(ctx, l, l.id === UI_SEL, false); });
  if (u.showGrid) uiDrawGuides(ctx, u.w, u.h);
  if (selL && selL.visible) uiDrawSelBox(ctx, selL, uiHandleSize(cv));
}

// ── 导出用栅格化: 不含网格/参考线/选中框/半透明降级 ──
function uiRaster() {
  var u = ensureUI();
  var cv = document.createElement('canvas');
  cv.width = u.w; cv.height = u.h;
  var ctx = cv.getContext('2d');
  if (!ctx) return null;
  if (u.bg && u.bg !== 'transparent') { ctx.fillStyle = u.bg; ctx.fillRect(0, 0, u.w, u.h); }
  u.layers.forEach(function (l) { uiDrawLayer(ctx, l, false, true); });
  try { return cv.toDataURL('image/png'); } catch (e) { return null; }
}

// ── 图层列表 ─────────────────────────────────────────────
function renderUiLayers() {
  var box = $id('uiLayers'); if (!box) return;
  var u = ensureUI();
  var cnt = $id('uiLayerCnt'); if (cnt) cnt.textContent = u.layers.length + ' 个';
  if (!u.layers.length) { box.innerHTML = '<div class="ui-nosel" style="padding:12px 6px">还没有元素<br>用上方组件按钮添加, 或用一句话生成</div>'; return; }
  var html = '';
  for (var i = u.layers.length - 1; i >= 0; i--) {         // 列表自上而下 = 视觉从上到下
    var l = u.layers[i];
    html += '<div class="ui-layer' + (l.id === UI_SEL ? ' sel' : '') + '" data-uid="' + l.id + '">'
      + '<span class="ty">' + (UI_SHORT[l.type] || '?') + '</span>'
      + '<span class="nm">' + esc(l.name) + '</span>'
      + '<button class="ic' + (l.visible ? '' : ' off') + '" data-eye="' + l.id + '" title="显示 / 隐藏">' + (l.visible ? '👁' : '🚫') + '</button>'
      + '<button class="ic' + (l.locked ? ' warn' : ' off') + '" data-lock="' + l.id + '" title="锁定 / 解锁(锁定后画布内不可选中拖动)">' + (l.locked ? '🔒' : '🔓') + '</button>'
      + '<button class="mv" data-up="' + l.id + '" title="上移一层">▲</button>'
      + '<button class="mv" data-dn="' + l.id + '" title="下移一层">▼</button>'
      + '</div>';
  }
  box.innerHTML = html;
  Array.prototype.forEach.call(box.querySelectorAll('.ui-layer'), function (row) {
    row.onclick = function (e) { if (e.target.closest('button')) return; UI_SEL = this.getAttribute('data-uid'); renderUi(); };
  });
  Array.prototype.forEach.call(box.querySelectorAll('[data-eye]'), function (b) {
    b.onclick = function (e) {
      e.stopPropagation();
      var l = uiFind(this.getAttribute('data-eye')); if (!l) return;
      pushUndo((l.visible ? '隐藏' : '显示') + '图层「' + l.name + '」');
      l.visible = !l.visible; renderUi(); toast(l.visible ? '已显示「' + l.name + '」' : '已隐藏「' + l.name + '」');
    };
  });
  Array.prototype.forEach.call(box.querySelectorAll('[data-lock]'), function (b) {
    b.onclick = function (e) {
      e.stopPropagation();
      var l = uiFind(this.getAttribute('data-lock')); if (!l) return;
      pushUndo((l.locked ? '解锁' : '锁定') + '图层「' + l.name + '」');
      l.locked = !l.locked; renderUi(); toast(l.locked ? '已锁定「' + l.name + '」(画布内不可拖动)' : '已解锁「' + l.name + '」');
    };
  });
  Array.prototype.forEach.call(box.querySelectorAll('[data-up]'), function (b) {
    b.onclick = function (e) { e.stopPropagation(); uiMoveZ(this.getAttribute('data-up'), 1); };
  });
  Array.prototype.forEach.call(box.querySelectorAll('[data-dn]'), function (b) {
    b.onclick = function (e) { e.stopPropagation(); uiMoveZ(this.getAttribute('data-dn'), -1); };
  });
}
function uiMoveZ(id, dir) {
  var u = ensureUI();
  var i = u.layers.findIndex(function (l) { return l.id === id; });
  var j = i + dir;
  if (i < 0 || j < 0 || j >= u.layers.length) return toast('已经是最' + (dir > 0 ? '上' : '下') + '层');
  pushUndo('调整图层层级');
  var tmp = u.layers[i]; u.layers[i] = u.layers[j]; u.layers[j] = tmp;
  renderUi();
  toast('已' + (dir > 0 ? '上' : '下') + '移一层');
}

// ── 元素属性面板 ─────────────────────────────────────────
function uiSyncPosInputs() {
  var l = uiFind(UI_SEL); if (!l) return;
  ['x', 'y', 'w', 'h'].forEach(function (k) {
    var el = $id('uiP_' + k);
    if (el && document.activeElement !== el) el.value = Math.round(l[k]);
  });
  var r = $id('uiP_radius');
  if (r && document.activeElement !== r) r.value = Math.round(l.radius || 0);
}
function renderUiProps() {
  var box = $id('uiProps'); if (!box) return;
  var l = uiFind(UI_SEL);
  var nm = $id('uiPropName'); if (nm) nm.textContent = l ? l.name : '';
  if (!l) {
    box.innerHTML = '<div class="ui-nosel">在画布上点选一个元素, 或从图层列表选择<br><br>选中后可以用「✏️ 修改选中图层」<br>一句话改它的颜色/圆角/位置</div>';
    return;
  }
  var h = '';
  h += '<div class="grp">'
    + '<div class="ed-field"><label>名称</label><input type="text" id="uiP_name" value="' + esc(l.name) + '"></div>'
    + '<div class="ed-field"><label>X</label><input type="number" id="uiP_x" value="' + Math.round(l.x) + '"><label style="width:auto">Y</label><input type="number" id="uiP_y" value="' + Math.round(l.y) + '"></div>'
    + '<div class="ed-field"><label>宽</label><input type="number" id="uiP_w" value="' + Math.round(l.w) + '" min="4"><label style="width:auto">高</label><input type="number" id="uiP_h" value="' + Math.round(l.h) + '" min="4"></div>'
    + fnum('圆角', 'uiP_radius', Math.round(l.radius || 0), 0, 600)
    + '</div>';
  h += '<div class="grp">'
    + '<div class="ed-field"><label>填充</label><input type="color" id="uiP_fill" value="' + uiHex(l.fill) + '"><input type="text" id="uiP_fillT" value="' + esc(l.fill) + '" title="也支持 transparent / rgba(...)"></div>'
    + '<div class="ed-field"><label>边框</label><input type="color" id="uiP_stroke" value="' + uiHex(l.stroke) + '"><input type="number" id="uiP_strokeW" value="' + (l.strokeW || 0) + '" min="0" max="40" style="width:52px" title="边框宽度"></div>'
    + fsld('不透明度', 'uiP_opacity', Math.round((l.opacity == null ? 1 : l.opacity) * 100), 0, 100)
    + '<div class="ed-field"><label>阴影</label><input type="checkbox" id="uiP_shadowOn"' + (l.shadow && l.shadow.on ? ' checked' : '') + '></div>'
    + (l.shadow && l.shadow.on
      ? fsld('阴影模糊', 'uiP_shadowBlur', l.shadow.blur || 0, 0, 100)
        + fnum('阴影下移', 'uiP_shadowY', Math.round(l.shadow.y || 0), -100, 100)
        + '<div class="ed-field"><label>阴影色</label><input type="color" id="uiP_shadowC" value="' + uiHex(l.shadow.color) + '"></div>'
      : '')
    + '</div>';
  if (l.text) {
    h += '<div class="grp"><div class="ed-field"><label>文字</label><input type="text" id="uiP_text" value="' + esc(l.text.content) + '"></div>'
      + fnum('字号', 'uiP_size', l.text.size || 40, 8, 500)
      + '<div class="ed-field"><label>字重</label><select id="uiP_weight">' + [300, 400, 500, 600, 700, 900].map(function (w) { return '<option value="' + w + '"' + ((l.text.weight || 400) === w ? ' selected' : '') + '>' + w + '</option>'; }).join('') + '</select></div>'
      + '<div class="ed-field"><label>文字色</label><input type="color" id="uiP_tcolor" value="' + uiHex(l.text.color) + '"></div>'
      + '<div class="ed-field"><label>对齐</label><select id="uiP_align">' + [['center', '居中'], ['left', '左对齐'], ['right', '右对齐']].map(function (a) { return '<option value="' + a[0] + '"' + (l.text.align === a[0] ? ' selected' : '') + '>' + a[1] + '</option>'; }).join('') + '</select></div></div>';
  }
  if (l.icon) {
    h += '<div class="grp"><div class="ed-field"><label>图标形状</label><select id="uiP_shape">' + Object.keys(UI_ICON_SHAPES).map(function (k) { return '<option value="' + k + '"' + ((l.icon.shape || 'star') === k ? ' selected' : '') + '>' + UI_ICON_SHAPES[k] + '</option>'; }).join('') + '</select></div></div>';
  }
  h += '<div class="grp"><div style="font-size:11px;color:#8b93a5;margin-bottom:6px">对齐到画布</div>'
    + '<div class="ui-tools" style="grid-template-columns:repeat(3,1fr);margin-bottom:0">'
    + '<button data-al="left">左</button><button data-al="hcenter">水平居中</button><button data-al="right">右</button>'
    + '<button data-al="top">顶</button><button data-al="vcenter">垂直居中</button><button data-al="bottom">底</button>'
    + '</div></div>';
  h += '<div class="grp"><div class="ed-field"><label>可见</label><input type="checkbox" id="uiP_visible"' + (l.visible ? ' checked' : '') + '>'
    + '<label style="width:auto">锁定</label><input type="checkbox" id="uiP_locked"' + (l.locked ? ' checked' : '') + '></div>'
    + '<button class="ed-btn" id="uiP_dup" style="width:100%;margin-top:4px">复制该元素 (Ctrl+D)</button>'
    + '<button class="ed-btn" id="uiP_del" style="width:100%;margin-top:4px">删除该元素 (Delete)</button></div>';
  box.innerHTML = h;
  bindUiProps(l);
}
// 属性输入通用绑定: input 实时预览(重建画布), change 时才落一次撤销记录(用聚焦时的快照)
function uiBindEditable(el, apply, actName) {
  if (!el) return;
  var pre = null;
  el.addEventListener('focus', function () { pre = snapshot(); });
  el.addEventListener('input', function () { apply(el); renderUiCanvas(); });
  el.addEventListener('change', function () {
    var cur2 = snapshot();
    if (pre && pre !== cur2) pushUndoSnap(actName || '修改图层属性', pre);
    pre = cur2;
    renderUiLayers();
    var nm = $id('uiPropName'), l = uiFind(UI_SEL); if (nm && l) nm.textContent = l.name;
  });
}
function bindUiProps(l) {
  var num = function (id, key, min) {
    var el = $id(id); if (!el) return;
    uiBindEditable(el, function (e) {
      var v = +e.value; if (isNaN(v)) return;
      if (min != null && v < min) v = min;
      if (key === 'w' || key === 'h') v = Math.max(4, v);
      l[key] = v;
    }, '修改「' + l.name + '」' + (key === 'x' || key === 'y' ? '位置' : key === 'w' || key === 'h' ? '尺寸' : key));
  };
  num('uiP_x', 'x'); num('uiP_y', 'y'); num('uiP_w', 'w'); num('uiP_h', 'h');
  var rad = $id('uiP_radius');
  uiBindEditable(rad, function (e) { l.radius = clamp(+e.value || 0, 0, 600); }, '修改「' + l.name + '」圆角');
  var op = $id('uiP_opacity');
  uiBindEditable(op, function (e) { l.opacity = clamp(+e.value / 100, 0, 1); var s = $id('uiP_opacityV'); if (s) s.textContent = e.value; }, '修改「' + l.name + '」不透明度');
  uiBindEditable($id('uiP_name'), function (e) { l.name = e.value || '元素'; }, '重命名图层');
  uiBindEditable($id('uiP_fill'), function (e) { l.fill = e.value; var t = $id('uiP_fillT'); if (t) t.value = e.value; }, '修改「' + l.name + '」填充色');
  uiBindEditable($id('uiP_fillT'), function (e) {
    var v = e.value.trim(); if (!v) return;
    l.fill = v;
    var c = $id('uiP_fill'); if (c) c.value = uiHex(v);
  }, '修改「' + l.name + '」填充色');
  uiBindEditable($id('uiP_stroke'), function (e) { l.stroke = e.value; }, '修改「' + l.name + '」边框色');
  uiBindEditable($id('uiP_strokeW'), function (e) { l.strokeW = clamp(+e.value || 0, 0, 40); }, '修改「' + l.name + '」边框宽度');
  var sb = $id('uiP_shadowOn');
  if (sb) {
    // 阴影开关: 勾选后必须立刻重渲染属性面板, 否则「模糊 / 下移 / 阴影色」三个子项不显形,
    // 用户会以为开关没生效(实测: 只调 renderUiLayers 不会重建属性面板)
    sb.addEventListener('focus', function () { sb._pre = snapshot(); });
    sb.addEventListener('change', function () {
      var pre = sb._pre || snapshot();
      l.shadow = l.shadow || {}; l.shadow.on = sb.checked;
      if (pre !== snapshot()) pushUndoSnap('切换「' + l.name + '」阴影', pre);
      renderUiProps(); renderUiCanvas();
    });
  }
  uiBindEditable($id('uiP_shadowBlur'), function (e) { l.shadow.blur = +e.value; var s = $id('uiP_shadowBlurV'); if (s) s.textContent = e.value; }, '修改「' + l.name + '」阴影');
  uiBindEditable($id('uiP_shadowY'), function (e) { l.shadow.y = +e.value; }, '修改「' + l.name + '」阴影');
  uiBindEditable($id('uiP_shadowC'), function (e) { l.shadow.color = e.value; }, '修改「' + l.name + '」阴影色');
  if (l.text) {
    uiBindEditable($id('uiP_text'), function (e) { l.text.content = e.value; }, '修改「' + l.name + '」文字');
    uiBindEditable($id('uiP_size'), function (e) { l.text.size = clamp(+e.value || 12, 8, 500); }, '修改「' + l.name + '」字号');
    uiBindEditable($id('uiP_weight'), function (e) { l.text.weight = +e.value; }, '修改「' + l.name + '」字重', true);
    uiBindEditable($id('uiP_tcolor'), function (e) { l.text.color = e.value; }, '修改「' + l.name + '」文字色');
    uiBindEditable($id('uiP_align'), function (e) { l.text.align = e.value; }, '修改「' + l.name + '」对齐', true);
  }
  uiBindEditable($id('uiP_shape'), function (e) { l.icon = l.icon || {}; l.icon.shape = e.value; }, '修改「' + l.name + '」图标', true);
  uiBindEditable($id('uiP_visible'), function () { l.visible = $id('uiP_visible').checked; }, '切换「' + l.name + '」可见', true);
  uiBindEditable($id('uiP_locked'), function () { l.locked = $id('uiP_locked').checked; }, '切换「' + l.name + '」锁定', true);
  var dup = $id('uiP_dup'); if (dup) dup.onclick = function () { uiDuplicate(l); };
  var del = $id('uiP_del'); if (del) del.onclick = function () { uiDelLayer(l); };
  // 对齐工具
  Array.prototype.forEach.call(document.querySelectorAll('#uiProps [data-al]'), function (b) {
    b.onclick = function () { uiAlign(l, this.getAttribute('data-al')); };
  });
}

// ── 图层增删改 ───────────────────────────────────────────
function uiAddLayer(type) {
  var u = ensureUI();
  if (u.layers.length >= 60) return toast('图层已达上限 60, 请先清理');
  pushUndo('添加' + (UI_TYPE_NAME[type] || '元素'));
  var l = uiNewLayer(type);
  var off = (u.layers.length % 6) * Math.round(Math.min(u.w, u.h) * 0.04);
  l.x = clamp(Math.round((u.w - l.w) / 2) + off, 0, Math.max(0, u.w - l.w));
  l.y = clamp(Math.round((u.h - l.h) / 2) + off, 0, Math.max(0, u.h - l.h));
  u.layers.push(l);
  UI_SEL = l.id;
  renderUi();
  toast('已添加' + (UI_TYPE_NAME[type] || '元素') + ' · 拖动移动 / 角点缩放');
}
function uiDuplicate(l) {
  pushUndo('复制图层「' + l.name + '」');
  var u = ensureUI();
  var c = JSON.parse(JSON.stringify(l));
  c.id = uid('ui'); c.name = l.name + ' 副本';
  c.x = clamp(l.x + Math.round(u.w * 0.03), 0, u.w - l.w);
  c.y = clamp(l.y + Math.round(u.h * 0.03), 0, u.h - l.h);
  u.layers.push(c); UI_SEL = c.id;
  renderUi(); toast('已复制「' + l.name + '」');
}
function uiDelLayer(l) {
  pushUndo('删除图层「' + l.name + '」');
  var u = ensureUI();
  u.layers = u.layers.filter(function (x) { return x.id !== l.id; });
  if (UI_SEL === l.id) UI_SEL = null;
  renderUi(); toast('已删除「' + l.name + '」');
}
function uiAlign(l, how) {
  var u = ensureUI();
  pushUndo('对齐图层「' + l.name + '」');
  if (how === 'left') l.x = 0;
  if (how === 'hcenter') l.x = Math.round((u.w - l.w) / 2);
  if (how === 'right') l.x = u.w - l.w;
  if (how === 'top') l.y = 0;
  if (how === 'vcenter') l.y = Math.round((u.h - l.h) / 2);
  if (how === 'bottom') l.y = u.h - l.h;
  renderUi();
}

// ── 画布交互: 选中 / 拖动 / 缩放 ──────────────────────────
function bindUiCanvas() {
  var cv = $id('uiCanvas'); if (!cv) return;
  var drag = null;
  cv.addEventListener('pointerdown', function (e) {
    var u = ensureUI();
    var pt = uiPt(e), hs = uiHandleSize(cv);
    var sl = uiFind(UI_SEL);
    // 1) 优先测选中框的 8 个缩放手柄
    if (sl && sl.visible && !sl.locked) {
      var hh = uiHitHandle(sl, pt, hs);
      if (hh) {
        drag = { mode: 'resize', h: hh, l: sl, pre: snapshot(), p0: pt, o: { x: sl.x, y: sl.y, w: sl.w, h: sl.h } };
        if (cv.setPointerCapture) cv.setPointerCapture(e.pointerId);
        e.preventDefault(); return;
      }
    }
    // 2) 从最上层往下测图层(锁定/隐藏的不可选)
    var hitL = null;
    for (var i = u.layers.length - 1; i >= 0; i--) {
      var l = u.layers[i];
      if (!l.visible || l.locked) continue;
      if (pt.x >= l.x && pt.x <= l.x + l.w && pt.y >= l.y && pt.y <= l.y + l.h) { hitL = l; break; }
    }
    if (hitL) {
      UI_SEL = hitL.id;
      drag = { mode: 'move', l: hitL, pre: snapshot(), p0: pt, o: { x: hitL.x, y: hitL.y } };
      if (cv.setPointerCapture) cv.setPointerCapture(e.pointerId);
      renderUi();
    } else if (UI_SEL) { UI_SEL = null; renderUi(); }
    e.preventDefault();
  });
  cv.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var u = ensureUI(), pt = uiPt(e);
    var dx = pt.x - drag.p0.x, dy = pt.y - drag.p0.y;
    if (drag.mode === 'move') {
      drag.l.x = uiSnapAxis(drag.o.x + dx, (u.w - drag.l.w) / 2, u);
      drag.l.y = uiSnapAxis(drag.o.y + dy, (u.h - drag.l.h) / 2, u);
      drag.l.x = clamp(drag.l.x, -Math.round(drag.l.w * 0.6), u.w - Math.round(drag.l.w * 0.4));
      drag.l.y = clamp(drag.l.y, -Math.round(drag.l.h * 0.6), u.h - Math.round(drag.l.h * 0.4));
    } else {
      var h = drag.h, o = drag.o;
      var x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
      if (h.indexOf('w') >= 0) x1 = uiQ(pt.x, u);
      if (h.indexOf('e') >= 0) x2 = uiQ(pt.x, u);
      if (h.indexOf('n') >= 0) y1 = uiQ(pt.y, u);
      if (h.indexOf('s') >= 0) y2 = uiQ(pt.y, u);
      if (x2 - x1 < 12) { if (h.indexOf('w') >= 0) x1 = x2 - 12; else x2 = x1 + 12; }
      if (y2 - y1 < 12) { if (h.indexOf('n') >= 0) y1 = y2 - 12; else y2 = y1 + 12; }
      drag.l.x = x1; drag.l.y = y1; drag.l.w = x2 - x1; drag.l.h = y2 - y1;
    }
    renderUiCanvas(); uiSyncPosInputs();
  });
  var finish = function () {
    if (!drag) return;
    var moved = drag.mode === 'move'
      ? (drag.l.x !== drag.o.x || drag.l.y !== drag.o.y)
      : (drag.l.w !== drag.o.w || drag.l.h !== drag.o.h);
    if (moved) pushUndoSnap((drag.mode === 'move' ? '移动图层「' : '缩放图层「') + drag.l.name + '」', drag.pre);
    drag = null;
    renderUi();
  };
  cv.addEventListener('pointerup', finish);
  cv.addEventListener('pointercancel', finish);
}

// ── 一句话生成 UI(纯本地规则解析, 不依赖后端) ─────────────
// 色名表(长词优先匹配, 避免「白色」被「白」截胡)
var UI_COLOR_MAP = {
  '白色': '#ffffff', '白': '#ffffff', '黑色': '#000000', '黑': '#000000',
  '深色': '#141821', '暗色': '#141821', '浅色': '#f2f4f8',
  '灰色': '#8b93a5', '灰': '#8b93a5', '红色': '#e2504a', '红': '#e2504a',
  '橙色': '#ef9f27', '橙': '#ef9f27', '黄色': '#f2c14e', '黄': '#f2c14e',
  '金色': '#d4af37', '金': '#d4af37', '绿色': '#4caf7d', '绿': '#4caf7d',
  '青色': '#3fb6b0', '青': '#3fb6b0', '蓝色': '#3f7ad6', '蓝': '#3f7ad6',
  '紫色': '#8c6fd6', '紫': '#8c6fd6', '粉色': '#e88fb0', '粉': '#e88fb0',
  '棕色': '#8a6a4f', '棕': '#8a6a4f'
};
var UI_TYPE_RULES = [
  ['tag', /标签|徽章|胶囊|角标|小标/],
  ['button', /按钮|button|cta|行动按钮|开始键/],
  ['card', /卡片|容器|面板|字幕条|字幕卡片|信息卡|对话框|底框|蒙版条/],
  ['icon', /图标|icon|logo|标志|星星|爱心|勋章/],
  ['image', /图片|配图|照片|头像|插图|封面图|占位图/],
  ['text', /标题|文案|文字|小字|大字|副标题|正文|说明|标语|slogan|字/],
  ['rect', /矩形|方块|色块|形状|圆形|椭圆|圆点|线条|分割线/]
];
var UI_BG_RE = /背景|底色|底图|渐变底|铺底|打底|全屏底|衬底|铺满|满屏|全屏/;
function uiColorFromText(t) {
  var m = t.match(/#[0-9a-fA-F]{3,8}/); if (m) return m[0];
  var m2 = t.match(/rgba?\([^)]+\)/); if (m2) return m2[0];
  var keys = Object.keys(UI_COLOR_MAP).sort(function (a, b) { return b.length - a.length; });
  for (var i = 0; i < keys.length; i++) if (t.indexOf(keys[i]) >= 0) return UI_COLOR_MAP[keys[i]];
  return null;
}
function uiPosFromText(t) {
  var r = { h: null, v: null, rel: false };
  if (/左上/.test(t)) { r.h = 'left'; r.v = 'top'; }
  else if (/右上/.test(t)) { r.h = 'right'; r.v = 'top'; }
  else if (/左下/.test(t)) { r.h = 'left'; r.v = 'bottom'; }
  else if (/右下/.test(t)) { r.h = 'right'; r.v = 'bottom'; }
  if (!r.v) {
    if (/顶部|上方|上面|最上|顶栏|头部/.test(t)) r.v = 'top';
    else if (/底部|最下|底栏|画面底|片尾|页脚/.test(t)) r.v = 'bottom';
    else if (/下面|下方|底下|其下|之后|接下来|第二行/.test(t)) { r.v = 'below'; r.rel = true; }
    else if (/中间|居中|中央|正中/.test(t)) r.v = 'middle';
  }
  if (!r.h) {
    if (/左侧|左边|靠左|左对齐/.test(t)) r.h = 'left';
    else if (/右侧|右边|靠右|右对齐/.test(t)) r.h = 'right';
    else if (/居中|中间|中央|正中/.test(t)) r.h = 'center';
  }
  return r;
}
function uiIconFromText(t) {
  if (/五角星|星星|星/.test(t)) return 'star';
  if (/爱心|心/.test(t)) return 'heart';
  if (/播放/.test(t)) return 'play';
  if (/对勾|勾选|完成|check/i.test(t)) return 'check';
  if (/箭头|指示/.test(t)) return 'arrow';
  if (/定位|位置|地图|坐标/.test(t)) return 'pin';
  if (/闪光|闪电|火花|特效/.test(t)) return 'spark';
  return null;
}
function uiContrast(fill) {
  var m = /^#?([0-9a-f]{6})$/i.exec(String(fill || '').trim());
  if (!m) return '#ffffff';
  var n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#1a1d24' : '#ffffff';
}
// 把引号里的文字抽出来换成占位符, 避免引号内的逗号被当成分句分隔
function uiSplitClauses(txt) {
  var quotes = [];
  var s = String(txt || '').replace(/'([^']*)'|"([^"]*)"|「([^」]*)」|『([^』]*)』|“([^”]*)”|‘([^’]*)’/g, function () {
    var cap = null;
    for (var i = 1; i < arguments.length - 2; i++) if (arguments[i] != null) { cap = arguments[i]; break; }
    quotes.push(cap == null ? '' : cap);
    return '\u0001' + (quotes.length - 1) + '\u0001';
  });
  return { text: s, quotes: quotes, clauses: s.split(/[，,。；;、\n]+/).map(function (x) { return x.trim(); }).filter(Boolean) };
}
// 每个组件的默认尺寸(比例跟随画布)
function uiSizeOf(d, W, H, M) {
  var base = Math.min(W, H), full = W - M * 2;
  if (d.type === 'text') {
    var size = d.size || (d.big ? Math.round(base * 0.12) : d.small ? Math.round(base * 0.042) : Math.round(base * 0.062));
    d.tsize = size;
    var n = Math.max(2, String(d.text || (d.big ? '主标题' : '文本')).length);
    return { w: Math.min(full, Math.round(n * size * 0.66 + size)), h: Math.round(size * 1.5) };
  }
  if (d.type === 'tag') {
    var ts = d.size || Math.round(base * 0.036); d.tsize = ts;
    var tn = Math.max(2, String(d.text || 'NEW').length);
    return { w: Math.round(Math.max(ts * 3.4, tn * ts * 0.78 + ts * 1.7)), h: Math.round(ts * 1.95) };
  }
  if (d.type === 'button') { var bh = d.size ? Math.round(d.size * 2.2) : Math.round(base * 0.085); d.tsize = Math.round(bh * 0.4); return { w: Math.round(bh * 3.2), h: bh }; }
  if (d.type === 'card') return { w: full, h: Math.round(base * (d.small ? 0.14 : 0.2)) };
  if (d.type === 'icon') { var is = d.size || Math.round(base * 0.1); return { w: is, h: is }; }
  if (d.type === 'image') return { w: Math.round(base * 0.46), h: Math.round(base * 0.46) };
  return { w: Math.round(base * 0.5), h: Math.round(base * 0.2) };
}
function uiBuildLayers(descs, W, H) {
  var M = Math.round(Math.min(W, H) * 0.06);
  var gap = Math.round(Math.min(W, H) * 0.03);
  // 先算尺寸 + 统计「中间组」总高, 以便整体垂直居中
  var midH = 0;
  descs.forEach(function (d) {
    if (d.bg) return;
    var s = uiSizeOf(d, W, H, M);
    d.w = s.w; d.h = s.h;
    if (!d.pos.rel && (d.pos.v === 'middle' || d.pos.v === null)) midH += d.h + gap;
  });
  if (midH) midH -= gap;
  var midY = Math.round((H - midH) / 2);
  var topY = M, bottomY = H - M, prevBottom = null, out = [];
  descs.forEach(function (d) {
    var L = uiNewLayer(d.type, { name: d.name });
    if (d.bg) {
      L.x = 0; L.y = 0; L.w = W; L.h = H; L.radius = 0; L.name = '底色';
      if (d.color) L.fill = d.color;
      out.push(L); return;
    }
    L.w = d.w; L.h = d.h;
    if (d.pos.h === 'left') L.x = M;
    else if (d.pos.h === 'right') L.x = W - M - L.w;
    else L.x = Math.round((W - L.w) / 2);
    var v = d.pos.v;
    if (v === 'top') { L.y = topY; topY = L.y + L.h + gap; }
    else if (v === 'bottom') { bottomY -= L.h; L.y = bottomY; bottomY -= gap; }
    else if (v === 'below' || d.pos.rel) { L.y = prevBottom == null ? midY : prevBottom + gap; }
    else { L.y = midY; midY += L.h + gap; }
    prevBottom = L.y + L.h;
    if (d.color) {
      if (L.type === 'text') { L.text = L.text || {}; L.text.color = d.color; }
      else { L.fill = d.color; if (L.text) L.text.color = uiContrast(d.color); }
    }
    if (d.radius != null) L.radius = d.radius;
    if (d.opacity != null) L.opacity = d.opacity;
    if (d.strokeW != null) L.strokeW = d.strokeW;
    if (d.icon) { L.icon = L.icon || {}; L.icon.shape = d.icon; }
    if (L.text) {
      if (d.text) L.text.content = d.text;
      if (d.tsize) L.text.size = d.tsize;
      if (d.weight) L.text.weight = d.weight;
    }
    out.push(L);
    // 「3 个标签」这类: 同款元素横向排一排
    if (d.count > 1 && (d.type === 'tag' || d.type === 'icon') && d.count <= 8) {
      var step = L.w + Math.round(gap * 0.5);
      var totalW = d.count * step - Math.round(gap * 0.5);
      var sx = Math.round((W - totalW) / 2);
      L.x = sx;
      for (var k = 1; k < d.count; k++) {
        var c = JSON.parse(JSON.stringify(L));
        c.id = uid('ui'); c.x = sx + k * step;
        out.push(c);
      }
    }
  });
  return out;
}
function parseUiPrompt(raw) {
  var u = ensureUI(), W = u.w, H = u.h, notes = [];
  var q = uiSplitClauses(raw);
  // 1) 画布尺寸(全篇扫)
  var m = q.text.match(/(\d{2,5})\s*[x×*]\s*(\d{2,5})/);
  if (m) { W = clamp(+m[1], 64, 4096); H = clamp(+m[2], 64, 4096); }
  else if (/竖版|竖屏|9[:：]16/.test(q.text)) { W = 1080; H = 1920; }
  else if (/横版|横屏|16[:：]9/.test(q.text)) { W = 1920; H = 1080; }
  else if (/方形|正方|1[:：]1/.test(q.text)) { W = 1080; H = 1080; }
  else if (/3[:：]4/.test(q.text)) { W = 1080; H = 1440; }
  else if (/4[:：]3/.test(q.text)) { W = 1440; H = 1080; }
  if (W !== u.w || H !== u.h) notes.push('画布 ' + W + '×' + H);
  // 2) 逐分句解析
  var descs = [];
  q.clauses.forEach(function (cl) {
    var txts = [];
    cl.replace(/\u0001(\d+)\u0001/g, function (mm, i) { txts.push(q.quotes[+i] || ''); return mm; });
    var plain = cl.replace(/\u0001\d+\u0001/g, ' ');
    var col = uiColorFromText(plain);
    // 底色/背景分句 → 铺满画布的矩形
    if (UI_BG_RE.test(plain) || (/底$/.test(plain) && col && !/底部/.test(plain))) {
      descs.push({ type: 'rect', name: '底色', bg: true, color: col || '#141821', pos: { h: null, v: null, rel: false } });
      return;
    }
    var type = null;
    for (var i = 0; i < UI_TYPE_RULES.length; i++) if (UI_TYPE_RULES[i][1].test(plain)) { type = UI_TYPE_RULES[i][0]; break; }
    if (!type) return;
    var opacity = null;
    if (/透明/.test(plain)) { var pm = plain.match(/(\d{1,3})\s*%/); if (pm) opacity = clamp(+pm[1], 0, 100) / 100; }
    descs.push({
      type: type, name: (txts[0] || UI_TYPE_NAME[type] || '元素').slice(0, 12),
      text: txts[0] || null, color: col, pos: uiPosFromText(plain),
      size: uiNumOf(plain, /(\d{2,3})\s*号/) || uiNumOf(plain, /字号\s*(\d{1,3})/) || uiNumOf(plain, /(\d{2,3})\s*px/i),
      radius: uiNumOf(plain, /圆角\s*(\d{1,3})/) || uiNumOf(plain, /(\d{1,3})\s*圆角/),
      opacity: opacity, icon: uiIconFromText(plain),
      strokeW: uiNumOf(plain, /边框\s*(\d{1,2})/),
      weight: /粗体|加粗|bold/i.test(plain) ? 700 : null,
      big: /大标题|大字|超大|醒目|主标题/.test(plain),
      small: /小字|小号|细字|说明|副标题/.test(plain),
      count: uiNumOf(plain, /(\d{1,2})\s*个/)
    });
  });
  if (!descs.length) notes.push('没识别出组件, 已只更新画布尺寸');
  return { w: W, h: H, layers: uiBuildLayers(descs, W, H), notes: notes };
}
function uiNumOf(t, re) { var m = t.match(re); return m ? +m[1] : null; }

// 修改选中图层: 只改指令里提到的属性, 其余原样保留
function parseUiModify(raw, l) {
  var t = String(raw || ''), set = {}, text = {}, keys = [];
  var q = uiSplitClauses(t);
  var plain = q.text.replace(/\u0001\d+\u0001/g, ' ');
  var col = uiColorFromText(plain);
  if (col) {
    if (/文字|字色|字体颜色/.test(plain) && l.text) { text.color = col; keys.push('文字颜色'); }
    else set.fill = col, keys.push('填充色');
  }
  // 数值型属性: 关键词与数字之间允许夹 0~6 个非数字/非分隔符字符 —— 覆盖「圆角改成 12」「字号调到 60」这类自然语序
  var rad = uiNumOf(plain, /圆角[^0-9,，;；、]{0,6}(\d{1,3})/) || uiNumOf(plain, /(\d{1,3})\s*圆角/);
  if (rad != null) { set.radius = clamp(rad, 0, 600); keys.push('圆角 ' + set.radius); }
  var fs = uiNumOf(plain, /字号[^0-9,，;；、]{0,6}(\d{1,3})/) || uiNumOf(plain, /(\d{2,3})\s*号字?/) || uiNumOf(plain, /(\d{2,3})\s*px/i);
  if (fs != null) { text.size = clamp(fs, 8, 500); keys.push('字号 ' + text.size); }
  var pm = plain.match(/(\d{1,3})\s*%/);
  if (pm && /透明/.test(plain)) { set.opacity = clamp(+pm[1], 0, 100) / 100; keys.push('不透明度 ' + pm[1] + '%'); }
  var wv = uiNumOf(plain, /宽[^0-9,，;；、]{0,6}(\d{2,4})/), hv = uiNumOf(plain, /高[^0-9,，;；、]{0,6}(\d{2,4})/);
  if (wv != null) { set.w = Math.max(4, wv); keys.push('宽 ' + set.w); }
  if (hv != null) { set.h = Math.max(4, hv); keys.push('高 ' + set.h); }
  var sw = uiNumOf(plain, /边框[^0-9,，;；、]{0,6}(\d{1,2})/);
  if (sw != null) { set.strokeW = clamp(sw, 0, 40); keys.push('边框 ' + set.strokeW); }
  if (/加阴影|要阴影|加个阴影/.test(plain)) { set.shadow = { on: true }; keys.push('开启阴影'); }
  if (/去阴影|不要阴影|去掉阴影|无阴影/.test(plain)) { set.shadow = { on: false }; keys.push('关闭阴影'); }
  if (/加粗|粗体|bold/i.test(plain)) { text.weight = 700; keys.push('加粗'); }
  if (/居中/.test(plain) && !/水平居中|垂直居中/.test(plain)) { if (l.text) { text.align = 'center'; keys.push('文字居中'); } }
  if (/左对齐/.test(plain) && l.text) { text.align = 'left'; keys.push('左对齐'); }
  if (/右对齐/.test(plain) && l.text) { text.align = 'right'; keys.push('右对齐'); }
  if (q.quotes.length && /文字|内容|改成|换成|写成/.test(plain) && l.text) { text.content = q.quotes[0]; keys.push('文字「' + q.quotes[0] + '」'); }
  var ic = uiIconFromText(plain);
  if (ic && l.icon && /换|改|变成/.test(plain)) { set.icon = { shape: ic }; keys.push('图标形状'); }
  // 位置: 角位/居中/顶底(按画布锚点)
  var pos = uiPosFromText(plain);
  if (pos.h || pos.v) {
    var u = ensureUI();
    var nx = null, ny = null;
    if (pos.h === 'left') nx = 0; else if (pos.h === 'right') nx = u.w - l.w; else if (pos.h === 'center') nx = Math.round((u.w - l.w) / 2);
    if (pos.v === 'top') ny = 0; else if (pos.v === 'bottom') ny = u.h - l.h; else if (pos.v === 'middle') ny = Math.round((u.h - l.h) / 2);
    if (nx != null) { set.x = nx; keys.push('水平位置'); }
    if (ny != null) { set.y = ny; keys.push('垂直位置'); }
  }
  // 图标/按钮的颜色也算填充分支(上面已处理)
  var sh = {};
  if (set.shadow) { sh = set.shadow; delete set.shadow; }
  return { set: set, text: text, shadow: sh, keys: keys };
}

// ── 生成 / 修改 / 模板 ───────────────────────────────────
function uiLog(kind, prompt, note) {
  var u = ensureUI();
  u.history.push({ ts: tsNow(), kind: kind, prompt: prompt || '', note: note || '' });
  if (u.history.length > 60) u.history.shift();
}
function renderUiHist() {
  var box = $id('uiHist'); if (!box) return;
  var u = ensureUI();
  if (!u.history.length) { box.innerHTML = '<div class="empty">还没有生成/修改记录(随工程保存)</div>'; return; }
  box.innerHTML = u.history.slice(-30).reverse().map(function (h) {
    var k = h.kind === 'gen' ? '生成' : h.kind === 'tpl' ? '模板' : '修改';
    return '<div class="hi"><b>' + k + '</b> ' + esc(h.note)
      + (h.prompt ? '<br><span class="r">' + esc(h.prompt).slice(0, 70) + '</span>' : '')
      + '<br><span style="color:#6f7686">' + esc(h.ts) + '</span></div>';
  }).join('');
}
// ═══════════ 【AI 大模型模式】访客自带 Key 直连, 不烧开发者 token ═══════════
// 为什么不用中转后端 / CORS 代理: 逐家实测过 OPTIONS 预检, 以下端点浏览器都能直连,
//   且 POST 401 错误响应也带 access-control-allow-origin(除方舟), 所以纯静态页够用。
//   用户填自己的 Key -> 浏览器直接调模型 -> token 扣用户自己账号, 本项目零成本。
// 实测记录(2026-09-19, curl OPTIONS + POST 401):
//   方舟 200/回显源, 但 401 不带 ACAO(错误分支走 fetch reject, 已兜底)
//   DeepSeek / Kimi 200/回显源, 401 也回显源
//   通义兼容模式 / 硅基流动 200/`*`, 401 也 `*`
//   OpenAI 官方从本机不可达 -> 只能作为「自定义端点」入口给用户自己填代理
var AI_LS_KEY = 'lixiu_ark_key', AI_LS_MODEL = 'lixiu_ark_model', AI_LS_PROVIDER = 'lixiu_ark_provider';
// 中转(可选): 填了中转地址且开关打开时, AI 请求经中转发往目标端点(CORS 兜底 / 企业网关)
var AI_LS_RELAY = 'lixiu_ai_relay', AI_LS_RELAY_URL = 'lixiu_ai_relay_url';
var AI_EP_OVERRIDE = false;   // 是否允许端点输入框覆盖预设家的地址(默认关; 开后任何家都可用自定义地址)
var AI_BUSY = false;
// ── provider 注册表 ── 每家模型一条: 端点 + 默认模型列表 + 请求体差异
//   opts.thinking   是否附 thinking:{type:'disabled'}(仅方舟 seed 系列需要, 否则推理轨迹混正文)
//   opts.jsonFmt    是否附 response_format:{type:'json_object'}(部分模型不支持, 会 400)
//   opts.extraBody  该家的其他必填字段(如 Kimi 需要 max_tokens 显式给)
//   urlCustom       为 true 时 url 从用户输入取, 而不是写死
var AI_PROVIDERS = [
  { id: 'ark', name: '豆包 · 火山方舟',
    url: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    models: ['doubao-seed-1-6-251015', 'doubao-1-5-pro-256k-250115', 'doubao-lite-32k-250428'],
    defaultModel: 'doubao-seed-1-6-251015',
    opts: { thinking: true, jsonFmt: true },
    keyHint: 'https://console.volcengine.com/ark' },
  { id: 'deepseek', name: 'DeepSeek',
    url: 'https://api.deepseek.com/chat/completions',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    defaultModel: 'deepseek-chat',
    opts: { thinking: false, jsonFmt: false },
    keyHint: 'https://platform.deepseek.com/api_keys' },
  { id: 'kimi', name: 'Kimi · 月之暗面',
    url: 'https://api.moonshot.cn/v1/chat/completions',
    models: ['kimi-k2-0905-preview', 'moonshot-v1-128k', 'moonshot-v1-32k', 'moonshot-v1-8k'],
    defaultModel: 'moonshot-v1-8k',
    opts: { thinking: false, jsonFmt: true, extraBody: { max_tokens: 4096 } },
    keyHint: 'https://platform.moonshot.cn' },
  { id: 'tongyi', name: '通义千问 · 阿里云',
    url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    models: ['qwen3-max', 'qwen-plus', 'qwen-turbo', 'qwen2.5-vl-72b-instruct'],
    defaultModel: 'qwen-plus',
    opts: { thinking: false, jsonFmt: true },
    keyHint: 'https://bailian.console.aliyun.com' },
  { id: 'siliconflow', name: '硅基流动 SiliconFlow',
    url: 'https://api.siliconflow.cn/v1/chat/completions',
    models: ['Qwen/Qwen3-32B', 'deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-72B-Instruct'],
    defaultModel: 'Qwen/Qwen3-32B',
    opts: { thinking: false, jsonFmt: true },
    keyHint: 'https://siliconflow.cn' },
  { id: 'custom', name: '自定义 · OpenAI 兼容',
    url: '', urlCustom: true, models: [], defaultModel: '',
    baseHint: 'https://ark.cn-beijing.volces.com/api/v3',
    opts: { thinking: false, jsonFmt: true },
    keyHint: '任何 /chat/completions 端点都可, 例如 OpenRouter / 自建代理 / vLLM' }
];
var AI_DEF_PROVIDER = 'ark';
function aiProvider() {
  var el = $id('uiAiProvider');
  var v = (((el && el.value) || '').trim()) || aiLS(AI_LS_PROVIDER) || AI_DEF_PROVIDER;
  for (var i = 0; i < AI_PROVIDERS.length; i++) if (AI_PROVIDERS[i].id === v) return AI_PROVIDERS[i];
  return AI_PROVIDERS[0];
}
// 超时 / 中止: fetch 本身没有超时机制, 挂起时 AI_BUSY 会永远卡在 true,
//   用户只能刷新页面 —— 这是不可接受的。用 AbortController 统一管超时和用户中止,
//   两者共用同一个 signal, 超时触发 abort() 即可走同一条清理路径。
var AI_TIMEOUT = 45000;        // 生成整版 UI 的合理上限; 测试钩子 __ed.aiTimeout() 可临时缩短
var AI_ABORT = null;           // 当前请求的 AbortController(会话级, 不入工程)
var AI_TID = null;             // 超时定时器
var AI_ABORTED = false;        // 是否「用户主动中止」(用于区分提示文案)
// 统一收尾: 无论成功/失败/超时/中止, AI_BUSY 与中止按钮必须复位, 否则后续请求全部被拦
function aiReset() {
  AI_BUSY = true; AI_ABORTED = false;
  if (AI_TID) { clearTimeout(AI_TID); AI_TID = null; }
  AI_ABORT = new AbortController();
  AI_TID = setTimeout(function () {
    if (AI_ABORT) AI_ABORT.abort();
    AI_TID = null;
  }, AI_TIMEOUT);
  var b = $id('uiAbort');
  if (b) b.style.display = '';
  aiLoading(true);
}
function aiDone() {
  AI_BUSY = false;
  if (AI_TID) { clearTimeout(AI_TID); AI_TID = null; }
  AI_ABORT = null;
  var b = $id('uiAbort');
  if (b) b.style.display = 'none';
  aiLoading(false);
}
// 用户点「中止」: 中止后 fetch 会 reject, 由 aiCall 的 catch 给文案
function aiAbortNow() {
  if (!AI_ABORT) return;
  AI_ABORTED = true;
  AI_ABORT.abort();
}
// 【loading 动画】请求进行中: 状态栏转圈 + 生成/修改按钮置灰。
// 逻辑上 AI_BUSY 已挡住重复点击, 这里只是让用户「看见」还在等, 不至误以为卡死。
function aiLoading(on) {
  var g = $id('uiGenAct');
  if (g) g.classList.toggle('busy', !!on);
}
var AI_TYPES = ['rect', 'text', 'image', 'button', 'card', 'icon', 'tag'];
var AI_SYS = '你是一个短视频/海报的 UI 版面生成器。\n'
  + '只输出一个 JSON 对象，不要任何解释文字，不要 markdown 代码块。\n'
  + '结构：{"w":画布宽, "h":画布高, "layers":[图层, ...]}\n'
  + '图层字段：type（只能是 rect/text/image/button/card/icon/tag 之一）、name、x、y、w、h、'
  + 'fill（#rrggbb 或 rgba(...)）、radius、opacity（0~1 的小数）、'
  + 'text（需要文字时才给，形如 {"content":"文字","size":48,"weight":700,"color":"#fff","align":"center","lineHeight":1.3}）。\n'
  + '坐标以画布左上角为原点，单位 px。只画用户描述到的东西，不要额外堆装饰。';

function aiLS(k, v) {
  try {
    if (v === undefined) return localStorage.getItem(k) || '';
    if (v) localStorage.setItem(k, v); else localStorage.removeItem(k);
  } catch (e) {}
  return '';
}
function aiKey() { var el = $id('uiApiKey'); return (((el && el.value) || '').trim()) || aiLS(AI_LS_KEY); }
// 模型名: 优先输入框, 其次本机存的, 最后用该 provider 的默认模型
function aiModel() {
  var p = aiProvider();
  var el = $id('uiAiModel');
  var v = (((el && el.value) || '').trim());
  if (!v) {
    v = aiLS(AI_LS_MODEL);
    // 存的是「另一家」的模型名(例如存了 deepseek-chat 但当前选方舟) -> 回退到当前家的默认
    var hit = p.models.some ? p.models.indexOf(v) > -1 : false;
    if (!hit && p.defaultModel) v = p.defaultModel;
  }
  if (!v && p.defaultModel) v = p.defaultModel;
  return v || '';
}
function aiEngine() { var el = document.querySelector('input[name=uiEngine]:checked'); return el ? el.value : 'local'; }
function aiSay(msg, tone) {
  var el = $id('uiAiSt'); if (!el) return;
  el.textContent = msg || '';
  el.className = 'ui-ai-st' + (tone === 'ok' ? ' ok' : tone === 'err' ? ' err' : ' busy');
}
function aiSyncBox() {
  var box = $id('uiAiBox');
  if (box) box.className = 'ui-ai' + (aiEngine() === 'ai' ? ' on' : '');
  aiRefreshModelList();
}
// 【模型手填/下拉互切】✏️ 按钮: select -> input(手填任意模型ID); 再点 -> 回 select
//   手填的值存 LS(lixiu_ai_model_manual), 切 provider 不丢(自定义模型名各家通用)
function aiModelManualLS(v) { return aiLS('lixiu_ai_model_manual', v); }
function aiModelSwapToInput() {
  var sel = $id('uiAiModel');
  if (!sel) return;
  var w = document.createElement('input');
  w.type = 'text'; w.id = 'uiAiModel';
  w.setAttribute('placeholder', '任意模型ID, 例 ep-xxx / gpt-4o / deepseek-chat');
  w.setAttribute('autocomplete', 'off'); w.setAttribute('spellcheck', 'false');
  w.value = sel.value || aiModelManualLS() || '';
  sel.parentNode.replaceChild(w, sel);
  aiModelManualLS(w.value);
  var b = $id('uiModelManual'); if (b) b.classList.add('on');
  aiTrimBind();   // 新建的 input 也要挂实时去空格
}
function aiModelSwapToSelect() {
  var w = $id('uiAiModel');
  if (!w) return;
  var p = aiProvider();
  var s = document.createElement('select');
  s.id = 'uiAiModel';
  if (p.models && p.models.length) {
    s.innerHTML = p.models.map(function (m) { return '<option value="' + m + '">' + m + '</option>'; }).join('');
    if (w.value && p.models.indexOf(w.value) > -1) s.value = w.value;
    else if (p.defaultModel) s.value = p.defaultModel;
  }
  w.parentNode.replaceChild(s, w);
  var b = $id('uiModelManual'); if (b) b.classList.remove('on');
  // 手填保留: 用户手填的模型 ID 加进下拉第一个选项, 刷新/切换后不丢
  var manual = aiModelManualLS();
  if (manual && p.models && p.models.indexOf(manual) === -1) {
    var o = document.createElement('option');
    o.value = manual; o.textContent = manual + '（手填）';
    s.insertBefore(o, s.firstChild);
    s.value = manual;
  }
}
function aiModelToggleManual() {
  var el = $id('uiAiModel');
  if (!el) return;
  if (el.tagName === 'SELECT') aiModelSwapToInput();
  else aiModelSwapToSelect();
}
// provider 下拉变化时: 刷新模型下拉 + 更新 Key 获取链接 + 保存 provider
function aiRefreshModelList() {
  var p = aiProvider();
  var sel = $id('uiAiModel');
  if (!sel) return;
  // 自定义端点: 允许手输任意模型名, 用 <input> 而不是 <select>
  if (p.urlCustom) {
    if (sel.tagName === 'SELECT') {
      var keep = sel.value;
      var w = document.createElement('input');
      w.type = 'text'; w.id = 'uiAiModel';
      w.setAttribute('placeholder', '任意模型ID, 例 ep-xxx / gpt-4o / deepseek-chat');
      w.setAttribute('autocomplete', 'off'); w.setAttribute('spellcheck', 'false');
      w.value = keep || aiModelManualLS() || '';
      sel.parentNode.replaceChild(w, sel);
      var mb = $id('uiModelManual'); if (mb) mb.classList.add('on');
      aiTrimBind();
      aiRefreshKeyLink();
      return;
    }
    return;
  }
  if (sel.tagName !== 'SELECT') {
    var keep = sel.value;
    var s = document.createElement('select');
    s.id = 'uiAiModel';
    s.innerHTML = p.models.map(function (m) {
      return '<option value="' + m + '">' + m + '</option>';
    }).join('');
    sel.parentNode.replaceChild(s, sel);
    if (keep && p.models.indexOf(keep) > -1) s.value = keep;
    aiRefreshKeyLink();
    return;
  }
  // 已是 select: 刷新选项, 尽量保留原选择
  var cur = sel.value || aiLS(AI_LS_MODEL) || p.defaultModel;
  sel.innerHTML = p.models.map(function (m) {
    return '<option value="' + m + '">' + m + '</option>';
  }).join('');
  if (p.models.indexOf(cur) > -1) sel.value = cur;
  else if (p.defaultModel) sel.value = p.defaultModel;
  aiRefreshKeyLink();
}
// 【端点预填】切 provider 时把 API 地址刷成当前家的官方地址;
//   用户改过想保留? 切回来重填一次即可 —— 预填值和预设一致时 aiCall 不会重复拼接
function aiPrefillEndpoint(p) {
  var e = $id('uiAiEndpoint');
  if (!e) return;
  e.style.display = '';
  var v = p.urlCustom ? (p.baseHint || '') : (p.url || '');
  e.value = v;
}
// 【Key 获取链接】告诉用户去哪里拿密钥, 没有它新用户会卡在第一步
function aiRefreshKeyLink() {
  var p = aiProvider();
  aiPrefillEndpoint(p);
  var el = $id('uiAiKeyLink');
  if (!el) return;
  if (!p.keyHint) { el.innerHTML = ''; return; }
  var href = p.keyHint;
  if (p.id === 'custom') {
    el.innerHTML = '\u2139\ufe0f 自定义模式：填任意 OpenAI 兼容端点(如 OpenRouter / 自建代理 / vLLM)，模型名随端点而定';
    return;
  }
  el.innerHTML = '\u2139\ufe0f 还没有 Key？去 <a href="' + href + '" target="_blank" rel="noopener">' + href + '</a> 免费注册一个';
}

function aiSaveKey() {
  var p = aiProvider();
  var k = ((($id('uiApiKey') || {}).value) || '').trim();
  var m = ((($id('uiAiModel') || {}).value) || '').trim();
  if (!k) return toast('先把 API Key 粘进来再保存');
  aiLS(AI_LS_KEY, k); aiLS(AI_LS_MODEL, m); aiLS(AI_LS_PROVIDER, p.id);
  // 端点覆盖开关状态一并保存(重开页面后保持)

  aiSay('已存到本机浏览器，下次打开自动带上', 'ok');
  toast('AI 配置已保存到本机（Key 不会上传到任何服务器）');
}
function aiClearKey() {
  aiLS(AI_LS_KEY, ''); aiLS(AI_LS_MODEL, ''); aiLS(AI_LS_PROVIDER, '');
  aiLS(AI_LS_RELAY, ''); aiLS(AI_LS_RELAY_URL, ''); aiLS('lixiu_ai_ep_override', '');
  var a = $id('uiApiKey');
  if (a) a.value = '';
  // 模型下拉按当前 provider 的默认值回填, 而不是清空成空串
  aiRefreshModelList();
  aiSay('已清空');
  toast('已清空本机保存的 Key');
}
// 容错解析: 模型偶尔会裹 ```json 围栏或加一句话, 逐级退让地剥
function aiParseJson(content) {
  var s = String(content == null ? '' : content).trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  var obj = null;
  try { obj = JSON.parse(s); } catch (e) {
    var m = s.match(/\{[\s\S]*\}/);
    if (m) { try { obj = JSON.parse(m[0]); } catch (e2) {} }
    if (!obj) {
      var a = s.match(/\[[\s\S]*\]/);
      if (a) { try { obj = { layers: JSON.parse(a[0]) }; } catch (e3) {} }
    }
  }
  return obj;
}
function aiNum(v, d) { var n = parseFloat(v); return isFinite(n) ? n : d; }
// 把 AI 给的图层映射成编辑器内部结构(与本地解析、手绘图层完全一致 ⇒ 撤销栈 / .lixiu 都不用改)
function aiToLayers(obj) {
  var arr = Array.isArray(obj) ? obj : ((obj && obj.layers) || []);
  var out = [];
  arr.forEach(function (a) {
    if (!a || typeof a !== 'object') return;
    var k = String(a.type || '').toLowerCase();
    var kind = AI_TYPES.indexOf(k) > -1 ? k : 'rect';
    var L = uiNewLayer(kind, { name: String(a.name || UI_TYPE_NAME[kind] || '元素').slice(0, 24) });
    L.x = aiNum(a.x, L.x); L.y = aiNum(a.y, L.y);
    L.w = Math.max(2, aiNum(a.w != null ? a.w : a.width, L.w));
    L.h = Math.max(2, aiNum(a.h != null ? a.h : a.height, L.h));
    if (a.fill) L.fill = String(a.fill);
    if (a.radius != null) L.radius = Math.max(0, aiNum(a.radius, L.radius));
    if (a.opacity != null) {
      var o = aiNum(a.opacity, 1);
      L.opacity = o > 1 ? Math.min(1, o / 100) : Math.max(0, o);   // 模型可能给 0~100, 统一到 0~1
    }
    var t = a.text;
    if (typeof t === 'string') t = { content: t };
    if (t && typeof t === 'object') {
      L.text = L.text || {};
      if (t.content != null) L.text.content = String(t.content);
      if (t.size != null) L.text.size = Math.max(6, aiNum(t.size, 48));
      if (t.weight != null) L.text.weight = aiNum(t.weight, 400);
      if (t.color) L.text.color = String(t.color);
      if (t.align) L.text.align = ['left', 'center', 'right'].indexOf(t.align) > -1 ? t.align : 'center';
      if (t.lineHeight != null) L.text.lineHeight = aiNum(t.lineHeight, 1.3);
    }
    out.push(L);
  });
  return out;
}
// 按当前 provider 组装请求体 —— 不同家的字段能力不一样, 不能一套 body 通吃
function aiBuildBody(userText, extraSys, isTest) {
  var p = aiProvider();
  var body = {
    model: aiModel(),
    messages: [
      { role: 'system', content: AI_SYS + (extraSys ? '\n' + extraSys : '') },
      { role: 'user', content: userText }
    ],
    temperature: 0.3
  };
  if (p.opts.jsonFmt) body.response_format = { type: 'json_object' };
  // 只有方舟 seed 系列必须关 thinking, 否则推理轨迹混进正文, JSON.parse 必炸;
  // 其他家没有这个字段, 带了会被 400 拒绝, 所以严格判断
  if (p.opts.thinking) body.thinking = { type: 'disabled' };
  if (p.opts.extraBody) {
    for (var k in p.opts.extraBody) body[k] = p.opts.extraBody[k];
  }
  if (isTest) body.max_tokens = 8;   // 连通测试只回一个词, 最大限度省 token
  return body;
}
// 端点拼接: 用户给 base(可能带 /chat/completions 也可能只有 base), 统一拼出完整地址。
//   版本段判定: /v1 /v3 /compatible-mode/v1 /api/v3 等只补 /chat/completions, 裸域名才补 /v1
function aiEndpointJoin(base) {
  var b = String(base || '').trim().replace(/\/+$/, '');
  if (/\/chat\/completions$/.test(b)) return b;
  if (/\/(v[0-9]+|compatible-mode\/v[0-9]+|api\/v[0-9]+)$/.test(b)) return b + '/chat/completions';
  return b + '/v1/chat/completions';
}
// 统一出口: 成功返回解析后的对象, 任何失败返回 null 并已提示用户
function aiCall(userText, extraSys, isTest) {
  var p = aiProvider();
  var key = aiKey();
  if (!key) { aiSay('需要先填 API Key', 'err'); toast('AI 模式要先填你自己的 ' + p.name + ' API Key'); return Promise.resolve(null); }
  var url = p.url;
  if (p.urlCustom) {
    var ue = $id('uiAiEndpoint');
    url = (((ue && ue.value) || '').trim()) || 'https://api.openai.com/v1/chat/completions';
  }
  // 端点覆盖: 用户改过地址就以用户为准(预填值与预设一致时拼接结果相同, 无副作用)
  var ueAll = $id('uiAiEndpoint');
  var ueAllV = ((ueAll && ueAll.value) || '').trim();
  if (ueAllV && /^https?:\/\//.test(ueAllV)) {
    var _joined = aiEndpointJoin(ueAllV);
    if (_joined !== url) url = _joined;
  }
  // 中转开关(可选): 填了中转地址就走中转 —— 专给 CORS 被拦的服务商或企业网关用
  var relayOn = (aiLS(AI_LS_RELAY) === '1') && aiLS(AI_LS_RELAY_URL);
  if (relayOn) {
    // 透明中转: 请求体/鉴权头原样保留, 目标地址放 ?target= 查询参数
    url = aiLS(AI_LS_RELAY_URL).replace(/\/$/, '') + '?target=' + encodeURIComponent(url);
  }
  if (!aiModel()) { aiSay('模型名不能为空', 'err'); return Promise.resolve(null); }
  if (AI_BUSY) { toast('上一条还在生成，稍等一下'); return Promise.resolve(null); }
  aiReset();                                  // 建 AbortController + 45s 超时定时器 + 显示中止按钮
  aiSay('正在问 ' + p.name + '…（45 秒内无回应会自动中止）');
  var body = aiBuildBody(userText, extraSys, isTest);
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify(body),
    signal: AI_ABORT.signal            // 超时定时器 / 中止按钮 共用这一个 signal
  }).then(function (r) {
    return r.text().then(function (txt) { return { ok: r.ok, status: r.status, txt: txt }; });
  }).then(function (res) {
    if (!res.ok) {
      var m = '';
      try { m = (((JSON.parse(res.txt) || {}).error) || {}).message || JSON.parse(res.txt).message || ''; } catch (e) {}
      var friendly = aiHttpErr(res.status, m);
      aiSay('调用失败（HTTP ' + res.status + '）' + (friendly ? '：' + friendly : ''), 'err');
      toast('AI 调用失败：' + friendly, 4600);
      return null;
    }
    var data = null;
    try { data = JSON.parse(res.txt); } catch (e) { aiSay('服务端返回的不是 JSON', 'err'); return null; }
    var content = (((((data || {}).choices || [])[0] || {}).message) || {}).content || '';
    var obj = aiParseJson(content);
    if (!obj) { aiSay('AI 返回内容无法解析，换个说法再试', 'err'); toast('AI 返回的不是能识别的 JSON，换个说法再试一次', 4200); return null; }
    aiSay('AI 已返回', 'ok');
    return obj;
  }).catch(function (e) {
    // 方舟的错误响应不带 CORS 头, 浏览器读不到正文 → 只能在这里兜底, 千万别让它冒成未捕获异常
    if (AI_ABORTED || (e && e.name === 'AbortError')) {
      aiSay(AI_ABORTED ? '已中止' : '45 秒内没等到回应，已自动中止', 'err');
      toast(AI_ABORTED ? '已中止 AI 请求' : 'AI 生成超时：换个更简短的描述再试', 4000);
    } else {
      aiSay('请求没走通（多是 Key 无效，或网络被拦）', 'err');
      toast('AI 请求没走通：检查 Key 是否有效、模型是否已开通、网络是否正常', 4800);
    }
    return null;
  }).then(function (r) { aiDone(); return r; }, function () { aiDone(); return null; });
}
// 【Key/模型/端点输入实时去空格】粘贴密钥时最常见的事故就是首尾带空格 → 401。
//   oninput 实时 trim 首尾(中间不动), 光标跟到末尾, 用户无感。
function aiTrimBind() {
  ['uiApiKey', 'uiAiModel', 'uiAiEndpoint'].forEach(function (id) {
    var el = $id(id);
    if (!el) return;
    var origTrim = function () {
      var v = el.value, t = v.replace(/^\s+|\s+$/g, '');
      if (t !== v) { el.value = t; }
    };
    el.oninput = function () {
      origTrim();
      // 模型手填框: 值实时存 LS(切换 select/input 或刷新都不丢)
      if (el.id === 'uiAiModel' && el.tagName === 'INPUT') aiModelManualLS(el.value);
    };
    el.onblur = function () { el.value = el.value.trim(); };   // blur 再兜底一次
    el.onpaste = function (e) {
      // 粘贴内容直接 trim 后写入, 连中间那一下闪变都没有
      try {
        var txt = (e.clipboardData || window.clipboardData).getData('text') || '';
        if (txt !== txt.trim()) {
          e.preventDefault();
          el.value = txt.trim();
          if (el.id === 'uiAiModel' && el.tagName === 'INPUT') aiModelManualLS(el.value);
        }
      } catch (err) {}
    };
  });
}
// 【眼睛按钮】Key 明文/密文切换(切换不影响输入值)
function aiBindEye() {
  var b = $id('uiKeyEye');
  if (!b) return;
  b.onclick = function () {
    var el = $id('uiApiKey');
    if (!el) return;
    el.type = el.type === 'password' ? 'text' : 'password';
    b.classList.toggle('on', el.type === 'text');
  };
}
// 【中转配置】开关+地址绑定; 状态存 LS(AI_LS_RELAY / AI_LS_RELAY_URL)
function aiRelayBind() {
  var cb = $id('uiRelayOn'), url = $id('uiRelayUrl');
  if (cb) cb.onchange = function () {
    aiLS(AI_LS_RELAY, cb.checked ? '1' : '');
    if (cb.checked && url && !url.value.trim()) { url.focus(); toast('填一下中转地址, 否则开关不生效'); }
  };
  if (url) {
    url.onblur = function () { aiLS(AI_LS_RELAY_URL, url.value.trim()); };
  }
  // 回填
  var on = aiLS(AI_LS_RELAY) === '1', u = aiLS(AI_LS_RELAY_URL);
  if (cb) cb.checked = on;
  if (url && u) url.value = u;
}
// 【HTTP 错误分类】把服务商状态码翻成用户能懂的话(401/404/429/403/5xx)
function aiHttpErr(status, msg) {
  var m = String(msg || '');
  if (status === 401) return 'API Key 无效或还没生效（检查有没有多空格、是不是这家服务商的 Key）';
  if (status === 403) return 'Key 没有这个模型的权限（去服务商控制台开通模型/充值）';
  if (status === 404) return '模型或接口地址不存在（模型名/端点 URL 检查一下）';
  if (status === 429) return '触发限流或余额不足（稍后再试 / 去充值）';
  if (status >= 500) return '服务商内部错误, 稍后再试';
  if (/insufficient|balance|\u4f59\u989d/i.test(m)) return '余额不足: ' + m.slice(0, 80);
  return m ? m.slice(0, 100) : 'HTTP ' + status;
}
// 测试请求的省 token 参数: 只回一个词, 最多 8 个 token。
//   通过 aiBuildBody 的 opts.maxTokens 注入(见 aiBuildBody 补丁),
//   DeepSeek 等不支持 json_object 的家只回纯文本也算成功。
function aiTestKey() {
  aiSay('正在测试…（消耗你自己的少量 token）');
  aiCall('只回一句 {"ok":true}', '不管你收到什么，都只回 {"ok":true} 这一个 JSON。', true).then(function (o) {
    if (o) { aiSay('连接正常，Key 可用', 'ok'); toast('✅ 连通成功：地址、Key、模型都能用'); }
  });
}
function uiGenerateAI(raw, mode) {
  var u0 = ensureUI();
  aiCall('需求：' + raw + '\n画布沿用当前的 ' + u0.w + '×' + u0.h + '，除非我上面写明了别的尺寸。').then(function (obj) {
    if (!obj) return;
    var u = ensureUI();
    if (obj.w || obj.h) { u.w = clamp(aiNum(obj.w, u.w), 64, 4096); u.h = clamp(aiNum(obj.h, u.h), 64, 4096); }
    var layers = aiToLayers(obj);
    if (!layers.length) { toast('AI 没给出图层，把描述写具体一点再试', 4000); return; }
    pushUndo('AI 生成 UI');
    if (mode === 'replace') u.layers = layers;
    else layers.forEach(function (l) { u.layers.push(l); });
    UI_SEL = u.layers.length ? u.layers[u.layers.length - 1].id : null;
    uiLog('gen', raw, 'AI ' + (mode === 'replace' ? '清空重建' : '追加') + ' ' + layers.length + ' 个图层');
    var a = $id('uiCvW'), b = $id('uiCvH');
    if (a) a.value = u.w; if (b) b.value = u.h;
    renderUi(); touchProgress();
    toast('AI 生成了 ' + layers.length + ' 个图层 · Ctrl+Z 可撤销', 3400);
  });
}
function uiModifySelectedAI(l, raw) {
  aiCall('这个图层现在的 JSON：\n' + JSON.stringify(l)
    + '\n\n用户要改的是：' + raw
    + '\n\n只输出改完之后的这一个图层对象（单个 JSON，不要数组、不要包 layers）。',
    '这一次要返回单个图层对象本身，不要外层 layers 包装。')
    .then(function (obj) {
      if (!obj) return;
      var arr = aiToLayers(obj && obj.layers ? obj : { layers: [obj] });
      if (!arr.length) { toast('AI 没返回可用的图层', 3600); return; }
      var n = arr[0];
      pushUndo('AI 修改图层「' + l.name + '」');
      ['x', 'y', 'w', 'h', 'radius', 'fill', 'opacity', 'type'].forEach(function (k) {
        if (n[k] != null) l[k] = n[k];
      });
      if (n.text) { l.text = l.text || {}; Object.keys(n.text).forEach(function (k) { l.text[k] = n.text[k]; }); }
      uiLog('mod', raw, 'AI 修改「' + l.name + '」');
      renderUi(); touchProgress();
      toast('AI 已修改「' + l.name + '」· Ctrl+Z 可撤销', 3200);
    });
}

function uiGenerate() {
  var raw = ($id('uiPrompt').value || '').trim();
  if (!raw) return toast('先写一句你想要的 UI, 例如「1080x1080 深色底, 中间大标题, 底部金色标签」');
  var modeEl = document.querySelector('input[name=uiMode]:checked');
  var mode = modeEl ? modeEl.value : 'replace';
  if (aiEngine() === 'ai') return uiGenerateAI(raw, mode);   // AI 大模型模式(异步)
  var res = parseUiPrompt(raw);
  pushUndo('一键生成 UI');
  var u = ensureUI();
  u.w = res.w; u.h = res.h;
  if (mode === 'replace') u.layers = res.layers;
  else res.layers.forEach(function (l) { u.layers.push(l); });
  UI_SEL = u.layers.length ? u.layers[u.layers.length - 1].id : null;
  uiLog('gen', raw, (mode === 'replace' ? '清空重建' : '追加') + ' ' + res.layers.length + ' 个图层');
  renderUi(); touchProgress();
  toast('已生成 ' + res.layers.length + ' 个图层' + (res.notes.length ? ' · ' + res.notes.join(' / ') : '') + ' · Ctrl+Z 可撤销', 3200);
}
function uiModifySelected() {
  var l = uiFind(UI_SEL);
  if (!l) return toast('先在画布或图层列表里选中一个元素');
  var raw = ($id('uiPrompt').value || '').trim();
  if (!raw) return toast('先写一句要改什么, 例如「圆角改成 32, 换成金色」');
  if (aiEngine() === 'ai') return uiModifySelectedAI(l, raw);   // AI 大模型模式(异步)
  var p = parseUiModify(raw, l);
  if (!p.keys.length) return toast('没识别出可改的属性, 试试「颜色改金色 / 圆角 32 / 字号 60 / 放到右下角 / 不透明度 80%」', 3600);
  pushUndo('修改图层「' + l.name + '」');
  Object.keys(p.set).forEach(function (k) { l[k] = p.set[k]; });
  Object.keys(p.text).forEach(function (k) { l.text = l.text || {}; l.text[k] = p.text[k]; });
  if (p.shadow) { l.shadow = l.shadow || {}; Object.keys(p.shadow).forEach(function (k) { l.shadow[k] = p.shadow[k]; }); }
  uiLog('mod', raw, '修改「' + l.name + '」: ' + p.keys.join('、'));
  renderUi(); touchProgress();
  toast('已修改「' + l.name + '」: ' + p.keys.join('、'), 3000);
}
// 模板: 常见成片元素的现成配方
function uiTemplateLayers(key) {
  var u = ensureUI(), W = u.w, H = u.h, base = Math.min(W, H), M = Math.round(base * 0.06);
  if (key === 'sub') {
    var c = uiNewLayer('card', { name: '字幕卡片', radius: 28, fill: 'rgba(0,0,0,.6)' });
    c.w = W - M * 2; c.h = Math.round(base * 0.19); c.x = M; c.y = H - M - c.h;
    c.text = { content: '这里是一句字幕文案', size: Math.round(base * 0.045), weight: 500, color: '#ffffff', align: 'center', lineHeight: 1.3 };
    return [c];
  }
  if (key === 'cover') {
    var t1 = uiNewLayer('text', { name: '主标题' });
    t1.w = W - M * 2; t1.h = Math.round(base * 0.18); t1.x = M; t1.y = Math.round(H / 2 - base * 0.2);
    t1.text = { content: '主标题文字', size: Math.round(base * 0.12), weight: 700, color: '#ffffff', align: 'center' };
    var t2 = uiNewLayer('text', { name: '副标题' });
    t2.w = W - M * 2; t2.h = Math.round(base * 0.09); t2.x = M; t2.y = t1.y + t1.h + Math.round(base * 0.02);
    t2.text = { content: '副标题 / SLOGAN', size: Math.round(base * 0.042), weight: 400, color: '#ffffff', align: 'center' };
    return [t1, t2];
  }
  if (key === 'end') {
    var cd = uiNewLayer('card', { name: '片尾信息卡', radius: 30, fill: 'rgba(0,0,0,.62)' });
    cd.w = Math.round(W - M * 2.4); cd.h = Math.round(base * 0.3); cd.x = Math.round((W - cd.w) / 2); cd.y = Math.round((H - cd.h) / 2);
    cd.text = { content: '感谢观看', size: Math.round(base * 0.07), weight: 700, color: '#ffffff', align: 'center', lineHeight: 1.8 };
    var hint = uiNewLayer('text', { name: '引导关注' });
    hint.w = cd.w; hint.h = Math.round(base * 0.05); hint.x = cd.x; hint.y = cd.y + cd.h + Math.round(base * 0.03);
    hint.text = { content: '点赞 · 关注 · 转发', size: Math.round(base * 0.036), weight: 400, color: '#d4af37', align: 'center' };
    return [cd, hint];
  }
  if (key === 'btn') {
    var b = uiNewLayer('button', { name: '主按钮', fill: '#d4af37' });
    b.h = Math.round(base * 0.085); b.w = Math.round(b.h * 3.2);
    b.x = Math.round((W - b.w) / 2); b.y = Math.round(H - M - b.h - base * 0.08);
    b.shadow = { on: true, blur: 22, x: 0, y: 8, color: 'rgba(212,175,55,.5)' };
    b.text = { content: '立即查看', size: Math.round(b.h * 0.38), weight: 600, color: '#1a1d24', align: 'center' };
    return [b];
  }
  if (key === 'tag') {
    var tg = uiNewLayer('tag', { name: '标签组件', fill: '#d4af37', radius: 999 });
    tg.h = Math.round(base * 0.06); tg.w = Math.round(tg.h * 3.4);
    tg.x = M; tg.y = M;
    tg.text = { content: 'NEW', size: Math.round(tg.h * 0.5), weight: 600, color: '#1a1d24', align: 'center' };
    return [tg];
  }
  return [];
}
function uiApplyTemplate(key) {
  var u = ensureUI();
  if (u.layers.length >= 60) return toast('图层已达上限 60, 请先清理');
  var ls = uiTemplateLayers(key);
  if (!ls.length) return;
  pushUndo('套用模板');
  ls.forEach(function (l) { u.layers.push(l); });
  UI_SEL = ls[ls.length - 1].id;
  var NAME = { sub: '字幕卡片', cover: '封面标题', end: '片尾信息卡', btn: '主按钮', tag: '标签组件' };
  uiLog('tpl', '', '套用模板「' + (NAME[key] || key) + '」' + ls.length + ' 个图层');
  renderUi(); touchProgress();
  toast('已套用模板「' + (NAME[key] || key) + '」');
}

// ── 输出: 导出 PNG / 叠加到视频画布 ──────────────────────
function uiExportPng() {
  var u = ensureUI();
  if (!u.layers.length) return toast('画布还是空的, 先添加元素或生成 UI');
  var url = uiRaster();
  if (!url) return toast('导出失败: 无法生成图片');
  var a = document.createElement('a');
  a.href = url;
  a.download = 'UI设计_' + u.w + 'x' + u.h + '.png';
  a.click();
  toast('已导出 ' + a.download);
}
function uiToVideo() {
  var u = ensureUI();
  if (!u.layers.length) return toast('画布还是空的, 先生成或添加元素');
  var tr = PRJ.tracks.find(function (t) { return t.kind === 'subtitle'; });
  if (!tr) { tr = { id: uid('sub'), kind: 'subtitle', locked: false, muted: false, clips: [] }; PRJ.tracks.unshift(tr); }
  if (tr.locked) return toast('字幕/贴纸轨已锁定, 无法叠加');
  var url = uiRaster();
  if (!url) return toast('叠加失败: 无法生成图片');
  pushUndo('UI叠加到视频画布');
  var dur = Math.max(2, Math.min(5, (PRJ.duration || 10) - cur));
  var clip = { id: uid('ui'), t0: +cur.toFixed(2), t1: +(cur + dur).toFixed(2), ui: { img: url, w: u.w, h: u.h } };
  tr.clips.push(clip);
  PRJ.duration = Math.max(PRJ.duration, clip.t1 + 1);
  sel.clip = clip.id;
  renderAll(); touchProgress();
  var kb = Math.round(url.length / 1024);
  toast('已叠加到时间轴 @ ' + fmt(cur) + ' (' + dur.toFixed(1) + 's) · 可用关键帧加动效'
    + (kb > 900 ? ' · ⚠ 图片 ' + kb + 'KB, 工程文件会变大' : ''), 3600);
}

// ── 右栏 Tab 切换 + UI设计 面板总渲染 ────────────────────
function setRTab(name) {
  RTAB = name;
  var tabs = $id('edRTabs');
  if (tabs) Array.prototype.forEach.call(tabs.querySelectorAll('[data-rtab]'), function (b) {
    b.classList.toggle('on', b.getAttribute('data-rtab') === name);
  });
  ['props', 'progress', 'ui'].forEach(function (k) {
    var p = $id('rt-' + k); if (p) p.classList.toggle('on', k === name);
  });
  var R = $id('edRight'); if (R) R.classList.toggle('wide', name === 'ui');
  // 面板从 display:none 变可见后才能量到画布尺寸, 所以切换后再渲染一次
  if (name === 'ui') renderUi();
  if (name === 'progress') renderProgress();
  if (name === 'props') renderProps();
  drawFrame();
}
function uiTabActive() {
  var p = $id('rt-ui');
  return RTAB === 'ui' && !!p && p.classList.contains('on');
}
function renderUi() {
  var u = ensureUI();
  var cw = $id('uiCvW'), ch = $id('uiCvH');
  if (cw && document.activeElement !== cw) cw.value = u.w;
  if (ch && document.activeElement !== ch) ch.value = u.h;
  var sb = $id('uiSnap'), gb = $id('uiGrid'), gs = $id('uiGridSize');
  if (sb) sb.classList.toggle('on', !!u.snap);
  if (gb) gb.classList.toggle('on', !!u.showGrid);
  if (gs && document.activeElement !== gs) gs.value = String(u.grid);
  renderUiCanvas();
  renderUiLayers();
  renderUiProps();
  renderUiHist();
}

// ── UI设计 键盘路由(仅 UI设计 Tab 激活时生效) ─────────────
function uiKey(e) {
  var l = uiFind(UI_SEL);
  var ctrl = e.ctrlKey || e.metaKey;
  // 未选中图层时一律「不拦截」, 把按键交回时间轴, 避免在 UI 面板里按 Delete 却删不掉片段
  if (ctrl && (e.key === 'd' || e.key === 'D')) { if (!l) return false; e.preventDefault(); uiDuplicate(l); return true; }
  if (ctrl && (e.key === 'c' || e.key === 'C')) { if (!l) return false; e.preventDefault(); UI_CLIP = JSON.parse(JSON.stringify(l)); toast('已复制「' + l.name + '」'); return true; }
  if (ctrl && (e.key === 'v' || e.key === 'V')) {
    e.preventDefault();
    if (!UI_CLIP) { toast('剪贴板为空(先用 Ctrl+C 复制一个元素)'); return true; }
    pushUndo('粘贴图层');
    var u = ensureUI(), c = JSON.parse(JSON.stringify(UI_CLIP));
    c.id = uid('ui');
    c.x = clamp(c.x + Math.round(u.w * 0.03), 0, Math.max(0, u.w - c.w));
    c.y = clamp(c.y + Math.round(u.h * 0.03), 0, Math.max(0, u.h - c.h));
    u.layers.push(c); UI_SEL = c.id; renderUi(); toast('已粘贴');
    return true;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') { if (!l) return false; e.preventDefault(); uiDelLayer(l); return true; }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    if (!l) return false;                                  // 未选中图层 → 交回时间轴(移动播放头)
    e.preventDefault();
    var uu = ensureUI();
    var step = e.shiftKey ? Math.max(10, uu.grid * 4) : uu.grid;
    var nx = l.x + (e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0);
    var ny = l.y + (e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0);
    if (nx === l.x && ny === l.y) return true;
    pushUndo('微调「' + l.name + '」位置');
    l.x = nx; l.y = ny;
    renderUiCanvas(); uiSyncPosInputs();
    return true;
  }
  return false;
}

// ── UI设计 面板事件绑定 ──────────────────────────────────
function bindUi() {
  var tabs = $id('edRTabs');
  if (tabs) Array.prototype.forEach.call(tabs.querySelectorAll('[data-rtab]'), function (b) {
    b.onclick = function () { setRTab(this.getAttribute('data-rtab')); };
  });
  Array.prototype.forEach.call(document.querySelectorAll('#uiTools [data-add]'), function (b) {
    b.onclick = function () { uiAddLayer(this.getAttribute('data-add')); };
  });
  var apply = $id('uiCvApply');
  if (apply) apply.onclick = function () {
    var u = ensureUI();
    var w = clamp(+$id('uiCvW').value || u.w, 64, 4096), h = clamp(+$id('uiCvH').value || u.h, 64, 4096);
    if (w === u.w && h === u.h) return toast('尺寸未变化');
    pushUndo('修改画布尺寸');
    u.w = w; u.h = h;
    renderUi(); touchProgress();
    toast('画布已改为 ' + w + '×' + h);
  };
  var sb = $id('uiSnap');
  if (sb) sb.onclick = function () { var u = ensureUI(); u.snap = !u.snap; renderUi(); toast(u.snap ? '网格吸附: 开' : '网格吸附: 关'); };
  var gb = $id('uiGrid');
  if (gb) gb.onclick = function () { var u = ensureUI(); u.showGrid = !u.showGrid; renderUi(); toast(u.showGrid ? '网格/参考线: 显示' : '网格/参考线: 隐藏'); };
  var gs = $id('uiGridSize');
  if (gs) gs.onchange = function () { var u = ensureUI(); u.grid = clamp(+this.value || 8, 2, 100); renderUi(); };
  var gen = $id('uiGen'); if (gen) gen.onclick = uiGenerate;
  var mod = $id('uiModify'); if (mod) mod.onclick = uiModifySelected;

  // 【AI 大模型模式】回填本机已存的 Key/模型 + 绑定模式切换与三个按钮
  // (回填只写进输入框, 不自动发起任何请求 —— 不能悄悄消耗用户的额度)
  var _k = aiLS(AI_LS_KEY), _m = aiLS(AI_LS_MODEL), _pv = aiLS(AI_LS_PROVIDER);
  if (_k && $id('uiApiKey')) $id('uiApiKey').value = _k;
  if (_pv && $id('uiAiProvider')) $id('uiAiProvider').value = _pv;
  // (端点覆盖已改为「填了即用」, 不再需要开关回填)
  aiSyncBox();
  if (_m && $id('uiAiModel')) $id('uiAiModel').value = _m;
  Array.prototype.forEach.call(document.querySelectorAll('input[name=uiEngine]'), function (r) {
    r.onchange = function () { aiSyncBox(); aiSay(''); };
  });
  var _pvd = $id('uiAiProvider');
  if (_pvd) _pvd.onchange = function () { aiRefreshModelList(); aiSay(''); };
  var _ks = $id('uiKeySave'); if (_ks) _ks.onclick = aiSaveKey;
  var _kc = $id('uiKeyClear'); if (_kc) _kc.onclick = aiClearKey;
  var _kt = $id('uiKeyTest'); if (_kt) _kt.onclick = aiTestKey;
  var _ka = $id('uiAbort'); if (_ka) _ka.onclick = aiAbortNow;   // 中止当前 AI 请求
  aiTrimBind();                                                 // Key/模型/端点 oninput 实时去首尾空格
  aiBindEye();                                                  // Key 眼睛按钮: 明文/密文切换
  aiRelayBind();                                                // 中转开关+地址(高级折叠区)
  var _mm = $id('uiModelManual'); if (_mm) _mm.onclick = aiModelToggleManual;  // ✏️ 模型手填/下拉切换
  // 上次会话手填过模型 → 自动进手填模式(值从 LS 回填)
  if (aiModelManualLS()) {
    var _mEl = $id('uiAiModel');
    if (_mEl && _mEl.tagName === 'SELECT') {
      var _p = aiProvider();
      if (!(_p.models && _p.models.indexOf(aiModelManualLS()) > -1)) aiModelSwapToInput();
    }
  }
  Array.prototype.forEach.call(document.querySelectorAll('#uiTpl [data-tpl]'), function (b) {
    b.onclick = function () { uiApplyTemplate(this.getAttribute('data-tpl')); };
  });
  var ep = $id('uiExportPng'); if (ep) ep.onclick = uiExportPng;
  var tv = $id('uiToVideo'); if (tv) tv.onclick = uiToVideo;
  bindUiCanvas();
  // 窗口尺寸变化 → 手柄/选中框按新缩放重画
  window.addEventListener('resize', function () { if (uiTabActive()) renderUiCanvas(); });
}

// ── 视图渲染入口 ─────────────────────────────────────────
function renderAll() { renderTracks(); renderProps(); renderProgress(); renderUi(); updateTime(); drawFrame(); }

// ── 事件绑定(工具栏/播放/时间轴/快捷键) ───────────────────
function bind() {
  // 【UI设计模块】右栏 Tab / 组件按钮 / 画布交互 / 一句话生成 等全部事件
  bindUi();
  // 【ⓘ 说明图标】四大区的常驻提示文字 → 悬浮提示(一次性绑定, DOM 是静态的不会重建)
  bindHintTips();
  // 【半自动智能进度模块】面板标题栏点击折叠/展开
  var pgHead = $id('pgHead');
  if (pgHead) pgHead.onclick = togglePgPanel;
  $id('edNew').onclick = function () {
    if (!confirm('新建将清空当前工程(含撤销/重做记录), 继续?')) return;
    PRJ = blankProject(); MATS.length = 0; sel.clip = null; cur = 0;
    // 【UI操作撤销栈模块】新建工程 = 全新开始: 清空全局撤销/重做栈(不进工程文件)
    HISTORY.undo.length = 0; HISTORY.redo.length = 0; updateUndoBtns();
    $id('edName').value = PRJ.name;
    renderAll(); renderMatList();
    applyAuto(true);                                  // 新建: 进度全部重置(空工程 → 全部未勾选)、日志已清空
    toast('已新建空白工程 · 进度 / 日志 / 撤销记录已重置');
  };
  $id('edImportMat').onclick = $id('edLibUpload').onclick = function () { $id('edMatFile').click(); };
  $id('edMatFile').onchange = function (e) {
    var fs = e.target.files; var n = 0;
    Array.prototype.forEach.call(fs, function (f) { addMaterial(f); n++; });
    // 上传后必须让素材栏可见, 否则用户看不到缩略图 → 也就无从拖到轨道（原元凶）
    if (n) { var lib = $id('edLib'); if (lib) lib.classList.remove('hide'); }
    toast('已导入 ' + n + ' 个素材' + (n ? '，把缩略图拖到下方轨道即可入片' : '')); e.target.value = '';
  };
  $id('edImportPrj').onclick = function () { $id('edPrjFile').click(); };
  $id('edPrjFile').onchange = function (e) { if (e.target.files[0]) importProject(e.target.files[0]); e.target.value = ''; };
  // 【顶部工具栏】另存为 .lixiu(下载) / 保存到本机浏览器(防误关)、恢复存档
  $id('edExportPrj').onclick = exportProject;
  $id('edSave').onclick = saveLocal;
  $id('edRestore').onclick = restoreLocal;
  $id('edExportFrame').onclick = function () {
    drawFrame();
    var a = document.createElement('a');
    a.href = $id('edCanvas').toDataURL('image/png');
    a.download = (PRJ.name || 'frame') + '_' + fmt(cur).replace(':', '_') + '.png';
    a.click(); toast('当前帧已导出 PNG');
  };
  $id('edUndo').onclick = undo; $id('edRedo').onclick = redo;
  // 工程名: 可点可改, 允许清空(空则回落到「未命名工程」, 不影响导出的默认文件名)
  $id('edName').oninput = $id('edName').onchange = function () {
    PRJ.name = (this.value || '').trim();
    updateSaveBtn();
  };
  updateSaveBtn();
  renderArchive();

  $id('edPlay').onclick = play;
  $id('edToStart').onclick = function () { cur = 0; updateTime(); renderRuler(); drawFrame(); };
  $id('edToEnd').onclick = function () { cur = PRJ.duration; updateTime(); renderRuler(); drawFrame(); };
  $id('edPrevFrame').onclick = function () { cur = Math.max(0, cur - 1 / (PRJ.fps || 30)); updateTime(); renderRuler(); drawFrame(); };
  $id('edNextFrame').onclick = function () { cur = Math.min(PRJ.duration, cur + 1 / (PRJ.fps || 30)); updateTime(); renderRuler(); drawFrame(); };
  $id('edMark').onclick = function () { pushUndo('打点标记'); PRJ.markers.push({ t: cur, note: '标记@' + fmt(cur) }); renderRuler(); toast('已打点 @ ' + fmt(cur)); };
  $id('edSplit').onclick = splitClip;
  $id('edDel').onclick = delClip;
  $id('edCopy').onclick = copyClip;
  $id('edAddSub').onclick = addSubClip;
  // 【素材栏】常驻左栏: 收起 = 加 .hide, 播放条右侧「📦 素材」再切回来
  $id('edLibBtn').onclick = function () {
    var lib = $id('edLib');
    lib.classList.toggle('hide');
    toast(lib.classList.contains('hide') ? '素材栏已收起（点「📦 素材」再展开）' : '素材栏已展开');
  };
  $id('edLibClose').onclick = function () { $id('edLib').classList.add('hide'); toast('素材栏已收起（点「📦 素材」再展开）'); };

  $id('edAddVTrack').onclick = function () { addTrack('video'); };
  $id('edAddATrack').onclick = function () { addTrack('audio'); };
  $id('edAddSTrack').onclick = function () { addTrack('subtitle'); };
  // 【底部·工程档案】折叠开关(收起后画布变高)
  $id('arFold').onclick = function () { AR_FOLD = !AR_FOLD; renderArchive(); };
  // 【右侧编辑面板】整体收起/展开: 工具栏「🧩 面板」切回, 面板标题栏「◀ 收起」折叠
  var _rp = $id('edRightBtn');
  if (_rp) _rp.onclick = function () { RP_FOLD = !RP_FOLD; toggleRightPanel(); };
  var _rc = $id('edRightClose');
  if (_rc) _rc.onclick = function () { RP_FOLD = true; toggleRightPanel(); };

  // 轨道名列表 ⇄ 泳道 竖向滚动同步(否则轨道多起来后名字与片段错位)
  syncTrackScroll($id('edLanesCol'), $id('edTrackRows'));

  // 轨道图标(锁定/静音/删轨) 事件委托
  $id('edTrackRows').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var act = b.getAttribute('data-act'), tid = b.getAttribute('data-t');
    var tr = PRJ.tracks.find(function (t) { return t.id === tid; }); if (!tr) return;
    pushUndo();
    if (act === 'lock') { tr.locked = !tr.locked; toast(tr.locked ? '轨道已锁定' : '轨道已解锁'); }
    if (act === 'mute') { tr.muted = !tr.muted; toast(tr.muted ? '音频轨已静音' : '已取消静音'); }
    if (act === 'deltrack') { if (!confirm('删除轨道「' + tid + '」及其全部片段?')) return; PRJ.tracks = PRJ.tracks.filter(function (t) { return t.id !== tid; }); }
    renderTracks(); touchProgress();
  });

  // 标尺: 点击/拖动定位播放头
  var ruler = $id('edRuler');
  function seekAt(e) {
    var rect = $id('edLanesCol').getBoundingClientRect();
    cur = clamp((e.clientX - rect.left + $id('edLanesCol').scrollLeft) / PPS, 0, PRJ.duration);
    updateTime(); renderRuler(); drawFrame();
  }
  ruler.addEventListener('mousedown', function (e) {
    seekAt(e);
    function mv(ev) { seekAt(ev); }
    function up() { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); }
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  });
  // 泳道空白处点击: 取消选中
  $id('edLanes').addEventListener('mousedown', function (e) {
    if (e.target.classList.contains('ed-lane')) { sel.clip = null; renderTracks(); renderProps(); }
    else if (e.target.classList.contains('ed-clip')) { /* bindClipEvents 已处理 */ }
  });
  // 素材拖入轨道(drop)
  $id('edLanes').addEventListener('dragover', function (e) { e.preventDefault(); });
  $id('edLanes').addEventListener('drop', function (e) {
    e.preventDefault();
    var mid = e.dataTransfer.getData('text/x-mat'); if (!mid) return;
    var m = MATS.find(function (x) { return x.id === mid; }); if (!m) return;
    var lane = e.target.closest('.ed-lane'); if (!lane) return;
    var tr = PRJ.tracks.find(function (t) { return t.id === lane.getAttribute('data-track'); });
    if (!tr || tr.locked) return toast('目标轨道已锁定');
    if (tr.kind === 'subtitle' && m.type !== 'image') return toast('字幕轨只放字幕片段(用「＋字幕片段」按钮)');
    if (tr.kind !== 'subtitle' && m.type === 'image' && tr.kind === 'audio') return toast('音频轨只放音频');
    if (tr.kind === 'audio' && m.type !== 'audio') return toast('音频轨只放音频素材');
    pushUndo('放置素材到轨道');
    var rect = $id('edLanesCol').getBoundingClientRect();
    var t0 = clamp((e.clientX - rect.left + $id('edLanesCol').scrollLeft) / PPS, 0, PRJ.duration);
    var dur = m.dur || 3;
    tr.clips.push({ id: uid('c'), matId: m.id, t0: t0, t1: t0 + dur, in: 0, out: dur });
    if (m.type === 'image') { tr.clips[tr.clips.length - 1].t1 = t0 + 3; }
    PRJ.duration = Math.max(PRJ.duration, t0 + dur + 2);
    renderTracks(); toast('已放置「' + m.name + '」'); touchProgress();
  });

  // 画布: 滚轮缩放/拖拽平移/双击复位
  var wrap = $id('edWrap');
  wrap.addEventListener('wheel', function (e) {
    e.preventDefault();
    ZOOM = clamp(ZOOM * (e.deltaY < 0 ? 1.1 : 0.9), 0.2, 5);
    drawFrame();
  }, { passive: false });
  wrap.addEventListener('mousedown', function (e) {
    var sx = e.clientX, sy = e.clientY, ox = PANX, oy = PANY;
    function mv(ev) { PANX = ox + ev.clientX - sx; PANY = oy + ev.clientY - sy; drawFrame(); }
    function up() { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); }
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  });
  wrap.addEventListener('dblclick', function () { ZOOM = 1; PANX = 0; PANY = 0; drawFrame(); toast('画布已复位'); });

  // 【快捷键系统】空格/S/Delete/Ctrl+S/Ctrl+Z/Ctrl+Y
  document.addEventListener('keydown', function (e) {
    // 编辑器视图未激活或焦点在输入框时跳过
    var v = document.getElementById('viewEditor');
    if (!v || v.style.display === 'none' || v.offsetParent === null) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    // 【UI设计模块】UI设计 Tab 激活时, Delete / Ctrl+D / Ctrl+C / Ctrl+V / 方向键 优先作用于图层
    // (Ctrl+Z / Ctrl+Y 是全局统一的, 剪辑与 UI设计 共用同一套栈, 不在这里分流)
    if (uiTabActive() && uiKey(e)) return;
    if (e.code === 'Space') { e.preventDefault(); play(); }
    else if (e.key === 's' || e.key === 'S') { e.preventDefault(); splitClip(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); delClip(); }
    else if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveLocal(); }
    else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); undo(); }
    else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo(); }
    else if (e.key === 'ArrowLeft') { cur = Math.max(0, cur - (e.shiftKey ? 1 : 1 / (PRJ.fps || 30))); updateTime(); renderRuler(); drawFrame(); }
    else if (e.key === 'ArrowRight') { cur = Math.min(PRJ.duration, cur + (e.shiftKey ? 1 : 1 / (PRJ.fps || 30))); updateTime(); renderRuler(); drawFrame(); }
  });
}

// ── 启动 ─────────────────────────────────────────────────
function init() {
  bind();
  updateUndoBtns();
  renderAll();
  renderMatList();
  // 首次打开按当前工程数据自动预估一次(写日志)
  applyAuto(true);
  pushLog('auto', '工程打开 · 自动预估进度', 0, calcProgress().total);
  renderProgress();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

// 暴露给壳层(视图切换时重绘, 防止隐藏时 canvas 尺寸为 0)
window.__ed = {
  redraw: function () {
    if (document.getElementById('viewEditor').style.display !== 'none') {
      drawFrame(); renderProgress();
      if (uiTabActive()) renderUi();          // UI设计 画布依赖可见宽度, 切回来要重画
    }
  },
  // 供壳层/自动化测试读取当前进度快照
  progress: function () { var r = calcProgress(); return { total: r.total, groups: r.groups }; },
  prj: function () { return PRJ; },
  // 【UI设计模块】供壳层/自动化测试读取的设计快照
  ui: function () {
    var u = ensureUI();
    return { w: u.w, h: u.h, bg: u.bg, grid: u.grid, snap: u.snap, showGrid: u.showGrid,
      layers: u.layers, history: u.history, sel: UI_SEL, tab: RTAB };
  },
  // 【AI 大模型模式】只读接口(供审计断言用; Key 一律走 DOM 输入, 不从代码里暴露)
  ai: function () {
    return { engine: aiEngine(), busy: AI_BUSY, model: aiModel(), hasKey: !!aiKey() };
  },
  aiParseJson: aiParseJson,
  aiToLayers: aiToLayers,
  // 【多模型接入】供审计断言: 读取 provider 注册表 / 直接调 aiCall(配桩 fetch, 零额度)
  aiProviders: function () { return AI_PROVIDERS; },
  aiCall: aiCall,
  aiProvider: aiProvider,
  aiBuildBody: aiBuildBody,
  // 测试钩子: 把 45 秒超时临时缩短, 才能在不等 45 秒的前提下验证超时/中止路径。
  //   生产代码里只有一个 AI_TIMEOUT 变量, 没有专门的测试分支。
  aiTimeout: function (ms) { AI_TIMEOUT = ms > 0 ? ms : 45000; return AI_TIMEOUT; },
  // 【AI配置升级】错误分类函数(供审计断言: 401/404/429 文案可测)
  aiHttpErr: aiHttpErr,
  // 撤销栈快照(供测试断言: 剪辑与 UI设计 共用同一套栈)
  history: function () {
    return { undo: HISTORY.undo.map(function (x) { return x.name; }),
      redo: HISTORY.redo.map(function (x) { return x.name; }), max: HISTORY.MAX };
  },
  // 【素材互通】智能成片那边选/生成的素材, 直接汇进剪辑台素材栏(同一份工程)
  addFiles: function (fileList) {
    if (!fileList || !fileList.length) return 0;
    var n = 0;
    Array.prototype.forEach.call(fileList, function (f) {
      // 同名同大小视为同一个素材, 不重复入库
      if (MATS.some(function (m) { return m.name === f.name && m.size === f.size; })) return;
      addMaterial(f); n++;
    });
    if (n) {
      var lib = $id('edLib'); if (lib) lib.classList.remove('hide');
      renderMatList(); touchProgress();
      toast('已把 ' + n + ' 个素材同步到剪辑台素材栏');
    }
    return n;
  },
  // 素材/片段计数(供壳层与测试断言)
  count: function () {
    var c = 0; eachClip(function () { c++; });
    return { materials: MATS.length, clips: c };
  },
  // 直接在该素材的缩略图上触发一次拖放(供"送进剪辑台"按钮一键入轨)
  dropFirstMaterial: function (trackId) {
    var m = MATS[0]; if (!m) return false;
    var tr = PRJ.tracks.find(function (t) { return t.id === (trackId || 'v1'); }) ||
             PRJ.tracks.find(function (t) { return t.kind === 'video'; });
    if (!tr) return false;
    pushUndo();
    var dur = m.dur || 3;
    tr.clips.push({ id: uid('c'), matId: m.id, t0: 0, t1: dur, 'in': 0, out: dur });
    PRJ.duration = Math.max(PRJ.duration, dur + 2);
    renderTracks(); touchProgress(); toast('已把「' + m.name + '」放到 ' + tr.id + ' 轨道');
    return true;
  }
};
})();
