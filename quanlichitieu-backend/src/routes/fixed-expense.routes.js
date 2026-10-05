const express = require('express');
const router = express.Router();
const fixedExpenseController = require('../controllers/fixed-expense.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// Tất cả API chi cố định đều yêu cầu JWT hợp lệ.
// verifyToken tìm user từ token rồi gắn vào req.user/req.userId cho controller dùng.
router.use(verifyToken);

// /api/fixed-expenses
// GET  : lấy danh sách lịch chi của user.
// POST : tạo một lịch chi mới.
router.route('/')
  .get(fixedExpenseController.getFixedExpenses)
  .post(fixedExpenseController.createFixedExpense);

// /api/fixed-expenses/:id
// PUT    : cập nhật lịch theo id.
// DELETE : xóa lịch theo id.
router.route('/:id')
  .put(fixedExpenseController.updateFixedExpense)
  .delete(fixedExpenseController.deleteFixedExpense);

module.exports = router;
