const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const ROOT_DIR = path.join(__dirname, 'quanlichitieu');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2'
};

const CATEGORIES = [
  { id: 'c1', name: 'Ăn uống', icon: 'utensils', color: '#f97316', type: 'CHI' },
  { id: 'c2', name: 'Mua sắm', icon: 'shopping-bag', color: '#3b82f6', type: 'CHI' },
  { id: 'c3', name: 'Di chuyển', icon: 'car', color: '#eab308', type: 'CHI' },
  { id: 'c4', name: 'Giải trí', icon: 'film', color: '#a855f7', type: 'CHI' },
  { id: 'c5', name: 'Lương', icon: 'banknote', color: '#10b981', type: 'THU' },
  { id: 'c6', name: 'Khác', icon: 'more-horizontal', color: '#64748b', type: 'BOTH' }
];

const TRANSACTIONS = [
  { id: 't1', amount: 18000000, type: 'THU', category: 'Lương', description: 'Lương công ty ChiLotus tháng 10', date: '2026-10-05T08:00:00.000Z' },
  { id: 't2', amount: 5000000, type: 'THU', category: 'Khác', description: 'Thưởng dự án hoàn thành sớm', date: '2026-10-08T10:30:00.000Z' },
  { id: 't3', amount: 3500000, type: 'THU', category: 'Khác', description: 'Thu nhập làm Freelance UI/UX', date: '2026-10-01T15:00:00.000Z' },
  { id: 't4', amount: 4500000, type: 'CHI', category: 'Khác', description: 'Tiền thuê căn hộ tháng 10', date: '2026-10-06T09:00:00.000Z' },
  { id: 't5', amount: 1650000, type: 'CHI', category: 'Mua sắm', description: 'Bàn phím cơ không dây công thái học', date: '2026-10-03T14:20:00.000Z' },
  { id: 't6', amount: 850000, type: 'CHI', category: 'Ăn uống', description: 'Đi siêu thị thực phẩm tươi sống tuần 2', date: '2026-10-14T11:15:00.000Z' },
  { id: 't7', amount: 1450000, type: 'CHI', category: 'Mua sắm', description: 'Mua giày chạy bộ Nike Pegasus', date: '2026-10-12T16:45:00.000Z' },
  { id: 't8', amount: 520000, type: 'CHI', category: 'Ăn uống', description: 'Ăn lẩu Haidilao cuối tuần cùng bạn bè', date: '2026-10-11T19:30:00.000Z' },
  { id: 't9', amount: 120000, type: 'CHI', category: 'Di chuyển', description: 'Đổ xăng xe máy Shell Ron 95', date: '2026-10-13T08:10:00.000Z' },
  { id: 't10', amount: 185000, type: 'CHI', category: 'Di chuyển', description: 'GrabCar từ công ty sang văn phòng khách hàng', date: '2026-10-10T14:00:00.000Z' },
  { id: 't11', amount: 320000, type: 'CHI', category: 'Giải trí', description: 'Vé xem phim CGV IMAX và bắp nước', date: '2026-10-09T20:15:00.000Z' },
  { id: 't12', amount: 95000, type: 'CHI', category: 'Ăn uống', description: 'Cà phê Highlands gặp đối tác', date: '2026-10-14T09:00:00.000Z' },
  { id: 't13', amount: 260000, type: 'CHI', category: 'Giải trí', description: 'Đăng ký gói Spotify & Netflix Family', date: '2026-10-07T07:30:00.000Z' },
  { id: 't14', amount: 780000, type: 'CHI', category: 'Khác', description: 'Hóa đơn tiền điện sinh hoạt tháng 9', date: '2026-10-02T10:00:00.000Z' },
  { id: 't15', amount: 250000, type: 'CHI', category: 'Di chuyển', description: 'Nạp tiền thẻ vé tháng Metro', date: '2026-10-04T08:30:00.000Z' },
  { id: 't16', amount: 18000000, type: 'THU', category: 'Lương', description: 'Lương công ty ChiLotus tháng 9', date: '2026-09-05T08:00:00.000Z' },
  { id: 't17', amount: 3800000, type: 'CHI', category: 'Ăn uống', description: 'Tổng chi ăn uống tháng 9', date: '2026-09-28T19:00:00.000Z' },
  { id: 't18', amount: 1900000, type: 'CHI', category: 'Mua sắm', description: 'Quần áo công sở tháng 9', date: '2026-09-20T15:00:00.000Z' },
  { id: 't19', amount: 18000000, type: 'THU', category: 'Lương', description: 'Lương công ty ChiLotus tháng 8', date: '2026-08-05T08:00:00.000Z' },
  { id: 't20', amount: 4100000, type: 'CHI', category: 'Ăn uống', description: 'Tổng chi ăn uống tháng 8', date: '2026-08-27T19:00:00.000Z' }
];

