# Approval System Backend (审批系统后端)

本项目是一个基于 Node.js (Koa2) + TypeScript + MySQL 的审批系统后端服务。提供审批单的创建、流转、查询，以及部门管理、附件上传和动态表单配置等功能。

## 1. 项目结构 (Project Structure)

```text
approval-system-backend/
├── dist/                   # 编译后的 JavaScript 代码
├── public/                 # 静态资源目录
│   └── upload/             # 附件上传存储目录
├── src/                    # 源代码目录
│   ├── config/             # 配置目录
│   │   ├── create_table.sql # 数据库初始化 SQL 脚本
│   │   └── db.ts           # 数据库连接池配置 (MySQL2)
│   ├── controller/         # 控制器层 (业务逻辑)
│   │   ├── approvalController.ts   # 审批单相关逻辑
│   │   ├── attachmentController.ts # 附件上传/删除逻辑
│   │   ├── departmentController.ts # 部门管理逻辑
│   │   ├── formSchemaController.ts # 动态表单配置逻辑
│   │   └── userController.ts       # 用户相关逻辑
│   ├── middleware/         # 中间件
│   │   ├── errorHandler.ts # 全局错误处理
│   │   └── logger.ts       # 请求日志记录
│   ├── routes/             # 路由层 (接口定义)
│   │   ├── index.ts            # 路由总入口
│   │   ├── approvalRoutes.ts   # 审批模块路由
│   │   ├── attachmentRoutes.ts # 附件模块路由
│   │   ├── departmentRoutes.ts # 部门模块路由
│   │   └── formSchemaRoutes.ts # 表单配置路由
│   ├── services/           # 后台服务/定时任务
│   │   └── attachmentCleanupService.ts # 附件清理任务
│   ├── types/              # TypeScript 类型定义
│   ├── utils/              # 工具函数
│   │   └── departmentUtils.ts  # 部门路径计算工具
│   └── server.ts           # 应用入口文件 (App Entry)
├── package.json            # 项目依赖配置
├── tsconfig.json           # TypeScript 编译配置
└── Readme.md               # 项目说明文档
```

## 2. 接口设计与流程 (API Design & Flow)

### 2.1 基础架构
- **统一前缀**: `/api`
- **响应格式**: `{ code: number, message: string, data: any }`
- **错误处理**: 全局中间件捕获异常，返回标准错误格式。

### 2.2 审批模块 (Approval Module)
负责审批单的全生命周期管理。

*   **查询列表 (`GET /api/approvals`)**
    *   流程: 接收查询参数 (keyword, status, page, pageSize) -> 组装 SQL WHERE 子句 -> 查询数据库 -> 返回分页结果。
*   **查询详情 (`GET /api/approvals/:id`)**
    *   流程: 根据 ID 查询主表 -> 并行查询关联的附件和审批日志 -> 组装完整详情对象返回。
*   **创建审批单 (`POST /api/approvals`)**
    *   流程: 接收请求体 -> 校验必填项 -> 插入 `approval_forms` 表 -> 如果有附件，更新附件表的 `form_id` -> 插入 `approval_logs` (CREATE操作) -> 返回新单据 ID。
*   **批量创建 (`POST /api/approvals/batch`)**
    *   流程: 接收审批单数组 -> 开启数据库事务 -> 遍历数据 -> 校验部门是否存在 (通过名称查找 ID) -> 依次插入主表和日志表 -> 提交事务 -> 返回成功/失败统计。
*   **修改审批单 (`PUT /api/approvals/:id`)**
    *   流程: 校验单据是否存在及状态 (仅待审批可改) -> 更新主表字段 -> 处理附件变更 (关联新附件) -> 插入日志 (UPDATE操作)。
*   **撤回审批单 (`POST /api/approvals/:id/withdraw`)**
    *   流程: 校验状态 -> 更新状态为 '3' (已撤回) -> 插入日志 (WITHDRAW操作)。
*   **审批通过 (`POST /api/approvals/:id/approve`)**
    *   流程: 校验当前审批人权限 -> 更新状态为 '1' (通过) -> 记录审批时间 -> 插入日志 (APPROVE操作)。
*   **审批驳回 (`POST /api/approvals/:id/reject`)**
    *   流程: 校验权限 -> 更新状态为 '2' (拒绝) -> 插入日志 (REJECT操作)。

### 2.3 附件模块 (Attachment Module)
处理文件上传与清理。

