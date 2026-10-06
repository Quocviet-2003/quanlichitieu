/**
 * API TEST SUITE - kiểm tra TOÀN BỘ luồng của ChiLotus Backend.
 *
 * Điều kiện chạy:
 *   1. DB đang chạy        : docker-compose up -d
 *   2. Schema đã đồng bộ   : npm run db:push
 *   3. Đã seed dữ liệu mẫu : npm run db:seed   (cần tài khoản admin mặc định)
 *   4. Server đang chạy    : npm run dev       (mặc định http://localhost:3001)
 *
 * Chạy test:
 *   npm run test:api
 *
 * Tuỳ chọn:
 *   TEST_BASE_URL=http://localhost:3001  -> địa chỉ server cần test
 *   SKIP_AI=1                            -> bỏ qua các test gọi AI thật (tốn quota)
 *
 * Kết quả: in ra từng case PASS/FAIL/SKIP, tổng kết cuối cùng,
 * exit code = 1 nếu có FAIL (tiện cho CI).
 */
const TEST_BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3001';
const SKIP_AI = process.env.SKIP_AI === '1';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@chilotus.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Load .env để một số case đặc biệt có thể truy vấn DB trực tiếp
// (biến môi trường đã đặt từ ngoài sẽ được ưu tiên, không bị ghi đè)
require('dotenv').config();

// ---------- Khung chạy test ----------
const results = [];
let passCount = 0;
let failCount = 0;
let skipCount = 0;

function ok(condition, message) {
  if (!condition) throw new Error(message);
}

// Id giờ là MongoDB ObjectId (chuỗi 24 ký tự hex), không còn là số nguyên
function isObjectId(id) {
  return typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id);
}

function eq(actual, expected, label) {
  const a = typeof actual === 'number' ? Math.round(actual * 100) / 100 : actual;
  const b = typeof expected === 'number' ? Math.round(expected * 100) / 100 : expected;
  ok(a === b, `${label}: mong đợi ${JSON.stringify(b)} nhưng nhận ${JSON.stringify(a)}`);
}

async function test(name, fn) {
  try {
    await fn();
    passCount += 1;
    results.push({ name, status: 'PASS' });
    console.log(`  ✅ PASS | ${name}`);
  } catch (err) {
    failCount += 1;
    results.push({ name, status: 'FAIL', error: err.message });
    console.log(`  ❌ FAIL | ${name}\n           └─ ${err.message}`);
  }
}

async function skip(name, reason) {
  skipCount += 1;
  results.push({ name, status: 'SKIP', error: reason });
  console.log(`  ⏭️  SKIP | ${name} (${reason})`);
}

// ---------- HTTP helper ----------
async function req(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${TEST_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    const netErr = new Error(`NETWORK_ERROR: ${err.message}`);
    netErr.isNetwork = true;
    throw netErr;
  }

  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    /* body rỗng hoặc không phải JSON */
  }
  return { status: res.status, data };
}

// ---------- Dữ liệu dùng chung ----------
const ts = Date.now();
const U1 = { name: 'Người Dùng Một', email: `test.u1.${ts}@example.com`, password: 'matkhau1' };
const U2 = { name: 'Người Dùng Hai', email: `test.u2.${ts}@example.com`, password: 'matkhau2' };
let u1Token;
let u1Email = U1.email; // Email hiện tại của U1 (có thể bị đổi giữa chừng bởi test profile)
let u1Id;
let u2Token;
let adminToken;
let adminId;
let aiOnline = true; // dịch vụ AI có reachable hay không

const now = new Date();
const Y = now.getUTCFullYear();
const M = now.getUTCMonth(); // 0-based
const pad = (n) => String(n).padStart(2, '0');
const CM = `${Y}-${pad(M + 1)}`; // tháng hiện tại 'YYYY-MM'
const PM = M === 0 ? `${Y - 1}-12` : `${Y}-${pad(M)}`; // tháng trước
const atDay = (monthKey, day) => `${monthKey}-${pad(day)}T12:00:00.000Z`;

// Số liệu kỳ vọng của U1 sau khi tạo xong giao dịch
const EXP = {
  incomeTotal: 15_000_000 + 2_000_000,
  expenseTotal: 85_000 + 450_000 + 65_000 + 300_000,
};

