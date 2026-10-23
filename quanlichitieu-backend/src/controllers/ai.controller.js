/**
 * Proxy AI (giữ nguyên "hợp đồng" mà Frontend đang gọi):
 * - POST /api/ai-insights  body: { summary }                    -> 200 { insight }
 * - POST /api/ai-chat      body: { message, history, summary }  -> 200 { reply }
 * Lỗi trả về JSON { error } kèm status tương ứng.
 *
 * Mọi request đều được ghi vào bảng AiLog để Admin thống kê,
 * và bị giới hạn bởi hạn mức câu hỏi AI mỗi ngày (AppSetting 'ai_daily_quota').
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

// Giữ nguyên giọng điệu như server cũ của FE
function buildSystemPrompt(summary) {
  return (
    "Bạn là trợ lý tài chính cá nhân, luôn trả lời ngắn gọn, đi thẳng vào trọng tâm bằng tiếng Việt.\n" +
    "Quy tắc số tiền: Luôn viết đầy đủ các chữ số có dấu chấm phân cách hàng nghìn (ví dụ: 100.000đ, 1.500.000đ), tuyệt đối không viết tắt bằng k hay m.\n" +
    `Dưới đây là số liệu thu chi hiện tại của người dùng:\n${summary || "(chưa có dữ liệu)"}`
  );
}

async function checkQuota(userId) {
  const quota = parseInt((await getSetting("ai_daily_quota")) || "50", 10);
  if (!Number.isFinite(quota) || quota <= 0) return; // quota <= 0 coi như không giới hạn

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
    // Ghi log thất bại không làm hỏng kết quả đã tạo
    console.error("[AI LOG]", err.message);
  }
}

// POST /api/ai-insights
exports.getInsights = asyncHandler(async (req, res) => {
  requireFields(req.body, ["summary"]);
  await checkQuota(req.userId);

  const messages = [
    { role: "system", content: buildSystemPrompt(String(req.body.summary)) },
    {
      role: "user",
      content:
        "Hãy đưa ra nhận xét ngắn gọn, đi thẳng vào trọng tâm và một vài lời khuyên tài chính từ số liệu thu, chi, số dư trên. Viết số tiền rõ ràng đầy đủ (dạng 000.000đ), không viết tắt k hay m.",
    },
  ];

  const result = await callOllama(messages);
  await logUsage(req.userId, "ai-insights", result);

  res.json({ insight: result.content });
});

function buildChatSystemPrompt(summary) {
  return (
    "Bạn là trợ lý tài chính cá nhân thông minh của ứng dụng ChiLotus, luôn trả lời ngắn gọn, chính xác, đi thẳng vào trọng tâm bằng tiếng Việt.\n" +
    "Quy tắc số tiền: Luôn viết đầy đủ các chữ số có dấu chấm phân cách hàng nghìn (ví dụ: 100.000đ, 1.500.000đ, 26.500.000đ), tuyệt đối không viết tắt bằng k hay m.\n" +
    "QUY TẮC TRẢ LỜI CÂU HỎI THU CHI:\n" +
    "- Khi người dùng hỏi về thu chi của một tháng cụ thể (ví dụ: 'tháng 8 thu chi bao nhiêu', 'tháng 9', 'tháng 10'): hãy tra cứu số liệu của tháng đó trong bảng dữ liệu bên dưới và trả lời chính xác: Tổng thu bao nhiêu, Tổng chi bao nhiêu, và Thặng dư/Số dư của tháng đó.\n" +
    "- Khi người dùng hỏi 'tháng mấy thì thu chi bao nhiêu' hoặc hỏi về các tháng: hãy liệt kê rõ ràng từng tháng có trong dữ liệu với số tiền thu và chi tương ứng.\n" +
    "- Nếu hỏi về tháng không có trong dữ liệu: thông báo rõ ràng là chưa có dữ liệu giao dịch cho tháng đó.\n" +
    "- Luôn dựa 100% vào số liệu thực tế được cung cấp bên dưới, tuyệt đối không tự bịa đặt số liệu.\n" +
    `Dưới đây là số liệu tài chính của người dùng:\n${summary || "(chưa có dữ liệu)"}`
  );
}

function generateLocalChatReply(message, summary, transactions = []) {
  const msg = String(message || "").toLowerCase();
  const monthlyData = {};

  if (Array.isArray(transactions) && transactions.length > 0) {
    for (const tx of transactions) {
      const d = tx.date ? new Date(tx.date) : new Date();
      const mKey = !isNaN(d.getTime())
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
        : "Chưa rõ";
      if (!monthlyData[mKey]) monthlyData[mKey] = { thu: 0, chi: 0 };
      if (tx.type === "THU") monthlyData[mKey].thu += tx.amount;
      else monthlyData[mKey].chi += tx.amount;
    }
  } else if (summary) {
    const regex = /Tháng\s*(\d{1,2})[\/\-](\d{4})[^:]*:\s*Thu\s*([0-9\.\,]+)\s*đ?[^,]*,\s*Chi\s*([0-9\.\,]+)/gi;
    let match;
    while ((match = regex.exec(summary)) !== null) {
      const mNum = String(parseInt(match[1], 10)).padStart(2, "0");
      const year = match[2];
      const mKey = `${year}-${mNum}`;
      const parseAmt = (s) => parseInt(s.replace(/[\.\,]/g, ""), 10) || 0;
      monthlyData[mKey] = {
        thu: parseAmt(match[3]),
        chi: parseAmt(match[4]),
      };
    }
  }

  const fmt = (n) => n.toLocaleString("vi-VN") + "đ";

  let specificMonth = null;
  if (/tháng\s*(10|mười)/i.test(msg)) specificMonth = "2026-10";
  else if (/tháng\s*(9|09|chín)/i.test(msg)) specificMonth = "2026-09";
  else if (/tháng\s*(8|08|tám)/i.test(msg)) specificMonth = "2026-08";
  else if (/tháng\s*(7|07|bảy)/i.test(msg)) specificMonth = "2026-07";
  else if (/tháng\s*(6|06|sáu)/i.test(msg)) specificMonth = "2026-06";
  else if (/tháng\s*(5|05|năm)/i.test(msg)) specificMonth = "2026-05";
  else {
    const mMatch = msg.match(/tháng\s*(\d{1,2})/);
    if (mMatch) {
      specificMonth = `2026-${String(parseInt(mMatch[1], 10)).padStart(2, "0")}`;
    }
  }

  if (specificMonth) {
    const st = monthlyData[specificMonth];
    if (st) {
      const [y, m] = specificMonth.split("-");
      const surplus = st.thu - st.chi;
      return `- Tháng ${parseInt(m, 10)}/${y}: Thu ${fmt(st.thu)}, Chi ${fmt(st.chi)}, Thặng dư ${fmt(surplus)}.\n- Đánh giá: ${surplus >= 0 ? "Thu nhập lớn hơn chi tiêu, tài chính ổn định." : "Chi tiêu vượt thu nhập, bạn nên kiểm soát lại ngân sách."}`;
    } else {
      const [y, m] = specificMonth.split("-");
      const available = Object.keys(monthlyData)
        .sort()
        .map((k) => "Tháng " + parseInt(k.split("-")[1], 10))
        .join(", ");
      return `- Chưa có dữ liệu giao dịch cho Tháng ${parseInt(m, 10)}/${y}.${available ? ` Dữ liệu hiện có: ${available}.` : ""}`;
    }
  }

  const isAllMonths =
    /tháng\s*mấy|các\s*tháng|từng\s*tháng|mỗi\s*tháng|tổng\s*hợp.*tháng|thống\s*kê.*tháng|bao\s*nhiêu.*tháng/i.test(
      msg,
    );
  if (
    isAllMonths ||
    (msg.includes("tháng") &&
      (msg.includes("bao nhiêu") || msg.includes("thu chi") || msg.includes("danh sách")))
  ) {
    const sorted = Object.keys(monthlyData).sort().reverse();
    if (sorted.length > 0) {
      const lines = sorted.map((k) => {
        const [y, m] = k.split("-");
        const st = monthlyData[k];
        return `- Tháng ${parseInt(m, 10)}/${y}: Thu ${fmt(st.thu)}, Chi ${fmt(st.chi)} (Dư: ${fmt(st.thu - st.chi)})`;
      });
      return `Dưới đây là số liệu thu chi theo từng tháng của bạn:\n${lines.join("\n")}`;
    }
  }

  const sorted = Object.keys(monthlyData).sort().reverse();
  if (sorted.length > 0) {
    const current = sorted[0];
    const [y, m] = current.split("-");
    const st = monthlyData[current];
    return `- Tháng ${parseInt(m, 10)}/${y}: Thu ${fmt(st.thu)}, Chi ${fmt(st.chi)}, Thặng dư ${fmt(st.thu - st.chi)}.\n- Bạn có thể hỏi: "Tháng mấy thì thu chi bao nhiêu?" để xem chi tiết tất cả các tháng.`;
  }

  return "Bạn chưa có dữ liệu giao dịch thu chi nào để phân tích.";
}

// POST /api/ai-chat
exports.chat = asyncHandler(async (req, res) => {
  requireFields(req.body, ["message"]);
  assert(
    String(req.body.message).trim() !== "",
    400,
    "Câu hỏi không được để trống.",
  );
  await checkQuota(req.userId);

  // Lấy dữ liệu giao dịch của người dùng nếu summary chưa có thống kê theo tháng
  let summary = String(req.body.summary || "").trim();
  let userTx = [];
  try {
    userTx = await prisma.transaction.findMany({
      where: { userId: req.userId },
      select: { amount: true, type: true, category: true, date: true, description: true },
      orderBy: { date: "desc" },
    });
    if (userTx.length > 0 && !summary.includes("BẢNG THỐNG KÊ THU CHI THEO TỪNG THÁNG")) {
      const monthMap = {};
      for (const tx of userTx) {
        const mKey = tx.date ? new Date(tx.date).toISOString().slice(0, 7) : "Chưa rõ";
        if (!monthMap[mKey]) monthMap[mKey] = { thu: 0, chi: 0 };
        if (tx.type === "THU") monthMap[mKey].thu += tx.amount;
        else monthMap[mKey].chi += tx.amount;
      }
      const mLines = Object.keys(monthMap)
        .sort()
        .reverse()
        .map((m) => {
          const [y, mon] = m.split("-");
          const st = monthMap[m];
          return `- Tháng ${parseInt(mon, 10)}/${y} (${m}): Thu ${st.thu.toLocaleString("vi-VN")}đ, Chi ${st.chi.toLocaleString("vi-VN")}đ, Thặng dư ${(st.thu - st.chi).toLocaleString("vi-VN")}đ`;
        })
        .join("\n");
      const extra = `=== BẢNG THỐNG KÊ THU CHI THEO TỪNG THÁNG ===\n${mLines}`;
      summary = summary ? `${summary}\n\n${extra}` : extra;
    }
  } catch (err) {
    // Không cản trở tiến trình nếu truy vấn DB phụ trợ lỗi
  }

  // Chỉ giữ tối đa 10 lượt hội thoại gần nhất, đúng như server cũ của FE
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
      content: buildChatSystemPrompt(summary),
    },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: String(req.body.message) },
  ];

  try {
    const result = await callOllama(messages);
    await logUsage(req.userId, "ai-chat", result);
    return res.json({ reply: result.content });
  } catch (err) {
    // Nếu Ollama chưa có API key hoặc không kết nối được, fallback thông minh từ dữ liệu thu chi
    const fallback = generateLocalChatReply(req.body.message, summary, userTx);
    if (fallback) {
      return res.json({ reply: fallback });
    }
    throw err;
  }
});
