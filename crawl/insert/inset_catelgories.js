const fs = require('fs');
const db = require('./db-config');

// Đường dẫn file chứa dữ liệu categories
const CATEGORIES_FILE = 'E:\\ky8\\mobile\\crawl\\crawl\\gacsach_data\\categories\\all_categories.json';

// Hàm log với màu sắc
function log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    let coloredMessage;

    switch(type) {
        case 'success':
            coloredMessage = `\x1b[32m${message}\x1b[0m`; // Màu xanh lá
            break;
        case 'error':
            coloredMessage = `\x1b[31m${message}\x1b[0m`; // Màu đỏ
            break;
        case 'warning':
            coloredMessage = `\x1b[33m${message}\x1b[0m`; // Màu vàng
            break;
        default:
            coloredMessage = message;
    }

    console.log(`[${timestamp}] ${coloredMessage}`);
}

// Hàm chính để insert categories
async function insertCategories() {
    try {
        log('Bắt đầu import dữ liệu categories', 'info');

        // Kiểm tra file tồn tại
        if (!fs.existsSync(CATEGORIES_FILE)) {
            log(`File ${CATEGORIES_FILE} không tồn tại!`, 'error');
            return;
        }

        // Đọc và parse dữ liệu JSON
        log(`Đang đọc file: ${CATEGORIES_FILE}`, 'info');
        const fileData = fs.readFileSync(CATEGORIES_FILE, 'utf8');

        let categories;
        try {
            categories = JSON.parse(fileData);
            log(`Đã đọc thành công: Tìm thấy ${categories.length} thể loại`, 'success');
        } catch (error) {
            log(`Không thể parse nội dung JSON: ${error.message}`, 'error');
            return;
        }

        // Kết nối với database
        const client = await db.getClient();
        log('Đã kết nối tới database', 'success');

        try {
            // Đếm số lượng categories hiện có trong DB
            const countResult = await client.query('SELECT COUNT(*) FROM categories');
            const existingCount = parseInt(countResult.rows[0].count);
            log(`Hiện có ${existingCount} thể loại trong database`, 'info');

            let successCount = 0;
            let errorCount = 0;
            let updateCount = 0;

            // Insert từng category
            for (let i = 0; i < categories.length; i++) {
                const category = categories[i];
                try {
                    // Kiểm tra xem category đã tồn tại (theo url) chưa
                    const checkResult = await client.query(
                        'SELECT category_id FROM categories WHERE url = $1',
                        [category.url]
                    );

                    if (checkResult.rows.length > 0) {
                        // Category đã tồn tại, update
                        const updateResult = await client.query(
                            'UPDATE categories SET name = $1, title = $2 WHERE url = $3 RETURNING category_id',
                            [category.name, category.title, category.url]
                        );

                        updateCount++;
                        log(`[${i+1}/${categories.length}] ✅ Đã cập nhật thể loại "${category.name}" (ID: ${checkResult.rows[0].category_id})`, 'success');
                    } else {
                        // Category chưa tồn tại, insert mới
                        const insertResult = await client.query(
                            'INSERT INTO categories(name, title, url) VALUES($1, $2, $3) RETURNING category_id',
                            [category.name, category.title, category.url]
                        );

                        successCount++;
                        log(`[${i+1}/${categories.length}] ✅ Đã thêm mới thể loại "${category.name}" (ID: ${insertResult.rows[0].category_id})`, 'success');
                    }
                } catch (error) {
                    errorCount++;
                    log(`[${i+1}/${categories.length}] ❌ Lỗi khi xử lý thể loại "${category.name}": ${error.message}`, 'error');
                }
            }

            // Kiểm tra lại số lượng sau khi insert
            const newCountResult = await client.query('SELECT COUNT(*) FROM categories');
            const newCount = parseInt(newCountResult.rows[0].count);

            // Hiển thị thống kê
            log('\n=== KẾT QUẢ IMPORT CATEGORIES ===', 'info');
            log(`✅ Thêm mới: ${successCount}`, 'success');
            log(`🔄 Cập nhật: ${updateCount}`, 'info');
            log(`❌ Lỗi: ${errorCount}`, 'error');
            log(`Tổng số thể loại trong database: ${newCount} (tăng thêm ${newCount - existingCount})`, 'info');

        } catch (error) {
            log(`Lỗi trong quá trình xử lý: ${error.message}`, 'error');
        } finally {
            // Giải phóng client
            client.release();
            log('Đã đóng kết nối database', 'info');

            // Đóng pool kết nối
            await db.pool.end();
        }

    } catch (error) {
        log(`Lỗi không mong muốn: ${error.message}`, 'error');
        console.error(error.stack);
    }
}

// Thực thi chương trình
insertCategories().then(() => {
    log('Chương trình đã kết thúc', 'info');
}).catch(error => {
    log(`Lỗi chương trình: ${error.message}`, 'error');
    console.error(error.stack);
});