// File: book-crawler.js
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const {normalizeVietnameseString} = require("../utility/normalize");
const {extractStructuredText} = require("../utility/clean_html");

// URL cơ bản
const BASE_URL = 'https://gacsach.top';

// Headers để tránh bị block
const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'vi-VN,vi;q=0.9'
};

// ===== CẤU HÌNH CRAWLER =====
// CỜ BẬT/TẮT VIỆC LẤY TẤT CẢ
const FETCH_ALL = {
    files: false,        // true = lấy tất cả file, false = sử dụng FILE_RANGE
    booksPerFile: false, // true = lấy tất cả sách trong mỗi file, false = sử dụng BOOK_RANGE_PER_FILE
    books: false,       // true = lấy tất cả sách tổng thể, false = sử dụng BOOK_RANGE
    chapters: false     // true = lấy tất cả chương của mỗi sách, false = sử dụng CHAPTER_RANGE
};

// Khoảng file JSON cần xử lý (chỉ áp dụng khi FETCH_ALL.files = false)
const FILE_RANGE = {
    start: 0,  // File đầu tiên
    end: 1     // File thứ hai
};

// Khoảng sách cần lấy từ mỗi file (chỉ áp dụng khi FETCH_ALL.booksPerFile = false)
const BOOK_RANGE_PER_FILE = {
    start: 0,  // Sách đầu tiên trong file
    end: 2     // Sách thứ ba
};

// Khoảng sách tổng thể cần xử lý (chỉ áp dụng khi FETCH_ALL.books = false)
const BOOK_RANGE = {
    start: 0,  // Sách đầu tiên trong danh sách tổng
    end: 4     // Sách thứ năm
};

// Khoảng chương cần lấy cho mỗi sách (chỉ áp dụng khi FETCH_ALL.chapters = false)
const CHAPTER_RANGE = {
    start: 0,  // Chương đầu tiên
    end: 10     // Chương thứ ba
};

// Thời gian đợi giữa các request (đơn vị: ms)
const DELAY_BETWEEN_CHAPTERS = 1000; // 1 giây
const DELAY_BETWEEN_BOOKS = 1000;    // 1 giây

// ===== CẤU HÌNH ĐƯỜNG DẪN =====
// Thư mục lưu dữ liệu
const DATA_DIR = './gacsach_data/book_content';
const DESCRIPTION_DIR = './gacsach_data/description';
let dirTileBook = 'detail';

// Đảm bảo thư mục tồn tại
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Cắt mảng theo khoảng hoặc lấy tất cả tùy theo cờ
 * @param {Array} array - Mảng cần xử lý
 * @param {Object} range - Khoảng cần lấy (start, end)
 * @param {boolean} fetchAll - Cờ bật/tắt việc lấy tất cả
 * @returns {Array} Mảng kết quả
 */
function processArray(array, range, fetchAll) {
    if (!array || !Array.isArray(array)) return [];

    // Nếu bật cờ lấy tất cả, trả về toàn bộ mảng
    if (fetchAll) {
        return array;
    }

    // Nếu không, cắt mảng theo khoảng
    const start = range.start || 0;
    const end = range.end < 0 ? array.length : (range.end + 1 || array.length);

    return array.slice(start, end);
}

/**
 * Đọc tất cả các URL sách từ thư mục description
 * @returns {Array} Mảng chứa URL của tất cả sách và thông tin về file nguồn
 */
