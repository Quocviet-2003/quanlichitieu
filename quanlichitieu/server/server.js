// server/server.js
// Server Node.js nhỏ gọn (không cần cài thư viện ngoài) làm 2 việc:
//   1) Phục vụ file tĩnh của app (HTML/CSS/JS/icon...) như 1 static server bình thường.
//   2) Làm "cầu nối" (proxy) gọi sang Ollama Cloud để phân tích chi tiêu bằng AI.
// Lý do cần proxy này: nếu gọi thẳng Ollama Cloud từ trình duyệt, API key sẽ bị lộ
// trong code JS phía client. Gọi qua server thì key chỉ nằm ở đây, trình duyệt
// không bao giờ nhìn thấy key thật.
//
// Chạy: node server/server.js   (mặc định cổng 3000, đổi bằng biến môi trường PORT)

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ROOT_DIR = path.join(__dirname, "..");

// Đọc cấu hình API key. Nếu chưa tạo server/config.js thì AI sẽ báo lỗi rõ ràng
// khi bấm nút phân tích, nhưng phần còn lại của app (xem trang, dữ liệu mẫu...)
// vẫn chạy bình thường.
let config = null;
try {
  config = require("./config.js");
} catch (err) {
  console.warn(
    '[AI] Chưa có server/config.js -> tính năng "Nhận xét từ AI" sẽ báo lỗi.',
  );
  console.warn(
    "[AI] Copy server/config.example.js thành server/config.js rồi điền API key Ollama Cloud để bật tính năng này.",
  );
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};

// Đọc toàn bộ nội dung request dạng JSON
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

// Gọi Ollama Cloud (API dạng /api/chat, giống Ollama chạy local).
// "messages" là mảng hội thoại đầy đủ (system + các lượt hỏi/đáp trước + câu mới nhất).
async function askOllama(messages) {
  const response = await fetch("https://ollama.com/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.OLLAMA_API_KEY}`,
    },
    body: JSON.stringify({
      model: config.OLLAMA_MODEL,
      messages,
      stream: false,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Ollama Cloud trả lỗi (mã ${response.status}): ${errText}`);
  }

  const data = await response.json();
  return data.message?.content || "AI không trả về nội dung nào.";
}

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

function buildSystemMessage(summary) {
  return {
    role: "system",
    content:
      "Bạn là chuyên gia tài chính cá nhân súc tích. Luôn trả lời siêu ngắn gọn bằng tiếng Việt.\n" +
      "Không chào hỏi, không mở bài hay kết bài xã giao, không dùng bảng biểu, không dùng ký tự |, không dùng **.\n" +
      "Trả lời trong đúng 3 gạch đầu dòng ngắn (-), mỗi gạch 1 câu.\n" +
      "Luôn viết số tiền rõ ràng đầy đủ (dạng 000.000đ), không dùng viết tắt k hay m.\n" +
      `Dữ liệu tài chính người dùng:\n${summary}`,
  };
}

async function handleAiInsights(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (!config || !config.OLLAMA_API_KEY) {
    res.writeHead(500);
    res.end(
      JSON.stringify({
        error:
          "Chưa cấu hình API key. Xem hướng dẫn trong server/config.example.js",
      }),
    );
    return;
  }

  try {
    const body = await readJsonBody(req);
    if (!body.summary) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "Thiếu dữ liệu chi tiêu để phân tích" }));
      return;
    }

    const messages = [
      buildSystemMessage(body.summary),
      {
        role: "user",
        content:
          "Nhận xét tài chính nhanh trong đúng 3 gạch đầu dòng ngắn (-), mỗi ý 1 câu: tổng quan thu chi & số dư, danh mục chi nhiều nhất, và 1 gợi ý tiết kiệm ngắn nhất.",
      },
    ];

    const insight = await askOllama(messages);
    res.writeHead(200);
    res.end(JSON.stringify({ insight: cleanAiResponse(insight) }));
  } catch (error) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: error.message }));
  }
}

function buildChatSystemMessage(summary) {
  return {
    role: "system",
    content:
      "Bạn là trợ lý tài chính cá nhân thông minh của ứng dụng ChiLotus, luôn trả lời ngắn gọn, rõ ràng, đi thẳng vào trọng tâm bằng tiếng Việt.\n" +
      "Quy tắc số tiền: Luôn viết đầy đủ các chữ số có dấu chấm phân cách hàng nghìn (ví dụ: 100.000đ, 1.500.000đ, 26.500.000đ), tuyệt đối không viết tắt bằng k hay m.\n" +
      "QUY TẮC TRẢ LỜI CÂU HỎI THU CHI:\n" +
      "- Khi người dùng hỏi về thu chi của một tháng cụ thể (ví dụ: 'tháng 8 thu chi bao nhiêu', 'tháng 9', 'tháng 10'): hãy tra cứu số liệu của tháng đó trong bảng dữ liệu bên dưới và trả lời chính xác: Tổng thu bao nhiêu, Tổng chi bao nhiêu, và Thặng dư/Số dư của tháng đó.\n" +
      "- Khi người dùng hỏi 'tháng mấy thì thu chi bao nhiêu' hoặc hỏi về các tháng: hãy liệt kê rõ ràng từng tháng có trong dữ liệu với số tiền thu và chi tương ứng.\n" +
      "- Dựa 100% vào số liệu thực tế được cung cấp bên dưới, tuyệt đối không bịa đặt số liệu.\n" +
      `Dưới đây là số liệu tài chính của người dùng:\n${summary || "(chưa có dữ liệu)"}`,
  };
}

function parseMonthlySummaryFallback(message, summary) {
  const msg = String(message || "").toLowerCase();
  const monthlyData = {};

  if (summary) {
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

async function handleAiChat(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  try {
    const body = await readJsonBody(req);
    if (!body.message) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "Thiếu câu hỏi" }));
      return;
    }

    if (!config || !config.OLLAMA_API_KEY) {
      const fallback = parseMonthlySummaryFallback(body.message, body.summary);
      res.writeHead(200);
      res.end(JSON.stringify({ reply: cleanAiResponse(fallback) }));
      return;
    }

    const history = Array.isArray(body.history) ? body.history.slice(-10) : [];

    const messages = [
      buildChatSystemMessage(body.summary || "(chưa có dữ liệu giao dịch)"),
      ...history,
      { role: "user", content: body.message },
    ];

    try {
      const reply = await askOllama(messages);
      res.writeHead(200);
      res.end(JSON.stringify({ reply: cleanAiResponse(reply) }));
    } catch (apiErr) {
      const fallback = parseMonthlySummaryFallback(body.message, body.summary);
      res.writeHead(200);
      res.end(JSON.stringify({ reply: cleanAiResponse(fallback) }));
    }
  } catch (error) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: error.message }));
  }
}

// Phục vụ file tĩnh (HTML/CSS/JS/icon...) trong thư mục gốc project
function serveStaticFile(req, res) {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const filePath = path.join(
    ROOT_DIR,
    urlPath === "/" ? "index.html" : urlPath,
  );

  // Chặn truy cập ra ngoài thư mục project (bảo mật cơ bản)
  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403);
    res.end("Truy cập không hợp lệ");
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Không tìm thấy file: " + urlPath);
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
    });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/ai-insights") {
    handleAiInsights(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/ai-chat") {
    handleAiChat(req, res);
    return;
  }
  serveStaticFile(req, res);
});

server.listen(PORT, () => {
  console.log(`MoneyTrack đang chạy tại http://localhost:${PORT}`);
});
