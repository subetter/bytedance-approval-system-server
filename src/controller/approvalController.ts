import { Context } from 'koa';
import pool from '../config/db';
import { RowDataPacket } from 'mysql2/promise';
import { computePathMap, DeptLike } from '../utils/departmentUtils';
import fs from 'fs/promises';
import path from 'path';



// ----------------------------------------------------------------------
// 辅助类型定义 (修复请求体类型问题)
// ----------------------------------------------------------------------

// 声明 Koa Context 的扩展类型，添加 body 属性
interface RequestBody {
    projectName?: string;
    content?: string;
    departmentId?: number;
    executeDate?: Date;
    attachmentIds?: number[];
    comment?: string;
    role: string;
    // 添加其他可能在请求体中出现的字段
    [key: string]: any;
}

interface CustomContext extends Context {
    request: Context['request'] & {
        body?: RequestBody; // 假设请求体是 RequestBody 类型
    };
}

// 简化后的用户角色枚举
type UserRole = 'APPLICANT' | 'APPROVER';
// 审批单状态: '0':待审批, '1':通过, '2':拒绝, '3':已撤回
type ApprovalStatus = '0' | '1' | '2' | '3';

/**
 * @description 模拟从认证上下文获取用户信息。
 * ⚠️ 实际项目中，此逻辑应由 JWT 或 Session 认证中间件完成。
 */
const getAuthUser = (ctx: CustomContext): { userId: number, role: UserRole } => {
    // 默认使用用户 ID 101 (张三, 申请人)
    const userId = parseInt((ctx.query.userId as string) || '101');
    // 优先从 query 获取 role，再从 body 获取，最后默认 APPLICANT
    const parseRole = (r?: string | UserRole): UserRole | undefined => {
        if (r === 'APPLICANT' || r === 'APPROVER') return r;
        return undefined;
    };

    const roleFromQuery = parseRole(ctx.query.role as unknown as string);
    const roleFromBody = parseRole(ctx.request?.body?.role as unknown as string);
    const role = roleFromQuery || roleFromBody || 'APPLICANT';
    return { userId, role };
};

