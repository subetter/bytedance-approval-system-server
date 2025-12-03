import { Context } from 'koa';
import pool from '../config/db';
import { RowDataPacket } from 'mysql2/promise';
import { computePaths, DeptLike } from '../utils/departmentUtils';

// 辅助类型
type DepartmentRow = DeptLike & RowDataPacket & {
    level: number;
    is_active: 0 | 1 | boolean;
    created_at: string;
}

// 将平面数组转为树形结构
const buildTree = (rows: DepartmentRow[]) => {
    const map = new Map<number, any>();
    const roots: any[] = [];
    rows.forEach(r => {
        const node = { ...r, children: [] };
        map.set(r.id, node);
    });
    rows.forEach(r => {
        const node = map.get(r.id);
        if (r.parent_id && map.has(r.parent_id)) {
            map.get(r.parent_id).children.push(node);
        } else {
            roots.push(node);
        }
    });
    return roots;
};

// Use computePaths from utils (imported above)

/**
 * 获取部门列表
 * 支持查询参数：
 *  - tree=true (返回树形结构)
 *  - active=true (只返回启用的部门)
 */
export const getDepartments = async (ctx: Context) => {
    try {
        const { tree, active = 'true', format } = ctx.query as any;
        // 默认返回嵌套 children 结构（如果需要平面列表请传 flat=true 或 tree=false）
        const treeFlag = (tree === undefined) ? true : (tree === 'true' || tree === '1');
        const onlyActive = (active as string) !== 'false';
        const sql = onlyActive ? 'SELECT * FROM departments WHERE is_active = TRUE ORDER BY level, id' : 'SELECT * FROM departments ORDER BY level, id';
        const [rows] = await pool.execute<DepartmentRow[]>(sql);
        // 计算每个节点的 path（使用共享工具）
        computePaths(rows as any);

        if (treeFlag) {
            const result = buildTree(rows);
            // 支持额外的格式化选项，便于前端下拉/级联组件使用
            const fmt = (format as string) || '';
            if (format === 'options' || format === 'select') {
                const toOptionsTree = (nodes: any[]): any[] => {
                    return nodes.map(n => {
                        const children = n.children && n.children.length ? toOptionsTree(n.children) : undefined;
                        const obj: any = { value: n.id, label: n.name, path: n.path };
                        if (children && children.length) obj.children = children;
                        return obj;
                    });
                };
                const formatted = toOptionsTree(result as any[]);
                ctx.body = { code: 200, message: '查询部门树(下拉选项)成功', data: formatted };
                ctx.status = 200;
                return;
            }
            ctx.body = { code: 200, message: '查询部门树成功', data: result };
            ctx.status = 200;
            return;
        }

        ctx.body = { code: 200, message: '查询部门列表成功', data: rows };
        ctx.status = 200;
    } catch (err: any) {
        console.error('查询部门失败:', err);
        ctx.throw(500, '查询部门失败', { details: err.message });
    }
};

/**
 * 获取单个部门详情（可选）
 */
export const getDepartmentById = async (ctx: Context) => {
    const { id } = ctx.params;
    try {
        // 为了避免循环 DB 查询，读取所有部门并计算 path，然后从中取出目标部门
        const [allRows] = await pool.execute<DepartmentRow[]>('SELECT * FROM departments');
        if (!allRows || (allRows as DepartmentRow[]).length === 0) {
            ctx.throw(404, `部门数据为空`);
            return;
        }
        // 计算 path 并注入到所有 rows 上
        const populated = computePaths(allRows as any) as DepartmentRow[];
        const deptId = parseInt(id as string);
        const dept = (populated as DepartmentRow[]).find(r => r.id === deptId);
        if (!dept) {
            ctx.throw(404, `部门 ID ${id} 不存在`);
            return;
        }
        const result = { ...dept } as DepartmentRow;
        ctx.body = { code: 200, message: '查询部门成功', data: result };
    } catch (err: any) {
        console.error(`查询部门 ${id} 失败:`, err);
        ctx.throw(500, '查询部门失败', { details: err.message });
    }
};

export const getDepartmentByName = async (ctx: Context) => {
    const { name } = ctx.params;
    console.log('========name:=======', name);
    try {
        const [rows] = await pool.execute<DepartmentRow[]>('SELECT * FROM departments WHERE name = ?', [name]);
        console.log('========rows:=======', rows);
        if (!rows || (rows as DepartmentRow[]).length === 0) {
            ctx.throw(404, `部门 ${name} 不存在`);
            return;
        }
        const result = { ...rows[0] } as DepartmentRow;
        ctx.body = { code: 200, message: '查询部门成功', data: result };
    } catch (err: any) {
        console.error(`查询部门 ${name} 失败:`, err);
        ctx.throw(500, '查询部门失败', { details: err.message });
    }
};

