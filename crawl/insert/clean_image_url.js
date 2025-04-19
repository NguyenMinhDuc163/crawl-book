// check-image-urls.js
const { Pool } = require('pg');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Cấu hình kết nối PostgreSQL
const pool = new Pool({
    user: 'postgres',
    host: '20.2.26.123',
    database: 'book_brain_db', // Thay đổi thành tên database của bạn
    password: 'NguyenDuc@163', // Thay đổi thành mật khẩu của bạn
    port: 5432,
});

// Hàm kiểm tra URL ảnh
async function checkImageUrl(url) {
    if (!url) return { valid: false, reason: 'URL is null or empty' };

    // Kiểm tra định dạng URL
    try {
        new URL(url);
    } catch (err) {
        return { valid: false, reason: 'Invalid URL format' };
    }

    // Kiểm tra xem URL có hoạt động không và có phải là hình ảnh không
    try {
        const response = await axios.head(url, {
            timeout: 5000, // Timeout sau 5 giây
            validateStatus: null, // Chấp nhận mọi status code
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        // Kiểm tra status code
        if (response.status !== 200) {
            return { valid: false, reason: `HTTP status code: ${response.status}` };
        }

        // Kiểm tra Content-Type có phải là hình ảnh không
        const contentType = response.headers['content-type'];
        if (!contentType || !contentType.startsWith('image/')) {
            return { valid: false, reason: `Not an image. Content-Type: ${contentType}` };
        }

        return { valid: true, contentType };
    } catch (error) {
        return { valid: false, reason: `Error: ${error.message}` };
    }
}

// Hàm chính để kiểm tra URL hình ảnh
async function checkAllImageUrls() {
    console.log('Bắt đầu quá trình kiểm tra URL hình ảnh...');

    try {
        // Lấy tất cả sách từ cơ sở dữ liệu
        const booksResult = await pool.query(`
      SELECT b.book_id, b.title, b.image_url, b.url as book_url, a.name as author_name
      FROM books b
      LEFT JOIN authors a ON b.author_id = a.author_id
    `);

        const books = booksResult.rows;
        console.log(`Tìm thấy ${books.length} sách cần kiểm tra`);

        // Thống kê
        let stats = {
            total: books.length,
            valid: 0,
            invalid: 0,
            null: 0
        };

        // Danh sách URL không hợp lệ
        const invalidUrls = [];

        // Danh sách URL null
        const nullUrls = [];

        // Xử lý từng sách
        let completedCount = 0;

        for (let i = 0; i < books.length; i++) {
            const book = books[i];

            // Cập nhật tiến trình
            completedCount++;
            if (completedCount % 10 === 0 || completedCount === books.length) {
                console.log(`Tiến trình: ${completedCount}/${books.length} (${Math.round(completedCount/books.length*100)}%)`);
            }

            // Kiểm tra URL null
            if (!book.image_url) {
                stats.null++;
                nullUrls.push({
                    book_id: book.book_id,
                    title: book.title,
                    author: book.author_name,
                    book_url: book.book_url
                });
                continue;
            }

            // Kiểm tra URL ảnh
            const checkResult = await checkImageUrl(book.image_url);

            if (checkResult.valid) {
                stats.valid++;
            } else {
                stats.invalid++;
                invalidUrls.push({
                    book_id: book.book_id,
                    title: book.title,
                    author: book.author_name,
                    book_url: book.book_url,
                    image_url: book.image_url,
                    reason: checkResult.reason
                });
            }

            // Ngắt một chút để tránh quá tải server
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        // Tạo báo cáo
        const report = {
            timestamp: new Date().toISOString(),
            stats: {
                total: stats.total,
                valid: stats.valid,
                invalid: stats.invalid,
                null: stats.null,
                total_problematic: stats.invalid + stats.null
            },
            null_urls: nullUrls,
            invalid_urls: invalidUrls
        };

        // Lưu báo cáo vào file
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const reportFilePath = path.join(__dirname, `image_url_report_${timestamp}.json`);
        fs.writeFileSync(reportFilePath, JSON.stringify(report, null, 2));

        // Hiển thị kết quả
        console.log('\n===== BÁO CÁO KIỂM TRA URL HÌNH ẢNH =====');
        console.log(`Tổng số sách: ${stats.total}`);
        console.log(`URL hình ảnh hợp lệ: ${stats.valid} (${Math.round(stats.valid/stats.total*100)}%)`);
        console.log(`URL hình ảnh không hợp lệ: ${stats.invalid} (${Math.round(stats.invalid/stats.total*100)}%)`);
        console.log(`URL hình ảnh null: ${stats.null} (${Math.round(stats.null/stats.total*100)}%)`);
        console.log(`Tổng số URL có vấn đề: ${stats.invalid + stats.null} (${Math.round((stats.invalid + stats.null)/stats.total*100)}%)`);
        console.log(`Báo cáo chi tiết đã được lưu vào: ${reportFilePath}`);

        // Hiển thị một số URL không hợp lệ làm ví dụ
        if (invalidUrls.length > 0) {
            console.log('\nMột số ví dụ về URL không hợp lệ:');
            const examples = invalidUrls.slice(0, Math.min(5, invalidUrls.length));
            examples.forEach((item, index) => {
                console.log(`${index + 1}. Sách: "${item.title}"`);
                console.log(`   URL: ${item.image_url}`);
                console.log(`   Lý do: ${item.reason}`);
            });
            console.log(`...và ${invalidUrls.length - examples.length} URL không hợp lệ khác.`);
        }

        // Hiển thị một số URL null làm ví dụ
        if (nullUrls.length > 0) {
            console.log('\nMột số ví dụ về sách có URL null:');
            const examples = nullUrls.slice(0, Math.min(5, nullUrls.length));
            examples.forEach((item, index) => {
                console.log(`${index + 1}. Sách: "${item.title}" (ID: ${item.book_id})`);
            });
            console.log(`...và ${nullUrls.length - examples.length} sách có URL null khác.`);
        }

    } catch (error) {
        console.error('Lỗi trong quá trình kiểm tra:', error);
    } finally {
        // Đóng kết nối pool
        await pool.end();
        console.log('Quá trình kiểm tra hoàn tất.');
    }
}

// Thực thi hàm chính
checkAllImageUrls().catch(error => {
    console.error('Lỗi không xử lý được:', error);
    process.exit(1);
});