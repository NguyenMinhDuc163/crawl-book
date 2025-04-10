// File: category-crawler.js
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// URL cơ bản
const BASE_URL = 'https://gacsach.top';
const jsonFilePath = path.resolve(__dirname, 'gacsach_data/categories', 'all_categories.json');
// Đọc dữ liệu từ file JSON
const categories = readJsonFile(jsonFilePath);

// Headers để tránh bị block
const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'vi-VN,vi;q=0.9'
};

// Thư mục lưu dữ liệu
const DATA_DIR = './gacsach_data';
const pageLimit = 5;
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


        const bookDir = path.join(DATA_DIR, 'description');

        // Kiểm tra và tạo thư mục nếu chưa tồn tại
        if (!fs.existsSync(bookDir)) {
            fs.mkdirSync(bookDir, { recursive: true });
            console.log(`Đã tạo thư mục mới: ${bookDir}`);
        }


        const filePath = path.join(bookDir, `${fileName}.json`);
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
        $('.expanded a[href^="/thu-vien-sach"] + ul .leaf a').each((index, element) => {
            const categoryName = $(element).text().trim();
            let categoryUrl = $(element).attr('href');

            if (categoryName && categoryUrl) {
                // Đảm bảo URL đầy đủ
                if (!categoryUrl.startsWith('http')) {
                    categoryUrl = `${BASE_URL}${categoryUrl}`;
                }

                categories.push({
                    name: categoryName,
                    url: categoryUrl
                });
            }
        });

        console.log(`Đã tìm thấy ${categories.length} thể loại sách`);
        saveJSON(categories, 'categories');

        return categories;
    } catch (error) {
        console.error(`Lỗi khi lấy danh sách thể loại: ${error.message}`);
        return [];
    }
}

/**
 * Lấy danh sách sách từ trang danh mục cụ thể
 * @param {string} categoryUrl - URL của trang danh mục
 * @param {string} categoryName - Tên danh mục
 * @param {number} pageLimit - Số trang tối đa cần crawl
 */
async function getBooksFromCategory(categoryUrl, categoryName) {
    try {
        console.log(`Đang lấy sách từ danh mục: ${categoryName}`);
        const allBooks = [];

        // Xử lý tên file an toàn
        const safeCategoryName = categoryName.toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, '_');

        for (let page = 0; page < pageLimit; page++) {
            const pageUrl = page === 0 ? categoryUrl : `${categoryUrl}?page=${page}`;
            const html = await fetchHTML(pageUrl);
            if (!html) break;

            // // Lưu HTML trang danh mục
            // saveHTML(html, `category_${safeCategoryName}_page${page + 1}`);

            const $ = cheerio.load(html);
            const booksOnPage = [];

            // Kiểm tra xem còn sách không
            const hasBooks = $('.views-row').length > 0;
            if (!hasBooks) {
                console.log(`Không còn sách ở trang ${page + 1}`);
                break;
            }

            // Lọc thông tin sách từ trang
            $('.views-row').each((index, element) => {
                const bookEl = $(element);

                const title = bookEl.find('.tvtitle a').text().trim();
                const url = bookEl.find('.tvtitle a').attr('href');
                const image = bookEl.find('.tvimg img').attr('src');
                const author = bookEl.find('.tvauthor a').text().trim();
                const excerpt = bookEl.find('.tvbody').text().trim();
                const viewsText = bookEl.find('.tvdetail').text().match(/(\d[\d\.,]+)\s+views/);
                const views = viewsText ? viewsText[1] : '0';
                const status = bookEl.find('.tvdetail').text().includes('Full') ? 'Full' : 'Đang ra';
                const rating = bookEl.find('.tvvote .clearfix').text().trim();

                if (title && url) {
                    booksOnPage.push({
                        title,
                        url: url.startsWith('http') ? url : `${BASE_URL}${url}`,
                        image: image ? (image.startsWith('http') ? image : `${BASE_URL}${image}`) : null,
                        author,
                        excerpt,
                        views,
                        status,
                        rating,
                        category: categoryName
                    });
                }
            });

            console.log(`Đã tìm thấy ${booksOnPage.length} sách ở trang ${page + 1}`);
            allBooks.push(...booksOnPage);

            // Kiểm tra có trang tiếp theo không
            const hasNextPage = $('.pager-next').length > 0;
            if (!hasNextPage) {
                console.log('Đã hết trang');
                break;
            }

            // Delay để tránh quá tải server
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        console.log(`Tổng cộng đã lấy được ${allBooks.length} sách từ danh mục ${categoryName}`);

        // Lưu danh sách sách vào file JSON
        saveJSON(allBooks, `books_${safeCategoryName}`);

        return allBooks;
    } catch (error) {
        console.error(`Lỗi khi lấy sách từ danh mục ${categoryName}: ${error.message}`);
        return [];
    }
}

