import Router from '@koa/router';
import { uploadAttachment } from '../controller/attachmentController';

const attachmentRouter = new Router({ prefix: '/attachments' });

// 单文件上传：POST /api/attachments/upload
attachmentRouter.post('/upload', uploadAttachment);

export default attachmentRouter;
