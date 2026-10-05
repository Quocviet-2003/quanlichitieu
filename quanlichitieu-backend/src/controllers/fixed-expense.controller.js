const prisma = require('../config/db');

// GET /api/fixed-expenses
// Chỉ lấy lịch của user đang đăng nhập và xếp lịch mới tạo lên trước.
exports.getFixedExpenses = async (req, res, next) => {
  try {
    const fixedExpenses = await prisma.fixedExpense.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' }
    });
    res.json(fixedExpenses);
  } catch (error) {
    next(error);
  }
};
// POST /api/fixed-expenses

exports.createFixedExpense = async (req, res, next) => {
  try {
    // req.body là object JSON frontend gửi từ apiCreateFixedExpense().
    const { amount, category, description, deductDay } = req.body;
    // Dữ liệu từ form có thể là chuỗi nên cần đổi về số trước khi kiểm tra/lưu.
    const parsedAmount = parseFloat(amount);
    const parsedDeductDay = parseInt(deductDay) || 1;


    if (!category || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ message: 'Vui lòng nhập số tiền hợp lệ (lớn hơn 0) và danh mục.' });
    }
    if (parsedDeductDay < 1 || parsedDeductDay > 31) {
      return res.status(400).json({ message: 'Ngày trừ tiền phải từ 1 đến 31.' });
    }

    // Gắn userId lấy từ token để lịch của mỗi người dùng được tách riêng.
    const fixedExpense = await prisma.fixedExpense.create({
      data: {
        userId: req.user.id,
        amount: parsedAmount,
        category,
        description,
        deductDay: parsedDeductDay
      }
    });


    res.status(201).json(fixedExpense);
  } catch (error) {
    next(error);
  }
};

// PUT /api/fixed-expenses/:id
// Cho phép sửa một phần dữ liệu của lịch chi.
exports.updateFixedExpense = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { amount, category, description, deductDay } = req.body;

    // Kiểm tra đồng thời id và userId để user không sửa lịch của người khác.
    const existing = await prisma.fixedExpense.findFirst({
      where: { id, userId: req.user.id }
    });

    if (!existing) {
      return res.status(404).json({ message: 'Không tìm thấy khoản chi cố định' });
    }

    let parsedAmount;
    if (amount !== undefined) {
      parsedAmount = parseFloat(amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ message: 'Số tiền phải là số lớn hơn 0.' });
      }
    }

    let parsedDeductDay;
    if (deductDay !== undefined) {
      parsedDeductDay = parseInt(deductDay);
      if (parsedDeductDay < 1 || parsedDeductDay > 31) {
        return res.status(400).json({ message: 'Ngày trừ tiền phải từ 1 đến 31.' });
      }
    }

    // Trường nào frontend không gửi sẽ là undefined và Prisma giữ nguyên giá trị cũ.
    const updated = await prisma.fixedExpense.update({
      where: { id },
      data: {
        amount: parsedAmount,
        category: category !== undefined ? category : undefined,
        description: description !== undefined ? description : undefined,
        deductDay: parsedDeductDay !== undefined ? parsedDeductDay : undefined
      }
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
};

// DELETE /api/fixed-expenses/:id
// Xóa lịch để ngừng các lần thanh toán sau này; lịch sử Transaction cũ vẫn còn.
exports.deleteFixedExpense = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Kiểm tra quyền sở hữu trước khi xóa.
    const existing = await prisma.fixedExpense.findFirst({
      where: { id, userId: req.user.id }
    });

    if (!existing) {
      return res.status(404).json({ message: 'Không tìm thấy khoản chi cố định' });
    }

    await prisma.fixedExpense.delete({ where: { id } });

    res.json({ message: 'Đã xóa khoản chi cố định' });
  } catch (error) {
    next(error);
  }
};
