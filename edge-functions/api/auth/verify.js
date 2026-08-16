// edge-functions/api/auth/[[default]].js
// 认证路由：密码验证 + TOTP 双因素认证

import { generateTOTP, verifyTOTP, generateSecret, getOtpauthURI, generateBackupCodes } from '../../utils/totp.js';

// ============ 工具函数 ============

function generateSecureToken() {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            ...extraHeaders
        }
    });
}

function getKV(env) {
    return typeof dns_kv !== 'undefined' ? dns_kv : null;
}

// 速率限制（内存级，单节点有效）
const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW = 60000;

function checkRateLimit(clientIP) {
    const now = Date.now();
    if (!rateLimitMap.has(clientIP)) {
        rateLimitMap.set(clientIP, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
        return { allowed: true };
    }
    const record = rateLimitMap.get(clientIP);
    if (now > record.resetTime) {
        rateLimitMap.set(clientIP, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
        return { allowed: true };
    }
    if (record.count >= RATE_LIMIT_MAX) {
        return { allowed: false, retryAfter: Math.ceil((record.resetTime - now) / 1000) };
    }
    record.count++;
    return { allowed: true };
}

// ============ 路由分发 ============

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Max-Age': '86400'
            }
        });
    }

    const clientIP = request.headers.get('cf-connecting-ip') || 
                     request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                     'unknown';

    // 1. 密码验证（第一步）
    if (path === '/api/auth/verify' && request.method === 'POST') {
        return handlePasswordVerify(request, env, clientIP);
    }

    // 2. TOTP 验证（第二步）
    if (path === '/api/auth/verify-totp' && request.method === 'POST') {
        return handleTOTPVerify(request, env, clientIP);
    }

    // 3. 获取 TOTP 设置状态
    if (path === '/api/auth/totp-status' && request.method === 'GET') {
        return handleTOTPStatus(request, env);
    }

    // 4. 启用 TOTP（生成密钥）
    if (path === '/api/auth/setup-totp' && request.method === 'POST') {
        return handleSetupTOTP(request, env);
    }

    // 5. 确认启用 TOTP
    if (path === '/api/auth/confirm-totp' && request.method === 'POST') {
        return handleConfirmTOTP(request, env);
    }

    // 6. 禁用 TOTP
    if (path === '/api/auth/disable-totp' && request.method === 'POST') {
        return handleDisableTOTP(request, env);
    }

    // 7. 使用备用码登录
    if (path === '/api/auth/backup-code' && request.method === 'POST') {
        return handleBackupCode(request, env, clientIP);
    }

    return jsonResponse({ error: 'Not found' }, 404);
}

// ============ 处理器 ============

// 第一步：密码验证
async function handlePasswordVerify(request, env, clientIP) {
    const rateLimit = checkRateLimit(clientIP);
    if (!rateLimit.allowed) {
        return jsonResponse({ error: '请求过于频繁，请稍后再试' }, 429, { 'Retry-After': String(rateLimit.retryAfter) });
    }

    const { password } = await request.json();
    const accessPassword = (env.ACCESS_PASSWORD || '').trim();

    if (!accessPassword) {
        return jsonResponse({ error: '认证失败' }, 401);
    }

    if (password !== accessPassword) {
        return jsonResponse({ error: '认证失败' }, 401);
    }

    const kv = getKV(env);
    if (!kv) {
        return jsonResponse({ error: '服务配置错误' }, 500);
    }

    // 检查是否已启用 TOTP
    const totpSecret = await kv.get('auth:totp_secret');

    if (totpSecret) {
        // 需要第二步验证：生成临时 token
        const tempToken = generateSecureToken();
        await kv.put(`temp_session:${tempToken}`, JSON.stringify({ 
            step: 'totp_pending', 
            created: Date.now() 
        }), { expirationTtl: 300 }); // 5分钟有效期

        return jsonResponse({ 
            success: true, 
            require_totp: true,
            temp_token: tempToken 
        });
    }

    // 未启用 TOTP，直接登录
    const sessionToken = generateSecureToken();
    await kv.put(`session:${sessionToken}`, 'valid', { expirationTtl: 86400 });

    return jsonResponse({ 
        success: true, 
        require_totp: false,
        token: sessionToken 
    }, 200, {
        'Set-Cookie': `dns_session=${encodeURIComponent(sessionToken)}; Path=/; Max-Age=86400; SameSite=Lax; Secure`
    });
}

