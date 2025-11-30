// src/middleware/logger.ts

import { Context, Next } from 'koa'; // 导入 Koa 的类型
import dayjs from 'dayjs'; // 导入 dayjs

/**
 * @description 日志中间件
 * 记录请求和响应的信息，包括URL、方法、状态码、响应时间等
 */

// 颜色配置
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    reset: '\x1b[0m', // 添加重置颜色代码
};

/**
 * @description 根据状态码获取终端日志颜色
 * @param status HTTP 状态码
 * @returns 对应的 ANSI 颜色代码
 */
const getStatusColor = (status: number): string => {
    if (status >= 500) return colors.red;    // 服务器错误 - 红色
    if (status >= 400) return colors.yellow; // 客户端错误 - 黄色
    if (status >= 300) return colors.cyan;   // 重定向 - 青色
    if (status >= 200) return colors.green;  // 成功 - 绿色
    return colors.white;                     // 其他 - 白色
};

/**
 * @description Koa 日志中间件
 */
const loggerMiddleware = async (ctx: Context, next: Next): Promise<void> => {
    const start = Date.now();
    const { method, url, ip } = ctx;

    // 继续执行下游中间件和路由
    await next();

    const responseTime = Date.now() - start;
    const status = ctx.status;
    const dateTime = dayjs().format('YYYY-MM-DD HH:mm:ss');

    // 根据状态码设置日志颜色
    const logColor = getStatusColor(status);

    // 打印日志：添加 colors.reset 以确保后续控制台输出恢复默认颜色
    console.log(`${logColor}[${dateTime}] ${method} ${url} - ${status} - ${responseTime}ms - ${ip}${colors.reset}`);
};

// 使用 ES 模块导出中间件
export default loggerMiddleware;