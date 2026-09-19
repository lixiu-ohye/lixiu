# -*- coding: utf-8 -*-
"""
lixiu_ai_relay.py — 哩秀 AI 透明中转(可选部署, 不装也能用 workbench 的直连模式)
================================================================
用途:
  workbench.html 的 AI 直连模式已覆盖 火山方舟/DeepSeek/Kimi/通义/硅基流动(实测 CORS 放行)。
  只有当某服务商拦截浏览器跨域(或走企业网关)时, 才需要这个中转。
  前端「高级:中转/代理」里填 https://<本服务地址>/api/relay 并勾选启用即可。

安全要点(与前端提示一致):
  1. 不存储 / 不打印 apiKey —— 日志过滤器把 Authorization 头打码
  2. 只允许 POST /api/relay, 目标地址必须是 http(s) 的 chat/completions 端点
  3. CORS 白名单锁定 GitHub Pages 域名(改成你自己的)
  4. 简单内存限流: 每 IP 每分钟 20 次(防恶意刷)
  5. 超时 25s, 请求体上限 64KB

运行:
  pip install fastapi uvicorn httpx
  uvicorn lixiu_ai_relay:app --host 0.0.0.0 --port 8702

部署备注:
  - 云托管(微信云托管/Render/Fly.io)均可; 免费额度足够个人用
  - 本文件放 D 盘存档; 与 D:\\lixiu-backend(8700, 素材库后端)互不干扰, 端口 8702
"""
import time
import collections
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
import httpx

app = FastAPI(title="lixiu AI relay", docs_url=None, redoc_url=None)

# ── CORS 白名单: 只允许你的静态站调用(本地调试可临时加 http://localhost:*) ──
ALLOWED_ORIGINS = [
    "https://lixiu-ohye.github.io",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# ── 内存限流: {ip: deque[timestamps]} ──
RATE_LIMIT = 20          # 次
RATE_WINDOW = 60         # 秒
_hits: dict = collections.defaultdict(collections.deque)

def rate_limited(ip: str) -> bool:
    now = time.time()
    dq = _hits[ip]
    while dq and now - dq[0] > RATE_WINDOW:
        dq.popleft()
    if len(dq) >= RATE_LIMIT:
        return True
    dq.append(now)
    return False

# ── 日志打码: 绝不让 Authorization 进日志 ──
import logging
class _MaskAuth(logging.Filter):
    def filter(self, record):
        try:
            if record.args and any('uthorization' in str(a) for a in record.args):
                record.args = tuple(str(a).replace(
                    str(a).split(' ')[-1], '***MASKED***') if 'uthorization' in str(a) else a for a in record.args)
        except Exception:
            pass
        return True

logging.getLogger("uvicorn.access").addFilter(_MaskAuth())

MAX_BODY = 64 * 1024     # 64KB: 一句话生成 UI 的请求体远小于这个数
TIMEOUT = 25.0


@app.post("/api/relay")
async def relay(request: Request):
    # 1. 限流
    ip = request.headers.get("x-forwarded-for", "") or (request.client.host if request.client else "?")
    if rate_limited(ip.split(",")[0].strip()):
        raise HTTPException(status_code=429, detail="请求太频繁, 稍后再试")

    # 2. 目标地址: 前端放 ?target=<完整chat/completions地址>; 目标必须是 http(s)
    target = request.query_params.get("target", "")
    if not target.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="target 必须是 http(s) 地址")
    if "chat/completions" not in target:
        raise HTTPException(status_code=400, detail="target 必须指向 chat/completions 端点")

    # 3. 请求体上限
    raw = await request.body()
    if len(raw) > MAX_BODY:
        raise HTTPException(status_code=413, detail="请求体过大")

    # 4. 透传头: 只传 Content-Type 和 Authorization(用户自己的 Key), 其余丢弃
    headers = {
        "Content-Type": "application/json",
        "Authorization": request.headers.get("Authorization", ""),
    }

    # 5. 转发(不落盘 / 不记录 Key / 响应原样回给浏览器)
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=False) as client:
            resp = await client.post(target, headers=headers, content=raw)
        return resp.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="上游模型接口超时(25s)")
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail="转发失败: " + str(type(e).__name__))


@app.get("/healthz")
async def healthz():
    return {"ok": True}
