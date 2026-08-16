// edge-functions/api/client/dnsopenapi/[[default]].js
// 双平台代理：支持 VPS8 和 DNSHE

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
            try {
                const session = await dns_kv.get(`session:${sessionToken}`);
                if (session === 'valid') validSession = true;
            } catch (e) {
                // 生产环境移除日志: console.log('KV查询异常', e);
            }

            if (!validSession && sessionToken.startsWith('dns_')) {
                const parts = sessionToken.split('_');
                if (parts.length >= 3) {
                    const timestamp = parseInt(parts[1]);
                    const now = Date.now();
                    if (!isNaN(timestamp) && (now - timestamp) < 86400000) {
                        validSession = true;
                    }
                }
            }
        }

        if (!validSession) {
            return new Response(JSON.stringify({ error: '未授权访问' }), {
                status: 401,
                headers: getBaseHeaders()
            });
        }
    }

    // 接口基础防护
    const allowMethods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"];
    if (!allowMethods.includes(request.method)) {
        return new Response(JSON.stringify({ error: "请求方法不允许" }), {
            status: 405,
            headers: getBaseHeaders()
        });
    }

    // 2. 判断目标平台（通过请求头 x-dns-platform）
    const platform = (request.headers.get('x-dns-platform') || 'vps8').toLowerCase();

    if (platform === 'dnshe') {
        return await proxyDNSHE(request, env, url);
    } else {
        return await proxyVPS8(request, env, url);
    }
}

// ========== VPS8 代理 ==========
async function proxyVPS8(request, env, url) {
    const API_BASE = (env.DNS_API_BASE || 'vps8.zz.cd').trim();
    const fullApiBase = API_BASE.startsWith('http') ? API_BASE : 'https://' + API_BASE;
    const targetUrl = new URL(url.pathname + url.search, fullApiBase);

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
        // 多账号支持：DNS_API_KEY 可以是 JSON 数组或单字符串
        const accountIndex = parseInt(request.headers.get('x-account-index') || '0');
        let envApiKey = '';
        const rawApiKey = (env.DNS_API_KEY || "").trim();
        if (rawApiKey) {
            try {
                const accounts = JSON.parse(rawApiKey);
                if (Array.isArray(accounts) && accounts[accountIndex]) {
                    envApiKey = accounts[accountIndex].key || '';
                } else if (typeof accounts === 'string') {
                    envApiKey = accounts;
                }
            } catch (e) {
                // 不是 JSON，按单字符串处理
                envApiKey = rawApiKey;
            }
        }
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
        return new Response(JSON.stringify({
            error: '代理服务异常',
            message: "后端接口请求失败"
        }), {
            status: 502,
            headers: getBaseHeaders()
        });
    }
}

// ========== DNSHE 代理 ==========
async function proxyDNSHE(request, env, url) {
    const API_BASE = (env.DNSHE_API_BASE || 'https://api005.dnshe.com/index.php').trim();

    // 多账号支持
    const accountIndex = parseInt(request.headers.get('x-account-index') || '0');
    let apiKey = '';
    let apiSecret = '';
    const rawDnsheKey = (env.DNSHE_API_KEY || "").trim();
    const rawDnsheSecret = (env.DNSHE_API_SECRET || "").trim();

    try {
        const keyAccounts = JSON.parse(rawDnsheKey);
        if (Array.isArray(keyAccounts) && keyAccounts[accountIndex]) {
            apiKey = keyAccounts[accountIndex].key || '';
        } else if (typeof keyAccounts === 'string') {
            apiKey = keyAccounts;
        }
    } catch (e) {
        apiKey = rawDnsheKey;
    }

    try {
        const secretAccounts = JSON.parse(rawDnsheSecret);
        if (Array.isArray(secretAccounts) && secretAccounts[accountIndex]) {
            apiSecret = secretAccounts[accountIndex].key || '';
        } else if (typeof secretAccounts === 'string') {
            apiSecret = secretAccounts;
        }
    } catch (e) {
        apiSecret = rawDnsheSecret;
    }

    // 从前端请求头读取（如果环境变量未配置）
    const reqApiKey = request.headers.get('x-dnshe-api-key');
    const reqApiSecret = request.headers.get('x-dnshe-api-secret');

    const finalKey = reqApiKey || apiKey;
    const finalSecret = reqApiSecret || apiSecret;

    if (!finalKey || !finalSecret) {
        return new Response(JSON.stringify({ error: "缺少 DNSHE API Key 或 Secret" }), {
            status: 400,
            headers: getBaseHeaders()
        });
    }

    // 解析前端传来的 endpoint 和 action
    const bodyText = await request.text();
    let bodyData = {};
    try {
        bodyData = JSON.parse(bodyText);
    } catch (e) {
        bodyData = {};
    }

    const endpoint = bodyData._endpoint || 'dns_records';
    const action = bodyData._action || 'list';

    // 删除内部标记字段
    delete bodyData._endpoint;
    delete bodyData._action;
    delete bodyData._platform;

    // 判断 HTTP 方法：list/get 用 GET，其他用 POST
    const readActions = ['list', 'get'];
    const httpMethod = readActions.includes(action) ? 'GET' : 'POST';

    // 构建 DNSHE URL
    const targetUrl = new URL(API_BASE);
    targetUrl.searchParams.set('m', 'domain_hub');
    targetUrl.searchParams.set('endpoint', endpoint);
    targetUrl.searchParams.set('action', action);

    // GET 请求：将参数放入 query string
    if (httpMethod === 'GET') {
        for (const [key, value] of Object.entries(bodyData)) {
            if (value !== undefined && value !== null) {
                targetUrl.searchParams.set(key, String(value));
            }
        }
    }

    const headers = new Headers();
    headers.set('X-API-Key', finalKey);
    headers.set('X-API-Secret', finalSecret);
    headers.set('Content-Type', 'application/json');

    const newRequest = new Request(targetUrl, {
        method: httpMethod,
        headers: headers,
        body: httpMethod === 'GET' ? null : JSON.stringify(bodyData)
    });

    try {
        const response = await fetch(newRequest);
        const responseBody = await response.text();
        const newHeaders = new Headers();
        const corsHeaders = getCorsHeaders();
        Object.entries(corsHeaders).forEach(([k, v]) => newHeaders.set(k, v));
        newHeaders.set('Content-Type', 'application/json');

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: newHeaders });
        }

        return new Response(responseBody, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders
        });
    } catch (error) {
        return new Response(JSON.stringify({
            error: '代理服务异常',
            message: "DNSHE 后端接口请求失败"
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

// 严格CORS配置
function getCorsHeaders() {
    const base = getBaseHeaders();
    return {
        ...base,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, X-DNS-Platform, X-DNSHE-API-Key, X-DNSHE-API-Secret, X-Account-Index",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400"
    };
}
