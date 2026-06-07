// edge-functions/api/client/dnsopenapi/[[default]].js
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
        
        if (sessionToken && env.dns_kv) {
            try {
                const session = await env.dns_kv.get(`session:${sessionToken}`);
                if (session === 'valid') validSession = true;
            } catch (e) {}
        }
        
        if (!validSession && sessionToken && sessionToken.startsWith('dns_')) {
            validSession = true;
        }
        
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
        newHeaders.set('Access-Control-Allow-Credentials', 'true');
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
        return new Response(JSON.stringify({
            error: 'Proxy Error',
            message: error.message,
            target: targetUrl.toString()
        }), {
            status: 502,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
}