// 第二步：TOTP 验证
async function handleTOTPVerify(request, env, clientIP) {
    const rateLimit = checkRateLimit(`totp:${clientIP}`);
    if (!rateLimit.allowed) {
        return jsonResponse({ error: '请求过于频繁' }, 429);
    }

    const { temp_token, totp_code } = await request.json();
    const kv = getKV(env);

    if (!kv) return jsonResponse({ error: '服务配置错误' }, 500);

    const tempData = await kv.get(`temp_session:${temp_token}`);
    if (!tempData) {
        return jsonResponse({ error: '验证会话已过期，请重新登录' }, 401);
    }

    const session = JSON.parse(tempData);
    if (session.step !== 'totp_pending') {
        return jsonResponse({ error: '无效的验证会话' }, 400);
    }

    const secret = await kv.get('auth:totp_secret');
    if (!secret) {
        return jsonResponse({ error: 'TOTP 未配置' }, 400);
    }

    const valid = await verifyTOTP(secret, totp_code);
    if (!valid) {
        return jsonResponse({ error: '验证码错误' }, 401);
    }

    // 验证通过，删除临时会话，创建正式会话
    await kv.delete(`temp_session:${temp_token}`);
    const sessionToken = generateSecureToken();
    await kv.put(`session:${sessionToken}`, 'valid', { expirationTtl: 86400 });

    return jsonResponse({ 
        success: true, 
        token: sessionToken 
    }, 200, {
        'Set-Cookie': `dns_session=${encodeURIComponent(sessionToken)}; Path=/; Max-Age=86400; SameSite=Lax; Secure`
    });
}

// 备用码登录
async function handleBackupCode(request, env, clientIP) {
    const rateLimit = checkRateLimit(`backup:${clientIP}`);
    if (!rateLimit.allowed) {
        return jsonResponse({ error: '请求过于频繁' }, 429);
    }

    const { temp_token, backup_code } = await request.json();
    const kv = getKV(env);

    if (!kv) return jsonResponse({ error: '服务配置错误' }, 500);

    const tempData = await kv.get(`temp_session:${temp_token}`);
    if (!tempData) {
        return jsonResponse({ error: '验证会话已过期' }, 401);
    }

    const session = JSON.parse(tempData);
    if (session.step !== 'totp_pending') {
        return jsonResponse({ error: '无效的验证会话' }, 400);
    }

    const storedCodes = await kv.get('auth:totp_backup');
    if (!storedCodes) {
        return jsonResponse({ error: '无可用备用码' }, 400);
    }

    const codes = JSON.parse(storedCodes);
    const idx = codes.indexOf(backup_code.toUpperCase().replace(/\s/g, ''));

    if (idx === -1) {
        return jsonResponse({ error: '备用码无效' }, 401);
    }

    // 删除已使用的备用码
    codes.splice(idx, 1);
    await kv.put('auth:totp_backup', JSON.stringify(codes), { expirationTtl: 0 });

    // 创建正式会话
    await kv.delete(`temp_session:${temp_token}`);
    const sessionToken = generateSecureToken();
    await kv.put(`session:${sessionToken}`, 'valid', { expirationTtl: 86400 });

    return jsonResponse({ 
        success: true, 
        token: sessionToken,
        warning: '备用码已使用，建议重新生成'
    }, 200, {
        'Set-Cookie': `dns_session=${encodeURIComponent(sessionToken)}; Path=/; Max-Age=86400; SameSite=Lax; Secure`
    });
}

