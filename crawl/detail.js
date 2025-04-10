// File: chapter-extractor.js
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// URL cơ bản
const BASE_URL = 'https://gacsach.top';

// Headers để tránh bị block
const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'vi-VN,vi;q=0.9'
};

// Thư mục lưu dữ liệu
const DATA_DIR = './gacsach_data';

/**
 * Đảm bảo thư mục tồn tại
 */
function ensureDirectoryExists() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        console.log(`Đã tạo thư mục ${DATA_DIR}`);
    }
}

/**
 * Tạo tên file an toàn từ chuỗi
 * @param {string} text - Chuỗi cần chuyển đổi
 * @returns {string} - Tên file an toàn
 */
function createSafeFileName(text) {
    return text.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
}

/**
 * Lấy nội dung thuần văn bản từ HTML
 * @param {string} html - Nội dung HTML
 * @returns {string} - Nội dung thuần văn bản
 */
function extractTextFromHtml(html) {
    if (!html) return '';

    // Sử dụng cheerio để xóa các thẻ HTML và giữ lại văn bản
    const $ = cheerio.load(html);

    // Xử lý các thẻ <p> để giữ lại xuống dòng
    $('p').after('\n\n');

    // Xử lý các thẻ <br> để giữ lại xuống dòng
    $('br').replaceWith('\n');

    // Lấy nội dung văn bản
    let text = $.text();

    // Xóa khoảng trắng thừa và dòng trống
    text = text.replace(/\n{3,}/g, '\n\n'); // Thay thế nhiều dòng trống liên tiếp bằng 2 dòng trống
    text = text.replace(/\s+/g, ' ').trim(); // Xóa khoảng trắng thừa

    return text;
}

/**
 * Lấy nội dung của một chương
 * @param {string} chapterUrl - URL của chương
 * @returns {Promise<Object|null>} - Thông tin chương hoặc null nếu có lỗi
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
        const contentHtml = $('.field-name-body .field-item').html();

        // Lấy nội dung thuần văn bản
        const contentText = extractTextFromHtml($('.field-name-body .field-item').html());

        // Lấy link chương trước/sau
        let nextChapter = null;
        $('.page-links a.page-next').each((index, element) => {
            nextChapter = $(element).attr('href');
            if (nextChapter && !nextChapter.startsWith('http')) {
                nextChapter = `${BASE_URL}${nextChapter}`;
            }
        });

        let prevChapter = null;
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
            content: contentText,
            htmlContent: contentHtml, // Giữ lại nội dung HTML nếu cần
            nextChapter,
            prevChapter
        };

        return chapterInfo;
    } catch (error) {
        console.error(`Lỗi khi lấy nội dung chương: ${error.message}`);
        return null;
    }
}

/**
 * Lấy nội dung sách và các chương
 * @param {string} bookUrl - URL của sách
 * @param {number} chapterLimit - Số lượng chương tối đa cần lấy (0 = tất cả)
 * @returns {Promise<Object|null>} - Thông tin sách với nội dung các chương
 */
