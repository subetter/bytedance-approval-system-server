import mysql, { Pool } from "mysql2/promise";

// 创建连接池
const pool: Pool = mysql.createPool({
    host: "localhost",  // 数据库服务器地址，默认localhost
    port: 3306,         // 默认端口
    user: "root",       // 用户名，默认root
    password: "123456", // 密码
    database: "approval", // 数据库名称

    // 连接池配置
    waitForConnections: true, // 没有连接时等待
    connectionLimit: 10,      // 连接池最大连接数
    queueLimit: 0,            // 等待队列无限制（0表示不限制）
});

/**
 * @description 测试数据库连接是否成功
 */
async function testConnection(): Promise<void> {
    try {
        // 从连接池获取一个连接
        const connection = await pool.getConnection();
        console.log("数据库连接成功");
        // 释放连接回池
        connection.release();
    } catch (e) {
        // 确保捕获并打印错误对象
        console.error("数据库连接失败:", e);
    }
}

// 执行测试
testConnection();

// 使用 ES 模块导出连接池
export default pool;