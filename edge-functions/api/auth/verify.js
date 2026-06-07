// edge-functions/api/auth/verify.js
export async function onRequestPost(context) {
    const { request, env } = context;
    
    try {
        const { password } = await request.json();
        const accessPassword = env.ACCESS_PASSWORD;

        if (!accessPassword || accessPassword.trim() === '') {
            return new Response(JSON.stringify({ error: '未配置访问密码' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (password === accessPassword) {
            // 生成会话令牌
            const timestamp = Date.now();
            const random = Math.random().toString(36).substring(2, 15);
            const token = `dns_${timestamp}_${random}`;
            
            // 存储到KV
            if (env.dns_kv) {
                try {
                    await env.dns_kv.put(`session:${token}`, 'valid', { expirationTtl: 86400 });
                } catch (e) {
                    console.log('KV store failed:', e);
                }
            }
            
            return new Response(JSON.stringify({ 
                success: true, 
                token,
                message: '验证成功'
            }), {
                headers: { 
                    'Content-Type': 'application/json',
                    'Set-Cookie': `dns_session=${encodeURIComponent(token)}; Path=/; Max-Age=86400; SameSite=Lax; HttpOnly`
                }
            });
        } else {
            return new Response(JSON.stringify({ error: '密码错误' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    } catch (e) {
        return new Response(JSON.stringify({ error: '请求格式错误' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