// ----------------------------------------------------------------------
// 1. 查询审批单列表接口 (GET /approvals)
// ----------------------------------------------------------------------
export const listApprovals = async (ctx: CustomContext) => {
    // 获取查询参数
    const {
        page = 1, pageSize = 10, status, projectName,
        departmentId, createTimeStart, createTimeEnd,
        approvalTimeStart, approvalTimeEnd, executeDateStart, executeDateEnd // 新增审批时间筛选
    } = ctx.query;
    const { userId, role } = getAuthUser(ctx);
    console.log('---------role:-----------', role);

    let whereClauses: string[] = ['af.is_deleted = FALSE'];
    let queryParams: (string | number | Date)[] = [];

    // 1. 角色筛选逻辑 (确定查看范围)
    if (role === 'APPLICANT') {
        // 申请人只查看自己提交的
        whereClauses.push('af.applicant_id = ?');
        queryParams.push(userId);
    } else if (role === 'APPROVER') {
        console.log('-------APPROVER role detected-------');
        // 审批员只查看待自己审批的 (状态 0)
        whereClauses.push("af.status = '0'"); // 明确查看待审批状态
    }
    // ADMIN 角色会跳过以上筛选，查询所有

    // 2. 筛选条件拼接 (所有条件都必须是可选的)

    // 2.1 审批状态
    if (status) { // 只有当 status 参数存在时才添加筛选
        console.log('-------status-------', status);
        whereClauses.push('af.status = ?');
        queryParams.push(status as string);
    }

    // 2.2 审批项目名称 (模糊查询)
    if (projectName) { // 只有当 projectName 参数存在时才添加筛选
        console.log('-------projectName-------', projectName);
        whereClauses.push('af.project_name LIKE ?');
        queryParams.push(`%${projectName}%`);
    }

    // 2.3 申请部门 ID (精确匹配)
    if (departmentId) { // 只有当 departmentId 参数存在时才添加筛选
        console.log('-------departmentId-------', departmentId);
        whereClauses.push('af.department_id = ?');
        queryParams.push(departmentId as string);
    }

    // 2.4 创建时间范围
    if (createTimeStart) { // 只有当 createTimeStart 参数存在时才添加筛选
        console.log('-------createTimeStart-------', createTimeStart);
        whereClauses.push('af.created_at >= ?');
        queryParams.push(createTimeStart as string);
    }
    if (createTimeEnd) { // 只有当 createTimeEnd 参数存在时才添加筛选
        console.log('-------createTimeEnd-------', createTimeEnd);
        whereClauses.push('af.created_at <= ?');
        queryParams.push(createTimeEnd as string);
    }

    // 2.5 审批时间范围
    if (approvalTimeStart) { // 只有当 approvalTimeStart 参数存在时才添加筛选
        console.log('-------approvalTimeStart-------', approvalTimeStart);
        whereClauses.push('af.approval_at >= ?');
        queryParams.push(approvalTimeStart as string);
    }
    if (approvalTimeEnd) { // 只有当 approvalTimeEnd 参数存在时才添加筛选
        console.log('-------approvalTimeEnd-------', approvalTimeEnd);
        whereClauses.push('af.approval_at <= ?');
        queryParams.push(approvalTimeEnd as string);
    }

    // 执行时间范围
    if (executeDateStart) { // 只有当 executeTimeStart 参数存在时才添加筛选
        console.log('-------executeDateStart-------', executeDateStart);
        whereClauses.push('af.execute_date >= ?');
        queryParams.push(executeDateStart as string);
    }
    if (executeDateEnd) { // 只有当 executeTimeEnd 参数存在时才添加筛选
        console.log('-------executeDateEnd-------', executeDateEnd);
        whereClauses.push('af.execute_date <= ?');
        queryParams.push(executeDateEnd as string);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    console.log('-------whereSql-------', whereSql);
    console.log('-------queryParams-------', queryParams);
    // 3. 分页参数
    const limit = parseInt(pageSize as string);
    const offset = (parseInt(page as string) - 1) * limit;

    try {
        // 读取部门数据并构建 id->path 的映射（共享工具）
        const [deptRows] = await pool.execute<RowDataPacket[]>(`SELECT id, parent_id, name FROM departments`);
        const deptPathMap = computePathMap(deptRows as any as DeptLike[]);
        // --- 统计总数 ---
        // SQL: SELECT COUNT(af.id) AS total FROM approval_forms af [WHERE ...]
        const [totalResult] = await pool.execute<RowDataPacket[]>(
            `SELECT COUNT(af.id) AS total FROM approval_forms af ${whereSql}`,
            queryParams // 注意：这里只使用 WHERE 子句的参数
        );
        const total = totalResult[0].total;
        console.log('-------total-------', total);
        // --- 查询列表数据 ---
        // 核心修复：直接嵌入 LIMIT 和 OFFSET，不再使用占位符，以避免 mysqld_stmt_execute 错误
        const listSql = `
             SELECT 
             af.department_id,
                af.id, af.project_name, af.status, af.content,af.execute_date, af.created_at, af.approval_at,
                u.display_name AS applicant_name, 
                d.name AS department_name, -- 联表获取部门名称
                appr.display_name AS current_approver_name -- 联表获取当前审批人名称
             FROM approval_forms af
             JOIN users u ON af.applicant_id = u.id
             JOIN departments d ON af.department_id = d.id -- 关联 departments 表
             LEFT JOIN users appr ON af.current_approver_id = appr.id -- 联表当前审批人
             ${whereSql}
             ORDER BY af.created_at DESC
             LIMIT ${limit} OFFSET ${offset}`; // <<< FIX: 直接嵌入变量

        // 传递所有 WHERE 参数，不包含分页参数
        const finalQueryParams = queryParams;
        console.log('-------finalQueryParams-------', finalQueryParams);

        const [listResult] = await pool.execute<RowDataPacket[]>(listSql, finalQueryParams);
        // --- 批量查询附件 ---
        const approvalIds = (listResult as any[]).map(item => item.id);
        let attachmentsMap: Record<number, any[]> = {};

        if (approvalIds.length > 0) {
            const placeholders = approvalIds.map(() => '?').join(',');
            const [allAttachments] = await pool.execute<RowDataPacket[]>(
                `SELECT * FROM approval_attachments WHERE form_id IN (${placeholders})`,
                approvalIds
            );

            (allAttachments as any[]).forEach(att => {
                if (!attachmentsMap[att.form_id]) {
                    attachmentsMap[att.form_id] = [];
                }
                if (att.file_type !== 'IMAGE') {
                    const { file_url, ...rest } = att;
                    attachmentsMap[att.form_id].push(rest);
                } else {
                    attachmentsMap[att.form_id].push(att);
                }
            });
        }

        // 注入 department_path 和 attachments 字段
        const listWithPaths = (listResult as any[]).map(item => ({
            ...item,
            // 确保 key 为 number
            department_path: item.department_id ? deptPathMap.get(Number(item.department_id)) || '' : '',
            attachments: attachmentsMap[item.id] || [],
        }));

        ctx.body = {
            code: 200,
            message: '查询成功',
            data: {
                list: listWithPaths,
                total: total,
                page: parseInt(page as string),
                pageSize: limit,
            },
        };
        ctx.status = 200;
    } catch (error: any) {
        console.error('查询审批单列表失败:', error);
        ctx.throw(500, '查询审批单列表失败', { details: error.message });
    }
};

// ----------------------------------------------------------------------
// 2. 查询审批单详情接口 (GET /approvals/:id)
// ----------------------------------------------------------------------
export const getApprovalDetail = async (ctx: CustomContext) => {
    const { id } = ctx.params;

    try {
        // 1. 查询主表 (联表查询申请人、部门和当前审批人)
        const [formResult] = await pool.execute<RowDataPacket[]>(
            `SELECT 
                af.*,
                u.display_name AS applicant_name,
                d.name AS department_name, -- 联表获取部门名称
                appr.display_name AS current_approver_name
             FROM approval_forms af
             JOIN users u ON af.applicant_id = u.id
             JOIN departments d ON af.department_id = d.id -- 关联 departments 表
             LEFT JOIN users appr ON af.current_approver_id = appr.id
             WHERE af.id = ? AND af.is_deleted = FALSE`,
            [id]
        );

        if (formResult.length === 0) {
            ctx.throw(404, `审批单 ID: ${id} 不存在`);
        }

        const approvalForm = formResult[0];
        // 注入部门 path（通过 utils）
        const [deptRows] = await pool.execute<RowDataPacket[]>(`SELECT id, parent_id, name FROM departments`);
        const deptPathMap = computePathMap(deptRows as any as DeptLike[]);
        (approvalForm as any).department_path = approvalForm.department_id ? deptPathMap.get(approvalForm.department_id) || '' : '';

        // 2. 查询流转记录 (Log)
        const [logResult] = await pool.execute<RowDataPacket[]>(
            `SELECT al.*, u.display_name AS operator_name 
             FROM approval_logs al
             JOIN users u ON al.operator_id = u.id
             WHERE al.form_id = ?
             ORDER BY al.action_time ASC`,
            [id]
        );

        // 3. 查询附件 (Attachment)
        const [attachmentResult] = await pool.execute<RowDataPacket[]>(
            `SELECT * FROM approval_attachments WHERE form_id = ?`,
            [id]
        );

        // 处理附件：只有 file_type 为 IMAGE 时才返回 file_url
        const attachments = (attachmentResult as any[]).map(att => {
            if (att.file_type === 'IMAGE') {
                return att;
            } else {
                const { file_url, ...rest } = att;
                return rest;
            }
        });

        ctx.body = {
            code: 200,
            message: '查询详情成功',
            data: {
                ...approvalForm,
                attachments
            }
        };
    } catch (error: any) {
        console.error('查询审批单详情失败:', error);
        ctx.throw(500, '查询审批单详情失败', { details: error.message });
    }
};

// ----------------------------------------------------------------------
// 3. 创建审批单接口 (POST /approvals)
// ----------------------------------------------------------------------
export const createApproval = async (ctx: CustomContext) => {
    const { projectName, content, departmentId, executeDate, attachmentIds } = ctx.request.body || {};
    const { userId } = getAuthUser(ctx);

    if (!projectName || !content || !departmentId || !executeDate) {
        ctx.throw(400, '缺少必要的表单字段');
    }

    // ⚠️ 业务逻辑：根据 departmentId 确定第一审批人ID (简化为硬编码 102)
    const nextApproverId = 102;

    try {
        // 1. 插入主表
        const [insertResult] = await pool.execute(
            `INSERT INTO approval_forms 
             (project_name, content, department_id, execute_date, applicant_id, current_approver_id, status)
             VALUES (?, ?, ?, ?, ?, ?, '0')`,
            [projectName, content, departmentId, executeDate, userId, nextApproverId]
        );
        const newFormId = (insertResult as any).insertId;

        // 2. 插入日志
        await pool.execute(
            `INSERT INTO approval_logs (form_id, operator_id, action, comment) 
             VALUES (?, ?, 'CREATE', '审批单创建成功')`,
            [newFormId, userId]
        );

        // 3. 关联附件
        if (attachmentIds && attachmentIds.length > 0) {
            const placeholders = attachmentIds.map(() => '?').join(',');
            const updateAttachmentsSql = `UPDATE approval_attachments SET form_id = ? WHERE id IN (${placeholders}) AND uploader_id = ? AND form_id IS NULL`;
            await pool.execute(updateAttachmentsSql, [newFormId, ...attachmentIds, userId]);
        }

        ctx.body = {
            code: 200,
            message: '审批单创建成功',
            data: { id: newFormId },
        };
        ctx.status = 201;

    } catch (error: any) {
        console.error('创建审批单失败:', error);
        ctx.throw(500, '审批单创建失败', { details: error.message });
    }
};

// ----------------------------------------------------------------------
// 3.1 批量新建审批单接口 (POST /approvals/batch)
// ----------------------------------------------------------------------
export const batchCreateApprovals = async (ctx: CustomContext) => {
    const body = ctx.request.body || {};
    console.log('===批量新建审批单接口====');
    console.log('===body====', body);
    const items: any[] = Array.isArray(body) ? body : [];

    const { userId } = getAuthUser(ctx);

    if (!items || items.length === 0) {
        ctx.throw(400, '批量创建列表为空');
    }

    const results = {
        success: 0,
        failed: 0,
        errors: [] as any[]
    };
    console.log('===items====', items);
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        console.log('====items====', item);
        const projectName = item.projectName || item['审批项目'];
        const content = item.content || item['审批内容'];
        const departmentId = item.departmentId || item['申请部门'];
        const executeDate = item.executeDate || item['执行日期'];

        if (!projectName || !content || !departmentId || !executeDate) {
            results.failed++;
            results.errors.push({ index: i, message: '缺少必要字段' });
            continue;
        }

        try {
            const [insertResult] = await pool.execute(
                `INSERT INTO approval_forms 
                 (project_name, content, department_id, execute_date, applicant_id, status)
                 VALUES (?, ?, ?, ?, ?, '0')`,
                [projectName, content, departmentId, executeDate, userId]
            );
            const newFormId = (insertResult as any).insertId;

            await pool.execute(
                `INSERT INTO approval_logs (form_id, operator_id, action, comment) 
                 VALUES (?, ?, 'CREATE', '批量导入创建')`,
                [newFormId, userId]
            );
            results.success++;
        } catch (err: any) {
            results.failed++;
            console.log('===err====', err);
            results.errors.push({ index: i, message: err.message });
        }
    }

    ctx.body = {
        code: 200,
        message: `批量处理完成: 成功 ${results.success} 条, 失败 ${results.failed} 条`,
        data: results
    };
};

