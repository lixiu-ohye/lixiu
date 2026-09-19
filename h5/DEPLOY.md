# 哩秀 H5 · 部署说明

> 架构：**一个后端 + 多个前端载体**（H5 网页 / 微信小程序）。
> AI 调用全部走后端，前端只是壳 —— 所以后端必须先有公网地址，H5 才有意义。

---

## ⭐ 当前线上状态（2026-09-19 实测全绿）

| 入口 | 地址 | 状态 |
|---|---|---|
| **Netlify**（国内连通较好） | https://lixiu-h5.netlify.app | ✅ 200 |
| WorkBuddy Sites（主用） | https://lixiu-h5.app.workbuddy.host/ | ✅ 200 |
| GitHub Pages（备用） | https://lixiu-ohye.github.io/lixiu/h5.html | ✅ 200 |

三个入口是**同一份单文件 H5**，后端地址靠「自动发现」获取（见下），无需手填。
后端公网隧道由 `D:\lixiu-backend\deploy\public_daemon.js` 守护（cloudflared 优先，
serveo 兜底），地址变化会自动同步到 GitHub 的 `backend.json`。

### 后端地址自动发现（为何链接永不过期）

H5 启动时按序尝试四个源拉最新后端地址，**拿到后必须 ping 通才采用**：
`raw.githubusercontent.com/lixiu-ohye/lixiu/main/backend.json` →
`ghproxy.net`（国内镜像，实时）→ `fastly.jsdelivr.net` → `cdn.jsdelivr.net`（兜底）。
也可用 `?api=<后端地址>` 链接参数手动指定（优先级最高）。

### Netlify 增量部署（PAT 已存 D:\lixiu-backend\deploy\_netlify_pat.txt）

```bash
cd D:/lixiu-backend/deploy && D:/tools/node.exe _netlify_deploy.js
```
⚠️ 新账号部署后若 401 Login Redirect：项目 Settings → **项目可见度 → 公共**（团队级开关，API 改不动）。

## 一、H5 前端放哪（三种，任选）

### 方案 1：Vercel ✅ 头目已选定

1. 把 `D:\lixiu-project` 推到 GitHub（仓库已存在 `lixiu-ohye/lixiu`）
2. vercel.com → Import Git Repository → 选该仓库
3. **Root Directory 填 `h5`**（只部署这一个目录）
4. Framework Preset 选 `Other` / 静态，Build Command 留空
5. Deploy → 得到 `https://xxx.vercel.app`（免费额度对静态站绰绰有余：100GB 流量/月）

⚠️ **关键一步**：把 Vercel 域名加进后端 CORS，否则请求会被浏览器拦：

```bash
# 后端启动时加环境变量（已支持，见 backend/config.py 的 LIXIU_CORS_EXTRA）
LIXIU_CORS_EXTRA="https://xxx.vercel.app"
```
加了自定义域名就把两个都写上，逗号分隔。

### 方案 2：GitHub Pages（备选，零成本且 CORS 已放行）

仓库已存在：`git@github.com:lixiu-ohye/lixiu.git`（main 分支）。
后端 CORS 白名单里**已经有** `https://lixiu-ohye.github.io`，所以**不用改后端**。

```bash
cd D:/lixiu-project
git add h5/index.html
git commit -m "feat(h5): 移动端 H5 成片页(选素材→进度→预览保存)"
git push origin main
```
然后在 GitHub 仓库 Settings → Pages → 选 main 分支根目录。
线上地址：**`https://lixiu-ohye.github.io/h5/`**

### 方案 2：Vercel

连仓库一键部署，得到 `https://xxx.vercel.app`。
⚠️ 需把该域名加到后端：`LIXIU_CORS_EXTRA="https://xxx.vercel.app"`（已支持环境变量追加）。

### 方案 3：云服务器 / 任意静态托管

同上，记得把域名加进 `LIXIU_CORS_EXTRA`。

