// src/server.ts

import Koa, { Context } from 'koa'; // 引入 Koa 和 Context 类型
// 确保您的 db.ts 是通过 export default pool 导出的，这里通过副作用导入执行 testConnection()
import './config/db';
import errorHandlerMiddleware from './middleware/errorHandler';
import loggerMiddleware from './middleware/logger';
import bodyParser from 'koa-bodyparser';
import apiRouter from './routes' // 引入路由汇总文件 (src/routes/index.ts)

// 2.创建 Koa 应用实例
const app = new Koa();
console.log('创建成功');
// ------------------------------------------------
// 注册中间件
// ------------------------------------------------

// 错误处理 (必须在最前面注册，以便捕获所有下游错误)
app.use(errorHandlerMiddleware);

// 日志中间件
app.use(loggerMiddleware);

// Body parser middleware (解析 JSON/urlencoded form)
app.use(bodyParser({ enableTypes: ['json', 'form'], jsonLimit: '10mb' }));

// 3. 注册路由
app.use(apiRouter.routes());
app.use(apiRouter.allowedMethods());

// 4. 404 错误处理（如果所有路由都不匹配，则返回 404）
app.use(async (ctx: Context) => {
    if (ctx.status === 404) {
        ctx.status = 404;
        ctx.body = {
            code: 404,
            error: 'Not Found',
            message: `请求资源未找到: ${ctx.method} ${ctx.url}`
        };
    }
});

// 5. 错误订阅消息回调 (用于记录系统级错误)
app.on("error", (err: Error, ctx: Context) => {
    // 这里的错误通常是应用程序内部的、未被中间件捕获的错误
    console.error("服务器系统级错误：", err);
});

// 6. 启动服务器，监听 3001 端口
const port = 3001;
app.listen(port, () => {
    console.log(`服务器已启动，访问 http://localhost:${port} 查看效果`);
});