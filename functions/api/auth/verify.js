// functions/api/auth/verify.js
export async function onRequestPost(context) {
    const { request, env } = context;
    
    try {
        const { password } = await request.json();
        const accessPassword = env.ACCESS_PASSWORD;
        
        if (!accessPassword || accessPassword.trim() === '') {
            return new Response(JSON.stringify({ error: '未配置密码' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        if (password === accessPassword) {
            // 生成会话令牌
            const token = crypto.randomUUID();
            
            // 存储到 KV（如果配置了）
            if (env.DNS_KV) {
                await env.DNS_KV.put(`session:${token}`, 'valid', { expirationTtl: 86400 });
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
