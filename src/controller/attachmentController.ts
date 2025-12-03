import { Context } from 'koa';
import pool from '../config/db';
import { RowDataPacket } from 'mysql2/promise';
import path from 'path';

// 兼容已有的 getAuthUser 实现
const getAuthUser = (ctx: Context): { userId: number } => {
    const userId = parseInt((ctx.query.userId as string) || '101');
    return { userId };
};

export const uploadAttachment = async (ctx: Context) => {
    // koa-body 将文件放在 ctx.request.files
    const files = ctx.request.files;
    const body = ctx.request.body || {};

    if (!files || !files.file) {
        ctx.throw(400, '没有上传文件');
    }

    // 支持多文件或单文件，这里取第一个
    const file: any = Array.isArray(files.file) ? files.file[0] : files.file;

    // 获取 formId
    const formId = (body as any).formId || (body as any).form_id;

    // 获取文件路径 (兼容不同版本的 formidable/koa-body)
    const filepath = file.filepath || file.path;
    if (!filepath) {
        ctx.throw(500, '文件路径获取失败');
    }

    // 构建访问 URL
    // 文件已由全局中间件保存到 public/upload
    const basename = path.basename(filepath);
    const fileUrl = `/upload/${basename}`;

    // 获取当前用户
    const { userId } = getAuthUser(ctx);

    // 推断文件类型
    const originalName = file.originalFilename || file.name || 'unknown';
    const lower = originalName.toLowerCase();
    let fileType: 'IMAGE' | 'EXCEL' | 'OTHER' = 'OTHER';
    if (/\.(jpg|jpeg|png|gif|bmp|webp)$/.test(lower)) fileType = 'IMAGE';
    if (/\.(xls|xlsx)$/.test(lower)) fileType = 'EXCEL';

    try {
        // 写入数据库
        const [result] = await pool.execute<RowDataPacket[]>(
            `INSERT INTO approval_attachments (form_id, file_name, file_url, file_type, uploader_id) VALUES (?, ?, ?, ?, ?)`,
            [formId || null, originalName, fileUrl, fileType, userId]
        );

        ctx.body = {
            code: 200,
            message: '上传成功',
            data: {
                id: (result as any).insertId,
                fileUrl: fileUrl,
                originalName: originalName
            }
        };
    } catch (error: any) {
        console.error('保存附件记录失败:', error);
        ctx.throw(500, '保存附件记录失败', { details: error.message });
    }
};

export default {
    uploadAttachment,
};
