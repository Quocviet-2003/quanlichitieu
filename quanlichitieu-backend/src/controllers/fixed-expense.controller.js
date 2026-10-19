const prisma = require('../config/db');
const { currentMonth, monthRange } = require('../utils/helpers');

// GET /api/fixed-expenses
// Lấy danh sách chi cố định theo tháng kèm trạng thái đã trừ / chưa trừ.
exports.getFixedExpenses = async (req, res, next) => {
  try {
    const targetMonth = req.query.month || currentMonth();
    const { start, end } = monthRange(targetMonth);
    const now = new Date();
    const curMonthStr = currentMonth();

    // Lấy các khoản chi cố định được tạo trước hoặc trong tháng này
    const fixedExpenses = await prisma.fixedExpense.findMany({
      where: {
        userId: req.user.id,
        createdAt: { lt: end }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Lấy các giao dịch chi của user trong tháng để xác định trạng thái đã thanh toán
    const transactions = await prisma.transaction.findMany({
      where: {
        userId: req.user.id,
        type: 'CHI',
        date: { gte: start, lt: end }
      },
      select: { category: true, amount: true, description: true, date: true }
    });

    const [yyyy, mm] = targetMonth.split('-').map(Number);
    const lastDayOfMonth = new Date(yyyy, mm, 0).getDate();

    const result = fixedExpenses.map((expense) => {
      const targetDay = Math.min(expense.deductDay || 1, lastDayOfMonth);

      const lastDeductedInMonth = expense.lastDeducted &&
        new Date(expense.lastDeducted) >= start &&
        new Date(expense.lastDeducted) < end;

      const matchedTx = transactions.some((tx) => {
        const descMatch = expense.description && tx.description && tx.description.includes(expense.description);
        const catAmountMatch = tx.category === expense.category && Math.abs(tx.amount - expense.amount) < 0.01;
        return descMatch || catAmountMatch;
      });

      const isDeducted = Boolean(lastDeductedInMonth || matchedTx);

      let status = 'UPCOMING';
      if (isDeducted) {
        status = 'DEDUCTED'; // Đã trừ
      } else if (targetMonth < curMonthStr) {
        status = 'MISSED'; // Tháng quá khứ chưa trừ
      } else if (targetMonth === curMonthStr) {
        const todayDay = now.getDate();
        if (todayDay > targetDay) {
          status = 'MISSED'; // Quá hạn trong tháng nhưng chưa trừ
        } else if (todayDay === targetDay) {
          status = 'PENDING'; // Hôm nay đến hạn
        } else {
          status = 'UPCOMING'; // Chưa đến hạn
        }
      } else {
        status = 'UPCOMING'; // Tháng tương lai
      }

      return {
        id: expense.id,
        userId: expense.userId,
        amount: expense.amount,
        category: expense.category,
        description: expense.description,
        deductDay: expense.deductDay,
        lastDeducted: expense.lastDeducted,
        createdAt: expense.createdAt,
        month: targetMonth,
        targetDay,
        isDeducted,
        status
      };
    });

    res.json(result);
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

    // Kiểm tra dữ liệu nhận từ frontend. 
    // Danh mục, số tiền, ngày trừ tiền bắt buộc phải có.
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
