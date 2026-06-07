// functions/_middleware.js - 全局密码验证中间件
export async function onRequest(context) {
    const { request, env, next } = context;
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 跳过 API 路由和静态资源
    if (pathname.startsWith('/api/') || 
        pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|json)$/)) {
        return next();
    }

    // 检查是否需要密码验证
    const accessPassword = env.ACCESS_PASSWORD;
    if (!accessPassword || accessPassword.trim() === '') {
        return next();
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
        return next();
    }

    // 未验证，返回密码页面
    // 读取主题 Cookie
    const themeMatch = cookie.match(/theme=([^;]+)/);
    const theme = themeMatch ? decodeURIComponent(themeMatch[1]) : 'dark';

    return new Response(getPasswordHTML(theme), {
        status: 401,
        headers: { 
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store'
        }
    });
}

function getPasswordHTML(theme) {
    const isLight = theme === 'light';
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>访问验证 - DNS Manager</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: ${isLight ? '#f8fafc' : '#0f172a'};
            color: ${isLight ? '#0f172a' : '#f1f5f9'};
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            transition: background 0.3s ease, color 0.3s ease;
        }
        .container {
            background: ${isLight ? '#ffffff' : '#1e293b'};
            padding: 40px;
            border-radius: 16px;
            border: 1px solid ${isLight ? '#e2e8f0' : 'rgba(255,255,255,0.1)'};
            width: 100%;
            max-width: 400px;
            text-align: center;
            box-shadow: ${isLight ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'};
            transition: background 0.3s ease, border-color 0.3s ease;
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
        p { color: ${isLight ? '#64748b' : '#94a3b8'}; margin-bottom: 24px; font-size: 14px; }
        input {
            width: 100%;
            padding: 12px 16px;
            background: ${isLight ? '#ffffff' : '#334155'};
            border: 1px solid ${isLight ? '#cbd5e1' : 'rgba(255,255,255,0.2)'};
            border-radius: 8px;
            color: ${isLight ? '#0f172a' : '#f1f5f9'};
            font-size: 16px;
            margin-bottom: 16px;
            outline: none;
            transition: background 0.3s ease, border-color 0.3s ease, color 0.3s ease;
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
        .theme-toggle {
            position: fixed;
            top: 20px;
            right: 20px;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: ${isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)'};
            border: 1px solid ${isLight ? '#cbd5e1' : 'rgba(255,255,255,0.2)'};
            color: ${isLight ? '#0f172a' : '#f1f5f9'};
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            transition: all 0.3s ease;
        }
        .theme-toggle:hover {
            background: ${isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.2)'};
        }
    </style>
</head>
<body>
    <button class="theme-toggle" onclick="toggleTheme()" title="切换主题">
        ${isLight ? '☀️' : '🌙'}
    </button>
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
        function toggleTheme() {
            const body = document.body;
            const isLight = !body.classList.contains('light-mode');
            if (isLight) {
                body.classList.add('light-mode');
            } else {
                body.classList.remove('light-mode');
            }
            document.querySelector('.theme-toggle').textContent = isLight ? '☀️' : '🌙';
            document.cookie = 'theme=' + (isLight ? 'light' : 'dark') + '; path=/; max-age=31536000; SameSite=Lax';
            // 刷新页面应用新主题
            setTimeout(() => location.reload(), 100);
        }

        async function handleSubmit(e) {
            e.preventDefault();
            const password = document.getElementById('password').value;
            if (!password) return;

            try {
                const response = await fetch('/api/auth/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password })
                });

                if (response.ok) {
                    const data = await response.json();
                    document.cookie = 'dns_session=' + encodeURIComponent(data.token) + '; path=/; max-age=86400; SameSite=Lax';
                    window.location.href = '/index.html';
                } else {
                    document.getElementById('error').style.display = 'block';
                }
            } catch (err) {
                document.getElementById('error').style.display = 'block';
                document.getElementById('error').textContent = '验证失败，请重试';
            }
        }
    </script>
</body>
</html>`;
}
