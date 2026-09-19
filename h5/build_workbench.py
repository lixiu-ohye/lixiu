# -*- coding: utf-8 -*-
# 把 h5/index.html 封装进 PC 工作台骨架(侧边栏+顶栏+主内容区), 原页面字节级嵌入零改动
# 用法: python build_workbench.py
import re, io, os

SRC  = os.path.join(os.path.dirname(__file__), 'index.html')
OUT  = os.path.join(os.path.dirname(__file__), 'workbench.html')
MOBILE = os.path.join(os.path.dirname(__file__), '..', 'index_mobile.html')  # 备份原移动版

s = io.open(SRC, encoding='utf-8').read()

# ── 原页面三段 ──────────────────────────────────────────────
style_m = re.search(r'<style>[\s\S]*?</style>', s)
orig_style = style_m.group(0) if style_m else ''

body_m = re.search(r'<body>([\s\S]*?)<script>', s)
orig_body = body_m.group(1).strip() if body_m else ''

script_m = re.search(r'<script>[\s\S]*?</script>', s)
orig_script = script_m.group(0) if script_m else ''

assert orig_style and orig_body and orig_script, '原页面三段提取失败'
assert 'wrap' in orig_body, '原页面业务内容缺失'

# ── 原样式作用域收窄 ────────────────────────────────────────
# 原 * 选择器与 body/html 级样式会污染工作台骨架, 必须收窄到 .orig-page 内
# 但业务 JS 用 innerHTML 写入的类名(.job/.st 等)不受影响 —— 那些在 .orig-page 内部
orig_style_scoped = orig_style
orig_style_scoped = orig_style_scoped.replace('<style>', '<style>\n/* ↓↓↓ 原页面样式(已收窄作用域到 .orig-page, 防止污染工作台) ↓↓↓ */\n', 1)
# 收窄规则: 选择器前缀 .orig-page (保持特异度可用, 不追求完美隔离)
def scope_css(css):
    # 跳过 @ 规则与 :root 变量块(变量放 :root 才能被内部继承)
    out = []
    for line in css.split('\n'):
        ls = line.strip()
        if ls.startswith('/*') or ls.startswith('@') or ls.startswith(':root'):
            out.append(line); continue
        # 单行规则 "a{...}" -> ".orig-page a{...}"
        m = re.match(r'^([^{}@]+)\{(.*)\}$', ls)
        if m:
            sel, body = m.group(1).strip(), m.group(2)
            # :root 里的变量已跳过; 选择器加前缀
            if sel.startswith(':root'): out.append(line); continue
            sels = ', '.join('.orig-page ' + x.strip() for x in sel.split(','))
            out.append(sels + '{' + body + '}')
        else:
            out.append(line)
    return '\n'.join(out)

# 提取 style 内容收窄
inner_css = orig_style[len('<style>'):-len('</style>')]
scoped_css = scope_css(inner_css)

# ── 工作台骨架 ──────────────────────────────────────────────
tpl = '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>哩秀工作台 · AI 智能成片</title>
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
/* 移动端抽屉 */
@media (max-width:768px){
  #sidebar{position:fixed;z-index:50;transform:translateX(-100%);height:100vh}
  #sidebar.show{transform:translateX(0)}
  #main{margin-left:0!important}
}
/* ↑↑↑↑↑↑↑↑↑ 工作台骨架样式结束 ↑↑↑↑↑↑↑↑↑ */

/* ↓↓↓ 以下全部为【原有页面代码】的样式(收窄到 .orig-page 作用域) ↓↓↓ */
:root{
  --rose:#e8a0bf;--rose-dark:#d485a8;--gold:#d4a574;--cream:#fdf6f0;
  --lavender:#c9b6d9;--bg:#fdf6f0;--card:#fffcf8;--ink:#4a3f42;--ink-2:#8a7b7e;
  --line:rgba(200,160,140,0.22);--ok:#1D9E75;--warn:#BA7517;--err:#E24B4A;
}
__SCOPED_CSS__
</style>
</head>
<body class="bg-gray-100 dark:bg-gray-900 min-h-screen">

<!-- ═══════════════ 【外层工作台骨架】开始 ═══════════════ -->
<!-- 侧边栏 Sidebar -->
<aside id="sidebar" class="wb-transition fixed left-0 top-0 h-screen bg-sidebar flex flex-col">
  <div class="flex items-center gap-2 px-4 h-14 border-b border-white/10 shrink-0">
    <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-sm">哩</div>
    <span class="text-white font-semibold text-[15px]">哩秀工作台</span>
    <button onclick="toggleSidebar()" class="ml-auto text-gray-400 hover:text-white hidden md:block" title="收起侧边栏">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
    </button>
  </div>
  <nav class="flex-1 overflow-y-auto py-3 px-2 space-y-1 text-sm">
    <div class="nav-item active" data-nav="studio" onclick="nav('studio')">
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
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stdoke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      我的任务
    </div>
    <div class="nav-item" data-nav="settings" onclick="nav('settings')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008.6 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.66 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 8.6a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.70 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
      设置
    </div>
  </nav>
  <div class="p-3 border-t border-white/10 text-[11px] text-gray-500 shrink-0">
    后端隧道自动发现 · 免费公网
  </div>
