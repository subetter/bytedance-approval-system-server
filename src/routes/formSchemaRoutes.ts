import Router from '@koa/router';
import * as formSchemaController from '../controller/formSchemaController';

const formRouter = new Router({ prefix: '/form' });

/**
 * @route GET /api/form/schema?key=basic_approval
 * @description 根据 key 获取动态表单配置 Schema
 */
formRouter.get('/schema', formSchemaController.getFormSchema);

export default formRouter;