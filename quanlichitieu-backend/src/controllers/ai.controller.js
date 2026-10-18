/**
 * Proxy AI (giữ nguyên "hợp đồng" mà Frontend đang gọi):
 * - POST /api/ai-insights  body: { summary }                    -> 200 { insight }
 * - POST /api/ai-chat      body: { message, history, summary }  -> 200 { reply }
 * Lỗi trả về JSON { error } kèm status tương ứng.
 *
 * Mọi request đều được ghi vào bảng AiLog để Admin thống kê,
 * và bị giới hạn bởi hạn mức câu hỏi AI mỗi ngày (AppSetting 'ai_daily_quota').
 */
const prisma = require('../config/db');
const { asyncHandler, assert, requireFields, startOfToday } = require('../utils/helpers');
const { getSetting } = require('../utils/settings');
const { callOllama, estimateCost } = require('../config/ollama');

// Giữ nguyên giọng điệu như server cũ của FE
function buildSystemPrompt(summary) {
  return (
    'Bạn là trợ lý tài chính cá nhân chuyên nghiệp bằng tiếng Việt.\n' +
    'Dữ liệu tài chính của người dùng được cung cấp dưới dạng các BẢNG DỮ LIỆU chuẩn Markdown gồm:\n' +
    '1. Bảng tổng hợp thu chi theo tháng\n' +
    '2. Bảng chi tiêu theo danh mục qua các tháng\n' +
    '3. Bảng theo dõi hạn mức ngân sách\n' +
    '4. Bảng mục tiêu tiết kiệm\n' +
    '5. Bảng dữ liệu chi tiết các giao dịch\n\n' +
    'Hướng dẫn tra cứu và trả lời:\n' +
    '- Tra cứu trực tiếp từ các cột và dòng trong bảng dữ liệu để trả lời chính xác từng giao dịch, ngày tháng, danh mục, số tiền.\n' +
    '- Khi người dùng hỏi so sánh các tháng hoặc tổng hợp danh mục, hãy tổng hợp từ bảng và ưu tiên trả lời bằng BẢNG MARKDOWN rõ ràng, dễ nhìn.\n' +
    '- Đưa ra phân tích chi tiết xu hướng tài chính và lời khuyên thiết thực dựa trên các bảng dữ liệu thực tế.\n\n' +
    `DƯỚI ĐÂY LÀ CÁC BẢNG DỮ LIỆU TÀI CHÍNH:\n${summary || '(chưa có dữ liệu)'}`
  );
}

async function checkQuota(userId) {
  const quota = parseInt((await getSetting('ai_daily_quota')) || '50', 10);
  if (!Number.isFinite(quota) || quota <= 0) return; // quota <= 0 coi như không giới hạn

  const used = await prisma.aiLog.count({
    where: { userId, endpoint: { in: ['ai-insights', 'ai-chat'] }, createdAt: { gte: startOfToday() } },
  });
  assert(used < quota, 429, `Bạn đã đạt hạn mức ${quota} câu hỏi AI mỗi ngày. Vui lòng thử lại vào ngày mai.`);
}

async function logUsage(userId, endpoint, result) {
  try {
    await prisma.aiLog.create({
      data: {
        userId,
        endpoint,
        model: result.model,
        tokens: result.promptTokens + result.completionTokens,
        costEstimate: estimateCost(result.promptTokens, result.completionTokens),
      },
    });
  } catch (err) {
    // Ghi log thất bại không làm hỏng kết quả đã tạo
    console.error('[AI LOG]', err.message);
  }
}

// POST /api/ai-insights
exports.getInsights = asyncHandler(async (req, res) => {
  requireFields(req.body, ['summary']);
  // Kiểm tra người dùng còn lượt AI không
  await checkQuota(req.userId);
  // Tạo nội dung gửi cho mô hình AI

  const messages = [
    { role: 'system', content: buildSystemPrompt(String(req.body.summary)) },
    { role: 'user', content: 'Hãy phân tích chi tiết tình hình tài chính của tôi theo từng tháng, so sánh sự thay đổi giữa các tháng gần nhất, chỉ ra các khoản chi tiêu nhiều nhất và đưa ra lời khuyên cụ thể để tối ưu chi tiêu và tiết kiệm.' },
  ];
  // Gọi Ollama và chờ kết quả
  const result = await callOllama(messages);
  await logUsage(req.userId, 'ai-insights', result);

  // Gửi câu trả lời về frontend
  res.json({ insight: result.content });
});

// POST /api/ai-chat
exports.chat = asyncHandler(async (req, res) => {
  requireFields(req.body, ['message']);
  assert(String(req.body.message).trim() !== '', 400, 'Câu hỏi không được để trống.');
  await checkQuota(req.userId);

  // Lấy lịch sử từ frontend, Chỉ giữ tối đa 10 lượt hội thoại gần nhất, đúng như server cũ của FE
  const history = Array.isArray(req.body.history)
    ? req.body.history
      .filter((m) => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string')
      .slice(-10)
    : [];
  // Chuẩn bị dữ liệu gửi cho Ollama
  const messages = [
    // Vai trò AI + summary tài chính
    { role: 'system', content: buildSystemPrompt(String(req.body.summary || '')) },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: String(req.body.message) },
  ];
  // Gọi Ollama và nhận kết quả
  const result = await callOllama(messages);
  await logUsage(req.userId, 'ai-chat', result);
  // Trả kết quả cho frontend
  res.json({ reply: result.content });
});
