/**
 * Kết nối backend với Ollama Cloud.
 * API key chỉ được đọc và dùng ở backend.
 */
const prisma = require("./db");
const { ApiError } = require("../utils/helpers");
const { getSetting } = require("../utils/settings");

const OLLAMA_URL = "https://ollama.com/api/chat";
const FALLBACK_MODEL = "gpt-oss:20b-cloud";

// Ưu tiên model Admin, rồi môi trường, rồi mặc định.
async function resolveModel() {
  const fromDb = await getSetting("ollama_model");
  if (fromDb) return fromDb;
  return process.env.OLLAMA_MODEL || FALLBACK_MODEL;
}

/**
 * Gửi messages tới Ollama và đọc phản hồi.
 * Trả về: { model, content, promptTokens, completionTokens }
 */
async function callOllama(messages) {
  // Key xác thực Ollama, khác JWT đăng nhập.
  const apiKey = process.env.OLLAMA_API_KEY;
  if (!apiKey) {
    throw new ApiError(
      500,
      "Chưa cấu hình API key AI trên server. Vui lòng điền OLLAMA_API_KEY vào file .env.",
    );
  }

  const model = await resolveModel();

  let data;
  try {
    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      // Nhận toàn bộ câu trả lời một lần.
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: {
          num_predict: 1024,
          temperature: 0.2,
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new ApiError(
        502,
        `Dịch vụ AI trả về lỗi (${response.status}). ${detail.slice(0, 200)}`,
      );
    }
    data = await response.json();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      502,
      "Không thể kết nối tới dịch vụ AI. Vui lòng thử lại sau.",
    );
  }
  const promptTokens = data.prompt_eval_count || 0;
  const completionTokens = data.eval_count || 0;
  const content = (data.message?.content || "").trim();

  // Trả nội dung và token để controller xử lý.
  return {
    model,
    content: content || "AI không trả về nội dung nào.",
    promptTokens,
    completionTokens,
  };
}

// Ước lượng chi phí USD theo số token.
function estimateCost(promptTokens, completionTokens) {
  return Number(
    ((promptTokens * 0.15 + completionTokens * 0.6) / 1_000_000).toFixed(8),
  );
}

module.exports = { callOllama, resolveModel, estimateCost };