const BUDGETS = [
  { id: 'b1', category: 'Ăn uống', limitAmount: 5000000, spent: 3950000, remaining: 1050000, percentUsed: 79, month: '2026-10', warning: false, exceeded: false },
  { id: 'b2', category: 'Mua sắm', limitAmount: 2000000, spent: 2250000, remaining: -250000, percentUsed: 112, month: '2026-10', warning: true, exceeded: true },
  { id: 'b3', category: 'Di chuyển', limitAmount: 1500000, spent: 1200000, remaining: 300000, percentUsed: 80, month: '2026-10', warning: true, exceeded: false },
  { id: 'b4', category: 'Giải trí', limitAmount: 2500000, spent: 1580000, remaining: 920000, percentUsed: 63, month: '2026-10', warning: false, exceeded: false }
];

const SAVINGS = [
  { id: 's1', name: 'Quỹ khẩn cấp 6 tháng', targetAmount: 40000000, currentAmount: 35000000, deadline: '2026-12-31', monthlyContribution: 3000000, status: 'ACTIVE', percentComplete: 87.5 },
  { id: 's2', name: 'Mua MacBook Pro M3', targetAmount: 35000000, currentAmount: 28000000, deadline: '2026-11-30', monthlyContribution: 4000000, status: 'ACTIVE', percentComplete: 80 },
  { id: 's3', name: 'Du lịch Nhật Bản mùa xuân', targetAmount: 25000000, currentAmount: 12500000, deadline: '2027-04-15', monthlyContribution: 2000000, status: 'ACTIVE', percentComplete: 50 },
  { id: 's4', name: 'Mua xe máy Honda Vario', targetAmount: 30000000, currentAmount: 30000000, deadline: '2026-09-01', monthlyContribution: 5000000, status: 'COMPLETED', percentComplete: 100 }
];

const FIXED_EXPENSES = [
  { id: 'f1', category: 'Khác', description: 'Tiền thuê căn hộ', amount: 4500000, deductDay: 5, lastDeducted: '2026-10-05' },
  { id: 'f2', category: 'Khác', description: 'Điện nước sinh hoạt', amount: 850000, deductDay: 10, lastDeducted: '2026-10-10' },
  { id: 'f3', category: 'Khác', description: 'Internet cáp quang Viettel', amount: 250000, deductDay: 15, lastDeducted: '2026-09-15' },
  { id: 'f4', category: 'Giải trí', description: 'Gói gia đình Spotify & Netflix', amount: 260000, deductDay: 20, lastDeducted: '2026-09-20' },
  { id: 'f5', category: 'Khác', description: 'Gói tập Gym California 12 tháng', amount: 650000, deductDay: 25, lastDeducted: '2026-09-25' }
];

const NOTIFICATIONS = [
  { id: 'n1', title: 'Khấu trừ chi phí cố định', message: 'Đã tự động trừ 4.500.000₫ cho Tiền thuê căn hộ ngày 05/10', isRead: false, createdAt: '2026-10-05T08:00:00Z' },
  { id: 'n2', title: 'Cảnh báo ngân sách', message: 'Danh mục Mua sắm đã vượt hạn mức 12% trong tháng này', isRead: false, createdAt: '2026-10-12T14:30:00Z' },
  { id: 'n3', title: 'Mục tiêu tiết kiệm', message: 'Chúc mừng! Bạn đã hoàn thành 100% mục tiêu Mua xe máy Honda Vario', isRead: true, createdAt: '2026-10-01T09:15:00Z' }
];

const USERS = [
  { id: 'u_demo', name: 'Đặng Quốc Việt', email: 'intern@chilotus.com', role: 'USER', status: 'ACTIVE', counts: { transactions: 35, budgets: 4, savingsGoals: 4 } },
  { id: 'u2', name: 'Nguyễn Văn An', email: 'an.nguyen@gmail.com', role: 'USER', status: 'ACTIVE', counts: { transactions: 18, budgets: 2, savingsGoals: 1 } },
  { id: 'u3', name: 'Trần Thị Mai', email: 'mai.tran@gmail.com', role: 'USER', status: 'ACTIVE', counts: { transactions: 24, budgets: 3, savingsGoals: 2 } },
  { id: 'u4', name: 'Lê Hoàng Long', email: 'long.le@gmail.com', role: 'USER', status: 'BLOCKED', counts: { transactions: 5, budgets: 1, savingsGoals: 0 } },
  { id: 'u_admin', name: 'Admin ChiLotus', email: 'admin@chilotus.com', role: 'ADMIN', status: 'ACTIVE', counts: { transactions: 0, budgets: 0, savingsGoals: 0 } }
];

