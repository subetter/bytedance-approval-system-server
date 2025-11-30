import Router from '@koa/router';
import { getDepartments, getDepartmentById } from '../controller/departmentController';

// route: /departments
const router = new Router({ prefix: '/departments' });

//路由文件只负责路由配置，具体逻辑在 controller

/**
 * GET /departments
 * 支持查询参数：
 *  - tree=true (返回树形结构)
 *  - active=true (只返回启用的部门)
 */
router.get('/', getDepartments);

// GET /departments/:id
router.get('/:id', getDepartmentById);

export default router;