/**
 * Hàm chính để crawl một danh mục cụ thể
 * @param {string} categoryName - Tên danh mục cần crawl
 * @param {number} pageLimit - Số trang tối đa cần crawl
 */
async function crawlCategory(categoryName) {
    console.log(`Bắt đầu crawl danh mục: ${categoryName}`);

    // 1. Lấy danh sách các thể loại
    const categories = await getCategories();

    // 2. Tìm thể loại cần crawl
    const category = categories.find(cat =>
        cat.name.toLowerCase() === categoryName.toLowerCase());

    if (!category) {
        console.error(`Không tìm thấy danh mục: ${categoryName}`);
        return null;
    }

    // 3. Crawl sách từ danh mục đó
    const books = await getBooksFromCategory(category.url, category.name);

    console.log(`Hoàn thành crawl danh mục: ${categoryName}`);
    return books;
}

/**
 * Hàm crawl một URL danh mục cụ thể
 * @param {string} categoryUrl - URL danh mục
 * @param {string} categoryName - Tên danh mục
 * @param {number} pageLimit - Số trang tối đa cần crawl
 */


async function crawlCategoryUrl(categoryUrl, categoryName) {
    console.log(`Bắt đầu crawl danh mục từ URL: ${categoryUrl}`);

    // Đảm bảo URL đầy đủ
    const fullUrl = categoryUrl.startsWith('http') ? categoryUrl : `${BASE_URL}${categoryUrl}`;

    // Crawl sách từ URL danh mục
    const books = await getBooksFromCategory(fullUrl, categoryName);

    console.log(`Hoàn thành crawl danh mục từ URL: ${categoryUrl}`);
    return books;
}

function readJsonFile(filePath) {
    try {
        const rawData = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(rawData);
    } catch (error) {
        console.error('Lỗi khi đọc file JSON:', error.message);
        throw error;
    }
}

// Đường dẫn đến file JSON chứa thông tin các danh mục
// Hàm crawl tất cả các danh mục với số trang giới hạn
async function crawlAllCategories(categories, pageLimit = 2) {
    const results = {};

    for (const category of categories) {
        console.log(`Bắt đầu crawl danh mục: ${category.name}`);
        try {
            const books = await crawlCategoryUrl(
                category.url.replace('https://gacsach.top', ''), // Lấy phần path từ URL
                category.name,
                pageLimit
            );

            results[category.name] = books;
            console.log(`Đã lấy tổng cộng ${books ? books.length : 0} sách từ danh mục ${category.name}`);
        } catch (error) {
            console.error(`Lỗi khi crawl danh mục ${category.name}:`, error.message);
        }
    }

    return results;
}




// Chạy crawler cho danh mục "Văn học Việt Nam"
// crawlCategoryUrl(
//     '/thu-vien-sach/van-hoc-viet-nam',
//     'Văn học Việt Nam',
//     2 // Giới hạn 2 trang để test
// ).then(books => {
//     console.log(`Đã lấy tổng cộng ${books ? books.length : 0} sách từ danh mục Văn học Việt Nam`);
// }).catch(error => {
//     console.error('Lỗi khi crawl danh mục:', error.message);
// });




crawlAllCategories(categories, 2)
    .then(results => {
        console.log('Hoàn tất crawl tất cả danh mục');

        // Lưu kết quả vào file hoặc xử lý tiếp
        fs.writeFileSync('crawl_results.json', JSON.stringify(results, null, 2));
    })
    .catch(error => {
        console.error('Lỗi khi crawl tất cả danh mục:', error.message);
    });
// Export các hàm để có thể sử dụng từ module khác
module.exports = {
    getCategories,
    getBooksFromCategory,
    crawlCategory,
    crawlCategoryUrl
};