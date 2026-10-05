/**
 * Thống kê & báo cáo cho Dashboard + trang Reports:
 * - GET /api/stats/summary    : tổng quan (số dư, tổng thu/chi, tiết kiệm, tháng hiện tại)
 * - GET /api/stats/monthly    : thu/chi theo từng tháng (mặc định 6 tháng gần nhất)
 * - GET /api/stats/categories : tổng chi/thu theo danh mục + % đóng góp
 * - GET /api/stats/trend      : chuỗi dữ liệu theo NGÀY để vẽ biểu đồ đường
 */
const prisma = require('../config/db');
const { asyncHandler, assert, monthRange, currentMonth, monthKey, dayKeyOf } = require('../utils/helpers');

// GET /api/stats/summary :
exports.getSummary = asyncHandler(async (req, res) => {
  // B1. start là đầu tháng này, end là đầu tháng sau; dùng date >= start và date < end.
  const { start, end } = monthRange(currentMonth());



  const [incomeAgg, expenseAgg, savingsAgg, monthIncomeAgg, monthExpenseAgg, txCount] =
    await Promise.all([
      // 1. Tổng tiền THU từ trước đến nay.
      prisma.transaction.aggregate({ _sum: { amount: true }, where: { userId: req.userId, type: 'THU' } }),
      // 2. Tổng tiền CHI từ trước đến nay.
      prisma.transaction.aggregate({ _sum: { amount: true }, where: { userId: req.userId, type: 'CHI' } }),
      // 3. Tổng số tiền hiện có trong các mục tiêu tiết kiệm.
      prisma.savingsGoal.aggregate({ _sum: { currentAmount: true }, where: { userId: req.userId } }),
      // 4. Tổng tiền THU chỉ trong tháng hiện tại.
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { userId: req.userId, type: 'THU', date: { gte: start, lt: end } },
      }),
      // 5. Tổng tiền CHI chỉ trong tháng hiện tại.
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { userId: req.userId, type: 'CHI', date: { gte: start, lt: end } },
      }),
      // 6. Đếm số giao dịch của người dùng.
      prisma.transaction.count({ where: { userId: req.userId } }),
    ]);

  // B3. Trích xuất tổng thu và tổng chi (nếu null/không có thì gán mặc định là 0)
  const totalIncome = incomeAgg._sum.amount || 0;
  const totalExpense = expenseAgg._sum.amount || 0;

  // B4. Trả JSON cho Dashboard; số dư = tổng thu - tổng chi, không trừ tiền tiết kiệm.
  res.json({
    balance: totalIncome - totalExpense, // Số dư hiện tại
    totalIncome,
    totalExpense,
    totalSavings: savingsAgg._sum.currentAmount || 0,
    monthIncome: monthIncomeAgg._sum.amount || 0,
    monthExpense: monthExpenseAgg._sum.amount || 0,
    currentMonth: currentMonth(),
    transactionCount: txCount,
  });
});

// GET /api/stats/monthly?months=6 : Thống kê xu hướng thu và chi theo từng tháng
exports.getMonthlyTrend = asyncHandler(async (req, res) => {
  // B1. Đọc số tháng từ URL; không gửi thì lấy 6 tháng
  let months = parseInt(req.query.months, 10);
  if (!Number.isFinite(months)) months = 6;
  assert(months >= 1 && months <= 24, 400, "'months' phải nằm trong khoảng 1 đến 24.");

  // B2. Tạo các ô tháng từ cũ đến mới, mỗi ô có ngày bắt đầu và kết thúc
  const buckets = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    buckets.push({
      key: monthKey(d), // Ví dụ: "2026-09"
      start: d,          // Đầu tháng 9
      end: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)), // Đầu tháng 10
    });
  }

  // B3. Lấy giao dịch của người dùng trong toàn bộ khoảng tháng cần thống kê
  const transactions = await prisma.transaction.findMany({
    where: {
      userId: req.userId,
      date: { gte: buckets[0].start, lt: buckets[buckets.length - 1].end },
    },
    select: { amount: true, type: true, date: true },
  });

  // B4. Mỗi tháng bắt đầu với tổng thu = 0 và tổng chi = 0
  const map = Object.fromEntries(
    buckets.map((b) => [b.key, { month: b.key, thu: 0, chi: 0 }])
  );

  // B5. Duyệt giao dịch: tìm đúng tháng rồi cộng tiền vào thu hoặc chi
  for (const tx of transactions) {
    const bucket = map[monthKey(tx.date)];
    if (!bucket) continue;

    if (tx.type === 'THU') bucket.thu += tx.amount;
    else bucket.chi += tx.amount;
  }

  // B6. Trả các tháng theo thứ tự cũ → mới để frontend vẽ biểu đồ
  res.json(buckets.map((b) => map[b.key]));
});