</aside>

<!-- 移动端遮罩 -->
<div id="mask" class="fixed inset-0 bg-black/40 z-40 hidden md:hidden" onclick="toggleSidebar()"></div>

<!-- 右侧区(主内容) -->
<div id="main" class="wb-transition min-h-screen md:ml-60 flex flex-col">
  <!-- 顶部通栏 Header -->
  <header class="sticky top-0 z-30 h-14 bg-white/80 dark:bg-gray-800/80 backdrop-blur border-b border-gray-200 dark:border-gray-700 flex items-center gap-3 px-4 shrink-0">
    <!-- 汉堡(仅移动端) -->
    <button onclick="toggleSidebar()" class="md:hidden text-gray-600 dark:text-gray-300" title="菜单">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
    </button>
    <h1 id="pageTitle" class="text-[16px] font-semibold text-gray-800 dark:text-gray-100">智能成片</h1>
    <div class="ml-auto flex items-center gap-2">
      <!-- 暗色切换 -->
      <button onclick="toggleTheme()" class="w-8 h-8 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300" title="切换主题">
        <svg id="iconSun" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="hidden dark:block"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
        <svg id="iconMoon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="block dark:hidden"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
      </button>
      <!-- 侧边栏收起/展开(PC) -->
      <button onclick="toggleSidebar()" class="hidden md:flex w-8 h-8 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 items-center justify-center text-gray-600 dark:text-gray-300" title="侧边栏">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></svg>
      </button>
      <!-- 用户信息 -->
      <div class="flex items-center gap-2 pl-2 border-l border-gray-200 dark:border-gray-700">
        <div class="w-7 h-7 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white text-xs flex items-center justify-center">头</div>
        <span class="text-sm text-gray-700 dark:text-gray-200 hidden sm:block">头目</span>
      </div>
    </div>
  </header>

  <!-- ═══════════ 主内容区: 【原有页面代码】整体嵌入(零改动) ═══════════ -->
  <main id="origRoot" class="flex-1 main-scroll bg-gray-100 dark:bg-gray-900">
    <div class="orig-page">
__ORIG_BODY__
    </div>
  </main>
</div>
<!-- ═══════════════ 【外层工作台骨架】结束 ═══════════════ -->

<!-- 【原有页面代码】脚本(零改动) -->
__ORIG_SCRIPT__

<!-- 【外层工作台骨架】脚本 -->
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
    var main = document.getElementById('main');
    main.classList.toggle('md:ml-60');
  }
}
// 子菜单折叠
function toggleSub(el){
  var sub = el.parentElement.querySelector('.nav-sub');
  if (sub) sub.classList.toggle('open');
}
// 导航(当前单页: 锚到对应卡片; 未来可扩展路由)
function nav(where){
  document.querySelectorAll('.nav-item').forEach(function(n){ n.classList.remove('active'); });
  var item = document.querySelector('.nav-item[data-nav="'+where+'"]');
  if (item) item.classList.add('active');
  var titles = {studio:'智能成片', materials:'素材库', jobs:'我的任务', settings:'设置'};
  document.getElementById('pageTitle').textContent = titles[where] || '智能成片';
  // 页面内锚点: jobs -> 我的任务卡片, settings -> 后端地址卡片
  var target = null;
  if (where === 'jobs') target = document.getElementById('jobsCard');
  if (where === 'settings') target = document.querySelector('.orig-page .card:last-of-type');
  if (target && target.scrollIntoView) target.scrollIntoView({behavior:'smooth', block:'start'});
  // 移动端点击后收起抽屉
  if (window.innerWidth < 768){
    document.getElementById('sidebar').classList.remove('show');
    document.getElementById('mask').classList.add('hidden');
  }
}
// 暗色模式
function toggleTheme(){
  var root = document.documentElement;
  var dark = root.classList.toggle('dark');
  try { localStorage.setItem('wb_theme', dark ? 'dark' : 'light'); } catch(e){}
  // 原 H5 是浅色设计, 暗色下给业务容器加浅色底保证可读(不改原样式)
  var op = document.querySelector('.orig-page');
  if (op) op.style.background = dark ? '#fdf6f0' : '';
}
(function(){
  try { if (localStorage.getItem('wb_theme') === 'dark') { document.documentElement.classList.add('dark'); var op=document.querySelector('.orig-page'); if(op) op.style.background='#fdf6f0'; } } catch(e){}
})();
</script>
</body>
</html>
'''

out = tpl.replace('__SCOPED_CSS__', scoped_css)
out = out.replace('__ORIG_BODY__', orig_body)
out = out.replace('__ORIG_SCRIPT__', orig_script)

io.open(OUT, 'w', encoding='utf-8', newline='\n').write(out)
print('OK ->', OUT, len(out), 'bytes')
print('orig body:', len(orig_body), 'bytes; orig script:', len(orig_script), 'bytes; scoped css:', len(scoped_css), 'bytes')
