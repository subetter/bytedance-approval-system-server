import { Context } from 'koa';
import pool from '../config/db';
import { RowDataPacket } from 'mysql2/promise';

// 辅助类型
interface DepartmentRow extends RowDataPacket {
    id: number;
    parent_id?: number | null;
    name: string;
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

        if (treeFlag) {
            const result = buildTree(rows);
            // 支持额外的格式化选项，便于前端下拉/级联组件使用
            const fmt = (format as string) || '';
            if (format === 'options' || format === 'select') {
                const toOptionsTree = (nodes: any[]): any[] => {
                    return nodes.map(n => {
                        const children = n.children && n.children.length ? toOptionsTree(n.children) : undefined;
                        const obj: any = { value: n.id, label: n.name };
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
        const [rows] = await pool.execute<DepartmentRow[]>('SELECT * FROM departments WHERE id = ?', [id]);
        if ((rows as DepartmentRow[]).length === 0) {
            ctx.throw(404, `部门 ID ${id} 不存在`);
            return;
        }
        ctx.body = { code: 200, message: '查询部门成功', data: rows[0] };
    } catch (err: any) {
        console.error(`查询部门 ${id} 失败:`, err);
        ctx.throw(500, '查询部门失败', { details: err.message });
    }
};