// GET /api/stats/categories?type=CHI&month=YYYY-MM|from=&to= : Phân tích cơ cấu thu/chi theo từng danh mục
exports.getCategoryBreakdown = asyncHandler(async (req, res) => {
  // B1. Chọn loại giao dịch: mặc định thống kê khoản CHI
  const type = req.query.type || 'CHI';
  assert(['THU', 'CHI'].includes(type), 400, "Tham số 'type' chỉ nhận 'THU' hoặc 'CHI'.");

  // B2. Chỉ lấy giao dịch của người đang đăng nhập và đúng loại THU/CHI
  const where = { userId: req.userId, type };
  // Nếu URL có month, chỉ lấy giao dịch trong tháng đó
  if (req.query.month) {
    const { start, end } = monthRange(req.query.month);
    where.date = { gte: start, lt: end };
    // Nếu không có month nhưng có from/to, lọc theo khoảng ngày
  } else if (req.query.from || req.query.to) {
    const { dateFilterFromQuery } = require('../utils/helpers');
    where.date = dateFilterFromQuery(req.query);
  }

  // B3. Gom các giao dịch cùng danh mục và cộng số tiền của từng danh mục
  const rows = await prisma.transaction.groupBy({
    by: ['category'],
    where,
    _sum: { amount: true },
    orderBy: { _sum: { amount: 'desc' } }, // Danh mục chi nhiều đứng trước
  });

  // B4. Cộng tiền của tất cả danh mục để có tổng chung
  const total = rows.reduce((sum, r) => sum + (r._sum.amount || 0), 0);

  // B5. Trả tên danh mục, số tiền và tỷ lệ phần trăm của từng danh mục
  res.json(
    rows.map((r) => ({
      category: r.category,
      total: r._sum.amount || 0,
      percentage: total > 0 ? Math.round(((r._sum.amount || 0) / total) * 1000) / 10 : 0, // Tổng bằng 0 thì tránh phép chia cho 0
    }))
  );
});

// GET /api/stats/trend?days=30 : Thống kê xu hướng thu và chi theo từng ngày
exports.getDailyTrend = asyncHandler(async (req, res) => {
  // B1. Đọc số ngày từ URL; không gửi thì lấy mặc định 30 ngày
  let days = parseInt(req.query.days, 10);
  if (!Number.isFinite(days)) days = 30;
  assert(days >= 1 && days <= 365, 400, "'days' phải nằm trong khoảng 1 đến 365.");

  // B2.  Tạo sẵn từng ngày từ cũ đến mới; mỗi ngày sẽ có thu và chi bằng 0
  const buckets = [];
  const todayUtcMidnight = new Date(`${dayKeyOf(new Date())}T00:00:00.000Z`);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(todayUtcMidnight);
    d.setUTCDate(d.getUTCDate() - i);
    buckets.push({ key: dayKeyOf(d), start: d });
  }
  // Mốc kết thúc là đầu ngày mai để lấy trọn giao dịch hôm nay
  const end = new Date(todayUtcMidnight);
  end.setUTCDate(end.getUTCDate() + 1);

  // B3. Lấy giao dịch của người dùng trong khoảng ngày cần thống kê
  const transactions = await prisma.transaction.findMany({
    where: { userId: req.userId, date: { gte: buckets[0].start, lt: end } },
    select: { amount: true, type: true, date: true },
  });

  // B4. Tạo ô kết quả cho mỗi ngày, ban đầu thu = 0 và chi = 0
  const map = Object.fromEntries(buckets.map((b) => [b.key, { date: b.key, thu: 0, chi: 0 }]));

  // B5. Đọc từng giao dịch, tìm đúng ngày rồi cộng vào tổng thu hoặc chi
  for (const tx of transactions) {
    const bucket = map[dayKeyOf(tx.date)];
    if (!bucket) continue;
    if (tx.type === 'THU') bucket.thu += tx.amount;
    else bucket.chi += tx.amount;
  }

  // Trả kết quả theo thứ tự ngày cũ → mới để frontend vẽ hai đường
  res.json(buckets.map((b) => map[b.key]));
});
