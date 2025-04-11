// File: book-crawler.js
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const {normalizeVietnameseString} = require("../utility/normalize");

// URL cơ bản
const BASE_URL = 'https://gacsach.top';

// Headers để tránh bị block
const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'vi-VN,vi;q=0.9'
};

// Thư mục lưu dữ liệu
const DATA_DIR = './gacsach_data/book_content';
let chapterLimit = 0;
let dirTileBook = 'detail';

// Đảm bảo thư mục tồn tại
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
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

        // Lấy danh sách chương
        const chapters = [];
        const bookNavId = $('div[id^="book-navigation-"]').attr('id');
        console.log(`=====> ${bookNavId}`)
        $('#' + bookNavId + ' .menu li a').each((index, element) => {
            const chapterTitle = $(element).text().trim();
            const chapterUrl = $(element).attr('href');

            chapters.push({
                title: chapterTitle,
                url: chapterUrl.startsWith('http') ? chapterUrl : `${BASE_URL}${chapterUrl}`,
                index: index + 1
            });
        });

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
        const safeTitle = normalizeVietnameseString(title)
        const bookDir = path.join(DATA_DIR, safeTitle);


        // Kiểm tra và tạo thư mục nếu chưa tồn tại
        if (!fs.existsSync(bookDir)) {
            fs.mkdirSync(bookDir, { recursive: true });
            console.log(`Đã tạo thư mục mới: ${bookDir}`);
        }

        const filePath = path.join(bookDir, `book_${safeTitle}.json`);

        fs.writeFileSync(filePath, JSON.stringify(bookInfo, null, 2), 'utf8');

        // luu so luong chappeter
        chapterLimit = 3;
        dirTileBook = normalizeVietnameseString(title)
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
        const content = $('.field-name-body .field-item').html();

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

        // // Lưu nội dung chương vào file
        // const safeTitle = title.toLowerCase()
        //     .normalize('NFD')
        //     .replace(/[\u0300-\u036f]/g, '')
        //     .replace(/[^a-z0-9]+/g, '_')
        //     .replace(/_+/g, '_')
        //     .replace(/^_+|_+$/g, '');
        // console.log(`======> ${title}`)
        // const filePath = path.join(DATA_DIR, `chapter_${safeTitle}.json`);
        // fs.writeFileSync(filePath, JSON.stringify(chapterInfo, null, 2), 'utf8');
        //
        // console.log(`Đã lưu nội dung chương "${title}" vào ${filePath}`);

        // Xử lý tiêu đề chương để tạo tên file an toàn
        const safeChapterTitle = normalizeVietnameseString(title)

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
 * @param {number} chapterLimit - Số lượng chương tối đa cần lấy (0 = tất cả)
 */
async function crawlBookAndChapters(bookUrl) {
    try {
        // Lấy thông tin sách
        const bookInfo = await getBookDetails(bookUrl);

        if (!bookInfo) {
            console.error('Không thể lấy thông tin sách.');
            return null;
        }

        // Kiểm tra xem có cần lấy nội dung chương không
        if (chapterLimit === 0) {
            return bookInfo;
        }

        // Lấy danh sách chương cần crawl
        const chaptersToFetch = chapterLimit > 0 ?
            bookInfo.chapters.slice(0, chapterLimit) :
            bookInfo.chapters;

        console.log(`Bắt đầu lấy nội dung ${chaptersToFetch.length} chương...`);

        // Lấy nội dung từng chương
        const chaptersWithContent = [];

        for (const chapter of chaptersToFetch) {
            const chapterContent = await getChapterContent(chapter.url);

            if (chapterContent) {
                chaptersWithContent.push(chapterContent);
            }

            // Delay để tránh bị chặn
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Cập nhật thông tin sách với nội dung chương
        bookInfo.chapters = chaptersWithContent;

        /// TODO tam thoi khoa:  Lưu thông tin sách đã cập nhật
        // const safeTitle = bookInfo.title.toLowerCase()
        //     .normalize('NFD')
        //     .replace(/[\u0300-\u036f]/g, '')
        //     .replace(/\s+/g, '_');
        // const filePath = path.join(DATA_DIR, `book_${safeTitle}_with_chapters.json`);
        // fs.writeFileSync(filePath, JSON.stringify(bookInfo, null, 2), 'utf8');

        console.log(`Đã lưu thông tin sách với nội dung ${chaptersWithContent.length} `);

        return bookInfo;
    } catch (error) {
        throw error;
        console.error(`Lỗi khi crawl sách và các chương: ${error.message}`);
        return null;
    }
}

// Thông tin sách cần lấy
const testBookUrl = '/bach-luyen-thanh-than-c_an-tu-giai-thoat.full';

// Lấy 3 chương đầu tiên để test
crawlBookAndChapters(testBookUrl)
    .then(result => {
        if (result) {
            console.log('Hoàn thành việc crawl sách và các chương!');
        } else {
            console.error('Lỗi khi crawl sách và các chương!');
        }
    })
    .catch(error => {
        console.error(`Lỗi: ${error.message}`);
    });

// Export các hàm để có thể sử dụng từ các module khác
module.exports = {
    getBookDetails,
    getChapterContent,
    crawlBookAndChapters
};