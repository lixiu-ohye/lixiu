# -*- coding: utf-8 -*-
"""
build_editor.py —— 哩秀工作台【完整版】构建脚本(权威)
================================================================
职责: 把三个来源组装成单文件 workbench.html (可直传 GitHub Pages / Netlify)
  ① 壳层     : 侧边栏 + 顶栏 + 视图切换(本文件内联模板)
  ② 智能成片 : h5/index.html 原页面(字节级嵌入, 样式收窄到 .orig-page, 零改动)
  ③ 剪辑工作台: h5/editor/editor.{css,html,js} (源码资产独立, 本脚本组装)

⚠ 为什么不直接手改 workbench.html:
   workbench.html 是【构建产物】。任何手改都会在下一次构建时被覆盖。
   要改功能 → 改 h5/editor/ 下的资产 → 重跑本脚本。

用法:
   python h5/build_editor.py            # 构建并同步到仓库根 workbench.html
   python h5/build_editor.py --no-root  # 只产出 h5/workbench.html

历史: h5/build_workbench.py 是旧版(仅壳层, 无剪辑台), 已改名为 legacy 输出, 不再部署。
"""
import re, io, os, sys, hashlib

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
SRC_STUDIO = os.path.join(HERE, 'index.html')                  # 智能成片原页面
ED = os.path.join(HERE, 'editor')                              # 编辑器资产
OUT = os.path.join(HERE, 'workbench.html')                     # 构建产物(仓库 h5/)
OUT_ROOT = os.path.join(REPO, 'workbench.html')                # 部署目标(GitHub Pages 根目录)

def read(p):
    with io.open(p, encoding='utf-8') as f:
        return f.read()

# ── 1. 素材读取 ────────────────────────────────────────────────
studio = read(SRC_STUDIO)
ed_css = read(os.path.join(ED, 'editor.css'))
ed_html = read(os.path.join(ED, 'editor.html'))
ed_js = read(os.path.join(ED, 'editor.js'))

for name, txt in (('editor.css', ed_css), ('editor.html', ed_html), ('editor.js', ed_js)):
    assert txt.strip(), '编辑器资产为空: %s' % name
    assert '</script' not in txt.lower() or name != 'editor.js', 'editor.js 含 </script 会截断内联脚本'

# ── 2. 智能成片原页面: 三段提取 (与旧 build_workbench.py 同逻辑) ──
style_m = re.search(r'<style>[\s\S]*?</style>', studio)
orig_style = style_m.group(0) if style_m else ''
body_m = re.search(r'<body>([\s\S]*?)<script>', studio)
orig_body = body_m.group(1).strip() if body_m else ''
script_m = re.search(r'<script>[\s\S]*?</script>', studio)
orig_script = script_m.group(0) if script_m else ''
assert orig_style and orig_body and orig_script, '智能成片页面三段提取失败'
assert 'wrap' in orig_body, '智能成片业务内容缺失(wrap 未找到)'

# ── 3. 原样式作用域收窄: 前缀 .orig-page, 防止污染工作台与编辑器 ──
def scope_css(css):
    out = []
    for line in css.split('\n'):
        ls = line.strip()
        if ls.startswith('/*') or ls.startswith('@') or ls.startswith(':root'):
            out.append(line); continue
        m = re.match(r'^([^{}@]+)\{(.*)\}$', ls)
        if m:
            sel, body = m.group(1).strip(), m.group(2)
            if sel.startswith(':root'):
                out.append(line); continue
            sels = ', '.join('.orig-page ' + x.strip() for x in sel.split(','))
            out.append(sels + '{' + body + '}')
        else:
            out.append(line)
    return '\n'.join(out)

scoped_css = scope_css(orig_style[len('<style>'):-len('</style>')])