// ----------------------------------------------------------------------
// 4. 修改审批单接口 (PUT /approvals/:id)
// ----------------------------------------------------------------------
export const updateApproval = async (ctx: CustomContext) => {
    const { id } = ctx.params;
    const { userId } = getAuthUser(ctx);
    const { projectName, content, executeDate, departmentId, attachmentIds } = ctx.request.body || {};

    try {
        const [checkResult] = await pool.execute<RowDataPacket[]>(
            `SELECT status, applicant_id FROM approval_forms WHERE id = ?`, [id]
        );

        const allowedStatuses: ApprovalStatus[] = ['0', '2'];
        if (checkResult.length === 0 || checkResult[0].applicant_id !== userId || !allowedStatuses.includes(checkResult[0].status as ApprovalStatus)) {
            ctx.throw(403, '无权修改或审批单已在流程中/已通过');
        }

        await pool.execute(
            `UPDATE approval_forms SET project_name = ?, content = ?, department_id = ?, execute_date = ? 
             WHERE id = ?`,
            [projectName, content, departmentId, executeDate, id]
        );

        await pool.execute(
            `INSERT INTO approval_logs (form_id, operator_id, action, comment) 
             VALUES (?, ?, 'UPDATE', '审批单数据修改')`,
            [id, userId]
        );

        // --- 处理附件同步逻辑 ---
        if (attachmentIds) {
            // 1. 查询当前数据库中该审批单的所有附件
            const [currentAttachments] = await pool.execute<RowDataPacket[]>(
                `SELECT id, file_url FROM approval_attachments WHERE form_id = ?`,
                [id]
            );

            // 2. 找出需要删除的附件 (在数据库中存在，但不在前端提交的 attachmentIds 列表中)
            // 注意：前端提交的 attachmentIds 应该是最终保留的附件 ID 列表
            const keepIds = new Set(attachmentIds.map((aid: any) => Number(aid)));
            const toDelete = (currentAttachments as any[]).filter(att => !keepIds.has(att.id));

            if (toDelete.length > 0) {
                console.log(`更新审批单 ${id}: 需要删除 ${toDelete.length} 个旧附件`);

                // 3. 删除物理文件
                for (const att of toDelete) {
                    if (att.file_url) {
                        const absolutePath = path.join(process.cwd(), 'public', att.file_url);
                        try {
                            await fs.unlink(absolutePath);
                            console.log('物理文件删除成功:', absolutePath);
                        } catch (err: any) {
                            console.error('物理文件删除失败:', err.message);
                        }
                    }
                }

                // 4. 删除数据库记录
                const deleteIds = toDelete.map(att => att.id);
                const placeholders = deleteIds.map(() => '?').join(',');
                await pool.execute(
                    `DELETE FROM approval_attachments WHERE id IN (${placeholders})`,
                    deleteIds
                );
            }

            // 5. 确保保留的附件都正确关联了 form_id
            if (attachmentIds.length > 0) {
                const placeholders = attachmentIds.map(() => '?').join(',');
                await pool.execute(
                    `UPDATE approval_attachments SET form_id = ? WHERE id IN (${placeholders})`,
                    [id, ...attachmentIds]
                );
            }
        }

        ctx.body = { code: 200, message: '审批单修改成功', data: { id } };
    } catch (error: any) {
        console.error(`修改审批单 ${id} 失败:`, error);
        ctx.throw(error.status || 500, error.message || '审批单修改失败', { details: error.message });
    }
};