async function getBookChapters(bookUrl, chapterLimit = 0) {
    try {
        // Đảm bảo thư mục tồn tại
        ensureDirectoryExists();

        console.log(`Đang lấy thông tin sách từ: ${bookUrl}`);

        // Đảm bảo URL đầy đủ
        const fullBookUrl = bookUrl.startsWith('http') ? bookUrl : `${BASE_URL}${bookUrl}`;

        // Tải HTML trang sách
        const response = await axios.get(fullBookUrl, { headers });
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

        console.log(`Đã lấy thông tin sách: ${title}`);

        // Lấy danh sách chương
        const chapterLinks = [];
        $('#book-navigation-1434175 .menu li a').each((index, element) => {
            const chapterTitle = $(element).text().trim();
            const chapterUrl = $(element).attr('href');

            if (chapterTitle && chapterUrl) {
                chapterLinks.push({
                    title: chapterTitle,
                    url: chapterUrl.startsWith('http') ? chapterUrl : `${BASE_URL}${chapterUrl}`
                });
            }
        });

        console.log(`Đã tìm thấy ${chapterLinks.length} chương`);

        // Giới hạn số lượng chương nếu cần
        const chaptersToFetch = chapterLimit > 0 ?
            chapterLinks.slice(0, chapterLimit) :
            chapterLinks;

        console.log(`Sẽ lấy nội dung ${chaptersToFetch.length} chương`);

        // Lấy nội dung từng chương
        const chaptersWithContent = [];

        for (let i = 0; i < chaptersToFetch.length; i++) {
            const chapter = chaptersToFetch[i];
            const chapterInfo = await getChapterContent(chapter.url);

            if (chapterInfo) {
                chaptersWithContent.push(chapterInfo);

                // Lưu từng chương riêng biệt
                const safeChapterTitle = createSafeFileName(chapterInfo.title);
                const chapterFilePath = path.join(DATA_DIR, `chapter_${safeChapterTitle}.json`);
                fs.writeFileSync(chapterFilePath, JSON.stringify(chapterInfo, null, 2), 'utf8');
                console.log(`Đã lưu chương ${i + 1}/${chaptersToFetch.length}: ${chapterFilePath}`);
            }

            // Delay để tránh bị chặn
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Tổng hợp thông tin sách
        const bookInfo = {
            title,
            author,
            category,
            status,
            coverImage: coverImage ? (coverImage.startsWith('http') ? coverImage : `${BASE_URL}${coverImage}`) : null,
            description,
            totalChapters: chapterLinks.length,
            chapters: chaptersWithContent
        };

        // Lưu thông tin sách
        const safeTitle = createSafeFileName(title);
        const bookFilePath = path.join(DATA_DIR, `book_${safeTitle}.json`);
        fs.writeFileSync(bookFilePath, JSON.stringify(bookInfo, null, 2), 'utf8');
        console.log(`Đã lưu thông tin sách với ${chaptersWithContent.length} chương vào: ${bookFilePath}`);

        return bookInfo;
    } catch (error) {
        console.error(`Lỗi khi lấy thông tin sách và các chương: ${error.message}`);
        return null;
    }
}

/**
 * Lấy nội dung một chương từ URL trực tiếp
 * @param {string} chapterUrl - URL của chương
 * @returns {Promise<Object|null>} - Thông tin chương hoặc null nếu có lỗi
 */
async function getSingleChapter(chapterUrl) {
    try {
        // Đảm bảo thư mục tồn tại
        ensureDirectoryExists();

        // Lấy nội dung chương
        const chapterInfo = await getChapterContent(chapterUrl);

        if (chapterInfo) {
            // Lưu chương
            const safeChapterTitle = createSafeFileName(chapterInfo.title);
            const chapterFilePath = path.join(DATA_DIR, `chapter_${safeChapterTitle}.json`);
            fs.writeFileSync(chapterFilePath, JSON.stringify(chapterInfo, null, 2), 'utf8');
            console.log(`Đã lưu chương: ${chapterFilePath}`);

            return chapterInfo;
        }

        return null;
    } catch (error) {
        console.error(`Lỗi khi lấy nội dung chương: ${error.message}`);
        return null;
    }
}

// Ví dụ sử dụng: Lấy nội dung của một chương cụ thể
const singleChapterUrl = '/doc-online/cay-chuoi-non-di-giay-xanh-chuong-1-01';
getSingleChapter(singleChapterUrl)
    .then(chapterInfo => {
        if (chapterInfo) {
            console.log('Lấy nội dung chương thành công!');
            console.log('Tiêu đề:', chapterInfo.title);
            // Hiển thị một phần nội dung để kiểm tra
            console.log('Nội dung (một phần):', chapterInfo.content.substring(0, 200) + '...');
        } else {
            console.error('Không thể lấy nội dung chương!');
        }
    })
    .catch(error => {
        console.error(`Lỗi: ${error.message}`);
    });

// Ví dụ sử dụng: Lấy sách và 3 chương đầu tiên
const bookUrl = '/cay-chuoi-non-di-giay-xanh_nguyen-nhat-anh.full';
getBookChapters(bookUrl, 3)
    .then(bookInfo => {
        if (bookInfo) {
            console.log('Lấy sách và các chương thành công!');
        } else {
            console.error('Không thể lấy sách!');
        }
    })
    .catch(error => {
        console.error(`Lỗi: ${error.message}`);
    });

// Export các hàm để có thể sử dụng từ các module khác
module.exports = {
    getChapterContent,
    getBookChapters,
    getSingleChapter
};