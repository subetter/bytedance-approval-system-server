import { Context } from 'koa';
import path from 'path';
import fs from 'fs/promises';
import pool from '../config/db';
import { RowDataPacket } from 'mysql2/promise';

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

export const deleteAttachment = async (ctx: Context) => {
    const { formId, fileUrl } = (ctx.request.body || {}) as any;

    if (!fileUrl) {
        ctx.throw(400, '缺少 fileUrl 参数');
    }

    try {
        // 1. 查询文件记录是否存在
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT * FROM approval_attachments WHERE file_url = ?`,
            [fileUrl]
        );

        if (rows.length === 0) {
            ctx.throw(404, '附件记录不存在');
        }

        const attachment = rows[0];

        // 可选：如果传了 formId，校验是否匹配
        if (formId && attachment.form_id && String(attachment.form_id) !== String(formId)) {
            ctx.throw(400, '附件不属于该审批单');
        }

        // 2. 删除物理文件
        const absolutePath = path.join(process.cwd(), 'public', fileUrl);

        try {
            await fs.unlink(absolutePath);
            console.log('物理文件删除成功:', absolutePath);
        } catch (err: any) {
            console.error('物理文件删除失败 (可能文件已不存在):', err.message);
        }

        // 3. 删除数据库记录
        await pool.execute(
            `DELETE FROM approval_attachments WHERE id = ?`,
            [attachment.id]
        );

        ctx.body = {
            code: 200,
            message: '附件删除成功'
        };

    } catch (error: any) {
        console.error('删除附件失败:', error);
        ctx.throw(error.status || 500, error.message || '删除附件失败');
    }
};

export default {
    uploadAttachment,
    deleteAttachment
};
