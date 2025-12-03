import { Context } from 'koa';
import pool from '../config/db';
import { RowDataPacket } from 'mysql2/promise';

/**
 * @description 获取表单配置 Schema 接口 (任务3)
 * @route GET /api/form/schema?key={schema_key}
 */
export const getFormSchema = async (ctx: Context) => {
    // 默认使用 'basic_approval' 作为 key，如果前端不传
    const key = (ctx.query.key as string) || 'basic_approval';
    console.log('====key:======= ', key);
    try {
        const [result] = await pool.execute<RowDataPacket[]>(
            `SELECT schema_content FROM form_schemas WHERE schema_key = ? AND is_active = TRUE`,
            [key]
        );

        if (result.length === 0) {
            ctx.throw(404, `未找到配置 Key: ${key} 对应的表单 Schema`);
        }

        // schema_content 是 JSON/TEXT 字段，返回给前端
        // 如果数据库返回的是字符串，确保前端能解析，但通常 mysql2 会自动解析 JSON 字段
        const schema = result[0].schema_content;

        ctx.body = {
            code: 200,
            msg: 'success',
            data: schema,
        };
        ctx.status = 200;

    } catch (error: any) {
        console.error('获取表单 Schema 失败:', error);
        ctx.throw(error.status || 500, '获取表单配置失败', { details: error.message });
    }
};
