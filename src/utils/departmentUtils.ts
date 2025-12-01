// Shared department helpers for path computation
export type DeptLike = {
    id: number;
    parent_id?: number | null;
    name: string;
    path?: string;
};

export function computePaths<T extends DeptLike>(rows: T[]): T[] {
    const map = new Map<number, T>();
    for (const r of rows) map.set(r.id, r);

    const cache = new Map<number, string>();

    const buildPathForId = (id: number): string => {
        if (cache.has(id)) return cache.get(id)!;
        const node = map.get(id);
        if (!node) return '';
        if (!node.parent_id) {
            cache.set(id, node.name);
            return node.name;
        }
        let safety = 0;
        let cur = node.parent_id as number | undefined | null;
        while (cur && safety < 50) {
            if (cache.has(cur)) {
                const p = cache.get(cur)!;
                const path = p ? `${p}/${node.name}` : node.name;
                cache.set(id, path);
                return path;
            }
            const parent = map.get(cur);
            if (!parent) break;
            cur = parent.parent_id as any;
            safety++;
        }
        const pPath = node.parent_id ? buildPathForId(node.parent_id) : '';
        const path = pPath ? `${pPath}/${node.name}` : node.name;
        cache.set(id, path);
        return path;
    };

    for (const r of rows) r.path = buildPathForId(r.id);
    return rows;
}

export function computePathMap<T extends DeptLike>(rows: T[]): Map<number, string> {
    computePaths(rows);
    const m = new Map<number, string>();
    for (const r of rows) {
        m.set(r.id, r.path || '');
    }
    return m;
}
