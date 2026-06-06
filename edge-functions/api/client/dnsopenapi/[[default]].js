export default async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    
    const API_BASE = env.DNS_API_BASE || 'vps8.zz.cd';
    const fullApiBase = API_BASE.startsWith('http') ? API_BASE : 'https://' + API_BASE;
    
    const targetUrl = new URL(url.pathname + url.search, fullApiBase);
    
    // 只复制必要的 header，避免无效 header
    const headers = new Headers();
    
    const contentType = request.headers.get('content-type');
    if (contentType) {
        headers.set('Content-Type', contentType);
    }
    
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
