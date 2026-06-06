export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);

    // 从环境变量获取目标 API 地址
    const API_BASE = env.DNS_API_BASE || 'vps8.zz.cd';
    const fullApiBase = API_BASE.startsWith('http') ? API_BASE : 'https://' + API_BASE;

    // 构建目标 URL
    // 原始路径: /api/client/dnsopenapi/xxx
    // 目标路径: https://vps8.zz.cd/api/client/dnsopenapi/xxx
    const targetUrl = new URL(url.pathname + url.search, fullApiBase);

    // 复制请求头
    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.delete('origin');
    headers.delete('referer');

    // 如果环境变量配置了 API Key，自动添加认证头
    const envApiKey = env.DNS_API_KEY;
    if (envApiKey && !headers.has('authorization')) {
        headers.set('Authorization', 'Basic ' + btoa('client:' + envApiKey));
    }

    // 创建新请求
    const newRequest = new Request(targetUrl, {
        method: request.method,
        headers: headers,
        body: request.body
    });

    try {
        const response = await fetch(newRequest);

        // 创建新响应，添加 CORS 头
        const newHeaders = new Headers(response.headers);
        newHeaders.set('Access-Control-Allow-Origin', '*');
        newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
        newHeaders.set('Access-Control-Allow-Credentials', 'true');
        newHeaders.set('Access-Control-Max-Age', '86400');

        // 处理 OPTIONS 预检请求
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: newHeaders
            });
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