function readAllBookUrls() {
    try {
        // Kiểm tra thư mục tồn tại
        if (!fs.existsSync(DESCRIPTION_DIR)) {
            console.error(`Thư mục ${DESCRIPTION_DIR} không tồn tại!`);
            return [];
        }

        // Đọc tất cả file trong thư mục
        const files = fs.readdirSync(DESCRIPTION_DIR);
        const jsonFiles = files.filter(file => file.endsWith('.json'));

        // Xử lý danh sách file theo cờ và khoảng
        const filesToProcess = processArray(jsonFiles, FILE_RANGE, FETCH_ALL.files);

        console.log(`Tìm thấy ${jsonFiles.length} file JSON, sẽ xử lý ${filesToProcess.length} file`);
        if (FETCH_ALL.files) {
            console.log(`Đã bật chế độ lấy tất cả file`);
        } else {
            console.log(`Lấy file từ vị trí ${FILE_RANGE.start} đến ${FILE_RANGE.end < 0 ? 'cuối' : FILE_RANGE.end}`);
        }

        // Mảng chứa URL của tất cả sách và thông tin về file nguồn
        let allBookUrls = [];

        // Đọc từng file JSON
        for (const file of filesToProcess) {
            console.log(`\n========== Đang xử lý file: ${file} ==========`);
            const filePath = path.join(DESCRIPTION_DIR, file);
            const fileContent = fs.readFileSync(filePath, 'utf8');

            try {
                const booksData = JSON.parse(fileContent);

                if (Array.isArray(booksData)) {
                    // Xử lý danh sách sách trong file theo cờ và khoảng
                    const booksToProcess = processArray(booksData, BOOK_RANGE_PER_FILE, FETCH_ALL.booksPerFile);

                    // Lưu URL và thông tin file nguồn
                    const urlsWithSource = booksToProcess.map(book => ({
                        url: book.url,
                        title: book.title || 'Không có tiêu đề',
                        sourceFile: file
                    }));

                    allBookUrls = [...allBookUrls, ...urlsWithSource];
                    console.log(`Đã lấy ${urlsWithSource.length}/${booksData.length} URL sách từ file ${file}`);
                    if (FETCH_ALL.booksPerFile) {
                        console.log(`Đã bật chế độ lấy tất cả sách trong file`);
                    } else {
                        console.log(`Lấy sách từ vị trí ${BOOK_RANGE_PER_FILE.start} đến ${BOOK_RANGE_PER_FILE.end < 0 ? 'cuối' : BOOK_RANGE_PER_FILE.end}`);
                    }

                    // In ra 3 URL đầu tiên để kiểm tra
                    if (urlsWithSource.length > 0) {
                        console.log("Các URL sách đã lấy từ file:");
                        urlsWithSource.slice(0, Math.min(3, urlsWithSource.length)).forEach((item, idx) => {
                            console.log(`  ${idx+1}. ${item.title}: ${item.url}`);
                        });
                        if (urlsWithSource.length > 3) {
                            console.log(`  ... và ${urlsWithSource.length - 3} URL khác`);
                        }
                    }
                } else {
                    console.warn(`File ${file} không chứa mảng dữ liệu sách.`);
                }
            } catch (error) {
                console.error(`Lỗi khi phân tích file ${file}: ${error.message}`);
            }
        }

        console.log(`\nTổng cộng: ${allBookUrls.length} URL sách từ ${filesToProcess.length} file JSON`);
        return allBookUrls;
    } catch (error) {
        console.error(`Lỗi khi đọc thư mục description: ${error.message}`);
        return [];
    }
}

/**
 * Lấy thông tin chi tiết sách và danh sách chương từ URL
 * @param {string} bookUrl - URL của sách
 */
