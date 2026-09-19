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
// 片段: {id, matId, t0, t1, in/out(素材内), subtitle:{...}, kf:[...], fx:{...}}
var PRJ = blankProject();
var MATS = [];                     // 素材池(会话级, ObjectURL 不入工程)
var sel = { clip: null, track: null };   // 当前选中
var cur = 0;                       // 播放头时间(秒)
var playing = false;
var PPS = 60;                      // 每秒像素(时间轴缩放)
var undoStack = [], redoStack = [];
var UID = 1; function uid(p) { return (p || 'c') + '_' + Date.now().toString(36) + '_' + (UID++); }

function blankProject() {
  return {
    name: '未命名工程', canvas: { w: 1280, h: 720 }, fps: 30, duration: 10,
    tracks: [
      { id: 'sub1', kind: 'subtitle', locked: false, muted: false, clips: [] },
      { id: 'v1', kind: 'video', locked: false, muted: false, clips: [] },
      { id: 'a1', kind: 'audio', locked: false, muted: false, clips: [] }
    ],
    materials: [], markers: [],
    // 【半自动智能进度模块】工程内持久化数据(随 .lixiu 读写)
    stats: freshStats(),      // 单调累计的行为事实: 分割次数 / 是否预览全片 / 是否导出过工程
    progress: freshProgress() // 任务勾选明细 + 人工锁定 + 备注 + 里程碑 + 进度日志
  };
}
function freshStats() { return { cuts: 0, previewed: false, exported: false }; }
function freshProgress() { return { items: {}, notes: '', milestones: [], log: [] }; }
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
  var t = document.createElement('div'); t.className = 'ed-toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function () { t.remove(); }, ms || 2200);
}
function $id(x) { return document.getElementById(x); }

// ── 撤销/重做(快照栈, 简单可靠) ──────────────────────────
function snapshot() { return JSON.stringify({ prj: PRJ, mats: PRJ.materials }); }
function pushUndo() { undoStack.push(snapshot()); if (undoStack.length > 50) undoStack.shift(); redoStack.length = 0; updateUndoBtns(); }
function restore(s) { var o = JSON.parse(s); PRJ = o.prj; MATS.forEach(function (m) { var hit = PRJ.materials.find(function (x) { return x.id === m.id; }); if (hit) hit._live = m; }); sel.clip = null; renderAll(); }
function undo() { if (!undoStack.length) return toast('没有可撤销的操作'); redoStack.push(snapshot()); restore(undoStack.pop()); updateUndoBtns(); toast('已撤销'); }
function redo() { if (!redoStack.length) return toast('没有可重做的操作'); undoStack.push(snapshot()); restore(redoStack.pop()); updateUndoBtns(); toast('已重做'); }
function updateUndoBtns() { $id('edUndo').disabled = !undoStack.length; $id('edRedo').disabled = !redoStack.length; }

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
  if (!MATS.length) { box.innerHTML = '<div style="color:#6f7686;font-size:12px;text-align:center;padding:20px 6px">还没有素材<br>点上面按钮上传 mp4/jpg/png/mp3</div>'; return; }
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
  renderRuler();
  bindClipEvents();
}

