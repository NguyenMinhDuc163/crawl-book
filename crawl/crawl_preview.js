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

// Mô tả mặc định khi không tìm thấy excerpt
const DEFAULT_EXCERPT = "Cuốn sách này mang đến cho bạn đọc những góc nhìn sâu sắc và đầy cảm hứng. Tác giả đã khéo léo dẫn dắt người đọc qua từng trang sách với lối viết cuốn hút và nội dung đầy tính thực tiễn. Đây không chỉ là một tác phẩm đáng đọc mà còn là nguồn tri thức quý giá, giúp bạn mở rộng tầm nhìn và có thêm nhiều góc nhìn mới về cuộc sống. Hãy đồng hành cùng tác giả trong hành trình khám phá những giá trị sâu sắc được gửi gắm trong từng chương sách.";

// Backup dữ liệu trước khi thay đổi
async function backupExcerpts() {
    const client = await pool.connect();
    try {
        console.log('Đang tạo backup dữ liệu excerpt...');
        const result = await client.query('SELECT book_id, title, excerpt FROM books');
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const backupFile = path.join(BACKUP_DIR, `excerpts_backup_${timestamp}.json`);

        fs.writeFileSync(backupFile, JSON.stringify(result.rows, null, 2), 'utf8');
        console.log(`✅ Đã tạo backup thành công tại: ${backupFile}`);
        return backupFile;
    } finally {
        client.release();
    }
}

// Hàm làm sạch excerpt
function cleanExcerpt(text) {
    if (!text) return null;

    // Loại bỏ rating kiểu "10/10" ở đầu
    let cleaned = text.replace(/^\s*\d+\/\d+\s+/i, '');

    // Loại bỏ các đoạn như "Ebook miễn phí tại : www.Sachvui.Com" và các text tương tự
    cleaned = cleaned.replace(/ebook miễn phí tại[\s\S]*?sachvui\.com/i, '');
    cleaned = cleaned.replace(/sachvui\.com/i, '');
    cleaned = cleaned.replace(/www\.sachvui\.com/i, '');

    // Loại bỏ các tiêu đề không liên quan
    cleaned = cleaned.replace(/^\s*LỜI NÓI ĐẦU[^a-zA-Z0-9\u00C0-\u1EF9]*/i, '');
    cleaned = cleaned.replace(/^\s*LỜI MỞ ĐẦU[^a-zA-Z0-9\u00C0-\u1EF9]*/i, '');
    cleaned = cleaned.replace(/^\s*GIỚI THIỆU[^a-zA-Z0-9\u00C0-\u1EF9]*/i, '');
    cleaned = cleaned.replace(/^\s*NỘI DUNG[^a-zA-Z0-9\u00C0-\u1EF9]*/i, '');

    // Loại bỏ URL
    cleaned = cleaned.replace(/https?:\/\/[^\s]+/g, '');
    cleaned = cleaned.replace(/www\.[^\s]+/g, '');

    // Chuẩn hóa khoảng trắng
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    // Đảm bảo độ dài phù hợp
    if (cleaned.length < 20) {
        return null;
    }

    // Viết hoa chữ cái đầu tiên
    if (cleaned.length > 0) {
        cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }

    return cleaned;
}

// Hàm crawl URL để lấy excerpt
async function crawlBookExcerpt(url) {
    try {
        console.log(`Đang crawl excerpt từ URL: ${url}`);
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);

        // Tìm đúng phần preview của sách
        const previewElement = $('.field-name-body .field-item.even').first();

        if (previewElement.length > 0) {
            // Lấy text thuần túy, giữ các thẻ <p> bằng cách thêm dấu xuống dòng
            let previewText = '';

            // Xử lý từng thẻ p bên trong
            previewElement.find('p').each(function() {
                const paragraphText = $(this).text().trim();
                if (paragraphText) {
                    previewText += paragraphText + '\n\n';
                }
            });

            // Nếu không tìm thấy thẻ p nào, lấy toàn bộ text
            if (!previewText) {
                previewText = previewElement.text().trim();
            }

            if (previewText) {
                console.log('Tìm thấy excerpt.');
                // Làm sạch dữ liệu trước khi trả về
                return cleanExcerpt(previewText);
            }
        }

        console.log('Không tìm thấy excerpt trong HTML.');
        return null;
    } catch (error) {
        console.error(`Lỗi khi crawl URL ${url}: ${error.message}`);
        return null;
    }
}

