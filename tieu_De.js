// File: category-scraper.js
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

// Tạo thư mục nếu chưa tồn tại
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`Đã tạo thư mục ${DATA_DIR}`);
}

/**
 * Tải HTML từ URL
 * @param {string} url - URL cần tải
 */
async function fetchHTML(url) {
    try {
        console.log(`Đang tải trang: ${url}`);
        const response = await axios.get(url, { headers });
        return response.data;
    } catch (error) {
        console.error(`Lỗi khi tải trang ${url}: ${error.message}`);
        return null;
    }
}

/**
 * Lưu dữ liệu vào file JSON
 * @param {Object} data - Dữ liệu cần lưu
 * @param {string} fileName - Tên file để lưu
 */
function saveJSON(data, fileName) {
    try {
        const filePath = path.join(DATA_DIR, `${fileName}.json`);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        console.log(`Đã lưu dữ liệu vào file: ${filePath}`);
        return filePath;
    } catch (error) {
        console.error(`Lỗi khi lưu file JSON: ${error.message}`);
        return null;
    }
}

/**
 * Lấy danh sách thể loại từ trang chủ
 */
async function getCategories() {
    try {
        const html = await fetchHTML(BASE_URL);
        if (!html) return [];

        const $ = cheerio.load(html);
        const categories = [];

        // Lấy danh mục từ menu thư viện sách
        $('li.expanded > ul.menu > li.leaf > a').each((index, element) => {
            const categoryName = $(element).text().trim();
            let categoryUrl = $(element).attr('href');
            const categoryTitle = $(element).attr('title') || categoryName;

            if (categoryName && categoryUrl) {
                // Đảm bảo URL đầy đủ
                if (!categoryUrl.startsWith('http')) {
                    categoryUrl = `${BASE_URL}${categoryUrl}`;
                }

                categories.push({
                    name: categoryName,
                    title: categoryTitle,
                    url: categoryUrl
                });
            }
        });

        console.log(`Đã tìm thấy ${categories.length} thể loại sách`);
        saveJSON(categories, 'all_categories');

        return categories;
    } catch (error) {
        console.error(`Lỗi khi lấy danh sách thể loại: ${error.message}`);
        return [];
    }
}

/**
 * Chạy crawler
 */
async function runCrawler() {
    try {
        console.log('Bắt đầu crawl danh sách thể loại sách...');
        const categories = await getCategories();
        console.log(`Đã crawl thành công ${categories.length} thể loại sách.`);

        // In danh sách để kiểm tra
        console.log('Danh sách URL thể loại sách:');
        categories.forEach((category, index) => {
            console.log(`${index + 1}. ${category.url} - ${category.name}`);
        });

        return categories;
    } catch (error) {
        console.error('Lỗi khi chạy crawler:', error.message);
        return [];
    }
}

// Chạy crawler
runCrawler()
    .then(categories => {
        console.log('Hoàn thành crawl danh sách thể loại.');
    })
    .catch(error => {
        console.error('Lỗi:', error.message);
    });

// Export các hàm để có thể sử dụng từ module khác
module.exports = {
    getCategories,
    runCrawler
};