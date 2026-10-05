const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// Chỉ cho phép user đăng nhập xem và cập nhật thông báo của chính mình.
router.use(verifyToken);

// Lấy danh sách, đánh dấu tất cả đã đọc, hoặc đánh dấu một thông báo theo id.
router.get('/', notificationController.getNotifications);
router.put('/read-all', notificationController.markAllAsRead);
router.put('/:id/read', notificationController.markAsRead);

module.exports = router;
