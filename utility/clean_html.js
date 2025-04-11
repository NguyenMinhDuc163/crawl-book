// html-cleaner.js
const cheerio = require('cheerio');

/**
 * Làm sạch nội dung HTML, chuyển thành văn bản thuần túy
 * @param {string} html - Chuỗi HTML cần làm sạch
 * @param {Object} options - Tùy chọn làm sạch
 * @param {boolean} options.keepParagraphs - Có giữ lại dấu xuống dòng giữa các đoạn không (mặc định: true)
 * @param {boolean} options.keepLinks - Có giữ lại thông tin link không (mặc định: false)
 * @param {boolean} options.keepImages - Có giữ lại thông tin hình ảnh không (mặc định: false)
 * @returns {string} Văn bản đã làm sạch
 */
function cleanHtml(html, options = {}) {
    if (!html) return '';

    // Thiết lập các tùy chọn mặc định
    const {
        keepParagraphs = true,
        keepLinks = false,
        keepImages = false
    } = options;

    try {
        // Tạo một đối tượng DOM từ HTML
        const $ = cheerio.load(html);

        // Xóa các thẻ script và style
        $('script, style').remove();

        // Xử lý links nếu cần
        if (keepLinks) {
            $('a').each(function() {
                const href = $(this).attr('href');
                if (href) {
                    $(this).append(` [${href}]`);
                }
            });
        }

        // Xử lý hình ảnh nếu cần
        if (keepImages) {
            $('img').each(function() {
                const alt = $(this).attr('alt') || 'image';
                const src = $(this).attr('src') || '';
                $(this).replaceWith(`[${alt}: ${src}]`);
            });
        } else {
            $('img').remove();
        }

        // Thay thế các thẻ br bằng xuống dòng
        $('br').replaceWith('\n');

        // Nếu giữ lại đoạn, thêm xuống dòng sau mỗi đoạn
        if (keepParagraphs) {
            $('p, div, h1, h2, h3, h4, h5, h6, li').each(function() {
                $(this).append('\n\n');
            });
        }

        // Lấy văn bản và làm sạch khoảng trắng thừa
        let text = $.text();

        // Xử lý văn bản
        text = text
            .replace(/\n{3,}/g, '\n\n') // Giảm xuống dòng liên tiếp xuống còn 2
            .replace(/\s+/g, ' ') // Thay thế nhiều khoảng trắng bằng 1 khoảng trắng
            .replace(/ \n/g, '\n') // Xóa khoảng trắng trước xuống dòng
            .replace(/\n /g, '\n') // Xóa khoảng trắng sau xuống dòng
            .trim(); // Xóa khoảng trắng ở đầu và cuối

        return text;
    } catch (error) {
        console.error('Lỗi khi làm sạch HTML:', error.message);
        // Trường hợp lỗi, trả về một phiên bản đơn giản bằng cách xóa tất cả thẻ HTML
        return html.replace(/<[^>]*>/g, '').trim();
    }
}

/**
 * Trích xuất văn bản thuần túy từ HTML
 * @param {string} html - Chuỗi HTML
 * @returns {string} Văn bản thuần túy
 */
function extractText(html) {
    return cleanHtml(html, { keepParagraphs: false });
}

/**
 * Trích xuất nội dung văn bản có cấu trúc từ HTML
 * @param {string} html - Chuỗi HTML
 * @returns {string} Văn bản có cấu trúc (giữ lại đoạn)
 */
function extractStructuredText(html) {
    return cleanHtml(html, { keepParagraphs: true });
}

/**
 * Trích xuất văn bản và giữ lại link
 * @param {string} html - Chuỗi HTML
 * @returns {string} Văn bản có thông tin link
 */
function extractTextWithLinks(html) {
    return cleanHtml(html, { keepLinks: true });
}

/**
 * Trích xuất văn bản và giữ lại thông tin hình ảnh
 * @param {string} html - Chuỗi HTML
 * @returns {string} Văn bản có thông tin hình ảnh
 */
function extractTextWithImages(html) {
    return cleanHtml(html, { keepImages: true });
}

module.exports = {
    cleanHtml,
    extractText,
    extractStructuredText,
    extractTextWithLinks,
    extractTextWithImages
};