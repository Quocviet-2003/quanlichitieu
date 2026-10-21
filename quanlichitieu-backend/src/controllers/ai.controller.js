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

// Ghép quy tắc trả lời với số liệu frontend.
function buildSystemPrompt(summary) {
  return (
    "Bạn là chuyên gia tài chính cá nhân súc tích. Luôn trả lời siêu ngắn gọn bằng tiếng Việt.\n" +
    "Quy tắc bắt buộc:\n" +
    "- Trả lời thẳng vào trọng tâm trong đúng 3 gạch đầu dòng ngắn (-).\n" +
    "- Mỗi gạch đầu dòng chỉ 1 câu ngắn gọn, không giải thích dài dòng.\n" +
    "- Tuyệt đối không có lời chào hỏi, không mở bài hay kết bài xã giao.\n" +
    "- Không dùng bảng biểu, không dùng ký tự |, không dùng **.\n" +
    `Dữ liệu tài chính người dùng:\n${summary || "(chưa có dữ liệu)"}`
  );
}

// Giới hạn chung phân tích và chat mỗi ngày.
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

// Lưu thống kê sau khi gọi AI thành công.
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
  // Kiểm tra frontend đã gửi summary.
  requireFields(req.body, ["summary"]);
  await checkQuota(req.userId);

  // system đặt quy tắc; user yêu cầu phân tích.
  const messages = [
    { role: "system", content: buildSystemPrompt(String(req.body.summary)) },
    {
      role: "user",
      content:
        "Nhận xét tài chính nhanh trong đúng 3 gạch đầu dòng ngắn (-), mỗi gạch 1 câu:\n" +
        "- Tổng quan: Tổng thu, tổng chi và số dư (thặng dư hay thâm hụt).\n" +
        "- Đáng chú ý: Khoản chi nhiều nhất hoặc danh mục vượt ngân sách.\n" +
        "- Gợi ý tiết kiệm: 1 hành động thực tế, ngắn nhất để tối ưu chi phí.\n" +
        "Yêu cầu: Không mở đầu, không kết thúc, dưới 70 từ.",
    },
  ];
  // Gửi yêu cầu và đợi kết quả Ollama.
  const result = await callOllama(messages);
  await logUsage(req.userId, "ai-insights", result);

  // Trả insight để frontend hiển thị nhận xét.
  const cleanInsight = cleanAiResponse(result.content);
  res.json({ insight: cleanInsight || result.content });
});

exports.chat = asyncHandler(async (req, res) => {
  if (!req.body.message && req.body.question) {
    req.body.message = req.body.question;
  }
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
        "\nKhi trả lời câu hỏi: Trả lời đúng trọng tâm trong 1-2 câu hoặc tối đa 2-3 gạch đầu dòng ngắn, không dài dòng.",
    },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: String(req.body.message) },
  ];
  const result = await callOllama(messages);
  await logUsage(req.userId, "ai-chat", result);
  const cleanReply = cleanAiResponse(result.content);
  res.json({ reply: cleanReply || result.content });
});