async function getBookDetails(bookUrl) {
    try {
        console.log(`Đang lấy thông tin sách từ: ${bookUrl}`);

        // Đảm bảo URL đầy đủ
        const fullUrl = bookUrl.startsWith('http') ? bookUrl : `${BASE_URL}${bookUrl}`;

        // Tải HTML
        const response = await axios.get(fullUrl, { headers });
        const html = response.data;

        // Phân tích HTML
        const $ = cheerio.load(html);

        // Lấy thông tin cơ bản
        const title = $('.page-title').text().trim();
        const author = $('.field-name-field-author .field-item a').text().trim();
        const category = $('.field-name-field-mucsach .field-item a').text().trim();
        const status = $('.field-name-field-status .field-item').text().trim();
        const coverImage = $('.field-name-field-image img').attr('src');
        const description = $('.field-name-body .field-item').text().trim();
        const rating = $('.fivestar-summary-average-count .average-rating span').text().trim();
        const votes = $('.fivestar-summary-average-count .total-votes span').text().trim();
        const views = $('.ovnmeta .count').text().replace('lần xem', '').trim();

        // Lấy danh sách chương - thử cả hai phương thức
        const chapters = [];

        // Phương thức 1: Tìm thông qua menu
        const bookNavId = $('div[id^="book-navigation-"]').attr('id');
        console.log(`Đã tìm thấy book navigation ID: ${bookNavId || 'không tìm thấy'}`);

        if (bookNavId) {
            // Thử phương pháp 1: Tìm trong menu
            $(`#${bookNavId} .menu li a`).each((index, element) => {
                const chapterTitle = $(element).text().trim();
                const chapterUrl = $(element).attr('href');

                if (chapterUrl) {
                    chapters.push({
                        title: chapterTitle,
                        url: chapterUrl.startsWith('http') ? chapterUrl : `${BASE_URL}${chapterUrl}`,
                        index: index + 1
                    });
                }
            });

            // Nếu không tìm thấy trong menu, thử phương pháp 2: Tìm trong select
            if (chapters.length === 0) {
                console.log("Không tìm thấy chương trong menu, thử tìm trong select...");
                $(`#${bookNavId} select option`).each((index, element) => {
                    const chapterTitle = $(element).text().trim();
                    const chapterValue = $(element).attr('value');

                    // Bỏ qua option đầu tiên và option sách chính
                    if (index > 1 && chapterValue) {
                        // Trích xuất URL từ giá trị option
                        const urlParts = chapterValue.split('::');
                        if (urlParts.length === 2) {
                            const chapterUrl = urlParts[1];

                            // Loại bỏ dấu -- ở đầu tiêu đề nếu có
                            const cleanTitle = chapterTitle.replace(/^-+\s*/, '');

                            chapters.push({
                                title: cleanTitle,
                                url: chapterUrl,
                                index: index - 1
                            });
                        }
                    }
                });
            }
        }

        console.log(`Tìm thấy ${chapters.length} chương`);

        // Tổng hợp thông tin sách
        const bookInfo = {
            title,
            author,
            category,
            status,
            coverImage: coverImage ? (coverImage.startsWith('http') ? coverImage : `${BASE_URL}${coverImage}`) : null,
            description,
            rating,
            votes,
            views,
            totalChapters: chapters.length,
            chapters
        };

        // Lưu thông tin sách vào file
        const safeTitle = normalizeVietnameseString(title);
        const bookDir = path.join(DATA_DIR, safeTitle);

        // Kiểm tra và tạo thư mục nếu chưa tồn tại
        if (!fs.existsSync(bookDir)) {
            fs.mkdirSync(bookDir, { recursive: true });
            console.log(`Đã tạo thư mục mới: ${bookDir}`);
        }

        const filePath = path.join(bookDir, `book_${safeTitle}.json`);

        fs.writeFileSync(filePath, JSON.stringify(bookInfo, null, 2), 'utf8');

        // luu tên thư mục sách
        dirTileBook = normalizeVietnameseString(title);
        console.log(`Đã lưu thông tin sách "${title}" vào ${filePath}`);
        console.log(`Tổng số chương: ${chapters.length}`);

        return bookInfo;
    } catch (error) {
        console.error(`Lỗi khi lấy thông tin sách: ${error.message}`);
        return null;
    }
}

/**
 * Lấy nội dung của một chương cụ thể
 * @param {string} chapterUrl - URL của chương
 */
