/**
 * Xử lý lỗi tập trung cho toàn bộ ứng dụng:
 * - notFoundHandler: bắt đường dẫn không tồn tại -> 404 JSON
 * - errorHandler: mọi lỗi ném ra từ controller/middleware -> JSON { error }
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({ error: `Không tìm thấy đường dẫn: ${req.method} ${req.originalUrl}` });
};

const errorHandler = (err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Dữ liệu gửi lên không đúng định dạng.' });
  }

  const status = err.status || 500;
  if (status >= 500) console.error('[LỖI MÁY CHỦ]', err);

  res.status(status).json({
    error: err.message || 'Lỗi máy chủ không xác định.',
    ...(err.code ? { code: err.code } : {}),
  });
};

module.exports = { notFoundHandler, errorHandler };
