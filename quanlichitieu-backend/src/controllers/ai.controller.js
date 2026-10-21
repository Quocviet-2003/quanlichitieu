/**
 * Nhận số liệu frontend, gọi AI và trả nhận xét:
 * - POST /api/ai-insights  body: { summary }                    -> 200 { insight }
 * - POST /api/ai-chat      body: { message, history, summary }  -> 200 { reply }
 * Lỗi trả về JSON { error } kèm status tương ứng.
 *
 * Chỉ gọi AI thành công mới thử ghi thống kê AiLog.
 */
const prisma = require("../config/db");
const {
  asyncHandler,
  assert,
  requireFields,
  startOfToday,
} = require("../utils/helpers");
const { getSetting } = require("../utils/settings");
const { callOllama, estimateCost } = require("../config/ollama");

// Làm gọn văn bản AI trước khi trả frontend.
function cleanAiResponse(text) {
  if (!text || typeof text !== "string") return "";
  let str = text.replace(/\|\s*\|/g, "\n");
  str = str.replace(/([^\n])\s+(\d+\.\s+)/g, "$1\n$2");
  str = str.replace(/\*\*/g, "");

  const lines = str
    .split("\n")
    .map((l) => {
      let line = l.trim().replace(/^[\s|]+|[\s|]+$/g, "");
      if (/^[\s\-:|]+$/.test(line)) return "";
      return line.replace(/\s*\|\s*/g, " - ").trim();
    })
    .filter(Boolean)
    .filter((l) => !/^(chào|dưới đây là|hy vọng|chúc bạn|sau đây là)/i.test(l));

  return lines.join("\n");
}

function buildSystemPrompt(summary) {
  return (
    "Bạn là cố vấn tài chính cá nhân thông minh. Dưới đây là toàn bộ dữ liệu tài chính của người dùng (thu chi, xu hướng các tháng, cơ cấu danh mục, ngân sách, mục tiêu tiết kiệm, chi phí cố định và top khoản chi lớn):\n" +
    `${summary || "(chưa có dữ liệu)"}\n\n` +
    "QUY TẮC PHẢN HỒI BẮT BUỘC:\n" +
    "- Phân tích toàn diện dữ liệu trên nhưng KHI TRẢ LỜI PHẢI CỰC KỲ NGẮN GỌN, SÚC TÍCH.\n" +
    "- Trả lời bằng đúng 3 đến 4 gạch đầu dòng ngắn (-).\n" +
    "- Mỗi gạch đầu dòng là 1 câu ngắn gọn, đi thẳng vào trọng tâm, không giải thích dông dài.\n" +
    "- Tuyệt đối không chào hỏi, không mở bài hay kết bài xã giao.\n" +
    "- Không dùng bảng biểu, không dùng ký tự |, không dùng **."
  );
}

async function checkQuota(userId) {
  const quota = parseInt((await getSetting("ai_daily_quota")) || "50", 10);
  if (!Number.isFinite(quota) || quota <= 0) return;

  const used = await prisma.aiLog.count({
    where: {
      userId,
      endpoint: { in: ["ai-insights", "ai-chat"] },
      createdAt: { gte: startOfToday() },
    },
  });
  assert(
    used < quota,
    429,
    `Bạn đã đạt hạn mức ${quota} câu hỏi AI mỗi ngày. Vui lòng thử lại vào ngày mai.`,
  );
}

async function logUsage(userId, endpoint, result) {
  try {
    await prisma.aiLog.create({
      data: {
        userId,
        endpoint,
        model: result.model,
        tokens: result.promptTokens + result.completionTokens,
        costEstimate: estimateCost(
          result.promptTokens,
          result.completionTokens,
        ),
      },
    });
  } catch (err) {
    console.error("[AI LOG]", err.message);
  }
}

exports.getInsights = asyncHandler(async (req, res) => {
  requireFields(req.body, ["summary"]);
  await checkQuota(req.userId);

  const messages = [
    { role: "system", content: buildSystemPrompt(String(req.body.summary)) },
    {
      role: "user",
      content:
        "Dựa vào dữ liệu tài chính chi tiết ở trên, hãy đưa ra nhận xét tài chính trong đúng 3 đến 4 gạch đầu dòng ngắn (-), mỗi gạch 1 câu:\n" +
        "- Tổng quan: Tổng thu, tổng chi và tỷ lệ tiết kiệm (thặng dư hay thâm hụt).\n" +
        "- Đáng chú ý: Khoản chi nhiều nhất, danh mục vượt hoặc sắp vượt ngân sách, chi phí cố định.\n" +
        "- Tiến độ mục tiêu: Đánh giá nhanh tiến độ tích lũy (nếu có mục tiêu).\n" +
        "- Hành động ngay: 1 lời khuyên thực tế, cụ thể nhất để tối ưu chi tiêu.\n" +
        "Yêu cầu: Siêu ngắn gọn, không chào hỏi, dưới 80 từ.",
    },
  ];
  const result = await callOllama(messages);
  await logUsage(req.userId, "ai-insights", result);

  const cleanInsight = cleanAiResponse(result.content);
  res.json({ insight: cleanInsight || result.content });
});

exports.chat = asyncHandler(async (req, res) => {
  requireFields(req.body, ["message"]);
  assert(
    String(req.body.message).trim() !== "",
    400,
    "Câu hỏi không được để trống.",
  );
  await checkQuota(req.userId);

  const history = Array.isArray(req.body.history)
    ? req.body.history
        .filter(
          (m) =>
            m &&
            ["user", "assistant"].includes(m.role) &&
            typeof m.content === "string",
        )
        .slice(-10)
    : [];
  const messages = [
    {
      role: "system",
      content:
        buildSystemPrompt(String(req.body.summary || "")) +
        "\nKhi trả lời câu hỏi: Dựa trên dữ liệu tài chính chi tiết đã cung cấp, nhưng trả lời trực diện, siêu ngắn gọn trong 1-2 câu hoặc tối đa 2-3 gạch đầu dòng ngắn, không dài dòng.",
    },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: String(req.body.message) },
  ];
  const result = await callOllama(messages);
  await logUsage(req.userId, "ai-chat", result);
  const cleanReply = cleanAiResponse(result.content);
  res.json({ reply: cleanReply || result.content });
});
