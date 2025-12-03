import Router from '@koa/router';
import {
    listApprovals,
    getApprovalDetail,
    createApproval,
    batchCreateApprovals,
    updateApproval,
    withdrawApproval,
    approveApproval,
    rejectApproval
} from '../controller/approvalController';

// 使用 '/approvals' 作为路由前缀
const approvalRouter = new Router({ prefix: '/approvals' });

/**
 * 审批单 CRUD 和查询接口
 */

// 1. 查询审批单列表 (GET /approvals)
approvalRouter.get('/', listApprovals);

// 3.1 批量新建审批单 (POST /approvals/batch)
// 必须在 /:id 之前注册，否则会被识别为 id
approvalRouter.post('/batch', batchCreateApprovals);

// 2. 查询审批单详情 (GET /approvals/:id)
approvalRouter.get('/:id', getApprovalDetail);

// 3. 新建审批单 (POST /approvals)
approvalRouter.post('/', createApproval);

// 4. 修改审批单 (PUT /approvals/:id)
approvalRouter.put('/:id', updateApproval);

/**
 * 审批流程操作接口
 */

// 5. 撤回审批单 (POST /approvals/:id/withdraw)
approvalRouter.post('/:id/withdraw', withdrawApproval);

// 6. 通过审批 (POST /approvals/:id/approve)
approvalRouter.post('/:id/approve', approveApproval);

// 7. 驳回审批单 (POST /approvals/:id/reject)
approvalRouter.post('/:id/reject', rejectApproval);


export default approvalRouter;