# ── 4. 组装模板 ────────────────────────────────────────────────
tpl = '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>哩秀工作台 · 剪辑工作台 + 智能成片</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>
tailwind.config = {
  darkMode: 'class',
  theme: { extend: { colors: {
    brand:{50:'#fdf2f6',100:'#fbe4ee',400:'#e8a0bf',500:'#d485a8',600:'#c17a9c',700:'#a35f80'},
    sidebar:{ DEFAULT:'#1f2330', hover:'#2a2f3e', active:'#3a3f52' }
  }}}
}
</script>
<style>
/* ↓↓↓↓↓↓↓↓↓ 【外层工作台骨架】专用样式 ↓↓↓↓↓↓↓↓↓ */
.wb-transition{transition:margin-left .25s ease, transform .25s ease}
#sidebar{width:240px}
#sidebar.collapsed{width:0;overflow:hidden}
.nav-item{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;font-size:14px;color:#aeb6c8;cursor:pointer;transition:background .15s,color .15s}
.nav-item:hover{background:#2a2f3e;color:#fff}
.nav-item.active{background:#3a3f52;color:#fff}
.nav-sub{display:none;padding-left:38px}
.nav-sub.open{display:block}
.nav-sub a{display:block;padding:6px 12px;border-radius:6px;font-size:13px;color:#8b93a7;cursor:pointer}
.nav-sub a:hover{color:#fff;background:#2a2f3e}
.main-scroll{overflow-y:auto;scrollbar-width:thin}
/* 视图容器: 编辑器与智能成片互斥显示
   --wb-chrome = 页头(56) + 创作台标签页(49) 的合计高度, 编辑器按剩余空间满高, 否则时间轴底部会被挤出屏幕 */
:root{--wb-chrome:105px}
#viewStudio{height:calc(100vh - var(--wb-chrome,105px));overflow-y:auto}
#viewEditor{height:calc(100vh - var(--wb-chrome,105px))}
/* 【创作台】顶部标签页: 同一份工程 · 素材互通(设计稿) */
.cb-tabs{display:flex;align-items:center;gap:6px;padding:7px 14px;background:#fff;border-bottom:1px solid #e5e7eb;flex-shrink:0}
.dark .cb-tabs{background:#1f2937;border-bottom-color:#374151}
.cb-tabs button{background:transparent;border:1px solid transparent;color:#4b5563;border-radius:8px;padding:6px 14px;font-size:13.5px;cursor:pointer;font-family:inherit}
.cb-tabs button:hover{background:#f3f4f6}
.cb-tabs button.on{background:#fdf2f6;border-color:#e8a0bf;color:#a35f80;font-weight:600}
.dark .cb-tabs button{color:#9ca3af}
.dark .cb-tabs button:hover{background:#374151}
.dark .cb-tabs button.on{background:#3a2b33;border-color:#9c6b85;color:#f0c6d8}
.cb-tabs .cb-note{margin-left:auto;font-size:11.5px;color:#9ca3af}
/* 设置视图: 只露该看的调试项 */
.orig-page .dbg-only{display:none}
.orig-page.set-mode .dbg-only{display:block}
/* 移动端抽屉 */
@media (max-width:768px){
  #sidebar{position:fixed;z-index:50;transform:translateX(-100%);height:100vh}
  #sidebar.show{transform:translateX(0)}
  #main{margin-left:0!important}
}
/* ↑↑↑↑↑↑↑↑↑ 工作台骨架样式结束 ↑↑↑↑↑↑↑↑↑ */

/* ↓↓↓ 以下为【智能成片原页面】样式(收窄到 .orig-page 作用域) ↓↓↓ */
:root{
  --rose:#e8a0bf;--rose-dark:#d485a8;--gold:#d4a574;--cream:#fdf6f0;
  --lavender:#c9b6d9;--bg:#fdf6f0;--card:#fffcf8;--ink:#4a3f42;--ink-2:#8a7b7e;
  --line:rgba(200,160,140,0.22);--ok:#1D9E75;--warn:#BA7517;--err:#E24B4A;
}
__SCOPED_CSS__

/* ↓↓↓ 【剪辑工作台】编辑器样式(h5/editor/editor.css) ↓↓↓ */
__EDITOR_CSS__
/* ↑↑↑ 编辑器样式结束 ↑↑↑ */
</style>
</head>
<body class="bg-gray-100 dark:bg-gray-900 min-h-screen">

<!-- ═══════════════ 【外层工作台骨架】开始 ═══════════════ -->
<aside id="sidebar" class="wb-transition fixed left-0 top-0 h-screen bg-sidebar flex flex-col">
  <div class="flex items-center gap-2 px-4 h-14 border-b border-white/10 shrink-0">
    <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-sm">哩</div>
    <span class="text-white font-semibold text-[15px]">哩秀工作台</span>
    <button onclick="toggleSidebar()" class="ml-auto text-gray-400 hover:text-white hidden md:block" title="收起侧边栏">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
    </button>
  </div>
  <nav class="flex-1 overflow-y-auto py-3 px-2 space-y-1 text-sm">
    <div class="nav-item active" data-nav="editor" onclick="nav('editor')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="12" rx="2"/><path d="M6 20h12M8 16v4M16 16v4"/><path d="M10 8l4 2-4 2z"/></svg>
      剪辑工作台
    </div>
    <div class="nav-item" data-nav="studio" onclick="nav('studio')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
      智能成片
    </div>
    <div class="nav-item" data-nav="materials" onclick="nav('materials')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
      素材库
      <svg class="ml-auto chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" onclick="event.stopPropagation();toggleSub(this)"><path d="M9 18l6-6-6-6"/></svg>
    </div>
    <div class="nav-sub" id="sub-materials">
      <a onclick="nav('materials')">全部素材</a>
      <a onclick="nav('materials')">最近上传</a>
    </div>
    <div class="nav-item" data-nav="jobs" onclick="nav('jobs')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      我的任务
    </div>
    <div class="nav-item" data-nav="settings" onclick="nav('settings')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008.6 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 8.6a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
      设置
    </div>
  </nav>
  <div class="p-3 border-t border-white/10 text-[11px] text-gray-500 shrink-0">
    剪辑工作台 · 智能成片 · 后端隧道自动发现
  </div>
</aside>

<div id="mask" class="fixed inset-0 bg-black/40 z-40 hidden md:hidden" onclick="toggleSidebar()"></div>

<div id="main" class="wb-transition min-h-screen md:ml-60 flex flex-col">
  <header class="sticky top-0 z-30 h-14 bg-white/80 dark:bg-gray-800/80 backdrop-blur border-b border-gray-200 dark:border-gray-700 flex items-center gap-3 px-4 shrink-0">
    <button onclick="toggleSidebar()" class="md:hidden text-gray-600 dark:text-gray-300" title="菜单">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
    </button>
    <h1 id="pageTitle" class="text-[16px] font-semibold text-gray-800 dark:text-gray-100">剪辑工作台</h1>
    <div class="ml-auto flex items-center gap-2">
      <button onclick="toggleTheme()" class="w-8 h-8 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300" title="切换主题">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="hidden dark:block"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="block dark:hidden"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
      </button>
      <button onclick="toggleSidebar()" class="hidden md:flex w-8 h-8 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 items-center justify-center text-gray-600 dark:text-gray-300" title="侧边栏">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></svg>
      </button>
      <div class="flex items-center gap-2 pl-2 border-l border-gray-200 dark:border-gray-700">
        <div class="w-7 h-7 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white text-xs flex items-center justify-center">头</div>
        <span class="text-sm text-gray-700 dark:text-gray-200 hidden sm:block">头目</span>
      </div>
    </div>
  </header>

  <!-- 【创作台】顶部标签页: AI 智能成片 / 手动剪辑 —— 同一份工程, 素材互通 -->
  <div id="cbTabs" class="cb-tabs">
    <button data-v="studio" class="on">✨ AI 智能成片</button>
    <button data-v="editor">✂ 手动剪辑</button>
    <span class="cb-note" id="cbNote">同一份工程 · 素材互通</span>
  </div>

  <main id="mainArea" class="flex-1 min-h-0 overflow-hidden">
    <!-- 视图一: 【剪辑工作台】(h5/editor/*, 默认激活) -->
__EDITOR_HTML__

    <!-- 视图二: 【智能成片】原页面整体嵌入(零改动, 样式收窄 .orig-page) -->
    <div id="viewStudio" class="orig-page" style="display:none">
__ORIG_BODY__
    </div>
  </main>
</div>
<!-- ═══════════════ 【外层工作台骨架】结束 ═══════════════ -->

<!-- 【智能成片原页面】脚本(零改动) -->
__ORIG_SCRIPT__

<!-- 【剪辑工作台】编辑器脚本(h5/editor/editor.js) -->
<script>
__EDITOR_JS__
</script>

<!-- 【外层工作台骨架】脚本: 侧边栏/子菜单/视图切换/主题 -->
<script>
// 侧边栏折叠
function toggleSidebar(){
  var sb = document.getElementById('sidebar');
  var mask = document.getElementById('mask');
  if (window.innerWidth < 768){
    sb.classList.toggle('show');
    mask.classList.toggle('hidden', !sb.classList.contains('show'));
  } else {
    sb.classList.toggle('collapsed');
    document.getElementById('main').classList.toggle('md:ml-60');
  }
}
// 子菜单折叠
function toggleSub(el){
  var sub = el.parentElement.querySelector('.nav-sub');
  if (sub) sub.classList.toggle('open');
}
// 视图切换: 剪辑工作台(editor) / 智能成片(studio) 互斥显示
function nav(where){
  document.querySelectorAll('.nav-item').forEach(function(n){ n.classList.remove('active'); });
  var item = document.querySelector('.nav-item[data-nav="'+where+'"]');
  if (item) item.classList.add('active');
  var titles = {editor:'剪辑工作台', studio:'智能成片', materials:'素材库', jobs:'我的任务', settings:'设置'};
  document.getElementById('pageTitle').textContent = titles[where] || '剪辑工作台';

  var isEditor = (where === 'editor' || where === 'materials');
  var ve = document.getElementById('viewEditor'), vs = document.getElementById('viewStudio');
  if (ve) ve.style.display = isEditor ? '' : 'none';
  if (vs) vs.style.display = isEditor ? 'none' : '';
  // 【创作台】顶部标签页与侧边栏联动: 素材库/设置等也归到对应标签
  var tabKey = isEditor ? 'editor' : 'studio';
  document.querySelectorAll('#cbTabs button').forEach(function(b){
    b.classList.toggle('on', b.getAttribute('data-v') === tabKey);
  });
  var note = document.getElementById('cbNote');
  if (note) note.textContent = (tabKey === 'editor')
    ? '手动剪辑 · 左侧素材栏拖进轨道即可入片'
    : '同一份工程 · 素材互通';
  // 设置视图: 才露后端地址等调试项
  if (vs) vs.classList.toggle('set-mode', where === 'settings');
  // 编辑器被重新显示时重绘 canvas(隐藏期间尺寸为 0, 直接绘制会糊)
  if (isEditor && window.__ed) setTimeout(function(){ window.__ed.redraw(); }, 40);
  // 素材库: 素材栏已改为常驻左栏, 导航到"素材库"时确保它是展开状态
  var lib = document.getElementById('edLib');
  if (lib && where === 'materials') lib.classList.remove('hide');

  // 智能成片视图内锚点跳转(元素不存在时静默跳过)
  if (!isEditor){
    var target = null;
    if (where === 'jobs') target = document.getElementById('jobsCard');
    if (where === 'settings') target = document.querySelector('.orig-page .card:last-of-type');
    if (target && target.scrollIntoView) target.scrollIntoView({behavior:'smooth', block:'start'});
  }
  if (window.innerWidth < 768){
    document.getElementById('sidebar').classList.remove('show');
    document.getElementById('mask').classList.add('hidden');
  }
}
// 【创作台】顶部标签页: 点击切换视图(与侧边栏 nav 共用同一套状态)
document.querySelectorAll('#cbTabs button').forEach(function(b){
  b.addEventListener('click', function(){ nav(b.getAttribute('data-v')); });
});
// 默认落在「AI 智能成片」(与设计稿一致); 待在编辑器 init 之后再切, 保证 canvas 首次绘制尺寸正确
window.addEventListener('DOMContentLoaded', function(){ nav('studio'); }, { once: true });

// 暗色模式(仅作用于智能成片视图的背景; 编辑器本身常暗)
function toggleTheme(){  var root = document.documentElement;
  var dark = root.classList.toggle('dark');
  try { localStorage.setItem('wb_theme', dark ? 'dark' : 'light'); } catch(e){}
  var op = document.querySelector('.orig-page');
  if (op) op.style.background = dark ? '#fdf6f0' : '';
}
(function(){
  try { if (localStorage.getItem('wb_theme') === 'dark') { document.documentElement.classList.add('dark'); } } catch(e){}
})();
</script>
</body>
</html>
'''

out = (tpl.replace('__SCOPED_CSS__', scoped_css)
          .replace('__EDITOR_HTML__', ed_html.strip())
          .replace('__ORIG_BODY__', orig_body)
          .replace('__ORIG_SCRIPT__', orig_script)
          .replace('__EDITOR_CSS__', ed_css.strip())
          .replace('__EDITOR_JS__', ed_js.strip()))

# ── 5. 产物自检(构建即审计) ────────────────────────────────────
leftover = [p for p in ('__SCOPED_CSS__', '__EDITOR_HTML__', '__ORIG_BODY__', '__ORIG_SCRIPT__', '__EDITOR_CSS__', '__EDITOR_JS__') if p in out]
assert not leftover, '占位符未替换: %s' % leftover
for must in ('id="viewEditor"', 'id="viewStudio"', 'id="pgBody"', 'id="edTip"', 'PG_GROUPS', 'lixiu-project'):
    assert must in out, '产物缺少关键标记: %s' % must

with io.open(OUT, 'w', encoding='utf-8', newline='\n') as f:
    f.write(out)

# 同步到仓库根(GitHub Pages 根目录部署)
if '--no-root' not in sys.argv:
    with io.open(OUT_ROOT, 'w', encoding='utf-8', newline='\n') as f:
        f.write(out)

def sha(p):
    return hashlib.md5(io.open(p, 'rb').read()).hexdigest()[:8]

print('OK  ->', OUT, len(out), 'bytes  md5:' + sha(OUT))
if '--no-root' not in sys.argv:
    print('SYNC->', OUT_ROOT, 'md5:' + sha(OUT_ROOT), '(两者一致)' if sha(OUT) == sha(OUT_ROOT) else '(⚠ 不一致)')
print('组成: 智能成片 body %d B / script %d B / 原样式收窄 %d B / 编辑器 css %d B html %d B js %d B'
      % (len(orig_body), len(orig_script), len(scoped_css), len(ed_css), len(ed_html), len(ed_js)))
