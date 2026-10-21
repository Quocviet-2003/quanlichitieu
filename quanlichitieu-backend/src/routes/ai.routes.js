const express = require('express');
const router = express.Router();
const aiController = require('../controllers/ai.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// Đăng nhập trước khi xử lý phân tích chi tiêu.
router.post('/ai-insights', verifyToken, aiController.getInsights);
router.post('/ai-chat', verifyToken, aiController.chat);

module.exports = router;
