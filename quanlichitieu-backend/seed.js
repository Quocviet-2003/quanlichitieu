const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  if (users.length === 0) {
    console.log("Không có user nào trong DB. Vui lòng tạo tài khoản trên web trước.");
    return;
  }

  const userId = users[0].id;
  console.log(`Đang fake data cho user: ${users[0].email}`);

  // Xoá data cũ
  await prisma.transaction.deleteMany({ where: { userId } });
  await prisma.budget.deleteMany({ where: { userId } });
  await prisma.savingsGoal.deleteMany({ where: { userId } });

  // 1. Tạo giao dịch (Transactions) trong 6 tháng gần đây
  const categoriesChi = ['Ăn uống', 'Di chuyển', 'Mua sắm', 'Hóa đơn', 'Giải trí'];
  const categoriesThu = ['Lương', 'Thưởng', 'Đầu tư'];

  const transactions = [];
  for (let i = 0; i < 50; i++) {
    const isThu = Math.random() > 0.7; // 30% thu, 70% chi
    const amount = isThu 
      ? Math.floor(Math.random() * 5000000) + 1000000 
      : Math.floor(Math.random() * 500000) + 50000;
    
    // Ngày ngẫu nhiên trong 6 tháng qua
    const date = new Date();
    date.setDate(date.getDate() - Math.floor(Math.random() * 180));
    
    transactions.push({
      userId,
      amount,
      type: isThu ? 'THU' : 'CHI',
      category: isThu ? categoriesThu[Math.floor(Math.random() * categoriesThu.length)] : categoriesChi[Math.floor(Math.random() * categoriesChi.length)],
      description: `Fake data ${i}`,
      date: date
    });
  }
  await prisma.transaction.createMany({ data: transactions });
  console.log("Đã tạo 50 giao dịch.");

  // 2. Tạo ngân sách (Budgets) cho tháng hiện tại
  const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  await prisma.budget.createMany({
    data: [
      { userId, category: 'Ăn uống', limitAmount: 3000000, month: currentMonth },
      { userId, category: 'Mua sắm', limitAmount: 2000000, month: currentMonth },
      { userId, category: 'Di chuyển', limitAmount: 1000000, month: currentMonth }
    ]
  });
  console.log("Đã tạo ngân sách.");

  // 3. Tạo mục tiêu tiết kiệm (Savings Goals)
  await prisma.savingsGoal.create({
    data: {
      userId,
      name: 'Mua Macbook',
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

  console.log("Fake data thành công!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
