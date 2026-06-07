// middleware.js - 根目录中间件（空壳，配合 edge-functions/_middleware.js 使用）
export function middleware(context) {
    return context.next();
}

export const config = {
    matcher: ['/:path*'],
};