---

## 二、后端公网地址怎么来（真正的卡点）

⚠️ **Vercel 跑不了这个后端** —— Serverless 有执行时长限制，而成片要跑 ffmpeg + whisper，是分钟级长任务。

| 方案 | 成本 | 是否需要 appid | 是否需要备案 | 说明 |
|---|---|---|---|---|
| **微信云托管** | **首环境送 3 个月免费额度** | ✅ 需要（绑定小程序） | 免备案 | 最省事，Dockerfile 已就绪，域名 `*.wxcloudrun.com` |
| **云服务器**（腾讯云轻量等） | 约 60–100 元/月 | ❌ 不需要 | **需要**（大陆节点） | 完全可控，可立刻上线，不等 appid |
| **内网穿透**（cpolar/natapp/cloudflared） | 免费/低价 | ❌ 不需要 | 不需要 | 最快，适合先给几个人体验；缺点是依赖本机开机、链接会变 |

**推荐顺序**：既然体验版**必须**注册 appid，那直接走云托管最划算 ——
一次注册同时解决「后端公网（免备案、有免费额度）」+「小程序体验版」，不用折腾穿透。

#### 微信云托管免费额度（官方价目，首个环境送 3 个月）

| 项 | 免费额度 | 3 个月后刊例价 |
|---|---|---|
| CPU | 720 核·小时 | 0.055 元/(核·小时) |
| 内存 | 1440 GB·小时 | 0.032 元/(GB·小时) |
| 构建时长 | 600 分钟 | 0.05 元/分钟 |
| 公网流量 | 5 GB | 0.8 元/GB |

体验期按「1 核 2GB、每天跑 20 分钟」估算：3 个月后约 **1–2 元/月**，几乎等于免费。

### ✅ 已跑通的临时方案：SSH 隧道（零下载、零注册、免费）

**先排除一条死路**：Cloudflare Tunnel（`cloudflared`）在本机装不上 ——
GitHub 直连下载连续 6 次失败，winget 官方源同样失败（`0x80072efd`）。
⇒ **本机到 GitHub release 网络不通**，凡是「下载二进制再穿透」的方案都别试。

**走得通的**：直接用系统自带的 OpenSSH 连 serveo.net，不需要安装任何东西：

```bash
# 8710 是 CORS 代理端口(见下一节), 它再转发到后端 8700
ssh -T -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -R 80:127.0.0.1:8710 serveo.net
```

连上后日志会打印 `Forwarding HTTP traffic from https://xxxx.serveousercontent.com`，
那就是公网 https 地址。实测：上传 64KB 素材 → 渲染 → 取片，**10/10 全通过**。

⚠️ 免费隧道的两个硬限制（选型前必读）：

1. **域名每次重连都会变**（要固定得注册 serveo 账号并绑定 SSH key）
2. **依赖本机开机 + 隧道进程存活** —— 电脑关机、进程被杀，链接立刻失效

因为域名会变，H5 支持**用链接参数直接指定后端**，省得每次改页面：

```
https://lixiu-h5.app.workbuddy.host/?api=https://xxxx.serveousercontent.com
```

### 🔴 最关键的一步：让隧道「活得下去」（踩坑实录）

隧道本身很好连，难的是**进程要长期存活**。三种启动方式实测对比：

| 启动方式 | 结果 |
|---|---|
| MSYS Bash 里 `cmd &` 后台 | ❌ **工具调用一结束进程就被杀**（实测：8710 随即消失，只剩服务端 502） |
| Node `spawn({detached:true})` + `unref()` | ❌ 同样被杀 —— detached 只脱离控制台，**不脱离沙箱的 job object** |
| **`schtasks` 计划任务** | ✅ **跨调用存活**，实测 PID 稳定在监听 |

⇒ **必须用计划任务**。注册一次，之后自动复发：

