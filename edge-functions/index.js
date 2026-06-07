export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);

    // 如果访问的是 /index.html，重定向到 /
    if (url.pathname === '/index.html') {
        return Response.redirect(url.origin + '/', 302);
    }

    // 检查是否需要密码验证
    const accessPassword = env.ACCESS_PASSWORD;

    if (!accessPassword || accessPassword.trim() === '') {
        // 没有设置密码，直接返回前端页面
        return new Response(HTML_CONTENT, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
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
        // 已验证，返回前端页面
        return new Response(HTML_CONTENT, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
    }

    // 未验证，返回密码页面
    return new Response(PASSWORD_HTML, {
        status: 401,
        headers: { 
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store'
        }
    });
}

const PASSWORD_HTML = `<!DOCTYPE html>
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
                    window.location.reload();
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

const HTML_CONTENT = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DNS Manager - DNS 记录管理</title>
    <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --bg-primary: #0f172a;
            --bg-secondary: #1e293b;
            --bg-card: #334155;
            --text-primary: #f1f5f9;
            --text-secondary: #94a3b8;
            --accent: #3b82f6;
            --accent-hover: #2563eb;
            --danger: #ef4444;
            --success: #10b981;
            --warning: #f59e0b;
        }
        .light-mode {
            --bg-primary: #f8fafc;
            --bg-secondary: #e2e8f0;
            --bg-card: #ffffff;
            --text-primary: #0f172a;
            --text-secondary: #64748b;
        }
        body {
            background-color: var(--bg-primary);
            color: var(--text-primary);
            transition: all 0.3s ease;
        }
        .card {
            background-color: var(--bg-card);
            border: 1px solid rgba(255,255,255,0.1);
        }
        .light-mode .card {
            border: 1px solid #e2e8f0;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .input-field {
            background-color: var(--bg-secondary);
            color: var(--text-primary);
            border: 1px solid rgba(255,255,255,0.2);
        }
        .light-mode .input-field {
            background-color: #ffffff;
            border: 1px solid #cbd5e1;
        }
        .btn-primary {
            background-color: var(--accent);
            color: white;
        }
        .btn-primary:hover {
            background-color: var(--accent-hover);
        }
        .btn-danger {
            background-color: var(--danger);
            color: white;
        }
        .btn-success {
            background-color: var(--success);
            color: white;
        }
        .record-row {
            transition: all 0.2s;
        }
        .record-row:hover {
            background-color: rgba(59, 130, 246, 0.1);
        }
        .modal-overlay {
            backdrop-filter: blur(4px);
        }
        .toast {
            animation: slideIn 0.3s ease-out;
        }
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        .loading-spinner {
            border: 3px solid rgba(255,255,255,0.1);
            border-top: 3px solid var(--accent);
            border-radius: 50%;
            width: 24px;
            height: 24px;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .fade-in {
            animation: fadeIn 0.3s ease-out;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        ::-webkit-scrollbar {
            width: 8px;
            height: 8px;
        }
        ::-webkit-scrollbar-track {
            background: var(--bg-primary);
        }
        ::-webkit-scrollbar-thumb {
            background: var(--bg-secondary);
            border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
            background: var(--accent);
        }
        .type-badge {
            display: inline-flex;
            align-items: center;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 0.75rem;
            font-weight: 700;
        }
        .type-a { background-color: rgba(59, 130, 246, 0.2); color: #60a5fa; }
        .type-aaaa { background-color: rgba(147, 51, 234, 0.2); color: #c084fc; }
        .type-cname { background-color: rgba(34, 197, 94, 0.2); color: #4ade80; }
        .type-mx { background-color: rgba(249, 115, 22, 0.2); color: #fb923c; }
        .type-txt { background-color: rgba(107, 114, 128, 0.2); color: #9ca3af; }
        .type-ns { background-color: rgba(239, 68, 68, 0.2); color: #f87171; }
        .env-badge {
            display: inline-flex;
            align-items: center;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 0.75rem;
            background-color: rgba(16, 185, 129, 0.2);
            color: #34d399;
        }
        /* 模态框滚动修复 */
        .modal-scroll {
            max-height: 85vh;
            overflow-y: auto;
            overflow-x: hidden;
            display: flex;
            flex-direction: column;
        }
        .modal-scroll::-webkit-scrollbar {
            width: 6px;
        }
        .modal-scroll::-webkit-scrollbar-track {
            background: transparent;
        }
        .modal-scroll::-webkit-scrollbar-thumb {
            background: var(--bg-secondary);
            border-radius: 3px;
        }
        .modal-body {
            flex: 1;
            overflow-y: auto;
            overflow-x: hidden;
            padding-right: 4px;
            max-height: calc(85vh - 120px);
        }
        .modal-body::-webkit-scrollbar {
            width: 6px;
        }
        .modal-body::-webkit-scrollbar-track {
            background: transparent;
        }
        .modal-body::-webkit-scrollbar-thumb {
            background: var(--bg-secondary);
            border-radius: 3px;
        }
        .modal-actions {
            padding-top: 16px;
            border-top: 1px solid rgba(255,255,255,0.1);
            margin-top: 8px;
            flex-shrink: 0;
        }
        .light-mode .modal-actions {
            border-top: 1px solid #e2e8f0;
        }
    </style>
</head>
<body class="min-h-screen">
    <div id="toastContainer" class="fixed top-4 right-4 z-50 space-y-2"></div>

    <header class="card sticky top-0 z-40 border-b">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
            <div class="flex items-center space-x-3">
                <div class="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                    <i class="fas fa-network-wired text-white text-lg"></i>
                </div>
                <div>
                    <h1 class="text-xl font-bold">DNS Manager</h1>
                    <p class="text-xs text-gray-400">DNS OpenAPI 管理面板</p>
                </div>
            </div>
            <div class="flex items-center space-x-4">
                <button onclick="toggleTheme()" class="p-2 rounded-lg hover:bg-gray-700 transition">
                    <i id="themeIcon" class="fas fa-sun"></i>
                </button>
                <div class="hidden md:flex items-center space-x-2 text-sm text-gray-400">
                    <span id="statusIndicator" class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                    <span id="statusText">就绪</span>
                </div>
            </div>
        </div>
    </header>

    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <section id="configSection" class="card rounded-xl p-6 mb-6 fade-in">
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-lg font-semibold flex items-center">
                    <i class="fas fa-key mr-2 text-yellow-500"></i>
                    API 配置
                </h2>
                <div class="flex items-center space-x-2">
                    <span id="envApiKeyBadge" class="env-badge hidden"><i class="fas fa-shield-alt mr-1"></i>服务端已配置</span>
                    <button onclick="saveConfig()" class="btn-primary px-4 py-2 rounded-lg text-sm font-medium transition">
                        <i class="fas fa-save mr-2"></i>保存配置
                    </button>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium mb-2 text-gray-400">
                        API Key 
                        <span id="apiKeySource" class="text-xs text-gray-500 ml-1">(前端配置)</span>
                    </label>
                    <div class="relative">
                        <input type="password" id="apiKey" class="input-field w-full px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="输入你的 API Key">
                        <button onclick="toggleApiKeyVisibility()" class="absolute right-3 top-2.5 text-gray-400 hover:text-white">
                            <i id="apiKeyIcon" class="fas fa-eye"></i>
                        </button>
                    </div>
                    <p class="text-xs text-gray-500 mt-1">如果服务端已配置环境变量，此处留空即可</p>
                </div>
                <div>
                    <label class="block text-sm font-medium mb-2 text-gray-400">API 基础地址</label>
                    <input type="text" id="baseUrl" class="input-field w-full px-4 py-2 rounded-lg bg-gray-800" value="/api/client/dnsopenapi" readonly>
                    <p class="text-xs text-gray-500 mt-1">通过 Edge Function 代理，自动处理 CORS</p>
                </div>
            </div>

            <div class="mt-4 p-3 bg-blue-900/30 border border-blue-700/50 rounded-lg">
                <div class="flex items-start space-x-2">
                    <i class="fas fa-info-circle text-blue-500 mt-0.5"></i>
                    <div class="text-sm text-blue-200">
                        <p><strong>部署说明：</strong></p>
                        <ul class="list-disc list-inside mt-1 space-y-1 text-xs">
                            <li>支持在 EdgeOne Pages 环境变量中配置 <code>DNS_API_KEY</code> 和 <code>ACCESS_PASSWORD</code></li>
                            <li>如果环境变量未配置 API Key，则需要在页面输入</li>
                            <li>如果配置了 <code>ACCESS_PASSWORD</code>，访问页面需要输入密码</li>
                        </ul>
                    </div>
                </div>
            </div>
        </section>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <section class="lg:col-span-1">
                <div class="card rounded-xl p-6 fade-in">
                    <div class="flex justify-between items-center mb-4">
                        <h2 class="text-lg font-semibold flex items-center">
                            <i class="fas fa-globe mr-2 text-blue-500"></i>
                            域名列表
                        </h2>
                        <button onclick="loadDomains()" class="p-2 rounded-lg hover:bg-gray-700 transition" title="刷新">
                            <i class="fas fa-sync-alt" id="refreshDomains"></i>
                        </button>
                    </div>

                    <div class="relative mb-4">
                        <input type="text" id="domainSearch" class="input-field w-full px-4 py-2 pl-10 rounded-lg text-sm" placeholder="搜索域名..." oninput="filterDomains()">
                        <i class="fas fa-search absolute left-3 top-2.5 text-gray-400 text-sm"></i>
                    </div>

                    <div id="domainList" class="space-y-2 max-h-96 overflow-y-auto">
                        <div class="text-center text-gray-500 py-8">
                            <i class="fas fa-inbox text-3xl mb-2"></i>
                            <p class="text-sm">点击刷新加载域名</p>
                        </div>
                    </div>
                </div>
            </section>

            <section class="lg:col-span-2">
                <div class="card rounded-xl p-6 fade-in">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 space-y-2 sm:space-y-0">
                        <div>
                            <h2 class="text-lg font-semibold flex items-center">
                                <i class="fas fa-list mr-2 text-green-500"></i>
                                解析记录
                                <span id="currentDomain" class="ml-2 text-sm text-gray-400 font-normal"></span>
                            </h2>
                        </div>
                        <div class="flex space-x-2">
                            <button onclick="showCreateModal()" id="btnAddRecord" class="btn-success px-4 py-2 rounded-lg text-sm font-medium transition opacity-50 cursor-not-allowed" disabled>
                                <i class="fas fa-plus mr-2"></i>添加记录
                            </button>
                            <button onclick="loadRecords()" id="btnRefreshRecords" class="p-2 rounded-lg hover:bg-gray-700 transition opacity-50 cursor-not-allowed" disabled>
                                <i class="fas fa-sync-alt"></i>
                            </button>
                        </div>
                    </div>

                    <div class="overflow-x-auto">
                        <table class="w-full text-left">
                            <thead>
                                <tr class="border-b border-gray-700 text-xs uppercase text-gray-400">
                                    <th class="pb-3 pr-4">主机记录</th>
                                    <th class="pb-3 pr-4">类型</th>
                                    <th class="pb-3 pr-4">记录值</th>
                                    <th class="pb-3 pr-4">TTL</th>
                                    <th class="pb-3 text-right">操作</th>
                                </tr>
                            </thead>
                            <tbody id="recordsTable">
                                <tr>
                                    <td colspan="5" class="text-center py-12 text-gray-500">
                                        <i class="fas fa-mouse-pointer text-3xl mb-2"></i>
                                        <p>请先从左侧选择一个域名</p>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>
        </div>
    </main>

    <!-- 修复后的模态框 - 添加滚动支持 -->
    <div id="recordModal" class="fixed inset-0 z-50 hidden overflow-y-auto">
        <div class="modal-overlay absolute inset-0 bg-black/60" onclick="closeModal()"></div>
        <div class="relative min-h-screen flex items-start justify-center p-4 pt-10 pb-10">
            <div class="card rounded-xl shadow-2xl w-full max-w-md p-6 relative fade-in modal-scroll my-8">
                <button onclick="closeModal()" class="absolute top-4 right-4 text-gray-400 hover:text-white z-10">
                    <i class="fas fa-times"></i>
                </button>

                <h3 id="modalTitle" class="text-xl font-bold mb-6">添加解析记录</h3>

                <form id="recordForm" onsubmit="handleRecordSubmit(event)">
                    <input type="hidden" id="recordId">

                    <div class="modal-body">
                        <div class="space-y-4">
                            <div>
                                <label class="block text-sm font-medium mb-2 text-gray-400">域名</label>
                                <input type="text" id="formDomain" class="input-field w-full px-4 py-2 rounded-lg bg-gray-800" readonly>
                            </div>

                            <div>
                                <label class="block text-sm font-medium mb-2 text-gray-400">主机记录 <span class="text-red-500">*</span></label>
                                <div class="flex items-center">
                                    <input type="text" id="formHost" class="input-field w-full px-4 py-2 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="www" required>
                                    <span class="px-3 py-2 bg-gray-700 text-gray-400 rounded-r-lg border border-l-0 border-gray-600">.<span id="formDomainSuffix">example.com</span></span>
                                </div>
                                <p class="text-xs text-gray-500 mt-1">使用 @ 表示根域名</p>
                            </div>

                            <div>
                                <label class="block text-sm font-medium mb-2 text-gray-400">记录类型 <span class="text-red-500">*</span></label>
                                <select id="formType" class="input-field w-full px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                                    <option value="A">A - IPv4 地址</option>
                                    <option value="AAAA">AAAA - IPv6 地址</option>
                                    <option value="CNAME">CNAME - 别名记录</option>
                                    <option value="MX">MX - 邮件交换</option>
                                    <option value="TXT">TXT - 文本记录</option>
                                    <option value="NS">NS - 名称服务器</option>
                                </select>
                            </div>

                            <div>
                                <label class="block text-sm font-medium mb-2 text-gray-400">记录值 <span class="text-red-500">*</span></label>
                                <input type="text" id="formValue" class="input-field w-full px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="1.2.3.4" required>
                            </div>

                            <div>
                                <label class="block text-sm font-medium mb-2 text-gray-400">TTL (秒)</label>
                                <input type="number" id="formTTL" class="input-field w-full px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" value="600" min="60" step="1">
                                <p class="text-xs text-gray-500 mt-1">默认 600 秒</p>
                            </div>

                            <div>
                                <label class="block text-sm font-medium mb-2 text-gray-400">优先级 (MX 记录)</label>
                                <input type="number" id="formPriority" class="input-field w-full px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="10" min="0" max="65535">
                            </div>
                        </div>
                    </div>

                    <div class="modal-actions flex space-x-3">
                        <button type="button" onclick="closeModal()" class="flex-1 px-4 py-2 rounded-lg border border-gray-600 hover:bg-gray-700 transition">取消</button>
                        <button type="submit" id="submitBtn" class="flex-1 btn-primary px-4 py-2 rounded-lg font-medium transition">
                            <span id="submitText">确认添加</span>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <div id="deleteModal" class="fixed inset-0 z-50 hidden">
        <div class="modal-overlay absolute inset-0 bg-black/60" onclick="closeDeleteModal()"></div>
        <div class="relative min-h-screen flex items-center justify-center p-4">
            <div class="card rounded-xl shadow-2xl w-full max-w-sm p-6 relative fade-in">
                <div class="w-16 h-16 bg-red-900/50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i class="fas fa-exclamation-triangle text-red-500 text-2xl"></i>
                </div>
                <h3 class="text-xl font-bold mb-2">确认删除</h3>
                <p class="text-gray-400 mb-6">确定要删除这条解析记录吗？此操作不可撤销。</p>
                <div class="flex space-x-3">
                    <button onclick="closeDeleteModal()" class="flex-1 px-4 py-2 rounded-lg border border-gray-600 hover:bg-gray-700 transition">取消</button>
                    <button onclick="confirmDelete()" class="flex-1 btn-danger px-4 py-2 rounded-lg font-medium transition">确认删除</button>
                </div>
            </div>
        </div>
    </div>

    <script>
        let currentDomain = null;
        let domains = [];
        let records = [];
        let deleteTargetId = null;
        let isEditing = false;
        let hasServerApiKey = false;

        document.addEventListener('DOMContentLoaded', () => {
            loadConfig();
            checkTheme();
            checkServerConfig();
        });

        async function checkServerConfig() {
            try {
                const response = await fetch('/api/client/dnsopenapi/domain_list', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: '{}'
                });
                if (response.status !== 401 && response.status !== 403) {
                    hasServerApiKey = true;
                    document.getElementById('envApiKeyBadge').classList.remove('hidden');
                    document.getElementById('apiKeySource').textContent = '(服务端已配置，可选)';
                    document.getElementById('apiKey').placeholder = '服务端已配置 API Key（可选覆盖）';
                }
            } catch (e) {
                console.log('Server config check failed:', e);
            }
        }

        function checkTheme() {
            const savedTheme = localStorage.getItem('theme') || 'dark';
            if (savedTheme === 'light') {
                document.body.classList.add('light-mode');
                document.getElementById('themeIcon').classList.replace('fa-sun', 'fa-moon');
            }
        }

        function toggleTheme() {
            document.body.classList.toggle('light-mode');
            const icon = document.getElementById('themeIcon');
            if (document.body.classList.contains('light-mode')) {
                icon.classList.replace('fa-sun', 'fa-moon');
                localStorage.setItem('theme', 'light');
            } else {
                icon.classList.replace('fa-moon', 'fa-sun');
                localStorage.setItem('theme', 'dark');
            }
        }

        function saveConfig() {
            const apiKey = document.getElementById('apiKey').value.trim();
            if (!apiKey && !hasServerApiKey) {
                showToast('请输入 API Key', 'error');
                return;
            }
            if (apiKey) {
                localStorage.setItem('dns_api_key', apiKey);
            } else {
                localStorage.removeItem('dns_api_key');
            }
            showToast('配置已保存', 'success');
            loadDomains();
        }

        function loadConfig() {
            document.getElementById('apiKey').value = localStorage.getItem('dns_api_key') || '';
        }

        function toggleApiKeyVisibility() {
            const input = document.getElementById('apiKey');
            const icon = document.getElementById('apiKeyIcon');
            if (input.type === 'password') {
                input.type = 'text';
                icon.classList.replace('fa-eye', 'fa-eye-slash');
            } else {
                input.type = 'password';
                icon.classList.replace('fa-eye-slash', 'fa-eye');
            }
        }

        async function apiCall(endpoint, data = {}) {
            const apiKey = localStorage.getItem('dns_api_key');
            const headers = { 'Content-Type': 'application/json' };
            if (apiKey) {
                headers['Authorization'] = 'Basic ' + btoa('client:' + apiKey);
            }
            try {
                const response = await fetch('/api/client/dnsopenapi/' + endpoint, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(data)
                });
                if (response.status === 429) throw new Error('请求过于频繁，请稍后再试 (429)');
                if (response.status === 401 || response.status === 403) throw new Error('认证失败，请检查 API Key 是否正确');
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(\`HTTP ${response.status}: ${errorText}\`);
                }
                return await response.json();
            } catch (error) {
                if (error.message.includes('Failed to fetch')) {
                    throw new Error('请求失败。请检查：1. Edge Function 是否正确部署 2. 环境变量是否配置 3. 网络连接是否正常。错误: ' + error.message);
                }
                throw error;
            }
        }

        async function loadDomains() {
            const btn = document.getElementById('refreshDomains');
            btn.classList.add('fa-spin');
            setStatus('loading', '连接中...');
            try {
                const data = await apiCall('domain_list', {});
                console.log('API Response:', data);
                domains = data.result || [];
                if (domains.length === 0) {
                    showToast('未找到域名，请检查 API 权限', 'warning');
                } else {
                    showToast(\`已加载 ${domains.length} 个域名\`, 'success');
                }
                renderDomains();
                setStatus('ready', '就绪');
            } catch (error) {
                showToast(error.message, 'error');
                setStatus('error', '连接失败');
                console.error('Load domains error:', error);
            } finally {
                btn.classList.remove('fa-spin');
            }
        }

        function setStatus(status, text) {
            const indicator = document.getElementById('statusIndicator');
            const statusText = document.getElementById('statusText');
            statusText.textContent = text;
            indicator.className = 'w-2 h-2 rounded-full';
            if (status === 'ready') indicator.classList.add('bg-green-500', 'animate-pulse');
            else if (status === 'loading') indicator.classList.add('bg-yellow-500', 'animate-pulse');
            else if (status === 'error') indicator.classList.add('bg-red-500');
        }

        function renderDomains() {
            const container = document.getElementById('domainList');
            const searchTerm = (document.getElementById('domainSearch').value || '').toLowerCase();
            const filtered = domains.filter(d => {
                const domainName = d.domain || '';
                return domainName.toLowerCase().includes(searchTerm);
            });
            if (filtered.length === 0) {
                container.innerHTML = \`<div class="text-center text-gray-500 py-8"><i class="fas fa-search text-2xl mb-2"></i><p class="text-sm">未找到匹配的域名</p></div>\`;
                return;
            }
            container.innerHTML = filtered.map((domain) => {
                const domainName = domain.domain || '';
                const isActive = currentDomain === domainName;
                return \`
                    <div onclick="selectDomain('${domainName}')" class="record-row p-3 rounded-lg cursor-pointer flex justify-between items-center ${isActive ? 'bg-blue-600/20 border border-blue-500/50' : 'hover:bg-gray-700/50'}">
                        <div class="flex items-center space-x-3">
                            <div class="w-8 h-8 rounded-full bg-blue-900/50 flex items-center justify-center"><i class="fas fa-globe text-blue-400 text-xs"></i></div>
                            <div><p class="font-medium text-sm">${domainName}</p><p class="text-xs text-gray-500">点击管理解析</p></div>
                        </div>
                        ${isActive ? '<i class="fas fa-chevron-right text-blue-500"></i>' : ''}
                    </div>\`;
            }).join('');
        }

        function filterDomains() { renderDomains(); }

        async function selectDomain(domain) {
            currentDomain = domain;
            document.getElementById('currentDomain').textContent = \`- ${domain}\`;
            document.getElementById('btnAddRecord').disabled = false;
            document.getElementById('btnAddRecord').classList.remove('opacity-50', 'cursor-not-allowed');
            document.getElementById('btnRefreshRecords').disabled = false;
            document.getElementById('btnRefreshRecords').classList.remove('opacity-50', 'cursor-not-allowed');
            renderDomains();
            await loadRecords();
        }

        async function loadRecords() {
            if (!currentDomain) return;
            const btn = document.querySelector('#btnRefreshRecords i');
            btn.classList.add('fa-spin');
            try {
                const data = await apiCall('record_list', { domain: currentDomain });
                console.log('Records Response:', data);
                records = data.result || [];
                renderRecords();
            } catch (error) {
                showToast(error.message, 'error');
                console.error('Load records error:', error);
            } finally {
                btn.classList.remove('fa-spin');
            }
        }

        function renderRecords() {
            const tbody = document.getElementById('recordsTable');
            if (records.length === 0) {
                tbody.innerHTML = \`<tr><td colspan="5" class="text-center py-12 text-gray-500"><i class="fas fa-inbox text-3xl mb-2"></i><p>该域名暂无解析记录</p><button onclick="showCreateModal()" class="mt-4 text-blue-500 hover:text-blue-400 text-sm"><i class="fas fa-plus mr-1"></i>添加第一条记录</button></td></tr>\`;
                return;
            }
            tbody.innerHTML = records.map(record => {
                const type = (record.type || '').toUpperCase();
                const typeClass = \`type-${type.toLowerCase()}\`;
                const host = record.host || record.name || record.subdomain || '@';
                const value = record.value || record.content || record.address || record.data || record.target || '-';
                const ttl = record.ttl || record.TTL || '-';
                const id = record.id || record.record_id || 0;
                return \`
                    <tr class="record-row border-b border-gray-700/50">
                        <td class="py-4 pr-4 font-medium">${host}</td>
                        <td class="py-4 pr-4"><span class="type-badge ${typeClass}">${type || '?'}</span></td>
                        <td class="py-4 pr-4 text-sm text-gray-300 max-w-xs truncate" title="${value}">${value}</td>
                        <td class="py-4 pr-4 text-sm text-gray-400">${ttl}</td>
                        <td class="py-4 text-right">
                            <div class="flex justify-end space-x-2">
                                <button onclick="editRecord(${id})" class="p-2 rounded-lg hover:bg-blue-900/30 text-blue-400 transition" title="编辑"><i class="fas fa-edit"></i></button>
                                <button onclick="deleteRecord(${id})" class="p-2 rounded-lg hover:bg-red-900/30 text-red-400 transition" title="删除"><i class="fas fa-trash-alt"></i></button>
                            </div>
                        </td>
                    </tr>\`;
            }).join('');
        }

        function showCreateModal() {
            if (!currentDomain) { showToast('请先选择一个域名', 'warning'); return; }
            isEditing = false;
            document.getElementById('modalTitle').textContent = '添加解析记录';
            document.getElementById('submitText').textContent = '确认添加';
            document.getElementById('recordForm').reset();
            document.getElementById('formDomain').value = currentDomain;
            document.getElementById('formDomainSuffix').textContent = currentDomain;
            document.getElementById('recordId').value = '';
            document.getElementById('formTTL').value = '600';
            document.getElementById('recordModal').classList.remove('hidden');
            document.body.style.overflow = 'hidden';
            setTimeout(() => {
                const modalBody = document.querySelector('.modal-body');
                if (modalBody) modalBody.scrollTop = 0;
            }, 10);
        }

        function editRecord(id) {
            const record = records.find(r => (r.id || r.record_id) == id);
            if (!record) return;
            isEditing = true;
            document.getElementById('modalTitle').textContent = '编辑解析记录';
            document.getElementById('submitText').textContent = '保存修改';
            document.getElementById('recordId').value = id;
            document.getElementById('formDomain').value = currentDomain;
            document.getElementById('formDomainSuffix').textContent = currentDomain;
            document.getElementById('formHost').value = record.host || record.name || record.subdomain || '';
            document.getElementById('formType').value = (record.type || 'A').toUpperCase();
            document.getElementById('formValue').value = record.value || record.content || record.address || record.data || record.target || '';
            document.getElementById('formTTL').value = record.ttl || record.TTL || 600;
            document.getElementById('formPriority').value = record.priority || record.mx_priority || record.Priority || '';
            document.getElementById('recordModal').classList.remove('hidden');
            document.body.style.overflow = 'hidden';
            setTimeout(() => {
                const modalBody = document.querySelector('.modal-body');
                if (modalBody) modalBody.scrollTop = 0;
            }, 10);
        }

        function closeModal() { 
            document.getElementById('recordModal').classList.add('hidden'); 
            document.body.style.overflow = '';
            const modalBody = document.querySelector('.modal-body');
            if (modalBody) modalBody.scrollTop = 0;
        }

        async function handleRecordSubmit(e) {
            e.preventDefault();
            const id = document.getElementById('recordId').value;
            const domain = document.getElementById('formDomain').value;
            const host = document.getElementById('formHost').value;
            const type = document.getElementById('formType').value;
            const value = document.getElementById('formValue').value;
            const ttl = parseInt(document.getElementById('formTTL').value) || 600;
            const priority = document.getElementById('formPriority').value;
            const submitBtn = document.getElementById('submitBtn');
            const originalText = document.getElementById('submitText').textContent;
            submitBtn.disabled = true;
            document.getElementById('submitText').innerHTML = '<div class="loading-spinner mx-auto"></div>';
            try {
                if (isEditing && id) {
                    const data = { domain, id: parseInt(id), value, ttl };
                    if (priority) data.priority = parseInt(priority);
                    await apiCall('record_update', data);
                    showToast('记录更新成功', 'success');
                } else {
                    const data = { domain, host, type, value, ttl };
                    if (priority) data.priority = parseInt(priority);
                    await apiCall('record_create', data);
                    showToast('记录创建成功', 'success');
                }
                closeModal();
                await loadRecords();
            } catch (error) {
                showToast(error.message, 'error');
            } finally {
                submitBtn.disabled = false;
                document.getElementById('submitText').textContent = originalText;
            }
        }

        function deleteRecord(id) { deleteTargetId = id; document.getElementById('deleteModal').classList.remove('hidden'); }
        function closeDeleteModal() { document.getElementById('deleteModal').classList.add('hidden'); deleteTargetId = null; }

        async function confirmDelete() {
            if (!deleteTargetId || !currentDomain) return;
            const btn = document.querySelector('#deleteModal .btn-danger');
            btn.disabled = true;
            btn.innerHTML = '<div class="loading-spinner mx-auto"></div>';
            try {
                await apiCall('record_delete', { domain: currentDomain, id: parseInt(deleteTargetId) });
                showToast('记录删除成功', 'success');
                closeDeleteModal();
                await loadRecords();
            } catch (error) {
                showToast(error.message, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = '确认删除';
            }
        }

        function showToast(message, type = 'info') {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            const colors = { success: 'bg-green-600', error: 'bg-red-600', warning: 'bg-yellow-600', info: 'bg-blue-600' };
            const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-circle', info: 'fa-info-circle' };
            toast.className = \`toast ${colors[type]} text-white px-6 py-3 rounded-lg shadow-lg flex items-center space-x-3 min-w-[300px]\`;
            toast.innerHTML = \`<i class="fas ${icons[type]}"></i><span class="font-medium">${message}</span>\`;
            container.appendChild(toast);
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(100%)';
                toast.style.transition = 'all 0.3s ease-out';
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { closeModal(); closeDeleteModal(); }
        });
    </script>
</body>
</html>
`;