// Hàm chính
async function resetAndCrawlExcerpts() {
    // 1. Backup dữ liệu hiện tại
    const backupFile = await backupExcerpts();

    const client = await pool.connect();

    try {
        // 2. Xóa tất cả dữ liệu excerpt
        console.log('Đang xóa tất cả dữ liệu excerpt...');
        await client.query('UPDATE books SET excerpt = NULL');
        console.log('✅ Đã xóa tất cả dữ liệu excerpt');

        // 3. Lấy tất cả sách để crawl lại
        const booksResult = await client.query('SELECT book_id, title, url FROM books');
        const books = booksResult.rows;
        console.log(`Tìm thấy ${books.length} sách để crawl excerpt.`);

        // Số liệu thống kê
        let successCount = 0;
        let defaultCount = 0;
        let errorCount = 0;

        // 4. Crawl lại excerpt cho từng sách
        for (const book of books) {
            try {
                console.log(`\nĐang xử lý sách: ${book.title} (ID: ${book.book_id})`);

                // Thử crawl excerpt
                const newExcerpt = await crawlBookExcerpt(book.url);

                // Mô tả để sử dụng (hoặc crawled hoặc default)
                let excerptToUse;

                if (newExcerpt && newExcerpt.length > 50) {
                    // Sử dụng excerpt crawl được nếu đủ dài
                    excerptToUse = newExcerpt;
                    console.log(`✅ Đã crawl được excerpt cho sách ID ${book.book_id}`);
                    successCount++;
                } else {
                    // Sử dụng excerpt mặc định
                    excerptToUse = DEFAULT_EXCERPT;
                    console.log(`📝 Sử dụng excerpt mặc định cho sách ID ${book.book_id}`);
                    defaultCount++;
                }

                // Cập nhật vào database
                await client.query(
                    'UPDATE books SET excerpt = $1, updated_at = CURRENT_TIMESTAMP WHERE book_id = $2',
                    [excerptToUse, book.book_id]
                );

                // In ra preview của excerpt
                console.log(`Excerpt (100 ký tự đầu): ${excerptToUse.substring(0, 100)}...`);

            } catch (error) {
                console.error(`❌ Lỗi khi xử lý sách ID ${book.book_id}: ${error.message}`);
                errorCount++;
            }

            // Tạm dừng để tránh quá tải server
            await new Promise(resolve => setTimeout(resolve, 1500));
        }

        // 5. Hiển thị thống kê
        console.log('\n====== KẾT QUẢ TỔNG QUAN ======');
        console.log(`✅ Cập nhật thành công bằng excerpt crawl được: ${successCount} sách`);
        console.log(`📝 Cập nhật bằng excerpt mặc định: ${defaultCount} sách`);
        console.log(`❌ Lỗi: ${errorCount} sách`);
        console.log(`📁 Dữ liệu đã được backup tại: ${backupFile}`);
        console.log('===============================');

        return {
            successCount,
            defaultCount,
            errorCount,
            backupFile
        };

    } finally {
        client.release();
    }
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
                    'UPDATE books SET excerpt = $1 WHERE book_id = $2',
                    [book.excerpt, book.book_id]
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
resetAndCrawlExcerpts()
    .then((results) => {
        console.log('Quá trình xóa và crawl lại excerpt hoàn tất');

        // Hỏi người dùng có muốn restore từ backup không
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