```bat
schtasks /create /tn "LixiuPublicDaemon" /tr "D:\lixiu-backend\deploy\start_public.bat" /sc minute /mo 5 /f
schtasks /run   /tn "LixiuPublicDaemon"        :: 立即跑一次
```

每 5 分钟触发一次，**脚本自带幂等检查**（8710 已在监听就直接退出），
所以即使守护进程被杀，5 分钟内会自动拉起 —— 这就是自愈。

⚠️ 两个踩过的坑：

1. `/rl limited` 会报 **Access is denied**（要管理员）→ **不要加这个参数**，直接用默认权限
2. `taskkill //F` 在 `MSYS_NO_PATHCONV=1` 下会变成无效参数 →
   改用 `export MSYS2_ARG_CONV_EXCL='*'` 再 `taskkill /F /PID`

### 一键启动脚本（穿透 + 跨域代理 + 自愈）

`D:\lixiu-backend\deploy\start_public.bat` —— 被上面的计划任务每 5 分钟调用，也可双击。

它拉起 `deploy/public_daemon.js`，**一个 node 进程同时干三件事**：

1. CORS 代理 `0.0.0.0:8710 → 127.0.0.1:8700`（后端零改动）
2. SSH 隧道，把 8710 暴露成公网 https（serveo 失败自动轮换 pinggy）
3. **每 20s 从公网自检** `/api/health`，失败 1 次 → 自动重建隧道

当前公网地址实时写入 `D:\lixiu-backend\deploy\PUBLIC_URL.txt`，
**可直接点的完整链接**写入 `deploy/H5_LINK.txt`，日志在 `deploy/_daemon.log`。

#### 🔴 serveo 免费隧道约 10 分钟就过期（实测硬事实）

日志里会明确出现：

```
[serveo] Port forwarding for xxxxx-112-97-61-26.serveousercontent.com expired
```

过期后立刻 502、域名作废，必须重建 → **这就是「链接老变」的真正原因**，不是代码 bug。
所以自检间隔从 45s×2次（最坏 90s 不可用）收紧到 **20s×1 次（最坏约 25s 恢复）**。

#### 桌面一键入口（推荐给头目用）

`桌面\哩秀公网启动.bat` —— 双击即可，全自动：

1. 拉起守护进程
2. 调 `deploy/open_h5.js` **等待并验证**后端真的可达（拒绝返回不可达的僵尸地址）
3. **自动用浏览器打开** `https://lixiu-h5.app.workbuddy.host/?api=<最新地址>`

⇒ 域名再怎么变，双击一次就是一条能用的链接，不用手填。

⚠️ 自检必须用 `https.request` 打 `https://` 隧道 —— 曾误用 `http.request`，
抛 `Protocol "https:" not supported`，导致每 90s 误判隧道已死并重建、域名疯狂变化。

#### 为什么需要这层 CORS 代理？

后端 `CORS_ORIGINS` 是**启动时读死的静态白名单**，加新域名必须重启后端。
但后端进程由另一个会话持有，且它的 Python 解释器不在已知的两个 Python 里
（两个都没有 fastapi），**贸然 kill 有可能起不来**，风险太大。

所以改成不动后端：在它前面挂一层 Node 代理，转发时在响应上补
`Access-Control-Allow-Origin`。实测浏览器跨域放行，后端零改动。

代理细节（都在 `deploy/cors_proxy.js` 里）：

- **流式转发**（`req.pipe`），几十 MB 视频素材不会撑爆内存
- 处理 OPTIONS 预检
- 禁用 Node 默认超时，避免分钟级成片任务被掐断

⚠️ **踩过的坑**：CORS 头必须用**全小写** key。Node 的 headers 对象 key 是小写的，
若用 `Access-Control-Allow-Origin` 这种首字母大写写法，会和后端返回的小写同名头
共存成两个 key，最终 `allow-origin` 反而丢失（实测确认）。

---

## 三、H5 用法（给体验者）

