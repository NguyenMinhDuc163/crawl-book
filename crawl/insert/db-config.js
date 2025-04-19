/**
 * Cấu hình kết nối PostgreSQL cho ứng dụng đọc truyện
 * File này tập trung quản lý thông tin kết nối database để tái sử dụng
 */

const { Pool } = require('pg');

// Cấu hình kết nối
const dbConfig = {
    user: 'postgres',      // Thay bằng username PostgreSQL của bạn
    host: 'localhost',          // Host của PostgreSQL
    database: 'book_brain', // Tên database
    password: 'NguyenDuc@163',  // Mật khẩu PostgreSQL
    port: 5432,                 // Port của PostgreSQL (mặc định là 5432)

    // Cấu hình pool connection
    max: 20,                    // Số lượng kết nối tối đa trong pool
    idleTimeoutMillis: 30000,   // Thời gian chờ trước khi đóng kết nối không sử dụng
    connectionTimeoutMillis: 2000, // Thời gian chờ kết nối tối đa
};

// Tạo và export pool connection để sử dụng trong các module khác
const pool = new Pool(dbConfig);

// Sự kiện khi có lỗi xảy ra trong pool
pool.on('error', (err, client) => {
    console.error('Lỗi không mong muốn trong kết nối PostgreSQL:', err);
});

// Hàm thực hiện truy vấn đơn giản
async function query(text, params) {
    const start = Date.now();
    const res = await pool.query(text, params);
    const duration = Date.now() - start;

    // Log thời gian thực hiện truy vấn (có thể bỏ comment nếu cần debug)
    // console.log('Executed query', { text, duration, rows: res.rowCount });

    return res;
}

// Hàm lấy client từ pool để thực hiện nhiều truy vấn trong cùng một transaction
async function getClient() {
    const client = await pool.connect();
    const query = client.query.bind(client);
    const release = client.release.bind(client);

    // Định nghĩa lại hàm release để tránh lỗi double release
    client.release = () => {
        client.query = () => {
            throw new Error('Đang sử dụng client sau khi đã release!');
        };
        return release();
    };

    return client;
}

// Export các hàm và đối tượng để sử dụng trong các file khác
module.exports = {
    query,         // Để thực hiện các truy vấn đơn giản
    getClient,     // Để thực hiện các transactions
    pool,          // Nếu cần truy cập trực tiếp pool
    config: dbConfig  // Để truy cập thông tin cấu hình nếu cần
};