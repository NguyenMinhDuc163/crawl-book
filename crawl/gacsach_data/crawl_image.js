const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const { Pool } = require('pg');

// Cấu hình kết nối PostgreSQL
const pool = new Pool({
    user: 'postgres',
    host: '20.2.26.123',
    database: 'book_brain_db',
    password: 'NguyenDuc@163',
    port: 5432,
});

// Thư mục backup
const BACKUP_DIR = path.join(__dirname, 'db_backup');
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Hàm backup dữ liệu trước khi cập nhật
async function backupBooks() {
    const client = await pool.connect();
    try {
        console.log('Đang tạo backup dữ liệu sách...');
        const result = await client.query('SELECT * FROM books');
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const backupFile = path.join(BACKUP_DIR, `books_backup_${timestamp}.json`);

        fs.writeFileSync(backupFile, JSON.stringify(result.rows, null, 2), 'utf8');
        console.log(`✅ Đã tạo backup thành công tại: ${backupFile}`);
        return backupFile;
    } finally {
        client.release();
    }
}

// Hàm crawl URL để lấy link ảnh
async function crawlBookImageUrl(url) {
    try {
        console.log(`Đang crawl URL: ${url}`);
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);

        // Tìm thẻ chứa ảnh bìa sách dựa trên cấu trúc HTML của trang
        const imgElement = $('.field-name-field-image img').first();

        if (imgElement.length > 0) {
            let imageUrl = imgElement.attr('src');

            // Đảm bảo URL là đầy đủ
            if (imageUrl && !imageUrl.startsWith('http')) {
                // Xử lý URL tương đối thành URL tuyệt đối
                const baseUrl = new URL(url).origin;
                imageUrl = new URL(imageUrl, baseUrl).href;
            }

            console.log(`Tìm thấy URL ảnh: ${imageUrl}`);
            return imageUrl;
        }

        console.log('Không tìm thấy ảnh trong HTML.');
        return null;
    } catch (error) {
        console.error(`Lỗi khi crawl URL ${url}: ${error.message}`);
        return null;
    }
}

// Hàm chính để xử lý tất cả sách trong database
async function processBooks() {
    // Tạo backup trước khi thực hiện thay đổi
    const backupFile = await backupBooks();

    const client = await pool.connect();

    // Đếm số lượng cập nhật thành công
    let successCount = 0;
    let errorCount = 0;
    let unchangedCount = 0;

    try {
        // Lấy tất cả sách - có thể thêm điều kiện WHERE nếu cần
        const booksResult = await client.query('SELECT book_id, title, url, image_url FROM books');

        const books = booksResult.rows;
        console.log(`Tìm thấy ${books.length} sách để kiểm tra ảnh bìa.`);

        for (const book of books) {
            try {
                console.log(`\nĐang xử lý sách: ${book.title} (ID: ${book.book_id})`);

                // Lấy URL ảnh từ trang web
                const imageUrl = await crawlBookImageUrl(book.url);

                if (imageUrl) {
                    // Nếu image_url hiện tại giống với imageUrl mới crawl được, không cần cập nhật
                    if (book.image_url === imageUrl) {
                        console.log(`⏭️ Sách ID ${book.book_id} đã có URL ảnh đúng.`);
                        unchangedCount++;
                        continue;
                    }

                    // Cập nhật URL ảnh trong database
                    await client.query(
                        'UPDATE books SET image_url = $1, updated_at = CURRENT_TIMESTAMP WHERE book_id = $2',
                        [imageUrl, book.book_id]
                    );

                    console.log(`✅ Đã cập nhật ảnh cho sách ID ${book.book_id}: ${imageUrl}`);
                    successCount++;
                } else {
                    console.log(`❌ Không tìm thấy ảnh cho sách ID ${book.book_id}`);
                    errorCount++;
                }
            } catch (error) {
                console.error(`❌ Lỗi khi xử lý sách ID ${book.book_id}: ${error.message}`);
                errorCount++;
            }

            // Tạm dừng một chút để tránh quá tải server
            await new Promise(resolve => setTimeout(resolve, 1500));
        }

        console.log('\n====== KẾT QUẢ TỔNG QUAN ======');
        console.log(`✅ Cập nhật thành công: ${successCount} sách`);
        console.log(`⏭️ Không thay đổi: ${unchangedCount} sách`);
        console.log(`❌ Lỗi hoặc không tìm thấy ảnh: ${errorCount} sách`);
        console.log(`📁 Dữ liệu đã được backup tại: ${backupFile}`);
        console.log('===============================');
    } finally {
        client.release();
    }

    return {
        successCount,
        errorCount,
        unchangedCount,
        backupFile
    };
}

// Hàm phục hồi từ backup nếu cần
async function restoreFromBackup(backupFile) {
    console.log(`\nĐang phục hồi dữ liệu từ backup: ${backupFile}`);

    try {
        const backupData = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            for (const book of backupData) {
                await client.query(
                    'UPDATE books SET image_url = $1, updated_at = $2 WHERE book_id = $3',
                    [book.image_url, book.updated_at, book.book_id]
                );
            }

            await client.query('COMMIT');
            console.log('✅ Phục hồi dữ liệu thành công!');
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('❌ Lỗi phục hồi dữ liệu:', error);
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('❌ Không thể đọc file backup:', error);
    }
}

// Chạy hàm chính
processBooks()
    .then((results) => {
        console.log('Quá trình cập nhật hoàn tất');

        // Hỏi người dùng có muốn restore từ backup không (trong môi trường CLI)
        if (process.stdin.isTTY) {
            console.log('\nBạn có muốn phục hồi dữ liệu từ backup không? (y/n)');
            process.stdin.once('data', (data) => {
                const input = data.toString().trim().toLowerCase();
                if (input === 'y' || input === 'yes') {
                    restoreFromBackup(results.backupFile).then(() => process.exit(0));
                } else {
                    console.log('Thoát mà không phục hồi dữ liệu.');
                    process.exit(0);
                }
            });
        } else {
            process.exit(0);
        }
    })
    .catch(err => {
        console.error('Lỗi nghiêm trọng:', err);
        process.exit(1);
    });