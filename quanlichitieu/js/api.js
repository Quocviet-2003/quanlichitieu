// api.js
// Đây là lớp gọi API THẬT tới backend (thư mục quanlichitieu-backend).
// Tên hàm và dữ liệu trả về GIỮ NGUYÊN so với bản giả lập localStorage
// trước đây, nên toàn bộ phần còn lại của app không cần đổi gì cả.
//
// Cách chạy app:
//   cd quanlichitieu-backend && npm run dev
//   -> Mở http://localhost:3000 (backend tự phục vụ luôn giao diện này,
//      nhờ vậy các fetch() tương đối "/api/..." đi thẳng vào API, khỏi lo CORS).
// Nếu bạn mở giao diện bằng server khác, hãy đổi API_BASE bên dưới
// thành địa chỉ backend, ví dụ: const API_BASE = 'http://localhost:3000';

const API_BASE = ''; // Để trống = cùng origin với trang hiện tại

// Lấy token đăng nhập đã lưu.
function getToken() {
  return localStorage.getItem('token');
}

// [Dashboard] Gọi API kèm token, đọc JSON và xử lý lỗi.
async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  // Gửi token để backend biết đang lấy dữ liệu của tài khoản nào.
  if (getToken()) headers['Authorization'] = `Bearer ${getToken()}`;

  let res;
  try {
    // Chờ backend xử lý yêu cầu và trả phản hồi HTTP.
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch (err) {
    throw new Error('Không kết nối được máy chủ. Hãy chắc chắn backend đang chạy (npm run dev).');
  }

  let data = null;
  try {
    // Đọc nội dung JSON thành dữ liệu JavaScript cho main.js sử dụng.
    data = await res.json();
  } catch (err) {
    // Phản hồi không có body JSON
  }

  if (!res.ok) {
    // Token hết hạn hoặc không hợp lệ -> đăng xuất về trang login (trừ trang login)
    if (res.status === 401 && !window.location.pathname.includes('login.html')) {
      logout();
    }
    throw new Error((data && data.error) || `Lỗi HTTP ${res.status}`);
  }
  return data;
}

// --- ĐĂNG NHẬP / ĐĂNG KÝ ---

async function apiLogin(email, password) {
  if (!email || !password) throw new Error('Vui lòng nhập email và mật khẩu');
  // Backend trả về: { message, token, user: { id, name, email } }
  return apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
}

async function apiRegister(name, email, password) {
  if (!email || !password) throw new Error('Vui lòng nhập đầy đủ thông tin');
  // Backend trả về: { message, token, user } — đăng ký xong là đăng nhập luôn
  return apiFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password })
  });
}

// Đăng xuất: xóa token đã lưu và quay về trang đăng nhập
async function logout() {
  try {
    if (getToken()) {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    }
  } catch (e) {
    // Bỏ qua lỗi nếu token đã hết hạn
  }
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = 'login.html';
}

// --- GIAO DỊCH (THU NHẬP / CHI TIÊU) ---

// [Dashboard] Bảng giao dịch gọi không bộ lọc: lấy tối đa 1.000 giao dịch mới nhất.
async function apiGetTransactions(params = {}) {
  const sp = new URLSearchParams();
  if (params.from) sp.append('from', params.from);
  if (params.to) sp.append('to', params.to);
  if (params.month) sp.append('month', params.month);
  if (params.type) sp.append('type', params.type);
  if (params.category) sp.append('category', params.category);
  if (params.q) sp.append('q', params.q);
  const qs = sp.toString();
  return apiFetch(`/api/transactions${qs ? `?${qs}` : ''}`);
}

async function apiCreateTransaction(txData) {
  return apiFetch('/api/transactions', {
    method: 'POST',
    body: JSON.stringify(txData)
  });
}

