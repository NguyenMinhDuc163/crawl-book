/**
 * Chuẩn hóa chuỗi tiếng Việt thành dạng không dấu, chuyển đổi đ thành d và thay thế các ký tự đặc biệt bằng dấu gạch dưới.
 * Hữu ích cho việc tạo đường dẫn URL, tên file, hoặc các định danh an toàn.
 *
 * @param {string} str - Chuỗi cần chuẩn hóa
 * @returns {string} Chuỗi đã được chuẩn hóa
 */
function normalizeVietnameseString(str) {
    if (!str || typeof str !== 'string') {
        return '';
    }

    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')  // Chuyển đổi đ thành d
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
}

// Xuất hàm để sử dụng trong các file khác
module.exports = {
    normalizeVietnameseString
};