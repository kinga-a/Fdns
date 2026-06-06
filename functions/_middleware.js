export default async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);

    // 检查是否设置了访问密码环境变量
    const accessPassword = env.ACCESS_PASSWORD;

    // 如果访问的是 API 路径，跳过密码验证（API Key 已经提供认证）
    if (url.pathname.startsWith('/api/')) {
        return await context.next();
    }

    // 如果没有设置访问密码，直接放行
    if (!accessPassword || accessPassword.trim() === '') {
        return await context.next();
    }

    // 从 URL 查询参数或 Cookie 中获取密码
    const urlPassword = url.searchParams.get('password');
    const cookie = request.headers.get('cookie') || '';
    const cookieMatch = cookie.match(/access_password=([^;]+)/);
    const cookiePassword = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;

    const providedPassword = urlPassword || cookiePassword;

    // 密码验证通过
    if (providedPassword === accessPassword) {
        // 如果密码是通过 URL 参数提供的，设置 cookie 以便后续访问
        if (urlPassword === accessPassword) {
            const response = await context.next();
            const newResponse = new Response(response.body, response);
            newResponse.headers.append('Set-Cookie', 'access_password=' + encodeURIComponent(accessPassword) + '; Path=/; Max-Age=86400; SameSite=Lax; HttpOnly');
            return newResponse;
        }
        return await context.next();
    }

    // 密码验证失败，返回密码输入页面
    return new Response(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>访问验证 - DNS Manager</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: #0f172a;
            color: #f1f5f9;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: #1e293b;
            padding: 40px;
            border-radius: 16px;
            border: 1px solid rgba(255,255,255,0.1);
            width: 100%;
            max-width: 400px;
            text-align: center;
        }
        .icon {
            width: 64px;
            height: 64px;
            background: #3b82f6;
            border-radius: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
        }
        .icon svg { width: 32px; height: 32px; fill: white; }
        h1 { font-size: 24px; margin-bottom: 8px; }
        p { color: #94a3b8; margin-bottom: 24px; font-size: 14px; }
        input {
            width: 100%;
            padding: 12px 16px;
            background: #334155;
            border: 1px solid rgba(255,255,255,0.2);
            border-radius: 8px;
            color: #f1f5f9;
            font-size: 16px;
            margin-bottom: 16px;
            outline: none;
        }
        input:focus { border-color: #3b82f6; }
        button {
            width: 100%;
            padding: 12px;
            background: #3b82f6;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            transition: background 0.2s;
        }
        button:hover { background: #2563eb; }
        .error { 
            color: #ef4444; 
            font-size: 14px; 
            margin-top: 12px; 
            display: none; 
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">
            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg>
        </div>
        <h1>访问验证</h1>
        <p>请输入访问密码以继续使用 DNS Manager</p>
        <form onsubmit="handleSubmit(event)">
            <input type="password" id="password" placeholder="访问密码" autocomplete="off" autofocus>
            <button type="submit">进入系统</button>
        </form>
        <div class="error" id="error">密码错误，请重试</div>
    </div>
    <script>
        function handleSubmit(e) {
            e.preventDefault();
            const password = document.getElementById('password').value;
            if (!password) return;
            // 同时设置 cookie 并带上 password 参数重定向，双重保障
            document.cookie = 'access_password=' + encodeURIComponent(password) + '; path=/; max-age=86400; SameSite=Lax';
            const separator = window.location.search ? '&' : '?';
            window.location.href = window.location.pathname + window.location.search + separator + 'password=' + encodeURIComponent(password);
        }
        // 检查 URL 中是否有错误标记
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('error') === 'auth') {
            document.getElementById('error').style.display = 'block';
        }
        // 如果有密码参数但验证失败了（被重定向回来），显示错误
        if (urlParams.get('password') && urlParams.get('error') !== 'auth') {
            // 可能是密码错误，显示错误提示
            document.getElementById('error').style.display = 'block';
            document.getElementById('error').textContent = '密码验证失败，请重试';
        }
    </script>
</body>
</html>`, {
        status: 401,
        headers: { 
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store'
        }
    });
}
