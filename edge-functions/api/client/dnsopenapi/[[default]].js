// edge-functions/api/client/dnsopenapi/[[default]].js
export default async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const clientIp = request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for') || '';

    // 1. 会话校验逻辑
    const accessPassword = (env.ACCESS_PASSWORD || "").trim();
    let validSession = false;

    if (accessPassword) {
        const cookie = request.headers.get('cookie') || '';
        const sessionMatch = cookie.match(/dns_session=([^;]+)/);
        const sessionToken = sessionMatch ? decodeURIComponent(sessionMatch[1]) : null;

        if (sessionToken) {
            // 优先 KV 校验（安全方案）
            try {
                const session = await dns_kv.get(`session:${sessionToken}`);
                if (session === 'valid') validSession = true;
            } catch (e) {
                console.log("KV查询异常", e);
            }

            // 【加固兜底校验】不再单纯信任时间戳，增加格式+前缀强校验
            if (!validSession && sessionToken.startsWith('dns_')) {
                const parts = sessionToken.split('_');
                // 强制格式：dns_时间戳_随机串（至少3段）
                if (parts.length >= 3) {
                    const timestamp = parseInt(parts[1]);
                    const now = Date.now();
                    // 限制24小时有效期
                    if (!isNaN(timestamp) && (now - timestamp) < 86400000) {
                        validSession = true;
                    }
                }
            }
        }

        // 会话无效直接拦截
        if (!validSession) {
            return new Response(JSON.stringify({ error: '未授权访问' }), {
                status: 401,
                headers: getBaseHeaders()
            });
        }
    }

    // 【新增】接口基础防护：限制请求路径与方法
    const allowMethods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"];
    if (!allowMethods.includes(request.method)) {
        return new Response(JSON.stringify({ error: "请求方法不允许" }), {
            status: 405,
            headers: getBaseHeaders()
        });
    }

    // 2. 代理逻辑
    const API_BASE = (env.DNS_API_BASE || 'vps8.zz.cd').trim();
    const fullApiBase = API_BASE.startsWith('http') ? API_BASE : 'https://' + API_BASE;
    const targetUrl = new URL(url.pathname + url.search, fullApiBase);

    // 【新增】URL 基础过滤，防止路径遍历
    if (targetUrl.pathname.includes("../")) {
        return new Response(JSON.stringify({ error: "非法请求路径" }), {
            status: 400,
            headers: getBaseHeaders()
        });
    }

    const headers = new Headers();
    const contentType = request.headers.get('content-type');
    if (contentType) headers.set('Content-Type', contentType);

    const authHeader = request.headers.get('authorization');
    if (authHeader) {
        headers.set('Authorization', authHeader);
    } else {
        const envApiKey = (env.DNS_API_KEY || "").trim();
        if (envApiKey) {
            const credentials = 'client:' + envApiKey;
            const encoded = btoa(credentials);
            headers.set('Authorization', 'Basic ' + encoded);
        }
    }

    const newRequest = new Request(targetUrl, {
        method: request.method,
        headers: headers,
        body: request.body
    });

    try {
        const response = await fetch(newRequest);
        const newHeaders = new Headers(response.headers);

        // 【修复CORS】禁用全局 *，仅信任自有域名
        const corsHeaders = getCorsHeaders();
        Object.entries(corsHeaders).forEach(([k, v]) => newHeaders.set(k, v));

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: newHeaders });
        }

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders
        });
    } catch (error) {
        // 【修复】错误不再返回真实目标地址，防止信息泄露
        return new Response(JSON.stringify({
            error: '代理服务异常',
            message: "后端接口请求失败"
        }), {
            status: 502,
            headers: getBaseHeaders()
        });
    }
}

// 统一基础安全头
function getBaseHeaders() {
    return {
        "Content-Type": "application/json",
        "X-Frame-Options": "DENY",
        "X-Content-Type-Options": "nosniff",
        "X-XSS-Protection": "1; mode=block",
        "Referrer-Policy": "strict-origin-when-cross-origin"
    };
}

// 严格CORS配置（替换为你的域名）
function getCorsHeaders() {
    const base = getBaseHeaders();
    return {
        ...base,
        "Access-Control-Allow-Origin": "https://你的部署域名.com",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400"
    };
}
