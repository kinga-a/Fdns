// edge-functions/api/client/dnsopenapi/[[default]].js
// 安全修复版本

// 允许的 API 端点白名单
const ALLOWED_ENDPOINTS = [
    'domain_list',
    'record_list', 
    'record_create',
    'record_update',
    'record_delete'
];

// 请求体大小限制 (1MB)
const MAX_BODY_SIZE = 1024 * 1024;

// 检查路径是否在白名单中
function isAllowedEndpoint(pathname) {
    // 移除前缀 /api/client/dnsopenapi/
    const endpoint = pathname.replace(/^\/api\/client\/dnsopenapi\//, '').replace(/^\//, '');
    return ALLOWED_ENDPOINTS.includes(endpoint);
}

export default async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);

    // 验证会话（如果配置了密码）
    const accessPassword = env.ACCESS_PASSWORD;
    if (accessPassword && accessPassword.trim() !== '') {
        const cookie = request.headers.get('cookie') || '';
        const sessionMatch = cookie.match(/dns_session=([^;]+)/);
        const sessionToken = sessionMatch ? decodeURIComponent(sessionMatch[1]) : null;

        let validSession = false;

        // 使用环境变量中的 KV 绑定
        const kv = env.dns_kv;
        if (sessionToken && kv) {
            try {
                const session = await kv.get(`session:${sessionToken}`);
                if (session === 'valid') validSession = true;
            } catch (e) {
                console.log('KV get failed:', e);
            }
        }

        // 移除时间戳回退验证！KV 验证失败即拒绝
        if (!validSession) {
            return new Response(JSON.stringify({ error: '未授权访问' }), {
                status: 401,
                headers: { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }
    }

    // API 端点白名单校验
    if (!isAllowedEndpoint(url.pathname)) {
        return new Response(JSON.stringify({ error: '无效的 API 端点' }), {
            status: 403,
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }

    // 请求体大小限制
    if (request.body) {
        const contentLength = request.headers.get('content-length');
        if (contentLength && parseInt(contentLength) > MAX_BODY_SIZE) {
            return new Response(JSON.stringify({ error: '请求体过大' }), {
                status: 413,
                headers: { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }
    }

    // API代理逻辑
    const API_BASE = env.DNS_API_BASE || 'vps8.zz.cd';
    const fullApiBase = API_BASE.startsWith('http') ? API_BASE : 'https://' + API_BASE;
    const targetUrl = new URL(url.pathname + url.search, fullApiBase);

    const headers = new Headers();
    const contentType = request.headers.get('content-type');
    if (contentType) headers.set('Content-Type', contentType);

    const authHeader = request.headers.get('authorization');
    if (authHeader) {
        headers.set('Authorization', authHeader);
    } else {
        const envApiKey = env.DNS_API_KEY;
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
        newHeaders.set('Access-Control-Allow-Origin', '*');
        newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
        // 修复：移除冲突的 Credentials 头，或动态设置 Origin
        // newHeaders.set('Access-Control-Allow-Credentials', 'true');
        newHeaders.set('Access-Control-Max-Age', '86400');

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: newHeaders });
        }

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders
        });
    } catch (error) {
        // 修复：不暴露内部 target URL
        return new Response(JSON.stringify({
            error: 'Proxy Error',
            message: '后端服务暂时不可用'
        }), {
            status: 502,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
}