async function apiUpdateTransaction(id, txData) {
  return apiFetch(`/api/transactions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(txData)
  });
}

async function apiDeleteTransaction(id) {
  return apiFetch(`/api/transactions/${id}`, { method: 'DELETE' });
}

// --- NGÂN SÁCH (budget.html) ---
// Lấy ngân sách theo tháng đang chọn.
async function apiGetBudgets(options = '') {
  if (typeof options === 'string') {
    const query = options ? `?month=${encodeURIComponent(options)}` : '';
    return apiFetch(`/api/budgets${query}`);
  }
  const sp = new URLSearchParams();
  if (options && options.month) sp.append('month', options.month);
  if (options && options.from) sp.append('from', options.from);
  if (options && options.to) sp.append('to', options.to);
  const qs = sp.toString();
  return apiFetch(`/api/budgets${qs ? `?${qs}` : ''}`);
}

async function apiCreateBudget(budgetData) {
  // budgetData nhận từ form, có dạng: { category, limitAmount, month? }.
  return apiFetch('/api/budgets', {
    method: 'POST', // POST dùng để yêu cầu backend tạo một ngân sách mới.
    body: JSON.stringify(budgetData) // Chuyển object JavaScript thành chuỗi JSON để gửi qua HTTP.
  });
}

async function apiUpdateBudget(id, budgetData) {
  return apiFetch(`/api/budgets/${id}`, {
    method: 'PUT',
    body: JSON.stringify(budgetData)
  });
}

async function apiDeleteBudget(id) {
  return apiFetch(`/api/budgets/${id}`, { method: 'DELETE' });
}

// --- CHI CỐ ĐỊNH HÀNG THÁNG (fixed-expenses.html) ---

// Mỗi phần tử có dạng: { id, category, description, amount, deductDay, lastDeducted }
async function apiGetFixedExpenses(options = '') {
  let query = '';
  if (typeof options === 'string' && options) {
    query = `?month=${encodeURIComponent(options)}`;
  } else if (options && options.month) {
    query = `?month=${encodeURIComponent(options.month)}`;
  }
  return apiFetch(`/api/fixed-expenses${query}`);
}

//POST//
async function apiCreateFixedExpense(fixedExpenseData) {
  return apiFetch('/api/fixed-expenses', {
    method: 'POST',
    body: JSON.stringify(fixedExpenseData) // { category, description, amount, deductDay }
  });
}

// PUT: API cập nhật lịch chi. Hiện giao diện chưa có nút sửa nhưng backend đã hỗ trợ.
async function apiUpdateFixedExpense(id, fixedExpenseData) {
  return apiFetch(`/api/fixed-expenses/${id}`, {
    method: 'PUT',
    body: JSON.stringify(fixedExpenseData)
  });
}

// DELETE: xóa lịch chi trong tương lai; không xóa các giao dịch CHI đã phát sinh.
async function apiDeleteFixedExpense(id) {
  return apiFetch(`/api/fixed-expenses/${id}`, { method: 'DELETE' });
}

// --- THÔNG BÁO (notifications) ---

// Lấy các thông báo cron đã lưu trong database (thành công hoặc thất bại).
async function apiGetNotifications() {
  return apiFetch('/api/notifications');
}

async function apiMarkNotificationRead(id) {
  return apiFetch(`/api/notifications/${id}/read`, { method: 'PUT' });
}

async function apiMarkAllNotificationsRead() {
  return apiFetch('/api/notifications/read-all', { method: 'PUT' });
}

// --- MỤC TIÊU TIẾT KIỆM (savings.html) ---

// Mỗi phần tử: { id, name, targetAmount, currentAmount, deadline, monthlyContribution, status, percentComplete }
// Nút phân tích lấy mọi mục tiêu tiết kiệm.
async function apiGetSavingsGoals(params = {}) {
  const sp = new URLSearchParams();
  if (params.termType) sp.append('termType', params.termType);
  if (params.month) sp.append('month', params.month);
  if (params.status) sp.append('status', params.status);
  const qs = sp.toString();
  return apiFetch(`/api/savings${qs ? `?${qs}` : ''}`);
}

async function apiCreateSavingsGoal(goalData) {
  return apiFetch('/api/savings', {
    method: 'POST',
    body: JSON.stringify(goalData)
  });
}

async function apiUpdateSavingsGoal(id, goalData) {
  return apiFetch(`/api/savings/${id}`, {
    method: 'PUT',
    body: JSON.stringify(goalData)
  });
}

// [Dashboard] Gửi số tiền phân bổ và ngày chuyển vào một mục tiêu tiết kiệm.
async function apiDepositToGoal(id, amount, date = null) {
  const body = { amount };
  if (date) body.date = date;
  return apiFetch(`/api/savings/${id}/deposit`, {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

async function apiDeleteSavingsGoal(id) {
  return apiFetch(`/api/savings/${id}`, { method: 'DELETE' });
}

async function apiGetCategories() {
  return apiFetch('/api/categories');
}

// [Dashboard] Lấy số liệu cho các thẻ thu nhập, chi tiêu, tiết kiệm và banner số dư.
async function apiGetStatsSummary(options = null) {
  let query = '';
  // Chuỗi YYYY-MM lọc theo tháng; YYYY-MM-DD lọc theo ngày.
  if (typeof options === 'string') {
    if (options.length === 7) {
      query = `?month=${encodeURIComponent(options)}`;
    } else {
      query = `?date=${encodeURIComponent(options)}`;
    }
  } else if (options && typeof options === 'object') {
    if (options.month) query = `?month=${encodeURIComponent(options.month)}`;
    else if (options.date) query = `?date=${encodeURIComponent(options.date)}`;
  }
  return apiFetch(`/api/stats/summary${query}`);
}

// Thu/chi theo tháng (mặc định 6 tháng): [{ month: 'YYYY-MM', thu, chi }]
async function apiGetMonthlyTrend(months = 6) {
  return apiFetch(`/api/stats/monthly?months=${months}`);
}

// [Dashboard] Biểu đồ tròn lấy tổng tiền theo danh mục trong khoảng from/to.
// Mỗi phần tử: { category, total, percentage }.
async function apiGetCategoryBreakdown(type = 'CHI', from = null, to = null) {
  let url = `/api/stats/categories?type=${encodeURIComponent(type)}`;
  if (from) url += `&from=${encodeURIComponent(from)}`;
  if (to) url += `&to=${encodeURIComponent(to)}`;
  return apiFetch(url);
}

// [Dashboard] Biểu đồ đường lấy thu/chi từng ngày theo startDate/endDate.
// Mỗi phần tử: { date: 'YYYY-MM-DD', thu, chi }.
async function apiGetDailyTrend(days = 30, startDate = null, endDate = null) {
  // Ưu tiên khoảng ngày khi đủ hai ngày; khi đó tham số days không được dùng.
  if (startDate && endDate) {
    return apiFetch(`/api/stats/trend?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`);
  }
  // Nhánh dự phòng: cần thực sự gọi hàm khi thiếu ngày mới gửi days xuống backend.
  // Tổng quan hiện không gọi lại hàm khi người dùng xóa các ô ngày.
  return apiFetch(`/api/stats/trend?days=${days}`);
}

// --- ADMIN (quản trị hệ thống — chỉ role ADMIN mới gọi được) ---

async function apiAdminGetUsers(q = '') {
  const query = q ? `?q=${encodeURIComponent(q)}` : '';
  return apiFetch(`/api/admin/users${query}`);
}

async function apiAdminSetUserStatus(id, status) {
  return apiFetch(`/api/admin/users/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status })
  });
}