1. 打开 H5 地址
2. 底部填「后端地址」（https 公网地址）→ 保存
3. 选素材 → 输一句话 → 开始生成 → 等进度条 → 预览 / 下载

> 手机浏览器访问时，后端**必须是 https**，否则会被浏览器以「混合内容」拦截。

---

## 四、小程序体验版（100 人上限）

- 需要真实 AppID（注册指引见 `D:\lixiu-miniprogram\REGISTER_GUIDE.md`）
- 上传代码 → 后台设为**体验版** → 添加体验者（上限 100 人）→ 生成体验二维码
- 体验版**会校验 request 合法域名**，所以小程序侧后端地址必须是云托管或已备案域名，内网穿透地址不行

---

## 五、已验证（实测证据，不是"看起来对"）

| 验证项 | 结果 |
|---|---|
| `deploy/_e2e_h5_flow.py` 走**本机** | 10/10 通过 |
| `deploy/_e2e_h5_flow.py` 走**公网隧道** | 10/10 通过，成片 64732 bytes / 4.02s 可解码 |
| 公网响应携带 `Access-Control-Allow-Origin: https://lixiu-h5.app.workbuddy.host` | ✅ 浏览器放行 |
| H5 页面公网加载 | HTTP 200 |
| 公网上传素材（64KB / 1.7s） | ✅ |

H5 真实调用序列：create（不自动启动）→ 传素材 → `start?instruction=`（走 query）
→ 轮询 → 取片；实测阶段路径 `parsing → transcribing → rendering → done`。

### 当前这套方案的局限（要如实知道）

- 后端跑在你本机（`D:\ffmpeg` + faster-whisper 模型 + ZHIPU_API_KEY 都在本机，**搬不走**）
- 电脑关机 → 公网后端失效
- **域名会变**：serveo 免费隧道**约 10 分钟过期一次**，过期即换域名。
  自愈能保证「最多约 25s 恢复可用」，但**地址本身会换** ⇒ 所以要用桌面 bat 或
  `PUBLIC_URL.txt` 取当前地址，不要长期使用某一个链接
- 偶发 502：实测出现过 health 200 但上传 502，重试即成功。
  H5 已内置 `fetchRetry`（5xx + 网络错误最多重试 3 次、退避 800/1600ms）

⇒ 这仍是**过渡方案**。**最终方案是微信云托管**（需 appid，免备案、有免费额度、
不依赖你电脑开机、域名固定）。拿到 appid 后这一步的所有手工操作都可以退休。

### 已尝试但失败的路（别再试）

| 方案 | 失败原因 |
|---|---|
| `cloudflared` | GitHub release 直连 6 次失败 + winget 同源失败 → 本机到 GitHub release 不通 |
| `localtunnel`（npm） | 包装上了，但公共实例 `localtunnel.me/api/tunnels` 返回 **Not Found**（API 已下线） |
| `localhost.run` | 认证为 `anonymous user`，不分配域名；即使带 SSH key 也不接受 |
| `serveo` 自定义子域名 | 必须先注册公钥（GitHub/Google 登录），否则只能拿随机域名 |
| `pinggy` | 能连通但限流严重、上传常失败；现在只作为 serveo 挂掉时的备份通道 |

### 排障速查

```bash
# 1. 拿当前公网地址
cat D:/lixiu-backend/deploy/PUBLIC_URL.txt

# 2. 看守护进程在不在 / 最近自检结果
netstat -ano | grep ":8710" | grep LISTEN
grep "health:" D:/lixiu-backend/deploy/_daemon.log | tail -3

# 3. 手动重启（计划任务方式，别用 Bash 后台起）
export MSYS_NO_PATHCONV=1 && schtasks /run /tn "LixiuPublicDaemon"
```

⚠️ 改完 H5 重新发布后，workbuddy 托管有 **CDN 缓存** —— 直接 curl 可能还是旧页面，
加个随机参数 `?v=$(date +%s%N)` 再验证。
