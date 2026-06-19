// edge-functions/api/auth/verify.js
// 安全加固版本

function generateSecureToken() {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

// 速率限制存储（基于内存，生产环境建议用 KV 持久化）
// 注意：生产环境建议改用 KV 存储速率限制数据
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1分钟
const RATE_LIMIT_MAX = 5; // 每窗口最多5次

function checkRateLimit(clientIP) {
    const now = Date.now();
    const key = clientIP;

    if (!rateLimitMap.has(key)) {
        rateLimitMap.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
        return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
    }

    const record = rateLimitMap.get(key);

    if (now > record.resetTime) {
        rateLimitMap.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
        return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
    }

    if (record.count >= RATE_LIMIT_MAX) {
        return { allowed: false, remaining: 0, retryAfter: Math.ceil((record.resetTime - now) / 1000) };
    }

    record.count++;
    return { allowed: true, remaining: RATE_LIMIT_MAX - record.count };
}

export async function onRequestPost(context) {
    const { request, env } = context;

    // 获取客户端 IP
    const clientIP = request.headers.get('cf-connecting-ip') || 
                     request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                     'unknown';

    // 速率限制检查
    const rateLimit = checkRateLimit(clientIP);
    if (!rateLimit.allowed) {
        return new Response(JSON.stringify({ error: '请求过于频繁，请稍后再试' }), {
            status: 429,
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-DNS-Platform, X-DNSHE-API-Key, X-DNSHE-API-Secret',
                'Retry-After': String(rateLimit.retryAfter)
            }
        });
    }

    try {
        const { password } = await request.json();
        const accessPassword = env.ACCESS_PASSWORD;

        // 统一错误消息，不泄露配置状态
        const AUTH_FAILED_MSG = '认证失败';

        if (!accessPassword || accessPassword.trim() === '') {
            return new Response(JSON.stringify({ error: AUTH_FAILED_MSG }), {
                status: 401,
                headers: { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, X-DNS-Platform, X-DNSHE-API-Key, X-DNSHE-API-Secret'
                }
            });
        }

        if (password === accessPassword) {
            const token = generateSecureToken();

            // 使用 KV 存储 session（绑定时的 Variable Name 为 dns_kv）
            const kv = typeof dns_kv !== 'undefined' ? dns_kv : null;
            if (kv) {
                try {
                    await kv.put(`session:${token}`, 'valid', { expirationTtl: 86400 });
                } catch (e) {
                    // 生产环境移除日志: console.error('KV store failed:', e);
                    // KV 存储失败时拒绝登录，不返回有效 token
                    return new Response(JSON.stringify({ error: '服务暂时不可用，请稍后重试' }), {
                        status: 503,
                        headers: { 
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*',
                            'Access-Control-Allow-Methods': 'POST, OPTIONS',
                            'Access-Control-Allow-Headers': 'Content-Type, X-DNS-Platform, X-DNSHE-API-Key, X-DNSHE-API-Secret'
                        }
                    });
                }
            } else {
                // 未绑定 KV 时拒绝登录（不再使用时间戳回退）
                // 生产环境移除日志: console.error('KV namespace not bound');
                return new Response(JSON.stringify({ error: '服务配置错误，请联系管理员' }), {
                    status: 500,
                    headers: { 
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'POST, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type, X-DNS-Platform, X-DNSHE-API-Key, X-DNSHE-API-Secret'
                    }
                });
            }

            return new Response(JSON.stringify({ 
                success: true, 
                token,
                message: '验证成功'
            }), {
                headers: { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, X-DNS-Platform, X-DNSHE-API-Key, X-DNSHE-API-Secret',
                    'Set-Cookie': `dns_session=${encodeURIComponent(token)}; Path=/; Max-Age=86400; SameSite=Lax; Secure; HttpOnly`
                }
            });
        } else {
            return new Response(JSON.stringify({ error: AUTH_FAILED_MSG }), {
                status: 401,
                headers: { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, X-DNS-Platform, X-DNSHE-API-Key, X-DNSHE-API-Secret'
                }
            });
        }
    } catch (e) {
        return new Response(JSON.stringify({ error: '请求格式错误' }), {
            status: 400,
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-DNS-Platform, X-DNSHE-API-Key, X-DNSHE-API-Secret'
            }
        });
    }
}

export async function onRequestOptions(context) {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-DNS-Platform, X-DNSHE-API-Key, X-DNSHE-API-Secret',
            'Access-Control-Max-Age': '86400'
        }
    });
}