async function getChapterContent(chapterUrl) {
    try {
        console.log(`Đang lấy nội dung chương từ: ${chapterUrl}`);

        // Đảm bảo URL đầy đủ
        const fullUrl = chapterUrl.startsWith('http') ? chapterUrl : `${BASE_URL}${chapterUrl}`;

        // Tải HTML
        const response = await axios.get(fullUrl, { headers });
        const html = response.data;

        // Phân tích HTML
        const $ = cheerio.load(html);

        // Lấy thông tin chương
        const title = $('.page-title').text().trim();
        // const content = $('.field-name-body .field-item').html();
        const content = extractStructuredText($('.field-name-body .field-item').html());
        // Lấy link chương trước/sau (nếu có)
        let nextChapter = null;
        let prevChapter = null;

        $('.page-links a.page-next').each((index, element) => {
            nextChapter = $(element).attr('href');
            if (nextChapter && !nextChapter.startsWith('http')) {
                nextChapter = `${BASE_URL}${nextChapter}`;
            }
        });

        $('.page-links a.page-previous').each((index, element) => {
            prevChapter = $(element).attr('href');
            if (prevChapter && !prevChapter.startsWith('http')) {
                prevChapter = `${BASE_URL}${prevChapter}`;
            }
        });

        // Tổng hợp thông tin chương
        const chapterInfo = {
            title,
            url: fullUrl,
            content,
            nextChapter,
            prevChapter
        };

        // Xử lý tiêu đề chương để tạo tên file an toàn
        const safeChapterTitle = normalizeVietnameseString(title);

        // Tạo đường dẫn thư mục cho sách
        const bookDir = path.join(DATA_DIR, dirTileBook);

        // Kiểm tra và tạo thư mục nếu chưa tồn tại
        if (!fs.existsSync(bookDir)) {
            fs.mkdirSync(bookDir, { recursive: true });
            console.log(`Đã tạo thư mục mới: ${bookDir}`);
        }

        // Lưu nội dung chương vào file trong thư mục của sách
        const filePath = path.join(bookDir, `chapter_${safeChapterTitle}.json`);
        fs.writeFileSync(filePath, JSON.stringify(chapterInfo, null, 2), 'utf8');

        console.log(`Đã lưu nội dung chương "${title}" vào ${filePath}`);

        return chapterInfo;

    } catch (error) {
        console.error(`Lỗi khi lấy nội dung chương: ${error.message}`);
        return null;
    }
}

/**
 * Lấy thông tin chi tiết sách và nội dung các chương
 * @param {string} bookUrl - URL của sách
 */
async function crawlBookAndChapters(bookUrl) {
    try {
        // Lấy thông tin sách
        const bookInfo = await getBookDetails(bookUrl);

        if (!bookInfo) {
            console.error('Không thể lấy thông tin sách.');
            return null;
        }

        // Xử lý danh sách chương theo cờ và khoảng
        const chaptersToFetch = processArray(bookInfo.chapters, CHAPTER_RANGE, FETCH_ALL.chapters);

        console.log(`Bắt đầu lấy nội dung ${chaptersToFetch.length}/${bookInfo.chapters.length} chương`);
        if (FETCH_ALL.chapters) {
            console.log(`Đã bật chế độ lấy tất cả chương`);
        } else {
            console.log(`Lấy chương từ vị trí ${CHAPTER_RANGE.start} đến ${CHAPTER_RANGE.end < 0 ? 'cuối' : CHAPTER_RANGE.end}`);
        }

        // Lấy nội dung từng chương
        const chaptersWithContent = [];

        for (const chapter of chaptersToFetch) {
            const chapterContent = await getChapterContent(chapter.url);

            if (chapterContent) {
                chaptersWithContent.push(chapterContent);
            }

            // Delay để tránh bị chặn
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_CHAPTERS));
        }

        // Cập nhật thông tin sách với nội dung chương
        bookInfo.chapters = chaptersWithContent;

        console.log(`Đã lưu thông tin sách với nội dung ${chaptersWithContent.length} chương`);

        return bookInfo;
    } catch (error) {
        console.error(`Lỗi khi crawl sách và các chương: ${error.message}`);
        return null;
    }
}

