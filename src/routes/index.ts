import Router from '@koa/router';

// --- 导入模块路由 ---
// 1. 用户模块路由 (已创建 userController.ts，现在将其当作路由)
import userRouter from '../controller/userController';

// // 2. 审批单模块路由 (下一步将要创建)
import approvalRouter from './approvalRoutes';

// // 3. 部门配置模块路由 (用于级联选择器和任务3的Schema配置)
// import departmentRouter from './departmentRoutes';

// // 4. 表单配置模块路由 (用于任务3的动态表单 Schema)
// import formRouter from './formRoutes';

// 创建一个主路由器，所有接口都将挂载到这个路由器上
const apiRouter = new Router({ prefix: '/api' });

/**
 * 注册所有模块的路由
 */

// 用户接口 (例如：GET /api/users)
// 注意：userRouter 在其 Controller 文件中已经定义了 /api 前缀，如果它只定义了 /users，
// 这里应该使用 apiRouter.use('/', userRouter.routes());
// 我们以 userController.ts 中已定义的 /api 前缀为准，直接使用路由。
apiRouter.use(userRouter.routes());
apiRouter.use(userRouter.allowedMethods());

// 审批单接口 (例如：GET /api/approvals)
apiRouter.use(approvalRouter.routes());
apiRouter.use(approvalRouter.allowedMethods());

// 部门接口 (例如：GET /api/departments)
// apiRouter.use(departmentRouter.routes());
// apiRouter.use(departmentRouter.allowedMethods());

// 表单配置接口 (例如：GET /api/form/schema)
// 部门接口 (例如：GET /api/departments)
import departmentRouter from './departmentRoutes';
import attachmentRouter from './attachmentRoutes';
apiRouter.use(departmentRouter.routes());
apiRouter.use(departmentRouter.allowedMethods());

// 附件上传路由
apiRouter.use(attachmentRouter.routes());
apiRouter.use(attachmentRouter.allowedMethods());

// apiRouter.use(formRouter.routes());
// apiRouter.use(formRouter.allowedMethods());


export default apiRouter;