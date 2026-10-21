const net = require('net');
const path = require('path');
const { spawn, execSync } = require('child_process');

function checkPort(port = 27017, host = '127.0.0.1', timeoutMs = 400) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

async function waitForPort(port = 27017, host = '127.0.0.1', maxRetries = 25) {
  for (let i = 0; i < maxRetries; i++) {
    const open = await checkPort(port, host, 400);
    if (open) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function ensureMongo() {
  const isOpen = await checkPort(27017, '127.0.0.1');
  if (isOpen) {
    return;
  }

  console.log('📦 MongoDB chưa chạy (không dùng Docker). Đang tự khởi động MongoDB local...');

  const mongoScript = path.join(__dirname, '..', '..', 'run-local-mongo.js');
  const child = spawn(process.execPath, [mongoScript], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  const ready = await waitForPort(27017, '127.0.0.1', 25);
  if (!ready) {
    console.error('❌ Không thể tự động khởi động MongoDB. Vui lòng chạy "node run-local-mongo.js" thủ công.');
    return;
  }

  console.log('✅ MongoDB local đã sẵn sàng trên cổng 27017!');

  try {
    const rootDir = path.join(__dirname, '..', '..');
    execSync('npx prisma db push --skip-generate', {
      cwd: rootDir,
      stdio: 'ignore',
    });

    const prisma = require('./db');
    await prisma.$connect();
    const count = await prisma.user.count().catch(() => 0);
    if (count === 0) {
      console.log('🌱 Phát hiện cơ sở dữ liệu mới, đang tự động nạp dữ liệu mẫu (seed)...');
      const { seedDatabase } = require('../../scripts/seed');
      if (typeof seedDatabase === 'function') {
        await seedDatabase();
      }
      console.log('✅ Đã nạp dữ liệu mẫu (admin@chilotus.com / intern@chilotus.com)!');
    }
  } catch (err) {
    // Không làm gián đoạn server nếu seed gặp cảnh báo
  }
}

module.exports = { ensureMongo };