// ----------------------------------------------------------------------
// 5. 撤回审批单接口 (POST /approvals/:id/withdraw)
// ----------------------------------------------------------------------
export const withdrawApproval = async (ctx: CustomContext) => {
    const { id } = ctx.params;
    const { userId } = getAuthUser(ctx);

    try {
        await pool.execute(
            `UPDATE approval_forms SET is_deleted = TRUE WHERE id = ?`,
            [id]
        );

        await pool.execute(
            `INSERT INTO approval_logs (form_id, operator_id, action, comment) 
             VALUES (?, ?, 'WITHDRAW', '申请人撤回审批单')`,
            [id, userId]
        );

        ctx.body = { code: 200, message: '审批单撤回成功', data: { id } };
    } catch (error: any) {
        console.error(`撤回审批单 ${id} 失败:`, error);
        ctx.throw(error.status || 500, error.message || '审批单撤回失败', { details: error.message });
    }
};

// ----------------------------------------------------------------------
// 6. 通过审批接口 (POST /approvals/:id/approve)
// ----------------------------------------------------------------------
export const approveApproval = async (ctx: CustomContext) => {
    const { id } = ctx.params;
    const { userId, role } = getAuthUser(ctx);
    const { comment = '同意通过' } = ctx.request.body || {};

    if (role !== 'APPROVER') {
        ctx.throw(403, '只有审批员可以执行通过操作');
    }
    try {
        await pool.execute(
            `UPDATE approval_forms SET status = '1', approval_at = NOW(), current_approver_id = NULL
             WHERE id = ?`,
            [id]
        );

        await pool.execute(
            `INSERT INTO approval_logs (form_id, operator_id, action, comment) 
             VALUES (?, ?, 'APPROVE', ?)`,
            [id, userId, comment]
        );

        ctx.body = { code: 200, message: '审批已通过', data: { id } };
    } catch (error: any) {
        console.error(`通过审批 ${id} 失败:`, error);
        ctx.throw(error.status || 500, error.message || '审批通过操作失败', { details: error.message });
    }
};

// ----------------------------------------------------------------------
// 7. 驳回审批单接口 (POST /approvals/:id/reject)
// ----------------------------------------------------------------------
export const rejectApproval = async (ctx: CustomContext) => {
    const { id } = ctx.params;
    const { userId, role } = getAuthUser(ctx);
    const { comment = '拒绝' } = ctx.request.body || {};

    if (role !== 'APPROVER') {
        ctx.throw(403, '只有审批员可以执行驳回操作');
    }

    try {
        await pool.execute(
            `UPDATE approval_forms SET status = '2', approval_at = NOW(), current_approver_id = NULL 
             WHERE id = ?`,
            [id]
        );

        await pool.execute(
            `INSERT INTO approval_logs (form_id, operator_id, action, comment) 
             VALUES (?, ?, 'REJECT', ?)`,
            [id, userId, comment]
        );

        ctx.body = { code: 200, message: '审批已驳回', data: { id } };
    } catch (error: any) {
        console.error(`驳回审批 ${id} 失败:`, error);
        ctx.throw(error.status || 500, error.message || '审批驳回操作失败', { details: error.message });
    }
};