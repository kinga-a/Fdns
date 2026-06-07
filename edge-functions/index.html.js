export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);

    // 检查是否需要密码验证
    const accessPassword = env.ACCESS_PASSWORD;

    if (!accessPassword || accessPassword.trim() === '') {
        // 没有设置密码，放行（返回404让平台处理静态资源）
        return new Response(null, { status: 404 });
    }

    // 从 Cookie 获取会话
    const cookie = request.headers.get('cookie') || '';
    const sessionMatch = cookie.match(/dns_session=([^;]+)/);
    const sessionToken = sessionMatch ? decodeURIComponent(sessionMatch[1]) : null;

    // 验证会话
    let validSession = false;

    if (sessionToken && env.dns_kv) {
        try {
            const session = await env.dns_kv.get(`session:${sessionToken}`);
            if (session === 'valid') validSession = true;
        } catch (e) {}
    }

    // 降级：检查Cookie格式
    if (!validSession && sessionToken && sessionToken.startsWith('dns_')) {
        validSession = true;
    }

    if (validSession) {
        // 已验证，放行（返回404让平台处理静态资源）
        return new Response(null, { status: 404 });
    }

    // 未验证，重定向到根路径进行密码验证
    return Response.redirect(url.origin + '/', 302);
}