function sendJson(res, data, statusCode = 200) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { resolve({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsedUrl.pathname;
  const authHeader = req.headers['authorization'] || '';
  const isAdmin = authHeader.includes('admin') || req.headers['referer']?.includes('admin.html');

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const adminLogin = body.email === 'admin@chilotus.com';
    return sendJson(res, {
      message: 'Đăng nhập thành công',
      token: adminLogin ? 'mock-admin-token' : 'mock-user-token',
      user: adminLogin ? USERS[4] : USERS[0]
    });
  }

  if (pathname === '/api/auth/register' && req.method === 'POST') {
    const body = await readJsonBody(req);
    return sendJson(res, {
      message: 'Đăng ký thành công',
      token: 'mock-user-token',
      user: { id: 'u_new', name: body.name || 'Người dùng mới', email: body.email, role: 'USER' }
    });
  }

  if (pathname === '/api/auth/me') {
    return sendJson(res, isAdmin ? USERS[4] : USERS[0]);
  }

  if (pathname === '/api/auth/profile' || pathname === '/api/auth/password' || pathname === '/api/auth/logout') {
    return sendJson(res, { message: 'Thao tác thành công' });
  }

  if (pathname === '/api/categories') {
    return sendJson(res, CATEGORIES);
  }

  if (pathname === '/api/transactions') {
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const newTx = { id: 't_' + Date.now(), ...body, date: body.date || new Date().toISOString() };
      TRANSACTIONS.unshift(newTx);
      return sendJson(res, newTx, 201);
    }
    return sendJson(res, TRANSACTIONS);
  }

  if (pathname.startsWith('/api/transactions/')) {
    return sendJson(res, { message: 'Thành công' });
  }

  if (pathname === '/api/stats/summary') {
    return sendJson(res, {
      balance: 42850000,
      totalIncome: 26500000,
      totalExpense: 10730000,
      totalSavings: 35000000,
      periodIncome: 26500000,
      periodExpense: 10730000
    });
  }

  if (pathname === '/api/stats/monthly') {
    return sendJson(res, [
      { month: '2026-05', thu: 20000000, chi: 11200000 },
      { month: '2026-06', thu: 22000000, chi: 12500000 },
      { month: '2026-07', thu: 21500000, chi: 9800000 },
      { month: '2026-08', thu: 24000000, chi: 13400000 },
      { month: '2026-09', thu: 23000000, chi: 11100000 },
      { month: '2026-10', thu: 26500000, chi: 10730000 }
    ]);
  }

  if (pathname === '/api/stats/categories') {
    return sendJson(res, [
      { category: 'Ăn uống', total: 4050000, percentage: 38 },
      { category: 'Mua sắm', total: 2250000, percentage: 21 },
      { category: 'Khác', total: 5530000, percentage: 25 },
      { category: 'Giải trí', total: 1580000, percentage: 10 },
      { category: 'Di chuyển', total: 1200000, percentage: 6 }
    ]);
  }

  if (pathname === '/api/stats/trend') {
    const list = [];
    for (let i = 1; i <= 14; i++) {
      const dayStr = String(i).padStart(2, '0');
      let thu = 0;
      let chi = 150000 + (i % 3) * 80000;
      if (i === 1) thu = 3500000;
      if (i === 5) thu = 18000000;
      if (i === 8) thu = 5000000;
      if (i === 3) chi = 1650000;
      if (i === 6) chi = 4500000;
      if (i === 12) chi = 1450000;
      list.push({ date: `2026-10-${dayStr}`, thu, chi });
    }
    return sendJson(res, list);
  }

  if (pathname === '/api/budgets') {
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const newB = { id: 'b_' + Date.now(), spent: 0, remaining: body.limitAmount, percentUsed: 0, warning: false, exceeded: false, ...body };
      BUDGETS.push(newB);
      return sendJson(res, newB, 201);
    }
    return sendJson(res, BUDGETS);
  }

  if (pathname.startsWith('/api/budgets/')) {
    return sendJson(res, { message: 'Thành công' });
  }

  if (pathname === '/api/savings') {
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const newS = { id: 's_' + Date.now(), currentAmount: 0, percentComplete: 0, status: 'ACTIVE', ...body };
      SAVINGS.push(newS);
      return sendJson(res, newS, 201);
    }
    return sendJson(res, SAVINGS);
  }

  if (pathname.startsWith('/api/savings/')) {
    return sendJson(res, { message: 'Thành công' });
  }

  if (pathname === '/api/fixed-expenses') {
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const newF = { id: 'f_' + Date.now(), ...body };
      FIXED_EXPENSES.push(newF);
      return sendJson(res, newF, 201);
    }
    return sendJson(res, FIXED_EXPENSES);
  }

  if (pathname.startsWith('/api/fixed-expenses/')) {
    return sendJson(res, { message: 'Thành công' });
  }

  if (pathname === '/api/notifications') {
    return sendJson(res, NOTIFICATIONS);
  }

  if (pathname === '/api/notifications/read-all' || pathname.startsWith('/api/notifications/')) {
    return sendJson(res, { message: 'Đã đánh dấu đã đọc' });
  }

  if (pathname === '/api/admin/users') {
    const q = (parsedUrl.searchParams.get('q') || '').toLowerCase();
    const filtered = q ? USERS.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) : USERS;
    return sendJson(res, filtered);
  }

  if (pathname.startsWith('/api/admin/users/') && pathname.endsWith('/status')) {
    return sendJson(res, { message: 'Đã cập nhật trạng thái tài khoản' });
  }

  if (pathname === '/api/admin/stats') {
    return sendJson(res, {
      users: { total: 156, active: 148, blocked: 8 },
      transactions: { total: 1845 },
      ai: {
        totalRequests: 642,
        todayRequests: 48,
        totalTokens: 185400,
        estimatedCostTotal: 0.185,
        estimatedCostToday: 0.015,
        topUsers: [
          { user: { id: 'u_demo', name: 'Đặng Quốc Việt', email: 'intern@chilotus.com' }, requests: 58 },
          { user: { id: 'u2', name: 'Nguyễn Văn An', email: 'an.nguyen@gmail.com' }, requests: 34 },
          { user: { id: 'u3', name: 'Trần Thị Mai', email: 'mai.tran@gmail.com' }, requests: 28 }
        ],
        recentLogs: [
          { id: 'l1', endpoint: 'ai-insights', model: 'llama3:8b', tokens: 280, createdAt: '2026-10-14T10:30:00Z', user: { name: 'Đặng Quốc Việt', email: 'intern@chilotus.com' } },
          { id: 'l2', endpoint: 'ai-chat', model: 'llama3:8b', tokens: 195, createdAt: '2026-10-14T09:15:00Z', user: { name: 'Đặng Quốc Việt', email: 'intern@chilotus.com' } }
        ]
      }
    });
  }

  if (pathname === '/api/admin/categories') {
    return sendJson(res, CATEGORIES);
  }

  if (pathname === '/api/admin/ai-settings') {
    return sendJson(res, { model: 'llama3:8b', dailyQuota: 50 });
  }

  if (pathname === '/api/ai-insights' || pathname === '/api/ai/insight') {
    return sendJson(res, {
      insight: '- Thu 26.500.000₫, Chi 10.730.000₫, thặng dư 15.770.000₫ (tỷ lệ tiết kiệm 59.5%).\n- Danh mục Ăn uống chi nhiều nhất (4.200.000₫); Mua sắm đã vượt hạn mức 12%.\n- Gợi ý: Hạn chế chi tiêu mua sắm và chuyển 2.000.000₫ vào Quỹ khẩn cấp.'
    });
  }

  if (pathname === '/api/ai-chat' || pathname === '/api/ai/chat') {
    return sendJson(res, {
      reply: '- Tháng này thu 26.500.000₫, chi 10.730.000₫, thặng dư 15.770.000₫.\n- Danh mục Mua sắm đang vượt ngân sách 250.000₫, bạn nên hạn chế mua thêm đồ dùng chưa cần thiết.'
    });
  }

  const urlPath = decodeURIComponent(pathname);
  const filePath = path.join(ROOT_DIR, urlPath === '/' ? 'index.html' : urlPath);

  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('File not found: ' + urlPath);
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`Mock server running at http://localhost:${PORT}`);
});