// Thống kê hệ thống: users/transactions/ai
async function apiAdminGetStats() {
  return apiFetch('/api/admin/stats');
}

async function apiAdminGetAiSettings() {
  return apiFetch('/api/admin/ai-settings');
}

async function apiAdminUpdateAiSettings(settingsData) {
  return apiFetch('/api/admin/ai-settings', {
    method: 'PUT',
    body: JSON.stringify(settingsData)
  });
}

// --- HỒ SƠ CÁ NHÂN (settings.html) ---

async function apiUpdateProfile(profileData) {
  return apiFetch('/api/auth/profile', {
    method: 'PUT',
    body: JSON.stringify(profileData) // { name, email, bio, avatar }
  });
}

async function apiChangePassword(oldPassword, newPassword) {
  return apiFetch('/api/auth/password', {
    method: 'PUT',
    body: JSON.stringify({ oldPassword, newPassword })
  });
}

async function apiGetAiInsight(summaryText) {
  const res = await apiFetch('/api/ai-insights', {
    method: 'POST',
    body: JSON.stringify({ summary: summaryText })
  });
  const insight = res && res.insight !== undefined ? res.insight : res;
  return typeof cleanAiResponse === 'function' ? cleanAiResponse(insight) : insight;
}

async function apiChatWithAi(message, history, summaryText) {
  const res = await apiFetch('/api/ai-chat', {
    method: 'POST',
    body: JSON.stringify({ message, history, summary: summaryText })
  });
  const reply = res && res.reply !== undefined ? res.reply : res;
  return typeof cleanAiResponse === 'function' ? cleanAiResponse(reply) : reply;
}

