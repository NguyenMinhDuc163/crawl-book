const fs = require('fs');
const path = require('path');
const db = require('./db-config');

// Đường dẫn thư mục chứa dữ liệu sách theo từng thể loại
const CATEGORIES_DIR = 'E:\\ky8\\mobile\\crawl\\crawl\\gacsach_data\\description';

// Chỉ định một file cụ thể để import (để trống nếu muốn import tất cả)
const SPECIFIC_FILE = '';

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

// Hàm chuẩn hóa trạng thái sách
function normalizeStatus(status) {
    if (!status) return 'Pending';

    // Chuyển đổi status thành một trong các giá trị hợp lệ: 'Full', 'Updating', 'Pending'
    const statusLower = status.toLowerCase();
    if (statusLower === 'full' || statusLower.includes('full')) {
        return 'Full';
    } else if (statusLower === 'updating' || statusLower.includes('updating')) {
        return 'Updating';
    } else {
        return 'Pending';
    }
}

// Hàm chính để import sách
async function importBooks() {
    try {
        log('Bắt đầu import dữ liệu sách', 'info');

        // Kiểm tra thư mục tồn tại
        if (!fs.existsSync(CATEGORIES_DIR)) {
            log(`Thư mục ${CATEGORIES_DIR} không tồn tại!`, 'error');
            return;
        }

        // Kết nối với database
        const client = await db.getClient();
        log('Đã kết nối tới database', 'success');

        try {
            // Lấy danh sách các thể loại từ database
            const categoryResult = await client.query('SELECT category_id, name, url FROM categories');
            const categories = categoryResult.rows;
            log(`Đã tìm thấy ${categories.length} thể loại trong database`, 'info');

            // Tạo map để dễ tra cứu category_id từ tên category
            const categoryMap = {};
            categories.forEach(cat => {
                categoryMap[cat.name] = cat.category_id;

                // Tạo slug từ URL để có thể map với tên file
                const slugFromUrl = cat.url.split('/').pop();
                if (slugFromUrl) {
                    categoryMap[slugFromUrl] = cat.category_id;
                }
            });

            // Danh sách các file sẽ xử lý
            let filesToProcess = [];

            if (SPECIFIC_FILE) {
                // Nếu chỉ định một file cụ thể
                const specificFilePath = path.join(CATEGORIES_DIR, SPECIFIC_FILE);
                if (fs.existsSync(specificFilePath)) {
                    filesToProcess.push(specificFilePath);
                } else {
                    log(`File ${specificFilePath} không tồn tại!`, 'error');
                    return;
                }
            } else {
                // Lấy tất cả file JSON trong thư mục
                const files = fs.readdirSync(CATEGORIES_DIR);
                filesToProcess = files
                    .filter(file => file.endsWith('.json') && file !== 'all_categories.json')
                    .map(file => path.join(CATEGORIES_DIR, file));
            }

            log(`Tìm thấy ${filesToProcess.length} file dữ liệu sách cần xử lý`, 'info');

            if (filesToProcess.length === 0) {
                log('Không tìm thấy file dữ liệu phù hợp để import! Hãy kiểm tra lại đường dẫn và mẫu tên file.', 'error');
                return;
            }

            let totalBooks = 0;
            let totalSuccess = 0;
            let totalUpdated = 0;
            let totalError = 0;

            // Xử lý từng file một
            for (let fileIndex = 0; fileIndex < filesToProcess.length; fileIndex++) {
                const filePath = filesToProcess[fileIndex];
                const fileName = path.basename(filePath);

                log(`\n[${fileIndex + 1}/${filesToProcess.length}] Đang xử lý file: ${fileName}`, 'info');

                // Đọc và parse dữ liệu JSON
                let fileData;
                try {
                    fileData = fs.readFileSync(filePath, 'utf8');
                } catch (error) {
                    log(`Không thể đọc file ${filePath}: ${error.message}`, 'error');
                    continue;
                }

                let books;
                try {
                    books = JSON.parse(fileData);
                    log(`Đã đọc thành công: Tìm thấy ${books.length} sách trong file`, 'success');

                    // Kiểm tra cấu trúc dữ liệu
                    if (books.length > 0 && !books[0].title) {
                        log('Cấu trúc dữ liệu không phải là danh sách sách, bỏ qua file này', 'warning');
                        continue;
                    }
                } catch (error) {
                    log(`Không thể parse nội dung JSON: ${error.message}`, 'error');
                    continue;
                }

                totalBooks += books.length;

                // Xác định category_id từ tên file
                let defaultCategoryId = null;
                const fileNameWithoutExt = fileName.replace('.json', '').replace('books_', '');

                // Thử tìm category từ tên file hoặc tìm thể loại phù hợp nhất
                for (const cat of categories) {
                    const catName = cat.name.toLowerCase();
                    const catSlug = cat.url.split('/').pop() || '';

                    if (categoryMap[fileNameWithoutExt] ||
                        fileNameWithoutExt.includes(catSlug) ||
                        catSlug.includes(fileNameWithoutExt) ||
                        fileNameWithoutExt.includes(catName.replace(/ /g, '_')) ||
                        catName.includes(fileNameWithoutExt.replace(/_/g, ' '))) {
                        defaultCategoryId = cat.category_id;
                        log(`Đã tìm thấy thể loại phù hợp cho file ${fileName}: ${cat.name} (ID: ${defaultCategoryId})`, 'info');
                        break;
                    }
                }

                // Nếu vẫn không tìm thấy, lấy category_id đầu tiên
                if (!defaultCategoryId) {
                    defaultCategoryId = categories[0].category_id;
                    log(`Không tìm thấy thể loại phù hợp cho file ${fileName}, sử dụng thể loại mặc định (ID: ${defaultCategoryId})`, 'warning');
                }

                let fileSuccess = 0;
                let fileUpdated = 0;
                let fileError = 0;

                // Import từng sách một và xử lý riêng từng transaction
                for (let i = 0; i < books.length; i++) {
                    const book = books[i];

                    // Bắt đầu transaction mới cho mỗi sách
                    try {
                        await client.query('BEGIN');

                        // Xác định category_id
                        let categoryId;

                        if (book.category && categoryMap[book.category]) {
                            // Nếu có category trong dữ liệu sách và tìm thấy trong database
                            categoryId = categoryMap[book.category];
                        } else {
                            // Sử dụng category mặc định từ tên file
                            categoryId = defaultCategoryId;
                        }

                        // Chuẩn hóa status để phù hợp với check constraint
                        const normalizedStatus = normalizeStatus(book.status);

                        // Kiểm tra xem sách đã tồn tại chưa
                        const checkResult = await client.query(
                            'SELECT book_id FROM books WHERE url = $1',
                            [book.url]
                        );

                        // Trước tiên, kiểm tra và thêm tác giả nếu chưa tồn tại
                        let authorId;
                        const authorName = book.author || 'Không xác định';

                        const authorResult = await client.query(
                            'SELECT author_id FROM authors WHERE name = $1',
                            [authorName]
                        );

                        if (authorResult.rows.length === 0) {
                            // Tác giả chưa tồn tại, thêm mới
                            const newAuthorResult = await client.query(
                                'INSERT INTO authors(name) VALUES($1) RETURNING author_id',
                                [authorName]
                            );
                            authorId = newAuthorResult.rows[0].author_id;
                            log(`Đã thêm tác giả mới: "${authorName}" với ID: ${authorId}`, 'success');
                        } else {
                            authorId = authorResult.rows[0].author_id;
                        }

                        if (checkResult.rows.length > 0) {
                            // Sách đã tồn tại, update
                            const updateResult = await client.query(
                                `UPDATE books SET 
                  title = $1, 
                  image_url = $2, 
                  author_id = $3, 
                  excerpt = $4, 
                  views = $5, 
                  status = $6, 
                  rating = $7, 
                  category_id = $8,
                  updated_at = CURRENT_TIMESTAMP
                WHERE url = $9 RETURNING book_id`,
                                [
                                    book.title,
                                    book.image,
                                    authorId,
                                    book.excerpt || null,
                                    parseInt(book.views || '0', 10),
                                    normalizedStatus,
                                    book.rating || null,
                                    categoryId,
                                    book.url
                                ]
                            );

                            fileUpdated++;
                            totalUpdated++;
                            log(`[${i+1}/${books.length}] 🔄 Đã cập nhật sách "${book.title}" (ID: ${checkResult.rows[0].book_id})`, 'info');
                        } else {
                            // Sách chưa tồn tại, insert mới
                            const insertResult = await client.query(
                                `INSERT INTO books(
                  title, url, image_url, author_id, excerpt, 
                  views, status, rating, category_id
                ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING book_id`,
                                [
                                    book.title,
                                    book.url,
                                    book.image,
                                    authorId,
                                    book.excerpt || null,
                                    parseInt(book.views || '0', 10),
                                    normalizedStatus,
                                    book.rating || null,
                                    categoryId
                                ]
                            );

                            fileSuccess++;
                            totalSuccess++;
                            log(`[${i+1}/${books.length}] ✅ Đã thêm mới sách "${book.title}" (ID: ${insertResult.rows[0].book_id})`, 'success');
                        }

                        // Commit transaction nếu mọi thứ OK
                        await client.query('COMMIT');

                    } catch (error) {
                        // Rollback transaction nếu có lỗi
                        await client.query('ROLLBACK');

                        fileError++;
                        totalError++;
                        log(`[${i+1}/${books.length}] ❌ Lỗi khi xử lý sách "${book.title || 'không tiêu đề'}": ${error.message}`, 'error');
                    }
                }

                // Hiển thị thống kê cho file này
                log(`\n--- Kết quả xử lý file ${fileName} ---`, 'info');
                log(`✅ Thêm mới: ${fileSuccess}`, 'success');
                log(`🔄 Cập nhật: ${fileUpdated}`, 'info');
                log(`❌ Lỗi: ${fileError}`, 'error');
                log(`Tổng số sách đã xử lý: ${books.length}`, 'info');
            }

            // Kiểm tra tổng số sách sau khi import
            const countResult = await client.query('SELECT COUNT(*) FROM books');
            const totalBooksInDB = parseInt(countResult.rows[0].count);

            // Hiển thị thống kê tổng thể
            log('\n=== KẾT QUẢ IMPORT SÁCH ===', 'info');
            log(`📚 Tổng số sách đã xử lý: ${totalBooks}`, 'info');
            log(`✅ Thêm mới thành công: ${totalSuccess}`, 'success');
            log(`🔄 Cập nhật: ${totalUpdated}`, 'info');
            log(`❌ Lỗi: ${totalError}`, 'error');
            log(`Tổng số sách trong database: ${totalBooksInDB}`, 'info');

        } catch (error) {
            log(`Lỗi trong quá trình xử lý: ${error.message}`, 'error');
            console.error(error.stack);
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
importBooks().then(() => {
    log('Chương trình đã kết thúc', 'info');
}).catch(error => {
    log(`Lỗi chương trình: ${error.message}`, 'error');
    console.error(error.stack);
});