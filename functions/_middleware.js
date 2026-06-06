export async function onRequest(context) {
    const { request, env } = context;
    
    const accessPassword = env.ACCESS_PASSWORD;
    
    if (accessPassword) {
        const url = new URL(request.url);
        const urlPassword = url.searchParams.get('password');
        const cookie = request.headers.get('cookie') || '';
        const cookieMatch = cookie.match(/access_password=([^;]+)/);
        const cookiePassword = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;
        
        const providedPassword = urlPassword || cookiePassword;
        
        if (providedPassword !== accessPassword) {
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
        }
        input:focus { outline: none; border-color: #3b82f6; }
        button {
            width: 100%;
            padding: 12px;
            background: #3b82f6;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
        }
        button:hover { background: #2563eb; }
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
    </div>
    <script>
        function handleSubmit(e) {
            e.preventDefault();
            const password = document.getElementById('password').value;
            if (!password) return;
            document.cookie = 'access_password=' + encodeURIComponent(password) + '; path=/; max-age=86400; SameSite=Lax';
            window.location.reload();
        }
    </script>
</body>
</html>`, {
                status: 401,
                headers: { 'Content-Type': 'text/html; charset=utf-8' }
            });
        }
    }
    
    return await context.next();
}