// 获取 TOTP 状态
async function handleTOTPStatus(request, env) {
    const kv = getKV(env);
    if (!kv) return jsonResponse({ enabled: false });

    const secret = await kv.get('auth:totp_secret');
    return jsonResponse({ enabled: !!secret });
}

// 启用 TOTP - 生成密钥
async function handleSetupTOTP(request, env) {
    const authResult = await verifySession(request, env);
    if (!authResult.valid) {
        return jsonResponse({ error: '未授权' }, 401);
    }

    const kv = getKV(env);
    if (!kv) return jsonResponse({ error: '服务配置错误' }, 500);

    // 检查是否已启用
    const existing = await kv.get('auth:totp_secret');
    if (existing) {
        return jsonResponse({ error: 'TOTP 已启用，请先禁用' }, 400);
    }

    const secret = generateSecret();
    const backupCodes = generateBackupCodes();
    const tempSetupToken = generateSecureToken();

    // 保存待确认状态
    await kv.put(`totp_setup:${tempSetupToken}`, JSON.stringify({
        secret,
        backupCodes,
        created: Date.now()
    }), { expirationTtl: 600 }); // 10分钟确认窗口

    const uri = getOtpauthURI('admin', secret, 'DNSManager');

    return jsonResponse({
        secret,
        otpauth_uri: uri,
        setup_token: tempSetupToken,
        backup_codes: backupCodes
    });
}

// 确认启用 TOTP
async function handleConfirmTOTP(request, env) {
    const authResult = await verifySession(request, env);
    if (!authResult.valid) {
        return jsonResponse({ error: '未授权' }, 401);
    }

    const { setup_token, totp_code } = await request.json();
    const kv = getKV(env);
    if (!kv) return jsonResponse({ error: '服务配置错误' }, 500);

    const setupData = await kv.get(`totp_setup:${setup_token}`);
    if (!setupData) {
        return jsonResponse({ error: '设置会话已过期，请重新开始' }, 400);
    }

    const { secret, backupCodes } = JSON.parse(setupData);
    const valid = await verifyTOTP(secret, totp_code);

    if (!valid) {
        return jsonResponse({ error: '验证码错误，请确认 Authenticator 中时间同步正常' }, 401);
    }

    // 正式保存
    await kv.put('auth:totp_secret', secret, { expirationTtl: 0 });
    await kv.put('auth:totp_backup', JSON.stringify(backupCodes), { expirationTtl: 0 });
    await kv.delete(`totp_setup:${setup_token}`);

    return jsonResponse({ 
        success: true, 
        message: 'TOTP 双因素认证已启用'
    });
}

// 禁用 TOTP
async function handleDisableTOTP(request, env) {
    const authResult = await verifySession(request, env);
    if (!authResult.valid) {
        return jsonResponse({ error: '未授权' }, 401);
    }

    const { password } = await request.json();
    const accessPassword = (env.ACCESS_PASSWORD || '').trim();

    if (password !== accessPassword) {
        return jsonResponse({ error: '密码错误' }, 401);
    }

    const kv = getKV(env);
    if (!kv) return jsonResponse({ error: '服务配置错误' }, 500);

    await kv.delete('auth:totp_secret');
    await kv.delete('auth:totp_backup');

    return jsonResponse({ 
        success: true, 
        message: 'TOTP 已禁用'
    });
}

// ============ 会话验证工具 ============

async function verifySession(request, env) {
    const cookie = request.headers.get('cookie') || '';
    const sessionMatch = cookie.match(/dns_session=([^;]+)/);
    const sessionToken = sessionMatch ? decodeURIComponent(sessionMatch[1]) : null;

    if (!sessionToken) return { valid: false };

    const kv = getKV(env);
    if (!kv) return { valid: false };

    const session = await kv.get(`session:${sessionToken}`);
    return { valid: session === 'valid', token: sessionToken };
}
