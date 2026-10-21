const express = require('express');
const router = express.Router();
const statsController = require('../controllers/stats.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// [Dashboard] Mọi API thống kê phải xác thực trước khi chạy controller.
router.use(verifyToken);

// GET /api/stats/summary gọi getSummary để tính các thẻ tổng quan.
router.get('/summary', statsController.getSummary);
router.get('/monthly', statsController.getMonthlyTrend);
// /categories trả cơ cấu theo danh mục; /trend trả thu/chi từng ngày cho biểu đồ.
router.get('/categories', statsController.getCategoryBreakdown);
router.get('/trend', statsController.getDailyTrend);

module.exports = router;
