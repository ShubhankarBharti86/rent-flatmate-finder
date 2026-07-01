require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('./client');

async function main() {
  const email = process.env.ADMIN_EMAIL || 'admin@rentfinder.test';
  const password = process.env.ADMIN_PASSWORD || 'Admin@123';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin already exists: ${email}`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: { name: 'Platform Admin', email, passwordHash, role: 'ADMIN' },
  });
  console.log(`Seeded admin user -> email: ${email}, password: ${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
