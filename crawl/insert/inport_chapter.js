const fs = require('fs');
const path = require('path');
const db = require('./db-config');

// Đường dẫn thư mục chứa dữ liệu chương sách
const BOOKS_CONTENT_DIR = 'E:\\ky8\\mobile\\crawl\\crawl\\gacsach_data\\book_content';

// Chỉ định một thư mục sách cụ thể để import (để trống nếu muốn import tất cả)
const SPECIFIC_BOOK_DIR = ''; // Ví dụ: 'ban_ve_tu_do'

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

// Hàm chính để import các chương sách
async function importChapters() {
    try {
        log('Bắt đầu import dữ liệu chương sách', 'info');

        // Kiểm tra thư mục tồn tại
        if (!fs.existsSync(BOOKS_CONTENT_DIR)) {
            log(`Thư mục ${BOOKS_CONTENT_DIR} không tồn tại!`, 'error');
            return;
        }

        // Kết nối với database
        const client = await db.getClient();
        log('Đã kết nối tới database', 'success');

        try {
            // Lấy danh sách tất cả sách từ database
            const booksResult = await client.query('SELECT book_id, title, url FROM books');
            const books = booksResult.rows;
            log(`Đã tìm thấy ${books.length} sách trong database`, 'info');

            // In ra một số sách đầu tiên để kiểm tra
            log('Mẫu một số sách đầu tiên trong database:', 'info');
            books.slice(0, 5).forEach((book, index) => {
                log(`${index + 1}. ID: ${book.book_id}, Title: "${book.title}", URL: ${book.url}`, 'info');
            });

            // Tạo map để dễ tra cứu book_id từ url và title
            const bookMap = {};
            const bookMapByTitle = {};
            const bookMapBySlug = {};

            books.forEach(book => {
                // Lưu trữ theo URL đầy đủ
                bookMap[book.url] = {id: book.book_id, title: book.title};

                // Lưu trữ theo tiêu đề (lowercase)
                const titleLower = book.title.toLowerCase();
                bookMapByTitle[titleLower] = {id: book.book_id, title: book.title};

                // Lưu trữ theo slug từ URL
                // Mẫu 1: ban-ve-tu-do_john-stuart-mill.full
                const fullSlug = book.url.split('/').pop();
                if (fullSlug) {
                    bookMapBySlug[fullSlug] = {id: book.book_id, title: book.title};

                    // Mẫu 2: ban-ve-tu-do
                    const simplifiedSlug = fullSlug.split('_')[0].replace('.full', '');
                    if (simplifiedSlug) {
                        bookMapBySlug[simplifiedSlug] = {id: book.book_id, title: book.title};
                    }

                    // Mẫu 3: ban_ve_tu_do (thay gạch ngang bằng gạch dưới)
                    const underscoreSlug = simplifiedSlug.replace(/-/g, '_');
                    if (underscoreSlug) {
                        bookMapBySlug[underscoreSlug] = {id: book.book_id, title: book.title};
                    }
                }
            });

            // Danh sách các thư mục sách sẽ xử lý
            let bookDirsToProcess = [];

            if (SPECIFIC_BOOK_DIR) {
                // Nếu chỉ định một thư mục sách cụ thể
                const specificBookDirPath = path.join(BOOKS_CONTENT_DIR, SPECIFIC_BOOK_DIR);
                if (fs.existsSync(specificBookDirPath) && fs.lstatSync(specificBookDirPath).isDirectory()) {
                    bookDirsToProcess.push(specificBookDirPath);
                } else {
                    log(`Thư mục ${specificBookDirPath} không tồn tại hoặc không phải là thư mục!`, 'error');
                    return;
                }
            } else {
                // Lấy tất cả thư mục con trong thư mục chứa nội dung sách
                const dirs = fs.readdirSync(BOOKS_CONTENT_DIR);
                bookDirsToProcess = dirs
                    .filter(dir => {
                        const fullPath = path.join(BOOKS_CONTENT_DIR, dir);
                        return fs.existsSync(fullPath) && fs.lstatSync(fullPath).isDirectory();
                    })
                    .map(dir => path.join(BOOKS_CONTENT_DIR, dir));
            }

            log(`Tìm thấy ${bookDirsToProcess.length} thư mục sách cần xử lý`, 'info');

            if (bookDirsToProcess.length === 0) {
                log('Không tìm thấy thư mục sách nào để import! Hãy kiểm tra lại đường dẫn.', 'error');
                return;
            }

            // In ra danh sách thư mục sẽ xử lý
            log('Danh sách thư mục sách cần xử lý:', 'info');
            bookDirsToProcess.forEach((dirPath, index) => {
                log(`${index + 1}. ${path.basename(dirPath)}`, 'info');
            });

            let totalChapters = 0;
            let totalSuccess = 0;
            let totalUpdated = 0;
            let totalError = 0;
            let totalSkipped = 0;
            let skippedBooks = 0;

            // Xử lý từng thư mục sách một
            for (let bookDirIndex = 0; bookDirIndex < bookDirsToProcess.length; bookDirIndex++) {
                const bookDirPath = bookDirsToProcess[bookDirIndex];
                const bookDirName = path.basename(bookDirPath);

                log(`\n[${bookDirIndex + 1}/${bookDirsToProcess.length}] Đang xử lý thư mục sách: ${bookDirName}`, 'info');

                // Xác định book_id dựa trên tên thư mục sách
                let bookId = null;
                let bookTitle = null;

                // 1. Tìm theo slug chính xác
                if (bookMapBySlug[bookDirName]) {
                    bookId = bookMapBySlug[bookDirName].id;
                    bookTitle = bookMapBySlug[bookDirName].title;
                    log(`Tìm thấy sách dựa trên slug chính xác: "${bookTitle}" (ID: ${bookId})`, 'success');
                }
                // 2. Tìm kiếm theo tiêu đề
                else {
                    // Thay thế dấu gạch dưới bằng khoảng trắng để so sánh với tiêu đề
                    const possibleTitle = bookDirName.replace(/_/g, ' ');

                    if (bookMapByTitle[possibleTitle.toLowerCase()]) {
                        bookId = bookMapByTitle[possibleTitle.toLowerCase()].id;
                        bookTitle = bookMapByTitle[possibleTitle.toLowerCase()].title;
                        log(`Tìm thấy sách dựa trên tiêu đề: "${bookTitle}" (ID: ${bookId})`, 'success');
                    }
                    // 3. Tìm kiếm trong tất cả các sách cho trường hợp tên thư mục là một phần của slug hoặc tiêu đề
                    else {
                        // Thử tìm sách có slug hoặc tiêu đề chứa tên thư mục
                        for (const book of books) {
                            const titleLower = book.title.toLowerCase();
                            const dirNameNormalized = bookDirName.replace(/_/g, ' ').toLowerCase();
                            const bookSlug = book.url.split('/').pop().replace('.full', '').toLowerCase();

                            if (titleLower.includes(dirNameNormalized) ||
                                dirNameNormalized.includes(titleLower) ||
                                bookSlug.includes(bookDirName.toLowerCase()) ||
                                bookDirName.toLowerCase().includes(bookSlug)) {
                                bookId = book.book_id;
                                bookTitle = book.title;
                                log(`Đã tìm thấy sách phù hợp: "${bookTitle}" (ID: ${bookId})`, 'success');
                                break;
                            }
                        }

                        if (!bookId) {
                            log(`Không tìm thấy sách tương ứng với thư mục "${bookDirName}"`, 'warning');

                            // Debug: In ra tất cả slug để kiểm tra
                            log('Danh sách một số slug trong database:', 'info');
                            Object.keys(bookMapBySlug).slice(0, 10).forEach((slug, index) => {
                                log(`${index + 1}. Slug: ${slug} -> Book: "${bookMapBySlug[slug].title}"`, 'info');
                            });

                            skippedBooks++;
                            continue;
                        }
                    }
                }

                // Lấy danh sách tất cả file JSON trong thư mục sách
                const files = fs.readdirSync(bookDirPath);
                const chapterFiles = files.filter(file => file.endsWith('.json'));

                log(`Tìm thấy ${chapterFiles.length} file chương trong thư mục của sách "${bookTitle}"`, 'info');

                if (chapterFiles.length === 0) {
                    log(`Không tìm thấy file chương nào trong thư mục ${bookDirPath}, bỏ qua sách này`, 'warning');
                    skippedBooks++;
                    continue;
                }

                totalChapters += chapterFiles.length;

                // Đếm số chương hiện có của sách này
                const existingChaptersResult = await client.query(
                    'SELECT COUNT(*) FROM chapters WHERE book_id = $1',
                    [bookId]
                );
                const existingChaptersCount = parseInt(existingChaptersResult.rows[0].count);
                log(`Hiện có ${existingChaptersCount} chương của sách "${bookTitle}" trong database`, 'info');

                let bookSuccessCount = 0;
                let bookUpdatedCount = 0;
                let bookErrorCount = 0;
                let bookSkippedCount = 0;

                // Sắp xếp file chương theo số thứ tự nếu có thể
                chapterFiles.sort((a, b) => {
                    // Bỏ qua file book_ khi sắp xếp (để đặt ở đầu tiên)
                    if (a.startsWith('book_')) return -1;
                    if (b.startsWith('book_')) return 1;

                    // Thử trích xuất số chương từ tên file
                    const aMatch = a.match(/chapter_.*?_(\d+)/);
                    const bMatch = b.match(/chapter_.*?_(\d+)/);

                    if (aMatch && bMatch) {
                        return parseInt(aMatch[1], 10) - parseInt(bMatch[1], 10);
                    }

                    // Nếu không tìm được mẫu số chương, sắp xếp theo tên
                    return a.localeCompare(b);
                });

                // Import từng file chương
                for (let chapterIndex = 0; chapterIndex < chapterFiles.length; chapterIndex++) {
                    const chapterFile = chapterFiles[chapterIndex];
                    const chapterFilePath = path.join(bookDirPath, chapterFile);

                    // Xử lý đặc biệt cho file book_*.json
                    if (chapterFile.startsWith('book_')) {
                        log(`[${chapterIndex+1}/${chapterFiles.length}] ⚠️ Bỏ qua file giới thiệu sách: ${chapterFile}`, 'warning');
                        bookSkippedCount++;
                        totalSkipped++;
                        continue;
                    }

                    // Xử lý transaction riêng cho mỗi chương
                    try {
                        await client.query('BEGIN');

                        // Đọc và parse dữ liệu JSON của chương
                        let chapterData;
                        try {
                            chapterData = fs.readFileSync(chapterFilePath, 'utf8');
                        } catch (error) {
                            throw new Error(`Không thể đọc file ${chapterFilePath}: ${error.message}`);
                        }

                        let chapter;
                        try {
                            chapter = JSON.parse(chapterData);
                        } catch (error) {
                            throw new Error(`Không thể parse nội dung JSON: ${error.message}`);
                        }

                        // Kiểm tra xem trường URL có tồn tại
                        if (!chapter.url) {
                            log(`[${chapterIndex+1}/${chapterFiles.length}] ⚠️ File ${chapterFile} thiếu trường URL, bỏ qua`, 'warning');
                            bookSkippedCount++;
                            totalSkipped++;
                            await client.query('ROLLBACK');
                            continue;
                        }

                        // Kiểm tra xem chương đã tồn tại chưa
                        const checkResult = await client.query(
                            'SELECT chapter_id FROM chapters WHERE url = $1',
                            [chapter.url]
                        );

                        if (checkResult.rows.length > 0) {
                            // Chương đã tồn tại, update
                            const updateResult = await client.query(
                                `UPDATE chapters SET 
                  title = $1, 
                  content = $2, 
                  next_chapter_url = $3, 
                  prev_chapter_url = $4,
                  updated_at = CURRENT_TIMESTAMP
                WHERE url = $5 RETURNING chapter_id`,
                                [
                                    chapter.title,
                                    chapter.content,
                                    chapter.nextChapter || null,
                                    chapter.prevChapter || null,
                                    chapter.url
                                ]
                            );

                            bookUpdatedCount++;
                            totalUpdated++;
                            log(`[${chapterIndex+1}/${chapterFiles.length}] 🔄 Đã cập nhật chương "${chapter.title}" (ID: ${checkResult.rows[0].chapter_id})`, 'info');
                        } else {
                            // Chương chưa tồn tại, insert mới
                            const insertResult = await client.query(
                                `INSERT INTO chapters(
                  book_id, title, url, content, next_chapter_url, 
                  prev_chapter_url, chapter_order
                ) VALUES($1, $2, $3, $4, $5, $6, $7) RETURNING chapter_id`,
                                [
                                    bookId,
                                    chapter.title,
                                    chapter.url,
                                    chapter.content,
                                    chapter.nextChapter || null,
                                    chapter.prevChapter || null,
                                    chapterIndex  // chapter_order bắt đầu từ 0 (trừ đi các file book_)
                                ]
                            );

                            bookSuccessCount++;
                            totalSuccess++;
                            log(`[${chapterIndex+1}/${chapterFiles.length}] ✅ Đã thêm mới chương "${chapter.title}" (ID: ${insertResult.rows[0].chapter_id})`, 'success');
                        }

                        // Commit transaction nếu mọi thứ OK
                        await client.query('COMMIT');

                    } catch (error) {
                        // Rollback transaction nếu có lỗi
                        await client.query('ROLLBACK');

                        bookErrorCount++;
                        totalError++;
                        log(`[${chapterIndex+1}/${chapterFiles.length}] ❌ Lỗi khi xử lý file ${chapterFile}: ${error.message}`, 'error');
                    }
                }

                // Hiển thị thống kê cho sách này
                log(`\n--- Kết quả xử lý sách "${bookTitle}" ---`, 'info');
                log(`✅ Thêm mới: ${bookSuccessCount}`, 'success');
                log(`🔄 Cập nhật: ${bookUpdatedCount}`, 'info');
                log(`❌ Lỗi: ${bookErrorCount}`, 'error');
                log(`⚠️ Bỏ qua: ${bookSkippedCount}`, 'warning');
                log(`Tổng số file đã xử lý: ${chapterFiles.length}`, 'info');

                // Cập nhật lại số chương sau khi import
                const newChaptersCountResult = await client.query(
                    'SELECT COUNT(*) FROM chapters WHERE book_id = $1',
                    [bookId]
                );
                const newChaptersCount = parseInt(newChaptersCountResult.rows[0].count);
                log(`Số lượng chương của sách này sau khi import: ${newChaptersCount} (thêm mới ${newChaptersCount - existingChaptersCount})`, 'info');
            }

            // Kiểm tra tổng số chương sau khi import
            const totalChaptersResult = await client.query('SELECT COUNT(*) FROM chapters');
            const totalChaptersInDB = parseInt(totalChaptersResult.rows[0].count);

            // Hiển thị thống kê tổng thể
            log('\n=== KẾT QUẢ IMPORT CHƯƠNG SÁCH ===', 'info');
            log(`📚 Tổng số file chương đã xử lý: ${totalChapters}`, 'info');
            log(`✅ Thêm mới thành công: ${totalSuccess}`, 'success');
            log(`🔄 Cập nhật: ${totalUpdated}`, 'info');
            log(`❌ Lỗi: ${totalError}`, 'error');
            log(`⚠️ Bỏ qua: ${totalSkipped} file`, 'warning');
            log(`⚠️ Bỏ qua: ${skippedBooks} sách`, 'warning');
            log(`Tổng số chương trong database: ${totalChaptersInDB}`, 'info');

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
importChapters().then(() => {
    log('Chương trình đã kết thúc', 'info');
}).catch(error => {
    log(`Lỗi chương trình: ${error.message}`, 'error');
    console.error(error.stack);
});