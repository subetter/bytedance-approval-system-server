-- =======================================================
-- 1. 用户信息表 (users)
-- 用于存储申请人和审批员信息
-- =======================================================
CREATE TABLE IF NOT EXISTS `users` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `username` VARCHAR(50) NOT NULL UNIQUE COMMENT '用户名（登录名）',
    `display_name` VARCHAR(50) NOT NULL COMMENT '显示名称',
    `department` VARCHAR(100) COMMENT '所属部门',
    `role` ENUM('APPLICANT', 'APPROVER') NOT NULL COMMENT '系统角色：申请人或审批员',
    PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '用户信息表';

-- =======================================================
-- 2. 审批单主表 (approval_forms)
-- 存储审批单的核心数据和状态
-- =======================================================
CREATE TABLE IF NOT EXISTS `approval_forms` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `project_name` VARCHAR(20) NOT NULL COMMENT '审批项目名称 (限制20字)',
    `content` TEXT NOT NULL COMMENT '审批内容 (限制300字)',
    `dept_path` VARCHAR(100) NOT NULL COMMENT '申请部门路径 (例: A部门-B子部门-C团队)',
    `execute_date` DATE NOT NULL COMMENT '执行日期',
    `applicant_id` BIGINT NOT NULL COMMENT '申请人ID',
    `current_approver_id` BIGINT COMMENT '当前待审批人ID (如果已完成，可为空)',
    `status` ENUM('0', '1', '2') NOT NULL DEFAULT '0' COMMENT '审批状态：0-待审批, 1-审批通过, 2-审批拒绝',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    `approval_at` DATETIME COMMENT '审批完成时间',
    `is_deleted` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '逻辑删除标记',
    PRIMARY KEY (`id`),
    -- 建立外键关联
    FOREIGN KEY (`applicant_id`) REFERENCES `users` (`id`),
    FOREIGN KEY (`current_approver_id`) REFERENCES `users` (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '审批单主表';

-- =======================================================
-- 3. 审批流转记录表 (approval_logs)
-- 记录审批单的所有操作历史
-- =======================================================
CREATE TABLE IF NOT EXISTS `approval_logs` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `form_id` BIGINT NOT NULL COMMENT '关联的审批单ID',
    `operator_id` BIGINT NOT NULL COMMENT '操作人ID',
    `action` ENUM(
        'CREATE',
        'UPDATE',
        'WITHDRAW',
        'APPROVE',
        'REJECT'
    ) NOT NULL COMMENT '操作类型',
    `comment` VARCHAR(500) COMMENT '操作意见/备注',
    `action_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作发生时间',
    PRIMARY KEY (`id`),
    -- 建立外键关联
    FOREIGN KEY (`form_id`) REFERENCES `approval_forms` (`id`),
    FOREIGN KEY (`operator_id`) REFERENCES `users` (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '审批流转记录表';

-- =======================================================
-- 4. 审批附件表 (approval_attachments)
-- 存储任务2中的附件信息
-- =======================================================
CREATE TABLE IF NOT EXISTS `approval_attachments` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `form_id` BIGINT COMMENT '关联的审批单ID',
    `file_name` VARCHAR(255) NOT NULL COMMENT '原始文件名称',
    `file_url` VARCHAR(500) NOT NULL COMMENT '文件存储路径/URL',
    `file_type` ENUM('IMAGE', 'EXCEL', 'OTHER') NOT NULL COMMENT '文件类型',
    `uploader_id` BIGINT NOT NULL COMMENT '上传人ID',
    `uploaded_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '上传时间',
    PRIMARY KEY (`id`),
    -- 建立外键关联
    FOREIGN KEY (`form_id`) REFERENCES `approval_forms` (`id`),
    FOREIGN KEY (`uploader_id`) REFERENCES `users` (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '审批附件表';

-- =======================================================
-- 5. 部门/组织结构表 (departments)
-- 用于存储级联选择器所需的树形数据
-- =======================================================
CREATE TABLE IF NOT EXISTS `departments` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `parent_id` BIGINT COMMENT '父级部门ID',
    `name` VARCHAR(100) NOT NULL COMMENT '部门/团队名称',
    `level` TINYINT NOT NULL COMMENT '部门层级 (1, 2, 3...)',
    `is_active` BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否启用',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`id`),
    -- 自关联外键
    FOREIGN KEY (`parent_id`) REFERENCES `departments` (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '部门/组织结构表';

-- 假设您希望 approval_forms 表中的 dept_path 字段关联到此表
-- 您可以更新 approval_forms 表，将 dept_path 字段替换为：
-- `department_id` BIGINT NOT NULL COMMENT '最终选中的团队ID',
ALTER TABLE approval_forms
ADD COLUMN department_id BIGINT COMMENT '申请的最终部门/团队ID' AFTER content;
-- 假设您已经处理完现有数据的映射和更新，
-- 或者您的表是空的，现在将其设置为 NOT NULL:
ALTER TABLE approval_forms
MODIFY COLUMN department_id BIGINT NOT NULL COMMENT '申请的最终部门/团队ID';

ALTER TABLE approval_forms DROP COLUMN dept_path;

ALTER TABLE approval_forms
ADD CONSTRAINT fk_form_department_id FOREIGN KEY (department_id) REFERENCES departments (id);

-- 插入用户数据
INSERT INTO
    `users` (
        `id`,
        `username`,
        `display_name`,
        `department`,
        `role`
    )
VALUES (
        101,
        'zhangsan',
        '张三',
        '技术部',
        'APPLICANT'
    ),
    (
        102,
        'lisi',
        '李四',
        '技术部',
        'APPROVER'
    ),
    (
        103,
        'wangwu',
        '王五',
        '财务部',
        'APPROVER'
    );

-- 插入部门数据 (自关联)
INSERT INTO
    `departments` (
        `id`,
        `parent_id`,
        `name`,
        `level`,
        `is_active`
    )
VALUES (1, NULL, '技术部', 1, TRUE), -- Level 1: 部门
    (2, 1, '前端研发组', 2, TRUE), -- Level 2: 子部门
    (3, 2, 'React开发团队', 3, TRUE);
-- Level 3: 团队 (审批单最终关联到此ID)

-- 插入审批单数据
INSERT INTO
    `approval_forms` (
        `id`,
        `project_name`,
        `content`,
        `department_id`,
        `execute_date`,
        `applicant_id`,
        `current_approver_id`,
        `status`,
        `approval_at`,
        `is_deleted`
    )
VALUES (
        1,
        '2025年度预算申请',
        '申请部门年度预算，用于设备采购和团建活动。',
        3,
        '2025-12-30',
        101,
        102,
        '0',
        NULL,
        FALSE
    ), -- 待审批，当前审批人是李四(102)
    (
        2,
        '紧急服务器升级项目',
        '需要紧急升级核心服务器，以应对高并发流量。',
        3,
        '2025-11-20',
        101,
        NULL,
        '1',
        '2025-11-19 10:30:00',
        FALSE
    ), -- 已通过，无当前审批人
    (
        3,
        '差旅费用报销',
        '张三前往北京参加技术会议产生的差旅费。',
        3,
        '2025-11-15',
        101,
        NULL,
        '2',
        '2025-11-18 15:45:00',
        FALSE
    );
-- 已拒绝，无当前审批人

-- 插入审批记录数据
INSERT INTO
    `approval_logs` (
        `form_id`,
        `operator_id`,
        `action`,
        `comment`,
        `action_time`
    )
VALUES
    -- 审批单 1：待审批
    (
        1,
        101,
        'CREATE',
        '张三新建了预算申请单。',
        '2025-11-28 09:00:00'
    ),
    (
        1,
        101,
        'UPDATE',
        '张三更新了执行日期。',
        '2025-11-28 09:15:00'
    ),
    -- 审批单 2：已通过
    (
        2,
        101,
        'CREATE',
        '张三新建了服务器升级申请。',
        '2025-11-18 08:00:00'
    ),
    (
        2,
        102,
        'APPROVE',
        '项目紧急且必要，批准通过。',
        '2025-11-19 10:30:00'
    ),
    -- 审批单 3：已拒绝
    (
        3,
        101,
        'CREATE',
        '张三创建了差旅报销单。',
        '2025-11-17 14:00:00'
    ),
    (
        3,
        103,
        'REJECT',
        '费用明细不清晰，请补充发票清单后重新提交。',
        '2025-11-18 15:45:00'
    );

-- 插入附件数据
INSERT INTO
    `approval_attachments` (
        `form_id`,
        `file_name`,
        `file_url`,
        `file_type`,
        `uploader_id`,
        `uploaded_at`
    )
VALUES
    -- 审批单 2：图片附件
    (
        2,
        '服务器架构图.png',
        '/uploads/2/arch_v1.png',
        'IMAGE',
        101,
        '2025-11-18 08:05:00'
    ),
    -- 审批单 2：Excel附件
    (
        2,
        '升级预算清单.xlsx',
        '/uploads/2/budget.xlsx',
        'EXCEL',
        101,
        '2025-11-18 08:06:00'
    ),
    -- 审批单 3：图片附件
    (
        3,
        '差旅发票照片.jpg',
        '/uploads/3/invoice_01.jpg',
        'IMAGE',
        101,
        '2025-11-17 14:05:00'
    );

--查看approval_forms表的所有列
SELECT * FROM approval_forms;

-- =======================================================
-- 6. 表单配置表 (form_schemas) -- 新增
-- 存储动态表单的 JSON Schema
-- =======================================================
CREATE TABLE IF NOT EXISTS `form_schemas` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `schema_key` VARCHAR(50) NOT NULL UNIQUE COMMENT '配置唯一标识 Key',
    `name` VARCHAR(100) NOT NULL COMMENT '配置名称',
    `schema_content` JSON NOT NULL COMMENT '表单结构的 JSON Schema 内容',
    `is_active` BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否启用',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '表单配置表';

-- 确保 form_schemas 表已存在

INSERT INTO
    form_schemas (
        schema_key,
        name,
        schema_content,
        is_active
    )
VALUES (
        'basic_approval',
        '基础审批单',
        -- 核心：将 JSON 数组转义为字符串，适用于 JSON 或 TEXT 字段
        '[{
        "field": "projectName",
        "name": "审批项目",
        "component": "Input",
        "validator": { "required": true, "maxCount": 10 }
    }, {
        "field": "content",
        "name": "审批内容",
        "component": "Textarea",
        "validator": { "required": true, "maxCount": 100 }
    }, {
        "field": "departmentId",
        "name": "申请部门",
        "component": "Cascader",
        "validator": { "required": true }
    }, {
        "field": "executeDate",
        "name": "执行日期",
        "component": "DatePicker",
        "validator": { "required": true }
    }, {
        "field": "approvalAt",
        "name": "审批时间",
        "component": "DatePicker",
        "validator": { "required": false }
    }]',
        TRUE
    )
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    schema_content = VALUES(schema_content),
    is_active = VALUES(is_active);