/**
 * Hàm chính để chạy crawler với nhiều sách
 */
async function main() {
    try {
        console.log("=== CẤU HÌNH CRAWLER ===");
        console.log(`- Chế độ lấy tất cả:`);
        console.log(`  + File: ${FETCH_ALL.files ? 'Bật' : 'Tắt'}`);
        console.log(`  + Sách mỗi file: ${FETCH_ALL.booksPerFile ? 'Bật' : 'Tắt'}`);
        console.log(`  + Sách tổng thể: ${FETCH_ALL.books ? 'Bật' : 'Tắt'}`);
        console.log(`  + Chương: ${FETCH_ALL.chapters ? 'Bật' : 'Tắt'}`);
        if (!FETCH_ALL.files) {
            console.log(`- Khoảng file: từ ${FILE_RANGE.start} đến ${FILE_RANGE.end < 0 ? 'cuối' : FILE_RANGE.end}`);
        }
        if (!FETCH_ALL.booksPerFile) {
            console.log(`- Khoảng sách mỗi file: từ ${BOOK_RANGE_PER_FILE.start} đến ${BOOK_RANGE_PER_FILE.end < 0 ? 'cuối' : BOOK_RANGE_PER_FILE.end}`);
        }
        if (!FETCH_ALL.books) {
            console.log(`- Khoảng sách tổng thể: từ ${BOOK_RANGE.start} đến ${BOOK_RANGE.end < 0 ? 'cuối' : BOOK_RANGE.end}`);
        }
        if (!FETCH_ALL.chapters) {
            console.log(`- Khoảng chương: từ ${CHAPTER_RANGE.start} đến ${CHAPTER_RANGE.end < 0 ? 'cuối' : CHAPTER_RANGE.end}`);
        }
        console.log(`- Thời gian chờ: ${DELAY_BETWEEN_CHAPTERS}ms (chương), ${DELAY_BETWEEN_BOOKS}ms (sách)`);

        // Đọc tất cả URL sách từ thư mục description
        const allBookUrls = readAllBookUrls();

        if (allBookUrls.length === 0) {
            console.log('Không tìm thấy URL sách nào để xử lý.');
            return;
        }

        // Xử lý danh sách sách tổng thể theo cờ và khoảng
        const booksToProcess = processArray(allBookUrls, BOOK_RANGE, FETCH_ALL.books);

        console.log(`\nBắt đầu xử lý ${booksToProcess.length}/${allBookUrls.length} sách`);
        if (FETCH_ALL.books) {
            console.log(`Đã bật chế độ lấy tất cả sách tổng thể`);
        } else {
            console.log(`Lấy sách từ vị trí ${BOOK_RANGE.start} đến ${BOOK_RANGE.end < 0 ? 'cuối' : BOOK_RANGE.end}`);
        }

        // Xử lý từng sách một
        for (let i = 0; i < booksToProcess.length; i++) {
            const book = booksToProcess[i];
            console.log(`\n[${i+1}/${booksToProcess.length}] Đang xử lý sách: ${book.title}`);
            console.log(`URL: ${book.url}`);
            console.log(`Nguồn: ${book.sourceFile}`);

            // Crawl sách và các chương
            await crawlBookAndChapters(book.url);

            // Delay giữa các sách để tránh bị chặn
            if (i < booksToProcess.length - 1) {
                console.log(`Đợi ${DELAY_BETWEEN_BOOKS}ms trước khi xử lý sách tiếp theo...`);
                await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BOOKS));
            }
        }

        console.log('\nĐã hoàn thành việc xử lý sách!');
    } catch (error) {
        console.error(`Lỗi khi chạy crawler: ${error.message}`);
    }
}

// Chạy crawler
main();

// Export các hàm để có thể sử dụng từ các module khác
module.exports = {
    getBookDetails,
    getChapterContent,
    crawlBookAndChapters,
    readAllBookUrls,
    main
};