/**
 * Middleware xác thực JWT:
 * - verifyToken: yêu cầu đăng nhập (gắn req.userId + req.user)
 * - requireAdmin: yêu cầu quyền ADMIN (dùng sau verifyToken)
 */
const jwt = require('jsonwebtoken');
const prisma = require('../config/db');
const { isValidObjectId } = require('../utils/helpers');

const verifyToken = async (req, res, next) => {
  // Lấy JWT từ header đăng nhập.
  const header = req.headers['authorization'];

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(403).json({ error: 'Không tìm thấy Token. Vui lòng đăng nhập!' });
  }

  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET); // Kiểm chữ ký và thời hạn JWT.

    if (!isValidObjectId(decoded.userId)) {
      return res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn.' });
    }
    // Kiểm tra tài khoản hiện tại trong DB.
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) {
      return res.status(401).json({ error: 'Tài khoản không tồn tại.' });
    }
    if (user.status === 'BLOCKED') {
      return res.status(403).json({ error: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.' });
    }

    // [Dashboard] Controller dùng ID đã xác thực này để chỉ đọc dữ liệu của người đang đăng nhập.
    req.userId = user.id;
    req.user = user;
    // Xác thực thành công: chuyển request sang bước xử lý tiếp theo trong route.
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn.' });
  }
};

// Lưu ý: phải đặt SAU verifyToken
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Chức năng này chỉ dành cho quản trị viên.' });
  }
  next();
};

module.exports = { verifyToken, requireAdmin };
