/**
 * FULL SYSTEM TEST SUITE - CHILOTUS
 * Kiểm thử toàn diện tất cả các màn hình, logic tính toán tài chính thừa/thiếu,
 * ràng buộc validation, hiển thị trạng thái UI và phân quyền bảo mật.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TEST_BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3001';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@chilotus.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// ---------- Test Runner Frame ----------
const results = [];
let passCount = 0;
let failCount = 0;

function ok(cond, msg) {
  if (!cond) throw new Error(msg);
}

function eq(actual, expected, label) {
  const a = typeof actual === 'number' ? Math.round(actual * 100) / 100 : actual;
  const b = typeof expected === 'number' ? Math.round(expected * 100) / 100 : expected;
  ok(a === b, `${label || 'So sánh'}: mong đợi ${JSON.stringify(b)} nhưng nhận được ${JSON.stringify(a)}`);
}

async function runTest(caseId, name, fn) {
  try {
    await fn();
    passCount += 1;
    results.push({ caseId, name, status: 'PASS' });
    console.log(`  ✅ [${caseId}] PASS | ${name}`);
  } catch (err) {
    failCount += 1;
    results.push({ caseId, name, status: 'FAIL', error: err.message });
    console.log(`  ❌ [${caseId}] FAIL | ${name}\n       └─ ${err.message}`);
  }
}

async function req(method, pathUrl, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${TEST_BASE_URL}${pathUrl}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    throw new Error(`NETWORK_ERROR khi gọi ${method} ${pathUrl}: ${err.message}`);
  }

  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    // Không phải JSON
  }
  return { status: res.status, data };
}

// ============================================================
// MAIN EXECUTION
// ============================================================
(async () => {
  const startTime = Date.now();
  console.log('\n' + '='.repeat(70));
  console.log('🧪 BẮT ĐẦU CHẠY BỘ TEST CASE TOÀN DIỆN CHILOTUS');
  console.log(`📍 Endpoint: ${TEST_BASE_URL}`);
  console.log('='.repeat(70));

  const ts = Date.now();
  const testUserEmail = `test.pilot.${ts}@chilotus.com`;
  const testUserPass = 'matkhau123';
  let userToken;
  let userId;
  let adminToken;
  let adminId;

  const now = new Date();
  const pad2 = (n) => String(n).padStart(2, '0');
  const currentMonthKey = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
  const nextMonthKey = now.getMonth() === 11 
    ? `${now.getFullYear() + 1}-01` 
    : `${now.getFullYear()}-${pad2(now.getMonth() + 2)}`;

  try {
    // ==========================================================
    // MODULE 1: AUTH & PROFILE
    // ==========================================================
    console.log('\n--- MODULE 1: Xác thực & Hồ sơ cá nhân (Auth & Profile) ---');

    await runTest('AUTH-01', 'Đăng ký thiếu email trả về 400', async () => {
      const { status } = await req('POST', '/api/auth/register', { body: { password: '123' } });
      eq(status, 400, 'HTTP status');
    });

    await runTest('AUTH-02', 'Đăng ký email sai định dạng trả về 400', async () => {
      const { status } = await req('POST', '/api/auth/register', { body: { email: 'invalid-email', password: '123' } });
      eq(status, 400, 'HTTP status');
    });

    await runTest('AUTH-03', 'Đăng ký mật khẩu < 6 ký tự trả về 400', async () => {
      const { status } = await req('POST', '/api/auth/register', { body: { email: testUserEmail, password: '123' } });
      eq(status, 400, 'HTTP status');
    });

    await runTest('AUTH-04', 'Đăng ký thành công trả về 201 kèm token và user (không lộ mật khẩu)', async () => {
      const { status, data } = await req('POST', '/api/auth/register', {
        body: { email: testUserEmail, password: testUserPass, name: 'Người Dùng Test' },
      });
      eq(status, 201, 'HTTP status');
      ok(typeof data.token === 'string' && data.token.length > 20, 'Thiếu token hợp lệ');
      ok(!('password' in data.user), 'Không được làm lộ password');
      userToken = data.token;
      userId = data.user.id;
    });

    await runTest('AUTH-05', 'Đăng ký trùng email trả về 400/409', async () => {
      const { status } = await req('POST', '/api/auth/register', {
        body: { email: testUserEmail, password: testUserPass },
      });
      ok(status === 400 || status === 409, `Mong đợi 400 hoặc 409 nhưng nhận ${status}`);
    });

    await runTest('AUTH-06', 'Đăng nhập sai mật khẩu trả về 401', async () => {
      const { status } = await req('POST', '/api/auth/login', {
        body: { email: testUserEmail, password: 'sai-mat-khau' },
      });
      eq(status, 401, 'HTTP status');
    });

    await runTest('AUTH-07', 'Đăng nhập email không tồn tại trả về 404', async () => {
      const { status } = await req('POST', '/api/auth/login', {
        body: { email: `nonexistent.${ts}@test.com`, password: '123' },
      });
      eq(status, 404, 'HTTP status');
    });

    await runTest('AUTH-08', 'Đăng nhập đúng tài khoản trả về token hợp lệ', async () => {
      const { status, data } = await req('POST', '/api/auth/login', {
        body: { email: testUserEmail, password: testUserPass },
      });
      eq(status, 200, 'HTTP status');
      ok(typeof data.token === 'string' && data.token.length > 20, 'Token đăng nhập');
      userToken = data.token;
    });

    await runTest('AUTH-09', 'Gọi /api/auth/me không có token trả về 403', async () => {
      const { status } = await req('GET', '/api/auth/me');
      eq(status, 403, 'HTTP status');
    });

    await runTest('AUTH-10', 'Gọi /api/auth/me với token giả mạo trả về 401', async () => {
      const { status } = await req('GET', '/api/auth/me', { token: 'invalid.jwt.token' });
      eq(status, 401, 'HTTP status');
    });

    await runTest('AUTH-11', 'Cập nhật hồ sơ cá nhân và kiểm tra lại qua /api/auth/me', async () => {
      const updateRes = await req('PUT', '/api/auth/profile', {
        token: userToken,
        body: { name: 'Người Dùng Đã Sửa', bio: 'Yêu thích quản lý tài chính' },
      });
      eq(updateRes.status, 200, 'HTTP status PUT /profile');
      const meRes = await req('GET', '/api/auth/me', { token: userToken });
      eq(meRes.status, 200, 'HTTP status GET /me');
      eq(meRes.data.name, 'Người Dùng Đã Sửa', 'Tên sau khi cập nhật');
      eq(meRes.data.bio, 'Yêu thích quản lý tài chính', 'Bio sau khi cập nhật');
    });

    await runTest('AUTH-12', 'Đổi mật khẩu với mật khẩu cũ sai trả về 401', async () => {
      const { status } = await req('PUT', '/api/auth/password', {
        token: userToken,
        body: { oldPassword: 'sai-mat-khau', newPassword: 'matkhaumoi123' },
      });
      eq(status, 401, 'HTTP status');
    });

    await runTest('AUTH-13', 'Đổi mật khẩu thành công và kiểm tra đăng nhập bằng mật khẩu mới', async () => {
      const changeRes = await req('PUT', '/api/auth/password', {
        token: userToken,
        body: { oldPassword: testUserPass, newPassword: 'matkhaumoi123' },
      });
      eq(changeRes.status, 200, 'HTTP status PUT /password');

      // Thử đăng nhập lại bằng mật khẩu cũ (phải fail 401)
      const oldLogin = await req('POST', '/api/auth/login', {
        body: { email: testUserEmail, password: testUserPass },
      });
      eq(oldLogin.status, 401, 'Đăng nhập bằng mật khẩu cũ phải bị từ chối');

      // Đăng nhập lại bằng mật khẩu mới (phải OK 200)
      const newLogin = await req('POST', '/api/auth/login', {
        body: { email: testUserEmail, password: 'matkhaumoi123' },
      });
      eq(newLogin.status, 200, 'Đăng nhập bằng mật khẩu mới thành công');
      userToken = newLogin.data.token;
    });

    // ==========================================================
    // MODULE 2: TRANSACTIONS & FINANCIAL CALCULATIONS
    // ==========================================================
    console.log('\n--- MODULE 2: Giao dịch & Động cơ Tính toán (Transactions & Balance) ---');

    await runTest('TX-01', 'Validation: Tạo giao dịch với số tiền <= 0 trả về 400', async () => {
      const res1 = await req('POST', '/api/transactions', {
        token: userToken,
        body: { amount: 0, type: 'THU', category: 'Lương' },
      });
      eq(res1.status, 400, 'Amount = 0');
      const res2 = await req('POST', '/api/transactions', {
        token: userToken,
        body: { amount: -50000, type: 'THU', category: 'Lương' },
      });
      eq(res2.status, 400, 'Amount < 0');
    });

    await runTest('TX-02', 'Validation: Tạo giao dịch với số tiền không phải số trả về 400', async () => {
      const { status } = await req('POST', '/api/transactions', {
        token: userToken,
        body: { amount: 'khong-phai-so', type: 'THU', category: 'Lương' },
      });
      eq(status, 400, 'Amount NaN');
    });

    await runTest('TX-03', 'Validation: Loại giao dịch sai (khác THU/CHI) trả về 400', async () => {
      const { status } = await req('POST', '/api/transactions', {
        token: userToken,
        body: { amount: 100000, type: 'VAY_NO', category: 'Lương' },
      });
      eq(status, 400, 'Invalid type');
    });

    await runTest('TX-04', 'Validation: Thiếu danh mục trả về 400', async () => {
      const { status } = await req('POST', '/api/transactions', {
        token: userToken,
        body: { amount: 100000, type: 'THU', category: '' },
      });
      eq(status, 400, 'Empty category');
    });

    let txIncomeId, txExpense1Id, txExpense2Id;

    await runTest('TX-05', 'Tạo giao dịch THU hợp lệ (Lương 20.000.000 đ)', async () => {
      const { status, data } = await req('POST', '/api/transactions', {
        token: userToken,
        body: {
          amount: 20000000,
          type: 'THU',
          category: 'Lương',
          description: 'Lương công ty tháng này',
          date: new Date().toISOString(),
        },
      });
      eq(status, 201, 'HTTP status');
      eq(data.amount, 20000000, 'Số tiền THU');
      txIncomeId = data.id;
    });

    await runTest('TX-06', 'Tạo 2 giao dịch CHI hợp lệ (Ăn uống 3.000.000 đ và Mua sắm 2.000.000 đ)', async () => {
      const res1 = await req('POST', '/api/transactions', {
        token: userToken,
        body: {
          amount: 3000000,
          type: 'CHI',
          category: 'Ăn uống',
          description: 'Đi siêu thị ăn uống tuần 1-2',
          date: new Date().toISOString(),
        },
      });
      eq(res1.status, 201, 'HTTP status CHI 1');
      txExpense1Id = res1.data.id;

      const res2 = await req('POST', '/api/transactions', {
        token: userToken,
        body: {
          amount: 2000000,
          type: 'CHI',
          category: 'Mua sắm',
          description: 'Mua sắm đồ dùng cá nhân',
          date: new Date().toISOString(),
        },
      });
      eq(res2.status, 201, 'HTTP status CHI 2');
      txExpense2Id = res2.data.id;
    });

    await runTest('TX-07', 'Tính toán Tài chính: Tổng thu 20M, Tổng chi 5M -> Số dư = 15.000.000 đ', async () => {
      const { status, data } = await req('GET', '/api/stats/summary', { token: userToken });
      eq(status, 200, 'HTTP status summary');
      eq(data.totalIncome, 20000000, 'Tổng thu');
      eq(data.totalExpense, 5000000, 'Tổng chi');
      eq(data.balance, 15000000, 'Số dư (Thu - Chi)');
      eq(data.periodIncome, 20000000, 'Thu trong kỳ');
      eq(data.periodExpense, 5000000, 'Chi trong kỳ');
      eq(data.monthSurplus, 15000000, 'Thặng dư tháng (Surplus)');
    });

    await runTest('TX-08', 'Cập nhật giao dịch: Sửa CHI Mua sắm từ 2M lên 4M -> Số dư giảm về 13.000.000 đ', async () => {
      const updateRes = await req('PUT', `/api/transactions/${txExpense2Id}`, {
        token: userToken,
        body: { amount: 4000000 },
      });
      eq(updateRes.status, 200, 'HTTP status PUT');
      eq(updateRes.data.amount, 4000000, 'Số tiền sau sửa');

      const summaryRes = await req('GET', '/api/stats/summary', { token: userToken });
      eq(summaryRes.data.totalExpense, 7000000, 'Tổng chi sau sửa');
      eq(summaryRes.data.balance, 13000000, 'Số dư sau sửa');
    });

    await runTest('TX-09', 'Xoá giao dịch: Xoá CHI 4M -> Hoàn lại số dư về 17.000.000 đ', async () => {
      const delRes = await req('DELETE', `/api/transactions/${txExpense2Id}`, { token: userToken });
      eq(delRes.status, 200, 'HTTP status DELETE');

      const summaryRes = await req('GET', '/api/stats/summary', { token: userToken });
      eq(summaryRes.data.totalExpense, 3000000, 'Tổng chi sau xoá');
      eq(summaryRes.data.balance, 17000000, 'Số dư sau xoá');
    });

    await runTest('TX-10', 'Lọc giao dịch theo tháng trả về chính xác danh sách trong tháng', async () => {
      const { status, data } = await req('GET', `/api/transactions?month=${currentMonthKey}`, { token: userToken });
      eq(status, 200, 'HTTP status GET transactions by month');
      ok(Array.isArray(data) && data.length >= 2, 'Số lượng giao dịch trong tháng');
      const allInMonth = data.every((tx) => tx.date.startsWith(currentMonthKey));
      ok(allInMonth, 'Tất cả giao dịch phải thuộc tháng được lọc');
    });

    // ==========================================================
    // MODULE 3: BUDGET ENGINE & THỪA / THIẾU
    // ==========================================================
    console.log('\n--- MODULE 3: Quản lý Ngân sách & Tính toán Thừa / Thiếu (Budget Engine) ---');

    await runTest('BDG-01', 'Validation: Tạo ngân sách hạn mức <= 0 trả về 400', async () => {
      const { status } = await req('POST', '/api/budgets', {
        token: userToken,
        body: { category: 'Ăn uống', limitAmount: 0 },
      });
      eq(status, 400, 'HTTP status limit <= 0');
    });

    await runTest('BDG-02', 'Tạo ngân sách hợp lệ cho Ăn uống (Hạn mức 5.000.000 đ)', async () => {
      const { status, data } = await req('POST', '/api/budgets', {
        token: userToken,
        body: { category: 'Ăn uống', limitAmount: 5000000, month: currentMonthKey },
      });
      eq(status, 201, 'HTTP status tạo ngân sách');
      eq(data.category, 'Ăn uống', 'Danh mục');
      eq(data.limitAmount, 5000000, 'Hạn mức');
    });

    await runTest('BDG-03', 'Validation: Tạo trùng ngân sách cùng danh mục trong tháng trả về 409', async () => {
      const { status } = await req('POST', '/api/budgets', {
        token: userToken,
        body: { category: 'Ăn uống', limitAmount: 6000000, month: currentMonthKey },
      });
      eq(status, 409, 'HTTP status trùng ngân sách');
    });

    await runTest('BDG-04', 'Tính toán Thừa/Thiếu: Đã chi 3M / Hạn mức 5M -> Còn lại 2M (Thừa), 60%, warning=false, exceeded=false', async () => {
      const { status, data } = await req('GET', `/api/budgets?month=${currentMonthKey}`, { token: userToken });
      eq(status, 200, 'HTTP status GET budgets');
      const b = data.find((x) => x.category === 'Ăn uống');
      ok(b, 'Tìm thấy ngân sách Ăn uống');
      eq(b.spent, 3000000, 'Đã chi');
      eq(b.remaining, 2000000, 'Còn lại (Thừa)');
      eq(b.percentUsed, 60, '% Đã dùng');
      eq(b.warning, false, 'Cảnh báo phải là false');
      eq(b.exceeded, false, 'Vượt mức phải là false');
    });

    await runTest('BDG-05', 'Tính toán Cảnh báo: Chi thêm 1.2M (Tổng 4.2M / 5M = 84%) -> warning=true, exceeded=false', async () => {
      // Chi thêm 1.2M Ăn uống
      await req('POST', '/api/transactions', {
        token: userToken,
        body: { amount: 1200000, type: 'CHI', category: 'Ăn uống', description: 'Ăn nhà hàng cuối tuần' },
      });

      const { data } = await req('GET', `/api/budgets?month=${currentMonthKey}`, { token: userToken });
      const b = data.find((x) => x.category === 'Ăn uống');
      eq(b.spent, 4200000, 'Đã chi');
      eq(b.remaining, 800000, 'Còn lại');
      eq(b.percentUsed, 84, '% Đã dùng');
      eq(b.warning, true, 'Ngưỡng >= 80% phải bật warning');
      eq(b.exceeded, false, 'Chưa vượt định mức');
    });

    await runTest('BDG-06', 'Tính toán Bội chi (Vượt định mức): Chi thêm 1.5M (Tổng 5.7M / 5M = 114%) -> exceeded=true, remaining=0', async () => {
      // Chi thêm 1.5M Ăn uống
      await req('POST', '/api/transactions', {
        token: userToken,
        body: { amount: 1500000, type: 'CHI', category: 'Ăn uống', description: 'Tiệc liên hoan' },
      });

      const { data } = await req('GET', `/api/budgets?month=${currentMonthKey}`, { token: userToken });
      const b = data.find((x) => x.category === 'Ăn uống');
      eq(b.spent, 5700000, 'Đã chi');
      eq(b.remaining, 0, 'Còn lại phải là 0 (không âm)');
      eq(b.percentUsed, 114, '% Đã dùng');
      eq(b.exceeded, true, 'Vượt định mức phải bật exceeded');
    });

    // ==========================================================
    // MODULE 4: FIXED EXPENSES ENGINE & STATUS COMPUTATION
    // ==========================================================
    console.log('\n--- MODULE 4: Chi phí Cố định & Trạng thái Khấu trừ (Fixed Expenses Engine) ---');

    await runTest('FIX-01', 'Validation: Số tiền chi cố định <= 0 trả về 400', async () => {
      const { status } = await req('POST', '/api/fixed-expenses', {
        token: userToken,
        body: { category: 'Nhà ở', amount: 0, deductDay: 1 },
      });
      eq(status, 400, 'HTTP status');
    });

    await runTest('FIX-02', 'Validation: Ngày trừ tiền ngoài khoảng 1-31 trả về 400', async () => {
      const res1 = await req('POST', '/api/fixed-expenses', {
        token: userToken,
        body: { category: 'Nhà ở', amount: 1000000, deductDay: 0 },
      });
      eq(res1.status, 400, 'deductDay = 0');
      const res2 = await req('POST', '/api/fixed-expenses', {
        token: userToken,
        body: { category: 'Nhà ở', amount: 1000000, deductDay: 32 },
      });
      eq(res2.status, 400, 'deductDay = 32');
    });

    await runTest('FIX-03', 'Khoản chi có deductDay ở tương lai trong tháng hiển thị UPCOMING (Chưa đến hạn)', async () => {
      const { status, data } = await req('POST', '/api/fixed-expenses', {
        token: userToken,
        body: { category: 'Internet', description: 'Gói cáp quang gia đình', amount: 350000, deductDay: 28 },
      });
      eq(status, 201, 'HTTP status');

      const listRes = await req('GET', `/api/fixed-expenses?month=${currentMonthKey}`, { token: userToken });
      const item = listRes.data.find((x) => x.id === data.id);
      ok(item, 'Tìm thấy khoản chi cố định');
      eq(item.status, 'UPCOMING', 'Trạng thái');
      eq(item.isDeducted, false, 'Chưa trừ tiền');
    });

    await runTest('FIX-04', 'Khoản chi tạo sau ngày trừ tiền trong tháng hiển thị UPCOMING (chờ kỳ tới, không bị phạt MISSED)', async () => {
      // Giả sử tạo ngày trừ là 1 hàng tháng, hôm nay là ngày 20
      const { status, data } = await req('POST', '/api/fixed-expenses', {
        token: userToken,
        body: { category: 'Điện nước', description: 'Tiền điện sinh hoạt', amount: 500000, deductDay: 1 },
      });
      eq(status, 201, 'HTTP status');

      const listRes = await req('GET', `/api/fixed-expenses?month=${currentMonthKey}`, { token: userToken });
      const item = listRes.data.find((x) => x.id === data.id);
      ok(item, 'Tìm thấy khoản chi cố định');
      eq(item.status, 'UPCOMING', 'Trạng thái');
      eq(item.isDeducted, false, 'Chưa trừ tiền');
    });

    await runTest('FIX-05', 'Khoản chi có deductDay là HÔM NAY hiển thị PENDING (Đến hạn)', async () => {
      const todayDay = now.getDate();
      const { status, data } = await req('POST', '/api/fixed-expenses', {
        token: userToken,
        body: { category: 'Đăng ký dịch vụ', description: 'Spotify Premium', amount: 59000, deductDay: todayDay },
      });
      eq(status, 201, 'HTTP status');

      const listRes = await req('GET', `/api/fixed-expenses?month=${currentMonthKey}`, { token: userToken });
      const item = listRes.data.find((x) => x.id === data.id);
      ok(item, 'Tìm thấy khoản chi Spotify');
      eq(item.status, 'PENDING', 'Trạng thái đến hạn hôm nay');
      eq(item.isDeducted, false, 'Chưa khấu trừ');
    });

    await runTest('FIX-06', 'Không bị nhận nhầm "Đã trừ" bởi các giao dịch thông thường trước khi tạo khoản chi', async () => {
      // User đã có giao dịch Ăn uống 3M và 1.2M từ trước
      // Tạo một khoản chi cố định Ăn uống 3M
      const { status, data } = await req('POST', '/api/fixed-expenses', {
        token: userToken,
        body: { category: 'Ăn uống', description: 'Suất ăn trưa định kỳ', amount: 3000000, deductDay: 25 },
      });
      eq(status, 201, 'HTTP status');

      const listRes = await req('GET', `/api/fixed-expenses?month=${currentMonthKey}`, { token: userToken });
      const item = listRes.data.find((x) => x.id === data.id);
      eq(item.status, 'UPCOMING', 'Trạng thái');
      eq(item.isDeducted, false, 'Không được nhận nhầm là đã trừ');
    });

    // ==========================================================
    // MODULE 5: SAVINGS GOALS & BALANCE ALLOCATION
    // ==========================================================
    console.log('\n--- MODULE 5: Mục tiêu Tiết kiệm & Phân bổ Số dư (Savings & Allocation) ---');

    await runTest('SAV-01', 'Validation: Tên mục tiêu rỗng trả về 400', async () => {
      const { status } = await req('POST', '/api/savings', {
        token: userToken,
        body: { name: '', targetAmount: 10000000 },
      });
      eq(status, 400, 'HTTP status');
    });

    await runTest('SAV-02', 'Validation: Số tiền mục tiêu <= 0 trả về 400', async () => {
      const { status } = await req('POST', '/api/savings', {
        token: userToken,
        body: { name: 'Mua Macbook', targetAmount: 0 },
      });
      eq(status, 400, 'HTTP status');
    });

    await runTest('SAV-03', 'Validation: Ngày hết hạn trong quá khứ trả về 400', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10);
      const { status } = await req('POST', '/api/savings', {
        token: userToken,
        body: { name: 'Mua xe máy', targetAmount: 25000000, deadline: pastDate.toISOString() },
      });
      eq(status, 400, 'HTTP status');
    });

    let goal1Id, goal2Id;

    await runTest('SAV-04', 'Tạo mục tiêu tiết kiệm hợp lệ (Laptop mới 15.000.000 đ)', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const { status, data } = await req('POST', '/api/savings', {
        token: userToken,
        body: {
          name: 'Mua Laptop Mới',
          targetAmount: 15000000,
          monthlyContribution: 1500000,
          deadline: futureDate.toISOString(),
          termType: 'SHORT_TERM',
        },
      });
      eq(status, 201, 'HTTP status');
      eq(data.name, 'Mua Laptop Mới', 'Tên mục tiêu');
      eq(data.percentComplete, 0, '% Ban đầu');
      eq(data.status, 'IN_PROGRESS', 'Trạng thái ban đầu');
      goal1Id = data.id;
    });

    await runTest('SAV-05', 'Tạo mục tiêu 2 (Quỹ khẩn cấp 5.000.000 đ)', async () => {
      const { status, data } = await req('POST', '/api/savings', {
        token: userToken,
        body: { name: 'Quỹ Khẩn Cấp', targetAmount: 5000000, termType: 'LONG_TERM' },
      });
      eq(status, 201, 'HTTP status');
      goal2Id = data.id;
    });

    await runTest('SAV-06', 'Nạp tiền vào mục tiêu: Nạp 6M vào Laptop (15M) -> Đạt 40%', async () => {
      const { status, data } = await req('POST', `/api/savings/${goal1Id}/deposit`, {
        token: userToken,
        body: { amount: 6000000 },
      });
      eq(status, 200, 'HTTP status nạp tiền');
      eq(data.goal.currentAmount, 6000000, 'Số tiền hiện có');
      eq(data.goal.percentComplete, 40, '% Hoàn thành');
      eq(data.goal.status, 'IN_PROGRESS', 'Vẫn đang thực hiện');
    });

    await runTest('SAV-07', 'Nạp đủ mục tiêu tự động chuyển COMPLETED (Nạp thêm 9M -> 100%)', async () => {
      // Bổ sung số dư tài khoản để đủ điều kiện nạp 9M
      await req('POST', '/api/transactions', {
        token: userToken,
        body: { amount: 15000000, type: 'THU', category: 'Lương', description: 'Thưởng quý' },
      });

      const { status, data } = await req('POST', `/api/savings/${goal1Id}/deposit`, {
        token: userToken,
        body: { amount: 9000000 },
      });
      eq(status, 200, 'HTTP status nạp tiền');
      eq(data.goal.currentAmount, 15000000, 'Số tiền hiện có');
      eq(data.goal.percentComplete, 100, '% Hoàn thành');
      eq(data.goal.status, 'COMPLETED', 'Tự động hoàn thành');
    });

    await runTest('SAV-08', 'Phân bổ số dư khả dụng (Allocate) vào Goal 2: Nạp 2M -> currentAmount = 2M', async () => {
      // Số dư hiện tại của user vẫn còn đủ để phân bổ
      const { status, data } = await req('POST', `/api/savings/${goal2Id}/deposit`, {
        token: userToken,
        body: { amount: 2000000 },
      });
      eq(status, 200, 'HTTP status');
      eq(data.goal.currentAmount, 2000000, 'Số tiền sau phân bổ');
      eq(data.goal.percentComplete, 40, '% Hoàn thành');
    });

    // ==========================================================
    // MODULE 6: STATS, ANALYTICS & REPORTS
    // ==========================================================
    console.log('\n--- MODULE 6: Thống kê & Báo cáo (Stats & Reports) ---');

    await runTest('REP-01', 'Báo cáo cơ cấu chi tiêu theo danh mục (Category Breakdown) tính đúng %', async () => {
      const { status, data } = await req('GET', '/api/stats/categories?type=CHI', { token: userToken });
      eq(status, 200, 'HTTP status');
      ok(Array.isArray(data) && data.length > 0, 'Dữ liệu danh mục');
      // Tổng phần trăm các danh mục phải xấp xỉ 100%
      const totalPct = data.reduce((s, r) => s + r.percentage, 0);
      ok(totalPct >= 99 && totalPct <= 101, `Tổng tỷ trọng % phải là ~100%, thực tế là ${totalPct}%`);
    });

    await runTest('REP-02', 'Báo cáo xu hướng ngày (Daily Trend) trả về các mốc ngày liên tục', async () => {
      const { status, data } = await req('GET', '/api/stats/trend?days=7', { token: userToken });
      eq(status, 200, 'HTTP status');
      ok(Array.isArray(data) && data.length === 7, `Số ngày trả về phải là 7, thực tế là ${data.length}`);
      const hasFields = data.every((d) => 'date' in d && 'thu' in d && 'chi' in d);
      ok(hasFields, 'Mỗi bucket ngày phải có date, thu, chi');
    });

    await runTest('REP-03', 'Báo cáo xu hướng tháng (Monthly Trend) trả về các tháng liên tục', async () => {
      const { status, data } = await req('GET', '/api/stats/monthly?months=6', { token: userToken });
      eq(status, 200, 'HTTP status');
      ok(Array.isArray(data) && data.length === 6, 'Số tháng trả về phải là 6');
    });

    // ==========================================================
    // MODULE 7: SEARCH TRANSACTIONS
    // ==========================================================
    console.log('\n--- MODULE 7: Tìm kiếm Giao dịch (Search) ---');

    await runTest('SRC-01', 'Tìm kiếm theo từ khóa mô tả (q="siêu thị") trả đúng giao dịch', async () => {
      const { status, data } = await req('GET', '/api/transactions?q=siêu+thị', { token: userToken });
      eq(status, 200, 'HTTP status');
      ok(data.length >= 1, 'Tìm thấy ít nhất 1 giao dịch');
      ok(data.some((tx) => tx.description.includes('siêu thị')), 'Khớp mô tả');
    });

    await runTest('SRC-02', 'Tìm kiếm không phân biệt hoa thường (q="LƯƠNG" khớp "Lương")', async () => {
      const { status, data } = await req('GET', '/api/transactions?q=LƯƠNG', { token: userToken });
      eq(status, 200, 'HTTP status');
      ok(data.length >= 1, 'Tìm thấy giao dịch Lương');
    });

    await runTest('SRC-03', 'Tìm kiếm từ khóa không tồn tại trả về mảng rỗng', async () => {
      const { status, data } = await req('GET', '/api/transactions?q=từ-khoá-hoàn-toàn-không-có-trong-db', { token: userToken });
      eq(status, 200, 'HTTP status');
      eq(data.length, 0, 'Kết quả tìm kiếm phải rỗng');
    });

    // ==========================================================
    // MODULE 8: ADMIN & SECURITY
    // ==========================================================
    console.log('\n--- MODULE 8: Quản trị Phân quyền & Bảo mật (Admin & RBAC) ---');

    await runTest('ADM-01', 'User thường truy cập API Admin /api/admin/users bị chặn 403', async () => {
      const { status } = await req('GET', '/api/admin/users', { token: userToken });
      eq(status, 403, 'User thường không được vào admin');
    });

    await runTest('ADM-02', 'Admin đăng nhập và lấy danh sách người dùng thành công', async () => {
      const loginRes = await req('POST', '/api/auth/login', {
        body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      });
      eq(loginRes.status, 200, 'Admin đăng nhập');
      adminToken = loginRes.data.token;
      adminId = loginRes.data.user.id;

      const usersRes = await req('GET', '/api/admin/users', { token: adminToken });
      eq(usersRes.status, 200, 'Admin lấy danh sách user');
      ok(Array.isArray(usersRes.data) && usersRes.data.length >= 2, 'Số lượng user');
      // Không để lộ trường password
      const noPasswordExposed = usersRes.data.every((u) => !('password' in u));
      ok(noPasswordExposed, 'Danh sách admin không được lộ password');
    });

    await runTest('ADM-03', 'Admin khoá tài khoản User Test -> User Test bị chặn 403 ngay lập tức', async () => {
      const blockRes = await req('PUT', `/api/admin/users/${userId}/status`, {
        token: adminToken,
        body: { status: 'BLOCKED' },
      });
      eq(blockRes.status, 200, 'Khóa user thành công');

      // User Test thực hiện request bất kỳ bằng token của mình
      const checkRes = await req('GET', '/api/transactions', { token: userToken });
      eq(checkRes.status, 403, 'Tài khoản bị khóa phải trả về 403');
    });

    await runTest('ADM-04', 'Admin mở khóa tài khoản User Test -> User Test hoạt động trở lại', async () => {
      const unblockRes = await req('PUT', `/api/admin/users/${userId}/status`, {
        token: adminToken,
        body: { status: 'ACTIVE' },
      });
      eq(unblockRes.status, 200, 'Mở khóa user thành công');

      const checkRes = await req('GET', '/api/transactions', { token: userToken });
      eq(checkRes.status, 200, 'User hoạt động trở lại bình thường');
    });

    await runTest('ADM-05', 'Admin tự khoá chính mình bị chặn 400 (An toàn hệ thống)', async () => {
      const selfBlock = await req('PUT', `/api/admin/users/${adminId}/status`, {
        token: adminToken,
        body: { status: 'BLOCKED' },
      });
      eq(selfBlock.status, 400, 'Admin không thể tự khóa tài khoản của mình');
    });

    // ==========================================================
    // MODULE 9: FRONTEND UI & VIEW INTEGRITY
    // ==========================================================
    console.log('\n--- MODULE 9: Kiểm tra Toàn vẹn Giao diện & Mã định danh UI (UI Integrity) ---');

    const feDir = path.resolve(__dirname, '../../quanlichitieu');

    const requiredScreenElements = [
      {
        file: 'index.html',
        screen: 'Tổng quan (Dashboard)',
        elements: ['stat-income', 'stat-expense', 'stat-savings', 'surplus-banner', 'surplus-amount'],
      },
      {
        file: 'transactions.html',
        screen: 'Sổ Giao dịch',
        elements: ['tx-table-body', 'tx-filter-btn', 'tx-filter-panel', 'tx-filter-type', 'tx-filter-start-date', 'tx-filter-end-date'],
      },
      {
        file: 'budget.html',
        screen: 'Quản lý Ngân sách',
        elements: ['budget-list', 'budget-month', 'add-budget-btn', 'budget-modal', 'budget-limit'],
      },
      {
        file: 'fixed-expenses.html',
        screen: 'Chi phí Cố định',
        elements: ['fixed-expense-list', 'fixed-expense-month', 'add-fixed-btn', 'fixed-expense-modal'],
      },
      {
        file: 'savings.html',
        screen: 'Mục tiêu Tiết kiệm',
        elements: ['goal-list', 'open-allocate-btn', 'goal-modal', 'allocate-modal'],
      },
      {
        file: 'reports.html',
        screen: 'Báo cáo & Thống kê',
        elements: ['report-month', 'reportTrendChart', 'reportCategoryChart', 'ai-insight-btn', 'ai-insight-content'],
      },
      {
        file: 'search.html',
        screen: 'Tìm kiếm',
        elements: ['search-input', 'search-status', 'tx-table-body'],
      },
      {
        file: 'settings.html',
        screen: 'Cài đặt & Hồ sơ',
        elements: ['old-password', 'new-password', 'confirm-password', 'change-password-btn'],
      },
      {
        file: 'login.html',
        screen: 'Đăng nhập',
        elements: ['login-form', 'email', 'password', 'error-msg'],
      },
      {
        file: 'register.html',
        screen: 'Đăng ký',
        elements: ['register-form', 'name', 'email', 'password', 'error-msg'],
      },
    ];

    for (const screenTest of requiredScreenElements) {
      await runTest(`UI-${screenTest.file}`, `Kiểm tra HTML & DOM IDs màn hình ${screenTest.screen} (${screenTest.file})`, async () => {
        const filePath = path.join(feDir, screenTest.file);
        ok(fs.existsSync(filePath), `File ${screenTest.file} không tồn tại`);
        const content = fs.readFileSync(filePath, 'utf-8');
        for (const elId of screenTest.elements) {
          ok(content.includes(`id="${elId}"`), `Thiếu phần tử #${elId} trên màn hình ${screenTest.file}`);
        }
      });
    }

  } finally {
    // Dọn dẹp dữ liệu test của user tạm để giữ DB sạch
    if (userId) {
      console.log('\n🧹 Đang dọn dẹp dữ liệu test tạm...');
      try {
        await prisma.transaction.deleteMany({ where: { userId } });
        await prisma.budget.deleteMany({ where: { userId } });
        await prisma.fixedExpense.deleteMany({ where: { userId } });
        await prisma.savingsGoal.deleteMany({ where: { userId } });
        await prisma.notification.deleteMany({ where: { userId } });
        await prisma.user.deleteMany({ where: { id: userId } });
        console.log('✅ Đã dọn dẹp sạch sẽ tài khoản test tạm thời.');
      } catch (err) {
        console.error('Lỗi khi dọn dẹp:', err.message);
      }
    }
    await prisma.$disconnect();
  }

  // ============================================================
  // TỔNG KẾT
  // ============================================================
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n' + '='.repeat(70));
  console.log(`📊 BÁO CÁO KẾT QUẢ TEST: ${passCount} PASS | ${failCount} FAIL (Tổng số: ${results.length} cases) trong ${duration}s`);
  console.log('='.repeat(70));

  if (failCount > 0) {
    console.log('\n❌ DANH SÁCH CÁC TEST CASES BỊ LỖI (BUG):');
    results.filter((r) => r.status === 'FAIL').forEach((r, idx) => {
      console.log(`  ${idx + 1}. [${r.caseId}] ${r.name}`);
      console.log(`     └─ ${r.error}`);
    });
    process.exit(1);
  } else {
    console.log('\n🎉 TẤT CẢ TEST CASES ĐÃ PASS 100%! HỆ THỐNG HOẠT ĐỘNG HOÀN TOÀN CHUẨN XÁC.\n');
    process.exit(0);
  }
})();
