export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 如果是 API 请求，让其他函数处理（不应该走到这里，因为 api/ 有独立路由）
    if (pathname.startsWith('/api/')) {
        return new Response('API route not found', { status: 404 });
    }

    // 处理根路径和 index.html
    if (pathname === '/' || pathname === '/index.html') {
        return new Response(dnsManagerHTML, {
            status: 200,
            headers: { 
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-store'
            }
        });
    }

    // 其他路径 404
    return new Response('Not Found', { status: 404 });
}

const dnsManagerHTML = `<!DOCTYPE html>
<html lang="zh-CN">复制</html>`;