*   **上传附件 (`POST /api/attachments/upload`)**
    *   流程: `koa-body` 解析 Multipart -> 保存文件至 `public/upload` -> 插入数据库记录 (此时 `form_id` 可能为空) -> 返回文件 URL 和 ID。
*   **删除附件 (`POST /api/attachments/delete`)**
    *   流程: 接收 `fileUrl` -> 查询记录 -> 删除物理文件 -> 删除数据库记录。
*   **自动清理 (后台任务)**
    *   流程: `node-cron` 定时触发 -> 查询超过 48 小时且无 `form_id` 的附件 -> 批量删除物理文件和数据库记录。

### 2.4 部门模块 (Department Module)
提供组织架构数据支持。

*   **查询部门树 (`GET /api/departments?tree=true`)**
    *   流程: 查询所有启用部门 -> 使用 `buildTree` 算法将平面数据转换为树形结构 -> 可选格式化为 Cascader 选项格式。
*   **根据名称查询 (`GET /api/departments/byname/:name`)**
    *   流程: 精确匹配部门名称 -> 返回部门详情 (用于 Excel 导入时的校验)。

### 2.5 表单配置模块 (Form Schema Module)
支持前端动态渲染表单。

*   **获取配置 (`GET /api/form/schema`)**
    *   流程: 根据 `key` (如 `basic_approval`) 查询 `form_schemas` 表 -> 返回 JSON Schema 定义。

## 3. 各个文件的作用 (File Descriptions)

### 核心文件
*   **`src/server.ts`**:
    *   程序的启动入口。
    *   初始化 Koa 实例。
    *   注册全局中间件：`errorHandler` (错误处理), `logger` (日志), `koa-body` (请求体解析), `koa-static` (静态资源)。
    *   挂载路由 `apiRouter`。
    *   启动定时任务 `initAttachmentCleanupTask`。
    *   监听端口 (3001)。

*   **`src/config/db.ts`**:
    *   配置 MySQL 连接池 (`mysql2/promise`)。
    *   导出 `pool` 对象供 Controller 层使用。
    *   包含 `testConnection` 函数用于启动时测试数据库连通性。

### Controller (控制器)
*   **`approvalController.ts`**:
    *   包含审批业务最核心的逻辑。
    *   `listApprovals`: 处理复杂的列表查询和分页。
    *   `createApproval` / `batchCreateApprovals`: 处理单据创建，包括事务管理。
    *   `updateApproval`: 处理单据更新和附件关联。
    *   `approveApproval` / `rejectApproval`: 处理审批动作。
*   **`departmentController.ts`**:
    *   `getDepartments`: 核心逻辑是将数据库的平面列表转换为前端可用的 Tree 结构。
    *   `computePaths`: 辅助计算部门的层级路径字符串。
*   **`attachmentController.ts`**:
    *   `uploadAttachment`: 处理文件上传，识别文件类型 (Image/Excel)。
    *   `deleteAttachment`: 安全删除文件和记录。

### Routes (路由)
*   **`src/routes/index.ts`**:
    *   路由聚合器，将各个模块的路由统一挂载到 `/api` 下。
*   **`approvalRoutes.ts`**: 定义 `/api/approvals` 下的所有端点。

### Utils & Services
*   **`src/utils/departmentUtils.ts`**:
    *   提供 `computePaths` 方法，递归计算部门的完整路径名称 (如 "技术部-前端组")，用于列表展示。
*   **`src/services/attachmentCleanupService.ts`**:
    *   使用 `node-cron` 定义定时任务。
    *   负责清理未被关联到审批单的“孤儿”附件，防止磁盘空间浪费。

## 4. 数据库设计摘要 (Database Schema)

*   **`users`**: 用户表 (申请人/审批人)。
*   **`approval_forms`**: 审批单主表 (核心业务数据)。
*   **`approval_logs`**: 审批操作日志 (记录每一步操作)。
*   **`approval_attachments`**: 附件表 (关联审批单和文件)。
*   **`departments`**: 部门表 (树形组织结构)。
*   **`form_schemas`**: 动态表单配置表 (存储 JSON Schema)。

## 5. 运行说明 (Setup & Run)

1.  **安装依赖**:
    ```bash
    npm install
    ```
2.  **数据库准备**:
    *   确保 MySQL 服务已启动。
    *   执行 `src/config/create_table.sql` 初始化表结构和测试数据。
    *   在 `src/config/db.ts` 中配置正确的数据库连接信息。
3.  **开发模式启动**:
    ```bash
    npm run dev
    ```
    服务将运行在 `http://localhost:3001`。
