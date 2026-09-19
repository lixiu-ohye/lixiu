# 哩秀 H5 免费公网部署指南（Vercel / Cloudflare Pages）

H5 是**单文件静态站**（`h5/index.html`，含后端自动发现 + 国内镜像兜底），
后端通过 `backend.json` 自动寻址，**部署前端不需要动任何服务器**。

## 当前已上线的免费入口
| 入口 | 地址 | 状态 |
|---|---|---|
| WorkBuddy 托管（主用） | https://lixiu-h5.app.workbuddy.host/ | ✅ |
| GitHub Pages（备用） | https://lixiu-ohye.github.io/lixiu/h5.html | ✅ |

## 方案 A：Cloudflare Pages（推荐，国内连通性较好）
前置：注册 Cloudflare 账号，创建一个 API Token（权限 `Account > Cloudflare Pages > Edit`）。
```bash
npm i -g wrangler
wrangler login            # 浏览器一次性授权
wrangler pages deploy h5 --project-name lixiu-h5
# 上线后地址形如 https://lixiu-h5.pages.dev
```

## 方案 B：Vercel
前置：注册 Vercel 账号。
```bash
npm i -g vercel
vercel login              # 浏览器一次性授权
cd D:/lixiu-project
vercel --prod             # 读取仓库根 vercel.json，自动以 h5/ 为站根
# 上线后地址形如 https://lixiu-h5.vercel.app
```

## 无 Token 的一键方式（最省事）
直接去两家官网的 Dashboard → 「Import Git Repository」→ 选 `lixiu-ohye/lixiu`：
- Cloudflare Pages：Framework 选 `None`，Build command 留空，Output dir 填 `h5`
- Vercel：Framework 选 `Other`，Output dir 填 `h5`（会自动读 vercel.json）

## ⚠️ 部署后必做
新平台只是多一个前端壳，后端地址仍由 `backend.json` 自动发现。
若发现连不上，确认 `D:/lixiu-backend/deploy/PUBLIC_URL.txt` 与 GitHub `backend.json` 一致即可。
