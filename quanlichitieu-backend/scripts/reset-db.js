/**
 * Script xóa toàn bộ dữ liệu cũ và thiết lập lại dữ liệu chuẩn (seed):
 * - Xóa sạch tất cả collections trong MongoDB
 * - Tạo 6 danh mục mặc định
 * - Cấu hình hệ thống (AI quota)
 * - Tạo tài khoản ADMIN:  admin@chilotus.com  / admin123
 * - Tạo tài khoản USER:   intern@chilotus.com / 123456 (Nguyễn Văn An)
 * - Tạo dữ liệu đầy đủ cho Nguyễn Văn An:
 *     + Giao dịch thu/chi 5 tháng gần nhất
 *     + Ngân sách tháng hiện tại
 *     + 3 mục tiêu tiết kiệm
 *     + 2 khoản chi cố định hàng tháng
 *     + Thông báo mẫu
 *     + Nhật ký AI mẫu cho Dashboard Admin
 *
 * Chạy:
 *   npm run db:reset
 *   hoặc: node scripts/reset-db.js
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

const CATEGORIES = [
  { name: 'Ăn uống', icon: 'utensils', color: '#f97316', type: 'CHI' },
  { name: 'Mua sắm', icon: 'shopping-bag', color: '#3b82f6', type: 'CHI' },
  { name: 'Di chuyển', icon: 'car', color: '#eab308', type: 'CHI' },
  { name: 'Giải trí', icon: 'film', color: '#a855f7', type: 'CHI' },
  { name: 'Lương', icon: 'banknote', color: '#10b981', type: 'THU' },
  { name: 'Khác', icon: 'more-horizontal', color: '#64748b', type: 'BOTH' },
];

const pad2 = (n) => String(n).padStart(2, '0');

function dateMonthsAgo(monthsBack, day) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack, day, 12, 0, 0));
}

const MONTHLY_EXPENSE_TEMPLATE = [
  [2, 'Ăn uống', 'Ăn trưa cơm văn phòng', 85000],
  [4, 'Di chuyển', 'Đổ xăng xe máy', 120000],
  [6, 'Mua sắm', 'Mua áo sơ mi mới', 350000],
  [8, 'Giải trí', 'Xem phim rạp cuối tuần', 180000],
  [10, 'Ăn uống', 'Đi ăn lẩu với nhóm bạn', 420000],
  [12, 'Di chuyển', 'Đặt xe đi làm', 96000],
  [14, 'Mua sắm', 'Sữa tắm, dầu gội', 210000],
  [16, 'Ăn uống', 'Cà phê cuối tuần', 145000],
  [18, 'Giải trí', 'Đăng ký tập thể hình', 500000],
  [20, 'Ăn uống', 'Đi siêu thị mua đồ ăn', 680000],
  [23, 'Di chuyển', 'Rửa xe và bảo dưỡng', 150000],
  [26, 'Khác', 'Quà tặng sinh nhật bạn', 250000],
  [28, 'Mua sắm', 'Mua sách tham khảo', 175000],
];

async function clearDatabase() {
  console.log('🧹 [1/3] Đang dọn dẹp toàn bộ dữ liệu cũ trong Database...');
  await prisma.notification.deleteMany({});
  await prisma.fixedExpense.deleteMany({});
  await prisma.aiLog.deleteMany({});
  await prisma.budget.deleteMany({});
  await prisma.savingsGoal.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.appSetting.deleteMany({});
  console.log('   ✅ Đã xóa sạch dữ liệu cũ thành công!');
}

async function seedData() {
  console.log('🌱 [2/3] Đang nạp dữ liệu chuẩn mới...');

  // 1. Danh mục
  await prisma.category.createMany({ data: CATEGORIES });
  console.log('   ✅ 6 danh mục chuẩn: OK');

  // 2. Cấu hình AI
  await prisma.appSetting.create({
    data: { key: 'ai_daily_quota', value: '50' },
  });
  console.log('   ✅ Cấu hình AI (hạn mức 50 câu/ngày): OK');

  // 3. Tài khoản ADMIN và USER
  const adminPasswordHash = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.create({
    data: {
      email: 'admin@chilotus.com',
      password: adminPasswordHash,
      name: 'Quản trị viên',
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  });
  console.log('   ✅ Tài khoản ADMIN : admin@chilotus.com / admin123');

  const internPasswordHash = await bcrypt.hash('123456', 10);
  const intern = await prisma.user.create({
    data: {
      email: 'intern@chilotus.com',
      password: internPasswordHash,
      name: 'Nguyễn Văn An',
      role: 'USER',
      status: 'ACTIVE',
    },
  });
  console.log('   ✅ Tài khoản DEMO  : intern@chilotus.com / 123456');

  // 4. Giao dịch thu/chi mẫu cho intern (5 tháng gần nhất)
  const txData = [];
  for (let monthsBack = 4; monthsBack >= 0; monthsBack--) {
    const salaryMonth = pad2(((new Date().getUTCMonth() - monthsBack + 12) % 12) + 1);
    txData.push({
      userId: intern.id,
      type: 'THU',
      category: 'Lương',
      description: `Lương tháng ${salaryMonth}`,
      amount: 15000000,
      date: dateMonthsAgo(monthsBack, 1),
    });

    for (const [day, category, description, amount] of MONTHLY_EXPENSE_TEMPLATE) {
      txData.push({
        userId: intern.id,
        type: 'CHI',
        category,
        description,
        amount,
        date: dateMonthsAgo(monthsBack, day),
      });
    }
  }
  await prisma.transaction.createMany({ data: txData });
  console.log(`   ✅ Giao dịch mẫu   : Đã tạo ${txData.length} giao dịch (5 tháng gần nhất)`);

  // 5. Ngân sách tháng hiện tại
  const now = new Date();
  const currentMonth = `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}`;
  await prisma.budget.createMany({
    data: [
      { userId: intern.id, category: 'Ăn uống', limitAmount: 2000000, month: currentMonth },
      { userId: intern.id, category: 'Mua sắm', limitAmount: 800000, month: currentMonth },
      { userId: intern.id, category: 'Giải trí', limitAmount: 900000, month: currentMonth },
      { userId: intern.id, category: 'Di chuyển', limitAmount: 500000, month: currentMonth },
    ],
  });
  console.log(`   ✅ Ngân sách mẫu   : 4 danh mục cho tháng ${currentMonth}`);

  await prisma.savingsGoal.createMany({
    data: [
      {
        userId: intern.id,
        name: 'Mua máy tính mới',
        targetAmount: 20000000,
        currentAmount: 12000000,
        monthlyContribution: 2000000,
        deadline: new Date(Date.UTC(now.getUTCFullYear(), 11, 31)),
        termType: 'SHORT_TERM',
        status: 'IN_PROGRESS',
      },
      {
        userId: intern.id,
        name: 'Quỹ khẩn cấp',
        targetAmount: 15000000,
        currentAmount: 5000000,
        monthlyContribution: 1500000,
        termType: 'LONG_TERM',
        status: 'IN_PROGRESS',
      },
      {
        userId: intern.id,
        name: 'Du lịch cuối năm',
        targetAmount: 10000000,
        currentAmount: 3500000,
        monthlyContribution: 1000000,
        deadline: new Date(Date.UTC(now.getUTCFullYear(), 11, 15)),
        termType: 'SHORT_TERM',
        status: 'IN_PROGRESS',
      },
    ],
  });
  console.log('   ✅ Tiết kiệm mẫu   : 3 mục tiêu (Mua máy tính, Quỹ khẩn cấp, Du lịch)');

  await prisma.fixedExpense.createMany({
    data: [
      {
        userId: intern.id,
        category: 'Khác',
        description: 'Tiền mạng cáp quang gia đình',
        amount: 250000,
        deductDay: 5,
      },
      {
        userId: intern.id,
        category: 'Khác',
        description: 'Tiền thuê trọ & dịch vụ',
        amount: 3500000,
        deductDay: 1,
      },
    ],
  });
  console.log('   ✅ Chi cố định     : 2 lịch chi định kỳ hàng tháng');

  await prisma.notification.createMany({
    data: [
      {
        userId: intern.id,
        title: 'Chào mừng bạn đến với ChiLotus!',
        message: 'Hệ thống quản lý tài chính thông minh đã sẵn sàng đồng hành cùng bạn.',
        isRead: true,
      },
      {
        userId: intern.id,
        title: 'Cảnh báo ngân sách',
        message: 'Bạn đã sử dụng hơn 60% hạn mức danh mục Ăn uống tháng này.',
        isRead: false,
      },
    ],
  });
  console.log('   ✅ Thông báo mẫu   : 2 thông báo');

  await prisma.aiLog.createMany({
    data: [
      {
        userId: intern.id,
        endpoint: 'Phân tích chi tiêu',
        model: 'Trợ lý AI ChiLotus',
        tokens: 320,
        costEstimate: 0.00064,
      },
      {
        userId: intern.id,
        endpoint: 'Trò chuyện AI',
        model: 'Trợ lý AI ChiLotus',
        tokens: 450,
        costEstimate: 0.0009,
      },
    ],
  });
  console.log('   ✅ Nhật ký AI      : 2 bản ghi mẫu cho trang Quản trị Admin');
}

async function main() {
  console.log('====================================================');
  console.log('⚡ BẮT ĐẦU RESET VÀ THIẾT LẬP DỮ LIỆU CHUẨN CHILOTUS');
  console.log('====================================================');
  await clearDatabase();
  await seedData();
  console.log('====================================================');
  console.log('🎉 [3/3] HOÀN TẤT RESET DỮ LIỆU THÀNH CÔNG!');
  console.log('👉 Đăng nhập User : intern@chilotus.com / 123456');
  console.log('👉 Đăng nhập Admin: admin@chilotus.com  / admin123');
  console.log('====================================================');
}

main()
  .catch((err) => {
    console.error('❌ Lỗi trong quá trình reset dữ liệu:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