function clipKind(c) {
  if (!c.matId) return 'subtitle';
  var m = MATS.find(function (x) { return x.id === c.matId; });
  return m ? m.type : (c._matType || 'video');
}
function matAlive(id) { return !!MATS.find(function (m) { return m.id === id; }); }
function clipTitle(c) {
  if (!c.matId) return (c.subtitle && c.subtitle.text ? c.subtitle.text : '字幕') + ' (' + c.t0.toFixed(1) + 's-' + c.t1.toFixed(1) + 's)';
  var m = MATS.find(function (x) { return x.id === c.matId; });
  return (m ? m.name : '缺失素材') + ' (' + c.t0.toFixed(1) + 's-' + c.t1.toFixed(1) + 's)';
}
function clipLabel(c) {
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
  pushUndo();
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
    if (c.matId && !tr.muted) { var m = MATS.find(function (x) { return x.id === c.matId; }); if (m && m.el && m.el.play && cur >= c.t0 && cur <= c.t1) { try { m.el.currentTime = (c.in || 0) + (cur - c.t0); m.el.play(); } catch (e) {} } }
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
  if (!c.matId) {
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
  if (!c.matId) {
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
function exportProject() {
  ensureProgress();
  // 导出即视为达成「输出阶段 · 导出工程文件」→ 先置标记再算进度, 保证写进文件的进度是最新的
  var before = calcProgress().total;
  PRJ.stats.exported = true;
  applyAuto(true);
  var pg = calcProgress();
  pushLog('auto', '导出 .lixiu 工程文件', before, pg.total);
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
    // 素材只存引用(名字+类型), 不嵌素材本体 —— 导入后按名提示重传
    materials: (PRJ.materials || []).map(function (m) { return { name: m.name, type: m.type }; })
  };
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (PRJ.name || '工程') + '.lixiu';
  a.click();
  renderProgress();
  toast('工程已导出: ' + a.download + ' (含进度 ' + pg.total + '% / 备注 / 里程碑 / ' + PRJ.progress.log.length + ' 条日志)', 3200);
}

function importProject(file) {
  var rd = new FileReader();
  rd.onload = function () {
    try {
      var d = JSON.parse(rd.result);
      if (d.magic !== 'lixiu-project') throw new Error('不是 .lixiu 工程文件');
      pushUndo();
      var impBefore = calcProgress().total;                    // 导入前(旧工程)的百分比
      PRJ = { name: d.name, canvas: d.canvas, fps: d.fps || 30, duration: d.duration, tracks: d.tracks,
        materials: d.materials || [], markers: d.markers || [],
        // 进度配置: 新工程读 progress, 旧工程(无该字段)回退到默认空进度
        stats: d.stats || freshStats(),
        progress: d.progress ? { items: d.progress.items || {}, notes: d.progress.notes || '',
          milestones: d.progress.milestones || [], log: d.progress.log || [] } : freshProgress() };
      // 素材引用标记缺失, 等用户重传同名素材自动绑定
      PRJ.tracks.forEach(function (tr) { tr.clips.forEach(function (c) { if (c.matId) c._miss = true; }); });
      $id('edName').value = PRJ.name;
      sel.clip = null; cur = 0;
      ensureProgress();
      renderAll(); renderMatList();
      // 导入后不自动覆盖(恢复历史配置优先), 仅提示
      var r = calcProgress();
      pushLog('auto', '导入工程「' + PRJ.name + '」· 恢复进度 ' + r.total + '%', impBefore, r.total);
      renderProgress();
      var missCnt = 0; eachClip(function (c) { if (c.matId && !matAlive(c.matId)) missCnt++; });
      toast('工程已恢复: ' + PRJ.name + ' · 进度 ' + r.total + '% / 备注 / 里程碑 ' + PRJ.progress.milestones.length
        + ' 个 / 日志 ' + PRJ.progress.log.length + ' 条' + (missCnt ? ' · ⚠ ' + missCnt + ' 个片段素材缺失, 请重传同名文件' : ''), 4500);
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
var PG_HIST_OPEN = false;         // 日志子面板展开态
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
  // ── 项目备注 ──
  html += '<div class="pg-sec"><h5>📝 项目备注</h5>'
    + '<textarea class="pg-notes" id="pgNotes" placeholder="记录本项目制作说明 / 交付要求 / 待办…(随工程保存)">' + esc(PRJ.progress.notes) + '</textarea></div>';
  // ── 里程碑 ──
  var ms = PRJ.progress.milestones;
  html += '<div class="pg-sec"><h5>🚩 里程碑 <span style="color:#7b8294;font-weight:400">' + ms.length + ' 个</span></h5>'
    + '<div class="pg-ms-row"><input id="pgMsName" placeholder="如: 粗剪完成 / 字幕定稿">'
    + '<button id="pgMsAdd" title="以当前播放头时间记录里程碑">标记</button></div>';
  if (ms.length) {
    html += '<div id="pgMsList">' + ms.map(function (m, i) {
      return '<div class="pg-ms-item"><span class="tt" data-msgo="' + m.t + '" title="点击定位到该时间">' + fmtT(m.t) + '</span>'
        + '<span class="nn">' + esc(m.name) + '</span>'
        + '<button data-msdel="' + i + '" title="删除该里程碑">✕</button></div>';
    }).join('') + '</div>';
  } else html += '<div class="pg-empty">还没有里程碑</div>';
  html += '</div>';
  // ── 进度变更日志(可折叠子面板) ──
  var log = PRJ.progress.log;
  html += '<div class="pg-sec"><h5>🧾 进度历史'
    + '<button id="pgHistToggle">' + (PG_HIST_OPEN ? '收起日志' : '查看进度历史') + ' (' + log.length + ')</button></h5>'
    + '<div class="pg-log' + (PG_HIST_OPEN ? '' : ' hide') + '" id="pgLog">'
    + (log.length ? log.slice().reverse().map(function (l) {
      return '<div class="pg-log-item"><span class="pg-tag t-' + l.type + '">' + (PG_TYPE_NAME[l.type] || l.type) + '</span>'
        + '<span class="tm">' + esc(l.ts) + '</span><br>'
        + '<span class="dt">' + esc(l.detail) + '</span><br>'
        + '<span class="df">' + (l.before != null ? l.before + '% → ' + l.after + '%' : '') + '</span></div>';
    }).join('') : '<div class="pg-empty">暂无进度记录</div>')
    + '</div>'
    + (PG_HIST_OPEN || log.length ? '<div style="display:flex;gap:6px;margin-top:6px"><button class="ed-btn" id="pgLogClear" style="flex:1">🗑 清空日志</button></div>' : '')
    + '</div>';

  box.innerHTML = html;
  bindProgress(r);
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
  Array.prototype.forEach.call(document.querySelectorAll('#pgBody [data-msdel]'), function (el) {
    el.onclick = function () {
      ensureProgress();
      var i = +this.getAttribute('data-msdel'), m = PRJ.progress.milestones[i];
      var msB2 = calcProgress().total;                         // 变更前百分比
      PRJ.progress.milestones.splice(i, 1);
      if (m) pushLog('manual', '删除里程碑「' + m.name + '」', msB2, calcProgress().total);
      renderProgress();
    };
  });
  Array.prototype.forEach.call(document.querySelectorAll('#pgBody [data-msgo]'), function (el) {
    el.onclick = function () {
      cur = clamp(+this.getAttribute('data-msgo') || 0, 0, PRJ.duration);
      updateTime(); renderRuler(); drawFrame();
    };
  });
  // 日志子面板
  var hb = $id('pgHistToggle');
  if (hb) hb.onclick = function () { PG_HIST_OPEN = !PG_HIST_OPEN; renderProgress(); };
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
function showTip(title, body, locked) {
  var tip = $id('edTip'); if (!tip) return;
  tip.innerHTML = '<span class="tp-h">检测依据 · ' + esc(title) + '</span>' + esc(body)
    + (locked ? '<br><b>该项已人工锁定, 自动检测不再覆盖</b>' : '');
  tip.classList.add('show');
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

// ── 视图渲染入口 ─────────────────────────────────────────
function renderAll() { renderTracks(); renderProps(); renderProgress(); updateTime(); drawFrame(); }

// ── 事件绑定(工具栏/播放/时间轴/快捷键) ───────────────────
function bind() {
  // 【半自动智能进度模块】面板标题栏点击折叠/展开
  var pgHead = $id('pgHead');
  if (pgHead) pgHead.onclick = togglePgPanel;
  $id('edNew').onclick = function () {
    if (!confirm('新建将清空当前工程(可 Ctrl+Z 撤销), 继续?')) return;
    pushUndo(); PRJ = blankProject(); MATS.length = 0; sel.clip = null; cur = 0;
    $id('edName').value = PRJ.name;
    renderAll(); renderMatList();
    applyAuto(true);                                  // 新建: 进度全部重置(空工程 → 全部未勾选)、日志已清空
    toast('已新建空白工程 · 进度与日志已重置');
  };
  $id('edImportMat').onclick = $id('edLibUpload').onclick = function () { $id('edMatFile').click(); };
  $id('edMatFile').onchange = function (e) {
    var fs = e.target.files; var n = 0;
    Array.prototype.forEach.call(fs, function (f) { addMaterial(f); n++; });
    toast('已导入 ' + n + ' 个素材' + (n ? ', 拖到时间轴使用' : '')); e.target.value = '';
  };
  $id('edImportPrj').onclick = function () { $id('edPrjFile').click(); };
  $id('edPrjFile').onchange = function (e) { if (e.target.files[0]) importProject(e.target.files[0]); e.target.value = ''; };
  $id('edExportPrj').onclick = exportProject;
  $id('edExportFrame').onclick = function () {
    drawFrame();
    var a = document.createElement('a');
    a.href = $id('edCanvas').toDataURL('image/png');
    a.download = (PRJ.name || 'frame') + '_' + fmt(cur).replace(':', '_') + '.png';
    a.click(); toast('当前帧已导出 PNG');
  };
  $id('edUndo').onclick = undo; $id('edRedo').onclick = redo;
  $id('edName').onchange = function () { PRJ.name = this.value; };

  $id('edPlay').onclick = play;
  $id('edToStart').onclick = function () { cur = 0; updateTime(); renderRuler(); drawFrame(); };
  $id('edToEnd').onclick = function () { cur = PRJ.duration; updateTime(); renderRuler(); drawFrame(); };
  $id('edPrevFrame').onclick = function () { cur = Math.max(0, cur - 1 / (PRJ.fps || 30)); updateTime(); renderRuler(); drawFrame(); };
  $id('edNextFrame').onclick = function () { cur = Math.min(PRJ.duration, cur + 1 / (PRJ.fps || 30)); updateTime(); renderRuler(); drawFrame(); };
  $id('edMark').onclick = function () { pushUndo(); PRJ.markers.push({ t: cur, note: '标记@' + fmt(cur) }); renderRuler(); toast('已打点 @ ' + fmt(cur)); };
  $id('edSplit').onclick = splitClip;
  $id('edDel').onclick = delClip;
  $id('edCopy').onclick = copyClip;
  $id('edAddSub').onclick = addSubClip;
  $id('edLibBtn').onclick = function () { $id('edLib').classList.toggle('show'); };
  $id('edLibClose').onclick = function () { $id('edLib').classList.remove('show'); };

  $id('edAddVTrack').onclick = function () { pushUndo(); PRJ.tracks.push({ id: uid('v'), kind: 'video', locked: false, muted: false, clips: [] }); renderTracks(); toast('已加视频轨'); };
  $id('edAddATrack').onclick = function () { pushUndo(); PRJ.tracks.push({ id: uid('a'), kind: 'audio', locked: false, muted: false, clips: [] }); renderTracks(); toast('已加音频轨'); };

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
    pushUndo();
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
    if (e.code === 'Space') { e.preventDefault(); play(); }
    else if (e.key === 's' || e.key === 'S') { e.preventDefault(); splitClip(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); delClip(); }
    else if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); exportProject(); }
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
  redraw: function () { if (document.getElementById('viewEditor').style.display !== 'none') { drawFrame(); renderProgress(); } },
  // 供壳层/自动化测试读取当前进度快照
  progress: function () { var r = calcProgress(); return { total: r.total, groups: r.groups }; },
  prj: function () { return PRJ; }
};
})();
