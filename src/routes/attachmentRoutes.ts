import Router from '@koa/router';
import { uploadAttachment, deleteAttachment } from '../controller/attachmentController';

const attachmentRouter = new Router({ prefix: '/attachments' });

// 单文件上传：POST /api/attachments/upload
attachmentRouter.post('/upload', uploadAttachment);

// 删除附件：POST /api/attachments/delete
attachmentRouter.post('/delete', deleteAttachment);

export default attachmentRouter;
