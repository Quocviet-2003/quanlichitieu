const express = require('express');
const router = express.Router();
const savingController = require('../controllers/saving.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// Giải thích: Tất cả API tiết kiệm phải xác thực JWT trước khi xử lý.
// verifyToken gắn ID người đăng nhập vào req.userId.
router.use(verifyToken);

router.get('/', savingController.getSavingsGoals);
router.post('/', savingController.createSavingsGoal);
// B9: Nhận POST /api/savings/:id/deposit và chuyển sang depositToGoal.
// :id là ID của mục tiêu tiết kiệm cần nhận tiền.
router.post('/:id/deposit', savingController.depositToGoal);
router.put('/:id', savingController.updateSavingsGoal);
router.delete('/:id', savingController.deleteSavingsGoal);

module.exports = router;
