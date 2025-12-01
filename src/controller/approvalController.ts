import { Context } from 'koa';
import pool from '../config/db';
import { RowDataPacket } from 'mysql2/promise';
import { computePathMap, DeptLike } from '../utils/departmentUtils';

// ----------------------------------------------------------------------
// 辅助类型定义 (修复请求体类型问题)
// ----------------------------------------------------------------------

// 声明 Koa Context 的扩展类型，添加 body 属性
// 假设您的 body-parser 中间件已经配置好
interface RequestBody {
    projectName?: string;
    content?: string;
    departmentId?: number;
    executeDate?: Date;
    attachmentIds?: number[];
    comment?: string;
    role: string;
    // 添加其他可能在请求体中出现的字段
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
        approvalTimeStart, approvalTimeEnd // 新增审批时间筛选
    } = ctx.query;
    const { userId, role } = getAuthUser(ctx);
    console.log('---------role:-----------', role);

    let whereClauses: string[] = ['af.is_deleted = FALSE'];
    let queryParams: (string | number | Date)[] = [];

    // 1. 角色筛选逻辑 (确定查看范围)
    if (role === 'APPLICANT') {
        // 申请人只查看自己提交的
        // whereClauses.push('af.applicant_id = ?');
        // queryParams.push(userId);
    } else if (role === 'APPROVER') {
        console.log('-------APPROVER role detected-------');
        // 审批员只查看待自己审批的 (状态 0)
        // whereClauses.push('af.current_approver_id = ?');
        whereClauses.push("af.status = '0'"); // 明确查看待审批状态
        // queryParams.push(userId);
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
        // 注入 department_path 字段，便于前端直接使用
        const listWithPaths = (listResult as any[]).map(item => ({
            ...item,
            // 确保 key 为 number
            department_path: item.department_id ? deptPathMap.get(Number(item.department_id)) || '' : '',
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

        ctx.body = {
            code: 200,
            message: '查询详情成功',
            data: {
                ...approvalForm,
                logs: logResult,
                attachments: attachmentResult,
            },
        };

    } catch (error: any) { // 修复 ts(18046) 错误
        console.error(`查询审批单 ${id} 详情失败:`, error);
        ctx.throw(500, '查询审批单详情失败', { details: error.message });
    }
};

// ----------------------------------------------------------------------
// 3. 新建审批单接口 (POST /approvals)
// ----------------------------------------------------------------------
export const createApproval = async (ctx: CustomContext) => {
    // departmentId 现在是 BIGINT，需要确保前端传的是 ID
    const { projectName, content, departmentId, executeDate, attachmentIds } = ctx.request.body || {};
    const { userId } = getAuthUser(ctx);
    console.log('-------ctx.body-------', ctx.request.body);

    if (!projectName || !content || !departmentId || !executeDate) {
        ctx.throw(400, '缺少必要的表单字段');
    }

    // ⚠️ 业务逻辑：根据 departmentId 确定第一审批人ID (简化为硬编码 102)
    const nextApproverId = 102;

    try {
        // 1. 插入主表，使用 department_id 字段
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

        // 3. 关联附件 (如果附件ID已存在)
        if (attachmentIds && attachmentIds.length > 0) {
            // 确保附件 ID 属于当前用户上传，并将其关联到新的 form_id
            const updateAttachmentsSql = `UPDATE approval_attachments SET form_id = ? WHERE id IN (?) AND uploader_id = ? AND form_id IS NULL`;
            await pool.execute(updateAttachmentsSql, [newFormId, attachmentIds, userId]);
        }

        ctx.body = {
            code: 200,
            message: '审批单创建成功',
            data: { id: newFormId },
        };
        ctx.status = 201; // Created

    } catch (error: any) { // 修复 ts(18046) 错误
        console.error('创建审批单失败:', error);
        ctx.throw(500, '审批单创建失败', { details: error.message });
    }
};

// ----------------------------------------------------------------------
// 4. 修改审批单接口 (PUT /approvals/:id)
// ----------------------------------------------------------------------
export const updateApproval = async (ctx: CustomContext) => {
    const { id } = ctx.params;
    const { userId } = getAuthUser(ctx);
    const { projectName, content, executeDate, departmentId } = ctx.request.body || {};

    try {
        // 1. 检查权限和状态
        const [checkResult] = await pool.execute<RowDataPacket[]>(
            `SELECT status, applicant_id FROM approval_forms WHERE id = ?`, [id]
        );

        // 只有申请人可以修改，且状态必须是 '0' (待审批) 或 '2' (已拒绝/需重提)
        const allowedStatuses: ApprovalStatus[] = ['0', '2'];
        if (checkResult.length === 0 || checkResult[0].applicant_id !== userId || !allowedStatuses.includes(checkResult[0].status as ApprovalStatus)) {
            ctx.throw(403, '无权修改或审批单已在流程中/已通过');
        }

        // 2. 更新主表，使用 department_id 字段
        await pool.execute(
            `UPDATE approval_forms SET project_name = ?, content = ?, department_id = ?, execute_date = ? 
             WHERE id = ?`,
            [projectName, content, departmentId, executeDate, id]
        );

        // 3. 插入日志
        await pool.execute(
            `INSERT INTO approval_logs (form_id, operator_id, action, comment) 
             VALUES (?, ?, 'UPDATE', '审批单数据修改')`,
            [id, userId]
        );

        ctx.body = { code: 200, message: '审批单修改成功', data: { id } };
    } catch (error: any) { // 修复 ts(18046) 错误
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

        // 2. 标记为已删除 (is_deleted = TRUE)
        await pool.execute(
            `UPDATE approval_forms SET is_deleted = TRUE
             WHERE id = ?`,
            [id]
        );

        // 3. 插入日志（记录删除操作）
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

    // 只需要角色判断（不需要核对 current_approver_id）
    if (role !== 'APPROVER') {
        console.log('role-------', role);
        ctx.throw(403, '只有审批员可以执行通过操作');
    }
    try {

        // 更新状态为 '已通过' ('1')
        await pool.execute(
            `UPDATE approval_forms SET status = '1', approval_at = NOW(), current_approver_id = NULL
             WHERE id = ?`,
            [id]
        );

        // 3. 插入日志
        // 插入日志：记录操作人 operator_id
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

    // 仅基于角色做判断，不再依赖 current_approver_id
    console.log('role-------', role);
    if (role !== 'APPROVER') {
        ctx.throw(403, '只有审批员可以执行驳回操作');
    }
    // if (!comment) {
    //     ctx.throw(400, '驳回审批必须提供理由(comment)');
    // }

    try {

        // if (checkResult.length === 0 || checkResult[0].status !== '0') {
        //     ctx.throw(403, '审批单已处理或不存在');
        // }

        // 2. 更新状态为 '已拒绝' ('2')
        await pool.execute(
            `UPDATE approval_forms SET status = '2', approval_at = NOW(), current_approver_id = NULL 
             WHERE id = ?`,
            [id]
        );

        // 3. 插入日志
        // 插入日志：记录操作人 operator_id
        await pool.execute(
            `INSERT INTO approval_logs (form_id, operator_id, action, comment) 
             VALUES (?, ?, 'REJECT', ?)`,
            [id, userId, comment]
        );

        ctx.body = { code: 200, message: '审批已驳回', data: { id } };
    } catch (error: any) { // 修复 ts(18046) 错误
        console.error(`驳回审批 ${id} 失败:`, error);
        ctx.throw(error.status || 500, error.message || '审批驳回操作失败', { details: error.message });
    }
};