// src/controllers/userController.ts

import Router from '@koa/router';
import { Context } from 'koa';
import pool from '../config/db'; // 导入连接池
import { RowDataPacket } from 'mysql2/promise'; // 导入 mysql2 的行数据类型


/**
 * @description 获取用户列表，并执行数据库查询
 * @param ctx Koa 上下文对象
 */
const getUserList = async (ctx: Context) => {
    try {
        // 执行 SQL，并类型化结果为 RowDataPacket 数组
        // pool.execute 返回 [结果数组, 字段信息]，我们只取结果数组
        const [result] = await pool.execute<RowDataPacket[]>("SELECT * FROM users");

        ctx.body = {
            code: 200,
            message: "查询用户列表成功",
            data: result,
        };
        ctx.status = 200;
    } catch (error) {
        console.error("查询用户列表失败:", error);
        // 使用 ctx.throw 将错误交给全局的 errorHandlerMiddleware 处理
        ctx.throw(500, "查询用户列表失败，请检查数据库连接或SQL");
    }
};

// ------------------------------------
// 2. 路由定义
// ------------------------------------

const userRouter = new Router({ prefix: '/users' });
userRouter.get('/', getUserList); // 完整路径为 /users

// 导出 router 供 server.ts 使用
export default userRouter;

// 注意：原文件导出了 getUserList，如果需要保持兼容性，
// 因为我们使用了 export const，所以它依然是可导出的。