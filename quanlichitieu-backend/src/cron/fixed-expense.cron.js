const cron = require('node-cron');
const prisma = require('../config/db');

// Hàm này chỉ ĐĂNG KÝ lịch chạy; server.js sẽ gọi nó một lần khi backend khởi động.
const scheduleFixedExpenses = () => {
  // Cú pháp "phút giờ ngày tháng thứ": '1 0 * * *' = 00:01 mỗi ngày.
  cron.schedule('1 0 * * *', async () => {
    console.log('[Cron] Đang quét các khoản chi cố định tới hạn...');
    try {
      // Lấy ngày/tháng/năm hiện tại để so sánh với deductDay và lastDeducted.
      const now = new Date();
      let todayDay = now.getDate();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      // Tính ngày cuối cùng của tháng này
      const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

      // Lấy tất cả lịch của mọi user vì cron là tác vụ nền toàn hệ thống.
      const fixedExpenses = await prisma.fixedExpense.findMany();

      // Xử lý lần lượt từng lịch. Sau một giao dịch thành công, lần lặp tiếp theo
      // sẽ tính lại tổng CHI nên số dư luôn bao gồm khoản vừa thanh toán.
      for (const expense of fixedExpenses) {
        // Logic xác định ngày trừ tiền:
        // Nếu deductDay lớn hơn số ngày trong tháng (vd: 31, nhưng tháng chỉ có 30 ngày)
        // thì ngày trừ tiền sẽ là ngày cuối cùng của tháng.
        let targetDay = expense.deductDay;
        if (targetDay > lastDayOfMonth) {
          targetDay = lastDayOfMonth;
        }

        // Chỉ đi tiếp khi hôm nay đúng ngày đến hạn của lịch này.
        if (todayDay === targetDay) {
          // Kiểm tra xem tháng này đã trừ chưa (tránh trừ lặp do server restart)
          const alreadyDeducted = expense.lastDeducted &&
            expense.lastDeducted.getMonth() === currentMonth &&
            expense.lastDeducted.getFullYear() === currentYear;

          // Nếu đã thanh toán trong tháng/năm hiện tại thì bỏ qua toàn bộ khối này.
          if (!alreadyDeducted) {
            // Số dư của ứng dụng được tính từ lịch sử giao dịch, không dùng ví nạp tiền:
            // số dư hiện tại = tổng THU - tổng CHI.
            const [incomeAgg, expenseAgg] = await Promise.all([
              prisma.transaction.aggregate({
                _sum: { amount: true },
                where: { userId: expense.userId, type: 'THU' }
              }),
              prisma.transaction.aggregate({
                _sum: { amount: true },
                where: { userId: expense.userId, type: 'CHI' }
              })
            ]);
            const availableBalance =
              (incomeAgg._sum.amount || 0) - (expenseAgg._sum.amount || 0);

            // Chỉ thanh toán khi số dư tính từ giao dịch đủ cho khoản chi này.
            if (availableBalance >= expense.amount) {
              // Ba thao tác nằm trong một database transaction:
              // nếu một thao tác lỗi thì cả ba cùng rollback, tránh dữ liệu dở dang.
              await prisma.$transaction(async (tx) => {
                // 1. Tạo giao dịch CHI; số dư trên dashboard sẽ tự giảm theo giao dịch này.
                await tx.transaction.create({
                  data: {
                    userId: expense.userId,
                    amount: expense.amount,
                    type: 'CHI',
                    category: expense.category,
                    date: new Date(),
                    description: expense.description || `Thanh toán chi cố định: ${expense.category}`,
                  }
                });

                // 2. Đánh dấu đã trừ tháng này
                await tx.fixedExpense.update({
                  where: { id: expense.id },
                  data: { lastDeducted: new Date() }
                });

                // 3. Tạo thông báo thành công
                await tx.notification.create({
                  data: {
                    userId: expense.userId,
                    title: 'Đã thanh toán chi cố định',
                    message: `Hệ thống đã tự động thanh toán ${expense.amount.toLocaleString('vi-VN')}đ cho khoản ${expense.category}.`
                  }
                });
              });
              console.log(`[Cron] Đã thanh toán ${expense.category} cho user ${expense.userId}`);
            } else {
              // Không đủ tiền: không tạo Transaction CHI và không đổi lastDeducted.
              // Chỉ tạo một thông báo cho đúng khoản này trong ngày để tránh spam khi test mỗi phút.
              const failureMessage = `Số dư hiện tại không đủ để thanh toán ${expense.amount.toLocaleString('vi-VN')}đ cho khoản ${expense.category}.`;
              // Tìm thông báo cùng user + nội dung đã được tạo từ đầu ngày hôm nay hay chưa.
              const existingNotif = await prisma.notification.findFirst({
                where: {
                  userId: expense.userId,
                  title: 'Thanh toán chi cố định thất bại',
                  message: failureMessage,
                  createdAt: {
                    gte: new Date(currentYear, currentMonth, todayDay)
                  }
                }
              });

              // Chưa có mới ghi Notification vào database để user xem lại khi đăng nhập.
              if (!existingNotif) {
                await prisma.notification.create({
                  data: {
                    userId: expense.userId,
                    title: 'Thanh toán chi cố định thất bại',
                    message: failureMessage
                  }
                });
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('[Cron] Lỗi khi chạy cron fixed expenses:', error);
    }
  });
};

module.exports = scheduleFixedExpenses;
