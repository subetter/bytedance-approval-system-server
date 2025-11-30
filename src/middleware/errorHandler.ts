import { Context, Next } from 'koa';

/**
 * @description 全局错误处理中间件
 * 捕获所有下游抛出的错误，并格式化为统一的 JSON 响应。
 */
const errorHandlerMiddleware = async (ctx: Context, next: Next) => {
    try {
        await next();

        // 如果请求成功通过所有中间件，但没有设置响应体 (body)，且状态码是默认的 404
        // Koa 在没有匹配路由时默认设置 ctx.status = 404
        if (ctx.status === 404 && !ctx.body) {
            ctx.throw(404, 'Resource Not Found');
        }

    } catch (err: any) {
        // 从 Koa 抛出的错误对象中提取状态码或使用默认值 500
        ctx.status = err.status || err.statusCode || 500;

        // 格式化错误响应体
        ctx.body = {
            code: ctx.status,
            error: err.name || 'Internal Server Error',
            message: err.message || '服务器发生错误',
            // 提取自定义的错误详情，例如 ctx.throw(400, "...", { field: "email" })
            details: err.details || err.field || null
        };

        // 触发 app.on('error') 事件，用于记录到日志系统 (在 src/server.ts 中监听)
        // 只有当状态码为 500 或其他服务器端错误时，才触发错误事件进行日志记录
        if (ctx.status >= 500) {
            ctx.app.emit('error', err, ctx);
        } else {
            // 客户端错误（如 400, 404, 403）通常不需要作为系统错误记录
            console.warn(`Client Error ${ctx.status}: ${err.message}`);
        }
    }
};

export default errorHandlerMiddleware;