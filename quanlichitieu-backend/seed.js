const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  if (users.length === 0) {
    console.log("Không có user nào trong DB. Vui lòng tạo tài khoản trên web trước.");
    return;
  }

  for (const user of users) {
    const userId = user.id;
    console.log(`Đang tạo dữ liệu mẫu cho người dùng: ${user.email}`);

    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.budget.deleteMany({ where: { userId } });
    await prisma.savingsGoal.deleteMany({ where: { userId } });

    const categoriesChi = ['Ăn uống', 'Di chuyển', 'Mua sắm', 'Hóa đơn', 'Giải trí'];
    const categoriesThu = ['Lương', 'Thưởng', 'Đầu tư'];

    const transactions = [];
    for (let i = 0; i < 50; i++) {
      const isThu = Math.random() > 0.7;
      const amount = isThu
        ? Math.floor(Math.random() * 5000000) + 1000000
        : Math.floor(Math.random() * 500000) + 50000;

      const date = new Date();
      date.setDate(date.getDate() - Math.floor(Math.random() * 60));
      const category = isThu
        ? categoriesThu[Math.floor(Math.random() * categoriesThu.length)]
        : categoriesChi[Math.floor(Math.random() * categoriesChi.length)];

      transactions.push({
        userId,
        amount,
        type: isThu ? 'THU' : 'CHI',
        category,
        description: `Giao dịch ${category.toLowerCase()} #${i + 1}`,
        date: date
      });
    }

    transactions.push({
      userId,
      amount: 150000,
      type: 'CHI',
      category: 'Ăn uống',
      description: 'Ăn trưa hôm nay',
      date: new Date()
    });
    transactions.push({
      userId,
      amount: 80000,
      type: 'CHI',
      category: 'Di chuyển',
      description: 'Grab hôm nay',
      date: new Date()
    });

    await prisma.transaction.createMany({ data: transactions });
    console.log(`Đã tạo ${transactions.length} giao dịch.`);

    const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    await prisma.budget.createMany({
      data: [
        { userId, category: 'Ăn uống', limitAmount: 3000000, month: currentMonth },
        { userId, category: 'Mua sắm', limitAmount: 2000000, month: currentMonth },
        { userId, category: 'Di chuyển', limitAmount: 1000000, month: currentMonth }
      ]
    });
    console.log("Đã tạo ngân sách.");

    await prisma.savingsGoal.create({
      data: {
        userId,
        name: 'Mua máy tính xách tay',
        targetAmount: 30000000,
        currentAmount: 12000000,
        status: 'IN_PROGRESS'
      }
    });
    await prisma.savingsGoal.create({
      data: {
        userId,
        name: 'Du lịch Đà Lạt',
        targetAmount: 5000000,
        currentAmount: 5000000,
        status: 'COMPLETED'
      }
    });
    console.log("Đã tạo mục tiêu tiết kiệm.");
  }

  console.log("Tạo dữ liệu mẫu thành công!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
