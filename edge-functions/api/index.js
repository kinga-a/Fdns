// edge-functions/index.js
export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);

    // 直接重定向到 dnsindex.html，不再拦截密码
    return Response.redirect(url.origin + '/index.html', 302);
}
