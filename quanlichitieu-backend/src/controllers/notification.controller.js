const prisma = require('../config/db');

// GET /api/notifications
// Cron đã lưu kết quả thanh toán vào Notification; API trả tối đa 50 bản ghi gần nhất.
exports.getNotifications = async (req, res, next) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50 // Giới hạn dữ liệu trả về để danh sách không quá lớn.
    });
    res.json(notifications);
  } catch (error) {
    next(error);
  }
};

// Đánh dấu một thông báo đã đọc. Bản ghi vẫn được giữ để xem lại lịch sử.
exports.markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await prisma.notification.findFirst({
      where: { id, userId: req.user.id }
    });

    if (!existing) {
      return res.status(404).json({ message: 'Không tìm thấy thông báo' });
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { isRead: true }
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
};

// Khi người dùng mở chuông, frontend gọi API này để đánh dấu tất cả là đã đọc.
exports.markAllAsRead = async (req, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, isRead: false },
      data: { isRead: true }
    });
    res.json({ message: 'Đã đánh dấu đọc tất cả' });
  } catch (error) {
    next(error);
  }
};
