export default async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);

    // 从环境变量获取目标 API 地址
    const API_BASE = env.DNS_API_BASE || 'vps8.zz.cd';
    const fullApiBase = API_BASE.startsWith('http') ? API_BASE : 'https://' + API_BASE;

    // 构建目标 URL
    const targetUrl = new URL(url.pathname + url.search, fullApiBase);

    // 只复制必要的 header
    const headers = new Headers();

    const contentType = request.headers.get('content-type');
    if (contentType) {
        headers.set('Content-Type', contentType);
    }

    // 复制 Authorization（前端传入的优先）
    const authHeader = request.headers.get('authorization');
    if (authHeader) {
        headers.set('Authorization', authHeader);
    } else {
        // 如果环境变量配置了 API Key，使用环境变量的
        const envApiKey = env.DNS_API_KEY;
        if (envApiKey) {
            const credentials = 'client:' + envApiKey;
            const encoded = btoa(credentials);
            headers.set('Authorization', 'Basic ' + encoded);
        }
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
