
import cron from 'node-cron';
import pool from '../config/db';
import fs from 'fs/promises';
import path from 'path';
import { RowDataPacket } from 'mysql2';

/**
 * 初始化附件清理定时任务
 * 每天凌晨 3:00 执行
 */
export const initAttachmentCleanupTask = () => {
    console.log('初始化附件清理定时任务...');

    // 每天凌晨 3:00 执行 ('0 3 * * *')
    cron.schedule('0 3 * * *', async () => {
        console.log('开始执行附件清理任务...');
        try {
            // 1. 查找满足条件的记录: form_id IS NULL AND uploaded_at < 一个月
            const [rows] = await pool.execute<RowDataPacket[]>(
                `SELECT id, file_url FROM approval_attachments 
                 WHERE form_id IS NULL 
                 AND uploaded_at < DATE_SUB(NOW(), INTERVAL 1 MONTH)`
            );

            if (rows.length === 0) {
                console.log('没有需要清理的附件');
                return;
            }

            console.log(`发现 ${rows.length} 个过期未关联附件，开始清理...`);

            const idsToDelete: number[] = [];

            // 2. 遍历删除物理文件
            for (const row of rows) {
                const fileUrl = row.file_url;
                if (!fileUrl) continue;

                // 假设 fileUrl 是 /upload/xxx.png，需要转为绝对路径
                // 注意：这里假设 fileUrl 是以 /upload 开头的相对路径
                const absolutePath = path.join(process.cwd(), 'public', fileUrl);

                try {
                    await fs.unlink(absolutePath);
                    console.log(`物理文件删除成功: ${absolutePath}`);
                } catch (err: any) {
                    // 如果文件不存在，也视为成功，继续删除数据库记录
                    if (err.code !== 'ENOENT') {
                        console.error(`物理文件删除失败: ${absolutePath}`, err.message);
                        // 如果物理删除失败且不是因为文件不存在，可能需要保留数据库记录以便排查？
                        // 这里策略是：如果删除失败，暂时不从数据库删除，以免数据不一致（或者也可以强制删除）
                        // 简单起见，如果出错就不加入 idsToDelete
                        continue;
                    } else {
                        console.log(`物理文件不存在，跳过: ${absolutePath}`);
                    }
                }
                idsToDelete.push(row.id);
            }

            // 3. 批量删除数据库记录
            if (idsToDelete.length > 0) {
                const placeholders = idsToDelete.map(() => '?').join(',');
                await pool.execute(
                    `DELETE FROM approval_attachments WHERE id IN (${placeholders})`,
                    idsToDelete
                );
                console.log(`成功清理 ${idsToDelete.length} 条数据库记录`);
            }

        } catch (error) {
            console.error('附件清理任务执行失败:', error);
        }
    });
};