// ============================================================
// A. HẠ TẦNG / PUBLIC
// ============================================================
async function sectionInfra() {
  console.log('\n=== A. Hạ tầng & public endpoints ===');

  await test('GET / -> trang chủ app (HTML) khi có frontend, ngược lại JSON welcome', async () => {
    const res = await fetch(`${TEST_BASE_URL}/`, { signal: AbortSignal.timeout(30_000) });
    eq(res.status, 200, 'HTTP status');
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      // Backend đang phục vụ luôn frontend: trang chủ phải là HTML của app
      const html = await res.text();
      ok(html.includes('<html'), 'Nội dung không giống HTML');
    } else {
      const data = await res.json();
      ok(data.message && data.message.includes('ChiLotus'), 'Thiếu welcome message');
    }
  });

  await test('GET /index.html phục vụ frontend tĩnh (status 200)', async () => {
    const res = await fetch(`${TEST_BASE_URL}/index.html`, { signal: AbortSignal.timeout(30_000) });
    eq(res.status, 200, 'HTTP status');
    const html = await res.text();
    ok(html.includes('<html'), 'Nội dung không giống HTML');
  });

  await test('GET /api/khong-ton-tai trả 404 dạng JSON', async () => {
    const { status, data } = await req('GET', '/api/khong-ton-tai');
    eq(status, 404, 'HTTP status');
    ok(data.error, 'Thiếu trường error');
  });

  await test('Body JSON sai cú pháp trả 400 (không crash server)', async () => {
    const res = await fetch(`${TEST_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{json hỏng',
      signal: AbortSignal.timeout(30_000),
    });
    eq(res.status, 400, 'HTTP status');
  });
}

// ============================================================
// B. XÁC THỰC & HỒ SƠ
// ============================================================
async function sectionAuth() {
  console.log('\n=== B. Đăng ký / Đăng nhập / Hồ sơ ===');

  await test('Register thiếu email -> 400', async () => {
    const { status } = await req('POST', '/api/auth/register', { body: { password: 'x' } });
    eq(status, 400, 'HTTP status');
  });

  await test('Register email sai định dạng -> 400', async () => {
    const { status } = await req('POST', '/api/auth/register', {
      body: { email: 'khong-hop-le', password: 'matkhau1' },
    });
    eq(status, 400, 'HTTP status');
  });

  await test('Register mật khẩu < 6 ký tự -> 400', async () => {
    const { status } = await req('POST', '/api/auth/register', {
      body: { email: U1.email, password: '123' },
    });
    eq(status, 400, 'HTTP status');
  });

  await test('Đăng ký U1 thành công -> trả token + user (KHÔNG lộ password)', async () => {
    const { status, data } = await req('POST', '/api/auth/register', { body: U1 });
    eq(status, 201, 'HTTP status');
    ok(typeof data.token === 'string' && data.token.length > 20, 'Thiếu/cấu token');
    eq(data.user.email, U1.email, 'user.email');
    eq(data.user.name, U1.name, 'user.name');
    ok(!('password' in data.user), 'Response làm lộ password!');
    u1Token = data.token;
    u1Id = data.user.id;
  });

  await test('Register trùng email -> 400 kèm thông báo tiếng Việt', async () => {
    const { status, data } = await req('POST', '/api/auth/register', { body: U1 });
    eq(status, 400, 'HTTP status');
    ok(data.error.includes('Email đã được sử dụng'), `Sai message: ${data.error}`);
  });

  await test('Login email không tồn tại -> 404', async () => {
    const { status } = await req('POST', '/api/auth/login', {
      body: { email: `khongton tai.${ts}@example.com`, password: 'whatever' },
    });
    eq(status, 404, 'HTTP status');
  });

  await test('Login sai mật khẩu -> 401', async () => {
    const { status } = await req('POST', '/api/auth/login', {
      body: { email: U1.email, password: 'saimat-khau' },
    });
    eq(status, 401, 'HTTP status');
  });

  await test('Login đúng -> nhận token mới', async () => {
    const { status, data } = await req('POST', '/api/auth/login', {
      body: { email: u1Email, password: U1.password },
    });
    eq(status, 200, 'HTTP status');
    ok(data.token.length > 20, 'Thiếu token');
    u1Token = data.token;
  });

  await test('GET /me không có token -> 403', async () => {
    const { status } = await req('GET', '/api/auth/me');
    eq(status, 403, 'HTTP status');
  });

  await test('GET /me sai token -> 401', async () => {
    const { status } = await req('GET', '/api/auth/me', { token: 'token-gia-ma' });
    eq(status, 401, 'HTTP status');
  });

  await test('GET /me đúng -> thông tin khớp U1', async () => {
    const { status, data } = await req('GET', '/api/auth/me', { token: u1Token });
    eq(status, 200, 'HTTP status');
    eq(data.email, u1Email, 'email');
    eq(data.id, u1Id, 'id');
  });

  await test('PUT /profile cập nhật tên/bio/avatar -> đọc lại thấy thay đổi', async () => {
    const { status } = await req('PUT', '/api/auth/profile', {
      token: u1Token,
      body: { name: 'Tên Đã Sửa', bio: 'Bio test', avatar: 'https://example.com/a.png' },
    });
    eq(status, 200, 'HTTP status');
    const me = await req('GET', '/api/auth/me', { token: u1Token });
    eq(me.data.name, 'Tên Đã Sửa', 'name');
    eq(me.data.bio, 'Bio test', 'bio');
    eq(me.data.avatar, 'https://example.com/a.png', 'avatar');
  });

  await test('PUT /profile đổi sang email ĐÃ có người dùng (admin seed) -> 400', async () => {
    const { status, data } = await req('PUT', '/api/auth/profile', {
      token: u1Token,
      body: { email: ADMIN_EMAIL },
    });
    eq(status, 400, 'HTTP status');
    ok(data.error.includes('Email đã được sử dụng'), `Sai message: ${data.error}`);
  });

  await test('PUT /profile đổi email hợp lệ -> /me trả email mới', async () => {
    u1Email = `renamed.${ts}@example.com`;
    const { status } = await req('PUT', '/api/auth/profile', {
      token: u1Token,
      body: { email: u1Email },
    });
    eq(status, 200, 'HTTP status');
    const me = await req('GET', '/api/auth/me', { token: u1Token });
    eq(me.data.email, u1Email, 'email sau khi đổi');
  });

  await test('PUT /password với mật khẩu cũ sai -> 401', async () => {
    const { status } = await req('PUT', '/api/auth/password', {
      token: u1Token,
      body: { oldPassword: 'cu-sai', newPassword: 'matkhaumoi1' },
    });
    eq(status, 401, 'HTTP status');
  });

  await test('PUT /password thành công -> login bằng mật khẩu mới OK, cũ FAIL', async () => {
    const { status } = await req('PUT', '/api/auth/password', {
      token: u1Token,
      body: { oldPassword: U1.password, newPassword: 'matkhaumoi1' },
    });
    eq(status, 200, 'HTTP status đổi password');

    const oldLogin = await req('POST', '/api/auth/login', {
      body: { email: u1Email, password: U1.password },
    });
    eq(oldLogin.status, 401, 'Login mật khẩu cũ phải thất bại');

    const newLogin = await req('POST', '/api/auth/login', {
      body: { email: u1Email, password: 'matkhaumoi1' },
    });
    eq(newLogin.status, 200, 'Login mật khẩu mới phải thành công');
    u1Token = newLogin.data.token;
  });

  await test('Đăng ký U2 (phục vụ test phân quyền dữ liệu)', async () => {
    const { status, data } = await req('POST', '/api/auth/register', { body: U2 });
    eq(status, 201, 'HTTP status');
    u2Token = data.token;
  });
}

// ============================================================
// B2. VÍ TIỀN & LUỒNG THANH TOÁN NẠP TIỀN (có quy trình gateway)
//     Tạo đơn -> thanh toán theo phương thức -> xác nhận -> tiền về ví
// ============================================================

// Helper: nạp tiền qua đúng luồng checkout (giả lập khách hàng đi hết các bước)
async function depositViaCheckout(token, amount, method = 'BANK') {
  const created = await req('POST', '/api/auth/wallet/checkout', { token, body: { amount, method } });
  ok(created.status === 201 && created.data.order?.orderCode,
    `Tạo đơn nạp thất bại: ${JSON.stringify(created.data)}`);
  const body = method === 'CARD'
    ? { cardNumber: '4111111111111111', cardName: 'NGUYEN VAN A', expiry: '12/29', otp: '123456' }
    : { confirmed: true };
  const confirmed = await req('POST', `/api/auth/wallet/checkout/${created.data.order.orderCode}/confirm`, { token, body });
  ok(confirmed.status === 200, `Xác nhận đơn nạp thất bại: ${JSON.stringify(confirmed.data)}`);
  return confirmed.data;
}

async function sectionWallet() {
  console.log('\n=== B2. Ví tiền & luồng thanh toán nạp tiền có quy trình ===');

